const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4179';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

const readLS = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(`postbank-mosavabat-v1:${k}`) || 'null'), key);

const switchUser = async (page, label) => {
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: label }).first().click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
};

// A 1x1 PNG standing in for a user's uploaded signature image.
const UPLOADED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
  page.on('dialog', async (d) => { await d.accept(); });
  // Documents open in a print window; capture them instead of printing.
  const documentPages = [];
  page.context().on('page', (p) => documentPages.push(p));
  // این Suite یک مرورگرِ از قبل Reset‌شده را شبیه‌سازی می‌کند: Marker پیش از
  // بارگذاری هر صفحه ثبت می‌شود تا Reset یک‌باره داده‌های Seed تست را پاک نکند.
  await page.addInitScript(() => {
    localStorage.setItem('postbank-mosavabat-v1:operationalResetVersion', '1');
  });


  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // ===================== Test 1 — signature upload persists =====================
  await switchUser(page, 'مسئول دفتر');
  // Signature images are administered from user management only (there is no
  // self-service «امضای من» page any more); the admin path itself is covered
  // by tests/e2e/userSignatureManagement.cjs, so here it is just setup.
  await page.evaluate(async (dataUrl) => {
    const mod = await import('/src/services/userService.ts');
    const data = await import('/src/mock/data.ts');
    const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || 'null');
    const users = stored && stored.length ? stored : data.mockUsers;
    await mod.userService.updateUserSignature('user-17', dataUrl, users.find((u) => u.id === 'user-admin'));
  }, `data:image/png;base64,${UPLOADED_PNG.toString('base64')}`);
  await page.waitForTimeout(500);

  // Logout/login round-trip: a full reload re-reads the persisted users store.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  let users = await readLS(page, 'users');
  const officeManager = users.find((u) => u.id === 'user-17');
  check('CR-D Test1 امضای بارگذاری‌شده پس از Reload باقی می‌ماند', String(officeManager?.signatureUrl || '').startsWith('data:image/png'));
  check('CR-D بند۳ امضا به همان UserId متصل است', users.filter((u) => u.signatureUrl).length === 1);

  // ===================== Seed a meeting ready for invitation ====================
  await page.evaluate(() => {
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]');
    meetings.unshift({
      id: 'meet-sig-qa', meetingNumber: 'جلسه-QA-۵۰۱', title: 'جلسه تست امضا و اسناد', type: 'BOARD_OF_DIRECTORS',
      dateJalali: '1405/06/25', startTime: '۰۹:۰۰', endTime: '۱۱:۰۰', location: 'سالن جلسات مرکزی',
      organizerId: 'user-16', organizerName: 'مدیرعامل', secretaryId: 'user-17', secretaryName: 'مسئول دفتر',
      departmentId: 'dept-1', departmentName: 'اداره کل فناوری اطلاعات', status: 'READY_FOR_INVITATION',
      description: 'بررسی اسناد رسمی و امضای تصویری',
      members: [
        { userId: 'user-16', fullName: 'مدیرعامل', roleTitle: 'مدیرعامل', departmentName: 'معاونت برنامه‌ریزی', attendanceType: 'ORGANIZER', presenceStatus: 'PRESENT' },
        { userId: 'user-17', fullName: 'مسئول دفتر', roleTitle: 'مسئول دفتر مدیرعامل', departmentName: 'معاونت برنامه‌ریزی', attendanceType: 'SECRETARY', presenceStatus: 'PRESENT' },
        { userId: 'user-9', fullName: 'مهندس سارا نیک‌نام', roleTitle: 'کارشناس ارشد زیرساخت', departmentName: 'اداره کل فناوری اطلاعات', attendanceType: 'MEMBER', presenceStatus: 'PRESENT' },
      ],
      agendaItems: [{ id: 'ag-sig-1', order: 1, rowNumber: 1, title: 'بند تست اسناد رسمی', presenter: 'user-9', presenterName: 'مهندس سارا نیک‌نام', isDiscussed: true, outcomeStatus: 'APPROVED', startTime: '۰۹:۱۰', endTime: '۰۹:۴۰' }],
      guests: [{ id: 'guest-sig-1', fullName: 'مهمان آزمایشی', roleTitle: 'مشاور', organizationName: 'شرکت همکار', phone: '09120000000', invitationStatus: 'NOT_SENT' }],
      invitations: [], resolutionsCount: 0, attachments: [], history: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('postbank-mosavabat-v1:meetings', JSON.stringify(meetings));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const openMeeting = async () => {
    await page.locator('aside button:has-text("مدیریت جلسات")').first().click();
    await page.waitForTimeout(1000);
    await page.locator('text=جلسه تست امضا و اسناد').first().click();
    await page.waitForTimeout(1100);
  };
  await openMeeting();

  // ===================== Test 2 — invitation signature =====================
  // Opening a READY_FOR_INVITATION meeting as the secretariat is what actually
  // sends the invitations in this app, and that is what records the
  // دبیر جلسه's invitation signature — no test-only shortcut needed.
  await page.waitForTimeout(1200);
  let meetings = await readLS(page, 'meetings');
  const meeting = meetings.find((m) => m.id === 'meet-sig-qa');
  check('CR-D Test2 امضای دعوت‌نامه توسط دبیر جلسه ثبت شد', meeting?.invitationSignature?.signerUserId === 'user-17');
  check('CR-D Test2 Context امضای دعوت‌نامه جداست', meeting?.invitationSignature?.context === 'MEETING_INVITATION');
  check('CR-D Test2 تصویر امضای بارگذاری‌شده روی دعوت‌نامه استفاده شد', String(meeting?.invitationSignature?.signatureImageUrl || '').startsWith('data:image/png'));
  check('CR-C بند۴ اعضا و مدعوین حذف نشده‌اند', meeting.members.length === 3 && meeting.guests.length === 1);
  check('CR-C بند۲ هیچ امضایی از اعضا/مدعوین درخواست نشده است', !JSON.stringify(meeting.invitations).includes('signature'));

  // Test 1 (CR-E) — the invitation letter renders and carries the signature.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await openMeeting();
  await page.locator('button:has-text("دعوتنامه")').first().click();
  await page.waitForTimeout(700);
  documentPages.length = 0;
  await page.locator('button:has-text("مشاهده و دانلود دعوت‌نامه")').first().click();
  await page.waitForTimeout(1400);
  check('CR-E Test1 نسخه رسمی دعوت‌نامه تولید شد', documentPages.length === 1);
  if (documentPages.length) {
    const doc = documentPages[0];
    const text = await doc.locator('body').innerText();
    const imgs = await doc.locator('img[alt^="امضای"]').count();
    check('CR-E Test1 دعوت‌نامه اطلاعات واقعی جلسه را دارد', text.includes('جلسه تست امضا و اسناد') && text.includes('سالن جلسات مرکزی'));
    check('CR-E Test1 مدعو در دعوت‌نامه نمایش داده می‌شود', text.includes('مهمان آزمایشی'));
    check('CR-E Test1 تصویر امضای دبیر جلسه روی دعوت‌نامه است', imgs >= 1);
    check('CR-E بند۱۴ امضای مدعوین روی دعوت‌نامه درخواست نمی‌شود', text.includes('امضای مدعوین در این سند اخذ نمی‌شود'));
    check('CR-E بند۸ نام فایل از شماره واقعی جلسه ساخته شده', ((await doc.locator('.doc-toolbar').getAttribute('data-file-name')) || '').startsWith('MeetingInvitation-'));
    await doc.close();
  }

  // ===================== Seed a signed resolution for the meeting ==============
  await page.evaluate(() => {
    const base = {
      meetingId: 'meet-sig-qa', meetingTitle: 'جلسه تست امضا و اسناد', meetingNumber: 'جلسه-QA-۵۰۱',
      proposerName: 'مهندس پوریا حسینی', proposerDepartment: 'اداره کل فناوری اطلاعات',
      requestDescription: 'شرح درخواست تست سند مصوبه', reviewResultNotes: 'نتیجه بررسی تست سند',
      approvalStatus: 'APPROVED', mainResponsibleUserId: 'user-9', mainResponsibleName: 'مهندس سارا نیک‌نام',
      responsibleDepartmentId: 'dept-1', responsibleDepartmentName: 'اداره کل فناوری اطلاعات',
      assignedDateJalali: '1405/06/25', deadlineJalali: '1405/07/25', priority: 'MEDIUM',
      referrals: [], verificationConfig: { requiresVerification: false, mode: 'SEQUENTIAL', currentStepIndex: 0, steps: [] },
      attachments: [], createdAt: new Date().toISOString(),
      executionStatus: 'PENDING_ADMIN_SIGNATURE',
      signatureWorkflow: {
        status: 'PENDING_ADMIN_SIGNATURE', currentStepIndex: 2,
        steps: [
          { id: 'sg1', signerUserId: 'user-17', signerName: 'مسئول دفتر', signerTitle: 'مسئول دفتر مدیرعامل', signerRole: 'OFFICE_MANAGER', order: 1, status: 'SIGNED', signedDateJalali: '1405/06/25', signedTimeString: '۰۹:۰۰' },
          { id: 'sg2', signerUserId: 'user-16', signerName: 'مدیرعامل', signerTitle: 'مدیرعامل', signerRole: 'CEO', order: 2, status: 'SIGNED', signedDateJalali: '1405/06/25', signedTimeString: '۰۹:۱۰' },
          { id: 'sg3', signerUserId: 'user-admin', signerName: 'مدیر کل سیستم (Admin)', signerTitle: 'راهبر ارشد سامانه مصوبات', signerRole: 'ADMIN', order: 3, status: 'PENDING' },
        ],
      },
    };
    localStorage.setItem('postbank-mosavabat-v1:resolutions', JSON.stringify([
      { ...base, id: 'res-sig-qa', resolutionNumber: 'مصوبه-QA-سند', topicTitle: 'موضوع تست سند مصوبه' },
    ]));
  });

  // ===================== Test 4 (CR-D) — three main signatures =================
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    await mod.resolutionService.signResolution('res-sig-qa', 'user-admin');
  });
  await page.waitForTimeout(700);
  let resolutions = await readLS(page, 'resolutions');
  let steps = resolutions.find((r) => r.id === 'res-sig-qa').signatureWorkflow.steps;
  check('CR-D تأکید: زنجیره امضای مصوبه همچنان دقیقاً سه مرحله است', steps.length === 3);
  check('CR-D بند۱۱ تصویر امضا به رکورد امضا پیوست شد', Boolean(steps[2].signatureImageUrl));
  check('CR-D بند۱۲ امضای هر Signer از رکورد کاربر واقعی خودش گرفته می‌شود', steps[2].signatureImageUrl.includes('svg') && String(steps[0].signatureImageUrl || '').length === 0);
  check('CR-D Test5 امضاکننده فاقد تصویر امضا، Workflow را Crash نکرد', resolutions.find((r) => r.id === 'res-sig-qa').signatureWorkflow.status === 'COMPLETED');

  // ===================== Test 3 (CR-D/E) — notification letter =================
  // ابلاغ دیگر تاریخ نمی‌گیرد و امضای دبیر جلسه را خودکار نمی‌سازد؛ امضا
  // مرحله جداگانه و واقعی است (signNotificationLetter).
  await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || '[]');
    const office = users.find((u) => u.id === 'user-17');
    await mod.resolutionService.notifyResolution('res-sig-qa', office);
  });
  await page.waitForTimeout(500);
  const beforeSignNotice = (await readLS(page, 'resolutionNotices')).find((n) => n.resolutionId === 'res-sig-qa');
  check('CR-D Test3 پیش از امضا، ابلاغیه امضای دبیر جلسه ندارد', !beforeSignNotice?.secretarySignature);

  await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || '[]');
    const notices = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]');
    const notice = notices.find((n) => n.resolutionId === 'res-sig-qa');
    const signer = users.find((u) => u.id === notice?.secretaryUserId) || users.find((u) => u.role === 'ADMIN');
    await mod.resolutionService.signNotificationLetter('res-sig-qa', signer);
  });
  await page.waitForTimeout(700);
  const notices = await readLS(page, 'resolutionNotices');
  const notice = notices.find((n) => n.resolutionId === 'res-sig-qa');
  check('CR-D Test3 امضای دبیر جلسه روی ابلاغیه ثبت شد', Boolean(notice?.secretarySignature?.signerUserId), String(notice?.secretarySignature?.signerUserId));
  check('CR-D Test3 Context امضای ابلاغیه جداست', notice?.secretarySignature?.context === 'RESOLUTION_NOTIFICATION');
  check('CR-D Test3 تصویر امضای واقعی دبیر روی ابلاغیه است', String(notice?.secretarySignature?.signatureImageUrl || '').startsWith('data:image/png'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('aside button:has-text("بانک مصوبات")').first().click();
  await page.waitForTimeout(1100);
  await page.locator('text=موضوع تست سند مصوبه').first().click();
  await page.waitForTimeout(1200);

  documentPages.length = 0;
  await page.locator('button:has-text("مشاهده و دانلود نامه ابلاغیه")').first().click();
  await page.waitForTimeout(1400);
  check('CR-E Test2 نامه ابلاغیه تولید شد', documentPages.length === 1);
  if (documentPages.length) {
    const doc = documentPages[0];
    const text = await doc.locator('body').innerText();
    // سند با ارقام فارسی رندر می‌شود، پس متن را به ارقام لاتین برمی‌گردانیم.
    const latin = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    check('CR-E Test2 شماره نامه ابلاغیه واقعی روی نامه است', latin.includes(String(notice.notificationLetterNumber)));
    check('CR-E Test2 شماره مصوبه روی نامه است', text.includes('مصوبه-QA-سند'));
    // تاریخ ابلاغ دیگر دستی وارد نمی‌شود؛ همان تاریخ خودکارِ ثبت‌شده باید روی نامه باشد.
    const notifiedDate = (await readLS(page, 'resolutions')).find((r) => r.id === 'res-sig-qa').notifiedDateJalali;
    check('CR-E Test2 تاریخ ابلاغ خودکار روی نامه است',
      latin.includes(notifiedDate.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))), notifiedDate);
    check('CR-E Test2 تصویر امضای دبیر جلسه روی نامه است', (await doc.locator('img[alt^="امضای"]').count()) >= 1);
    await doc.close();
  }

  documentPages.length = 0;
  await page.locator('button:has-text("مشاهده و دانلود سند مصوبه")').first().click();
  await page.waitForTimeout(1400);
  check('CR-E Test3 سند مصوبه تولید شد', documentPages.length === 1);
  if (documentPages.length) {
    const doc = documentPages[0];
    const text = await doc.locator('body').innerText();
    check('CR-E Test3 هر سه امضاکننده روی سند مصوبه هستند', text.includes('مسئول دفتر') && text.includes('مدیرعامل') && text.includes('مدیر کل سیستم'));
    check('CR-E Test3 تصویر هر سه امضا روی سند درج شده است', (await doc.locator('img[alt^="امضای"]').count()) === 3);
    await doc.close();
  }
  await page.locator('button:has-text("بستن پنجره")').first().click().catch(() => {});
  await page.waitForTimeout(500);

  // ===================== Test 4 (CR-E) + CR-C — consolidated minutes ===========
  await page.evaluate(async () => {
    const mod = await import('/src/services/boardSecretariatService.ts');
    const meetingMod = await import('/src/services/meetingService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || '[]');
    const actor = users.find((u) => u.id === 'user-17');
    const meeting = (await meetingMod.meetingService.getMeetingById('meet-sig-qa')).data;
    await mod.boardSecretariatService.createMinutes(meeting, 'متن صورت‌جلسه تجمیعی تست.', actor);
    // Straight from DRAFT to FINALIZED — no attendee signature round at all.
    await mod.boardSecretariatService.finalizeMinutes('meet-sig-qa', actor);
  });
  await page.waitForTimeout(800);
  const minutes = (await readLS(page, 'boardMinutes')).find((m) => m.meetingId === 'meet-sig-qa');
  check('CR-C Test صورت‌جلسه بدون امضای اعضا/مدعوین نهایی شد', minutes?.status === 'FINALIZED');
  check('CR-C بند۱ هیچ رکورد امضای عضوی ساخته نشد', !minutes.signatures || minutes.signatures.length === 0);
  check('CR-D بند۱۰ امضای دبیرخانه روی صورت‌جلسه ثبت شد', minutes?.finalizedSignature?.context === 'MEETING_MINUTES');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await openMeeting();
  await page.locator('button:has-text("صورتجلسه"), button:has-text("چاپ صورتجلسه")').first().click().catch(() => {});
  const minutesTab = page.locator('button').filter({ hasText: /صورت.?جلسه/ }).first();
  await minutesTab.click();
  await page.waitForTimeout(900);
  const meetingBody = await page.locator('body').innerText();
  check('CR-C Test دکمه «ارسال برای امضای اعضا» حذف شده است', !meetingBody.includes('ارسال برای امضای اعضا'));
  check('CR-C Test دکمه «امضای صورت‌جلسه» برای اعضا وجود ندارد', !meetingBody.includes('امضای صورت‌جلسه'));

  documentPages.length = 0;
  await page.locator('button:has-text("مشاهده و دانلود صورت‌جلسه تجمیعی")').first().click();
  await page.waitForTimeout(1400);
  check('CR-E Test4 صورت‌جلسه تجمیعی تولید شد', documentPages.length === 1);
  if (documentPages.length) {
    const doc = documentPages[0];
    const text = await doc.locator('body').innerText();
    check('CR-E Test4 اطلاعات واقعی جلسه در صورت‌جلسه است', text.includes('جلسه-QA-۵۰۱') && text.includes('سالن جلسات مرکزی'));
    check('CR-E Test4 مصوبه واقعی جلسه در صورت‌جلسه است', text.includes('مصوبه-QA-سند'));
    check('CR-E Test4 حاضرین و مدعوین نمایش داده می‌شوند', text.includes('مهندس سارا نیک‌نام') && text.includes('مهمان آزمایشی'));
    check('CR-E بند۱۴ امضای مدعوین در صورت‌جلسه اخذ نمی‌شود', text.includes('امضای آنان در این سند اخذ نمی‌شود'));
    await doc.close();
  }

  // ===================== Test 5 (CR-E) — permission on download ===============
  const denied = await page.evaluate(async () => {
    const docMod = await import('/src/services/documentService.ts');
    const meetingMod = await import('/src/services/meetingService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || '[]');
    // A user who is neither a member, organizer nor secretary of this meeting.
    const outsider = users.find((u) => !['user-17', 'user-16', 'user-9', 'user-admin'].includes(u.id) && u.role !== 'ADMIN' && u.role !== 'CEO' && u.role !== 'SECRETARY');
    const meeting = (await meetingMod.meetingService.getMeetingById('meet-sig-qa')).data;
    try {
      docMod.buildMeetingMinutesDocument(meeting, [], undefined, outsider);
      return 'ALLOWED';
    } catch (error) {
      return error.message;
    }
  });
  check('CR-E Test5 کاربر فاقد دسترسی نمی‌تواند سند جلسه را دریافت کند', denied.includes('مجوز'), denied);

  console.log(`\nMEETING SIGNATURES & DOCUMENTS: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
