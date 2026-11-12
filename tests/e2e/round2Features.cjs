/**
 * قابلیت‌های مرحله دوم — سناریوهای پذیرش:
 * اعلان لحظه‌ای (بین تب‌ها)، هشدار پیشگیرانه، جستجوی مفهومی، تناقض و تکرار،
 * استخراج مصوبه، خواندن PDF، پیشنهاد زمان جلسه، گردش پویای پیشنهاد، امضای
 * رمزنگاری‌شده و تشخیص دستکاری، داشبورد شخصی و سند رسمی با خروجی Word.
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ===== ۱) اعلان لحظه‌ای بین تب‌ها =====
  await page.evaluate(() => localStorage.setItem('postbank-mosavabat-v1:currentUserId', JSON.stringify('user-8')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const other = await context.newPage();
  await other.goto(BASE, { waitUntil: 'networkidle' });
  await other.evaluate(async () => {
    const { proposalService } = await import('/src/services/proposalService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const p = (await proposalService.createProposal({ title: 'تست اعلان لحظه‌ای', proposerName: 'x', proposerDepartmentId: 'dept-1', proposerDepartmentName: 'IT', presenterUserId: 'user-9', presenterName: 'x', description: 'شرح' })).data;
    await proposalService.reviewProposal(p.id, 'APPROVED', '', users.find((u) => u.id === 'user-16'));
    await proposalService.confirmForMeeting(p.id, users.find((u) => u.id === 'user-17'));
  });
  await page.waitForTimeout(2500);
  check('۱ اعلان جدید بدون رفرش در تب دیگر نمایش داده شد', await page.locator('text=تأیید نهایی جلسه').count() > 0);
  await other.close();

  // ===== ۲) هشدار پیشگیرانه =====
  const risk = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:notifications') || '[]').filter((n) => n.type === 'RISK_ALERT'));
  check('۲ هشدار ریسک برای مصوبه پرریسک ساخته شد', risk.length > 0, risk[0]?.title);
  check('۲ هشدار تکراری ساخته نمی‌شود (یکتا برای هر روز)', new Set(risk.map((n) => n.id)).size === risk.length);

  // ===== ۳ تا ۷) سرویس‌های هوشمند =====
  const ai = await page.evaluate(async () => {
    const ins = await import('/src/services/ai/aiInsights.ts');
    const { resolutionService } = await import('/src/services/resolutionService.ts');
    const { meetingService } = await import('/src/services/meetingService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const all = (await resolutionService.getResolutions({ pageSize: 1000 })).data.items;
    const sem = await ins.semanticSearch('هر چیزی درباره امنیت داده', all);
    const dataCenter = all.find((r) => r.topicTitle.includes('مرکز داده'));
    const conflict = await ins.checkResolutionConflicts({ topic: dataCenter.topicTitle, text: 'لغو قرارداد پشتیبانی مرکز داده' }, all);
    const none = await ins.checkResolutionConflicts({ topic: 'خرید میز و صندلی سالن غذاخوری', text: 'تجهیز سالن غذاخوری' }, all);
    const ex = await ins.extractResolutions({ text: 'گزارش ارائه شد. مقرر شد مهندس سارا نیک‌نام ظرف مدت ۲ هفته طرح ارتقای شبکه را ارائه نماید. در مورد بودجه بحث شد.', agendas: [], users, departments: [] });
    const meetings = (await meetingService.getMeetings({ pageSize: 1000 })).data.items;
    const slots = ins.suggestMeetingSlots({ participantIds: ['user-8', 'user-17'], durationMinutes: 60, meetings, users });
    return {
      semTop: sem.data.slice(0, 3).map((h) => h.resolution.topicTitle),
      semAllReal: sem.data.every((h) => all.some((r) => r.id === h.resolution.id)),
      conflict: conflict.data.map((f) => f.kind),
      none: none.data.length,
      ex: ex.data.map((i) => ({ who: i.responsibleUserId, days: i.deadlineDays })),
      slots: slots.map((s) => ({ free: s.freeCount, total: s.total, weekday: s.weekday })),
    };
  });
  check('۳ جستجوی مفهومی «امنیت داده» مصوبات مرتبط را پیدا کرد', ai.semTop.some((t) => /داده|امنیت|پشتیبان/.test(t)), ai.semTop.join(' | '));
  check('۳ نتایج جستجوی مفهومی همگی پرونده‌های واقعی‌اند', ai.semAllReal);
  check('۴ «لغو» در برابر «تمدید» به‌عنوان تناقض تشخیص داده شد', ai.conflict.includes('CONFLICT'), ai.conflict.join(','));
  check('۴ موضوع نامرتبط هشدار کاذب نمی‌دهد', ai.none === 0, String(ai.none));
  check('۵ مصوبه با مسئول و مهلت از متن استخراج شد', ai.ex.length === 1 && ai.ex[0].who === 'user-9' && ai.ex[0].days === 14, JSON.stringify(ai.ex));
  check('۶ پیشنهاد زمان: حداقل یک زمان که همه آزادند و هیچ‌کدام جمعه نیست', ai.slots.some((s) => s.free === s.total) && ai.slots.every((s) => s.weekday !== 'جمعه'), JSON.stringify(ai.slots));

  // ===== ۷) خواندن PDF =====
  const pdfPage = await browser.newPage();
  await pdfPage.setContent('<html><body><p>Total budget 12 billion. Board approval is requested. Procurement delay is a risk.</p></body></html>');
  const pdfB64 = (await pdfPage.pdf()).toString('base64');
  await pdfPage.close();
  const pdfText = await page.evaluate(async (b64) => {
    const docs = await import('/src/utils/documentText.ts');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return docs.extractTextFromBuffer(bytes.buffer, 'pdf');
  }, pdfB64);
  check('۷ متن فایل PDF استخراج شد', pdfText.includes('Board approval'), pdfText.slice(0, 60));

  // ===== ۸) گردش پویای پیشنهاد =====
  const pw = await page.evaluate(async () => {
    const wf = await import('/src/services/workflowPolicyService.ts');
    const { proposalService } = await import('/src/services/proposalService.ts');
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const u = (id) => users.find((x) => x.id === id);
    wf.saveProposalWorkflowSettings({ ceoReview: { approverUserIds: ['user-16', 'user-14'], mode: 'SEQUENTIAL' } }, u('user-admin'));
    const p = (await proposalService.createProposal({ title: 'پیشنهاد ترتیبی', proposerName: 'x', proposerDepartmentId: 'dept-1', proposerDepartmentName: 'IT', presenterUserId: 'user-9', presenterName: 'x', description: 'شرح' })).data;
    let early = 'ALLOWED';
    try { await proposalService.reviewProposal(p.id, 'APPROVED', '', u('user-14')); } catch (e) { early = e.message; }
    const s1 = (await proposalService.reviewProposal(p.id, 'APPROVED', '', u('user-16'))).data.status;
    const s2 = (await proposalService.reviewProposal(p.id, 'APPROVED', '', u('user-14'))).data.status;
    wf.saveProposalWorkflowSettings({}, u('user-admin'));
    return { early, s1, s2 };
  });
  check('۸ تأییدکننده دوم پیش از نوبت نمی‌تواند تأیید کند', pw.early !== 'ALLOWED', pw.early);
  check('۸ پس از هر دو تأیید ترتیبی، پیشنهاد تأیید شد', pw.s1 === 'PENDING_CEO_REVIEW' && pw.s2 === 'APPROVED', JSON.stringify(pw));

  // ===== ۹) امضای رمزنگاری‌شده و تشخیص دستکاری =====
  const sig = await page.evaluate(async () => {
    const { resolutionService } = await import('/src/services/resolutionService.ts');
    const { meetingService } = await import('/src/services/meetingService.ts');
    const ds = await import('/src/services/digitalSignatureService.ts');
    const meeting = (await meetingService.getMeetings({ pageSize: 1 })).data.items[0];
    const r = (await resolutionService.createResolution({ meetingId: meeting.id, meetingTitle: meeting.title, meetingNumber: meeting.meetingNumber, topicTitle: 'مصوبه امضای رمزنگاری', proposerName: 'p', proposerDepartment: 'd', requestDescription: 'متن اصلی مصوبه', approvalStatus: 'APPROVED' })).data;
    const firstSigner = r.signatureWorkflow.steps[0].signerUserId;
    const signed = (await resolutionService.signResolution(r.id, firstSigner)).data;
    const record = signed.signatureWorkflow.steps[0].cryptoSignature;
    const okNow = await ds.verifySignature(record, ds.canonicalResolutionContent(signed));
    const tampered = { ...signed, requestDescription: 'متن دستکاری‌شده', executionDescription: '' };
    const okTampered = await ds.verifySignature(record, ds.canonicalResolutionContent(tampered));
    return { hasRecord: Boolean(record?.signature), algorithm: record?.algorithm, okNow, okTampered };
  });
  check('۹ امضا شامل امضای رمزنگاری‌شده ECDSA است', sig.hasRecord && /ECDSA/.test(sig.algorithm), sig.algorithm);
  check('۹ اعتبارسنجی روی متن اصلی موفق است', sig.okNow.valid === true, sig.okNow.reason);
  check('۹ تغییر متن پس از امضا تشخیص داده می‌شود', sig.okTampered.valid === false, sig.okTampered.reason);

  // ===== ۱۰) داشبورد شخصی =====
  await page.evaluate(() => localStorage.setItem('postbank-mosavabat-v1:currentUserId', JSON.stringify('user-admin')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'شخصی‌سازی' }).first().click();
  await page.locator('[role="dialog"] li', { hasText: 'خلاصه هوشمند امروز' }).locator('button').first().click();
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 10);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('۱۰ بخش پنهان‌شده پس از بارگذاری مجدد همچنان پنهان است', await page.locator('.ai-brief').count() === 0);
  const layout = await page.evaluate(() => JSON.parse(localStorage.getItem('postbank-mosavabat-v1:dashboardLayouts') || '{}'));
  check('۱۰ چیدمان برای همان کاربر ذخیره شد', Array.isArray(layout['user-admin']?.hidden) && layout['user-admin'].hidden.includes('brief'));

  // ===== ۱۱) سند رسمی با سربرگ و Word =====
  const docPromise = context.waitForEvent('page');
  await page.evaluate(async () => {
    const ds = await import('/src/services/documentService.ts');
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings'));
    const users = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users'));
    const admin = users.find((u) => u.id === 'user-admin');
    ds.openGeneratedDocument(ds.buildMeetingInvitationDocument(meetings[0], admin));
  });
  const docPage = await docPromise;
  await docPage.waitForLoadState();
  const docHtml = await docPage.content();
  check('۱۱ سند رسمی سربرگ «شماره / تاریخ / پیوست» دارد', docHtml.includes('شماره:') && docHtml.includes('تاریخ:') && docHtml.includes('پیوست:'));
  check('۱۱ دکمه دانلود Word در سند وجود دارد', docHtml.includes('دانلود Word'));
  const download = page.waitForEvent('download');
  await docPage.locator('button', { hasText: 'دانلود Word' }).click();
  const file = await download;
  check('۱۱ فایل Word دانلود شد', /\.doc$/.test(file.suggestedFilename()), file.suggestedFilename());

  check('بدون خطای صفحه', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
