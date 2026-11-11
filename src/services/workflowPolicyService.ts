/**
 * «گردش کار پویا» — منبع واحد منطق سیاست‌های تأیید و امضا.
 *
 * - قالب‌های گردش کار (Workflow Templates) را مدیر سیستم به تفکیک نوع جلسه
 *   تعریف می‌کند؛ هنگام ایجاد جلسه قالب مناسب پیشنهاد می‌شود و برای همان
 *   جلسه قابل تغییر است (مثلاً این جلسه فقط آقای الف تأیید کند، جلسه بعدی
 *   خانم ب).
 * - ارزیابی وضعیت تأیید (همه / یک نفر / ترتیبی) فقط اینجا انجام می‌شود تا
 *   Service و UI هر دو از یک قاعده تصمیم بگیرند.
 * - نبود تنظیم پویا روی جلسه یعنی رفتار تاریخی: تأیید دستورکار توسط
 *   مدیرعامل (یک نفر کافی)، بدون تأیید صورت‌جلسه، و امضاهای سراسری.
 */
import {
  ApprovalDecision,
  ApprovalMode,
  ApprovalPolicy,
  Meeting,
  MeetingType,
  MeetingWorkflowConfig,
  SignatureChainMode,
  User,
  WorkflowTemplate,
} from '../types';
import { mockUsers } from '../mock/data';
import { loadLocalCollection, loadLocalValue, saveLocalValue } from './localStore';

const TEMPLATES_KEY = 'workflowTemplates';

/** انواع جلسه همان‌طور که فرم ایجاد جلسه ارائه می‌کند. */
export const MEETING_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BOARD', label: 'جلسه هیئت مدیره' },
  { value: 'EXECUTIVE', label: 'جلسه هیئت عامل / اجرایی' },
  { value: 'COMMISSION', label: 'جلسه کمیسیون تخصصی' },
  { value: 'DEPARTMENTAL', label: 'جلسه داخلی واحد' },
  { value: 'COORDINATION', label: 'جلسه هماهنگی بین‌بخشی' },
];

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  ALL: 'تأیید همه (بدون ترتیب)',
  ANY: 'تأیید یک نفر کافی است',
  SEQUENTIAL: 'تأیید همه به ترتیب',
};

export const APPROVAL_MODE_HINTS: Record<ApprovalMode, string> = {
  ALL: 'هر کدام از تأییدکنندگان در هر زمان می‌توانند تأیید کنند؛ تا تأیید همه، مرحله باز می‌ماند.',
  ANY: 'به محض تأیید یکی از افراد، مرحله تکمیل می‌شود.',
  SEQUENTIAL: 'نفر بعدی تنها پس از تأیید نفر قبلی نوبت می‌گیرد.',
};

export const SIGNATURE_MODE_LABELS: Record<SignatureChainMode, string> = {
  SEQUENTIAL: 'امضای ترتیبی',
  PARALLEL: 'امضای همزمان (موازی)',
};

const nowParts = () => {
  const now = new Date();
  return {
    iso: now.toISOString(),
    date: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[‎‏]/g, ''),
    time: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
  };
};

const users = (): User[] => loadLocalCollection('users', mockUsers);

const activeCeoIds = (): string[] => users().filter((user) => user.role === 'CEO' && user.isActive !== false).map((user) => user.id);

// ——————————————————— Templates ———————————————————

const builtInTemplates = (): WorkflowTemplate[] => {
  const ceoIds = activeCeoIds();
  const now = new Date().toISOString();
  return [
    {
      id: 'wf-default',
      name: 'گردش استاندارد سازمان',
      description: 'رفتار پیش‌فرض: تأیید دستورکار توسط مدیرعامل، صورت‌جلسه بدون تأیید اضافه و سه امضای سراسری مصوبه.',
      meetingTypes: [],
      isDefault: true,
      agendaApproval: { approverUserIds: ceoIds, mode: 'ANY' },
      updatedAt: now,
    },
  ];
};

export const getWorkflowTemplates = (): WorkflowTemplate[] => {
  const saved = loadLocalValue<WorkflowTemplate[] | null>(TEMPLATES_KEY, null);
  if (!saved || saved.length === 0) return builtInTemplates();
  return saved;
};

export const canManageWorkflowTemplates = (actor?: User): boolean =>
  Boolean(actor && (actor.role === 'ADMIN' || (actor.permissions || []).includes('MANAGE_USERS')));

export const saveWorkflowTemplate = (template: WorkflowTemplate, actor: User): WorkflowTemplate[] => {
  if (!canManageWorkflowTemplates(actor)) throw new Error('شما مجاز به مدیریت قالب‌های گردش کار نیستید.');
  if (!template.name.trim()) throw new Error('نام قالب الزامی است.');
  if (template.agendaApproval.approverUserIds.length === 0) throw new Error('حداقل یک تأییدکننده دستورکار انتخاب کنید.');
  if (template.minutesApproval && template.minutesApproval.approverUserIds.length === 0) delete template.minutesApproval;
  if (template.resolutionSignature && template.resolutionSignature.signerUserIds.length === 0) delete template.resolutionSignature;
  const all = getWorkflowTemplates();
  const next = all.some((item) => item.id === template.id)
    ? all.map((item) => (item.id === template.id ? { ...template, updatedAt: new Date().toISOString() } : item))
    : [...all, { ...template, updatedAt: new Date().toISOString() }];
  // هر نوع جلسه فقط به یک قالب تعلق دارد.
  next.forEach((item) => { if (item.id !== template.id) item.meetingTypes = item.meetingTypes.filter((type) => !template.meetingTypes.includes(type)); });
  // فقط یک قالب پیش‌فرض.
  if (template.isDefault) next.forEach((item) => { item.isDefault = item.id === template.id; });
  if (!next.some((item) => item.isDefault)) next[0].isDefault = true;
  saveLocalValue(TEMPLATES_KEY, next);
  return next;
};

export const deleteWorkflowTemplate = (templateId: string, actor: User): WorkflowTemplate[] => {
  if (!canManageWorkflowTemplates(actor)) throw new Error('شما مجاز به مدیریت قالب‌های گردش کار نیستید.');
  const all = getWorkflowTemplates();
  if (all.length <= 1) throw new Error('حداقل یک قالب گردش کار باید باقی بماند.');
  const next = all.filter((item) => item.id !== templateId);
  if (!next.some((item) => item.isDefault)) next[0].isDefault = true;
  saveLocalValue(TEMPLATES_KEY, next);
  return next;
};

/** قالب مخصوص نوع جلسه، وگرنه قالب پیش‌فرض. */
export const getTemplateForMeetingType = (type: MeetingType | string): WorkflowTemplate => {
  const all = getWorkflowTemplates();
  return all.find((item) => item.meetingTypes.includes(type)) || all.find((item) => item.isDefault) || all[0];
};

export const workflowFromTemplate = (template: WorkflowTemplate): MeetingWorkflowConfig => {
  const clone = JSON.parse(JSON.stringify(template)) as WorkflowTemplate;
  return {
    templateId: clone.id,
    templateName: clone.name,
    agendaApproval: clone.agendaApproval.approverUserIds.length > 0
      ? clone.agendaApproval
      : { approverUserIds: activeCeoIds(), mode: 'ANY' },
    minutesApproval: clone.minutesApproval,
    resolutionSignature: clone.resolutionSignature,
    noticeSignerUserId: clone.noticeSignerUserId,
  };
};

// ——————————————————— Evaluation ———————————————————

/** سیاست مؤثر تأیید دستورکار جلسه — جلسات قدیمی: مدیرعامل، یک نفر کافی. */
export const getAgendaApprovalPolicy = (meeting: Meeting): ApprovalPolicy =>
  meeting.workflow?.agendaApproval && meeting.workflow.agendaApproval.approverUserIds.length > 0
    ? meeting.workflow.agendaApproval
    : { approverUserIds: meeting.agendaApproverUserIds?.length ? meeting.agendaApproverUserIds : activeCeoIds(), mode: 'ANY' };

export interface ApprovalEvaluation {
  approvedIds: string[];
  pendingIds: string[];
  /** در حالت ترتیبی: نفری که الان نوبت اوست. */
  currentTurnId?: string;
  isSatisfied: boolean;
  approvedCount: number;
  requiredCount: number;
}

export const evaluateApproval = (policy: ApprovalPolicy, decisions: ApprovalDecision[] = []): ApprovalEvaluation => {
  const approved = new Set(decisions.filter((item) => item.decision === 'APPROVED').map((item) => item.onBehalfOfUserId || item.userId));
  const approvedIds = policy.approverUserIds.filter((id) => approved.has(id));
  const pendingIds = policy.approverUserIds.filter((id) => !approved.has(id));
  const requiredCount = policy.mode === 'ANY' ? 1 : policy.approverUserIds.length;
  const isSatisfied = policy.mode === 'ANY' ? approvedIds.length > 0 : pendingIds.length === 0;
  return {
    approvedIds,
    pendingIds,
    currentTurnId: policy.mode === 'SEQUENTIAL' ? pendingIds[0] : undefined,
    isSatisfied,
    approvedCount: approvedIds.length,
    requiredCount,
  };
};

export interface ApprovalAuthority {
  allowed: boolean;
  /** شناسه تأییدکننده‌ای که این اقدام به نام او ثبت می‌شود. */
  approverUserId?: string;
  onBehalfOf?: boolean;
  reason?: string;
}

/**
 * آیا کاربر می‌تواند در این مرحله تصمیم بگیرد؟
 * مدیر سیستم همیشه می‌تواند (به نمایندگی از نفر نوبت‌دار/اولین نفر باقی‌مانده).
 * `legacyRoleFallback` برای جلسات بدون تنظیم پویا: هر مدیرعامل فعال.
 */
export const resolveApprovalAuthority = (
  policy: ApprovalPolicy,
  decisions: ApprovalDecision[] = [],
  actor: User,
  legacyRoleFallback?: (actor: User) => boolean,
): ApprovalAuthority => {
  const evaluation = evaluateApproval(policy, decisions);
  if (evaluation.isSatisfied) return { allowed: false, reason: 'این مرحله قبلاً تکمیل شده است.' };
  const isListed = policy.approverUserIds.includes(actor.id);
  const alreadyApproved = evaluation.approvedIds.includes(actor.id);
  if (isListed && !alreadyApproved) {
    if (policy.mode === 'SEQUENTIAL' && evaluation.currentTurnId !== actor.id) {
      return { allowed: false, reason: 'هنوز نوبت تأیید شما نرسیده است.' };
    }
    return { allowed: true, approverUserId: actor.id };
  }
  if (isListed && alreadyApproved) return { allowed: false, reason: 'شما قبلاً تأیید کرده‌اید.' };
  if (legacyRoleFallback?.(actor)) return { allowed: true, approverUserId: actor.id };
  if (actor.role === 'ADMIN') {
    const target = evaluation.currentTurnId || evaluation.pendingIds[0];
    return { allowed: true, approverUserId: target || actor.id, onBehalfOf: Boolean(target && target !== actor.id) };
  }
  return { allowed: false, reason: 'شما جزو تأییدکنندگان این مرحله نیستید.' };
};

export const buildDecision = (
  actor: User,
  decision: ApprovalDecision['decision'],
  notes: string | undefined,
  approverUserId?: string,
): ApprovalDecision => {
  const now = nowParts();
  return {
    userId: actor.id,
    userName: actor.fullName,
    userTitle: actor.title,
    decision,
    notes: notes?.trim() || undefined,
    at: now.iso,
    dateJalali: now.date,
    timeString: now.time,
    ...(approverUserId && approverUserId !== actor.id ? { onBehalfOfUserId: approverUserId } : {}),
  };
};

/** نام کاربران برای نمایش (با حفظ ترتیب). */
export const namesOf = (ids: string[]): string[] => {
  const all = users();
  return ids.map((id) => all.find((user) => user.id === id)?.fullName || id);
};

export const describePolicy = (policy?: ApprovalPolicy): string => {
  if (!policy || policy.approverUserIds.length === 0) return 'بدون تأیید';
  const names = namesOf(policy.approverUserIds);
  if (names.length === 1) return names[0];
  return `${APPROVAL_MODE_LABELS[policy.mode]}: ${names.join('، ')}`;
};

/** همه کسانی که طبق گردش پویای جلسه نقشی دارند (برای Scope دیدن جلسه). */
export const meetingWorkflowParticipantIds = (meeting: Meeting): string[] => {
  const wf = meeting.workflow;
  if (!wf) return [];
  return Array.from(new Set([
    ...wf.agendaApproval.approverUserIds,
    ...(wf.minutesApproval?.approverUserIds || []),
    ...(wf.resolutionSignature?.signerUserIds || []),
    ...(wf.noticeSignerUserId ? [wf.noticeSignerUserId] : []),
  ]));
};
