/**
 * قابلیت‌های هوشمند مرحله دوم. اصل مشترک: نتیجه همیشه از داده واقعی سامانه
 * است؛ هوش مصنوعی فقط می‌فهمد، گسترش می‌دهد یا قضاوت می‌کند و هرگز پرونده
 * یا شخصی را از خودش نمی‌سازد (شناسه‌ها با داده واقعی اعتبارسنجی می‌شوند).
 */
import { AgendaItem, Department, Meeting, PriorityLevel, Resolution, User } from '../../types';
import { AiResult, extractJson, runAi } from './aiClient';
import { formalizeLocally, textSimilarity } from './aiService';
import { getResolutionExecutionMeta } from '../../utils/formatters';
import { timeToMinutes } from '../../utils/agendaTime';
import { addJalaliDays, todayJalali, parseJalali, jalaliToGregorian } from '../../utils/jalaliDate';

const norm = (text: string) => (text || '')
  .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[‌]/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const fa = (n: number) => n.toLocaleString('fa-IR');

// ——————————————————— ۱) جستجوی مفهومی ———————————————————

/** دانش مفهومی محلی: هر مفهوم و واژه‌های هم‌خانواده آن در ادبیات اداری. */
const CONCEPTS: { key: string[]; related: string[] }[] = [
  { key: ['امنیت', 'امنیتی', 'سایبری'], related: ['امنیت', 'سایبری', 'نفوذ', 'افتا', 'رمز', 'حراست', 'پشتیبان', 'بکاپ', 'دسترسی', 'حمله', 'تهدید', 'آسیب', 'پنتست', 'فایروال', 'حفاظت', 'محرمانه'] },
  { key: ['داده', 'اطلاعات', 'دیتا'], related: ['داده', 'اطلاعات', 'پایگاه', 'دیتابیس', 'پشتیبان', 'بکاپ', 'مرکز داده', 'سرور', 'ذخیره', 'آرشیو', 'حیاتی'] },
  { key: ['فناوری', 'دیجیتال', 'سامانه', 'نرم'], related: ['فناوری', 'سامانه', 'نرم افزار', 'دیجیتال', 'شبکه', 'سرور', 'زیرساخت', 'ابری', 'اپلیکیشن', 'پورتال', 'الکترونیک', 'هوشمند'] },
  { key: ['مالی', 'هزینه', 'بودجه', 'پول'], related: ['مالی', 'بودجه', 'اعتبار', 'هزینه', 'پرداخت', 'تأمین', 'سقف', 'ذی حساب', 'حسابداری', 'درآمد', 'تخصیص', 'ریال'] },
  { key: ['کارکنان', 'نیرو', 'منابع انسانی', 'پرسنل', 'استخدام'], related: ['کارکنان', 'منابع انسانی', 'آموزش', 'ارزیابی عملکرد', 'استخدام', 'جذب', 'رفاه', 'پاداش', 'آیین نامه', 'پیشنهادها', 'انگیزش'] },
  { key: ['آموزش', 'دوره', 'یادگیری'], related: ['آموزش', 'دوره', 'کارگاه', 'مهارت', 'توانمندسازی', 'آگاهی'] },
  { key: ['قرارداد', 'حقوقی', 'پیمانکار'], related: ['قرارداد', 'پیمانکار', 'حقوقی', 'تمدید', 'مناقصه', 'پشتیبانی', 'تعهد', 'آیین نامه', 'مقررات'] },
  { key: ['مشتری', 'شعب', 'شعبه', 'مراجعه'], related: ['شعب', 'شعبه', 'مشتری', 'مراجعان', 'خدمت', 'نوبت', 'رضایت', 'باجه'] },
  { key: ['تجهیزات', 'خرید', 'سخت'], related: ['تجهیزات', 'خرید', 'نوسازی', 'سخت افزار', 'شبکه', 'تأمین', 'کالا'] },
  { key: ['گزارش', 'پایش', 'نظارت', 'شاخص'], related: ['گزارش', 'پایش', 'نظارت', 'شاخص', 'داشبورد', 'ارزیابی', 'استانداردسازی', 'عملکرد'] },
];

export const expandQueryLocally = (query: string): string[] => {
  const q = norm(query);
  const terms = new Set(q.split(' ').filter((t) => t.length > 1 && !['هر', 'چیزی', 'درباره', 'مربوط', 'به', 'مصوبات', 'مصوبه', 'در', 'و', 'با', 'های', 'که'].includes(t)));
  CONCEPTS.forEach((concept) => {
    if (concept.key.some((key) => q.includes(norm(key)))) concept.related.forEach((r) => terms.add(norm(r)));
  });
  return Array.from(terms);
};

export interface SemanticHit { resolution: Resolution; score: number; matched: string[] }

const scoreResolution = (resolution: Resolution, terms: string[]): SemanticHit => {
  const title = norm(resolution.topicTitle);
  const body = norm(`${resolution.requestDescription} ${resolution.executionDescription || ''} ${resolution.reviewResultNotes || ''}`);
  const meta = norm(`${resolution.responsibleDepartmentName || ''} ${resolution.proposerDepartment} ${resolution.meetingTitle}`);
  let score = 0;
  const matched: string[] = [];
  terms.forEach((term) => {
    const t = norm(term);
    if (!t) return;
    let s = 0;
    if (title.includes(t)) s += 3;
    if (body.includes(t)) s += 1.5;
    if (meta.includes(t)) s += 1;
    if (s > 0) { score += s; matched.push(term); }
  });
  return { resolution, score, matched };
};

export const semanticSearch = async (query: string, resolutions: Resolution[], actorId?: string): Promise<AiResult<SemanticHit[]>> => {
  const rank = (terms: string[]) => {
    const hits = resolutions.map((r) => scoreResolution(r, terms)).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score);
    // دنباله کم‌ارتباط حذف می‌شود: فقط مواردی که حداقل ۳۵٪ امتیاز بهترین نتیجه را دارند.
    const cutoff = Math.max(1.5, (hits[0]?.score || 0) * 0.35);
    return hits.filter((hit) => hit.score >= cutoff);
  };
  return runAi({
    feature: 'semanticSearch',
    actorId,
    json: true,
    maxTokens: 300,
    system: 'وظیفه: گسترش مفهومی یک عبارت جستجو برای سامانه مصوبات اداری فارسی. خروجی فقط JSON: terms (آرایه ۸ تا ۲۰ واژه یا عبارت کوتاه فارسی هم‌معنا، زیرمفهوم یا مرتبط که احتمالاً در عنوان یا شرح مصوبات آمده). هیچ توضیحی نده.',
    messages: [{ role: 'user', content: query }],
    parse: (text) => {
      const data = extractJson<{ terms: string[] }>(text);
      const terms = Array.from(new Set([...expandQueryLocally(query), ...(data.terms || []).map(String)]));
      return rank(terms);
    },
    fallback: () => rank(expandQueryLocally(query)),
  });
};

// ——————————————————— ۲) بررسی تناقض و تکرار ———————————————————

export type ConflictKind = 'DUPLICATE' | 'CONFLICT' | 'RELATED';
export interface ConflictFinding { resolution: Resolution; kind: ConflictKind; reason: string; similarity: number }

const OPPOSITES: [string, string][] = [
  ['افزایش', 'کاهش'], ['تمدید', 'لغو'], ['تمدید', 'فسخ'], ['خرید', 'فروش'], ['مجاز', 'ممنوع'], ['ادامه', 'توقف'],
  ['راه اندازی', 'تعطیلی'], ['استخدام', 'تعدیل'], ['تصویب', 'رد'], ['ایجاد', 'حذف'], ['اجباری', 'اختیاری'], ['متمرکز', 'غیرمتمرکز'],
];

export const KIND_LABEL: Record<ConflictKind, string> = { DUPLICATE: 'احتمال تکرار', CONFLICT: 'احتمال تناقض', RELATED: 'مرتبط' };

export const checkResolutionConflicts = async (draft: { topic: string; text: string }, existing: Resolution[], actorId?: string): Promise<AiResult<ConflictFinding[]>> => {
  const draftText = `${draft.topic} ${draft.text}`;
  const candidates = existing
    .filter((r) => !['ARCHIVED'].includes(r.executionStatus) && r.approvalStatus === 'APPROVED')
    .map((r) => ({ r, similarity: textSimilarity(draftText, `${r.topicTitle} ${r.executionDescription || r.requestDescription}`) }))
    .filter((c) => c.similarity >= 0.12)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);
  const local = (): ConflictFinding[] => candidates.map(({ r, similarity }) => {
    const a = norm(draftText); const b = norm(`${r.topicTitle} ${r.executionDescription || r.requestDescription}`);
    const opposite = OPPOSITES.find(([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)));
    if (opposite) return { resolution: r, kind: 'CONFLICT' as const, similarity, reason: `موضوع مشابه است اما یکی «${opposite[0]}» و دیگری «${opposite[1]}» را مقرر کرده است.` };
    if (similarity >= 0.35) return { resolution: r, kind: 'DUPLICATE' as const, similarity, reason: `${fa(Math.round(similarity * 100))}٪ هم‌پوشانی متنی با این مصوبه قبلی (${getResolutionExecutionMeta(r.executionStatus).label}).` };
    return { resolution: r, kind: 'RELATED' as const, similarity, reason: 'موضوع مرتبط؛ برای هماهنگی و جلوگیری از دوباره‌کاری بررسی شود.' };
  }).filter((f) => f.kind !== 'RELATED' || f.similarity >= 0.2);
  if (candidates.length === 0) return { data: [], source: 'LOCAL', notice: 'مصوبه مشابهی در سامانه پیدا نشد.' };
  return runAi({
    feature: 'conflictCheck',
    actorId,
    json: true,
    maxTokens: 700,
    system: 'وظیفه: مقایسه یک مصوبه پیش‌نویس با مصوبات قبلی و تشخیص تکرار یا تناقض. فقط درباره شناسه‌های داده‌شده نظر بده. خروجی فقط JSON: findings (آرایه {id, kind: DUPLICATE|CONFLICT|RELATED|NONE, reason: یک جمله فارسی دقیق}). DUPLICATE یعنی همان اقدام دوباره مقرر شده؛ CONFLICT یعنی دو تصمیم با هم قابل اجرا نیستند یا خلاف یکدیگرند.',
    messages: [{ role: 'user', content: `پیش‌نویس: ${draftText}\n\nمصوبات قبلی:\n${candidates.map(({ r }) => `id=${r.id} | ${r.resolutionNumber} | ${r.topicTitle} | ${r.executionDescription || r.requestDescription} | وضعیت: ${getResolutionExecutionMeta(r.executionStatus).label}`).join('\n')}` }],
    parse: (text) => {
      const data = extractJson<{ findings: { id: string; kind: string; reason: string }[] }>(text);
      return (data.findings || [])
        .filter((f) => ['DUPLICATE', 'CONFLICT', 'RELATED'].includes(f.kind))
        .map((f) => { const c = candidates.find((x) => x.r.id === f.id); return c ? { resolution: c.r, kind: f.kind as ConflictKind, reason: f.reason, similarity: c.similarity } : null; })
        .filter((f): f is ConflictFinding => Boolean(f));
    },
    fallback: local,
  });
};

// ——————————————————— ۳) استخراج مصوبه از متن ———————————————————

export interface ExtractedResolution {
  topic: string;
  executionDescription: string;
  responsibleUserId?: string;
  responsibleName?: string;
  deadlineDays: number;
  priority: PriorityLevel;
  agendaItemId?: string;
  evidence: string;
}

const DECISION_MARKERS = /(مقرر شد|مقرر گردید|مصوب شد|تصویب شد|موظف (است|شد|شدند|گردید)|مسئول|تکلیف شد|تا تاریخ|ظرف مدت|اقدام (کند|نماید|نمایند)|ارائه (دهد|نماید|کند))/;

const deadlineFromText = (text: string): number => {
  const m = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/(\d+)\s*(روز|هفته|ماه)/);
  if (!m) return /(فوری|بلافاصله)/.test(text) ? 7 : 30;
  const n = Number(m[1]);
  return m[2] === 'روز' ? n : m[2] === 'هفته' ? n * 7 : n * 30;
};

export const extractResolutions = (input: { text: string; agendas: AgendaItem[]; users: User[]; departments: Department[] }, actorId?: string): Promise<AiResult<ExtractedResolution[]>> => {
  const active = input.users.filter((u) => u.isActive !== false);
  const findUser = (sentence: string) => active.find((u) => {
    const parts = norm(u.fullName).split(' ').filter((p) => p.length >= 4 && !['مهندس', 'دکتر', 'سرکار', 'خانم', 'آقای'].includes(p));
    return parts.some((p) => norm(sentence).includes(p)) || norm(sentence).includes(norm(u.title));
  });
  const findAgenda = (sentence: string) => input.agendas
    .map((a) => ({ a, s: textSimilarity(sentence, a.title) }))
    .sort((x, y) => y.s - x.s)
    .find((x) => x.s >= 0.15)?.a;
  const local = (): ExtractedResolution[] => input.text
    .split(/(?<=[.؟!\n])\s*|(?:\s*[-•]\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && DECISION_MARKERS.test(s))
    .slice(0, 12)
    .map((sentence) => {
      const user = findUser(sentence);
      const agenda = findAgenda(sentence);
      const priority: PriorityLevel = /(فوری|بحران|بلافاصله)/.test(sentence) ? 'CRITICAL' : /(مهم|ضروری)/.test(sentence) ? 'HIGH' : 'MEDIUM';
      return {
        topic: (agenda?.title || sentence.replace(DECISION_MARKERS, '').split(' ').slice(0, 9).join(' ')).trim(),
        executionDescription: formalizeLocally(sentence),
        responsibleUserId: user?.id,
        responsibleName: user?.fullName,
        deadlineDays: deadlineFromText(sentence),
        priority,
        agendaItemId: agenda?.id,
        evidence: sentence,
      };
    });
  return runAi({
    feature: 'extraction',
    actorId,
    json: true,
    maxTokens: 1600,
    system: 'وظیفه: استخراج «مصوبه‌ها» از متن صورت‌جلسه یا گفتار جلسه. فقط تصمیم‌هایی را استخراج کن که واقعاً در متن گرفته شده‌اند (نه بحث یا پیشنهاد). خروجی فقط JSON: items (آرایه {topic: عنوان کوتاه, executionDescription: متن رسمی مصوبه با «مقرر شد», responsibleUserId: دقیقاً یکی از شناسه‌های کاربران یا null, agendaItemId: یکی از شناسه‌های بندها یا null, deadlineDays: عدد روز, priority: LOW|MEDIUM|HIGH|URGENT|CRITICAL, evidence: جمله‌ای از متن که مبنای این مصوبه است}). اگر مصوبه‌ای نیست، آرایه خالی.',
    messages: [{ role: 'user', content: `متن:\n${input.text.slice(0, 20000)}\n\nبندهای دستورکار:\n${input.agendas.map((a) => `${a.id}: ${a.title}`).join('\n') || '—'}\n\nکاربران:\n${active.map((u) => `${u.id}: ${u.fullName} — ${u.title}`).join('\n')}` }],
    parse: (text) => {
      const data = extractJson<{ items: Partial<ExtractedResolution>[] }>(text);
      return (data.items || []).filter((i) => i.executionDescription).map((i) => {
        const user = active.find((u) => u.id === i.responsibleUserId);
        return {
          topic: String(i.topic || '').trim() || String(i.executionDescription).slice(0, 60),
          executionDescription: String(i.executionDescription).trim(),
          responsibleUserId: user?.id,
          responsibleName: user?.fullName,
          deadlineDays: Math.min(365, Math.max(1, Number(i.deadlineDays) || 30)),
          priority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'] as const).includes(i.priority as PriorityLevel) ? i.priority as PriorityLevel : 'MEDIUM',
          agendaItemId: input.agendas.some((a) => a.id === i.agendaItemId) ? i.agendaItemId : undefined,
          evidence: String(i.evidence || ''),
        };
      });
    },
    fallback: local,
  });
};

// ——————————————————— ۴) خلاصه پیوست ———————————————————

export interface DocumentSummary { summary: string; keyPoints: string[]; decisionsNeeded: string[]; risks: string[]; figures: string[] }

export const summarizeDocument = (text: string, fileName: string, actorId?: string): Promise<AiResult<DocumentSummary>> => runAi({
  feature: 'documentReader',
  actorId,
  json: true,
  maxTokens: 1200,
  system: 'وظیفه: خلاصه یک سند پیوست جلسه برای تصمیم‌گیران. فقط بر اساس متن سند. خروجی فقط JSON: summary (۳ تا ۴ جمله)، keyPoints (۳ تا ۶ نکته کلیدی)، decisionsNeeded (تصمیم‌هایی که سند از جلسه می‌خواهد؛ می‌تواند خالی باشد)، risks (ریسک‌ها یا ابهام‌های مهم)، figures (اعداد، مبالغ و تاریخ‌های مهم با توضیح کوتاه).',
  messages: [{ role: 'user', content: `نام فایل: ${fileName}\n\nمتن سند:\n${text.slice(0, 30000)}` }],
  parse: (out) => {
    const d = extractJson<Partial<DocumentSummary>>(out);
    if (!d.summary) throw new Error('خروجی ناقص');
    return { summary: d.summary, keyPoints: d.keyPoints || [], decisionsNeeded: d.decisionsNeeded || [], risks: d.risks || [], figures: d.figures || [] };
  },
  fallback: () => {
    const sentences = text.split(/(?<=[.؟!\n])\s+/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 400);
    const freq = new Map<string, number>();
    norm(text).split(' ').filter((w) => w.length > 3).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    const scored = sentences.map((s, i) => ({ s, i, score: norm(s).split(' ').reduce((sum, w) => sum + (freq.get(w) || 0), 0) / Math.max(8, norm(s).split(' ').length) }));
    const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 6).sort((a, b) => a.i - b.i).map((x) => x.s);
    const figures = Array.from(new Set((text.match(/[\d۰-۹][\d۰-۹,٬.\/]*\s*(ریال|تومان|درصد|٪|میلیون|میلیارد|روز|ماه|سال)?/g) || []).map((f) => f.trim()).filter((f) => f.length > 2))).slice(0, 6);
    return {
      summary: top.slice(0, 3).join(' ') || text.slice(0, 300),
      keyPoints: top.slice(0, 5),
      decisionsNeeded: sentences.filter((s) => /(پیشنهاد می‌شود|درخواست می‌شود|تصویب|موافقت|تأیید)/.test(s)).slice(0, 3),
      risks: sentences.filter((s) => /(ریسک|خطر|تأخیر|کمبود|مشکل|چالش)/.test(s)).slice(0, 3),
      figures,
    };
  },
});

// ——————————————————— ۵) صورت‌جلسه از گفتار ———————————————————

const minutesHeader = (meeting: Meeting) => `صورت‌جلسه «${meeting.title}»\nشماره ${meeting.meetingNumber} — تاریخ ${meeting.dateJalali}، ساعت ${meeting.startTime} تا ${meeting.endTime}${meeting.location ? ` — ${meeting.location}` : ''}`;

export const minutesFromTranscript = (meeting: Meeting, transcript: string, actorId?: string): Promise<AiResult<string>> => runAi({
  feature: 'meetingRecorder',
  actorId,
  maxTokens: 1800,
  system: 'وظیفه: تبدیل متن پیاده‌شده گفتار یک جلسه (ممکن است محاوره‌ای و نامرتب باشد) به «صورت‌جلسه رسمی» فارسی اداری. عنوان و مشخصات جلسه را ننویس (سامانه عیناً از پرونده جلسه اضافه می‌کند) و مستقیم با «خلاصه مذاکرات» شروع کن. ساختار: خلاصه مذاکرات هر بند، تصمیم‌های گرفته‌شده با مسئول و مهلت (فقط اگر در گفتار آمده)، جمع‌بندی. عنوان بندها را عیناً همان‌طور که داده شده بنویس. چیزی که گفته نشده اضافه نکن. بدون Markdown.',
  messages: [{ role: 'user', content: `جلسه: ${meeting.title} — ${meeting.meetingNumber} — ${meeting.dateJalali} ${meeting.startTime}\nبندها: ${meeting.agendaItems.filter((a) => !a.isRemoved).map((a) => a.title).join('؛ ')}\n\nمتن گفتار:\n${transcript.slice(0, 25000)}` }],
  // مشخصات جلسه از خود پرونده می‌آید تا عنوان و شماره هرگز تغییر نکند یا کوتاه نشود.
  parse: (t) => `${minutesHeader(meeting)}\n\n${t.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()}`,
  fallback: () => [
    `صورت‌جلسه ${meeting.title}`,
    `شماره ${meeting.meetingNumber} — تاریخ ${meeting.dateJalali}، ساعت ${meeting.startTime} تا ${meeting.endTime}`,
    '',
    'خلاصه مذاکرات (بر اساس متن پیاده‌شده گفتار):',
    ...transcript.split(/(?<=[.؟!\n])\s+/).map((s) => s.trim()).filter((s) => s.length > 12).slice(0, 30).map((s, i) => `${fa(i + 1)}. ${formalizeLocally(s)}`),
    '',
    'تصمیم‌ها و مصوبات با دکمه «استخراج مصوبات از متن» قابل استخراج و ثبت است.',
  ].join('\n'),
});

// ——————————————————— ۶) پیشنهاد زمان جلسه ———————————————————

export interface SlotSuggestion { dateJalali: string; startTime: string; endTime: string; weekday: string; freeCount: number; total: number; busyNames: string[]; score: number }

const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const weekdayOf = (jalali: string) => {
  const p = parseJalali(jalali);
  if (!p) return { name: '', index: -1 };
  const [gy, gm, gd] = jalaliToGregorian(p.year, p.month, p.day);
  const day = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay(); // 0 = Sunday
  return { name: WEEKDAYS[day], index: day };
};
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * زمان‌های آزاد مشترک اعضا در روزهای کاری آینده (شنبه تا چهارشنبه ۸ تا ۱۶،
 * پنجشنبه تا ۱۲) با کنار گذاشتن جلسات ثبت‌شده هر نفر. کاملاً قطعی و بر پایه
 * داده واقعی تقویم سامانه.
 */
export const suggestMeetingSlots = (input: { participantIds: string[]; durationMinutes: number; meetings: Meeting[]; users: User[]; days?: number; startFrom?: string }): SlotSuggestion[] => {
  const ids = Array.from(new Set(input.participantIds.filter(Boolean)));
  const busy = (userId: string, date: string, start: number, end: number) => input.meetings.some((m) =>
    m.status !== 'CANCELLED' && m.dateJalali.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) === date &&
    (m.organizerId === userId || m.secretaryId === userId || m.members.some((x) => x.userId === userId)) &&
    timeToMinutes(m.startTime) < end && timeToMinutes(m.endTime) > start);
  const results: SlotSuggestion[] = [];
  const base = input.startFrom || todayJalali();
  for (let offset = 1; offset <= (input.days || 14); offset++) {
    const date = addJalaliDays(base, offset);
    if (!date) continue;
    const { name, index } = weekdayOf(date);
    if (index === 5) continue; // جمعه
    const dayEnd = index === 4 ? 12 * 60 : 16 * 60;
    for (let start = 8 * 60; start + input.durationMinutes <= dayEnd; start += 30) {
      const end = start + input.durationMinutes;
      const busyIds = ids.filter((id) => busy(id, date, start, end));
      const freeCount = ids.length - busyIds.length;
      // ترجیح: همه آزاد، ساعات میانی صبح، روزهای نزدیک‌تر.
      const score = freeCount * 100 - Math.abs(start - 10 * 60) / 6 - offset * 2;
      results.push({ dateJalali: date, startTime: hhmm(start), endTime: hhmm(end), weekday: name, freeCount, total: ids.length, busyNames: busyIds.map((id) => input.users.find((u) => u.id === id)?.fullName || id), score });
    }
  }
  // یک پیشنهاد برای هر روز، بهترین‌ها اول.
  const bestPerDay = new Map<string, SlotSuggestion>();
  results.sort((a, b) => b.score - a.score).forEach((slot) => { if (!bestPerDay.has(slot.dateJalali)) bestPerDay.set(slot.dateJalali, slot); });
  return Array.from(bestPerDay.values()).sort((a, b) => b.score - a.score).slice(0, 5);
};

// ——————————————————— ۷) پیشنهاد نتیجه بندها از روی گفتار ———————————————————

export type AgendaOutcome = NonNullable<AgendaItem['outcomeStatus']>;

export const AGENDA_OUTCOME_OPTIONS: { value: AgendaOutcome; label: string }[] = [
  { value: 'APPROVED', label: 'تصویب شد' },
  { value: 'NOT_APPROVED', label: 'تصویب نشد' },
  { value: 'CONDITIONAL', label: 'تصویب مشروط' },
  { value: 'DEFERRED', label: 'موکول به جلسه بعد' },
  { value: 'REFERRED', label: 'ارجاع به واحد مربوطه' },
  { value: 'NEEDS_MORE_REVIEW', label: 'نیاز به بررسی بیشتر' },
  { value: 'NEEDS_REVISION', label: 'نیاز به اصلاح' },
  { value: 'CLOSED', label: 'مختومه' },
];

export interface AgendaOutcomeSuggestion {
  agendaItemId: string;
  agendaTitle: string;
  /** null یعنی در گفتار درباره این بند تصمیمی شنیده نشد — حدس زده نمی‌شود. */
  outcome: AgendaOutcome | null;
  notes: string;
  /** جمله‌ای از خود گفتار که مبنای پیشنهاد است. */
  evidence: string;
}

/** ترتیب مهم است: «تصویب نشد» نباید به‌عنوان «تصویب شد» تشخیص داده شود. */
const OUTCOME_PATTERNS: { outcome: AgendaOutcome; re: RegExp }[] = [
  { outcome: 'NOT_APPROVED', re: /(تصویب نشد|رد شد|رد گردید|مخالفت شد|موافقت نشد|تأیید نشد|تایید نشد)/ },
  { outcome: 'CONDITIONAL', re: /(مشروط|به شرط|منوط به|مشروط بر)/ },
  { outcome: 'DEFERRED', re: /(موکول|جلسه بعد|جلسه آینده|به تعویق|تعویق)/ },
  { outcome: 'REFERRED', re: /(ارجاع|واگذار شد|به کمیته|به واحد .{1,30} سپرده)/ },
  { outcome: 'NEEDS_MORE_REVIEW', re: /(بررسی بیشتر|بررسی تکمیلی|مطالعه بیشتر|نیاز به بررسی)/ },
  { outcome: 'NEEDS_REVISION', re: /(اصلاح شود|نیاز به اصلاح|بازنگری شود|اصلاح و دوباره)/ },
  { outcome: 'CLOSED', re: /(مختومه|منتفی شد|موضوعیت ندارد)/ },
  { outcome: 'APPROVED', re: /(تصویب شد|مصوب شد|تصویب گردید|موافقت شد|تأیید شد|تایید شد|مقرر شد|مقرر گردید)/ },
];

const sentencesOf = (text: string) => text.split(/(?<=[.؟!\n])\s+|\s*[-•]\s+/).map((s) => s.trim()).filter((s) => s.length > 8);

export const suggestAgendaOutcomes = (meeting: Meeting, transcript: string, actorId?: string): Promise<AiResult<AgendaOutcomeSuggestion[]>> => {
  const agendas = meeting.agendaItems.filter((a) => !a.isRemoved);
  const sentences = sentencesOf(transcript);
  const normTranscript = norm(transcript);

  const local = (): AgendaOutcomeSuggestion[] => agendas.map((agenda) => {
    // جملاتی که به همین بند مربوط‌اند؛ اگر جلسه یک بند دارد، همه جملات.
    const related = sentences
      .map((s) => ({ s, score: textSimilarity(s, agenda.title) }))
      .filter((x) => agendas.length === 1 || x.score >= 0.12)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s);
    for (const sentence of related) {
      const hit = OUTCOME_PATTERNS.find((p) => p.re.test(sentence));
      if (hit) {
        const condition = hit.outcome === 'CONDITIONAL' ? sentence.match(/(به شرط|منوط به|مشروط بر)(.+)/)?.[0] : undefined;
        return { agendaItemId: agenda.id, agendaTitle: agenda.title, outcome: hit.outcome, notes: formalizeLocally(condition || sentence), evidence: sentence };
      }
    }
    return { agendaItemId: agenda.id, agendaTitle: agenda.title, outcome: null, notes: '', evidence: '' };
  });

  if (agendas.length === 0) return Promise.resolve({ data: [], source: 'LOCAL' as const, notice: 'این جلسه بند فعالی ندارد.' });

  return runAi({
    feature: 'meetingRecorder',
    actorId,
    json: true,
    maxTokens: 1500,
    system: 'وظیفه: از روی متن پیاده‌شده گفتار جلسه، تصمیمی را که درباره هر بند دستورکار گرفته شده تشخیص بده. فقط اگر تصمیم صریحاً در متن آمده باشد. خروجی فقط JSON: items (آرایه {agendaItemId: دقیقاً یکی از شناسه‌های بندها, outcome: یکی از APPROVED | NOT_APPROVED | CONDITIONAL | DEFERRED | REFERRED | NEEDS_MORE_REVIEW | NEEDS_REVISION | CLOSED یا null اگر درباره این بند تصمیمی گفته نشده, notes: شرح کوتاه رسمی نتیجه (برای مشروط: شرط؛ برای ارجاع: به کجا), evidence: نقل‌قول دقیق یک جمله از خود متن که مبنای تشخیص است}). هرگز حدس نزن؛ اگر مطمئن نیستی outcome را null بگذار.',
    messages: [{ role: 'user', content: `بندهای دستورکار:\n${agendas.map((a) => `${a.id}: ${a.title}`).join('\n')}\n\nمتن گفتار جلسه:\n${transcript.slice(0, 20000)}` }],
    parse: (text) => {
      const data = extractJson<{ items: Partial<AgendaOutcomeSuggestion>[] }>(text);
      const allowed = AGENDA_OUTCOME_OPTIONS.map((o) => o.value);
      return agendas.map((agenda) => {
        const item = (data.items || []).find((i) => i.agendaItemId === agenda.id);
        const evidence = String(item?.evidence || '').trim();
        // شاهدی که در خود متن نیست پذیرفته نمی‌شود (جلوگیری از ساختگی بودن).
        const grounded = evidence.length > 5 && normTranscript.includes(norm(evidence).slice(0, 40));
        const outcome = item && allowed.includes(item.outcome as AgendaOutcome) && grounded ? item.outcome as AgendaOutcome : null;
        return { agendaItemId: agenda.id, agendaTitle: agenda.title, outcome, notes: outcome ? String(item?.notes || evidence) : '', evidence: outcome ? evidence : '' };
      });
    },
    fallback: local,
  });
};
