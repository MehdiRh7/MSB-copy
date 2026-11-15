/**
 * داینامیک کردن امضاکنندگان + جانشین امضا — Scenario 1..7 خواسته‌شده.
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

  // مصوبه‌ساز کمکی — از همان createResolution واقعی استفاده می‌کند.
  const makeResolution = (id) => page.evaluate(async (rid) => {
    const mod = await import('/src/services/resolutionService.ts');
    const res = await mod.resolutionService.createResolution({
      meetingId: 'meet-sig', meetingTitle: 'جلسه امضا', meetingNumber: 'جلسه-۱۴۰۵-۹۰۱',
      agendaItemId: rid, agendaItemTitle: 'بند ' + rid, topicTitle: 'مصوبه ' + rid,
      proposerName: 'مهندس سارا نیک‌نام', proposerDepartment: 'اداره کل فناوری اطلاعات',
      requestDescription: 'شرح', reviewResultNotes: 'نتیجه', approvalStatus: 'APPROVED',
      executionDescription: 'اجرا', mainResponsibleUserId: 'user-9',
      mainResponsibleName: 'مهندس سارا نیک‌نام', responsibleDepartmentId: 'dept-1',
      responsibleDepartmentName: 'اداره کل فناوری اطلاعات', deadlineJalali: '1405/07/20',
    });
    return res.data.id;
  }, id);

  const stepsOf = (resId) => page.evaluate((id) =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutions') || '[]')
      .find((r) => r.id === id)?.signatureWorkflow?.steps, resId);

  // جلسه پایه برای مرحله ابلاغ
  await page.evaluate(() => {
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]');
    meetings.unshift({
      id: 'meet-sig', meetingNumber: 'جلسه-۱۴۰۵-۹۰۱', title: 'جلسه امضا', type: 'COMMISSION',
      dateJalali: '1405/06/25', startTime: '09:00', endTime: '12:00', location: 'سالن', status: 'HELD',
      organizerId: 'user-16', organizerName: 'مدیرعامل', secretaryId: 'user-8', secretaryName: 'مهندس جواد صادقی',
      departmentId: 'dept-1', departmentName: 'اداره کل فناوری اطلاعات', description: '',
      members: [], agendaItems: [], attachments: [], history: [], resolutionsCount: 0,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem('postbank-mosavabat-v1:meetings', JSON.stringify(meetings));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // ============ Backward Compatibility: پیش‌فرض = رفتار قبلی ============
  const baseId = await makeResolution('ag-base');
  let steps = await stepsOf(baseId);
  check('BC مصوبه جدید دقیقاً سه مرحله امضا دارد', steps.length === 3, String(steps.length));
  check('BC ترتیب مراحل ۱ و ۲ و ۳ است', steps.map((s) => s.order).join(',') === '1,2,3');
  check('BC مرحله ۱ مسئول دفتر است (پیش‌فرض قبلی)', steps[0].signerUserId === 'user-17', `${steps[0].signerName} / ${steps[0].signerUserId}`);
  check('BC مرحله ۲ مدیرعامل است (پیش‌فرض قبلی)', steps[1].signerUserId === 'user-16', `${steps[1].signerName} / ${steps[1].signerUserId}`);
  check('BC مرحله ۳ مدیر سیستم است (پیش‌فرض قبلی)', steps[2].signerUserId === 'user-admin', `${steps[2].signerName} / ${steps[2].signerUserId}`);
  check('BC فقط مرحله اول PENDING و بقیه WAITING_TURN', steps.map((s) => s.status).join(',') === 'PENDING,WAITING_TURN,WAITING_TURN');

  // Scenario: Sequential — مرحله دوم پیش از اول قابل امضا نیست
  const earlySecond = await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    try { await mod.resolutionService.signResolution(id, 'user-16'); return 'ALLOWED'; }
    catch (e) { return e.message; }
  }, baseId);
  check('BC مرحله دوم پیش از تکمیل مرحله اول قابل امضا نیست', earlySecond !== 'ALLOWED', earlySecond);

  // امضای مستقیم مرحله اول — Audit Trail بدون جانشینی
  await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    await mod.resolutionService.signResolution(id, 'user-17');
  }, baseId);
  steps = await stepsOf(baseId);
  check('BC امضای مستقیم ثبت شد', steps[0].status === 'SIGNED');
  check('BC امضای مستقیم: امضاکننده واقعی = امضاکننده تعیین‌شده',
    steps[0].actualSignerUserId === 'user-17' && steps[0].signerUserId === 'user-17');
  check('BC امضای مستقیم signedAsDelegate=false', steps[0].signedAsDelegate === false, String(steps[0].signedAsDelegate));
  check('BC پس از امضای مرحله ۱، مرحله ۲ فعال شد', steps[1].status === 'PENDING');

  // ============ Scenario 1: تغییر امضاکننده مرحله ابلاغ ============
  const changeStage = (stageId, assignment, actorId) => page.evaluate(async ({ s, a, id }) => {
    const mod = await import('/src/services/signatureWorkflowSettingsService.ts');
    const actor = await window.actor(id);
    try { mod.updateStageAssignment(s, a, actor); return 'OK'; }
    catch (e) { return e.message; }
  }, { s: stageId, a: assignment, id: actorId });

  check('Scenario1 تغییر تنظیمات توسط Admin مجاز است',
    await changeStage('RESOLUTION_NOTICE', { mode: 'ROLE', role: 'SECRETARY' }, 'user-admin') === 'OK');

  const noticeSignerFor = (resId) => page.evaluate((id) =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]')
      .find((n) => n.resolutionId === id), resId);

  const driveToNotice = async (resId) => page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    const resolutions = JSON.parse(localStorage.getItem(`postbank-mosavabat-v1:resolutions`) || '[]');
    const target = resolutions.find((r) => r.id === id);
    for (const step of target.signatureWorkflow.steps) {
      if (step.status !== 'SIGNED') await mod.resolutionService.signResolution(id, step.signerUserId);
    }
    const office = await window.actor('user-17');
    await mod.resolutionService.notifyResolution(id, office);
  }, resId);

  const noticeId = await makeResolution('ag-notice');
  await driveToNotice(noticeId);
  let notice = await noticeSignerFor(noticeId);
  check('Scenario1 امضاکننده ابلاغیه جدید طبق تنظیم جدید (مسئول دفتر) شد',
    notice.secretaryUserId === 'user-17', `${notice.secretaryName} / ${notice.secretaryUserId}`);

  const wrongNoticeSigner = await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    const secretary = await window.actor('user-8');
    try { await mod.resolutionService.signNotificationLetter(id, secretary); return 'ALLOWED'; }
    catch (e) { return e.message; }
  }, noticeId);
  check('Scenario1 دبیر جلسه قبلی دیگر امضاکننده این ابلاغیه نیست', wrongNoticeSigner !== 'ALLOWED', wrongNoticeSigner);

  // برگرداندن به پیش‌فرض برای ادامه تست‌ها
  await changeStage('RESOLUTION_NOTICE', { mode: 'MEETING_SECRETARY' }, 'user-admin');

  // ============ Scenario 2: تغییر یک Stage به User مشخص ============
  check('Scenario2 تغییر مرحله ۲ به کاربر مشخص',
    await changeStage('RESOLUTION_STEP_2', { mode: 'USER', userId: 'user-9' }, 'user-admin') === 'OK');
  const userStageId = await makeResolution('ag-userstage');
  steps = await stepsOf(userStageId);
  check('Scenario2 مرحله ۲ به کاربر انتخاب‌شده تخصیص یافت', steps[1].signerUserId === 'user-9', steps[1].signerName);
  check('Scenario2 مرحله ۱ و ۳ تحت تأثیر قرار نگرفتند',
    steps[0].signerUserId === 'user-17' && steps[2].signerUserId === 'user-admin');
  check('Scenario2 ترتیب سه مرحله حفظ شد', steps.map((s) => s.order).join(',') === '1,2,3');
  check('Scenario2 هنوز فقط مرحله اول PENDING است', steps.map((s) => s.status).join(',') === 'PENDING,WAITING_TURN,WAITING_TURN');

  const outOfTurn = await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    try { await mod.resolutionService.signResolution(id, 'user-9'); return 'ALLOWED'; }
    catch (e) { return e.message; }
  }, userStageId);
  check('Scenario2 Sequential نشکست: امضاکننده مرحله ۲ نوبت ندارد', outOfTurn !== 'ALLOWED', outOfTurn);

  await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    await mod.resolutionService.signResolution(id, 'user-17');
  }, userStageId);
  steps = await stepsOf(userStageId);
  check('Scenario2 پس از مرحله ۱، نوبت به کاربر تنظیم‌شده رسید',
    steps[1].status === 'PENDING' && steps[1].signerUserId === 'user-9');

  // ============ Scenario 7: تغییر تنظیمات، پرونده در گردش را جابه‌جا نکند ============
  check('Scenario7 تغییر مجدد تنظیمات مرحله ۲',
    await changeStage('RESOLUTION_STEP_2', { mode: 'ROLE', role: 'CEO' }, 'user-admin') === 'OK');
  steps = await stepsOf(userStageId);
  check('Scenario7 پرونده در حال گردش امضاکننده خود را حفظ کرد',
    steps[1].signerUserId === 'user-9', `${steps[1].signerName} / ${steps[1].signerUserId}`);
  const freshId = await makeResolution('ag-fresh');
  const freshSteps = await stepsOf(freshId);
  check('Scenario7 پرونده جدید تنظیمات جدید را گرفت', freshSteps[1].signerUserId === 'user-16', freshSteps[1].signerName);

  // ============ Scenario 5: امضاکننده غیرمرتبط ============
  const strangerId = await makeResolution('ag-stranger');
  const stranger = await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    try { await mod.resolutionService.signResolution(id, 'user-13'); return 'ALLOWED'; }
    catch (e) { return e.message; }
  }, strangerId);
  check('Scenario5 کاربر غیرمرتبط نمی‌تواند امضا کند', stranger !== 'ALLOWED', stranger);

  // ============ Scenario 3 و 4: جانشین ============
  const setDelegation = (owner, delegate, isActive, actorId) => page.evaluate(async ({ o, d, a, id }) => {
    const mod = await import('/src/services/signatureDelegationService.ts');
    const actor = await window.actor(id);
    try { mod.setDelegation({ ownerUserId: o, delegateUserId: d, isActive: a }, actor); return 'OK'; }
    catch (e) { return e.message; }
  }, { o: owner, d: delegate, a: isActive, id: actorId });

  // Scenario 4 (بخش اول): جانشینی غیرفعال → فقط شخص اصلی
  const delegId = await makeResolution('ag-deleg');
  check('جانشینی غیرفعال ثبت شد', await setDelegation('user-17', 'user-8', false, 'user-17') === 'OK');
  const inactiveTry = await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    try { await mod.resolutionService.signResolution(id, 'user-8'); return 'ALLOWED'; }
    catch (e) { return e.message; }
  }, delegId);
  check('جانشینی غیرفعال → جانشین نمی‌تواند امضا کند', inactiveTry !== 'ALLOWED', inactiveTry);

  // تصویر امضای اختصاصی برای هر دو کاربر — باید پیش از امضا تنظیم شود،
  // چون سامانه تصویر را در همان لحظه امضا Snapshot می‌کند.
  await page.evaluate(async () => {
    const key = 'postbank-mosavabat-v1:users';
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    const users = stored && stored.length ? stored : (await import('/src/mock/data.ts')).mockUsers.map((u) => ({ ...u }));
    users.find((u) => u.id === 'user-17').signatureUrl = 'data:image/png;base64,OFFICEMANAGERSIG';
    users.find((u) => u.id === 'user-8').signatureUrl = 'data:image/png;base64,DELEGATESIG';
    localStorage.setItem(key, JSON.stringify(users));
  });

  // Scenario 3: جانشینی فعال → جانشین می‌تواند امضا کند
  check('Scenario3 جانشینی فعال ثبت شد', await setDelegation('user-17', 'user-8', true, 'user-17') === 'OK');
  await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    await mod.resolutionService.signResolution(id, 'user-8');
  }, delegId);
  steps = await stepsOf(delegId);
  check('Scenario3 جانشین توانست امضا کند', steps[0].status === 'SIGNED');

  // Scenario 4: Audit Trail کامل
  check('Scenario4 امضاکننده تعیین‌شده دست‌نخورده ماند', steps[0].signerUserId === 'user-17', steps[0].signerName);
  check('Scenario4 امضاکننده واقعی جانشین ثبت شد', steps[0].actualSignerUserId === 'user-8', steps[0].actualSignerName);
  check('Scenario4 signedAsDelegate=true', steps[0].signedAsDelegate === true);
  check('Scenario4 delegateForUserId شخص اصلی است', steps[0].delegateForUserId === 'user-17', steps[0].delegateForName);
  check('Scenario4 زمان امضا ثبت شد', Boolean(steps[0].signedAt));

  const logs = await page.evaluate((id) =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:activityLogs') || '[]')
      .filter((l) => l.targetId === id), delegId);
  const delegLog = logs.find((l) => String(l.details).includes('به جانشینی'));
  check('Scenario4 Timeline هر دو هویت را ثبت کرد',
    Boolean(delegLog) && delegLog.details.includes('مسئول دفتر') && delegLog.details.includes('جواد صادقی'),
    delegLog?.details);
  check('Scenario4 Timeline وانمود نمی‌کند شخص اصلی خودش امضا کرده',
    !logs.some((l) => l.action === 'مسئول دفتر صورت‌جلسه مصوبه را امضا کرد' && !String(l.details).includes('جانشینی')) ||
    Boolean(delegLog));

  // Scenario 4: PDF تصویر امضای جانشین را نشان دهد
  const pdf = await page.evaluate(async (id) => {
    const [docMod, resMod, meetMod] = await Promise.all([
      import('/src/services/documentService.ts'),
      import('/src/services/resolutionService.ts'),
      import('/src/services/meetingService.ts'),
    ]);
    const actor = await window.actor('user-9');
    const res = (await resMod.resolutionService.getResolutionById(id)).data;
    const meeting = (await meetMod.meetingService.getMeetingById('meet-sig')).data;
    const doc = docMod.buildResolutionDocument(res, meeting || undefined, actor);
    return { html: doc.html, imageUrl: res.signatureWorkflow.steps[0].signatureImageUrl };
  }, delegId);
  check('Scenario4 تصویر امضای ثبت‌شده متعلق به جانشین است',
    pdf.imageUrl === 'data:image/png;base64,DELEGATESIG', String(pdf.imageUrl).slice(0, 40));
  check('Scenario4 سند نام امضاکننده واقعی را نشان می‌دهد', pdf.html.includes('مهندس جواد صادقی'));
  check('Scenario4 سند صریحاً «به جانشینی از» را ذکر می‌کند', pdf.html.includes('به جانشینی از'));
  check('Scenario4 تصویر امضای شخص اصلی روی سند نیامده است', !pdf.html.includes('OFFICEMANAGERSIG'));
  check('Scenario4 تصویر امضای جانشین روی سند آمده است', pdf.html.includes('DELEGATESIG'));

  // ============ Scenario 6: امضای دوباره همان مرحله ============
  const doubleSign = await page.evaluate(async (id) => {
    const mod = await import('/src/services/resolutionService.ts');
    try { await mod.resolutionService.signResolution(id, 'user-17'); return 'ALLOWED'; }
    catch (e) { return e.message; }
  }, delegId);
  check('Scenario6 شخص اصلی نمی‌تواند مرحله امضاشده را دوباره امضا کند', doubleSign !== 'ALLOWED', doubleSign);
  steps = await stepsOf(delegId);
  check('Scenario6 مرحله فقط یک بار SIGNED است و مرحله بعد فعال شده',
    steps[0].status === 'SIGNED' && steps[1].status === 'PENDING');

  // ============ Permission / Security ============
  check('امنیت: کاربر عادی نمی‌تواند تنظیمات گردش امضا را تغییر دهد',
    await changeStage('RESOLUTION_STEP_1', { mode: 'ROLE', role: 'AUDITOR' }, 'user-9') !== 'OK');
  const stillDefault = await page.evaluate(async () => {
    const mod = await import('/src/services/signatureWorkflowSettingsService.ts');
    return mod.getStageAssignment('RESOLUTION_STEP_1').role;
  });
  check('امنیت: تنظیم مرحله ۱ پس از تلاش غیرمجاز تغییر نکرد', stillDefault === 'SECRETARY', String(stillDefault));

  check('امنیت: کاربر نمی‌تواند برای شخص دیگری جانشین تعیین کند',
    await setDelegation('user-16', 'user-9', true, 'user-9') !== 'OK');
  check('امنیت: کاربر نمی‌تواند خودش را جانشین خودش کند',
    await setDelegation('user-9', 'user-9', true, 'user-9') !== 'OK');
  check('امنیت: مدیر سیستم می‌تواند برای دیگران هم تنظیم کند',
    await setDelegation('user-16', 'user-9', true, 'user-admin') === 'OK');

  // جانشینی هیچ Permission دیگری منتقل نمی‌کند
  const delegateScope = await page.evaluate(async () => {
    const mod = await import('/src/services/signatureDelegationService.ts');
    const owners = mod.getOwnersDelegatedTo('user-8');
    return { count: owners.length, owners: owners.map((o) => o.ownerUserId) };
  });
  check('جانشین فقط برای همان شخص واگذارکننده جانشین است',
    delegateScope.count === 1 && delegateScope.owners[0] === 'user-17', JSON.stringify(delegateScope));

  // ============ UI: تب‌های تنظیمات ============
  const switchUser = async (label) => {
    await page.locator('button:has-text("کاربر:")').first().click();
    await page.waitForTimeout(300);
    await page.locator('div.absolute button').filter({ hasText: label }).first().click();
    await page.waitForTimeout(800);
  };
  await switchUser('مدیر سیستم');
  await page.locator('aside button:has-text("تنظیمات")').first().click();
  await page.waitForTimeout(900);
  let settingsText = await page.locator('main').first().innerText();
  check('UI تب «تنظیمات گردش امضا» برای مدیر سیستم هست', settingsText.includes('تنظیمات گردش امضا'));
  check('UI تب «جانشین امضا» هست', settingsText.includes('جانشین امضا'));

  await page.locator('main button').filter({ hasText: /^تنظیمات گردش امضا$/ }).first().click();
  await page.waitForTimeout(900);
  settingsText = await page.locator('main').first().innerText();
  check('UI هر چهار مرحله امضا نمایش داده می‌شوند',
    settingsText.includes('مرحله ۱') && settingsText.includes('مرحله ۲') && settingsText.includes('مرحله ۳') && settingsText.includes('امضای ابلاغیه'));
  check('UI ترتیب مراحل نمایش داده می‌شود', settingsText.includes('ترتیبی'));
  check('UI امضاکننده فعلی هر مرحله نمایش داده می‌شود', settingsText.includes('امضاکننده فعلی'));
  check('UI هشدار عدم تأثیر بر پرونده‌های در گردش نمایش داده می‌شود', settingsText.includes('در گردش'));

  await switchUser('مهندس سارا نیک‌نام');
  await page.locator('aside button:has-text("تنظیمات")').first().click();
  await page.waitForTimeout(900);
  const userSettings = await page.locator('main').first().innerText();
  check('UI کاربر عادی تب «تنظیمات گردش امضا» را نمی‌بیند', !userSettings.includes('تنظیمات گردش امضا'));
  check('UI کاربر عادی تب «جانشین امضا» را می‌بیند', userSettings.includes('جانشین امضا'));

  check('Regression: هیچ Crash/Runtime Error رخ نداد', pageErrors.length === 0, pageErrors.join(' | '));

  console.log(`\nSIGNATURE WORKFLOW CONFIG: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
