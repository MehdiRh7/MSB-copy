/**
 * «گزارش‌ساز با درخواست متنی» — کاربر به فارسی می‌نویسد چه گزارشی می‌خواهد
 * (جدول، نمودار دایره‌ای، میله‌ای، روند، شمارنده) و سامانه آن را می‌سازد.
 *
 * اصل دقت: موتور کمکی فقط «طرح گزارش» را طراحی می‌کند (چه بلوکی، از کدام داده،
 * به تفکیک چه و با چه فیلتری). همه اعداد و ردیف‌ها را خود سامانه از داده واقعی و
 * در محدوده دسترسی همان کاربر محاسبه می‌کند؛ هیچ عددی از موتور کمکی نمی‌آید.
 * اگر سرویس در دسترس نباشد، تحلیلگر محلی همین درخواست‌ها را می‌فهمد.
 */
import { mockDepartments, mockMeetings, mockResolutions, mockTasks } from '../../mock/data';
import type { Meeting, Proposal, Resolution, Task, User } from '../../types';
import { loadLocalCollection, loadLocalValue } from '../localStore';
import { hasOrgWideMeetingAccess, hasOrgWideResolutionAccess, isMeetingRelatedToUser, isResolutionRelatedToUser } from '../userScope';
import { getMeetingStatusMeta, getMeetingTypeLabel, getPriorityMeta, getResolutionExecutionMeta, getTaskStatusMeta } from '../../utils/formatters';
import { parseJalali, todayJalali } from '../../utils/jalaliDate';
import { AiResult, extractJson, runAi } from './aiClient';

// ——————————————————— طرح گزارش ———————————————————

export type ReportEntity = 'resolutions' | 'meetings' | 'tasks' | 'proposals';
export type ReportDimension = 'status' | 'department' | 'priority' | 'person' | 'month' | 'meetingType' | 'meeting';
export type ReportBlockType = 'kpi' | 'table' | 'pie' | 'bar' | 'line';

export interface ReportFilter {
  /** وضعیت کلی: معوق، در جریان، خاتمه‌یافته */
  state?: 'overdue' | 'active' | 'closed';
  /** بخشی از نام واحد (مثلاً «امور مالی») */
  department?: string;
  priority?: 'HIGH' | 'URGENT' | 'MEDIUM' | 'LOW';
  /** سال شمسی، مثلاً «1405» */
  year?: string;
  /** عبارت جستجو در عنوان */
  search?: string;
}

export interface ReportBlock {
  type: ReportBlockType;
  entity: ReportEntity;
  groupBy?: ReportDimension;
  filter?: ReportFilter;
  title?: string;
  limit?: number;
}

export interface ReportSpec { title: string; blocks: ReportBlock[] }

export const ENTITY_LABELS: Record<ReportEntity, string> = { resolutions: 'مصوبات', meetings: 'جلسات', tasks: 'وظایف', proposals: 'مصوبات پیشنهادی' };
export const DIMENSION_LABELS: Record<ReportDimension, string> = { status: 'وضعیت', department: 'واحد', priority: 'اولویت', person: 'مسئول / فرد', month: 'ماه', meetingType: 'نوع جلسه', meeting: 'جلسه' };
export const BLOCK_LABELS: Record<ReportBlockType, string> = { kpi: 'شمارنده', table: 'جدول', pie: 'نمودار دایره‌ای', bar: 'نمودار میله‌ای', line: 'نمودار روند' };
export const STATE_LABELS: Record<NonNullable<ReportFilter['state']>, string> = { overdue: 'معوق', active: 'در جریان', closed: 'خاتمه‌یافته' };

/** ابعادی که برای هر نوع داده معنا دارد. */
const ALLOWED_DIMENSIONS: Record<ReportEntity, ReportDimension[]> = {
  resolutions: ['status', 'department', 'priority', 'person', 'month', 'meeting'],
  meetings: ['status', 'department', 'month', 'meetingType'],
  tasks: ['status', 'department', 'priority', 'person', 'month'],
  proposals: ['status', 'department', 'person', 'month'],
};

// ——————————————————— داده (در محدوده دسترسی کاربر) ———————————————————

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  PENDING_OFFICE_REVIEW: 'در انتظار بررسی مسئول دفتر', PENDING_CEO_REVIEW: 'در انتظار بررسی مدیرعامل', RESUBMITTED: 'اصلاح و ارسال مجدد',
  APPROVED: 'تأیید شده', REJECTED: 'رد شده', RETURNED_FOR_REVISION: 'برگشت جهت اصلاح', NO_BOARD_REQUIRED: 'عدم نیاز به طرح',
  CEO_ORDER_ISSUED: 'دستور مستقیم مدیرعامل', CONFIRMED_FOR_MEETING: 'تأیید جلسه شده', CONVERTED_TO_AGENDA: 'تبدیل شده به دستور جلسه',
};
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const latin = (s?: string) => String(s || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const dateKey = (jalali?: string) => { const p = parseJalali(latin(jalali)); return p ? p.year * 10000 + p.month * 100 + p.day : 0; };
const todayKey = () => dateKey(todayJalali());
const CLOSED_RES = ['APPROVED_CLOSED', 'ARCHIVED', 'COMPLETED_PENDING_VERIFICATION'];

interface Row { id: string; title: string; number?: string; status: string; statusLabel: string; department: string; priority?: string; priorityLabel?: string; person: string; date?: string; deadline?: string; meetingTitle?: string; meetingType?: string; progress?: number; overdue: boolean; closed: boolean; route: 'resolutions' | 'meeting-details' | 'tasks' | 'proposals' }

export interface ReportDataset { resolutions: Row[]; meetings: Row[]; tasks: Row[]; proposals: Row[] }

export const loadReportDataset = (user: User): ReportDataset => {
  const allRes = loadLocalCollection<Resolution[]>('resolutions', mockResolutions).filter((r) => !r.archive);
  const res = hasOrgWideResolutionAccess(user) ? allRes : allRes.filter((r) => isResolutionRelatedToUser(r, user));
  const allMeetings = loadLocalCollection<Meeting[]>('meetings', mockMeetings);
  const meetings = hasOrgWideMeetingAccess(user.role) ? allMeetings : allMeetings.filter((m) => isMeetingRelatedToUser(m, user.id));
  const allTasks = loadLocalCollection<Task[]>('tasks', mockTasks);
  const seeAll = ['ADMIN', 'CEO', 'SECRETARY'].includes(user.role);
  const tasks = seeAll ? allTasks : allTasks.filter((t) => t.assignedToUserId === user.id);
  const allProposals = loadLocalValue<Proposal[]>('proposals', []);
  const proposals = seeAll ? allProposals : allProposals.filter((p) => p.proposerUserId === user.id || p.presenterUserId === user.id);
  const today = todayKey();
  return {
    resolutions: res.map((r) => {
      const closed = CLOSED_RES.includes(r.executionStatus);
      const overdue = !closed && (r.executionStatus === 'OVERDUE' || (dateKey(r.deadlineJalali) > 0 && dateKey(r.deadlineJalali) < today && r.approvalStatus === 'APPROVED'));
      return { id: r.id, title: r.topicTitle, number: r.resolutionNumber, status: r.executionStatus, statusLabel: overdue ? 'معوق' : getResolutionExecutionMeta(r.executionStatus).label, department: r.responsibleDepartmentName || 'تعیین نشده', priority: r.priority, priorityLabel: getPriorityMeta(r.priority).label, person: r.mainResponsibleName || 'تعیین نشده', date: r.assignedDateJalali || r.notifiedDateJalali, deadline: r.deadlineJalali, meetingTitle: r.meetingTitle, progress: r.progressPercent ?? 0, overdue, closed, route: 'resolutions' };
    }),
    meetings: meetings.map((m) => ({ id: m.id, title: m.title, number: m.meetingNumber, status: m.status, statusLabel: getMeetingStatusMeta(m.status).label, department: m.departmentName || 'تعیین نشده', person: m.secretaryName || m.organizerName || '—', date: m.dateJalali, meetingType: getMeetingTypeLabel(m.type), overdue: false, closed: ['HELD', 'CANCELLED'].includes(m.status), route: 'meeting-details' })),
    tasks: tasks.map((t) => {
      const closed = ['CLOSED', 'COMPLETED'].includes(t.status);
      const overdue = !closed && dateKey(t.deadlineJalali) > 0 && dateKey(t.deadlineJalali) < today;
      return { id: t.id, title: t.resolutionTitle, number: t.resolutionNumber, status: t.status, statusLabel: overdue ? 'معوق' : getTaskStatusMeta(t.status).label, department: t.departmentName || 'تعیین نشده', priority: t.priority, priorityLabel: getPriorityMeta(t.priority).label, person: t.assignedToName || '—', date: t.referralDateJalali, deadline: t.deadlineJalali, progress: t.progressPercent ?? 0, overdue, closed, route: 'tasks' };
    }),
    proposals: proposals.map((p) => ({ id: p.id, title: p.title, number: p.proposalNumber, status: p.status, statusLabel: PROPOSAL_STATUS_LABELS[p.status] || p.status, department: p.proposerDepartmentName || 'تعیین نشده', person: p.proposerName || '—', date: p.dateJalali, overdue: false, closed: ['REJECTED', 'CONVERTED_TO_AGENDA', 'NO_BOARD_REQUIRED'].includes(p.status), route: 'proposals' })),
  };
};

const fold = (s: string) => s.replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();

export const applyFilter = (rows: Row[], filter?: ReportFilter): Row[] => rows.filter((r) => {
  if (!filter) return true;
  if (filter.state === 'overdue' && !r.overdue) return false;
  if (filter.state === 'closed' && !r.closed) return false;
  if (filter.state === 'active' && (r.closed || r.overdue)) return false;
  if (filter.department) {
    const words = fold(filter.department).split(' ').filter((w) => w.length > 1 && !['اداره', 'کل', 'واحد', 'مدیریت'].includes(w));
    const dep = fold(r.department);
    if (words.length && !words.every((w) => dep.includes(w))) return false;
  }
  if (filter.priority && r.priority !== filter.priority) return false;
  if (filter.year && !latin(r.date).startsWith(latin(filter.year))) return false;
  if (filter.search && !fold(r.title).includes(fold(filter.search))) return false;
  return true;
});

const dimensionValue = (row: Row, dim: ReportDimension): string => {
  switch (dim) {
    case 'status': return row.statusLabel;
    case 'department': return row.department;
    case 'priority': return row.priorityLabel || '—';
    case 'person': return row.person;
    case 'meetingType': return row.meetingType || '—';
    case 'meeting': return row.meetingTitle || '—';
    case 'month': { const p = parseJalali(latin(row.date)); return p ? `${p.year}/${String(p.month).padStart(2, '0')}` : 'بدون تاریخ'; }
    default: return '—';
  }
};

export interface ChartDatum { name: string; value: number }

export const groupRows = (rows: Row[], dim: ReportDimension): ChartDatum[] => {
  const map = new Map<string, number>();
  rows.forEach((r) => { const k = dimensionValue(r, dim); map.set(k, (map.get(k) || 0) + 1); });
  const data = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  if (dim === 'month') {
    const dated = data.filter((d) => d.name !== 'بدون تاریخ').sort((a, b) => a.name.localeCompare(b.name));
    if (dated.length === 0) return [];
    // ماه‌های بدون رکورد با صفر نمایش داده می‌شوند تا روند گمراه‌کننده نباشد.
    const counts = new Map(dated.map((d) => [d.name, d.value]));
    const [y0, m0] = dated[0].name.split('/').map(Number);
    const [y1, m1] = dated[dated.length - 1].name.split('/').map(Number);
    const out: ChartDatum[] = [];
    for (let y = y0, m = m0; (y < y1 || (y === y1 && m <= m1)) && out.length < 60; m === 12 ? (y += 1, m = 1) : (m += 1)) {
      const key = `${y}/${String(m).padStart(2, '0')}`;
      out.push({ name: `${MONTHS[m - 1]} ${y}`, value: counts.get(key) || 0 });
    }
    return out;
  }
  return data.sort((a, b) => b.value - a.value);
};

// ——————————————————— تحلیلگر محلی درخواست ———————————————————

const ENTITY_WORDS: [RegExp, ReportEntity][] = [[/پیشنهاد/, 'proposals'], [/مصوب/, 'resolutions'], [/جلس/, 'meetings'], [/(وظیف|وظایف|تکلیف|تکالیف|ارجاع)/, 'tasks']];
const DIM_WORDS: [RegExp, ReportDimension][] = [
  [/(نوع جلس|انواع جلس)/, 'meetingType'], [/(وضعیت|حالت)/, 'status'], [/(واحد|اداره|دپارتمان|بخش‌ها|ادارات)/, 'department'], [/اولویت/, 'priority'],
  [/(مسئول|مجری|افراد|شخص|نفر|پیشنهاددهنده|کارمند)/, 'person'], [/(ماه|ماهانه|زمان|روند|سال)/, 'month'], [/(هر جلسه|تفکیک جلسه|به ازای جلسه)/, 'meeting'],
];

export const parseReportRequestLocally = (request: string): ReportSpec => {
  const text = fold(request);
  // هر بخش درخواست (با «،» یا «و» پیش از یک نوع خروجی) یک بلوک جداگانه است.
  const BLOCK_START = '(?:یک |یه |یک عدد |همچنین )?(?:نمودار|چارت|لیست|فهرست|جدول|تعداد|روند|آمار|شمار)';
  const clauses = text.split(new RegExp(`\\s*(?:،|,|؛|\\.|\\n|:| همچنین | سپس | و نیز | و (?=${BLOCK_START}))\\s*`)).map((c) => c.trim()).filter(Boolean);
  const blocks: ReportBlock[] = [];
  let lastEntity: ReportEntity = ENTITY_WORDS.find(([re]) => re.test(text))?.[1] || 'resolutions';
  // واحد و سال در کل درخواست زمینه مشترک‌اند؛ وضعیت و اولویت فقط برای همان بخشی که گفته شده.
  const whole = detectFilter(text);
  const globalFilter: ReportFilter = { department: whole.department, year: whole.year };
  for (const clause of clauses) {
    const entity = ENTITY_WORDS.find(([re]) => re.test(clause))?.[1] || lastEntity;
    lastEntity = entity;
    const type: ReportBlockType | null = /(دایره|(^|\s)(پای|کیکی|کیک)(\s|$)|درصد سهم)/.test(clause) ? 'pie'
      : /(خطی|روند|ماهانه|طی زمان|در طول)/.test(clause) ? 'line'
      : /(میله|ستون|(^|\s)(بار|باری)(\s|$))/.test(clause) ? 'bar'
      : /(لیست|فهرست|جدول|همه .{0,20}(را|رو)$)/.test(clause) ? 'table'
      : /(نمودار|چارت)/.test(clause) ? 'bar'
      : /(تعداد کل|چند تا|چندتا|شمار|آمار کلی|خلاصه عددی)/.test(clause) ? 'kpi' : null;
    if (!type) continue;
    let groupBy = DIM_WORDS.find(([re]) => re.test(clause))?.[1];
    if (type === 'line') groupBy = 'month';
    if ((type === 'pie' || type === 'bar') && !groupBy) groupBy = 'status';
    if (groupBy && !ALLOWED_DIMENSIONS[entity].includes(groupBy)) groupBy = ALLOWED_DIMENSIONS[entity][0];
    const local = detectFilter(clause);
    const filter: ReportFilter = { ...globalFilter, ...Object.fromEntries(Object.entries(local).filter(([, v]) => v)) };
    Object.keys(filter).forEach((k) => { if (!filter[k as keyof ReportFilter]) delete filter[k as keyof ReportFilter]; });
    blocks.push({ type, entity, groupBy: type === 'table' || type === 'kpi' ? undefined : groupBy, filter });
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'kpi', entity: lastEntity, filter: whole }, { type: 'pie', entity: lastEntity, groupBy: 'status', filter: whole }, { type: 'table', entity: lastEntity, filter: whole });
  }
  return { title: 'گزارش درخواستی', blocks: blocks.slice(0, 8) };
};

function detectFilter(text: string): ReportFilter {
  const filter: ReportFilter = {};
  if (/(معوق|عقب ?افتاده|تأخیر|تاخیر|دیرکرد)/.test(text)) filter.state = 'overdue';
  else if (/(خاتمه|بسته شده|اجراشده|اجرا شده|تمام شده|مختومه)/.test(text)) filter.state = 'closed';
  else if (/(در حال اجرا|در جریان|(^|\s)(باز|فعال)(\s|$))/.test(text)) filter.state = 'active';
  if (/(فوری|بحرانی)/.test(text)) filter.priority = 'URGENT';
  else if (/اولویت بالا/.test(text)) filter.priority = 'HIGH';
  const thisYear = Number(todayJalali().slice(0, 4));
  const year = latin(text).match(/\b(13|14)\d{2}\b/)?.[0] || (/امسال|سال جاری/.test(text) ? String(thisYear) : /پارسال|سال گذشته|سال قبل/.test(text) ? String(thisYear - 1) : undefined);
  if (year) filter.year = year;
  // نام واحد: هر واحدی که بیشتر کلمات متمایزش در درخواست آمده باشد.
  const dep = mockDepartments.map((d) => d.name).find((name) => {
    const words = fold(name).split(' ').filter((w) => w.length > 2 && !['اداره', 'کل', 'واحد', 'مدیریت', 'امور'].includes(w));
    return words.length > 0 && words.some((w) => text.includes(w)) && !/^(به تفکیک|بر اساس)/.test(text);
  });
  if (dep && !/(به تفکیک|بر اساس|هر) (واحد|اداره)/.test(text)) filter.department = dep;
  return filter;
}

// ——————————————————— اعتبارسنجی طرح ———————————————————

const ENTITIES: ReportEntity[] = ['resolutions', 'meetings', 'tasks', 'proposals'];
const TYPES: ReportBlockType[] = ['kpi', 'table', 'pie', 'bar', 'line'];

export const sanitizeSpec = (raw: Partial<ReportSpec> | null | undefined): ReportSpec | null => {
  if (!raw || !Array.isArray(raw.blocks)) return null;
  const blocks: ReportBlock[] = [];
  for (const b of raw.blocks.slice(0, 8)) {
    if (!b || !ENTITIES.includes(b.entity as ReportEntity) || !TYPES.includes(b.type as ReportBlockType)) continue;
    const entity = b.entity as ReportEntity;
    const type = b.type as ReportBlockType;
    let groupBy = b.groupBy as ReportDimension | undefined;
    if (type === 'line') groupBy = 'month';
    if (type === 'pie' || type === 'bar') { if (!groupBy || !ALLOWED_DIMENSIONS[entity].includes(groupBy)) groupBy = ALLOWED_DIMENSIONS[entity][0]; } else if (type !== 'line') groupBy = undefined;
    const f = (b.filter || {}) as ReportFilter;
    const filter: ReportFilter = {};
    if (f.state && ['overdue', 'active', 'closed'].includes(f.state)) filter.state = f.state;
    if (typeof f.department === 'string' && f.department.trim()) filter.department = f.department.trim().slice(0, 80);
    if (f.priority && ['HIGH', 'URGENT', 'MEDIUM', 'LOW'].includes(f.priority)) filter.priority = f.priority;
    if (f.year && /^(13|14)\d{2}$/.test(latin(String(f.year)))) filter.year = latin(String(f.year));
    if (typeof f.search === 'string' && f.search.trim()) filter.search = f.search.trim().slice(0, 60);
    blocks.push({ type, entity, groupBy, filter, title: typeof b.title === 'string' ? b.title.slice(0, 90) : undefined, limit: typeof b.limit === 'number' ? Math.min(Math.max(1, b.limit), 200) : undefined });
  }
  if (blocks.length === 0) return null;
  return { title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.slice(0, 90) : 'گزارش درخواستی', blocks };
};

/** عنوان پیش‌فرض و قابل‌فهم برای هر بلوک. */
export const describeBlock = (b: ReportBlock): string => {
  if (b.title) return b.title;
  const parts = [BLOCK_LABELS[b.type], ENTITY_LABELS[b.entity]];
  if (b.groupBy) parts.push(`به تفکیک ${DIMENSION_LABELS[b.groupBy]}`);
  if (b.filter?.state) parts.push(`(${STATE_LABELS[b.filter.state]})`);
  if (b.filter?.department) parts.push(`— ${b.filter.department}`);
  if (b.filter?.year) parts.push(`سال ${b.filter.year}`);
  return parts.join(' ');
};

// ——————————————————— طراحی طرح از روی درخواست ———————————————————

export const designReport = (request: string, actorId?: string): Promise<AiResult<ReportSpec>> => runAi({
  feature: 'reportBuilder',
  actorId,
  json: true,
  maxTokens: 1200,
  system: `وظیفه: درخواست فارسی کاربر برای یک گزارش مدیریتی را به «طرح گزارش» تبدیل کن. هرگز عدد یا داده تولید نکن؛ فقط ساختار. خروجی فقط JSON به شکل:
{"title": "عنوان کوتاه گزارش", "blocks": [{"type": "kpi|table|pie|bar|line", "entity": "resolutions|meetings|tasks|proposals", "groupBy": "status|department|priority|person|month|meetingType|meeting", "filter": {"state": "overdue|active|closed", "department": "نام یا بخشی از نام واحد", "priority": "URGENT|HIGH|MEDIUM|LOW", "year": "1405", "search": "عبارت در عنوان"}, "title": "عنوان بلوک"}]}
راهنما: resolutions=مصوبات، meetings=جلسات، tasks=وظایف ارجاعی، proposals=مصوبات پیشنهادی. table=لیست/فهرست/جدول، pie=نمودار دایره‌ای، bar=نمودار میله‌ای/ستونی، line=روند زمانی (groupBy همیشه month)، kpi=شمارنده تعداد. groupBy برای pie/bar الزامی است؛ برای table و kpi نگذار. meetingType فقط برای meetings و meeting فقط برای resolutions. فقط فیلترهایی را بگذار که کاربر صریحاً خواسته. ترتیب بلوک‌ها همان ترتیب درخواست کاربر باشد. حداکثر ۸ بلوک.
واحدهای سازمان: ${mockDepartments.map((d) => d.name).join('، ')}.`,
  messages: [{ role: 'user', content: request.slice(0, 2000) }],
  parse: (text) => {
    const spec = sanitizeSpec(extractJson<Partial<ReportSpec>>(text));
    if (!spec) throw new Error('invalid spec');
    return spec;
  },
  fallback: () => parseReportRequestLocally(request),
});
