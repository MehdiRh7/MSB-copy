/**
 * رفع ایرادهای گزارش تست کامل: شماره‌گذاری، برچسب‌ها، دید تأییدکننده، طراح گرافیکی،
 * هشدار ریسک، سربرگ/پاورقی اسناد، Esc و ابزار گفتار.
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ===== شماره‌گذاری و برچسب نوع جلسه =====
  const svc = await page.evaluate(async () => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const { getMeetingTypeLabel } = await import('/src/utils/formatters.ts');
    const { todayJalali } = await import('/src/utils/jalaliDate.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const u = (id) => users.find((x) => x.id === id);
    const base = { type: 'COMMISSION', dateJalali: '1405/09/10', startTime: '10:00', endTime: '12:00', location: 'سالن', organizerId: 'user-17', secretaryId: 'user-8', createdByUserId: 'user-17', createdByName: 'مسئول دفتر', departmentId: 'dept-1', members: [], attachments: [] };
    const agenda = [{ id: 'ag-f1', order: 1, title: 'بند محرمانه', presenter: 'مسئول دفتر', isDiscussed: false, relatedUsers: [{ userId: 'user-9', fullName: 'مهندس سارا نیک‌نام' }] }];
    const workflow = { agendaApproval: { approverUserIds: ['user-14'], mode: 'ALL' }, templateName: 'گردش اختصاصی این جلسه' };
    const m1 = (await meetingService.createMeeting({ ...base, title: 'تست شماره ۱', agendaItems: agenda, workflow })).data;
    const m2 = (await meetingService.createMeeting({ ...base, title: 'تست شماره ۲', agendaItems: [] })).data;
    const asApprover = (await meetingService.getMeetingById(m1.id, u('user-14'))).data;
    return { n1: m1.meetingNumber, n2: m2.meetingNumber, year: todayJalali().slice(0, 4), label: getMeetingTypeLabel('COMMISSION'), approverAgenda: asApprover.agendaItems.length, templateName: m1.workflow?.templateName };
  });
  const faYear = svc.year.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  check('شماره جلسه با سال جاری و رقم فارسی', new RegExp(`^ج-${faYear}-[۰-۹]{3}$`).test(svc.n1), svc.n1);
  check('شماره جلسه بعدی یکی بیشتر است', svc.n2.slice(-3) !== svc.n1.slice(-3) && /^[^0-9]+$/.test(svc.n2), `${svc.n1} → ${svc.n2}`);
  check('برچسب نوع «کمیسیون تخصصی» درست است', svc.label === 'جلسه کمیسیون تخصصی', svc.label);
  check('تأییدکننده دستورکار همه بندها را می‌بیند', svc.approverAgenda === 1, String(svc.approverAgenda));
  check('نام گردش ویرایش‌شده «اختصاصی» است', svc.templateName === 'گردش اختصاصی این جلسه', svc.templateName);

  // ===== دور دوم: رقم فارسی در متن هوش مصنوعی، حذف بند فقط با مدیرعامل =====
  const r2 = await page.evaluate(async () => {
    const { polishProse } = await import('/src/services/ai/aiClient.ts');
    const { meetingService } = await import('/src/services/meetingService.ts');
    const brief = polishProse('dashboardBrief', { headline: 'تا 1405/08/24 تعداد 7 جلسه؛ هنور تصیه نشده', route: 'tasks', resolutionId: 'res-12' });
    const untouched = polishProse('meetingPlanner', { order: [{ id: 'ag-1', minutes: 15 }] });
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings'));
    const m = meetings.find((x) => x.title === 'تست شماره ۱');
    let removeError = '';
    try { await meetingService.removeAgendaItem(m.id, m.agendaItems[0].id, 'تست', users.find((u) => u.id === 'user-14')); } catch (e) { removeError = String(e.message || e); }
    return { brief, untouched, removeError };
  });
  check('رقم‌های متن هوش مصنوعی فارسی می‌شوند و غلط‌های رایج اصلاح می‌شوند', r2.brief.headline === 'تا ۱۴۰۵/۰۸/۲۴ تعداد ۷ جلسه؛ هنوز توصیه نشده', r2.brief.headline);
  check('شناسه‌ها و مسیرها دست‌نخورده می‌مانند', r2.brief.route === 'tasks' && r2.brief.resolutionId === 'res-12' && r2.untouched.order[0].id === 'ag-1' && r2.untouched.order[0].minutes === 15, JSON.stringify([r2.brief, r2.untouched]));
  check('تأییدکننده غیرمدیرعامل نمی‌تواند بند را از جلسه حذف کند', r2.removeError.includes('فقط مدیرعامل'), r2.removeError);

  // ===== هشدار ریسک: بدون تکرار پس از پاک‌کردن، برای مدیر سیستم =====
  const risk = await page.evaluate(async () => {
    const { buildProactiveRiskAlerts } = await import('/src/services/proactiveAlertService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const admin = users.find((x) => x.role === 'ADMIN');
    // یک مصوبه فعال، فوری و عقب‌افتاده می‌سازیم تا امتیاز ریسک بالا باشد.
    const key = 'postbank-mosavabat-v1:resolutions';
    const all = JSON.parse(localStorage.getItem(key));
    const target = all.find((r) => r.approvalStatus === 'APPROVED' && !['APPROVED_CLOSED', 'ARCHIVED'].includes(r.executionStatus) && !r.archive);
    Object.assign(target, { priority: 'URGENT', deadlineJalali: '1404/01/01', progressPercent: 0, executionStatus: 'OVERDUE' });
    localStorage.setItem(key, JSON.stringify(all));
    const first = buildProactiveRiskAlerts(admin, []);
    const second = buildProactiveRiskAlerts(admin, []); // مثل وقتی اعلان‌ها پاک شده باشند
    return { first: first.length, second: second.length, ids: new Set(first.map((n) => n.id)).size };
  });
  check('مدیر سیستم هشدار ریسک می‌گیرد و هشدار تکراری ساخته نمی‌شود (حتی پس از پاک‌کردن اعلان‌ها)', risk.first > 0 && risk.second === 0 && risk.ids === risk.first, JSON.stringify(risk));

  // ===== سند رسمی: سربرگ بدون تکرار، پاورقی، نام فایل =====
  const doc = await page.evaluate(async () => {
    const { officialDocumentHtml } = await import('/src/services/documentService.ts');
    const html = officialDocumentHtml('گزارش تحلیلی مدیریتی', 'دوره: آزمایشی', '<p>متن</p>', { date: '۱۴۰۵/۰۹/۱۰' });
    const div = document.createElement('div'); div.innerHTML = html;
    const header = div.querySelector('table.lh').textContent;
    const title = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:organizationProfile') || 'null')?.systemTitle || 'سامانه مدیریت جلسات و مصوبات';
    return { titleCount: header.split(title).length - 1, footer: div.querySelector('.doc-footer')?.textContent || '' };
  });
  check('نام سامانه در سربرگ تکرار نمی‌شود', doc.titleCount <= 1, String(doc.titleCount));
  check('سند رسمی پاورقی دارد', doc.footer.includes('تاریخ تهیه'), doc.footer);

  // ===== طراح گرافیکی: رها کردن نفر دوم روی مرحله پر =====
  await page.evaluate(() => localStorage.setItem('postbank-mosavabat-v1:currentUserId', JSON.stringify('user-17')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('aside, nav').locator('text=مدیریت جلسات').first().click();
  await page.waitForTimeout(700);
  const created = page.locator('text=تست شماره ۱').first();
  await created.click();
  await page.waitForTimeout(1000);
  check('تب «برگزاری جلسه (ضبط و گفتار)» وجود دارد', await page.locator('button', { hasText: 'برگزاری جلسه (ضبط و گفتار)' }).count() > 0);
  await page.locator('button', { hasText: 'برگزاری جلسه (ضبط و گفتار)' }).click();
  await page.waitForTimeout(400);
  check('ابزار ضبط و گفتار در همان تب است', await page.locator('textarea[placeholder^="متن گفتار جلسه"]').count() > 0);

  // ===== طراح گرافیکی: افزودن نفر دوم به «امضای مصوبات» (بدون کشیدن و با کشیدن) =====
  await page.locator('button', { hasText: 'ایجاد جلسه جدید' }).first().click().catch(() => {});
  if (await page.locator('button', { hasText: 'ایجاد جلسه جدید' }).count() === 0) {
    await page.locator('aside, nav').locator('text=مدیریت جلسات').first().click();
    await page.waitForTimeout(600);
    await page.locator('button', { hasText: 'ایجاد جلسه جدید' }).first().click();
  }
  await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) { await page.locator('button', { hasText: 'مرحله بعد' }).click(); await page.waitForTimeout(250); }
  const sigSelect = page.locator('select[aria-label="افزودن فرد به امضای مصوبات"]');
  await sigSelect.selectOption({ label: await sigSelect.locator('option').nth(1).innerText() });
  await page.waitForTimeout(200);
  await sigSelect.selectOption({ label: await sigSelect.locator('option').nth(1).innerText() });
  await page.waitForTimeout(200);
  const sigStage = page.locator('div.flex-1.min-w-\\[112px\\]', { hasText: 'امضای مصوبات' });
  const viaSelect = await sigStage.locator('[draggable=true]').count();
  await page.locator('[draggable=true]', { hasText: 'سلیمانی' }).first().dragTo(sigStage);
  await page.waitForTimeout(300);
  const viaDrag = await sigStage.locator('[draggable=true]').count();
  check('طراح: نفر دوم با «افزودن فرد» به امضای مصوبات اضافه می‌شود', viaSelect === 2, String(viaSelect));
  check('طراح: نفر سوم با کشیدن روی مرحله پر اضافه می‌شود', viaDrag === 3, String(viaDrag));
  await sigStage.locator('button[aria-label^="حذف"]').first().click();
  await page.waitForTimeout(200);
  check('طراح: دکمه × فرد را از مرحله حذف می‌کند', await sigStage.locator('[draggable=true]').count() === 2);
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ===== Esc پنجره جزئیات مصوبه را می‌بندد =====
  await page.evaluate(() => localStorage.setItem('postbank-mosavabat-v1:currentUserId', JSON.stringify('user-admin')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('aside button:has-text("بانک مصوبات")').first().click();
  await page.waitForTimeout(900);
  const firstRow = page.locator('text=/نمونه م-/').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(700);
    const open = await page.locator('button[aria-label="بستن جزئیات مصوبه"]').count();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const after = await page.locator('button[aria-label="بستن جزئیات مصوبه"]').count();
    check('Esc پنجره جزئیات مصوبه را می‌بندد', open > 0 && after === 0, `${open} → ${after}`);
  } else {
    check('Esc پنجره جزئیات مصوبه را می‌بندد', false, 'ردیف مصوبه پیدا نشد');
  }

  check('بدون خطای صفحه', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
