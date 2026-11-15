const { chromium } = require('playwright');
const BASE = 'http://localhost:4179';

const switchUser = async (page, name) => {
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: name }).first().click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};

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
    const base = {
      meetingId: 'meet-1001', meetingTitle: 'هیئت مدیره - بررسی زیرساخت ابری و امنیت داده', meetingNumber: 'جلسه-۱۴۰۵-۱۴۲',
      proposerName: 'مهندس پوریا حسینی', proposerDepartment: 'اداره کل فناوری اطلاعات',
      requestDescription: 'شرح تست ابلاغ مستقل', approvalStatus: 'APPROVED',
      mainResponsibleUserId: 'user-9', mainResponsibleName: 'مهندس سارا نیک‌نام',
      responsibleDepartmentId: 'dept-1', responsibleDepartmentName: 'اداره کل فناوری اطلاعات',
      assignedDateJalali: '1405/06/22', deadlineJalali: '1405/07/22', priority: 'MEDIUM',
      referrals: [], verificationConfig: { requiresVerification: false, mode: 'SEQUENTIAL', currentStepIndex: 0, steps: [] },
      attachments: [], createdAt: new Date().toISOString(),
      signatureWorkflow: {
        status: 'COMPLETED', currentStepIndex: 2,
        steps: [
          { id: 'sig-t-1', signerUserId: 'user-17', signerName: 'مسئول دفتر', signerTitle: 'مسئول دفتر مدیرعامل', signerRole: 'OFFICE_MANAGER', order: 1, status: 'SIGNED' },
          { id: 'sig-t-2', signerUserId: 'user-16', signerName: 'مدیرعامل', signerTitle: 'مدیرعامل', signerRole: 'CEO', order: 2, status: 'SIGNED' },
          { id: 'sig-t-3', signerUserId: 'user-admin', signerName: 'مدیر سیستم', signerTitle: 'راهبر ارشد سامانه مصوبات', signerRole: 'ADMIN', order: 3, status: 'SIGNED' },
        ],
      },
      executionStatus: 'WAITING_NOTIFICATION',
    };
    const resolutions = [
      { ...base, id: 'res-notify-test-1', resolutionNumber: 'مصوبه-QA-ابلاغ-۱', topicTitle: 'موضوع تست ابلاغ از کارتابل' },
      { ...base, id: 'res-notify-test-2', resolutionNumber: 'مصوبه-QA-ابلاغ-۲', topicTitle: 'موضوع تست ابلاغ از فرم مصوبه',
        signatureWorkflow: { status: 'COMPLETED', currentStepIndex: 2, steps: base.signatureWorkflow.steps.map(s => ({ ...s })) } },
    ];
    localStorage.setItem('postbank-mosavabat-v1:resolutions', JSON.stringify(resolutions));
  });

  await switchUser(page, 'مسئول دفتر');

  // Test 2
  const inboxTab = page.locator('button:has-text("کارتابل ابلاغ")').first();
  console.log(`[${await inboxTab.count() > 0 ? 'PASS' : 'FAIL'}] TEST2 office manager sees «کارتابل ابلاغ» in sidebar`);
  await inboxTab.click();
  await page.waitForTimeout(700);
  const inboxText = await page.locator('body').innerText();
  console.log(`[${inboxText.includes('موضوع تست ابلاغ از کارتابل') && inboxText.includes('موضوع تست ابلاغ از فرم مصوبه') ? 'PASS' : 'FAIL'}] TEST2 both items visible in inbox`);
  await page.screenshot({ path: '/tmp/notify_inbox.png', fullPage: true });

  // Test 3
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('button:has-text("کارتابل ابلاغ")').first().click();
  await page.waitForTimeout(700);
  const inboxText2 = await page.locator('body').innerText();
  console.log(`[${inboxText2.includes('موضوع تست ابلاغ از کارتابل') ? 'PASS' : 'FAIL'}] TEST3 item still waiting after reload (no auto-notify)`);

  // Test 4: notify item 1 from the inbox — target the first data row's own
  // action button directly by table structure (tbody > tr:nth-child(1))
  const firstRowActionBtn = page.locator('tbody tr').nth(0).locator('button');
  console.log('[INFO] first row action button text:', await firstRowActionBtn.innerText());
  await firstRowActionBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/notify_row_expanded.png', fullPage: true });

  // تاریخ ابلاغ دیگر از کاربر گرفته نمی‌شود: ردیف بازشده مستقیماً دکمه
  // «ابلاغ مصوبه» را دارد و تاریخ/ساعت/کاربر خودکار ثبت می‌شوند.
  const expandedRow = page.locator('tr').filter({ hasText: 'ثبت ابلاغ رسمی مصوبه' });
  console.log(`[${await expandedRow.count() > 0 ? 'PASS' : 'FAIL'}] TEST4 ردیف ابلاغ بدون فیلد تاریخ باز شد`);
  await expandedRow.locator('button:has-text("ابلاغ مصوبه")').click();
  await page.waitForTimeout(400);
  // confirm dialog
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/notify_after_confirm.png', fullPage: true });

  const bodyAfter = await page.locator('body').innerText();
  console.log(`[${!bodyAfter.includes('موضوع تست ابلاغ از کارتابل') ? 'PASS' : 'FAIL'}] TEST4 item left کارتابل ابلاغ after notifying`);
  console.log(`[${bodyAfter.includes('موضوع تست ابلاغ از فرم مصوبه') ? 'PASS' : 'FAIL'}] TEST4 other item unaffected, still in inbox`);

  // Verify persisted fields directly
  const resolutions = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]'));
  const r1 = resolutions.find((r) => r.id === 'res-notify-test-1');
  console.log('[INFO] r1 executionStatus:', r1?.executionStatus);
  console.log('[INFO] r1 notifiedDateJalali:', r1?.notifiedDateJalali);
  console.log('[INFO] r1 notifiedByName:', r1?.notifiedByName);
  console.log('[INFO] r1 notifiedAt set:', Boolean(r1?.notifiedAt));
  // ابلاغ دیگر مستقیماً اجرا را شروع نمی‌کند: مصوبه ابتدا در انتظار امضای
  // دبیر جلسه می‌ماند و تنها پس از امضای واقعی وارد فاز اجرا می‌شود.
  console.log(`[${r1?.executionStatus === 'PENDING_SECRETARY_NOTICE_SIGNATURE' ? 'PASS' : 'FAIL'}] TEST4 ابلاغ وضعیت را از WAITING_NOTIFICATION به «در انتظار امضای دبیر جلسه» برد (${r1?.executionStatus})`);
  console.log(`[${Boolean(r1?.notifiedTimeString) ? 'PASS' : 'FAIL'}] TEST4 ساعت ابلاغ خودکار ثبت شد (${r1?.notifiedTimeString})`);
  console.log(`[${Boolean(r1?.notifiedDateJalali) ? 'PASS' : 'FAIL'}] TEST4 notifiedDateJalali saved`);
  console.log(`[${r1?.notifiedByName === 'مسئول دفتر' ? 'PASS' : 'FAIL'}] TEST4 notifiedByName saved`);

  const notices = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]'));
  const notice1 = notices.find((n) => n.resolutionId === 'res-notify-test-1');
  console.log(`[${Boolean(notice1) ? 'PASS' : 'FAIL'}] TEST4 ResolutionNotice created`);
  console.log('[INFO] notice1 secretaryName:', notice1?.secretaryName);

  const activityLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:activityLogs') || '[]'));
  const timelineEntry = activityLogs.find((l) => l.targetId === 'res-notify-test-1' && l.action === 'مصوبه ابلاغ شد');
  console.log(`[${Boolean(timelineEntry) ? 'PASS' : 'FAIL'}] TEST9 Timeline event "مصوبه ابلاغ شد" recorded`);

  const tasksBeforeSignature = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:tasks') || '[]'));
  console.log(`[${!tasksBeforeSignature.some((t) => t.resolutionId === 'res-notify-test-1') ? 'PASS' : 'FAIL'}] TEST15 پیش از امضای دبیر جلسه هیچ Task اجرایی ساخته نشد`);

  // امضای دبیر جلسه؛ تنها پس از آن اجرا شروع می‌شود.
  await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || 'null')
      || (await import('/src/mock/data.ts')).mockUsers;
    const notices = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]');
    const notice = notices.find((n) => n.resolutionId === 'res-notify-test-1');
    // جلسه این داده تست در مجموعه جلسات وجود ندارد، پس دبیر جلسه‌ای تعیین
    // نشده؛ مدیر سیستم امضا می‌کند (همان مسیر باز کردن بن‌بست در Service).
    const signer = users.find((u) => u.id === notice?.secretaryUserId) || users.find((u) => u.role === 'ADMIN');
    await mod.resolutionService.signNotificationLetter('res-notify-test-1', signer);
  });
  await page.waitForTimeout(700);

  const tasks = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:tasks') || '[]'));
  console.log(`[${tasks.some((t) => t.resolutionId === 'res-notify-test-1') ? 'PASS' : 'FAIL'}] TEST15 execution (task) started only after امضای دبیر جلسه`);
  const signedNotices = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]'));
  const signedNotice = signedNotices.find((n) => n.resolutionId === 'res-notify-test-1');
  console.log(`[${Boolean(signedNotice?.secretarySignature?.signedAt) ? 'PASS' : 'FAIL'}] TEST15 امضای واقعی دبیر جلسه روی ابلاغیه ثبت شد`);

  // Signature chain integrity (Test 6)
  console.log(`[${r1?.signatureWorkflow?.steps?.length === 3 ? 'PASS' : 'FAIL'}] TEST6 exactly 3 main signature steps (found ${r1?.signatureWorkflow?.steps?.length})`);
  const hasSecretaryAsSigner = r1?.signatureWorkflow?.steps?.some((s) => s.signerRole === 'SECRETARY');
  console.log(`[${!hasSecretaryAsSigner ? 'PASS' : 'FAIL'}] TEST6 دبیر جلسه is not one of the 3 main signers`);

  await browser.close();
})();
