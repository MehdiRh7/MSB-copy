const { chromium } = require('playwright');
const BASE = 'http://localhost:4179';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

const readLS = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(`postbank-mosavabat-v1:${k}`) || 'null'), key);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
  page.on('dialog', async (d) => { await d.accept(); });
  // این Suite یک مرورگرِ از قبل Reset‌شده را شبیه‌سازی می‌کند: Marker پیش از
  // بارگذاری هر صفحه ثبت می‌شود تا Reset یک‌باره داده‌های Seed تست را پاک نکند.
  await page.addInitScript(() => {
    localStorage.setItem('postbank-mosavabat-v1:operationalResetVersion', '1');
  });


  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.evaluate(() => {
    const signed = {
      status: 'COMPLETED', currentStepIndex: 2,
      steps: [
        { id: 's1', signerUserId: 'user-17', signerName: 'مسئول دفتر', signerTitle: 'مسئول دفتر مدیرعامل', signerRole: 'OFFICE_MANAGER', order: 1, status: 'SIGNED' },
        { id: 's2', signerUserId: 'user-16', signerName: 'مدیرعامل', signerTitle: 'مدیرعامل', signerRole: 'CEO', order: 2, status: 'SIGNED' },
        { id: 's3', signerUserId: 'user-admin', signerName: 'مدیر سیستم', signerTitle: 'راهبر ارشد', signerRole: 'ADMIN', order: 3, status: 'SIGNED' },
      ],
    };
    const base = {
      meetingId: 'meet-1001', meetingTitle: 'هیئت مدیره - زیرساخت', meetingNumber: 'جلسه-۱۴۰۵-۱۴۲',
      proposerName: 'مهندس پوریا حسینی', proposerDepartment: 'اداره کل فناوری اطلاعات',
      requestDescription: 'شرح درخواست ابلاغیه', reviewResultNotes: 'توضیحات مصوبه برای گزارش ابلاغیه',
      approvalStatus: 'APPROVED', mainResponsibleUserId: 'user-9', mainResponsibleName: 'مهندس سارا نیک‌نام',
      responsibleDepartmentId: 'dept-1', responsibleDepartmentName: 'اداره کل فناوری اطلاعات',
      assignedDateJalali: '1405/06/22', deadlineJalali: '1405/07/22', priority: 'MEDIUM',
      referrals: [], verificationConfig: { requiresVerification: false, mode: 'SEQUENTIAL', currentStepIndex: 0, steps: [] },
      attachments: [], createdAt: new Date().toISOString(),
      signatureWorkflow: JSON.parse(JSON.stringify(signed)), executionStatus: 'WAITING_NOTIFICATION',
    };
    localStorage.setItem('postbank-mosavabat-v1:resolutions', JSON.stringify([
      { ...base, id: 'r-n1', resolutionNumber: 'مصوبه-QA-ابلاغ-الف', topicTitle: 'موضوع ابلاغیه اول' },
      { ...base, id: 'r-n2', resolutionNumber: 'مصوبه-QA-ابلاغ-ب', topicTitle: 'موضوع ابلاغیه دوم' },
      { ...base, id: 'r-n3', resolutionNumber: 'مصوبه-QA-ابلاغ-ج', topicTitle: 'موضوع ابلاغیه سوم' },
    ]));
  });

  // Login as the office manager (holder of NOTIFY_RESOLUTION).
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مسئول دفتر' }).first().click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const openInbox = async () => {
    await page.locator('aside button:has-text("کارتابل ابلاغ")').first().click();
    await page.waitForTimeout(900);
  };

  // ابلاغ دیگر تاریخ نمی‌گیرد: ردیف باز می‌شود و مستقیماً دکمه ابلاغ زده
  // می‌شود؛ تاریخ/ساعت/کاربر خودکار ثبت می‌شوند.
  const notify = async (topic) => {
    const row = page.locator('tbody tr').filter({ hasText: topic }).first();
    await row.locator('button:has-text("ابلاغ")').click();
    await page.waitForTimeout(500);
    const form = page.locator('tr').filter({ hasText: 'ثبت ابلاغ رسمی مصوبه' });
    await form.locator('button:has-text("ابلاغ مصوبه")').click();
    await page.waitForTimeout(1100);
  };

  await openInbox();

  // ===== Test 1 — first ابلاغ gets the first sequence value =====
  await notify('موضوع ابلاغیه اول');
  let notices = await readLS(page, 'resolutionNotices');
  const n1 = notices.find((n) => n.resolutionId === 'r-n1');
  check('CR-B Test1 شماره نامه ابلاغیه اولین ابلاغ = ۱', n1?.notificationLetterNumber === '1', String(n1?.notificationLetterNumber));

  // ===== Test 2 — second ابلاغ gets a different, unique number =====
  await notify('موضوع ابلاغیه دوم');
  notices = await readLS(page, 'resolutionNotices');
  const n2 = notices.find((n) => n.resolutionId === 'r-n2');
  check('CR-B Test2 شماره نامه ابلاغیه دوم = ۲', n2?.notificationLetterNumber === '2', String(n2?.notificationLetterNumber));
  const allNumbers = notices.map((n) => n.notificationLetterNumber).filter(Boolean);
  check('CR-B Test2 شماره‌ها یکتا هستند', new Set(allNumbers).size === allNumbers.length);

  const resolutions = await readLS(page, 'resolutions');
  check('CR-B بند۱۵ شماره مصوبه تغییر نکرد', resolutions.find((r) => r.id === 'r-n1').resolutionNumber === 'مصوبه-QA-ابلاغ-الف');
  check('CR-B بند۶ شماره نامه ابلاغیه روی مصوبه نیز ثبت شد', resolutions.find((r) => r.id === 'r-n2').notificationLetterNumber === '2');
  const logs = await readLS(page, 'activityLogs');
  check('CR-B بند۶ شماره نامه ابلاغیه در Timeline ثبت شد', logs.some((l) => l.targetId === 'r-n1' && l.action === 'مصوبه ابلاغ شد' && String(l.details).includes('شماره نامه ابلاغیه: 1')));

  // ===== Test 3 — opening then cancelling the third ابلاغ consumes nothing =====
  const sequenceBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:notificationLetterSequence')));
  const row3 = page.locator('tbody tr').filter({ hasText: 'موضوع ابلاغیه سوم' }).first();
  await row3.locator('button:has-text("ابلاغ")').click();
  await page.waitForTimeout(500);
  const form3 = page.locator('tr').filter({ hasText: 'ثبت ابلاغ رسمی مصوبه' });
  await form3.waitFor({ state: 'visible' });
  // Cancel by collapsing the row instead of submitting.
  await row3.locator('button:has-text("ابلاغ")').click();
  await page.waitForTimeout(600);

  const sequenceAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:notificationLetterSequence')));
  notices = await readLS(page, 'resolutionNotices');
  check('CR-B Test3 انصراف از ابلاغ، ابلاغیه‌ای ثبت نکرد', !notices.some((n) => n.resolutionId === 'r-n3'));
  check('CR-B Test3 انصراف از ابلاغ، شماره‌ای مصرف نکرد', sequenceBefore === sequenceAfter, `${sequenceBefore} -> ${sequenceAfter}`);

  // The third resolution must still be waiting, untouched.
  const r3 = (await readLS(page, 'resolutions')).find((r) => r.id === 'r-n3');
  check('CR-B Test3 مصوبه سوم همچنان در انتظار ابلاغ است', r3.executionStatus === 'WAITING_NOTIFICATION' && !r3.notificationLetterNumber);

  // ===== Test 4 — the report shows both issued letters =====
  await page.locator('aside button:has-text("گزارش عملکرد")').first().click();
  await page.waitForTimeout(1500);
  const reportText = await page.locator('body').innerText();
  check('CR-B Test4 گزارش ابلاغ مصوبات نمایش داده می‌شود', reportText.includes('گزارش ابلاغ مصوبات'));
  check('CR-B Test4 موضوع ابلاغیه اول در گزارش هست', reportText.includes('موضوع ابلاغیه اول'));
  check('CR-B Test4 موضوع ابلاغیه دوم در گزارش هست', reportText.includes('موضوع ابلاغیه دوم'));
  check('CR-B Test4 مصوبه ابلاغ‌نشده در گزارش نیست', !reportText.includes('موضوع ابلاغیه سوم'));
  check('CR-B Test4 واحد پیشنهاددهنده واقعی در گزارش هست', reportText.includes('اداره کل فناوری اطلاعات'));
  check('CR-B Test4 توضیحات مصوبه در گزارش هست', reportText.includes('توضیحات مصوبه برای گزارش ابلاغیه'));

  // Filtering by letter number narrows the table to that one row.
  await page.locator('input').nth(0).isVisible().catch(() => {});
  const letterFilter = page.locator('label:has-text("شماره نامه ابلاغیه") input').first();
  await letterFilter.fill('2');
  await page.locator('button:has-text("اعمال فیلتر")').first().click();
  await page.waitForTimeout(900);
  const filteredRows = await page.locator('table').filter({ hasText: 'شماره نامه ابلاغیه' }).locator('tbody tr').allInnerTexts();
  check('CR-B بند۱۴ فیلتر شماره نامه ابلاغیه کار می‌کند', filteredRows.length === 1 && filteredRows[0].includes('موضوع ابلاغیه دوم'), JSON.stringify(filteredRows));

  console.log(`\nLETTERS: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
