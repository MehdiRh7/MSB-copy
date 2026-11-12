import {
  ApprovalCartableItem,
  Meeting,
  Resolution,
  Task,
} from '../types';
import {
  getMeetingStatusMeta,
  getResolutionApprovalMeta,
  getResolutionExecutionMeta,
  getTaskStatusMeta,
  toPersianDigits,
} from '../utils/formatters';
import { approvalService } from './approvalService';
import { mockDepartments, mockUsers } from '../mock/data';
import { loadLocalCollection } from './localStore';
import { meetingService } from './meetingService';
import { resolutionService } from './resolutionService';
import { taskService } from './taskService';

export type ChatEntity = 'resolution' | 'meeting' | 'task' | 'approval';
export type ChatAction = 'list' | 'detail' | 'count' | 'chart' | 'overview';
export type ChatTimeRange = 'today' | 'this_week' | 'next_week' | 'this_month' | 'future' | 'recent';

export interface ChatIntent {
  entity: ChatEntity;
  action: ChatAction;
  statuses: string[];
  approvalStatuses: string[];
  departmentTerm?: string;
  /** نام واحدی که کاربر گفته ولی در داده‌های سامانه وجود ندارد. */
  unknownDepartment?: string;
  /** عبارتی که نام واحد نیست ولی در عنوان پرونده‌ها آمده (مثل «مرکز داده»). */
  textTerm?: string;
  /** عبارتی که در هیچ داده‌ای از سامانه پیدا نشد. */
  unknownTerm?: string;
  number?: string;
  timeRange?: ChatTimeRange;
  requiresVerification?: boolean;
  hasResolutions?: boolean;
  mineOnly: boolean;
  includeList: boolean;
  includeSummary: boolean;
  chartDimension?: 'status' | 'department' | 'month';
}

export interface ChatSummaryMetric {
  label: string;
  value: number;
  tone: 'teal' | 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
}

export interface ChatChartDatum {
  name: string;
  count: number;
  fill?: string;
}

export interface ChatChartResult {
  title: string;
  type: 'bar' | 'pie' | 'line';
  data: ChatChartDatum[];
}

export interface ChatResultItem {
  entity: ChatEntity;
  id: string;
  title: string;
  number?: string;
  status?: string;
  statusLabel?: string;
  description?: string;
  details: Array<{ label: string; value: string }>;
  route: 'meeting-details' | 'resolutions' | 'tasks' | 'approvals';
}

export interface ChatResponse {
  intent: ChatIntent;
  text: string;
  totalCount: number;
  items: ChatResultItem[];
  summary: ChatSummaryMetric[];
  charts: ChatChartResult[];
  emptySuggestion?: string;
}

const SERVICE_PAGE_SIZE = 100;
// The mock snapshot's operational date (latest approval/activity date in the dataset).
const MOCK_REFERENCE_DATE = '1403/06/28';
const STOP_WORDS = new Set([
  'جلسه', 'جلسات', 'مصوبه', 'مصوبات', 'مربوط', 'نمایش', 'بده', 'نشانم', 'نشونم',
  'لیست', 'رو', 'را', 'به', 'با', 'که', 'برای', 'خاص', 'شماره', 'جدید', 'اخیر',
]);

const DEPARTMENT_ALIASES: Array<{ label: string; aliases: string[] }> = [
  { label: 'فناوری اطلاعات', aliases: ['فناوری اطلاعات', 'فناوری', 'آی تی', ' it '] },
  { label: 'منابع انسانی', aliases: ['منابع انسانی', 'سرمایه انسانی'] },
  { label: 'برنامه ریزی', aliases: ['برنامه ریزی', 'تحول سازمانی'] },
  { label: 'امور مالی', aliases: ['امور مالی', 'مالی', 'ذی حساب'] },
  { label: 'امنیت اطلاعات', aliases: ['امنیت اطلاعات', 'امنیت', 'حراست', 'افتا'] },
  { label: 'حقوقی', aliases: ['حقوقی', 'قراردادها'] },
  { label: 'پشتیبانی پروژه', aliases: ['پشتیبانی پروژه', 'مدیریت طرح', 'pmo'] },
];

const CHART_COLORS = ['#0d9488', '#2563eb', '#7c3aed', '#f59e0b', '#ef4444', '#64748b', '#0891b2'];

export const normalizeChatText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/ۀ/g, 'ه')
    .replace(/‌/g, ' ')
    .replace(/[؟?!،,.؛:()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toEnglishDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const normalizeDate = (value?: string): string => toEnglishDigits(value || '').replace(/[^0-9]/g, '/');
const hasAny = (query: string, values: string[]) => values.some((value) => query.includes(value));

const detectDepartment = (query: string): string | undefined => {
  const paddedQuery = ` ${normalizeChatText(query)} `;
  return DEPARTMENT_ALIASES.find(({ aliases }) => aliases.some((alias) => {
    const normalizedAlias = normalizeChatText(alias);
    return paddedQuery.includes(` ${normalizedAlias} `);
  }))?.label;
};

// ——— تشخیص واحد سازمانی بر اساس داده واقعی سامانه ———
// قبلاً فقط چند نام ثابت شناخته می‌شد و هر نام ناشناخته (مثلاً «اداره کل
// حسابرسی») بی‌صدا نادیده گرفته می‌شد و همه مصوبات نمایش داده می‌شد.
const UNIT_MARKERS = ['اداره کل', 'اداره', 'معاونت', 'مدیریت', 'واحد', 'دفتر', 'حوزه', 'دپارتمان', 'مرکز', 'بخش', 'دایره'];
const UNIT_GENERIC_TOKENS = new Set(['اداره', 'کل', 'معاونت', 'مدیریت', 'واحد', 'دفتر', 'حوزه', 'دپارتمان', 'مرکز', 'بخش', 'دایره', 'امور', 'و', 'سازمان', 'سازمانی']);
const UNIT_STOP_TOKENS = new Set(['که', 'را', 'رو', 'در', 'با', 'از', 'به', 'برای', 'مصوبه', 'مصوبات', 'جلسه', 'جلسات', 'وظیفه', 'وظایف', 'چند', 'تعداد', 'نمایش', 'بده', 'لیست', 'فهرست', 'هستند', 'است', 'چیست', 'کدام', 'کدوم', 'نشان', 'نشون', 'من', 'این', 'ماه', 'هفته', 'امروز']);
const STATUS_PHRASES = ['در حال اجرا', 'در حال انجام', 'خاتمه یافته', 'عقب افتاده', 'انجام شده', 'انجام نشده', 'شروع نشده', 'تصویب شده', 'در انتظار'];

/** همه نام‌های واحد که واقعاً در داده‌های سامانه وجود دارند. */
const knownUnitNames = (): string[] => {
  const names = new Set<string>();
  mockDepartments.forEach((department) => names.add(department.name));
  loadLocalCollection('users', mockUsers).forEach((user) => user.departmentName && names.add(user.departmentName));
  loadLocalCollection<Resolution[]>('resolutions', []).forEach((resolution) => {
    if (resolution.responsibleDepartmentName) names.add(resolution.responsibleDepartmentName);
    if (resolution.proposerDepartment) names.add(resolution.proposerDepartment);
  });
  loadLocalCollection<Meeting[]>('meetings', []).forEach((meeting) => meeting.departmentName && names.add(meeting.departmentName));
  return Array.from(names).filter(Boolean);
};

/** عبارت واحد سازمانی گفته‌شده در پرسش، مثل «اداره کل حسابرسی». */
const extractUnitPhrase = (query: string): string | undefined => {
  let cleaned = ` ${normalizeChatText(query)} `;
  STATUS_PHRASES.forEach((phrase) => { cleaned = cleaned.replace(` ${phrase} `, ' | '); });
  const marker = UNIT_MARKERS.find((item) => cleaned.includes(` ${item} `));
  if (!marker) return undefined;
  const rest = cleaned.slice(cleaned.indexOf(` ${marker} `) + marker.length + 2).trim().split(' ');
  const taken: string[] = [];
  for (const token of rest) {
    if (!token || token === '|' || UNIT_STOP_TOKENS.has(token) || /^\d+$/.test(toEnglishDigits(token))) break;
    taken.push(token);
    if (taken.length >= 5) break;
  }
  return taken.length ? `${marker} ${taken.join(' ')}` : undefined;
};

/** تطبیق عبارت واحد با واحدهای واقعی؛ کلمات عمومی (اداره، کل، ...) در تطبیق شرکت نمی‌کنند. */
const resolveUnitPhrase = (phrase: string): { term?: string; unknown?: string; text?: string } => {
  const core = normalizeChatText(phrase).split(' ').filter((token) => !UNIT_GENERIC_TOKENS.has(token) && token.length > 1);
  if (core.length === 0) return {};
  const match = knownUnitNames().find((name) => {
    const unitTokens = normalizeChatText(name).split(' ');
    return core.every((token) => unitTokens.some((unitToken) => unitToken.startsWith(token) || token.startsWith(unitToken) && unitToken.length >= 3));
  });
  if (match) return { term: core.join(' ') };
  // اگر همین عبارت در عنوان جلسه/مصوبه‌ای آمده، موضوع است نه نام واحد.
  const normalizedPhrase = normalizeChatText(phrase);
  const inTitles = [
    ...loadLocalCollection<Resolution[]>('resolutions', []).map((r) => r.topicTitle),
    ...loadLocalCollection<Meeting[]>('meetings', []).map((m) => m.title),
  ].some((title) => normalizeChatText(title || '').includes(normalizedPhrase));
  return inTitles ? { text: phrase } : { unknown: phrase };
};

const matchesText = (term: string | undefined, ...values: Array<string | undefined>) => {
  if (!term) return true;
  const text = normalizeChatText(values.filter(Boolean).join(' '));
  return normalizeChatText(term).split(' ').filter(Boolean).every((token) => text.includes(token));
};

// ——— هیچ کلمه‌ای از پرسش بی‌صدا نادیده گرفته نمی‌شود ———
// کلماتی که فرمان/وضعیت/زمان نیستند، با داده واقعی (واحدها، عنوان‌ها، افراد)
// و به‌صورت بخشی (مثلاً «منابع» ← «مدیریت منابع انسانی») تطبیق داده می‌شوند.
const INTENT_WORDS = new Set(`مصوبه مصوبات مصوبه‌ها جلسه جلسات وظیفه وظایف تکلیف تکالیف تایید تأیید تاییدها صحه گذاری کارتابل
نمایش بده بدهید نشان نشانم نشونم ببین ببینم لیست فهرست همه همه‌ی کل تعداد چند چندتا نمودار چارت گراف رسم آمار وضعیت کلی گزارش خلاصه بررسی کن کنم جزئیات شماره بر اساس
در حال اجرا انجام اقدام دست جریان خاتمه یافته مختومه شده شده‌اند تکمیل بسته عقب افتاده تاخیر تأخیر دیرکرد منتظر انتظار برگشت داده برگشتی رد شروع نشده نشده‌اند جدید لغو مصوب تصویب عدم نیازمند تکمیلی بدون دارای دارند ندارند نیاز دارن
امروز این آن هفته ماه آینده بعد جاری پیش رو اخیر آخرین گذشته برگزار برگزاری برنامه ریزی سال امسال
من ما شما را رو به با که برای از در و یا مربوط هستند است هست کدام کدوم کدامند چی چه چیه های ها ی دارم داریم میخوام می خواهم لطفا لطفاً سلام اول کار کاری بدهم باید هر تمام کلیه موارد مورد خطر ریسک چرا چطور چگونه آیا اند را`.split(/\s+/).map(normalizeChatText));
const QUESTION_MARKERS = [' چرا ', ' چطور ', ' چگونه ', ' آیا ', ' چه ', ' کدام ', ' کدوم ', ' چی '];

const residualTerms = (query: string): string[] => {
  let cleaned = ` ${normalizeChatText(query)} `;
  STATUS_PHRASES.forEach((phrase) => { cleaned = cleaned.split(` ${phrase} `).join(' '); });
  return cleaned.split(' ').filter((token) => token.length >= 2 && !INTENT_WORDS.has(token) && !UNIT_GENERIC_TOKENS.has(token) && !/^معوق/.test(token) && !STOP_WORDS.has(token) && !/^\d+$/.test(toEnglishDigits(token)));
};

/** متن قابل جستجوی هر پرونده (عنوان، شرح، واحد، افراد) برای تطبیق کلمات باقی‌مانده. */
const searchableCorpus = (): string[] => [
  ...loadLocalCollection<Resolution[]>('resolutions', []).map((r) => [r.topicTitle, r.requestDescription, r.executionDescription, r.mainResponsibleName, r.proposerName, r.meetingTitle].join(' ')),
  ...loadLocalCollection<Meeting[]>('meetings', []).map((m) => [m.title, m.organizerName, m.secretaryName, m.location].join(' ')),
].map(normalizeChatText);

const tokenPrefixMatch = (token: string, text: string) => ` ${text} `.includes(` ${token}`) || text.includes(token);

const resolveResidual = (query: string): { departmentTerm?: string; textTerm?: string; unknownTerm?: string } => {
  const padded = ` ${normalizeChatText(query)} `;
  if (QUESTION_MARKERS.some((marker) => padded.includes(marker))) return {}; // پرسش تحلیلی؛ دستیار پاسخ می‌دهد
  const residual = residualTerms(query);
  if (residual.length === 0) return {};
  const phrase = residual.join(' ');
  const units = knownUnitNames().map(normalizeChatText);
  if (units.some((unit) => residual.every((token) => unit.split(' ').some((word) => word.startsWith(token))))) return { departmentTerm: phrase };
  const corpus = searchableCorpus();
  if (corpus.some((text) => residual.every((token) => tokenPrefixMatch(token, text)))) return { textTerm: phrase };
  return { unknownTerm: phrase };
};

const detectNumber = (query: string): string | undefined => {
  const matches = toEnglishDigits(query).match(/\d+/g);
  return matches?.at(-1);
};

const detectTimeRange = (query: string): ChatTimeRange | undefined => {
  if (query.includes('هفته آینده') || query.includes('هفته بعد')) return 'next_week';
  if (query.includes('امروز')) return 'today';
  if (query.includes('این هفته')) return 'this_week';
  if (query.includes('این ماه') || query.includes('ماه جاری')) return 'this_month';
  if (query.includes('آینده') || query.includes('پیش رو')) return 'future';
  if (query.includes('اخیر') || query.includes('آخرین')) return 'recent';
  return undefined;
};

const detectExecutionStatuses = (query: string): string[] => {
  if (hasAny(query, ['هنوز انجام نشده', 'انجام نشده اند', 'انجام نشده'])) {
    return ['NOT_STARTED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'OVERDUE', 'REJECTED_RETURNED'];
  }
  const statuses: string[] = [];
  if (hasAny(query, ['در حال اجرا', 'در حال انجام', 'در دست اقدام', 'دارن اجرا', 'در جریان'])) statuses.push('IN_PROGRESS');
  if (hasAny(query, ['خاتمه یافته', 'مختومه', 'انجام شده', 'تکمیل شده', 'بسته شده'])) statuses.push('APPROVED_CLOSED');
  if (hasAny(query, ['عقب افتاده', 'تاخیر', 'تأخیر', 'دیرکرد', 'معوق'])) statuses.push('OVERDUE');
  if (hasAny(query, ['منتظر تایید', 'در انتظار تایید', 'منتظر صحه', 'در انتظار صحه', 'صحه گذاری من'])) statuses.push('PENDING_APPROVAL');
  if (hasAny(query, ['برگشت داده', 'برگشتی از صحه', 'رد شده در صحه'])) statuses.push('REJECTED_RETURNED');
  if (hasAny(query, ['شروع نشده', 'مصوبات جدید', 'مصوبه جدید'])) statuses.push('NOT_STARTED');
  if (query.includes('لغو شده')) statuses.push('CANCELLED');
  return statuses;
};

const detectTaskStatuses = (query: string): string[] => {
  if (hasAny(query, ['در حال اجرا', 'در حال انجام', 'در دست اقدام', 'در جریان'])) return ['IN_PROGRESS'];
  if (hasAny(query, ['خاتمه یافته', 'مختومه', 'انجام شده', 'تکمیل شده'])) return ['COMPLETED', 'CLOSED'];
  if (hasAny(query, ['عقب افتاده', 'تاخیر'])) return ['OVERDUE'];
  if (hasAny(query, ['منتظر تایید', 'در انتظار تایید'])) return ['PENDING_APPROVAL'];
  if (hasAny(query, ['جدید', 'شروع نشده'])) return ['NEW'];
  if (hasAny(query, ['برگشت', 'رد شده'])) return ['RETURNED'];
  return [];
};

const detectMeetingStatuses = (query: string): string[] => {
  if (hasAny(query, ['برگزار شده', 'جلسات گذشته'])) return ['HELD'];
  if (hasAny(query, ['در حال برگزاری'])) return ['IN_PROGRESS'];
  if (hasAny(query, ['لغو شده'])) return ['CANCELLED'];
  if (hasAny(query, ['آینده', 'پیش رو', 'برنامه ریزی'])) return ['SCHEDULED', 'DRAFT'];
  return [];
};

const detectApprovalStatuses = (query: string): string[] => {
  if (hasAny(query, ['انجام شده', 'تایید شده', 'تأیید شده'])) return ['APPROVED'];
  if (hasAny(query, ['رد شده', 'عدم تایید', 'عدم تأیید'])) return ['REJECTED'];
  if (hasAny(query, ['منتظر', 'باید تایید', 'باید تأیید', 'انجام نشده', 'بررسی کنم', 'صحه گذاری'])) return ['PENDING'];
  return [];
};

export const parseChatIntent = (rawQuery: string): ChatIntent => {
  const query = normalizeChatText(rawQuery);
  const mentionsResolution = hasAny(query, ['مصوبه', 'مصوبات', 'resolution']);
  const mentionsTask = hasAny(query, ['وظیفه', 'وظایف', 'تکلیف', 'تکالیف']);
  const mentionsMeeting = hasAny(query, ['جلسه', 'جلسات', 'meeting', 'شورا', 'کمیسیون']);
  const mentionsApproval = hasAny(query, ['تایید', 'تأیید', 'صحه گذاری', 'کارتابل تایید', 'بررسی کنم']);

  let entity: ChatEntity = 'resolution';
  if (mentionsTask) entity = 'task';
  else if (mentionsMeeting && mentionsApproval && !mentionsResolution) entity = 'approval';
  else if (mentionsMeeting && (!mentionsResolution || query.includes('جلسات'))) entity = 'meeting';
  else if (mentionsResolution) entity = 'resolution';
  else if (mentionsApproval || query.includes('کارتابل')) entity = 'approval';

  const asksChart = hasAny(query, ['نمودار', 'چارت', 'chart', 'گراف', 'رسم']);
  const asksCount = hasAny(query, ['چند', 'تعداد']);
  const asksOverview = hasAny(query, ['وضعیت کلی', 'وضعیت مصوبات رو بررسی', 'گزارش کلی', 'خلاصه وضعیت', 'آمار']);
  const asksBreakdown = query.includes('بر اساس');
  const number = detectNumber(query);
  const asksDetail = Boolean(number) && hasAny(query, ['جزئیات', 'شماره', 'نمایش', 'بده']);

  let action: ChatAction = 'list';
  if (asksOverview) action = 'overview';
  else if (asksChart || (asksCount && asksBreakdown)) action = 'chart';
  else if (asksCount && query.includes('بررسی کن')) action = 'list';
  else if (asksCount) action = 'count';
  else if (asksDetail) action = 'detail';

  const statuses = entity === 'resolution'
    ? detectExecutionStatuses(query)
    : entity === 'meeting'
      ? detectMeetingStatuses(query)
      : entity === 'task'
        ? detectTaskStatuses(query)
        : detectApprovalStatuses(query);

  const approvalStatuses: string[] = [];
  if (entity === 'resolution') {
    if (hasAny(query, ['مصوبات مصوب', 'مصوبه مصوب', 'تصویب شده'])) approvalStatuses.push('APPROVED');
    if (hasAny(query, ['عدم تصویب', 'تصویب نشده'])) approvalStatuses.push('NOT_APPROVED');
    if (hasAny(query, ['نیازمند بررسی', 'بررسی تکمیلی'])) approvalStatuses.push('NEEDS_REVIEW');
    if (query.includes('رد شده')) approvalStatuses.push('REJECTED');
  }

  let requiresVerification: boolean | undefined;
  if (hasAny(query, ['بدون صحه', 'نیاز به صحه ندارد'])) requiresVerification = false;
  else if (hasAny(query, ['نیازمند صحه', 'نیاز به صحه', 'دارای صحه', 'صحه گذاری دارند'])) requiresVerification = true;

  let hasResolutions: boolean | undefined;
  if (entity === 'meeting' && hasAny(query, ['بدون مصوبه', 'مصوبه ندار'])) hasResolutions = false;
  else if (entity === 'meeting' && hasAny(query, ['دارای مصوبه', 'مصوبه دارند'])) hasResolutions = true;

  const chartDimension = entity === 'meeting' && hasAny(query, ['ماه', 'ماه های اخیر'])
    ? 'month'
    : entity === 'resolution' && hasAny(query, ['واحد', 'دپارتمان', 'عملکرد'])
      ? 'department'
      : 'status';

  return {
    entity,
    action,
    statuses,
    approvalStatuses,
    ...(() => {
      const alias = detectDepartment(query);
      if (alias) return { departmentTerm: alias };
      const phrase = extractUnitPhrase(query);
      if (!phrase) return resolveResidual(query);
      const resolved = resolveUnitPhrase(phrase);
      return { departmentTerm: resolved.term, unknownDepartment: resolved.unknown, textTerm: resolved.text };
    })(),
    number,
    timeRange: detectTimeRange(query),
    requiresVerification,
    hasResolutions,
    mineOnly: /(^| )من($| )/.test(query) || hasAny(query, ['باید تایید کنم', 'باید تأیید کنم']),
    includeList: action === 'list' || action === 'detail' || (action === 'overview' && query.includes('لیست')),
    includeSummary: action === 'count' || action === 'overview' || (action === 'chart' && asksCount) || hasAny(query, ['تعدادشون', 'تعدادشان', 'بررسی کن']),
    chartDimension,
  };
};

const loadAllPages = async <T>(loader: (pageIndex: number, pageSize: number) => Promise<{ data: { items: T[]; totalPages: number } }>): Promise<T[]> => {
  const first = await loader(1, SERVICE_PAGE_SIZE);
  const items = [...first.data.items];
  for (let page = 2; page <= first.data.totalPages; page += 1) {
    const response = await loader(page, SERVICE_PAGE_SIZE);
    items.push(...response.data.items);
  }
  return items;
};

const isInTimeRange = (dateValue: string | undefined, range?: ChatTimeRange): boolean => {
  if (!range || range === 'recent') return true;
  const date = normalizeDate(dateValue);
  if (!date) return false;
  if (range === 'today') return date === MOCK_REFERENCE_DATE;
  if (range === 'this_month') return date.startsWith(MOCK_REFERENCE_DATE.slice(0, 7));
  if (range === 'this_week') return date >= '1403/06/22' && date <= MOCK_REFERENCE_DATE;
  if (range === 'next_week') return date >= '1403/06/29' && date <= '1403/07/05';
  if (range === 'future') return date > MOCK_REFERENCE_DATE;
  return true;
};

const matchesDepartment = (term: string | undefined, ...values: Array<string | undefined>) => {
  if (!term) return true;
  const tokens = normalizeChatText(term).split(' ').filter(Boolean);
  return values.some((value) => {
    const words = normalizeChatText(value || '').split(' ');
    return tokens.every((token) => words.some((word) => word.startsWith(token)));
  });
};

const findMentionedPerson = (query: string, candidates: Array<string | undefined>): string | undefined => {
  const normalizedQuery = normalizeChatText(query);
  return candidates.find((candidate) => {
    if (!candidate) return false;
    const normalized = normalizeChatText(candidate);
    const parts = normalized.split(' ').filter((part) => part.length >= 4 && !['مهندس', 'دکتر', 'خانم', 'آقای', 'سرکار'].includes(part));
    return normalizedQuery.includes(normalized) || parts.some((part) => normalizedQuery.includes(part));
  });
};

const findMeetingReference = (query: string, meetings: Meeting[]): string | undefined => {
  const normalizedQuery = normalizeChatText(query);
  if (!normalizedQuery.includes('جلسه') || !normalizedQuery.includes('مربوط')) return undefined;
  let best: { id: string; score: number } | undefined;
  meetings.forEach((meeting) => {
    const tokens = normalizeChatText(meeting.title)
      .split(' ')
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
    const score = tokens.filter((token) => normalizedQuery.includes(token)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: meeting.id, score };
  });
  return best?.id;
};

const countBy = <T>(items: T[], labeler: (item: T) => string): ChatChartDatum[] => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = labeler(item);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, count], index) => ({
    name,
    count,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));
};

const resolutionToItem = (resolution: Resolution): ChatResultItem => ({
  entity: 'resolution',
  id: resolution.id,
  title: resolution.topicTitle,
  number: resolution.resolutionNumber,
  status: resolution.executionStatus,
  statusLabel: getResolutionExecutionMeta(resolution.executionStatus).label,
  description: resolution.requestDescription,
  route: 'resolutions',
  details: [
    { label: 'جلسه', value: `${resolution.meetingTitle} (${resolution.meetingNumber})` },
    { label: 'پیشنهاددهنده', value: `${resolution.proposerName} — ${resolution.proposerDepartment}` },
    { label: 'مسئول اصلی', value: resolution.mainResponsibleName || 'تعیین نشده' },
    { label: 'واحد سازمانی', value: resolution.responsibleDepartmentName || 'تعیین نشده' },
    { label: 'تاریخ ارجاع', value: resolution.assignedDateJalali || '—' },
    { label: 'مهلت انجام', value: resolution.deadlineJalali || '—' },
    { label: 'وضعیت تصویب', value: getResolutionApprovalMeta(resolution.approvalStatus).label },
    { label: 'نیاز به صحه‌گذاری', value: resolution.verificationConfig.requiresVerification ? 'بله' : 'خیر' },
    {
      label: 'وضعیت صحه‌گذاری',
      value: resolution.verificationConfig.requiresVerification
        ? `${toPersianDigits(resolution.verificationConfig.steps.filter((step) => step.status === 'APPROVED').length)} از ${toPersianDigits(resolution.verificationConfig.steps.length)} مرحله تأیید شده`
        : 'نیاز ندارد',
    },
    { label: 'توضیحات', value: resolution.executionDescription || resolution.reviewResultNotes || '—' },
  ],
});

const meetingToItem = (meeting: Meeting): ChatResultItem => ({
  entity: 'meeting',
  id: meeting.id,
  title: meeting.title,
  number: meeting.meetingNumber,
  status: meeting.status,
  statusLabel: getMeetingStatusMeta(meeting.status).label,
  description: meeting.description,
  route: 'meeting-details',
  details: [
    { label: 'تاریخ و ساعت', value: `${meeting.dateJalali}، ${meeting.startTime} تا ${meeting.endTime}` },
    { label: 'مکان', value: meeting.location },
    { label: 'برگزارکننده', value: meeting.organizerName },
    { label: 'دبیر جلسه', value: meeting.secretaryName },
    { label: 'واحد', value: meeting.departmentName },
    { label: 'تعداد مصوبات', value: `${toPersianDigits(meeting.resolutionsCount)} مورد` },
  ],
});

const taskToItem = (task: Task): ChatResultItem => ({
  entity: 'task',
  id: task.id,
  title: task.resolutionTitle,
  number: task.resolutionNumber,
  status: task.status,
  statusLabel: getTaskStatusMeta(task.status).label,
  description: task.instructions,
  route: 'tasks',
  details: [
    { label: 'جلسه', value: task.meetingTitle },
    { label: 'مسئول', value: task.assignedToName },
    { label: 'واحد', value: task.departmentName },
    { label: 'تاریخ ارجاع', value: task.referralDateJalali },
    { label: 'مهلت انجام', value: task.deadlineJalali },
    { label: 'نیاز به صحه‌گذاری', value: task.requiresVerification ? 'بله' : 'خیر' },
  ],
});

const approvalToItem = (approval: ApprovalCartableItem, resolution?: Resolution, meeting?: Meeting): ChatResultItem => ({
  entity: 'approval',
  id: approval.id,
  title: approval.resolutionTitle,
  number: approval.resolutionNumber,
  status: approval.status,
  statusLabel: approval.status === 'PENDING' ? 'منتظر اقدام' : approval.status === 'APPROVED' ? 'تأیید شده' : 'رد شده',
  description: approval.completionReport,
  route: 'approvals',
  details: [
    { label: 'جلسه', value: approval.meetingTitle },
    { label: 'شماره جلسه', value: resolution?.meetingNumber || meeting?.meetingNumber || '—' },
    { label: 'تاریخ جلسه', value: meeting?.dateJalali || '—' },
    { label: 'تأییدکننده', value: approval.stepTitle },
    { label: 'ارسال برای تأیید', value: approval.submittedForApprovalDateJalali },
    { label: 'مسئول اجرا', value: `${approval.responsibleName} — ${approval.responsibleDepartment}` },
    { label: 'مرحله', value: `${toPersianDigits(approval.stepNumber)} از ${toPersianDigits(approval.totalSteps)}` },
  ],
});

const entityLabel = (entity: ChatEntity): string => ({
  resolution: 'مصوبه', meeting: 'جلسه', task: 'وظیفه', approval: 'مورد تأیید',
}[entity]);

class ChatService {
  public async execute(rawQuery: string, currentUserId?: string): Promise<ChatResponse> {
    const intent = parseChatIntent(rawQuery);
    const normalizedQuery = normalizeChatText(rawQuery);

    // واحدی که در سامانه وجود ندارد: به‌جای نمایش نتایج نامرتبط، صادقانه
    // اعلام می‌شود و واحدهای واقعی پیشنهاد می‌شوند.
    if (intent.unknownTerm) {
      return {
        intent,
        text: `در سامانه موردی مرتبط با «${intent.unknownTerm}» پیدا نشد (نه در نام واحدها، نه در عنوان پرونده‌ها و نه در نام افراد).`,
        totalCount: 0,
        items: [],
        summary: [],
        charts: [],
        emptySuggestion: `واحدهای ثبت‌شده: ${knownUnitNames().slice(0, 10).join('، ')}`,
      };
    }
    if (intent.unknownDepartment) {
      const units = knownUnitNames();
      return {
        intent,
        text: `واحدی با عنوان «${intent.unknownDepartment}» در سامانه ثبت نشده است؛ بنابراین موردی برای نمایش وجود ندارد.`,
        totalCount: 0,
        items: [],
        summary: [],
        charts: [],
        emptySuggestion: `واحدهای ثبت‌شده در سامانه: ${units.slice(0, 10).join('، ')}`,
      };
    }

    try {
      const [resolutions, meetings, tasks, approvals] = await Promise.all([
        loadAllPages<Resolution>((pageIndex, pageSize) => resolutionService.getResolutions({ pageIndex, pageSize, relatedUserId: currentUserId })),
        loadAllPages<Meeting>((pageIndex, pageSize) => meetingService.getMeetings({ pageIndex, pageSize, participantUserId: currentUserId })),
        loadAllPages<Task>((pageIndex, pageSize) => taskService.getMyTasks(intent.mineOnly ? currentUserId : undefined, { pageIndex, pageSize })),
        loadAllPages<ApprovalCartableItem>((pageIndex, pageSize) => approvalService.getMyApprovals(intent.mineOnly ? currentUserId : undefined, { pageIndex, pageSize })),
      ]);

      let items: ChatResultItem[] = [];
      let chartSource: Array<Resolution | Meeting | Task | ApprovalCartableItem> = [];
      let summary: ChatSummaryMetric[] = [];

      if (intent.entity === 'resolution') {
        const mentionedPerson = findMentionedPerson(rawQuery, resolutions.flatMap((item) => [item.mainResponsibleName, item.proposerName]));
        const meetingId = findMeetingReference(rawQuery, meetings);
        const myApprovalResolutionIds = new Set(
          approvals
            .filter((approval) => !intent.mineOnly || !currentUserId || approval.assignedApproverId === currentUserId || ['user-1', 'user-15'].includes(currentUserId))
            .map((approval) => approval.resolutionId),
        );
        const filtered = resolutions.filter((resolution) => {
          const numberMatches = !intent.number || toEnglishDigits(resolution.resolutionNumber).includes(intent.number);
          const statusMatches = intent.statuses.length === 0 || intent.statuses.includes(resolution.executionStatus);
          const approvalMatches = intent.approvalStatuses.length === 0 || intent.approvalStatuses.includes(resolution.approvalStatus);
          const verificationMatches = intent.requiresVerification === undefined || resolution.verificationConfig.requiresVerification === intent.requiresVerification;
          const personMatches = !mentionedPerson || [resolution.mainResponsibleName, resolution.proposerName].includes(mentionedPerson);
          const meetingMatches = !meetingId || resolution.meetingId === meetingId;
          const mineMatches = !(intent.mineOnly && intent.statuses.includes('PENDING_APPROVAL')) || myApprovalResolutionIds.has(resolution.id);
          return numberMatches
            && statusMatches
            && approvalMatches
            && verificationMatches
            && personMatches
            && meetingMatches
            && mineMatches
            && matchesDepartment(intent.departmentTerm, resolution.responsibleDepartmentName, resolution.proposerDepartment)
            && matchesText(intent.textTerm, resolution.topicTitle, resolution.requestDescription, resolution.executionDescription, resolution.mainResponsibleName, resolution.proposerName, resolution.meetingTitle)
            && isInTimeRange(resolution.assignedDateJalali || resolution.deadlineJalali, intent.timeRange);
        });
        items = filtered.map(resolutionToItem);
        chartSource = filtered;
        if (intent.action === 'overview') {
          summary = [
            { label: 'تعداد کل', value: filtered.length, tone: 'slate' },
            { label: 'در حال اجرا', value: filtered.filter((item) => item.executionStatus === 'IN_PROGRESS').length, tone: 'blue' },
            { label: 'خاتمه‌یافته', value: filtered.filter((item) => item.executionStatus === 'APPROVED_CLOSED').length, tone: 'teal' },
            { label: 'منتظر صحه‌گذاری', value: filtered.filter((item) => item.executionStatus === 'PENDING_APPROVAL').length, tone: 'violet' },
            { label: 'عقب‌افتاده', value: filtered.filter((item) => item.executionStatus === 'OVERDUE').length, tone: 'rose' },
          ];
        }
      } else if (intent.entity === 'meeting') {
        const mentionedPerson = findMentionedPerson(rawQuery, meetings.map((item) => item.organizerName));
        const filtered = meetings
          .filter((meeting) => {
            const numberMatches = !intent.number || toEnglishDigits(meeting.meetingNumber).includes(intent.number);
            const statusMatches = intent.statuses.length === 0 || intent.statuses.includes(meeting.status);
            const personMatches = !mentionedPerson || meeting.organizerName === mentionedPerson;
            const resolutionMatches = intent.hasResolutions === undefined
              || (intent.hasResolutions ? meeting.resolutionsCount > 0 : meeting.resolutionsCount === 0);
            return numberMatches
              && statusMatches
              && personMatches
              && resolutionMatches
              && matchesDepartment(intent.departmentTerm, meeting.departmentName)
              && matchesText(intent.textTerm, meeting.title, meeting.organizerName, meeting.secretaryName, meeting.location)
              && isInTimeRange(meeting.dateJalali, intent.timeRange);
          })
          .sort((a, b) => normalizeDate(b.dateJalali).localeCompare(normalizeDate(a.dateJalali)));
        items = filtered.map(meetingToItem);
        chartSource = filtered;
      } else if (intent.entity === 'task') {
        const mentionedPerson = findMentionedPerson(rawQuery, tasks.map((item) => item.assignedToName));
        const filtered = tasks.filter((task) => {
          const numberMatches = !intent.number || toEnglishDigits(task.resolutionNumber).includes(intent.number);
          const statusMatches = intent.statuses.length === 0 || intent.statuses.includes(task.status);
          const personMatches = !mentionedPerson || task.assignedToName === mentionedPerson;
          return numberMatches
            && statusMatches
            && personMatches
            && matchesDepartment(intent.departmentTerm, task.departmentName)
            && matchesText(intent.textTerm, task.resolutionTitle, task.assignedToName)
            && isInTimeRange(task.deadlineJalali, intent.timeRange);
        });
        items = filtered.map(taskToItem);
        chartSource = filtered;
      } else {
        const filtered = approvals.filter((approval) => {
          const numberMatches = !intent.number || toEnglishDigits(approval.resolutionNumber).includes(intent.number);
          const statusMatches = intent.statuses.length === 0 || intent.statuses.includes(approval.status);
          return numberMatches
            && statusMatches
            && matchesDepartment(intent.departmentTerm, approval.responsibleDepartment)
            && matchesText(intent.textTerm, approval.resolutionTitle)
            && isInTimeRange(approval.submittedForApprovalDateJalali, intent.timeRange);
        });
        items = filtered.map((approval) => {
          const resolution = resolutions.find((item) => item.id === approval.resolutionId);
          const meeting = meetings.find((item) => item.id === resolution?.meetingId);
          return approvalToItem(approval, resolution, meeting);
        });
        chartSource = filtered;
      }

      const totalCount = items.length;
      if (summary.length === 0 && intent.includeSummary) {
        summary = [{ label: entityLabel(intent.entity), value: totalCount, tone: 'teal' }];
      }

      const charts: ChatChartResult[] = [];
      if (intent.action === 'chart' || intent.action === 'overview') {
        if (intent.entity === 'resolution') {
          const source = chartSource as Resolution[];
          if (intent.chartDimension === 'department') {
            charts.push({
              title: 'تعداد مصوبات به تفکیک واحد سازمانی',
              type: 'bar',
              data: countBy(source, (item) => item.responsibleDepartmentName || 'بدون واحد'),
            });
          } else {
            charts.push({
              title: 'توزیع وضعیت مصوبات',
              type: normalizedQuery.includes('دایره') || normalizedQuery.includes('سهم') ? 'pie' : 'bar',
              data: countBy(source, (item) => getResolutionExecutionMeta(item.executionStatus).label),
            });
          }
        } else if (intent.entity === 'meeting') {
          const source = chartSource as Meeting[];
          charts.push({
            title: intent.chartDimension === 'month' ? 'روند جلسات به تفکیک ماه' : 'توزیع وضعیت جلسات',
            type: intent.chartDimension === 'month' ? 'line' : 'bar',
            data: intent.chartDimension === 'month'
              ? countBy(source, (item) => item.dateJalali.slice(0, 7))
              : countBy(source, (item) => getMeetingStatusMeta(item.status).label),
          });
        } else if (intent.entity === 'task') {
          charts.push({
            title: 'توزیع وضعیت وظایف',
            type: 'pie',
            data: countBy(chartSource as Task[], (item) => getTaskStatusMeta(item.status).label),
          });
        } else {
          charts.push({
            title: 'توزیع وضعیت تأییدها',
            type: 'pie',
            data: countBy(chartSource as ApprovalCartableItem[], (item) => item.status === 'PENDING' ? 'منتظر اقدام' : item.status === 'APPROVED' ? 'تأیید شده' : 'رد شده'),
          });
        }
      }

      const label = entityLabel(intent.entity);
      const text = totalCount === 0
        ? `هیچ ${label}ی با مشخصات درخواستی پیدا نشد.`
        : intent.action === 'count'
          ? `${toPersianDigits(totalCount)} ${label} مطابق درخواست شما وجود دارد.`
          : intent.action === 'detail' && totalCount === 1
            ? `جزئیات ${label} موردنظر پیدا شد.`
            : `${toPersianDigits(totalCount)} ${label} پیدا شد${intent.includeList ? '؛ فهرست کامل در ادامه در دسترس است.' : '.'}`;

      return {
        intent,
        text,
        totalCount,
        items: intent.includeList ? items : [],
        summary,
        charts,
        emptySuggestion: totalCount === 0
          ? `می‌توانید فیلتر دیگری را امتحان کنید یا درخواست «همه ${label}ها» را بنویسید.`
          : undefined,
      };
    } catch (error) {
      console.error('Chat service query failed', error);
      throw new Error('در دریافت اطلاعات سامانه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.');
    }
  }
}

export const chatService = new ChatService();
