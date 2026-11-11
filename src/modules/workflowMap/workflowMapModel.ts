/**
 * «نقشه گردش کار» — مدل Read-Only برای Demo.
 *
 * این ماژول هیچ Workflow، Status، Action یا Entity جدیدی نمی‌سازد. فقط
 * داده‌ای را که سامانه از قبل دارد می‌خواند و آن را به شکل یک نقشه مراحل
 * نمایش می‌دهد. هیچ تابعی در این فایل چیزی را ذخیره یا تغییر نمی‌دهد.
 *
 * کل قابلیت در همین پوشه ایزوله است؛ حذف پوشه و تنها نقطه اتصال آن در
 * App.tsx، سامانه را دست‌نخورده باقی می‌گذارد.
 */
import {
  AgendaItem,
  Meeting,
  Proposal,
  Resolution,
  ResolutionNotice,
  Task,
} from '../../types';

export type StepState =
  | 'DONE'      // ✓ انجام شده
  | 'CURRENT'   // ● مرحله فعلی
  | 'WAITING'   // ○ در انتظار
  | 'REJECTED'  // ✕ رد شده
  | 'RETURNED'  // ↩ برگشت برای اصلاح
  | 'SKIPPED';  // ‒ در این پرونده طی نشده

export const STEP_STATE_META: Record<StepState, { symbol: string; label: string; chip: string; dot: string }> = {
  DONE:     { symbol: '✓', label: 'انجام شده',        chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  CURRENT:  { symbol: '●', label: 'مرحله فعلی',       chip: 'bg-teal-50 text-teal-800 border-teal-300',          dot: 'bg-teal-600' },
  WAITING:  { symbol: '○', label: 'در انتظار',        chip: 'bg-slate-50 text-slate-500 border-slate-200',       dot: 'bg-slate-300' },
  REJECTED: { symbol: '✕', label: 'رد شده',           chip: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500' },
  RETURNED: { symbol: '↩', label: 'برگشت برای اصلاح', chip: 'bg-amber-50 text-amber-800 border-amber-200',       dot: 'bg-amber-500' },
  SKIPPED:  { symbol: '‒', label: 'طی نشده',          chip: 'bg-slate-50 text-slate-400 border-slate-200',       dot: 'bg-slate-200' },
};

export type PhaseId = 'PROPOSAL' | 'MEETING' | 'RESOLUTION' | 'NOTIFICATION' | 'EXECUTION' | 'CLOSED';

export const PHASES: { id: PhaseId; title: string }[] = [
  { id: 'PROPOSAL',     title: 'پیشنهاد' },
  { id: 'MEETING',      title: 'جلسه' },
  { id: 'RESOLUTION',   title: 'مصوبه' },
  { id: 'NOTIFICATION', title: 'ابلاغ' },
  { id: 'EXECUTION',    title: 'اجرا و پیگیری' },
  { id: 'CLOSED',       title: 'پایان' },
];

/**
 * تنها محل تعریف «مسئول هر مرحله». هیچ Componentی نام نقش‌ها را دوباره
 * Hardcode نمی‌کند؛ همه از همین‌جا می‌خوانند و نام واقعی شخص، هر جا در
 * داده موجود باشد، کنار همین برچسب نقش نمایش داده می‌شود.
 */
export const STEP_OWNERS = {
  PROPOSER: 'سازمان / واحد پیشنهاددهنده',
  OFFICE_MANAGER: 'مسئول دفتر',
  CEO: 'مدیرعامل',
  MEETING_SECRETARY: 'دبیر جلسه',
  SYSTEM_ADMIN: 'مدیر سیستم',
  ASSIGNEE: 'مجری مصوبه',
  VERIFIER: 'صحه‌گذار',
  CUSTOM_SIGNER: 'امضاکننده تعیین‌شده جلسه',
} as const;

export type StepOwnerKey = keyof typeof STEP_OWNERS;

/** یک مسیر ممکن از یک مرحله — فقط توضیحی، هرگز اجرا نمی‌شود. */
export interface StepBranch {
  action: string;
  outcome: string;
  /** وقتی مشخص است همین مسیر واقعاً طی شده است. */
  taken?: boolean;
}

export interface WorkflowStep {
  id: string;
  title: string;
  phase: PhaseId;
  ownerKey: StepOwnerKey;
  /** نام واقعی شخص/واحد از روی داده پرونده، اگر موجود باشد. */
  ownerName?: string;
  state: StepState;
  /** تاریخ شمسی وقوع مرحله، اگر در داده ثبت شده باشد. */
  dateJalali?: string;
  note?: string;
  branches?: StepBranch[];
}

export interface WorkflowCaseSummary {
  /** شناسه پایدار پرونده — بر پایه ID واقعی Entity ریشه، نه عنوان آن. */
  id: string;
  rootType: 'PROPOSAL' | 'MEETING' | 'RESOLUTION';
  rootId: string;
  title: string;
  /** شماره پرونده برای نمایش (شماره پیشنهاد/جلسه/مصوبه). */
  reference: string;
  currentPhase: PhaseId;
  currentStepTitle: string;
  updatedAt?: string;
}

export interface WorkflowCase extends WorkflowCaseSummary {
  steps: WorkflowStep[];
  /** موجودیت‌های واقعی مرتبط با این پرونده، برای نمایش زنجیره Relation. */
  relatedEntities: { label: string; value: string }[];
}

/** داده خامی که Visualizer از سرویس‌های موجود می‌گیرد — چیزی اضافه نمی‌کند. */
export interface WorkflowMapSource {
  proposals: Proposal[];
  meetings: Meeting[];
  resolutions: Resolution[];
  notices: ResolutionNotice[];
  tasks: Task[];
}

// ————————————————————————— helpers —————————————————————————

const findAgendaForProposal = (
  meetings: Meeting[],
  proposalId: string
): { meeting: Meeting; agenda: AgendaItem } | undefined => {
  for (const meeting of meetings) {
    const agenda = meeting.agendaItems.find((item) => item.sourceProposalId === proposalId);
    if (agenda) return { meeting, agenda };
  }
  return undefined;
};

const proposalHistoryDate = (proposal: Proposal, contains: string): string | undefined =>
  proposal.history?.find((entry) => entry.action.includes(contains))?.dateJalali;

/** وضعیت‌هایی که یعنی پیشنهاد از مرحله بررسی مدیرعامل عبور کرده است. */
const PAST_CEO_REVIEW: Proposal['status'][] = [
  'APPROVED', 'PENDING_SECRETARY_CONFIRMATION', 'RETURNED_BY_SECRETARY',
  'CONFIRMED_FOR_MEETING', 'CONVERTED_TO_AGENDA',
];

// ————————————————————— building the steps —————————————————————

const buildProposalSteps = (proposal: Proposal): WorkflowStep[] => {
  const status = proposal.status;
  const isRejected = status === 'REJECTED';
  const isReturned = status === 'RETURNED_FOR_REVISION' || status === 'RETURNED_BY_SECRETARY';
  const passedCeo = PAST_CEO_REVIEW.includes(status) || status === 'CEO_ORDER_ISSUED' || status === 'NO_BOARD_REQUIRED';

  const steps: WorkflowStep[] = [
    {
      id: 'proposal-register',
      title: 'ثبت پیشنهاد',
      phase: 'PROPOSAL',
      ownerKey: 'PROPOSER',
      ownerName: `${proposal.proposerName} — ${proposal.proposerDepartmentName}`,
      state: 'DONE',
      dateJalali: proposal.dateJalali,
      note: proposal.source === 'EXCEL_IMPORT' ? 'ثبت‌شده از طریق ورود گروهی Excel' : undefined,
    },
  ];

  // بررسی مدیرعامل — نقطه انشعاب اصلی پرونده
  const ceoState: StepState = isRejected
    ? 'REJECTED'
    : status === 'RETURNED_FOR_REVISION'
      ? 'RETURNED'
      : passedCeo
        ? 'DONE'
        : status === 'PENDING_CEO_REVIEW' || status === 'RESUBMITTED'
          ? 'CURRENT'
          : 'WAITING';
  steps.push({
    id: 'proposal-ceo-review',
    title: 'بررسی پیشنهاد',
    phase: 'PROPOSAL',
    ownerKey: 'CEO',
    state: ceoState,
    dateJalali: proposalHistoryDate(proposal, 'مدیرعامل'),
    note: status === 'RESUBMITTED' ? 'پس از اصلاح، مجدداً برای مدیرعامل ارسال شده است' : proposal.managementDecisionNotes,
    branches: [
      { action: 'تأیید', outcome: 'ورود به کارتابل مسئول دفتر برای تبدیل به تایید جلسه', taken: passedCeo || undefined },
      { action: 'رد', outcome: 'خاتمه بدون تشکیل جلسه', taken: isRejected || undefined },
      { action: 'برگشت برای اصلاح', outcome: 'بازگشت به پیشنهاددهنده جهت اصلاح و ارسال مجدد', taken: status === 'RETURNED_FOR_REVISION' || undefined },
      { action: 'عدم نیاز به طرح در هیأت‌مدیره', outcome: 'پایان مسیر پیشنهاد (قابل بازیابی)', taken: status === 'NO_BOARD_REQUIRED' || undefined },
      { action: 'صدور دستور مستقیم', outcome: 'تبدیل به دستور مدیرعامل و ارجاع مستقیم به مجری', taken: status === 'CEO_ORDER_ISSUED' || undefined },
    ],
  });

  if (status === 'NO_BOARD_REQUIRED' || status === 'CEO_ORDER_ISSUED') {
    steps.push({
      id: 'proposal-direct-outcome',
      title: status === 'CEO_ORDER_ISSUED' ? 'دستور مستقیم مدیرعامل' : 'خاتمه بدون طرح در جلسه',
      phase: 'CLOSED',
      ownerKey: status === 'CEO_ORDER_ISSUED' ? 'ASSIGNEE' : 'CEO',
      ownerName: proposal.ceoOrder?.assigneeName,
      state: 'CURRENT',
      note: proposal.ceoOrder?.text,
    });
    return steps;
  }

  // تبدیل به تایید جلسه توسط مسئول دفتر
  const officeDone = ['PENDING_SECRETARY_CONFIRMATION', 'RETURNED_BY_SECRETARY', 'CONFIRMED_FOR_MEETING', 'CONVERTED_TO_AGENDA'].includes(status);
  steps.push({
    id: 'proposal-office-confirm',
    title: 'تبدیل به تایید جلسه',
    phase: 'PROPOSAL',
    ownerKey: 'OFFICE_MANAGER',
    state: isRejected ? 'SKIPPED'
      : officeDone ? 'DONE'
      : status === 'APPROVED' ? 'CURRENT'
      : status === 'RETURNED_BY_SECRETARY' ? 'CURRENT'
      : 'WAITING',
    dateJalali: proposal.confirmedDateJalali,
    note: proposal.confirmedPresenterName ? `ارائه‌دهنده تعیین‌شده: ${proposal.confirmedPresenterName}` : undefined,
  });

  // تأیید نهایی دبیر جلسه
  const secretaryDone = ['CONFIRMED_FOR_MEETING', 'CONVERTED_TO_AGENDA'].includes(status);
  steps.push({
    id: 'proposal-secretary-confirm',
    title: 'تأیید نهایی تایید جلسه',
    phase: 'PROPOSAL',
    ownerKey: 'MEETING_SECRETARY',
    state: isRejected ? 'SKIPPED'
      : secretaryDone ? 'DONE'
      : status === 'PENDING_SECRETARY_CONFIRMATION' ? 'CURRENT'
      : status === 'RETURNED_BY_SECRETARY' ? 'RETURNED'
      : 'WAITING',
    note: status === 'RETURNED_BY_SECRETARY' ? 'دبیر جلسه «جهت اصلاح» زده؛ پرونده در کارتابل مسئول دفتر است' : undefined,
    branches: [
      { action: 'تأیید نهایی', outcome: 'آماده افزودن به دستور یک جلسه', taken: secretaryDone || undefined },
      { action: 'برگشت جهت اصلاح', outcome: 'بازگشت به مسئول دفتر و سپس پیشنهاددهنده', taken: status === 'RETURNED_BY_SECRETARY' || undefined },
      { action: 'رد', outcome: 'پایان مسیر پیشنهاد', taken: undefined },
    ],
  });

  return steps;
};

const buildMeetingSteps = (meeting: Meeting | undefined, agenda: AgendaItem | undefined): WorkflowStep[] => {
  if (!meeting) {
    return [{
      id: 'meeting-pending',
      title: 'افزودن به دستور جلسه',
      phase: 'MEETING',
      ownerKey: 'OFFICE_MANAGER',
      state: 'WAITING',
    }];
  }

  const status = meeting.status;
  const agendaApproved = ['READY_FOR_INVITATION', 'INVITATION_SENT', 'SCHEDULED', 'IN_PROGRESS', 'HELD'].includes(status);
  const invitationSent = ['INVITATION_SENT', 'SCHEDULED', 'IN_PROGRESS', 'HELD'].includes(status);
  const held = status === 'HELD';
  const cancelled = status === 'CANCELLED';

  const steps: WorkflowStep[] = [
    {
      id: 'meeting-agenda',
      title: 'تنظیم دستور جلسه',
      phase: 'MEETING',
      ownerKey: 'OFFICE_MANAGER',
      ownerName: meeting.secretaryName,
      state: cancelled ? 'SKIPPED' : 'DONE',
      dateJalali: meeting.dateJalali,
      note: `${meeting.meetingNumber} — ${meeting.title}`,
    },
    {
      id: 'meeting-ceo-approval',
      title: 'تأیید دستور جلسه',
      phase: 'MEETING',
      ownerKey: 'CEO',
      ownerName: meeting.organizerName,
      state: cancelled ? 'SKIPPED'
        : agendaApproved ? 'DONE'
        : status === 'WAITING_FOR_CEO_APPROVAL' ? 'CURRENT'
        : status === 'AGENDA_RETURNED' ? 'RETURNED'
        : 'WAITING',
      branches: [
        { action: 'تأیید دستورکار', outcome: 'ارسال خودکار دعوت‌نامه به اعضا و مدعوین', taken: agendaApproved || undefined },
        { action: 'برگشت دستورکار', outcome: 'بازگشت به مسئول دفتر برای اصلاح دستور جلسه', taken: status === 'AGENDA_RETURNED' || undefined },
        { action: 'حذف یک بند', outcome: 'خروج آن بند از دستور جلسه جاری', taken: agenda?.isRemoved || undefined },
      ],
    },
    {
      id: 'meeting-invitation',
      title: 'ارسال دعوت‌نامه',
      phase: 'MEETING',
      ownerKey: 'MEETING_SECRETARY',
      ownerName: meeting.secretaryName,
      state: cancelled ? 'SKIPPED' : invitationSent ? 'DONE' : agendaApproved ? 'CURRENT' : 'WAITING',
      note: meeting.invitationSignature ? 'دعوت‌نامه توسط دبیر جلسه امضا شده است' : undefined,
    },
    {
      id: 'meeting-held',
      title: 'برگزاری جلسه و ثبت نتیجه بند',
      phase: 'MEETING',
      ownerKey: 'MEETING_SECRETARY',
      ownerName: meeting.secretaryName,
      state: cancelled ? 'REJECTED'
        : agenda?.outcomeStatus ? 'DONE'
        : held ? 'DONE'
        : invitationSent ? 'CURRENT'
        : 'WAITING',
      note: agenda?.outcomeNotes,
      branches: agenda ? [
        { action: 'تصویب', outcome: 'امکان ثبت مصوبه برای این بند', taken: agenda.outcomeStatus === 'APPROVED' || agenda.outcomeStatus === 'CONDITIONAL' || undefined },
        { action: 'عدم تصویب', outcome: 'بند بدون مصوبه بسته می‌شود', taken: agenda.outcomeStatus === 'NOT_APPROVED' || undefined },
        { action: 'موکول به جلسه بعد', outcome: 'انتقال بند به دستور جلسه آینده', taken: agenda.outcomeStatus === 'DEFERRED' || undefined },
        { action: 'ارجاع به واحد مربوطه', outcome: 'خروج از مسیر مصوبه و ارجاع اداری', taken: agenda.outcomeStatus === 'REFERRED' || undefined },
      ] : undefined,
    },
  ];

  return steps;
};

const buildResolutionSteps = (
  resolution: Resolution | undefined,
  notice: ResolutionNotice | undefined,
  tasks: Task[]
): WorkflowStep[] => {
  if (!resolution) {
    return [{
      id: 'resolution-pending',
      title: 'ثبت مصوبه',
      phase: 'RESOLUTION',
      ownerKey: 'OFFICE_MANAGER',
      state: 'WAITING',
    }];
  }

  const exec = resolution.executionStatus;
  const signature = resolution.signatureWorkflow;
  const signaturesDone = signature?.status === 'COMPLETED';

  const steps: WorkflowStep[] = [
    {
      id: 'resolution-created',
      title: 'ثبت مصوبه',
      phase: 'RESOLUTION',
      ownerKey: 'OFFICE_MANAGER',
      state: 'DONE',
      dateJalali: resolution.assignedDateJalali,
      note: `${resolution.resolutionNumber} — ${resolution.topicTitle}`,
    },
  ];

  // سه امضای اصلی مصوبه — از روی همان steps واقعی
  (signature?.steps || []).forEach((step) => {
    steps.push({
      id: `resolution-signature-${step.id}`,
      title: `امضای ${step.signerTitle}`,
      phase: 'RESOLUTION',
      ownerKey: step.signerRole === 'CEO' ? 'CEO' : step.signerRole === 'ADMIN' ? 'SYSTEM_ADMIN' : step.signerRole === 'CUSTOM' ? 'CUSTOM_SIGNER' : 'OFFICE_MANAGER',
      ownerName: step.signerName,
      state: step.status === 'SIGNED' ? 'DONE' : step.status === 'PENDING' ? 'CURRENT' : 'WAITING',
      dateJalali: step.signedDateJalali,
    });
  });

  const notified = Boolean(resolution.notifiedAt);
  const noticeSigned = Boolean(notice?.secretarySignature);
  const inExecution = ['NOTIFIED', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'DONE_BY_ASSIGNEE', 'PENDING_APPROVAL', 'APPROVED_CLOSED', 'REJECTED_RETURNED', 'OVERDUE'].includes(exec);

  steps.push({
    id: 'resolution-notify',
    title: 'ابلاغ رسمی مصوبه',
    phase: 'NOTIFICATION',
    ownerKey: 'OFFICE_MANAGER',
    ownerName: resolution.notifiedByName,
    state: notified ? 'DONE' : exec === 'WAITING_NOTIFICATION' ? 'CURRENT' : signaturesDone ? 'CURRENT' : 'WAITING',
    dateJalali: resolution.notifiedDateJalali,
    note: resolution.notificationLetterNumber
      ? `شماره نامه ابلاغیه: ${resolution.notificationLetterNumber}${resolution.notifiedTimeString ? ` — ساعت ${resolution.notifiedTimeString}` : ''}`
      : undefined,
  });

  steps.push({
    id: 'resolution-notice-signature',
    title: 'امضای ابلاغیه',
    phase: 'NOTIFICATION',
    ownerKey: 'MEETING_SECRETARY',
    ownerName: notice?.secretarySignature?.signerName || notice?.secretaryName,
    state: noticeSigned ? 'DONE' : exec === 'PENDING_SECRETARY_NOTICE_SIGNATURE' ? 'CURRENT' : 'WAITING',
    dateJalali: notice?.secretarySignature?.signedDateJalali,
    note: noticeSigned ? undefined : 'تا پیش از این امضا، مصوبه وارد فاز اجرا نمی‌شود',
  });

  const task = tasks.find((item) => item.resolutionId === resolution.id);
  steps.push({
    id: 'resolution-execution',
    title: 'اجرای مصوبه',
    phase: 'EXECUTION',
    ownerKey: 'ASSIGNEE',
    ownerName: resolution.mainResponsibleName
      ? `${resolution.mainResponsibleName}${resolution.responsibleDepartmentName ? ` — ${resolution.responsibleDepartmentName}` : ''}`
      : undefined,
    state: ['DONE_BY_ASSIGNEE', 'PENDING_APPROVAL', 'APPROVED_CLOSED'].includes(exec) ? 'DONE'
      : exec === 'REJECTED_RETURNED' ? 'RETURNED'
      : inExecution ? 'CURRENT'
      : 'WAITING',
    dateJalali: resolution.deadlineJalali ? undefined : undefined,
    note: task ? `مهلت اقدام: ${task.deadlineJalali}` : resolution.deadlineJalali ? `مهلت اقدام: ${resolution.deadlineJalali}` : undefined,
    branches: [
      { action: 'اعلام اتمام توسط مجری', outcome: 'ورود به کارتابل صحه‌گذاری (در صورت نیاز)', taken: ['DONE_BY_ASSIGNEE', 'PENDING_APPROVAL', 'APPROVED_CLOSED'].includes(exec) || undefined },
      { action: 'ثبت گزارش پیشرفت', outcome: 'ادامه اجرا و ثبت در تاریخچه مصوبه', taken: undefined },
    ],
  });

  if (resolution.verificationConfig?.requiresVerification) {
    steps.push({
      id: 'resolution-verification',
      title: 'صحه‌گذاری',
      phase: 'EXECUTION',
      ownerKey: 'VERIFIER',
      ownerName: resolution.verificationConfig.steps?.[0]?.approverName,
      state: exec === 'APPROVED_CLOSED' ? 'DONE'
        : exec === 'REJECTED_RETURNED' ? 'RETURNED'
        : exec === 'PENDING_APPROVAL' ? 'CURRENT'
        : 'WAITING',
      branches: [
        { action: 'تأیید', outcome: 'خاتمه مصوبه', taken: exec === 'APPROVED_CLOSED' || undefined },
        { action: 'رد و بازگشت', outcome: 'بازگشت به مجری برای رفع ایراد', taken: exec === 'REJECTED_RETURNED' || undefined },
      ],
    });
  }

  steps.push({
    id: 'resolution-closed',
    title: 'خاتمه مصوبه',
    phase: 'CLOSED',
    ownerKey: 'OFFICE_MANAGER',
    state: exec === 'APPROVED_CLOSED' ? 'DONE' : exec === 'ARCHIVED' ? 'DONE' : 'WAITING',
  });

  return steps;
};

// ————————————————————— assembling a case —————————————————————

const summarise = (steps: WorkflowStep[]) => {
  const current = steps.find((step) => step.state === 'CURRENT')
    || steps.find((step) => step.state === 'RETURNED')
    || steps.find((step) => step.state === 'REJECTED')
    || [...steps].reverse().find((step) => step.state === 'DONE');
  return {
    currentPhase: current?.phase || 'PROPOSAL',
    currentStepTitle: current?.title || '—',
  };
};

/**
 * ساخت نقشه یک پرونده با دنبال کردن Relationهای واقعی:
 * Proposal → AgendaItem.sourceProposalId → Meeting → Resolution.agendaItemId
 * → Signatures → ResolutionNotice → امضای دبیر جلسه → Task اجرا
 */
export const buildCaseFromProposal = (proposal: Proposal, source: WorkflowMapSource): WorkflowCase => {
  const link = findAgendaForProposal(source.meetings, proposal.id)
    || (proposal.assignedMeetingId
      ? (() => {
          const meeting = source.meetings.find((item) => item.id === proposal.assignedMeetingId);
          return meeting ? { meeting, agenda: undefined as unknown as AgendaItem } : undefined;
        })()
      : undefined);

  const meeting = link?.meeting;
  const agenda = link?.agenda;
  const resolution = agenda
    ? source.resolutions.find((item) => item.agendaItemId === agenda.id)
    : undefined;
  const notice = resolution ? source.notices.find((item) => item.resolutionId === resolution.id) : undefined;

  const reachedMeeting = proposal.status === 'CONVERTED_TO_AGENDA' || Boolean(meeting);
  const steps = [
    ...buildProposalSteps(proposal),
    ...(reachedMeeting ? buildMeetingSteps(meeting, agenda) : []),
    ...(resolution ? buildResolutionSteps(resolution, notice, source.tasks) : []),
  ];

  const relatedEntities: { label: string; value: string }[] = [
    { label: 'پیشنهاد', value: proposal.proposalNumber || proposal.title },
  ];
  if (meeting) relatedEntities.push({ label: 'جلسه', value: `${meeting.meetingNumber} — ${meeting.title}` });
  if (agenda) relatedEntities.push({ label: 'بند دستور جلسه', value: agenda.title });
  if (resolution) relatedEntities.push({ label: 'مصوبه', value: resolution.resolutionNumber });
  if (notice?.notificationLetterNumber) relatedEntities.push({ label: 'شماره نامه ابلاغیه', value: notice.notificationLetterNumber });

  return {
    id: `proposal:${proposal.id}`,
    rootType: 'PROPOSAL',
    rootId: proposal.id,
    title: proposal.title,
    reference: proposal.proposalNumber || '—',
    updatedAt: proposal.updatedAt || proposal.createdAt,
    steps,
    relatedEntities,
    ...summarise(steps),
  };
};

/** جلسه‌ای که از هیچ پیشنهادی نیامده — پرونده مستقل خودش را دارد. */
export const buildCaseFromMeeting = (meeting: Meeting, source: WorkflowMapSource): WorkflowCase => {
  const resolutions = source.resolutions.filter((item) => item.meetingId === meeting.id);
  const resolution = resolutions[0];
  const notice = resolution ? source.notices.find((item) => item.resolutionId === resolution.id) : undefined;
  const steps = [
    ...buildMeetingSteps(meeting, meeting.agendaItems[0]),
    ...(resolution ? buildResolutionSteps(resolution, notice, source.tasks) : []),
  ];
  const relatedEntities = [{ label: 'جلسه', value: `${meeting.meetingNumber} — ${meeting.title}` }];
  if (resolution) relatedEntities.push({ label: 'مصوبه', value: resolution.resolutionNumber });
  return {
    id: `meeting:${meeting.id}`,
    rootType: 'MEETING',
    rootId: meeting.id,
    title: meeting.title,
    reference: meeting.meetingNumber,
    updatedAt: meeting.createdAt,
    steps,
    relatedEntities,
    ...summarise(steps),
  };
};

/** مصوبه‌ای که از مسیر پیشنهاد/جلسهِ قابل ردیابی نیامده. */
export const buildCaseFromResolution = (resolution: Resolution, source: WorkflowMapSource): WorkflowCase => {
  const notice = source.notices.find((item) => item.resolutionId === resolution.id);
  const steps = buildResolutionSteps(resolution, notice, source.tasks);
  return {
    id: `resolution:${resolution.id}`,
    rootType: 'RESOLUTION',
    rootId: resolution.id,
    title: resolution.topicTitle,
    reference: resolution.resolutionNumber,
    updatedAt: resolution.createdAt,
    steps,
    relatedEntities: [{ label: 'مصوبه', value: resolution.resolutionNumber }],
    ...summarise(steps),
  };
};

/**
 * همه پرونده‌های قابل نمایش. هر پرونده وضعیت مستقل خودش را دارد و با ID
 * واقعی Entity ریشه شناسایی می‌شود، پس انتخاب یک پرونده هرگز وضعیت
 * پرونده دیگری را Reset نمی‌کند.
 */
export const buildWorkflowCases = (source: WorkflowMapSource): WorkflowCase[] => {
  const cases: WorkflowCase[] = source.proposals.map((proposal) => buildCaseFromProposal(proposal, source));

  const meetingsInCases = new Set(
    source.meetings
      .filter((meeting) => meeting.agendaItems.some((agenda) => agenda.sourceProposalId))
      .map((meeting) => meeting.id)
  );
  source.meetings
    .filter((meeting) => !meetingsInCases.has(meeting.id))
    .forEach((meeting) => cases.push(buildCaseFromMeeting(meeting, source)));

  const coveredResolutionIds = new Set(
    source.resolutions
      .filter((resolution) => source.meetings.some((meeting) => meeting.id === resolution.meetingId))
      .map((resolution) => resolution.id)
  );
  source.resolutions
    .filter((resolution) => !coveredResolutionIds.has(resolution.id))
    .forEach((resolution) => cases.push(buildCaseFromResolution(resolution, source)));

  return cases.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
};
