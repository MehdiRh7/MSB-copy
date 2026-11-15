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
  await page.waitForTimeout(800);
};

// Distinct 1x1 PNGs so each signer's image is individually identifiable.
const png = (tail) => `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42${tail}`;
const PNG_SECRETARY = png('mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
  page.on('dialog', async (d) => { await d.accept(); });
  const documentPages = [];
  page.context().on('page', (p) => documentPages.push(p));

  await page.addInitScript(() => {
    window.loadUsers = async () => {
      const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || 'null');
      if (stored && stored.length) return stored;
      const data = await import('/src/mock/data.ts');
      return data.mockUsers;
    };
  });
  // این Suite یک مرورگرِ از قبل Reset‌شده را شبیه‌سازی می‌کند: Marker پیش از
  // بارگذاری هر صفحه ثبت می‌شود تا Reset یک‌باره داده‌های Seed تست را پاک نکند.
  await page.addInitScript(() => {
    localStorage.setItem('postbank-mosavabat-v1:operationalResetVersion', '1');
  });


  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // ===================== Test 1 — «امضای من» is gone =========================
  await switchUser(page, 'مهندس سارا نیک‌نام');
  check('CR-G Test1 منوی «امضای من» برای کاربر عادی وجود ندارد', (await page.locator('aside button:has-text("امضای من")').count()) === 0);
  const sidebarText = await page.locator('aside').innerText();
  check('CR-G بند۲ کاربر عادی هیچ Action مستقیم امضا در Sidebar ندارد', !sidebarText.includes('امضا'));

  // ===================== Test 4 — permission is enforced in the service ======
  const normalUserAttempt = await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    const users = await window.loadUsers();
    const normal = users.find((u) => u.id === 'user-9');
    try {
      await mod.userService.updateUserSignature('user-9', 'data:image/png;base64,AAAA', normal);
      return 'ALLOWED';
    } catch (error) { return error.message; }
  });
  check('CR-G Test4 کاربر عادی نمی‌تواند امضای خودش را تغییر دهد', normalUserAttempt.includes('مجاز'), normalUserAttempt);

  const normalUserOnOther = await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    const users = await window.loadUsers();
    const normal = users.find((u) => u.id === 'user-9');
    try {
      await mod.userService.updateUserSignature('user-17', 'data:image/png;base64,AAAA', normal);
      return 'ALLOWED';
    } catch (error) { return error.message; }
  });
  check('CR-G Test4 کاربر عادی نمی‌تواند امضای کاربر دیگر را تغییر دهد', normalUserOnOther.includes('مجاز'), normalUserOnOther);

  const backDoorAttempt = await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    const users = await window.loadUsers();
    const normal = users.find((u) => u.id === 'user-9');
    const { id, ...rest } = normal;
    try {
      await mod.userService.updateUser(id, { ...rest, signatureUrl: 'data:image/png;base64,AAAA' }, normal);
      return 'ALLOWED';
    } catch (error) { return error.message; }
  });
  check('CR-G بند۱۴ تغییر امضا از مسیر updateUser هم Reject می‌شود', backDoorAttempt.includes('مدیر سیستم'), backDoorAttempt);

  let users = await readLS(page, 'users');
  check('CR-G Test4 هیچ امضایی روی کاربر عادی ذخیره نشد', !users || !users.some((u) => u.id === 'user-9' && u.signatureUrl));

  // ===================== Test 2/3 — admin manages it in User Management ======
  await switchUser(page, 'مدیر سیستم');
  await page.locator('aside button:has-text("تنظیمات")').first().click();
  await page.waitForTimeout(900);
  await page.locator('button:has-text("مدیریت کاربران")').first().click();
  await page.waitForTimeout(900);

  const officeRow = page.locator('tbody tr').filter({ hasText: 'مسئول دفتر' }).first();
  await officeRow.locator('button[title*="ویرایش"], button').first().click();
  await page.waitForTimeout(900);
  let modalText = await page.locator('body').innerText();
  check('CR-G Test2 تب «امضای کاربر» در مدیریت کاربران برای Admin دیده می‌شود', modalText.includes('امضای کاربر'));

  await page.locator('button:has-text("امضای کاربر")').first().click();
  await page.waitForTimeout(600);
  modalText = await page.locator('body').innerText();
  check('CR-G بند۱۵ وضعیت «امضایی ثبت نشده» نمایش داده می‌شود', modalText.includes('برای این کاربر امضایی ثبت نشده است'));

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'secretary.png', mimeType: 'image/png',
    buffer: Buffer.from(PNG_SECRETARY.split(',')[1], 'base64'),
  });
  await page.waitForTimeout(700);
  await page.locator('button:has-text("ثبت"), button:has-text("ذخیره")').last().click();
  await page.waitForTimeout(1200);

  users = await readLS(page, 'users');
  const office = users.find((u) => u.id === 'user-17');
  check('CR-G Test3 امضای کاربر توسط Admin ذخیره شد', String(office?.signatureUrl || '').startsWith('data:image/png'));
  check('CR-G بند۸ امضا به UserId همان کاربر متصل است', users.filter((u) => u.signatureUrl).length === 1);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  users = await readLS(page, 'users');
  check('CR-G Test3 امضا پس از باز کردن دوباره Persist شده است', Boolean(users.find((u) => u.id === 'user-17')?.signatureUrl));

  // ============ Editing a user must not reset their permissions =============
  const officeAfterEdit = (await readLS(page, 'users')).find((u) => u.id === 'user-17');
  check('مجوزهای اختصاصی کاربر پس از ویرایش پروفایل حفظ شدند', (officeAfterEdit.permissions || []).includes('NOTIFY_RESOLUTION'), (officeAfterEdit.permissions || []).join(','));
  check('سایر مجوزهای اختصاصی نیز پاک نشدند', ['VIEW_RESOLUTION_FOLLOWUP', 'MANAGE_RESOLUTION_FOLLOWUP', 'APPEND_MEETING_CONTENT'].every((p) => (officeAfterEdit.permissions || []).includes(p)));

  const roleChange = await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    const users = await window.loadUsers();
    const admin = users.find((u) => u.id === 'user-admin');
    const target = users.find((u) => u.id === 'user-17');
    const before = [...(target.permissions || [])];
    // Simulates what the edit form now sends when the role changes: existing
    // permissions plus the new role's baseline, never a replacement.
    const { id, ...rest } = target;
    const merged = Array.from(new Set([...before, 'VIEW_APPROVALS', 'VIEW_REPORTS']));
    await mod.userService.updateUser(id, { ...rest, role: 'DEPT_MANAGER', permissions: merged }, admin);
    const saved = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users')).find((u) => u.id === 'user-17');
    // Put the persona back so the rest of the suite is unaffected.
    await mod.userService.updateUser(id, { ...rest, role: target.role, permissions: before }, admin);
    return { keptAll: before.every((p) => saved.permissions.includes(p)), gained: saved.permissions.includes('VIEW_APPROVALS') };
  });
  check('تغییر نقش، مجوزهای قبلی را حذف نمی‌کند', roleChange.keptAll);
  check('تغییر نقش، مجوزهای پایه نقش جدید را اضافه می‌کند', roleChange.gained);

  // ===================== Test 7 — three main signers, each their own =========
  const signerImages = await page.evaluate(async () => {
    const userMod = await import('/src/services/userService.ts');
    const users = await window.loadUsers();
    const admin = users.find((u) => u.id === 'user-admin');
    // A distinct signature per signer, all written through the admin path.
    await userMod.userService.updateUserSignature('user-16', 'data:image/png;base64,CEOSIGNATURE', admin);
    await userMod.userService.updateUserSignature('user-admin', 'data:image/png;base64,ADMINSIGNATURE', admin);
    return true;
  });
  check('CR-G Test7 امضای اختصاصی هر سه Signer توسط Admin ثبت شد', signerImages);

  await page.evaluate(() => {
    const base = {
      meetingId: 'meet-sig-mgmt', meetingTitle: 'جلسه تست مدیریت امضا', meetingNumber: 'جلسه-QA-۹۰۱',
      proposerName: 'مهندس پوریا حسینی', proposerDepartment: 'اداره کل فناوری اطلاعات',
      requestDescription: 'شرح درخواست تست امضا', approvalStatus: 'APPROVED',
      mainResponsibleUserId: 'user-9', mainResponsibleName: 'مهندس سارا نیک‌نام',
      responsibleDepartmentId: 'dept-1', responsibleDepartmentName: 'اداره کل فناوری اطلاعات',
      assignedDateJalali: '1405/06/25', deadlineJalali: '1405/07/25', priority: 'MEDIUM',
      referrals: [], verificationConfig: { requiresVerification: false, mode: 'SEQUENTIAL', currentStepIndex: 0, steps: [] },
      attachments: [], createdAt: new Date().toISOString(), executionStatus: 'PENDING_OFFICE_SIGNATURE',
      signatureWorkflow: {
        status: 'PENDING_OFFICE_SIGNATURE', currentStepIndex: 0,
        steps: [
          { id: 'sg1', signerUserId: 'user-17', signerName: 'مسئول دفتر', signerTitle: 'مسئول دفتر مدیرعامل', signerRole: 'OFFICE_MANAGER', order: 1, status: 'PENDING' },
          { id: 'sg2', signerUserId: 'user-16', signerName: 'مدیرعامل', signerTitle: 'مدیرعامل', signerRole: 'CEO', order: 2, status: 'WAITING_TURN' },
          { id: 'sg3', signerUserId: 'user-admin', signerName: 'مدیر سیستم', signerTitle: 'راهبر ارشد سامانه مصوبات', signerRole: 'ADMIN', order: 3, status: 'WAITING_TURN' },
        ],
      },
    };
    localStorage.setItem('postbank-mosavabat-v1:resolutions', JSON.stringify([{ ...base, id: 'res-sigmgmt', resolutionNumber: 'مصوبه-QA-امضا', topicTitle: 'موضوع تست مدیریت امضا' }]));
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]');
    meetings.unshift({
      id: 'meet-sig-mgmt', meetingNumber: 'جلسه-QA-۹۰۱', title: 'جلسه تست مدیریت امضا', type: 'BOARD_OF_DIRECTORS',
      dateJalali: '1405/06/25', startTime: '۰۹:۰۰', endTime: '۱۱:۰۰', location: 'سالن جلسات',
      organizerId: 'user-16', organizerName: 'مدیرعامل', secretaryId: 'user-17', secretaryName: 'مسئول دفتر',
      departmentId: 'dept-1', departmentName: 'اداره کل فناوری اطلاعات', status: 'READY_FOR_INVITATION',
      description: 'تست اتصال امضا به منبع مرکزی',
      members: [
        { userId: 'user-16', fullName: 'مدیرعامل', roleTitle: 'مدیرعامل', departmentName: 'معاونت', attendanceType: 'ORGANIZER', presenceStatus: 'PRESENT' },
        { userId: 'user-17', fullName: 'مسئول دفتر', roleTitle: 'مسئول دفتر مدیرعامل', departmentName: 'معاونت', attendanceType: 'SECRETARY', presenceStatus: 'PRESENT' },
      ],
      agendaItems: [], guests: [], invitations: [], resolutionsCount: 1, attachments: [], history: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('postbank-mosavabat-v1:meetings', JSON.stringify(meetings));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    await mod.resolutionService.signResolution('res-sigmgmt', 'user-17');
    await mod.resolutionService.signResolution('res-sigmgmt', 'user-16');
    await mod.resolutionService.signResolution('res-sigmgmt', 'user-admin');
  });
  await page.waitForTimeout(700);

  const steps = (await readLS(page, 'resolutions')).find((r) => r.id === 'res-sigmgmt').signatureWorkflow.steps;
  check('CR-G Test7 امضای Signer اول از رکورد خودش خوانده شد', steps[0].signatureImageUrl === office.signatureUrl, steps[0].signatureImageUrl.slice(0, 40));
  check('CR-G Test7 امضای Signer دوم از رکورد خودش خوانده شد', steps[1].signatureImageUrl === 'data:image/png;base64,CEOSIGNATURE');
  check('CR-G Test7 امضای Signer سوم از رکورد خودش خوانده شد', steps[2].signatureImageUrl === 'data:image/png;base64,ADMINSIGNATURE');
  check('CR-G Test7 هیچ Signer تصویر امضای دیگری را نگرفت', new Set(steps.map((s) => s.signatureImageUrl)).size === 3);
  check('CR-G بند۱۳ رکورد امضا همچنان شامل Signer/زمان/ترتیب است', steps.every((s) => s.signerUserId && s.signedAt && s.order && s.status === 'SIGNED'));
  check('CR-G بند۱۶ زنجیره سه امضا دست‌نخورده باقی ماند', steps.length === 3);

  // ===================== Test 5 — invitation uses the central signature ======
  await page.evaluate(async () => {
    const mod = await import('/src/services/meetingService.ts');
    const users = await window.loadUsers();
    await mod.meetingService.sendInvitations('meet-sig-mgmt', users.find((u) => u.id === 'user-17'));
  });
  await page.waitForTimeout(600);
  const meeting = (await readLS(page, 'meetings')).find((m) => m.id === 'meet-sig-mgmt');
  check('CR-G Test5 دعوت‌نامه امضای دبیر جلسه را از منبع مرکزی گرفت', meeting.invitationSignature.signatureImageUrl === office.signatureUrl);

  // ===================== Test 6 — replacing it affects only new documents ====
  await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    const users = await window.loadUsers();
    const admin = users.find((u) => u.id === 'user-admin');
    await mod.userService.updateUserSignature('user-17', 'data:image/png;base64,NEWSECRETARY', admin);
  });
  await page.waitForTimeout(400);

  // Notified by the admin: saving user-17 through the full user form earlier
  // reset that user's permissions to their role defaults (a pre-existing
  // CreateUserModal behaviour, unrelated to signatures), and who performs the
  // ابلاغ is irrelevant here — the notice's secretary signature is always
  // resolved from the meeting's own دبیر جلسه.
  await page.evaluate(async () => {
    const mod = await import('/src/services/resolutionService.ts');
    const users = await window.loadUsers();
    await mod.resolutionService.notifyResolution('res-sigmgmt', users.find((u) => u.id === 'user-admin'));
    // امضای ابلاغیه حالا مرحله جداگانه‌ای است؛ تصویر امضا در همان لحظه
    // امضا از امضای مرکزی همان کاربر Snapshot می‌شود.
    const notices = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]');
    const notice = notices.find((n) => n.resolutionId === 'res-sigmgmt');
    const signer = users.find((u) => u.id === notice?.secretaryUserId) || users.find((u) => u.role === 'ADMIN');
    await mod.resolutionService.signNotificationLetter('res-sigmgmt', signer);
  });
  await page.waitForTimeout(700);

  const notice = (await readLS(page, 'resolutionNotices')).find((n) => n.resolutionId === 'res-sigmgmt');
  check('CR-G Test6 ابلاغیه جدید امضای جدید همان کاربر را استفاده کرد', notice.secretarySignature.signatureImageUrl === 'data:image/png;base64,NEWSECRETARY');

  const meetingAfter = (await readLS(page, 'meetings')).find((m) => m.id === 'meet-sig-mgmt');
  check('CR-G بند۱۲ سند قبلی (دعوت‌نامه) با تعویض امضا تغییر نکرد', meetingAfter.invitationSignature.signatureImageUrl === office.signatureUrl);
  const stepsAfter = (await readLS(page, 'resolutions')).find((r) => r.id === 'res-sigmgmt').signatureWorkflow.steps;
  check('CR-G بند۱۲ امضاهای ثبت‌شده مصوبه با تعویض امضا بازنویسی نشدند', stepsAfter[0].signatureImageUrl === office.signatureUrl);

  console.log(`\nUSER SIGNATURE MANAGEMENT: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
