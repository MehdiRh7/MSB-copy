/**
 * Reset داده‌های عملیاتی — سناریوی تست خواسته‌شده در Change Request.
 * بررسی می‌کند که داده فرآیندی کاملاً خالی باشد و در عین حال کاربران،
 * نقش‌ها، مجوزها، ساختار سازمانی و تنظیمات پایه دست‌نخورده بمانند.
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

const P = 'postbank-mosavabat-v1:';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => { pageErrors.push(String(e)); console.log('PAGEERROR:', String(e)); });
  page.on('dialog', async (d) => { await d.accept(); });

  const open = async (label) => {
    await page.locator(`aside button:has-text("${label}")`).first().click();
    await page.waitForTimeout(1000);
  };
  const switchUser = async (label) => {
    await page.locator('button:has-text("کاربر:")').first().click();
    await page.waitForTimeout(300);
    await page.locator('div.absolute button').filter({ hasText: label }).first().click();
    await page.waitForTimeout(800);
  };

  // ============================================================
  // مرحله ۰ — شبیه‌سازی مرورگری که از قبل پر از داده Demo است
  // ============================================================
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((prefix) => {
    localStorage.clear();
    // داده عملیاتی قدیمی
    localStorage.setItem(`${prefix}proposals`, JSON.stringify([{ id: 'old-prop', title: 'پیشنهاد قدیمی Demo', status: 'PENDING_CEO_REVIEW', proposerName: 'x', proposerDepartmentId: 'dept-1', proposerDepartmentName: 'd', presenterName: 'y', description: 'z', dateJalali: '1405/01/01', attachments: [], createdAt: new Date().toISOString() }]));
    localStorage.setItem(`${prefix}meetings`, JSON.stringify([{ id: 'old-meet', title: 'جلسه قدیمی Demo', meetingNumber: 'x', agendaItems: [], members: [], attachments: [], history: [] }]));
    localStorage.setItem(`${prefix}resolutions`, JSON.stringify([{ id: 'old-res', topicTitle: 'مصوبه قدیمی Demo', resolutionNumber: 'R-OLD', referrals: [], attachments: [] }]));
    localStorage.setItem(`${prefix}tasks`, JSON.stringify([{ id: 'old-task', resolutionId: 'old-res' }]));
    localStorage.setItem(`${prefix}approvals`, JSON.stringify([{ id: 'old-appr' }]));
    localStorage.setItem(`${prefix}activityLogs`, JSON.stringify([{ id: 'old-log', targetId: 'old-res', action: 'کار قدیمی' }]));
    localStorage.setItem(`${prefix}notifications`, JSON.stringify([{ id: 'old-notif', title: 'اعلان قدیمی' }]));
    localStorage.setItem(`${prefix}resolutionNotices`, JSON.stringify([{ id: 'old-notice' }]));
    localStorage.setItem(`${prefix}resolutionFollowUps`, JSON.stringify([{ id: 'old-fu' }]));
    localStorage.setItem(`${prefix}boardMinutes`, JSON.stringify([{ id: 'old-min' }]));
    localStorage.setItem(`${prefix}governanceAudit`, JSON.stringify([{ id: 'old-audit' }]));
    localStorage.setItem(`${prefix}outcomeLetters`, JSON.stringify([{ id: 'old-letter' }]));
    localStorage.setItem(`${prefix}archiveFolders`, JSON.stringify([{ id: 'old-folder', name: 'پوشه قدیمی' }]));
    localStorage.setItem(`${prefix}archiveItems`, JSON.stringify([{ id: 'old-item' }]));
    localStorage.setItem(`${prefix}notificationLetterSequence`, JSON.stringify(42));
    localStorage.setItem(`${prefix}smsMockLog`, JSON.stringify([{ id: 'old-sms' }]));
    // Master Data / تنظیمات که باید سالم بماند
    localStorage.setItem(`${prefix}customPositions`, JSON.stringify([{ id: 'pos-1', name: 'سمت سفارشی تست' }]));
    localStorage.setItem(`${prefix}orgInfo`, JSON.stringify({ name: 'سازمان تست', code: 'ORG-TEST' }));
    localStorage.setItem(`${prefix}calendars`, JSON.stringify([{ id: 'cal-x', name: 'تقویم تست' }]));
    localStorage.setItem(`${prefix}smsSettings`, JSON.stringify({ provider: 'KAVENEGAR', senderNumber: '3000', hasApiKey: true, isEnabled: true }));
    localStorage.setItem(`${prefix}ldapSettings`, JSON.stringify({ host: 'ldap.test.org', port: 636, hasBindPassword: true, isEnabled: true }));
    localStorage.setItem(`${prefix}isAuthenticated`, JSON.stringify(true));
    localStorage.setItem(`${prefix}currentUserId`, JSON.stringify('user-admin'));
    localStorage.setItem('app-theme', 'light');
  }, P);

  // ============================================================
  // مرحله ۱ — Refresh: Reset یک‌باره باید اجرا شود
  // ============================================================
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const storage = await page.evaluate((prefix) => {
    const get = (k) => localStorage.getItem(`${prefix}${k}`);
    return {
      operational: {
        proposals: get('proposals'), meetings: get('meetings'), resolutions: get('resolutions'),
        tasks: get('tasks'), approvals: get('approvals'), activityLogs: get('activityLogs'),
        notifications: get('notifications'), resolutionNotices: get('resolutionNotices'),
        resolutionFollowUps: get('resolutionFollowUps'), boardMinutes: get('boardMinutes'),
        governanceAudit: get('governanceAudit'), outcomeLetters: get('outcomeLetters'),
        archiveFolders: get('archiveFolders'), archiveItems: get('archiveItems'),
        notificationLetterSequence: get('notificationLetterSequence'), smsMockLog: get('smsMockLog'),
      },
      preserved: {
        customPositions: get('customPositions'), orgInfo: get('orgInfo'), calendars: get('calendars'),
        smsSettings: get('smsSettings'), ldapSettings: get('ldapSettings'),
        isAuthenticated: get('isAuthenticated'), currentUserId: get('currentUserId'),
        theme: localStorage.getItem('app-theme'),
      },
      marker: get('operationalResetVersion'),
    };
  }, P);

  // Key عملیاتی یا باید حذف شده باشد، یا اگر برنامه دوباره آن را نوشته،
  // باید خالی باشد (مثلاً AppContext هنگام بالا آمدن notifications خالی
  // را می‌نویسد). چیزی که مهم است: هیچ رکورد عملیاتی قبلی نمانده باشد.
  const isEmptyValue = (raw) => {
    if (raw === null) return true;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length === 0;
      if (typeof parsed === 'number') return parsed === 0;
      return false;
    } catch { return false; }
  };
  const leftover = Object.entries(storage.operational).filter(([, v]) => !isEmptyValue(v)).map(([k]) => k);
  check('۱ هیچ داده عملیاتی قبلی در LocalStorage نماند', leftover.length === 0, leftover.join('، '));
  const lostMaster = Object.entries(storage.preserved).filter(([, v]) => v === null).map(([k]) => k);
  check('۱ هیچ Key مربوط به Master/Auth/Settings پاک نشد', lostMaster.length === 0, lostMaster.join('، '));
  check('۱ تنظیمات پنل پیامکی دست‌نخورده ماند', JSON.parse(storage.preserved.smsSettings).senderNumber === '3000');
  check('۱ تنظیمات LDAP دست‌نخورده ماند', JSON.parse(storage.preserved.ldapSettings).host === 'ldap.test.org');
  check('۱ سمت سازمانی سفارشی دست‌نخورده ماند', JSON.parse(storage.preserved.customPositions)[0].name === 'سمت سفارشی تست');
  check('۱ اطلاعات سازمان دست‌نخورده ماند', JSON.parse(storage.preserved.orgInfo).code === 'ORG-TEST');
  check('۱ تقویم سازمانی دست‌نخورده ماند', JSON.parse(storage.preserved.calendars)[0].name === 'تقویم تست');
  check('۱ وضعیت ورود (Authentication) دست‌نخورده ماند', storage.preserved.isAuthenticated === 'true');
  check('۱ Marker ثبت شد تا Reset دوباره اجرا نشود', storage.marker === '1', String(storage.marker));

  // ============================================================
  // مرحله ۲ و ۳ — کاربران و Login
  // ============================================================
  await switchUser('مدیر سیستم');
  const sidebar = await page.locator('aside').first().innerText();
  check('۲ ورود با Admin کار می‌کند و منو بارگذاری شد', sidebar.includes('پیشخوان') && sidebar.includes('تنظیمات'));

  const userData = await page.evaluate(async () => {
    const mod = await import('/src/services/userService.ts');
    const res = await mod.userService.getUsers();
    const items = res.data;
    return {
      count: items.length,
      roles: Array.from(new Set(items.map((u) => u.role))).sort(),
      withPermissions: items.filter((u) => (u.permissions || []).length > 0).length,
      withSignature: items.filter((u) => u.signatureUrl).length,
      withDepartment: items.filter((u) => u.departmentId && u.departmentName).length,
      withOrganization: items.filter((u) => u.organizationId && u.organizationName).length,
      withTitle: items.filter((u) => u.title).length,
      admin: items.find((u) => u.role === 'ADMIN')?.fullName,
      ceo: items.find((u) => u.role === 'CEO')?.fullName,
    };
  });
  check('۳ کاربران قبلی موجودند', userData.count === 18, `${userData.count} کاربر`);
  check('۴ نقش‌ها حفظ شدند', userData.roles.length >= 5, userData.roles.join('، '));
  check('۴ مجوزهای کاربران حفظ شدند', userData.withPermissions === userData.count, `${userData.withPermissions}/${userData.count}`);
  check('۵ ارتباط کاربر با واحد سازمانی حفظ شد', userData.withDepartment === userData.count);
  check('۵ ارتباط کاربر با سازمان حفظ شد', userData.withOrganization === userData.count);
  check('۵ سمت سازمانی کاربران حفظ شد', userData.withTitle === userData.count);
  // امضای پروفایل توسط مدیر سیستم روی رکورد کاربر ذخیره می‌شود (Seed از
  // ابتدا امضا ندارد). تست واقعی: امضای ذخیره‌شده باید از Reset عبور کند.
  const signatureSurvived = await page.evaluate(async () => {
    const mod = await import('/src/services/dataReset.ts');
    const key = 'postbank-mosavabat-v1:users';
    // اگر کاربران هنوز در Storage نوشته نشده‌اند، از Seed برداشته می‌شوند.
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    const users = stored && stored.length ? stored : (await import('/src/mock/data.ts')).mockUsers.map((u) => ({ ...u }));
    users[0].signatureUrl = 'data:image/png;base64,PROFILESIGNATURE';
    localStorage.setItem(key, JSON.stringify(users));
    mod.resetOperationalData();
    const after = JSON.parse(localStorage.getItem(key) || '[]');
    return after[0]?.signatureUrl;
  });
  check('تصویر امضای پروفایل کاربر از Reset عبور می‌کند و حذف نمی‌شود',
    signatureSurvived === 'data:image/png;base64,PROFILESIGNATURE', String(signatureSurvived));

  const masterData = await page.evaluate(async () => {
    const data = await import('/src/mock/data.ts');
    return {
      departments: data.mockDepartments.length,
      organizations: data.mockOrganizations.length,
      users: data.mockUsers.length,
      proposals: data.mockProposals.length,
      meetings: data.mockMeetings.length,
      resolutions: data.mockResolutions.length,
      tasks: data.mockTasks.length,
      approvals: data.mockApprovals.length,
      activityLogs: data.mockActivityLogs.length,
      notifications: data.mockNotifications.length,
      archiveFolders: data.mockArchiveFolders.length,
      archiveItems: data.mockArchiveItems.length,
      loginHistory: data.mockLoginHistory.length,
    };
  });
  check('۵ ادارات/واحدها در Seed حفظ شدند', masterData.departments === 7, String(masterData.departments));
  check('۵ سازمان‌ها در Seed حفظ شدند', masterData.organizations === 4, String(masterData.organizations));
  check('۳ کاربران در Seed حفظ شدند', masterData.users === 18, String(masterData.users));
  const seedOperational = ['proposals', 'meetings', 'resolutions', 'tasks', 'approvals', 'activityLogs', 'notifications', 'archiveFolders', 'archiveItems', 'loginHistory'];
  const nonEmptySeeds = seedOperational.filter((k) => masterData[k] !== 0);
  check('Seed Data عملیاتی در Source Code خالی شد', nonEmptySeeds.length === 0, nonEmptySeeds.join('، '));

  // ============================================================
  // مرحله ۶ تا ۹ — لیست‌ها و کارتابل‌ها باید خالی باشند
  // ============================================================
  await open('مصوبات پیشنهادی');
  let body = await page.locator('main').first().innerText();
  check('۶ لیست مصوبات پیشنهادی خالی است', !body.includes('پیشنهاد قدیمی Demo'), body.slice(0, 80).replace(/\n/g, ' '));

  await open('مدیریت جلسات');
  body = await page.locator('main').first().innerText();
  const meetingRows = await page.locator('main tbody tr').count();
  check('۷ لیست جلسات خالی است', !body.includes('جلسه قدیمی Demo') && meetingRows === 0, `${meetingRows} ردیف`);

  await open('بانک مصوبات');
  body = await page.locator('main').first().innerText();
  check('۸ لیست مصوبات خالی است', !body.includes('مصوبه قدیمی Demo'));

  await open('کارتابل ابلاغ');
  body = await page.locator('main').first().innerText();
  check('کارتابل ابلاغ خالی است', /موردی|خالی|نیست/.test(body), body.slice(0, 80).replace(/\n/g, ' '));

  await open('بایگانی');
  body = await page.locator('main').first().innerText();
  check('بایگانی از پرونده‌های قبلی خالی است', !body.includes('پوشه قدیمی'));

  const notifCount = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:notifications') || '[]').length);
  check('۹ Notification Center خالی است', notifCount === 0, String(notifCount));

  // داشبورد
  await open('داشبورد مدیریتی');
  await page.waitForTimeout(1200);
  const kpis = await page.evaluate(async () => {
    const mod = await import('/src/services/reportService.ts');
    const res = await mod.reportService.getDashboardKPIs();
    return res.data;
  });
  const kpiValues = Object.entries(kpis).filter(([, v]) => typeof v === 'number');
  const nonZero = kpiValues.filter(([, v]) => v !== 0).map(([k, v]) => `${k}=${v}`);
  check('داشبورد: همه شمارنده‌های عملیاتی صفر هستند', nonZero.length === 0, nonZero.join('، '));

  // ============================================================
  // مرحله ۱۰ — ثبت اولین داده عملیاتی جدید
  // ============================================================
  await switchUser('مهندس سارا نیک‌نام');
  await open('مصوبات پیشنهادی');
  await page.locator('main button').filter({ hasText: 'ثبت مصوبه پیشنهادی جدید' }).first().click();
  await page.waitForTimeout(800);
  await page.locator('input[placeholder*="دوره آموزشی"]').first().fill('اولین پیشنهاد سناریوی جدید');
  await page.locator('textarea').first().fill('شرح اولین پیشنهاد سناریوی Demo جدید');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(1400);

  let stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:proposals') || '[]'));
  check('۱۰ اولین پیشنهاد جدید ثبت شد', stored.length === 1, `${stored.length} پیشنهاد`);
  check('۱۰ پیشنهاد جدید همان چیزی است که ثبت کردیم', stored[0]?.title === 'اولین پیشنهاد سناریوی جدید', stored[0]?.title);
  check('۱۰ Workflow پیشنهاد مثل قبل کار می‌کند', stored[0]?.status === 'PENDING_CEO_REVIEW', stored[0]?.status);
  check('۱۰ شماره پیشنهاد از ۱ شروع شد', String(stored[0]?.proposalNumber || '').includes('۱'), stored[0]?.proposalNumber);

  // ============================================================
  // مرحله ۱۱ — Refresh: داده جدید بماند، داده قدیمی برنگردد
  // ============================================================
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:proposals') || '[]'));
  check('۱۱ پس از Refresh پیشنهاد جدید باقی ماند', stored.length === 1 && stored[0].title === 'اولین پیشنهاد سناریوی جدید', `${stored.length}`);
  check('۱۱ پس از Refresh داده Demo قدیمی برنگشت', !stored.some((p) => p.title === 'پیشنهاد قدیمی Demo'));

  const afterRefresh = await page.evaluate(() => ({
    meetings: JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]').length,
    resolutions: JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]').length,
  }));
  check('۱۱ جلسات و مصوبات پس از Refresh همچنان خالی‌اند',
    afterRefresh.meetings === 0 && afterRefresh.resolutions === 0,
    `meetings=${afterRefresh.meetings} resolutions=${afterRefresh.resolutions}`);

  // Reset نباید دوباره اجرا شود و داده کاربر را پاک کند
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:proposals') || '[]'));
  check('Reset فقط یک‌بار اجرا می‌شود و داده جدید کاربر را پاک نمی‌کند', stored.length === 1);

  check('Regression: هیچ Crash/Runtime Error رخ نداد', pageErrors.length === 0, pageErrors.join(' | '));

  console.log(`\nCLEAN SLATE RESET: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
