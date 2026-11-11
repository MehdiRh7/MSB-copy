import type { AppRoute } from '../../context/AppContext';
import { mockApprovals, mockActivityLogs, mockMeetings, mockResolutions, mockTasks } from '../../mock/data';
import { loadLocalCollection, loadLocalValue } from '../../services/localStore';
import { getAgendaApprovalPolicy, resolveApprovalAuthority } from '../../services/workflowPolicyService';
import { hasOrgWideMeetingAccess, hasOrgWideResolutionAccess, isMeetingRelatedToUser, isResolutionRelatedToUser } from '../../services/userScope';
import type { ActivityLog, ApprovalCartableItem, BoardMinutes, Meeting, Proposal, Resolution, ResolutionNotice, Task, User } from '../../types';
import { jalaliToGregorian, parseJalali, todayJalali } from '../../utils/jalaliDate';

/**
 * همه اعداد داشبورد از همان collectionهای localStorage محاسبه می‌شوند که
 * فهرست جلسات، بانک مصوبات، کارتابل‌ها و گزارش‌ها از آنها می‌خوانند؛ هیچ
 * عدد ثابت یا ساختگی در این فایل وجود ندارد.
 */

export type DashboardPersona = 'EXECUTIVE' | 'OFFICE' | 'SECRETARY' | 'ASSIGNEE' | 'AUDITOR' | 'ADMIN' | 'STAFF';
export type ActionTone = 'danger' | 'warning' | 'primary' | 'neutral';

export interface DashboardActionItem {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  date?: string;
  tone: ActionTone;
  route: AppRoute;
  params?: { meetingId?: string; resolutionId?: string };
  cta: string;
  weight: number;
}

export interface UnitSummaryRow { name: string; total: number; active: number; overdue: number; closed: number; avgProgress: number }

export interface DashboardModel {
  hasAnyData: boolean;
  persona: DashboardPersona;
  today: string;
  upcomingMeetings: Meeting[];
  actionItems: DashboardActionItem[];
  inExecution: Resolution[];
  overdue: Resolution[];
  myTasks: (Task & { daysLeft: number | null })[];
  activity: ActivityLog[];
  units: UnitSummaryRow[];
  statusBreakdown: { key: string; label: string; value: number; color: string }[];
  performance: { total: number; closed: number; closedOnTime: number; avgProgress: number } | null;
  proposalPipeline: { label: string; value: number; route: AppRoute }[];
  counts: { meetingsThisMonth: number; activeResolutions: number; awaitingSignature: number; awaitingNotice: number; pendingVerification: number; overdue: number };
}

const CLOSED = ['APPROVED_CLOSED', 'ARCHIVED'];
const SIGNATURE_STATES = ['PENDING_OFFICE_SIGNATURE', 'PENDING_CEO_SIGNATURE', 'PENDING_ADMIN_SIGNATURE', 'PENDING_SIGNATURES'];
const EXECUTION_STATES = ['NOTIFIED', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'DONE_BY_ASSIGNEE', 'REJECTED_RETURNED', 'NOT_STARTED'];

const toDate = (value?: string): Date | null => {
  const parts = parseJalali(value);
  if (!parts) return null;
  const [gy, gm, gd] = jalaliToGregorian(parts.year, parts.month, parts.day);
  return new Date(gy, gm - 1, gd);
};

/** فاصله روز تقویمی از امروز تا تاریخ شمسی (منفی = گذشته). */
export const daysFromToday = (value?: string): number | null => {
  const target = toDate(value);
  const today = toDate(todayJalali());
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const sortKey = (date?: string, time?: string) => {
  const dt = toDate(date);
  const digits = (time || '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[^\d]/g, '').padEnd(4, '0');
  return (dt ? dt.getTime() : 0) + Number(digits.slice(0, 4) || 0);
};

export const getPersona = (user: User): DashboardPersona => {
  const perms = user.permissions || [];
  if (user.role === 'ADMIN') return 'ADMIN';
  if (user.role === 'CEO' || user.role === 'DEPT_MANAGER') return 'EXECUTIVE';
  if (user.role === 'AUDITOR') return 'AUDITOR';
  if (user.role === 'SECRETARY') return perms.includes('NOTIFY_RESOLUTION') ? 'OFFICE' : 'SECRETARY';
  if (user.role === 'EXPERT_ASSIGNEE') return 'ASSIGNEE';
  return 'STAFF';
};

export const hasAnyOperationalData = (): boolean =>
  ['proposals', 'meetings', 'resolutions', 'tasks'].some((key) => {
    const list = loadLocalValue<unknown[]>(key, []);
    return Array.isArray(list) && list.length > 0;
  });

export const buildDashboardModel = (user: User): DashboardModel => {
  const today = todayJalali();
  const persona = getPersona(user);
  const perms = user.permissions || [];
  const hasAnyData = hasAnyOperationalData();

  const allMeetings = loadLocalCollection<Meeting[]>('meetings', mockMeetings);
  const allResolutions = loadLocalCollection<Resolution[]>('resolutions', mockResolutions).filter((r) => !r.archive);
  const allTasks = loadLocalCollection<Task[]>('tasks', mockTasks);
  const approvals = loadLocalCollection<ApprovalCartableItem[]>('approvals', mockApprovals);
  const notices = loadLocalCollection<ResolutionNotice[]>('resolutionNotices', []);
  const logs = loadLocalCollection<ActivityLog[]>('activityLogs', mockActivityLogs);
  const proposals = loadLocalValue<Proposal[]>('proposals', []);

  // همان قواعد دسترسی سرویس‌ها: دید سازمانی یا فقط موارد مرتبط.
  const meetings = hasOrgWideMeetingAccess(user.role) ? allMeetings : allMeetings.filter((m) => isMeetingRelatedToUser(m, user.id));
  const resolutions = hasOrgWideResolutionAccess(user)
    ? allResolutions
    : allResolutions.filter((r) => isResolutionRelatedToUser(r, user));

  const upcomingMeetings = meetings
    .filter((m) => m.status !== 'CANCELLED' && m.status !== 'HELD' && (daysFromToday(m.dateJalali) ?? -1) >= 0)
    .sort((a, b) => sortKey(a.dateJalali, a.startTime) - sortKey(b.dateJalali, b.startTime));

  const isOverdue = (r: Resolution) => r.executionStatus === 'OVERDUE' || (!CLOSED.includes(r.executionStatus) && r.executionStatus !== 'PENDING_APPROVAL' && EXECUTION_STATES.includes(r.executionStatus) && (daysFromToday(r.deadlineJalali) ?? 0) < 0);
  const overdue = resolutions.filter(isOverdue).sort((a, b) => (daysFromToday(a.deadlineJalali) ?? 0) - (daysFromToday(b.deadlineJalali) ?? 0));
  const inExecution = resolutions.filter((r) => EXECUTION_STATES.includes(r.executionStatus) && !isOverdue(r)).sort((a, b) => (daysFromToday(a.deadlineJalali) ?? 999) - (daysFromToday(b.deadlineJalali) ?? 999));

  // ——— اقدام‌های منتظر همین کاربر ———
  const items: DashboardActionItem[] = [];
  const myTasksRaw = allTasks.filter((t) => t.assignedToUserId === user.id && !['CLOSED', 'COMPLETED', 'PENDING_APPROVAL'].includes(t.status));
  myTasksRaw.forEach((t) => {
    const left = daysFromToday(t.deadlineJalali);
    const late = t.status === 'OVERDUE' || (left !== null && left < 0);
    items.push({ id: `task-${t.id}`, kind: late ? 'وظیفه معوق' : 'وظیفه اجرایی', title: t.resolutionTitle, subtitle: `${t.resolutionNumber} · مهلت ${t.deadlineJalali}`, date: t.deadlineJalali, tone: late ? 'danger' : left !== null && left <= 7 ? 'warning' : 'primary', route: 'tasks', cta: late ? 'ثبت گزارش پیشرفت' : 'مشاهده وظیفه', weight: late ? 100 : 60 - Math.min(left ?? 30, 30) });
  });
  allResolutions.forEach((r) => {
    // زنجیره موازی: هر امضای باز این کاربر؛ ترتیبی: فقط مرحله جاری.
    const step = r.signatureWorkflow && r.signatureWorkflow.status !== 'COMPLETED'
      ? (r.signatureWorkflow.mode === 'PARALLEL'
          ? r.signatureWorkflow.steps.find((s) => s.status === 'PENDING' && s.signerUserId === user.id)
          : r.signatureWorkflow.steps[r.signatureWorkflow.currentStepIndex])
      : undefined;
    if (step && step.status === 'PENDING' && step.signerUserId === user.id) items.push({ id: `sig-${r.id}`, kind: 'امضای مصوبه', title: r.topicTitle, subtitle: `${r.resolutionNumber} · ${r.meetingTitle}`, tone: 'warning', route: 'resolutions', params: { resolutionId: r.id }, cta: 'بررسی و امضا', weight: 90 });
    if (r.executionStatus === 'WAITING_NOTIFICATION' && perms.includes('NOTIFY_RESOLUTION')) items.push({ id: `notify-${r.id}`, kind: 'آماده ابلاغ', title: r.topicTitle, subtitle: `${r.resolutionNumber} · مجری: ${r.mainResponsibleName || '—'}`, tone: 'primary', route: 'notification-inbox', cta: 'ثبت ابلاغ', weight: 75 });
    if (r.executionStatus === 'PENDING_SECRETARY_NOTICE_SIGNATURE') {
      const notice = notices.find((n) => n.resolutionId === r.id);
      if (notice?.secretaryUserId === user.id || (!notice?.secretaryUserId && meetings.find((m) => m.id === r.meetingId)?.secretaryId === user.id)) items.push({ id: `nsig-${r.id}`, kind: 'امضای ابلاغیه', title: r.topicTitle, subtitle: `${notice?.notificationLetterNumber || r.resolutionNumber}`, tone: 'warning', route: 'notification-inbox', cta: 'امضای ابلاغیه', weight: 85 });
    }
  });
  approvals.filter((a) => a.status === 'PENDING' && a.assignedApproverId === user.id).forEach((a) => items.push({ id: `appr-${a.id}`, kind: 'صحه‌گذاری', title: a.resolutionTitle, subtitle: `${a.resolutionNumber} · مجری: ${a.responsibleName}`, date: a.submittedForApprovalDateJalali, tone: 'warning', route: 'approvals', cta: 'بررسی مستندات', weight: 88 }));
  const isOfficeManager = persona === 'OFFICE' || user.role === 'ADMIN';
  const isCeo = user.role === 'CEO';
  proposals.forEach((p) => {
    if (isCeo && ['PENDING_CEO_REVIEW', 'RESUBMITTED'].includes(p.status)) items.push({ id: `pceo-${p.id}`, kind: 'تصمیم درباره پیشنهاد', title: p.title, subtitle: `${p.proposerName} · ${p.proposerDepartmentName}`, date: p.dateJalali, tone: 'warning', route: 'proposals', cta: 'بررسی و تصمیم', weight: 80 });
    if (persona === 'OFFICE' && p.status === 'RETURNED_BY_SECRETARY') items.push({ id: `poff-${p.id}`, kind: 'برگشتی از دبیر جلسه', title: p.title, subtitle: `${p.proposerName} · ${p.dateJalali}`, date: p.dateJalali, tone: 'primary', route: 'proposals', cta: 'بررسی پیشنهاد', weight: 70 });
    if (persona === 'OFFICE' && p.status === 'APPROVED') items.push({ id: `pconv-${p.id}`, kind: 'تبدیل به تأیید جلسه', title: p.title, subtitle: 'تأییدشده توسط مدیرعامل', date: p.dateJalali, tone: 'primary', route: 'proposals', cta: 'ادامه گردش', weight: 65 });
    if (perms.includes('APPROVE_MEETING_CONFIRMATION') && p.status === 'PENDING_SECRETARY_CONFIRMATION') items.push({ id: `psec-${p.id}`, kind: 'تأیید نهایی دبیر', title: p.title, subtitle: `${p.proposerName} · ${p.proposerDepartmentName}`, date: p.dateJalali, tone: 'warning', route: 'proposals', cta: 'تأیید برای جلسه', weight: 78 });
  });
  // گردش کار پویا: تأییدکننده دستورکار هر کسی است که در سیاست همان جلسه
  // نوبت/حق تأیید دارد (جلسات قدیمی: مدیرعامل).
  meetings.filter((m) => m.status === 'WAITING_FOR_CEO_APPROVAL' && user.role !== 'ADMIN' && resolveApprovalAuthority(getAgendaApprovalPolicy(m), m.agendaDecisions || [], user, m.workflow ? undefined : (u) => u.role === 'CEO').allowed).forEach((m) => items.push({ id: `magenda-${m.id}`, kind: 'تأیید دستور جلسه', title: m.title, subtitle: `${m.dateJalali} · ساعت ${m.startTime}`, date: m.dateJalali, tone: 'warning', route: 'meeting-details', params: { meetingId: m.id }, cta: 'بررسی دستور جلسه', weight: 82 }));
  // تأیید صورت‌جلسه طبق گردش اختصاصی جلسه.
  loadLocalCollection<BoardMinutes[]>('boardMinutes', []).filter((bm) => ['WAITING_SIGNATURES', 'PARTIALLY_SIGNED'].includes(bm.status)).forEach((bm) => {
    const meeting = meetings.find((m) => m.id === bm.meetingId);
    const policy = meeting?.workflow?.minutesApproval;
    if (meeting && policy?.approverUserIds.length && user.role !== 'ADMIN' && resolveApprovalAuthority(policy, bm.approvals || [], user).allowed) items.push({ id: `minutes-${bm.id}`, kind: 'تأیید صورت‌جلسه', title: meeting.title, subtitle: `${meeting.meetingNumber} · ${meeting.dateJalali}`, date: meeting.dateJalali, tone: 'warning', route: 'meeting-details', params: { meetingId: meeting.id }, cta: 'بررسی صورت‌جلسه', weight: 83 });
  });
  if (isOfficeManager) resolutions.filter((r) => r.followUp?.enabled && !CLOSED.includes(r.executionStatus) && r.followUp.nextFollowUpDateJalali && (daysFromToday(r.followUp.nextFollowUpDateJalali) ?? 99) <= 2 && perms.includes('VIEW_RESOLUTION_FOLLOWUP')).forEach((r) => items.push({ id: `fu-${r.id}`, kind: 'پیگیری دوره‌ای', title: r.topicTitle, subtitle: `موعد پیگیری ${r.followUp!.nextFollowUpDateJalali}`, tone: 'neutral', route: 'follow-up', cta: 'ثبت پیگیری', weight: 50 }));
  const actionItems = items.filter((i, idx) => items.findIndex((x) => x.id === i.id) === idx).sort((a, b) => b.weight - a.weight);

  const myTasks = allTasks
    .filter((t) => t.assignedToUserId === user.id && t.status !== 'CLOSED')
    .map((t) => ({ ...t, daysLeft: daysFromToday(t.deadlineJalali) }))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  // ——— فعالیت‌های اخیر، فقط روی پرونده‌هایی که کاربر می‌بیند ———
  const visibleIds = new Set([...meetings.map((m) => m.id), ...resolutions.map((r) => r.id)]);
  const activity = logs.filter((l) => visibleIds.has(l.targetId)).sort((a, b) => sortKey(b.timestampJalali, b.timeString) - sortKey(a.timestampJalali, a.timeString)).slice(0, 6);

  // ——— خلاصه واحدها ———
  const unitMap = new Map<string, UnitSummaryRow & { progressSum: number }>();
  resolutions.filter((r) => r.approvalStatus === 'APPROVED' && r.responsibleDepartmentName).forEach((r) => {
    const row = unitMap.get(r.responsibleDepartmentName!) || { name: r.responsibleDepartmentName!, total: 0, active: 0, overdue: 0, closed: 0, avgProgress: 0, progressSum: 0 };
    row.total += 1;
    if (isOverdue(r)) row.overdue += 1; else if (CLOSED.includes(r.executionStatus)) row.closed += 1; else row.active += 1;
    row.progressSum += CLOSED.includes(r.executionStatus) ? 100 : r.progressPercent || 0;
    unitMap.set(row.name, row);
  });
  const units = [...unitMap.values()].map(({ progressSum, ...row }) => ({ ...row, avgProgress: row.total ? Math.round(progressSum / row.total) : 0 })).sort((a, b) => b.overdue - a.overdue || b.total - a.total);

  const approved = resolutions.filter((r) => r.approvalStatus === 'APPROVED');
  const group = (keys: string[]) => approved.filter((r) => keys.includes(r.executionStatus) && !isOverdue(r)).length;
  const statusBreakdown = [
    { key: 'sign', label: 'در گردش امضا', value: group(SIGNATURE_STATES), color: '#8aa9e6' },
    { key: 'notice', label: 'در انتظار ابلاغ', value: group(['WAITING_NOTIFICATION', 'PENDING_SECRETARY_NOTICE_SIGNATURE']), color: '#5b8def' },
    { key: 'exec', label: 'در حال اجرا', value: group(EXECUTION_STATES), color: '#1d5fd1' },
    { key: 'verify', label: 'در انتظار صحه‌گذاری', value: group(['PENDING_APPROVAL']), color: '#0b3b8f' },
    { key: 'overdue', label: 'معوق', value: approved.filter(isOverdue).length, color: '#dc2626' },
    { key: 'closed', label: 'خاتمه‌یافته', value: group(CLOSED), color: '#16a34a' },
  ].filter((s) => s.value > 0);

  const closedList = approved.filter((r) => CLOSED.includes(r.executionStatus));
  const performance = approved.length >= 4 ? {
    total: approved.length,
    closed: closedList.length,
    closedOnTime: closedList.filter((r) => !r.completionDateJalali || !r.deadlineJalali || (toDate(r.completionDateJalali)?.getTime() ?? 0) <= (toDate(r.deadlineJalali)?.getTime() ?? 0)).length,
    avgProgress: Math.round(approved.reduce((sum, r) => sum + (CLOSED.includes(r.executionStatus) ? 100 : r.progressPercent || 0), 0) / approved.length),
  } : null;

  const countP = (statuses: string[]) => proposals.filter((p) => statuses.includes(p.status)).length;
  const proposalPipeline = [
    { label: 'تصمیم مدیرعامل', value: countP(['PENDING_OFFICE_REVIEW', 'PENDING_CEO_REVIEW', 'RESUBMITTED']), route: 'proposals' as AppRoute },
    { label: 'تبدیل در دفتر', value: countP(['APPROVED', 'RETURNED_BY_SECRETARY']), route: 'proposals' as AppRoute },
    { label: 'تأیید دبیر', value: countP(['PENDING_SECRETARY_CONFIRMATION']), route: 'proposals' as AppRoute },
    { label: 'آماده/در دستور جلسه', value: countP(['CONFIRMED_FOR_MEETING', 'CONVERTED_TO_AGENDA']), route: 'meetings' as AppRoute },
    { label: 'برگشتی برای اصلاح', value: countP(['RETURNED_FOR_REVISION']), route: 'proposals' as AppRoute },
  ];

  const monthPrefix = today.slice(0, 7);
  return {
    hasAnyData,
    persona,
    today,
    upcomingMeetings,
    actionItems,
    inExecution,
    overdue,
    myTasks,
    activity,
    units,
    statusBreakdown,
    performance,
    proposalPipeline,
    counts: {
      meetingsThisMonth: meetings.filter((m) => m.status !== 'CANCELLED' && (parseJalali(m.dateJalali) ? `${parseJalali(m.dateJalali)!.year}/${String(parseJalali(m.dateJalali)!.month).padStart(2, '0')}` : '') === monthPrefix).length,
      activeResolutions: inExecution.length,
      awaitingSignature: approved.filter((r) => SIGNATURE_STATES.includes(r.executionStatus)).length,
      awaitingNotice: approved.filter((r) => ['WAITING_NOTIFICATION', 'PENDING_SECRETARY_NOTICE_SIGNATURE'].includes(r.executionStatus)).length,
      pendingVerification: approved.filter((r) => r.executionStatus === 'PENDING_APPROVAL').length,
      overdue: overdue.length,
    },
  };
};
