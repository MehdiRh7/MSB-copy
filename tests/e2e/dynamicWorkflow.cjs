/**
 * «گردش کار پویا» + تنظیمات هوش مصنوعی — سناریوهای پذیرش.
 *  - تأیید دستورکار: ترتیبی / همه / یک نفر، برگشت و ارسال مجدد
 *  - جلسات بدون تنظیم پویا (رفتار تاریخی: مدیرعامل)
 *  - زنجیره امضای اختصاصی جلسه (موازی) و امضاکننده ابلاغیه اختصاصی
 *  - تأیید صورت‌جلسه پیش از نهایی‌سازی
 *  - قالب گردش کار به تفکیک نوع جلسه (فقط مدیر سیستم)
 *  - انتخاب ارائه‌دهنده هوش مصنوعی فقط توسط مدیر سیستم
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
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
  await page.waitForTimeout(600);

  const baseMeeting = (title, workflow, type = 'COMMISSION') => ({
    title, type, dateJalali: '1405/09/01', startTime: '09:00', endTime: '11:00', location: 'سالن تست',
    organizerId: 'user-17', secretaryId: 'user-8', createdByUserId: 'user-17', createdByName: 'مسئول دفتر', departmentId: 'dept-2',
    members: [{ userId: 'user-8', fullName: 'مهندس جواد صادقی', roleTitle: 'دبیر', departmentName: 'PMO', attendanceType: 'SECRETARY' }],
    agendaItems: [{ id: `ag-${title}`, order: 1, title: 'بند آزمایشی', presenter: 'مسئول دفتر', isDiscussed: false }],
    attachments: [],
    ...(workflow ? { workflow } : {}),
  });

  // ===== ۱) تأیید ترتیبی دستورکار =====
  const seq = await page.evaluate(async (dto) => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const created = (await meetingService.createMeeting(dto)).data;
    const out = { id: created.id, approvers: created.agendaApproverUserIds };
    try { await meetingService.reviewAgenda(created.id, 'APPROVE', '', await window.actor('user-9')); out.outOfTurn = 'ALLOWED'; } catch (e) { out.outOfTurn = e.message; }
    out.afterFirst = (await meetingService.reviewAgenda(created.id, 'APPROVE', 'تأیید اول', await window.actor('user-16'))).data.status;
    out.afterSecond = (await meetingService.reviewAgenda(created.id, 'APPROVE', '', await window.actor('user-9'))).data.status;
    const visible = (await meetingService.getMeetings({ participantUserId: 'user-9', pageSize: 100 })).data.items.some((m) => m.id === created.id);
    out.visibleToApprover = visible;
    return out;
  }, baseMeeting('seq', {
    agendaApproval: { approverUserIds: ['user-16', 'user-9'], mode: 'SEQUENTIAL' },
    minutesApproval: { approverUserIds: ['user-14'], mode: 'ANY' },
    resolutionSignature: { signerUserIds: ['user-9', 'user-16'], mode: 'PARALLEL' },
    noticeSignerUserId: 'user-14',
  }));
  check('۱ تأییدکنندگان اختصاصی روی جلسه ذخیره شد', JSON.stringify(seq.approvers) === JSON.stringify(['user-16', 'user-9']), JSON.stringify(seq.approvers));
  check('۱ نفر دوم پیش از نوبت نمی‌تواند تأیید کند', seq.outOfTurn !== 'ALLOWED', seq.outOfTurn);
  check('۱ پس از تأیید نفر اول، دستورکار هنوز در انتظار است', seq.afterFirst === 'WAITING_FOR_CEO_APPROVAL', seq.afterFirst);
  check('۱ پس از تأیید نفر دوم، آماده ارسال دعوتنامه', seq.afterSecond === 'READY_FOR_INVITATION', seq.afterSecond);
  check('۱ تأییدکننده غیرعضو جلسه را در فهرست خود می‌بیند', seq.visibleToApprover === true);

  // ===== ۲) حالت «همه» با برگشت و ارسال مجدد =====
  const all = await page.evaluate(async (dto) => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const created = (await meetingService.createMeeting(dto)).data;
    await meetingService.reviewAgenda(created.id, 'APPROVE', '', await window.actor('user-9'));
    const returned = (await meetingService.reviewAgenda(created.id, 'RETURN', 'نیاز به اصلاح', await window.actor('user-16'))).data;
    const resubmitted = (await meetingService.submitAgenda(created.id, await window.actor('user-17'))).data;
    return { returned: returned.status, decisionsAfterResubmit: resubmitted.agendaDecisions.length, status: resubmitted.status };
  }, baseMeeting('all', { agendaApproval: { approverUserIds: ['user-9', 'user-16'], mode: 'ALL' } }));
  check('۲ برگشت توسط یکی از تأییدکنندگان', all.returned === 'AGENDA_RETURNED', all.returned);
  check('۲ ارسال مجدد، دور جدید بررسی را از صفر شروع می‌کند', all.decisionsAfterResubmit === 0 && all.status === 'WAITING_FOR_CEO_APPROVAL', JSON.stringify(all));

  // ===== ۳) رفتار تاریخی: جلسه بدون گردش اختصاصی =====
  const legacy = await page.evaluate(async (dto) => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const created = (await meetingService.createMeeting(dto)).data;
    let expert = 'ALLOWED';
    try { await meetingService.reviewAgenda(created.id, 'APPROVE', '', await window.actor('user-9')); } catch (e) { expert = e.message; }
    const status = (await meetingService.reviewAgenda(created.id, 'APPROVE', '', await window.actor('user-16'))).data.status;
    return { template: created.workflow?.templateId, approvers: created.agendaApproverUserIds, expert, status };
  }, baseMeeting('legacy', undefined));
  check('۳ بدون انتخاب، قالب پیش‌فرض (مدیرعامل) اعمال شد', legacy.template === 'wf-default' && legacy.approvers.includes('user-16'), JSON.stringify(legacy));
  check('۳ کاربر غیرمجاز نمی‌تواند تأیید کند', legacy.expert !== 'ALLOWED');
  check('۳ تأیید مدیرعامل مثل قبل دستورکار را نهایی می‌کند', legacy.status === 'READY_FOR_INVITATION', legacy.status);

  // ===== ۴) امضای موازی اختصاصی + امضاکننده ابلاغیه =====
  const sig = await page.evaluate(async (meetingId) => {
    const { resolutionService } = await import('/src/services/resolutionService.ts');
    const res = (await resolutionService.createResolution({ meetingId, meetingTitle: 'seq', meetingNumber: 'x', agendaItemId: 'ag-seq', topicTitle: 'مصوبه موازی', proposerName: 'p', proposerDepartment: 'd', requestDescription: 'r', approvalStatus: 'APPROVED', mainResponsibleUserId: 'user-9', mainResponsibleName: 'مهندس سارا نیک‌نام', deadlineJalali: '1405/12/01' })).data;
    const out = { source: res.signatureWorkflow.source, mode: res.signatureWorkflow.mode, steps: res.signatureWorkflow.steps.map((s) => `${s.signerUserId}:${s.status}`), status: res.executionStatus };
    out.afterCeo = (await resolutionService.signResolution(res.id, 'user-16')).data.executionStatus;
    let outsider = 'ALLOWED';
    try { await resolutionService.signResolution(res.id, 'user-17'); } catch (e) { outsider = e.message; }
    out.outsider = outsider;
    out.afterAll = (await resolutionService.signResolution(res.id, 'user-9')).data.executionStatus;
    await resolutionService.notifyResolution(res.id, await window.actor('user-17'));
    const notices = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:resolutionNotices') || '[]');
    out.noticeSigner = notices.find((n) => n.resolutionId === res.id)?.secretaryUserId;
    out.signedNotice = (await resolutionService.signNotificationLetter(res.id, await window.actor('user-14'))).data.executionStatus;
    return out;
  }, seq.id);
  check('۴ زنجیره امضای جلسه روی مصوبه Snapshot شد (موازی)', sig.source === 'MEETING' && sig.mode === 'PARALLEL', JSON.stringify(sig));
  check('۴ هر دو امضا هم‌زمان باز هستند', sig.steps.every((s) => s.endsWith(':PENDING')), sig.steps.join(','));
  check('۴ وضعیت «در انتظار امضا (گردش اختصاصی)»', sig.status === 'PENDING_SIGNATURES', sig.status);
  check('۴ پس از یک امضا هنوز در انتظار امضا', sig.afterCeo === 'PENDING_SIGNATURES', sig.afterCeo);
  check('۴ فرد خارج از زنجیره نمی‌تواند امضا کند', sig.outsider !== 'ALLOWED', sig.outsider);
  check('۴ پس از همه امضاها → در انتظار ابلاغ', sig.afterAll === 'WAITING_NOTIFICATION', sig.afterAll);
  check('۴ امضاکننده ابلاغیه اختصاصی جلسه ثبت شد', sig.noticeSigner === 'user-14', sig.noticeSigner);
  check('۴ امضای ابلاغیه توسط همان فرد، مصوبه را وارد اجرا کرد', ['NOTIFIED', 'IN_PROGRESS'].includes(sig.signedNotice), sig.signedNotice);

  // ===== ۵) زنجیره پیش‌فرض برای جلسه بدون امضای اختصاصی =====
  const def = await page.evaluate(async (dto) => {
    const { meetingService } = await import('/src/services/meetingService.ts');
    const { resolutionService } = await import('/src/services/resolutionService.ts');
    const m = (await meetingService.createMeeting(dto)).data;
    const r = (await resolutionService.createResolution({ meetingId: m.id, meetingTitle: m.title, meetingNumber: m.meetingNumber, topicTitle: 'مصوبه پیش‌فرض', proposerName: 'p', proposerDepartment: 'd', requestDescription: 'r', approvalStatus: 'APPROVED' })).data;
    return { steps: r.signatureWorkflow.steps.length, roles: r.signatureWorkflow.steps.map((s) => s.signerRole).join(','), status: r.executionStatus };
  }, baseMeeting('default-chain', undefined));
  check('۵ سه امضای سراسری بدون تغییر باقی مانده است', def.steps === 3 && def.roles === 'OFFICE_MANAGER,CEO,ADMIN' && def.status === 'PENDING_OFFICE_SIGNATURE', JSON.stringify(def));

  // ===== ۶) تأیید صورت‌جلسه =====
  const minutes = await page.evaluate(async (meetingId) => {
    const { boardSecretariatService } = await import('/src/services/boardSecretariatService.ts');
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings'));
    const meeting = meetings.find((m) => m.id === meetingId);
    const office = await window.actor('user-17');
    await boardSecretariatService.createMinutes(meeting, 'متن صورت‌جلسه آزمایشی', office);
    let early = 'ALLOWED';
    try { await boardSecretariatService.finalizeMinutes(meetingId, office); } catch (e) { early = e.message; }
    await boardSecretariatService.submitMinutesForApproval(meetingId, office);
    let wrong = 'ALLOWED';
    try { await boardSecretariatService.reviewMinutes(meetingId, 'APPROVE', '', await window.actor('user-9')); } catch (e) { wrong = e.message; }
    const approved = (await boardSecretariatService.reviewMinutes(meetingId, 'APPROVE', '', await window.actor('user-14'))).data.status;
    const finalized = (await boardSecretariatService.finalizeMinutes(meetingId, office)).data.status;
    return { early, wrong, approved, finalized };
  }, seq.id);
  check('۶ نهایی‌سازی پیش از تأیید ممنوع است', minutes.early !== 'ALLOWED', minutes.early);
  check('۶ فقط تأییدکننده تعیین‌شده می‌تواند تأیید کند', minutes.wrong !== 'ALLOWED', minutes.wrong);
  check('۶ پس از تأیید → آماده نهایی‌سازی', minutes.approved === 'SIGNED', minutes.approved);
  check('۶ نهایی‌سازی پس از تأیید انجام شد', minutes.finalized === 'FINALIZED', minutes.finalized);

  // ===== ۷) قالب گردش کار به تفکیک نوع جلسه =====
  const tpl = await page.evaluate(async (dto) => {
    const wf = await import('/src/services/workflowPolicyService.ts');
    const { meetingService } = await import('/src/services/meetingService.ts');
    let nonAdmin = 'ALLOWED';
    const template = { id: 'wf-board', name: 'هیئت مدیره', meetingTypes: ['BOARD'], agendaApproval: { approverUserIds: ['user-16', 'user-admin'], mode: 'ALL' }, updatedAt: '' };
    try { wf.saveWorkflowTemplate(template, await window.actor('user-9')); } catch (e) { nonAdmin = e.message; }
    wf.saveWorkflowTemplate(template, await window.actor('user-admin'));
    const m = (await meetingService.createMeeting(dto)).data;
    return { nonAdmin, templateId: m.workflow.templateId, mode: m.workflow.agendaApproval.mode, approvers: m.agendaApproverUserIds };
  }, baseMeeting('board', undefined, 'BOARD'));
  check('۷ کاربر عادی نمی‌تواند قالب گردش کار را تغییر دهد', tpl.nonAdmin !== 'ALLOWED', tpl.nonAdmin);
  check('۷ جلسه هیئت مدیره قالب مخصوص خودش را گرفت', tpl.templateId === 'wf-board' && tpl.mode === 'ALL' && tpl.approvers.length === 2, JSON.stringify(tpl));

  // ===== ۸) هوش مصنوعی: فقط مدیر سیستم =====
  const ai = await page.evaluate(async () => {
    const mod = await import('/src/services/ai/aiSettings.ts');
    const s = mod.getAiSettings();
    let manager = 'ALLOWED';
    const usersAll = await window.loadUsers();
    const managerUser = { ...usersAll.find((u) => u.id === 'user-17'), permissions: ['MANAGE_USERS'] };
    try { mod.saveAiSettings({ ...s, activeProvider: 'grok' }, managerUser); } catch (e) { manager = e.message; }
    mod.saveAiSettings({ ...s, activeProvider: 'deepseek' }, await window.actor('user-admin'));
    return { manager, active: mod.getAiSettings().activeProvider, providers: Object.keys(s.providers).join(',') };
  });
  check('۸ سه ارائه‌دهنده DeepSeek / Gemini / Grok تعریف شده‌اند', ai.providers === 'gemini,deepseek,grok', ai.providers);
  check('۸ حتی دارنده مجوز مدیریت کاربران نمی‌تواند ارائه‌دهنده را تغییر دهد', ai.manager !== 'ALLOWED', ai.manager);
  check('۸ مدیر سیستم ارائه‌دهنده فعال را تغییر داد', ai.active === 'deepseek', ai.active);

  // ===== ۹) موتور محلی بدون کلید =====
  const localAi = await page.evaluate(async () => {
    const svc = await import('/src/services/ai/aiService.ts');
    const r = await svc.draftProposal('راه‌اندازی سامانه نوبت‌دهی آنلاین شعب', 'فناوری اطلاعات');
    return { source: r.source, title: r.data.title, hasDescription: r.data.description.length > 40 };
  });
  check('۹ بدون کلید، موتور محلی پاسخ می‌دهد و صادقانه برچسب می‌خورد', localAi.source === 'LOCAL' && localAi.hasDescription, JSON.stringify(localAi));

  check('بدون خطای صفحه', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
