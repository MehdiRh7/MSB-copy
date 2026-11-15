/**
 * «پیشنهاد نتیجه بندها از روی گفتار» — فقط کمکی؛ ثبت با تأیید انسان.
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };
const TRANSCRIPT = 'جلسه با حضور اعضا آغاز شد. درباره تمدید قرارداد پشتیبانی بحث شد و تمدید قرارداد پشتیبانی تصویب شد. خرید تجهیزات شبکه به شرط تأمین بودجه از محل اعتبارات فناوری به صورت مشروط تصویب شد. موضوع استخدام نیروی جدید به جلسه بعد موکول شد.';

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

  const meetingId = await page.evaluate(async () => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const u = (id) => users.find((x) => x.id === id);
    const agenda = (id, title, order) => ({ id, order, title, presenter: 'مسئول دفتر', isDiscussed: false });
    const m = (await meetingService.createMeeting({ title: 'جلسه تست نتیجه بندها', type: 'COMMISSION', dateJalali: '1405/09/03', startTime: '10:00', endTime: '12:00', location: 'سالن', organizerId: 'user-17', secretaryId: 'user-8', createdByUserId: 'user-17', createdByName: 'مسئول دفتر', departmentId: 'dept-1',
      members: [{ userId: 'user-8', fullName: 'مهندس جواد صادقی', roleTitle: 'دبیر', departmentName: 'PMO', attendanceType: 'SECRETARY' }],
      agendaItems: [agenda('ag-o1', 'تمدید قرارداد پشتیبانی', 1), agenda('ag-o2', 'خرید تجهیزات شبکه', 2), agenda('ag-o3', 'استخدام نیروی جدید', 3), agenda('ag-o4', 'آموزش کارکنان شعب', 4)], attachments: [] })).data;
    await meetingService.reviewAgenda(m.id, 'APPROVE', '', u('user-16'));
    await meetingService.sendInvitations(m.id, u('user-17'));
    return m.id;
  });

  // ===== سرویس: پیشنهاد درست + بدون حدس =====
  const svc = await page.evaluate(async ({ meetingId, transcript }) => {
    const ins = await import('/src/services/ai/aiInsights.ts');
    const meeting = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings')).find((m) => m.id === meetingId);
    const res = await ins.suggestAgendaOutcomes(meeting, transcript);
    const after = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings')).find((m) => m.id === meetingId);
    return { map: Object.fromEntries(res.data.map((s) => [s.agendaItemId, s.outcome])), evidenceOk: res.data.filter((s) => s.outcome).every((s) => transcript.includes(s.evidence)), recorded: after.agendaItems.filter((a) => a.outcomeStatus).length };
  }, { meetingId, transcript: TRANSCRIPT });
  check('«تصویب شد» درست تشخیص داده شد', svc.map['ag-o1'] === 'APPROVED', svc.map['ag-o1']);
  check('«به شرط ... مشروط» به‌عنوان تصویب مشروط تشخیص داده شد', svc.map['ag-o2'] === 'CONDITIONAL', svc.map['ag-o2']);
  check('«به جلسه بعد موکول» درست تشخیص داده شد', svc.map['ag-o3'] === 'DEFERRED', svc.map['ag-o3']);
  check('بندی که در گفتار نیامده حدس زده نمی‌شود', svc.map['ag-o4'] === null, String(svc.map['ag-o4']));
  check('هر پیشنهاد جمله مبنای خود را از خود گفتار دارد', svc.evidenceOk);
  check('پیشنهاد دادن، هیچ نتیجه‌ای ثبت نمی‌کند', svc.recorded === 0, String(svc.recorded));

  // ===== تطبیق با همه مشخصات بند (ارائه‌دهنده، افراد مرتبط)، نه فقط عنوان =====
  const people = await page.evaluate(async () => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const ins = await import('/src/services/ai/aiInsights.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const u = (id) => users.find((x) => x.id === id);
    const mk = (id, order, title, presenter, related) => ({ id, order, title, presenter, presenterName: presenter, isDiscussed: false, relatedUsers: related });
    const m = (await meetingService.createMeeting({ title: 'جلسه تست افراد', type: 'COMMISSION', dateJalali: '1405/09/04', startTime: '10:00', endTime: '12:00', location: 'سالن', organizerId: 'user-17', secretaryId: 'user-8', createdByUserId: 'user-17', createdByName: 'مسئول دفتر', departmentId: 'dept-1', members: [],
      agendaItems: [mk('ag-p1', 1, 'طرح یکپارچه‌سازی سامانه‌های حسابرسی', 'دکتر وحید سلیمانی', []), mk('ag-p2', 2, 'نوسازی تجهیزات شبکه شعب', 'مهندس سارا نیک‌نام', [{ userId: 'user-8', fullName: 'مهندس جواد صادقی' }]), mk('ag-p3', 3, 'برنامه آموزش سالانه', 'مسئول دفتر', [])], attachments: [] })).data;
    const transcript = 'جلسه آغاز شد. پیشنهاد آقای دکتر وحید سلیمانی نیاز به اصلاح داره و باید دوباره ارائه بشه. درباره کار خانم نیک‌نام صحبت شد و با پیشنهادش موافقت شد. در پایان چند موضوع متفرقه مطرح شد.';
    const res = await ins.suggestAgendaOutcomes(m, transcript);
    return Object.fromEntries(res.data.map((s) => [s.agendaItemId, { outcome: s.outcome, matchedBy: s.matchedBy, reason: s.reason, evidence: s.evidence }]));
  });
  check('فقط با نام ارائه‌دهنده («پیشنهاد آقای دکتر وحید سلیمانی…») بند درست پیدا شد و «نیاز به اصلاح» تشخیص داده شد', people['ag-p1'].outcome === 'NEEDS_REVISION', JSON.stringify(people['ag-p1']));
  check('دلیل ارتباط با بند (ارائه‌دهنده) و دلیل برداشت گفته می‌شود', people['ag-p1'].matchedBy.includes('سلیمانی') && people['ag-p1'].reason.length > 5, `${people['ag-p1'].matchedBy} | ${people['ag-p1'].reason}`);
  check('فقط با نام خانوادگی («خانم نیک‌نام») هم بند درست پیدا شد (تصویب)', people['ag-p2'].outcome === 'APPROVED' && people['ag-p2'].matchedBy.includes('نیک‌نام'), JSON.stringify(people['ag-p2']));
  check('بندی که درباره‌اش چیزی گفته نشد حدس زده نمی‌شود', people['ag-p3'].outcome === null, JSON.stringify(people['ag-p3']));

  // ===== رابط کاربری: ثبت فقط با تأیید =====
  await page.evaluate(() => localStorage.setItem('postbank-mosavabat-v1:currentUserId', JSON.stringify('user-17')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('aside, nav').locator('text=مدیریت جلسات').first().click();
  await page.waitForTimeout(800);
  await page.locator('text=جلسه تست نتیجه بندها').first().click();
  await page.waitForTimeout(1000);
  await page.locator('button', { hasText: 'برگزاری جلسه (ضبط و گفتار)' }).click();
  await page.waitForTimeout(600);
  await page.fill('textarea[placeholder^="متن گفتار جلسه"]', TRANSCRIPT);
  await page.locator('button', { hasText: 'پیشنهاد نتیجه بندها از گفتار' }).click();
  await page.waitForTimeout(900);
  check('پیام «فقط پیشنهاد است» نمایش داده شد', await page.locator('text=فقط پیشنهاد است.').count() > 0);
  check('مرجع پیشنهاد (نقل‌قول، ارتباط با بند و دلیل برداشت) نمایش داده شد', await page.locator('text=مرجع این پیشنهاد در گفتار جلسه:').count() > 0 && await page.locator('text=ارتباط با این بند:').count() > 0 && await page.locator('text=دلیل این برداشت:').count() > 0);
  const before = await page.evaluate((id) => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings')).find((m) => m.id === id).agendaItems.filter((a) => a.outcomeStatus).length, meetingId);
  check('پیش از تأیید چیزی ثبت نشده', before === 0, String(before));
  await page.locator('button', { hasText: 'تأیید و ثبت نتیجه' }).first().click();
  await page.waitForTimeout(900);
  const after = await page.evaluate((id) => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings')).find((m) => m.id === id).agendaItems.map((a) => a.outcomeStatus || null), meetingId);
  check('فقط همان بند تأییدشده ثبت شد', after[0] === 'APPROVED' && after.slice(1).every((x) => x === null), JSON.stringify(after));
  check('بند ثبت‌شده با برچسب «با تأیید شما ثبت شد» نمایش داده شد', await page.locator('span', { hasText: 'با تأیید شما ثبت شد' }).count() > 0);
  const savedEvidence = await page.evaluate((id) => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings')).find((m) => m.id === id).agendaItems[0].outcomeEvidence, meetingId);
  check('مرجع (نقل‌قول از گفتار) همراه نتیجه تأییدشده ذخیره شد', Boolean(savedEvidence && savedEvidence.quote.includes('تصویب')), JSON.stringify(savedEvidence));
  // پس از تازه‌سازی صفحه، متن گفتار و بقیه پیشنهادها باید باقی بمانند.
  check('متن گفتار پس از ثبت اولین نتیجه از بین نرفت', (await page.inputValue('textarea[placeholder^="متن گفتار جلسه"]')).includes('تمدید قرارداد'));
  await page.locator('button', { hasText: 'تأیید و ثبت نتیجه' }).first().click();
  await page.waitForTimeout(900);
  const after2 = await page.evaluate((id) => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings')).find((m) => m.id === id).agendaItems.map((a) => a.outcomeStatus || null), meetingId);
  check('بند دوم هم بدون شروع دوباره با تأیید ثبت شد (مشروط)', after2[1] === 'CONDITIONAL' && after2[2] === null, JSON.stringify(after2));
  await page.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});

  check('بدون خطای صفحه', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
