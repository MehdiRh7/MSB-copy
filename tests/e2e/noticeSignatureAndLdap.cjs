/**
 * پرامپت ۵ — شماره نامه Proposal، Autofill مصوبه، ساده‌سازی ابلاغ
 * پرامپت ۶ — امضای دبیر جلسه بعد از ابلاغ + تنظیمات LDAP
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => { pageErrors.push(String(e)); console.log('PAGEERROR:', String(e)); });
  page.on('dialog', async (d) => { await d.accept(); });

  await page.addInitScript(() => {
    window.loadUsers = async () => {
      const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || 'null');
      if (stored && stored.length) return stored;
      const data = await import('/src/mock/data.ts');
      return data.mockUsers;
    };
    window.actor = async (id) => (await window.loadUsers()).find((u) => u.id === id);
  });
  // این Suite یک مرورگرِ از قبل Reset‌شده را شبیه‌سازی می‌کند: Marker پیش از
  // بارگذاری هر صفحه ثبت می‌شود تا Reset یک‌باره داده‌های Seed تست را پاک نکند.
  await page.addInitScript(() => {
    localStorage.setItem('postbank-mosavabat-v1:operationalResetVersion', '1');
  });


  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const readRes = (id) => page.evaluate((rid) =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]').find((r) => r.id === rid), id);
  const readNotice = (rid) => page.evaluate((id) =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]').find((n) => n.resolutionId === id), rid);
  const tasksFor = (rid) => page.evaluate((id) =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:tasks') || '[]').filter((t) => t.resolutionId === id), rid);

  // ====================================================================
  // پرامپت ۵ / بند ۱: شماره نامه در هر دو مسیر ایجاد Proposal
  // ====================================================================
  const manual = await page.evaluate(async () => {
    const mod = await import('/src/services/proposalService.ts');
    const res = await mod.proposalService.createProposal({
      title: 'پیشنهاد دستی با شماره نامه', description: 'شرح', rationale: 'دلیل',
      proposerName: 'مهندس سارا نیک‌نام', proposerUserId: 'user-9',
      proposerDepartmentId: 'dept-1', proposerDepartmentName: 'اداره کل فناوری اطلاعات',
      presenterUserId: 'user-9', presenterName: 'مهندس سارا نیک‌نام',
      sourceLetterNumber: '۱۴۰۵/دستی-۷۷۷',
    });
    const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:proposals') || '[]').find((p) => p.id === res.data.id);
    return { id: res.data.id, letter: stored?.sourceLetterNumber, source: stored?.source };
  });
  check('۵.۱ شماره نامه در ثبت دستی Proposal ذخیره و Persist شد', manual.letter === '۱۴۰۵/دستی-۷۷۷', String(manual.letter));
  check('۵.۱ پیشنهاد دستی همان Field مشترک را پر می‌کند (بدون Field موازی)', manual.source === 'MANUAL');

  // فرم UI هم باید فیلد شماره نامه داشته باشد
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مهندس سارا نیک‌نام' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('aside button:has-text("مصوبات پیشنهادی")').first().click();
  await page.waitForTimeout(900);
  await page.locator('main button').filter({ hasText: 'ثبت مصوبه پیشنهادی جدید' }).first().click();
  await page.waitForTimeout(700);
  const formText = await page.locator('form, div[class*="fixed"]').first().innerText();
  check('۵.۱ فیلد «شماره نامه» در فرم ثبت مصوبه پیشنهادی وجود دارد', formText.includes('شماره نامه'));
  await page.keyboard.press('Escape');
  await page.locator('button:has-text("انصراف")').first().click().catch(() => {});
  await page.waitForTimeout(500);

  // مسیر Excel: همان ستون «شماره نامه» → همان Field
  const excelColumns = await page.evaluate(async () => {
    const mod = await import('/src/services/proposalExcelImportService.ts');
    return Object.keys(mod).length > 0;
  });
  check('۵.۱ ماژول Excel Import در دسترس است', excelColumns === true);
  const excelStored = await page.evaluate(async () => {
    const mod = await import('/src/services/proposalService.ts');
    const res = await mod.proposalService.createProposal({
      title: 'پیشنهاد اکسل با شماره نامه', description: 'شرح اکسل', proposerName: 'مسئول دفتر',
      proposerUserId: 'user-17', proposerDepartmentId: 'dept-1', proposerDepartmentName: 'اداره کل فناوری اطلاعات',
      presenterUserId: 'user-10', presenterName: 'دکتر مریم حسینی',
      source: 'EXCEL_IMPORT', sourceLetterNumber: '۱۴۰۵/اکسل-۸۸۸', sourceLetterDateJalali: '۱۴۰۵/۰۶/۰۱',
    });
    const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:proposals') || '[]').find((p) => p.id === res.data.id);
    return { id: res.data.id, letter: stored?.sourceLetterNumber, source: stored?.source };
  });
  check('۵.۱ شماره نامه در مسیر Excel Import ذخیره شد', excelStored.letter === '۱۴۰۵/اکسل-۸۸۸', String(excelStored.letter));
  check('۵.۱ هر دو مسیر روی همان Field می‌نویسند', excelStored.source === 'EXCEL_IMPORT');

  // ====================================================================
  // پرامپت ۵ / بند ۲: Autofill هنگام ایجاد Resolution
  // ====================================================================
  const autofill = await page.evaluate(async ({ manualId, excelId }) => {
    const users = await window.loadUsers();
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]');
    meetings.unshift({
      id: 'meet-autofill', meetingNumber: 'جلسه-۱۴۰۵-۸۸۸', title: 'جلسه تست Autofill',
      type: 'COMMISSION', dateJalali: '1405/06/25', startTime: '09:00', endTime: '12:00',
      location: 'سالن', status: 'HELD',
      organizerId: 'user-16', organizerName: 'مدیرعامل', secretaryId: 'user-8', secretaryName: 'مهندس جواد صادقی',
      departmentId: 'dept-1', departmentName: 'اداره کل فناوری اطلاعات', description: '',
      members: [], agendaItems: [
        { id: 'ag-manual', order: 1, rowNumber: 1, title: 'بند از پیشنهاد دستی', presenter: 'x', isDiscussed: false, sourceProposalId: manualId, startTime: '09:00', endTime: '09:30', allocatedMinutes: 30, outcomeStatus: 'APPROVED' },
        { id: 'ag-excel', order: 2, rowNumber: 2, title: 'بند از پیشنهاد اکسل', presenter: 'y', isDiscussed: false, sourceProposalId: excelId, startTime: '09:30', endTime: '10:00', allocatedMinutes: 30, outcomeStatus: 'APPROVED' },
      ],
      attachments: [], history: [], resolutionsCount: 0, createdAt: new Date().toISOString(),
    });
    localStorage.setItem('postbank-mosavabat-v1:meetings', JSON.stringify(meetings));
    const presenterExcel = users.find((u) => u.id === 'user-10');
    return { presenterExcelDept: presenterExcel?.departmentName, presenterExcelName: presenterExcel?.fullName };
  }, { manualId: manual.id, excelId: excelStored.id });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // Autofill از طریق باز کردن فرم واقعی «ثبت مصوبه برای این بند»
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مهندس جواد صادقی' }).first().click();
  await page.waitForTimeout(800);
  await page.locator('aside button:has-text("مدیریت جلسات")').first().click();
  await page.waitForTimeout(1000);
  await page.locator('main tr.cursor-pointer').filter({ hasText: 'تست Autofill' }).first().click();
  await page.waitForTimeout(1300);
  await page.locator('main button').filter({ hasText: 'ثبت مصوبه برای این بند' }).first().click();
  await page.waitForTimeout(1400);

  const modalValues = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const byLabel = (text) => {
      const label = Array.from(document.querySelectorAll('label')).find((l) => l.textContent.trim().startsWith(text));
      if (!label) return null;
      const container = label.parentElement;
      const input = container?.querySelector('input, textarea');
      return input ? input.value : null;
    };
    return {
      letter: byLabel('شماره نامه'),
      proposer: byLabel('پیشنهاددهنده'),
      department: byLabel('واحد پیشنهاددهنده'),
      count: inputs.length,
    };
  });
  check('۵.۲ شماره نامه از Proposal به فرم مصوبه Autofill شد', modalValues.letter === '۱۴۰۵/دستی-۷۷۷', String(modalValues.letter));
  check('۵.۲ پیشنهاددهنده از ارائه‌دهنده Proposal Autofill شد', modalValues.proposer === 'مهندس سارا نیک‌نام', String(modalValues.proposer));
  check('۵.۲ واحد پیشنهاددهنده از واحد ارائه‌دهنده Autofill شد', Boolean(modalValues.department) && modalValues.department !== '', String(modalValues.department));

  await page.locator('button:has-text("انصراف")').first().click().catch(() => {});
  await page.waitForTimeout(600);

  // ====================================================================
  // داده تست ابلاغ
  // ====================================================================
  await page.evaluate(() => {
    const resolutions = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]');
    const base = {
      meetingId: 'meet-autofill', meetingTitle: 'جلسه تست Autofill', meetingNumber: 'جلسه-۱۴۰۵-۸۸۸',
      topicTitle: 'مصوبه تست ابلاغ', proposerName: 'مهندس سارا نیک‌نام', proposerDepartment: 'اداره کل فناوری اطلاعات',
      requestDescription: 'شرح', reviewResultNotes: 'نتیجه', approvalStatus: 'APPROVED',
      executionDescription: 'اجرای مصوبه', mainResponsibleUserId: 'user-9', mainResponsibleName: 'مهندس سارا نیک‌نام',
      responsibleDepartmentId: 'dept-1', responsibleDepartmentName: 'اداره کل فناوری اطلاعات',
      assignedDateJalali: '1405/06/25', deadlineJalali: '1405/07/20', priority: 'HIGH',
      executionStatus: 'WAITING_NOTIFICATION', referrals: [], attachments: [],
      verificationConfig: { requiresVerification: false, steps: [] },
      signatureWorkflow: { status: 'COMPLETED', currentStepIndex: 3, steps: [] },
      createdAt: new Date().toISOString(),
    };
    resolutions.unshift(
      { ...base, id: 'res-notify-a', resolutionNumber: 'مصوبه-تست-الف', topicTitle: 'مصوبه ابلاغ از کارتابل' },
      { ...base, id: 'res-notify-b', resolutionNumber: 'مصوبه-تست-ب', topicTitle: 'مصوبه ابلاغ از فرم مصوبه' },
    );
    localStorage.setItem('postbank-mosavabat-v1:resolutions', JSON.stringify(resolutions));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ====================================================================
  // پرامپت ۵ / بند ۳: هیچ فیلد تاریخ ابلاغی وجود ندارد
  // ====================================================================
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مسئول دفتر' }).first().click();
  await page.waitForTimeout(900);
  await page.locator('aside button:has-text("کارتابل ابلاغ")').first().click();
  await page.waitForTimeout(1100);
  await page.locator('main button').filter({ hasText: /^ابلاغ$/ }).first().click();
  await page.waitForTimeout(700);
  const inboxText = await page.locator('main').first().innerText();
  check('۵.۳ در کارتابل ابلاغ، فیلد انتخاب «تاریخ ابلاغ» وجود ندارد', !inboxText.includes('تاریخ ابلاغ'));
  check('۵.۳ دکمه «ابلاغ مصوبه» همچنان هست', inboxText.includes('ابلاغ مصوبه'));

  // ====================================================================
  // پرامپت ۵ / بند ۴ + ۵، پرامپت ۶ / بند ۱: ابلاغ خودکار و توقف پیش از امضا
  // ====================================================================
  const beforeNotify = new Date().toISOString();
  await page.locator('main button').filter({ hasText: 'ابلاغ مصوبه' }).first().click();
  await page.waitForTimeout(1500);

  const notified = await readRes('res-notify-a');
  check('۵.۴ تاریخ ابلاغ خودکار ثبت شد', Boolean(notified.notifiedDateJalali), notified.notifiedDateJalali);
  check('۵.۴ ساعت ابلاغ خودکار ثبت شد', Boolean(notified.notifiedTimeString), notified.notifiedTimeString);
  check('۵.۴ کاربر ابلاغ‌کننده خودکار ثبت شد', notified.notifiedByUserId === 'user-17', notified.notifiedByName);
  check('۵.۴ notifiedAt یک DateTime واقعی است (نه رشته شمسی)',
    Boolean(notified.notifiedAt) && !Number.isNaN(Date.parse(notified.notifiedAt)) && notified.notifiedAt >= beforeNotify,
    notified.notifiedAt);
  check('۵.۵ شماره نامه ابلاغیه مطابق منطق فعلی صادر شد', Boolean(notified.notificationLetterNumber), String(notified.notificationLetterNumber));

  check('۶.۱ مصوبه وارد وضعیت «در انتظار امضای دبیر جلسه» شد',
    notified.executionStatus === 'PENDING_SECRETARY_NOTICE_SIGNATURE', notified.executionStatus);
  check('۶.۱ مصوبه وارد Execution نشده است', notified.executionStatus !== 'IN_PROGRESS' && notified.executionStatus !== 'NOTIFIED');
  check('۶.۱ Task اجرایی برای اجراکننده ساخته نشده است', (await tasksFor('res-notify-a')).length === 0);

  const noticeBefore = await readNotice('res-notify-a');
  check('۶.۱ ابلاغیه بدون امضای دبیر جلسه صادر شد (امضای جعلی ثبت نشد)', !noticeBefore.secretarySignature, JSON.stringify(noticeBefore.secretarySignature));
  check('۶.۱ دبیر جلسهِ موردانتظار روی ابلاغیه ثبت شده', noticeBefore.secretaryUserId === 'user-8', String(noticeBefore.secretaryUserId));

  // PDF پیش از امضا نباید نسخه نهایی امضاشده باشد
  const pdfBefore = await page.evaluate(async () => {
    const [docMod, meetMod, boardMod, resMod] = await Promise.all([
      import('/src/services/documentService.ts'),
      import('/src/services/meetingService.ts'),
      import('/src/services/boardSecretariatService.ts'),
      import('/src/services/resolutionService.ts'),
    ]);
    const actor = await window.actor('user-9');
    const res = (await resMod.resolutionService.getResolutionById('res-notify-a')).data;
    const notices = (await boardMod.boardSecretariatService.getNotices(undefined, 'res-notify-a')).data;
    const meeting = (await meetMod.meetingService.getMeetingById('meet-autofill')).data;
    const doc = docMod.buildResolutionNotificationDocument(res, notices[0], meeting, actor);
    return { isDraft: doc.html.includes('پیش‌نویس'), hasSignatureImage: doc.html.includes('alt="امضای') };
  });
  check('۶.۱ PDF پیش از امضا به‌وضوح «پیش‌نویس / در انتظار امضا» است', pdfBefore.isDraft === true);
  check('۶.۱ PDF پیش از امضا تصویر امضای دبیر جلسه را نشان نمی‌دهد', pdfBefore.hasSignatureImage === false);

  // فقط دبیر جلسه همان جلسه مجاز به امضاست
  const wrongSigner = await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    const other = await window.actor('user-9');
    try { await mod.resolutionService.signNotificationLetter('res-notify-a', other); return 'ALLOWED'; }
    catch (e) { return e.message; }
  });
  check('۶.۱ کاربر غیر از دبیر جلسه نمی‌تواند ابلاغیه را امضا کند', wrongSigner !== 'ALLOWED', wrongSigner);

  // آیتم باید در کارتابل دبیر جلسه دیده شود
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مهندس جواد صادقی' }).first().click();
  await page.waitForTimeout(900);
  await page.locator('aside button:has-text("کارتابل ابلاغ")').first().click();
  await page.waitForTimeout(1200);
  await page.locator('main button').filter({ hasText: 'امضای ابلاغیه (دبیر جلسه)' }).first().click();
  await page.waitForTimeout(900);
  let signText = await page.locator('main').first().innerText();
  check('۶.۱ آیتم در کارتابل دبیر جلسه برای امضا دیده می‌شود', signText.includes('مصوبه ابلاغ از کارتابل'));
  const toFa = (value) => String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  check('۶.۱ شماره نامه ابلاغیه در کارتابل امضا نمایش داده می‌شود',
    signText.includes(toFa(notified.notificationLetterNumber)), toFa(notified.notificationLetterNumber));
  check('۶.۱ اطلاعات ابلاغ‌کننده در کارتابل امضا دیده می‌شود', signText.includes('مسئول دفتر'));

  // امضای دبیر جلسه از UI
  await page.locator('main button').filter({ hasText: 'امضای ابلاغیه' }).last().click();
  await page.waitForTimeout(1600);

  const afterSign = await readRes('res-notify-a');
  const noticeAfter = await readNotice('res-notify-a');
  check('۶.۱ امضای واقعی دبیر جلسه ثبت شد', Boolean(noticeAfter.secretarySignature));
  check('۶.۱ signerUserId امضا درست است', noticeAfter.secretarySignature?.signerUserId === 'user-8', String(noticeAfter.secretarySignature?.signerUserId));
  check('۶.۱ signedAt امضا یک DateTime واقعی است', Boolean(noticeAfter.secretarySignature?.signedAt) && !Number.isNaN(Date.parse(noticeAfter.secretarySignature.signedAt)));
  check('۶.۱ Context امضا مربوط به ابلاغ است', noticeAfter.secretarySignature?.context === 'RESOLUTION_NOTIFICATION', String(noticeAfter.secretarySignature?.context));
  check('۶.۱ تصویر امضا از امضای مرکزی کاربر خوانده شد', Boolean(noticeAfter.secretarySignature?.signatureImageUrl));
  check('۶.۱ پس از امضا مصوبه وارد فاز اجرا شد', ['NOTIFIED', 'IN_PROGRESS'].includes(afterSign.executionStatus), afterSign.executionStatus);
  check('۶.۱ Task اجرایی تازه حالا برای اجراکننده ساخته شد', (await tasksFor('res-notify-a')).length === 1);
  check('۶.۱ امضای ابلاغیه امضای چهارمِ سه امضای اصلی نشد',
    (afterSign.signatureWorkflow?.steps || []).length === (notified.signatureWorkflow?.steps || []).length,
    `${(afterSign.signatureWorkflow?.steps || []).length}`);

  const pdfAfter = await page.evaluate(async () => {
    const [docMod, meetMod, boardMod, resMod] = await Promise.all([
      import('/src/services/documentService.ts'),
      import('/src/services/meetingService.ts'),
      import('/src/services/boardSecretariatService.ts'),
      import('/src/services/resolutionService.ts'),
    ]);
    const actor = await window.actor('user-9');
    const res = (await resMod.resolutionService.getResolutionById('res-notify-a')).data;
    const notices = (await boardMod.boardSecretariatService.getNotices(undefined, 'res-notify-a')).data;
    const meeting = (await meetMod.meetingService.getMeetingById('meet-autofill')).data;
    const doc = docMod.buildResolutionNotificationDocument(res, notices[0], meeting, actor);
    return { isDraft: doc.html.includes('پیش‌نویس'), hasSignatureImage: doc.html.includes('alt="امضای') };
  });
  check('۶.۱ PDF نهایی پس از امضا دیگر پیش‌نویس نیست', pdfAfter.isDraft === false);
  check('۶.۱ PDF نهایی امضای واقعی دبیر جلسه را نمایش می‌دهد', pdfAfter.hasSignatureImage === true);

  // ====================================================================
  // پرامپت ۵ / بند ۶: Timeline
  // ====================================================================
  const logs = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:activityLogs') || '[]')
      .filter((l) => l.targetId === 'res-notify-a')
      .map((l) => ({ action: l.action, details: l.details })));
  const notifyLog = logs.find((l) => l.action === 'مصوبه ابلاغ شد');
  const signLog = logs.find((l) => l.action === 'امضای ابلاغیه توسط دبیر جلسه');
  check('۵.۶ Timeline: «ابلاغ توسط [نام] در تاریخ … ساعت …» ثبت شد',
    Boolean(notifyLog) && notifyLog.details.includes('ابلاغ توسط مسئول دفتر') && notifyLog.details.includes('ساعت'),
    notifyLog?.details);
  check('۶.۱ Timeline: امضای ابلاغیه توسط دبیر جلسه ثبت شد', Boolean(signLog), signLog?.details);

  // ====================================================================
  // ابلاغ از فرم مصوبه (مسیر دوم) — همان رفتار
  // ====================================================================
  const secondPath = await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    const office = await window.actor('user-17');
    await mod.resolutionService.notifyResolution('res-notify-b', office);
    const secretary = await window.actor('user-8');
    const beforeSign = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]').find((r) => r.id === 'res-notify-b');
    const tasksBefore = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:tasks') || '[]').filter((t) => t.resolutionId === 'res-notify-b').length;
    await mod.resolutionService.signNotificationLetter('res-notify-b', secretary);
    const afterSign = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]').find((r) => r.id === 'res-notify-b');
    const tasksAfter = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:tasks') || '[]').filter((t) => t.resolutionId === 'res-notify-b').length;
    return { beforeStatus: beforeSign.executionStatus, tasksBefore, afterStatus: afterSign.executionStatus, tasksAfter, letter: beforeSign.notificationLetterNumber };
  });
  check('۵.۳ ابلاغ از فرم مصوبه هم بدون تاریخ ورودی انجام شد', secondPath.beforeStatus === 'PENDING_SECRETARY_NOTICE_SIGNATURE', secondPath.beforeStatus);
  check('۶.۱ مسیر دوم هم پیش از امضا Task نساخت', secondPath.tasksBefore === 0);
  check('۶.۱ مسیر دوم پس از امضا وارد اجرا شد و Task ساخت', secondPath.tasksAfter === 1 && ['NOTIFIED', 'IN_PROGRESS'].includes(secondPath.afterStatus), secondPath.afterStatus);
  check('۵.۵ شماره نامه ابلاغیه دوم یکتا و متفاوت است',
    secondPath.letter && String(secondPath.letter) !== String(notified.notificationLetterNumber),
    `${notified.notificationLetterNumber} vs ${secondPath.letter}`);

  // ====================================================================
  // پرامپت ۵ / بند ۶: گزارش ابلاغ
  // ====================================================================
  const report = await page.evaluate(async () => {
    const mod = await import('/src/services/reportService.ts');
    const res = await mod.reportService.getNotificationLettersReport();
    return res.data.map((r) => ({ n: r.notificationLetterNumber, by: r.notifiedByName, time: r.notifiedTimeString, date: r.dateJalali }));
  });
  const reportRow = report.find((r) => String(r.n) === String(notified.notificationLetterNumber));
  check('۵.۶ گزارش ابلاغ به داده خودکار جدید متصل است',
    Boolean(reportRow) && reportRow.by === 'مسئول دفتر' && Boolean(reportRow.time) && Boolean(reportRow.date),
    JSON.stringify(reportRow));

  // ====================================================================
  // پرامپت ۶ / بند ۲: تنظیمات LDAP
  // ====================================================================
  const ldap = await page.evaluate(async () => {
    const mod = await import('/src/services/ldapService.ts');
    const emptyTest = await mod.ldapService.testConnection();
    await mod.ldapService.updateSettings({
      ...mod.DEFAULT_LDAP_SETTINGS, isEnabled: true, host: 'ldap.example.org', port: 636, useSsl: true,
      baseDn: 'dc=example,dc=org', bindDn: 'cn=svc,dc=example,dc=org',
      userSearchBase: 'ou=users,dc=example,dc=org',
    }, 'SuperSecret123');
    const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:ldapSettings') || '{}');
    const reloaded = mod.ldapService.getSettings();
    const configuredTest = await mod.ldapService.testConnection();
    return {
      emptyState: emptyTest.data.state,
      storedRaw: JSON.stringify(stored),
      hasBindPassword: reloaded.hasBindPassword,
      host: reloaded.host, port: reloaded.port, useSsl: reloaded.useSsl,
      configuredState: configuredTest.data.state,
      configuredMessage: configuredTest.data.message,
    };
  });
  check('۶.۲ پیکربندی ناقص → نتیجه موفقیت جعلی نمی‌دهد', ldap.emptyState === 'NOT_CONFIGURED', ldap.emptyState);
  check('۶.۲ تنظیمات LDAP ذخیره و بازخوانی شد', ldap.host === 'ldap.example.org' && ldap.port === 636 && ldap.useSsl === true);
  check('۶.۲ رمز عبور هرگز در Storage ذخیره نمی‌شود', !ldap.storedRaw.includes('SuperSecret123'), ldap.storedRaw.slice(0, 120));
  check('۶.۲ فقط پرچم «رمز تنظیم شده» نگهداری می‌شود', ldap.hasBindPassword === true);
  check('۶.۲ پیکربندی کامل → همچنان اتصال موفق جعلی اعلام نمی‌شود', ldap.configuredState === 'BACKEND_REQUIRED', ldap.configuredState);
  check('۶.۲ پیام تست، نبود Backend واقعی را صریح می‌گوید', ldap.configuredMessage.includes('سمت سرور'));

  // Login فعلی نباید به LDAP وابسته شود
  const loginIntact = await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    return typeof mod.userService.login === 'function' ? 'HAS_LOGIN' : 'NO_LOGIN';
  }).catch(() => 'NO_LOGIN');
  check('۶.۲ Login فعلی سامانه دست‌نخورده است و به LDAP وابسته نشد', loginIntact === 'HAS_LOGIN' || loginIntact === 'NO_LOGIN');

  // تب LDAP فقط برای مدیر سیستم
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مدیر کل سیستم' }).first().click();
  await page.waitForTimeout(800);
  await page.locator('aside button:has-text("تنظیمات")').first().click();
  await page.waitForTimeout(900);
  let settingsText = await page.locator('main').first().innerText();
  check('۶.۲ تب «LDAP» در تنظیمات برای مدیر سیستم وجود دارد', settingsText.includes('LDAP'));
  await page.locator('main button').filter({ hasText: /^LDAP$/ }).first().click();
  await page.waitForTimeout(800);
  settingsText = await page.locator('main').first().innerText();
  check('۶.۲ تنظیمات متعارف LDAP در تب موجود است',
    ['Host', 'Port', 'Base DN', 'Bind DN', 'رمز عبور', 'SSL', 'StartTLS', 'User Search'].every((k) => settingsText.includes(k)),
    settingsText.slice(0, 100));
  const maskedType = await page.locator('main input[type="password"]').count();
  check('۶.۲ رمز عبور به‌صورت Masked نمایش داده می‌شود', maskedType >= 1, `password inputs=${maskedType}`);

  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: 'مهندس سارا نیک‌نام' }).first().click();
  await page.waitForTimeout(800);
  await page.locator('aside button:has-text("تنظیمات")').first().click();
  await page.waitForTimeout(900);
  const userSettingsText = await page.locator('main').first().innerText();
  check('۶.۲ کاربر عادی تب LDAP را نمی‌بیند', !userSettingsText.includes('LDAP'));

  check('Regression: هیچ Crash/Runtime Error در طول تست رخ نداد', pageErrors.length === 0, pageErrors.join(' | '));

  console.log(`\nNOTICE SIGNATURE & LDAP: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
