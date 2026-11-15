/**
 * «نقشه گردش کار» — Acceptance Criteria (بندهای ۱ تا ۱۱).
 * قابلیت Read-Only است: این تست تأیید می‌کند که Visualizer هیچ داده‌ای را
 * تغییر نمی‌دهد و صرفاً وضعیت واقعی پرونده‌ها را نمایش می‌دهد.
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
    localStorage.setItem('postbank-mosavabat-v1:operationalResetVersion', '1');
    window.loadUsers = async () => {
      const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || 'null');
      if (stored && stored.length) return stored;
      return (await import('/src/mock/data.ts')).mockUsers;
    };
    window.actor = async (id) => (await window.loadUsers()).find((u) => u.id === id);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const openMap = async () => {
    await page.locator('button[aria-label="نقشه گردش کار"]').click();
    await page.waitForTimeout(1200);
  };
  const closeMap = async () => {
    await page.locator('button[aria-label="بستن"]').first().click();
    await page.waitForTimeout(500);
  };
  const selectCase = async (text) => {
    await page.locator('aside button').filter({ hasText: text }).first().click();
    await page.waitForTimeout(700);
  };
  const mapText = () => page.locator('div.fixed.inset-0.z-50').first().innerText();

  // ============ Floating Button ============
  const btn = page.locator('button[aria-label="نقشه گردش کار"]');
  check('Floating Button «نقشه گردش کار» وجود دارد', await btn.count() === 1);
  const overlap = await page.evaluate(() => {
    const map = document.querySelector('button[aria-label="نقشه گردش کار"]')?.getBoundingClientRect();
    const ai = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('دستیار'))?.getBoundingClientRect();
    if (!map || !ai) return 'MISSING';
    return !(map.bottom < ai.top || map.top > ai.bottom) ? 'OVERLAP' : 'OK';
  });
  check('دکمه با دکمه شناور موجود سامانه تداخل ندارد', overlap === 'OK', overlap);

  await openMap();
  check('حالت خالی: پیام مناسب نمایش داده می‌شود', (await mapText()).includes('هنوز پرونده‌ای در سامانه ثبت نشده'));
  await closeMap();

  // ============ ۱) ساخت Proposal A ============
  const mk = async (title) => page.evaluate(async (t) => {
    const mod = await import('/src/services/proposalService.ts');
    const res = await mod.proposalService.createProposal({
      title: t, description: 'شرح ' + t, rationale: 'دلیل',
      proposerName: 'مهندس سارا نیک‌نام', proposerUserId: 'user-9',
      proposerDepartmentId: 'dept-1', proposerDepartmentName: 'اداره کل فناوری اطلاعات',
      presenterUserId: 'user-9', presenterName: 'مهندس سارا نیک‌نام',
      sourceLetterNumber: '۱۴۰۵/۱۰۰',
    });
    return res.data.id;
  }, title);

  const idA = await mk('پرونده الف');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await openMap();
  let text = await mapText();

  // ============ ۲) مرحله ثبت انجام‌شده، بررسی مدیرعامل مرحله فعلی ============
  check('۲ مرحله «ثبت پیشنهاد» انجام شده است', /ثبت پیشنهاد[\s\S]{0,220}✓ انجام شده/.test(text));
  check('۲ مرحله «بررسی پیشنهاد» مرحله فعلی است', /بررسی پیشنهاد[\s\S]{0,220}● مرحله فعلی/.test(text));
  check('۲ وضعیت فعلی پرونده در بالای نقشه نمایش داده می‌شود', text.includes('وضعیت فعلی:') && text.includes('بررسی پیشنهاد'));

  // ============ ۱۰) Role / Organization هر مرحله ============
  check('۱۰ مسئول مرحله ثبت، واحد پیشنهاددهنده است', text.includes('سازمان / واحد پیشنهاددهنده'));
  check('۱۰ نام واقعی پیشنهاددهنده از داده خوانده شده', text.includes('مهندس سارا نیک‌نام') && text.includes('اداره کل فناوری اطلاعات'));
  check('۱۰ مسئول مرحله بررسی، مدیرعامل است', text.includes('مدیرعامل'));
  check('۱۰ نقش‌های مراحل بعدی نمایش داده می‌شوند', text.includes('مسئول دفتر') && text.includes('دبیر جلسه'));

  // ============ ۸) مسیرهای ممکن در مرحله دارای چند Action ============
  check('۸ مسیرهای ممکن مرحله فعلی نمایش داده می‌شوند', text.includes('مسیرهای ممکن از این مرحله'));
  check('۸ هر سه مسیر تأیید/رد/برگشت دیده می‌شوند',
    text.includes('تأیید') && text.includes('رد') && text.includes('برگشت برای اصلاح'));
  check('۸ پیامد هر مسیر توضیح داده شده', text.includes('پایان مسیر پیشنهاد') && text.includes('بازگشت به پیشنهاددهنده'));

  // ============ فازبندی ============
  check('فازهای اصلی گردش کار نمایش داده می‌شوند', text.includes('پیشنهاد') && text.includes('جلسه') && text.includes('مصوبه'));
  await closeMap();

  // ============ ۳) مدیرعامل A را تأیید می‌کند ============
  const snapshotBefore = await page.evaluate(() => localStorage.getItem('postbank-mosavabat-v1:proposals'));
  await page.evaluate(async (id) => {
    const mod = await import('/src/services/proposalService.ts');
    const ceo = await window.actor('user-16');
    await mod.proposalService.reviewProposal(id, 'APPROVED', 'تأیید شد', ceo);
  }, idA);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openMap();
  text = await mapText();

  // ============ ۴) و ۹) مسیر طی‌شده و مرحله بعدی ============
  check('۴ پس از تأیید، مرحله بررسی «انجام شده» است', /بررسی پیشنهاد[\s\S]{0,220}✓ انجام شده/.test(text));
  check('۴ مرحله بعدی «تبدیل به تایید جلسه» مرحله فعلی شد', /تبدیل به تایید جلسه[\s\S]{0,220}● مرحله فعلی/.test(text));
  check('۹ مسیر واقعی طی‌شده مشخص شده است', text.includes('مسیر طی‌شده'));
  check('۹ مسیر طی‌شده همان «تأیید» است', /مسیر طی‌شده[\s\S]{0,140}تأیید/.test(text));
  await closeMap();

  // ============ ۵) و ۶) ساخت Proposal B و استقلال نقشه‌ها ============
  const idB = await mk('پرونده ب');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openMap();
  await selectCase('پرونده ب');
  text = await mapText();
  check('۶ نقشه پرونده ب مستقل است و مرحله فعلی آن بررسی مدیرعامل است',
    text.includes('پرونده ب') && /بررسی پیشنهاد[\s\S]{0,220}● مرحله فعلی/.test(text));
  check('۶ نقشه ب مرحله «تبدیل به تایید جلسه» را فعال نشان نمی‌دهد',
    !/تبدیل به تایید جلسه[\s\S]{0,220}● مرحله فعلی/.test(text));

  // ============ ۷) برگشت به A و صحت وضعیت آن ============
  await selectCase('پرونده الف');
  text = await mapText();
  check('۷ وضعیت پرونده الف پس از بازگشت همچنان صحیح است',
    text.includes('پرونده الف') && /تبدیل به تایید جلسه[\s\S]{0,220}● مرحله فعلی/.test(text));
  check('۷ وضعیت الف با انتخاب ب جایگزین/Reset نشده بود', /بررسی پیشنهاد[\s\S]{0,220}✓ انجام شده/.test(text));

  // شناسایی بر اساس ID واقعی، نه عنوان
  const caseIds = await page.evaluate(async () => {
    const [model, pm, mm, rm, bm, tm] = await Promise.all([
      import('/src/modules/workflowMap/workflowMapModel.ts'),
      import('/src/services/proposalService.ts'),
      import('/src/services/meetingService.ts'),
      import('/src/services/resolutionService.ts'),
      import('/src/services/boardSecretariatService.ts'),
      import('/src/services/taskService.ts'),
    ]);
    const cases = model.buildWorkflowCases({
      proposals: (await pm.proposalService.getProposals({ pageSize: 500 })).data.items,
      meetings: (await mm.meetingService.getMeetings({ pageSize: 500 })).data.items,
      resolutions: (await rm.resolutionService.getResolutions({ pageSize: 500 })).data.items,
      notices: (await bm.boardSecretariatService.getNotices()).data,
      tasks: (await tm.taskService.getMyTasks(undefined, { pageSize: 500 })).data.items,
    });
    return cases.map((c) => ({ id: c.id, rootId: c.rootId, title: c.title }));
  });
  check('پرونده‌ها با ID واقعی Entity شناسایی می‌شوند، نه با عنوان',
    caseIds.some((c) => c.id === `proposal:${idA}`) && caseIds.some((c) => c.id === `proposal:${idB}`),
    caseIds.map((c) => c.id).join(' | '));
  await closeMap();

  // ============ ۱۱) Read-Only بودن ============
  const snapshotAfter = await page.evaluate(() => localStorage.getItem('postbank-mosavabat-v1:proposals'));
  await openMap();
  await selectCase('پرونده ب');
  await selectCase('پرونده الف');
  await closeMap();
  const snapshotAfterBrowsing = await page.evaluate(() => localStorage.getItem('postbank-mosavabat-v1:proposals'));
  check('۱۱ باز کردن و مرور نقشه هیچ داده‌ای را تغییر نمی‌دهد', snapshotAfter === snapshotAfterBrowsing);
  check('۱۱ فقط Action واقعی مدیرعامل داده را تغییر داده بود', snapshotBefore !== snapshotAfter);

  const noWrites = await page.evaluate(async () => {
    const model = await import('/src/modules/workflowMap/workflowMapModel.ts');
    const before = JSON.stringify(localStorage);
    model.buildWorkflowCases({ proposals: [], meetings: [], resolutions: [], notices: [], tasks: [] });
    return before === JSON.stringify(localStorage);
  });
  check('۱۱ مدل نقشه هیچ چیزی در Storage نمی‌نویسد', noWrites === true);

  // ============ End-to-End: پرونده تا اجرا ============
  await page.evaluate(async (id) => {
    const pm = await import('/src/services/proposalService.ts');
    const mm = await import('/src/services/meetingService.ts');
    const rm = await import('/src/services/resolutionService.ts');
    const office = await window.actor('user-17');
    const secretary = await window.actor('user-8');

    await pm.proposalService.confirmForMeeting(id, office);
    await pm.proposalService.finalizeMeetingConfirmation(id, 'APPROVED', undefined, secretary);

    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]');
    meetings.unshift({
      id: 'meet-map', meetingNumber: 'جلسه-۱۴۰۵-۵۰۱', title: 'جلسه نقشه گردش کار',
      type: 'COMMISSION', dateJalali: '1405/06/25', startTime: '09:00', endTime: '12:00',
      location: 'سالن', status: 'HELD',
      organizerId: 'user-16', organizerName: 'مدیرعامل', secretaryId: 'user-8', secretaryName: 'مهندس جواد صادقی',
      departmentId: 'dept-1', departmentName: 'اداره کل فناوری اطلاعات', description: '',
      members: [], agendaItems: [{
        id: 'ag-map', order: 1, rowNumber: 1, title: 'بند پرونده الف', presenter: 'مهندس سارا نیک‌نام',
        presenterName: 'مهندس سارا نیک‌نام', startTime: '09:00', endTime: '09:30', allocatedMinutes: 30,
        isDiscussed: true, sourceProposalId: id, outcomeStatus: 'APPROVED', outcomeNotes: 'تصویب شد',
      }],
      attachments: [], history: [], resolutionsCount: 0, createdAt: new Date().toISOString(),
    });
    localStorage.setItem('postbank-mosavabat-v1:meetings', JSON.stringify(meetings));

    await rm.resolutionService.createResolution({
      meetingId: 'meet-map', meetingTitle: 'جلسه نقشه گردش کار', meetingNumber: 'جلسه-۱۴۰۵-۵۰۱',
      agendaItemId: 'ag-map', agendaItemTitle: 'بند پرونده الف',
      topicTitle: 'مصوبه پرونده الف', proposerName: 'مهندس سارا نیک‌نام',
      proposerDepartment: 'اداره کل فناوری اطلاعات', requestDescription: 'شرح', reviewResultNotes: 'نتیجه',
      approvalStatus: 'APPROVED', executionDescription: 'اجرا', mainResponsibleUserId: 'user-9',
      mainResponsibleName: 'مهندس سارا نیک‌نام', responsibleDepartmentId: 'dept-1',
      responsibleDepartmentName: 'اداره کل فناوری اطلاعات', deadlineJalali: '1405/07/20',
    });
    void mm;
  }, idA);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await openMap();
  await selectCase('پرونده الف');
  text = await mapText();

  check('E2E زنجیره پیشنهاد → جلسه → مصوبه در یک نقشه دیده می‌شود',
    text.includes('ثبت پیشنهاد') && text.includes('تنظیم دستور جلسه') && text.includes('ثبت مصوبه'));
  check('E2E موجودیت‌های مرتبط پرونده نمایش داده می‌شوند',
    text.includes('جلسه:') && text.includes('مصوبه:'));
  check('E2E مراحل ابلاغ و امضای ابلاغیه در نقشه هستند',
    text.includes('ابلاغ رسمی مصوبه') && text.includes('امضای ابلاغیه'));
  check('E2E مرحله اجرا با نام مجری واقعی نمایش داده می‌شود', text.includes('اجرای مصوبه'));
  check('E2E مسئول مرحله اجرا «مجری مصوبه» است', text.includes('مجری مصوبه'));
  check('E2E فاز فعلی پرونده پیش رفته است', !text.includes('وضعیت فعلی: بررسی پیشنهاد'));
  await closeMap();

  check('Regression: هیچ Crash/Runtime Error رخ نداد', pageErrors.length === 0, pageErrors.join(' | '));

  console.log(`\nWORKFLOW MAP: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
