/**
 * «گزارش‌ساز با درخواست متنی»: فهم درخواست، ساخت جدول و نمودار با داده واقعی و در محدوده دسترسی.
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ===== فهم درخواست (تحلیلگر محلی) =====
  const parsed = await page.evaluate(async () => {
    const rb = await import('/src/services/ai/reportBuilder.ts');
    const brief = (s) => s.blocks.map((b) => [b.type, b.entity, b.groupBy || '-', b.filter?.state || '-', b.filter?.department || '-'].join('/'));
    return {
      a: brief(rb.parseReportRequestLocally('یک لیست از همه مصوبات معوق، یک نمودار دایره‌ای از وضعیت مصوبات و یک نمودار میله‌ای از تعداد مصوبات هر واحد')),
      b: brief(rb.parseReportRequestLocally('روند ماهانه جلسات و نمودار دایره‌ای انواع جلسه')),
      c: brief(rb.parseReportRequestLocally('تعداد کل وظایف، نمودار میله‌ای وظایف به تفکیک مسئول')),
      d: brief(rb.parseReportRequestLocally('جدول مصوبات اداره کل امور مالی')),
      bad: rb.sanitizeSpec({ title: 'x', blocks: [{ type: 'pie', entity: 'meetings', groupBy: 'person' }, { type: 'hack', entity: 'users' }, { type: 'line', entity: 'tasks', groupBy: 'status' }] }),
    };
  });
  check('«لیست مصوبات معوق» ← جدول مصوبات با فیلتر معوق', parsed.a[0] === 'table/resolutions/-/overdue/-', parsed.a[0]);
  check('«نمودار دایره‌ای از وضعیت مصوبات» ← دایره‌ای به تفکیک وضعیت', parsed.a[1].startsWith('pie/resolutions/status'), parsed.a[1]);
  check('«نمودار میله‌ای مصوبات هر واحد» ← میله‌ای به تفکیک واحد', parsed.a[2].startsWith('bar/resolutions/department'), parsed.a[2]);
  check('«روند ماهانه جلسات» ← نمودار روند ماهانه جلسات', parsed.b[0].startsWith('line/meetings/month'), parsed.b[0]);
  check('«دایره‌ای انواع جلسه» ← به تفکیک نوع جلسه', parsed.b[1].startsWith('pie/meetings/meetingType'), parsed.b[1]);
  check('«تعداد کل وظایف» ← شمارنده و «به تفکیک مسئول» ← میله‌ای مسئول', parsed.c[0].startsWith('kpi/tasks') && parsed.c[1].startsWith('bar/tasks/person'), parsed.c.join(' | '));
  check('نام واحد در درخواست به فیلتر واحد تبدیل شد', parsed.d[0].includes('مالی'), parsed.d[0]);
  check('طرح نامعتبر پاک‌سازی شد (بعد نامجاز اصلاح، نوع ناشناخته حذف، روند همیشه ماهانه)', parsed.bad.blocks.length === 2 && parsed.bad.blocks[0].groupBy === 'status' && parsed.bad.blocks[1].groupBy === 'month', JSON.stringify(parsed.bad.blocks));

  // ===== صفحه گزارش‌ها: ساخت و نمایش =====
  await page.locator('aside, nav').locator('text=گزارش عملکرد').first().click();
  await page.waitForTimeout(900);
  await page.locator('[role="tab"]', { hasText: 'گزارش‌ساز' }).click();
  await page.waitForTimeout(400);
  check('بخش «گزارش‌ساز» در صفحه گزارش‌ها هست', await page.locator('text=گزارش‌ساز').count() > 0);
  await page.fill('textarea[aria-label="درخواست گزارش"]', 'یک لیست از همه مصوبات، یک نمودار دایره‌ای از وضعیت مصوبات و یک نمودار میله‌ای از تعداد مصوبات هر واحد');
  await page.locator('button', { hasText: 'ساخت گزارش' }).click();
  await page.waitForTimeout(1500);
  const blocks = await page.locator('.report-block').count();
  check('سه بخش گزارش ساخته شد', blocks === 3, String(blocks));
  check('نمودار دایره‌ای و میله‌ای رسم شدند', await page.locator('.report-block .recharts-pie').count() === 1 && await page.locator('.report-block .recharts-bar').count() === 1);
  const counts = await page.evaluate(async () => {
    const rb = await import('/src/services/ai/reportBuilder.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const id = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:currentUserId'));
    const ds = rb.loadReportDataset(users.find((u) => u.id === id));
    return { expected: ds.resolutions.length, rows: document.querySelectorAll('.report-block table tbody tr').length };
  });
  check('ردیف‌های جدول دقیقاً برابر مصوبات قابل مشاهده کاربر است', counts.rows === counts.expected && counts.expected > 0, JSON.stringify(counts));
  check('برداشت سامانه از درخواست نمایش داده شد', await page.locator('text=برداشت سامانه از درخواست شما:').count() > 0);
  await page.locator('.report-block button[aria-label="حذف این بخش از گزارش"]').first().click();
  await page.waitForTimeout(300);
  check('هر بخش را می‌توان از گزارش حذف کرد', await page.locator('.report-block').count() === 2);
  const popupPromise = context.waitForEvent('page');
  await page.locator('button', { hasText: 'خروجی PDF / Word' }).first().click();
  const doc = await popupPromise;
  await doc.waitForLoadState('domcontentloaded');
  const docText = await doc.locator('body').innerText();
  check('خروجی رسمی با سربرگ و نمودار ساخته شد', docText.includes('گزارش') && (await doc.locator('svg').count()) > 0 && (await doc.locator('.doc-footer').count()) === 1);
  await doc.close();

  // ===== محدوده دسترسی: کارشناس فقط مصوبات مرتبط با خودش =====
  const scope = await page.evaluate(async () => {
    const rb = await import('/src/services/ai/reportBuilder.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    return { admin: rb.loadReportDataset(users.find((u) => u.role === 'ADMIN')).resolutions.length, expert: rb.loadReportDataset(users.find((u) => u.id === 'user-9')).resolutions.length };
  });
  check('گزارش هر کاربر فقط داده‌های در دسترس خودش را دارد', scope.expert <= scope.admin, JSON.stringify(scope));

  check('بدون خطای صفحه', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
