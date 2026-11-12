/**
 * قابلیت‌های هوشمند سامانه. هر قابلیت:
 *  - یک Prompt دقیق با داده واقعی و Scope‌شده همان کاربر دارد،
 *  - خروجی ساخت‌یافته (JSON) را اعتبارسنجی می‌کند،
 *  - و یک «موتور محلی» قاعده‌محور دارد تا در نبود اتصال هم مفید باشد.
 * داده حساس (تلفن، ایمیل، کد ملی) هرگز در Prompt قرار نمی‌گیرد.
 */
import { AgendaItem, Department, Meeting, Proposal, Resolution, Task, User, PriorityLevel } from '../../types';
import { AiResult, extractJson, runAi } from './aiClient';
import { getResolutionExecutionMeta, getMeetingStatusMeta, toPersianDigits } from '../../utils/formatters';
import { jalaliToGregorian, parseJalali, todayJalali } from '../../utils/jalaliDate';
import type { DashboardModel } from '../../modules/dashboard/dashboardData';

// ——————————————————— Helpers ———————————————————

const fa = (value: string | number) => toPersianDigits(String(value));

const normalize = (text: string) => text
  .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[‌ً-ْ]/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const STOP = new Set(['و', 'در', 'به', 'از', 'که', 'این', 'با', 'برای', 'را', 'های', 'ها', 'یک', 'تا', 'بر', 'آن', 'است', 'می', 'شود', 'مورد', 'جهت', 'سازمان']);
const tokens = (text: string) => new Set(normalize(text).split(' ').filter((t) => t.length > 1 && !STOP.has(t)));

/** شباهت متنی (Jaccard) برای یافتن موارد مشابه/تکراری. */
export const textSimilarity = (a: string, b: string): number => {
  const ta = tokens(a); const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0; ta.forEach((t) => { if (tb.has(t)) inter += 1; });
  return inter / (ta.size + tb.size - inter);
};

const daysUntil = (jalali?: string): number | null => {
  const target = parseJalali(jalali);
  const today = parseJalali(todayJalali());
  if (!target || !today) return null;
  const toTime = (p: { year: number; month: number; day: number }) => { const [y, m, d] = jalaliToGregorian(p.year, p.month, p.day); return Date.UTC(y, m - 1, d); };
  return Math.round((toTime(target) - toTime(today)) / 86_400_000);
};

const sentence = (text: string) => {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return /[.!؟?]$/.test(t) ? t : `${t}.`;
};

const COLLOQUIAL: [RegExp, string][] = [
  [/\bمی‌?خوایم\b/g, 'درخواست می‌شود'], [/\bمیخوام\b/g, 'درخواست دارم'], [/\bبشه\b/g, 'انجام شود'],
  [/\bنمیشه\b/g, 'امکان‌پذیر نیست'], [/\bمیشه\b/g, 'می‌شود'], [/\bخیلی\b/g, 'بسیار'], [/\bالان\b/g, 'در حال حاضر'],
  [/\bیه\b/g, 'یک'], [/\bرو\b/g, 'را'], [/\bواسه\b/g, 'برای'], [/\bکنیم\b/g, 'شود'], [/\bدرست کنیم\b/g, 'اصلاح شود'],
];

/** موتور محلی رسمی‌سازی متن (بدون AI). */
export const formalizeLocally = (text: string): string => {
  let out = text.trim();
  COLLOQUIAL.forEach(([re, rep]) => { out = out.replace(re, rep); });
  out = out.replace(/\s*([،؛:.!؟])\s*/g, '$1 ').replace(/ +/g, ' ').replace(/\.\s*\./g, '.');
  return out.split(/(?<=[.؟!])\s+/).map(sentence).join(' ').trim();
};

const DEPARTMENT_KEYWORDS: { match: RegExp; departmentHint: string }[] = [
  { match: /(فناوری|سامانه|نرم ?افزار|شبکه|سرور|دیجیتال|داده|زیرساخت|ابر|اپلیکیشن|سایت)/, departmentHint: 'فناوری' },
  { match: /(امنیت|افتا|نفوذ|حراست|سایبری|رمز)/, departmentHint: 'امنیت' },
  { match: /(مالی|بودجه|اعتبار|هزینه|پرداخت|ذی ?حساب|حساب)/, departmentHint: 'مالی' },
  { match: /(حقوقی|قرارداد|دعاوی|مقررات|آیین ?نامه)/, departmentHint: 'حقوقی' },
  { match: /(منابع انسانی|استخدام|آموزش|کارکنان|رفاه|جذب|ارزیابی عملکرد)/, departmentHint: 'منابع انسانی' },
  { match: /(برنامه ?ریزی|راهبرد|تحول|استراتژی|نظارت)/, departmentHint: 'برنامه' },
  { match: /(پروژه|طرح|پیمانکار|PMO)/i, departmentHint: 'پروژه' },
];

const PRIORITY_KEYWORDS: { match: RegExp; priority: PriorityLevel }[] = [
  { match: /(فوری|بحران|حادثه|قطعی|اضطرار|بلافاصله)/, priority: 'CRITICAL' },
  { match: /(مهم|ضروری|الزامی|حساس|امنیت)/, priority: 'HIGH' },
  { match: /(بررسی|مطالعه|پیشنهاد|ارزیابی)/, priority: 'MEDIUM' },
];

const PRIORITY_DAYS: Record<PriorityLevel, number> = { CRITICAL: 7, URGENT: 10, HIGH: 21, MEDIUM: 45, LOW: 60 };

/** اطلاعات مجاز یک کاربر برای Prompt (بدون اطلاعات تماس). */
const userBrief = (u: User) => `${u.id}: ${u.fullName} — ${u.title} — ${u.departmentName}`;

// ——————————————————— 1) نگارش پیشنهاد ———————————————————

export interface ProposalDraft { title: string; description: string; rationale: string }

export const draftProposal = (idea: string, department: string, actorId?: string): Promise<AiResult<ProposalDraft>> => runAi({
  feature: 'writer',
  actorId,
  json: true,
  system: 'وظیفه: تبدیل یک ایده کوتاه به «مصوبه پیشنهادی» رسمی برای طرح در جلسه مدیریت. خروجی فقط JSON با کلیدهای title (حداکثر ۱۲ کلمه)، description (۳ تا ۵ جمله: شرح درخواست، دامنه و خروجی مورد انتظار) و rationale (۲ تا ۳ جمله: ضرورت و منافع سازمانی).',
  messages: [{ role: 'user', content: `واحد پیشنهاددهنده: ${department}\nایده: ${idea}` }],
  parse: (text) => {
    const data = extractJson<ProposalDraft>(text);
    if (!data.title || !data.description) throw new Error('خروجی ناقص');
    return { title: data.title.trim(), description: data.description.trim(), rationale: (data.rationale || '').trim() };
  },
  fallback: () => {
    const clean = formalizeLocally(idea).replace(/\.$/, '');
    const words = clean.split(' ');
    const title = words.slice(0, 10).join(' ');
    return {
      title: title.length < clean.length ? `${title}…` : title,
      description: `با توجه به نیازهای جاری ${department}، پیشنهاد می‌شود ${clean}. دامنه این اقدام شامل بررسی وضع موجود، تعیین الزامات، برآورد منابع و تدوین برنامه زمان‌بندی اجرا است. خروجی مورد انتظار، گزارش اجرایی همراه با شاخص‌های قابل سنجش برای ارائه در جلسه بعدی خواهد بود.`,
      rationale: `اجرای این پیشنهاد به بهبود کارایی فرآیندها، کاهش ریسک‌های عملیاتی و هم‌راستایی با اهداف راهبردی سازمان کمک می‌کند. تأخیر در تصمیم‌گیری می‌تواند هزینه و پیچیدگی اجرا را افزایش دهد.`,
    };
  },
});

// ——————————————————— 2) بهبود متن ———————————————————

export type WritingPurpose = 'proposal' | 'resolution' | 'progress' | 'followup' | 'minutes' | 'general';
const PURPOSE_LABEL: Record<WritingPurpose, string> = {
  proposal: 'شرح مصوبه پیشنهادی', resolution: 'متن اجرایی مصوبه', progress: 'گزارش پیشرفت اجرای مصوبه',
  followup: 'گزارش پیگیری مصوبه', minutes: 'صورت‌جلسه رسمی', general: 'متن اداری',
};

export const improveText = (text: string, purpose: WritingPurpose, mode: 'formal' | 'shorter' | 'expand' = 'formal', actorId?: string): Promise<AiResult<string>> => runAi({
  feature: 'writer',
  actorId,
  system: `وظیفه: ${mode === 'shorter' ? 'خلاصه و موجز کردن' : mode === 'expand' ? 'تکمیل و شفاف‌تر کردن (بدون افزودن واقعیت جدید)' : 'بازنویسی با لحن رسمی اداری'} یک «${PURPOSE_LABEL[purpose]}». فقط متن نهایی را بدون مقدمه، توضیح یا علامت‌گذاری Markdown برگردان.`,
  messages: [{ role: 'user', content: text }],
  parse: (out) => out.replace(/^["«]|["»]$/g, '').trim(),
  fallback: () => {
    const formal = formalizeLocally(text);
    if (mode === 'shorter') return formal.split(/(?<=[.؟!])\s+/).slice(0, 2).join(' ');
    if (mode === 'expand') return `${formal} ${purpose === 'progress' ? 'اقدامات بعدی طبق برنامه زمان‌بندی ادامه خواهد یافت و موانع احتمالی به‌موقع گزارش می‌شود.' : 'جزئیات اجرایی، مسئولیت‌ها و مهلت‌ها در پیوست ارائه می‌گردد.'}`;
    return formal;
  },
});

// ——————————————————— 3) تحلیل پیشنهاد برای مدیرعامل ———————————————————

export type ProposalRecommendation = 'APPROVE' | 'NO_BOARD' | 'CEO_ORDER' | 'RETURN';
export interface ProposalAnalysis {
  summary: string;
  strengths: string[];
  risks: string[];
  recommendation: ProposalRecommendation;
  rationale: string;
  questions: string[];
  similar: { id: string; title: string; status: string; score: number }[];
  completeness: number;
}

export const RECOMMENDATION_LABELS: Record<ProposalRecommendation, string> = {
  APPROVE: 'تأیید جهت طرح در جلسه', NO_BOARD: 'عدم نیاز به طرح در جلسه', CEO_ORDER: 'صدور دستور مستقیم', RETURN: 'برگشت جهت اصلاح و تکمیل',
};

const proposalCompleteness = (p: Proposal) => {
  let score = 0;
  if (p.title.trim().length > 10) score += 20;
  if (p.description.trim().length > 80) score += 30; else if (p.description.trim().length > 30) score += 15;
  if ((p.rationale || '').trim().length > 30) score += 20;
  if (p.presenterUserId || p.presenterName) score += 10;
  if (p.attachments?.length) score += 10;
  if (p.sourceLetterNumber) score += 10;
  return Math.min(100, score);
};

export const analyzeProposal = (proposal: Proposal, allProposals: Proposal[], actorId?: string): Promise<AiResult<ProposalAnalysis>> => {
  const similar = allProposals
    .filter((p) => p.id !== proposal.id)
    .map((p) => ({ id: p.id, title: p.title, status: p.status, score: textSimilarity(`${proposal.title} ${proposal.description}`, `${p.title} ${p.description}`) }))
    .filter((p) => p.score >= 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const completeness = proposalCompleteness(proposal);
  return runAi({
    feature: 'proposalReview',
    actorId,
    json: true,
    system: 'وظیفه: تحلیل کارشناسی یک مصوبه پیشنهادی برای تصمیم مدیرعامل. خروجی فقط JSON: summary (۲ جمله)، strengths (آرایه ۲ تا ۴ مورد کوتاه)، risks (آرایه ۲ تا ۴ مورد کوتاه)، recommendation (یکی از APPROVE, NO_BOARD, CEO_ORDER, RETURN)، rationale (۱ تا ۲ جمله دلیل توصیه)، questions (۲ تا ۳ پرسش کلیدی که مدیرعامل می‌تواند از پیشنهاددهنده بپرسد). توصیه RETURN وقتی است که اطلاعات ناقص است؛ CEO_ORDER وقتی موضوع اجرایی و ساده است و نیاز به بحث جمعی ندارد؛ NO_BOARD وقتی موضوع در سطح جلسه نیست.',
    messages: [{ role: 'user', content: `عنوان: ${proposal.title}\nواحد: ${proposal.proposerDepartmentName}\nشرح: ${proposal.description}\nضرورت: ${proposal.rationale || '—'}\nارائه‌دهنده: ${proposal.presenterName}\nپیوست: ${proposal.attachments?.length || 0}\nامتیاز کامل‌بودن اطلاعات (محاسبه سامانه): ${completeness}/100\nپیشنهادهای مشابه قبلی: ${similar.map((s) => `${s.title} (${s.status})`).join('، ') || 'ندارد'}` }],
    parse: (text) => {
      const d = extractJson<Partial<ProposalAnalysis>>(text);
      const rec = (['APPROVE', 'NO_BOARD', 'CEO_ORDER', 'RETURN'] as const).includes(d.recommendation as ProposalRecommendation) ? d.recommendation as ProposalRecommendation : 'APPROVE';
      return { summary: d.summary || '', strengths: (d.strengths || []).slice(0, 4), risks: (d.risks || []).slice(0, 4), recommendation: rec, rationale: d.rationale || '', questions: (d.questions || []).slice(0, 3), similar, completeness };
    },
    fallback: () => {
      const text = `${proposal.title} ${proposal.description} ${proposal.rationale || ''}`;
      const strengths: string[] = [];
      const risks: string[] = [];
      if ((proposal.rationale || '').length > 30) strengths.push('ضرورت و منافع پیشنهاد مستند شده است');
      if (proposal.description.length > 80) strengths.push('شرح درخواست کامل و قابل ارزیابی است');
      if (proposal.attachments?.length) strengths.push(`${fa(proposal.attachments.length)} پیوست پشتیبان دارد`);
      if (DEPARTMENT_KEYWORDS.some((k) => k.match.test(text))) strengths.push('حوزه مسئول اجرا به‌روشنی قابل تشخیص است');
      if (!proposal.rationale) risks.push('ضرورت و منافع پیشنهاد ذکر نشده است');
      if (proposal.description.length < 60) risks.push('شرح درخواست کوتاه است و جزئیات اجرایی ندارد');
      if (/(بودجه|هزینه|اعتبار|خرید)/.test(text)) risks.push('بار مالی دارد؛ برآورد هزینه باید پیوست شود');
      if (/(امنیت|داده|اطلاعات)/.test(text)) risks.push('ملاحظات امنیت اطلاعات نیازمند بررسی است');
      if (similar.length) risks.push(`با ${fa(similar.length)} پیشنهاد قبلی مشابهت دارد؛ احتمال دوباره‌کاری`);
      const rec: ProposalRecommendation = completeness < 45 ? 'RETURN' : proposal.description.length < 120 && !/(بودجه|راهبرد|سیاست|قرارداد)/.test(text) ? 'CEO_ORDER' : 'APPROVE';
      return {
        summary: `پیشنهاد «${proposal.title}» از ${proposal.proposerDepartmentName} ارائه شده است. میزان کامل‌بودن اطلاعات ${fa(completeness)} از ۱۰۰ ارزیابی می‌شود.`,
        strengths: strengths.length ? strengths : ['موضوع مشخص و قابل پیگیری است'],
        risks: risks.length ? risks : ['ریسک قابل توجهی در متن پیشنهاد شناسایی نشد'],
        recommendation: rec,
        rationale: rec === 'RETURN' ? 'اطلاعات پیشنهاد برای تصمیم‌گیری کافی نیست و تکمیل آن توصیه می‌شود.' : rec === 'CEO_ORDER' ? 'موضوع اجرایی و محدود است و می‌تواند بدون بحث جمعی با دستور مستقیم پیگیری شود.' : 'موضوع اثر سازمانی دارد و طرح آن در جلسه برای تصمیم جمعی مناسب است.',
        questions: ['برآورد زمان و منابع لازم برای اجرا چیست؟', 'شاخص موفقیت این اقدام چگونه سنجیده می‌شود؟', 'کدام واحدها باید در اجرا همکاری کنند؟'],
        similar,
        completeness,
      };
    },
  });
};

// ——————————————————— 4) برنامه‌ریز دستورکار ———————————————————

export interface AgendaPlanItem { id: string; minutes: number; reason: string }
export interface AgendaPlan { order: AgendaPlanItem[]; tips: string[]; suggestedTitle?: string }

const toMinutes = (time: string) => {
  const western = time.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const [h, m] = western.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const planAgenda = (input: { meetingTitle: string; startTime: string; endTime: string; agendas: AgendaItem[] }, actorId?: string): Promise<AiResult<AgendaPlan>> => {
  const total = Math.max(15, toMinutes(input.endTime) - toMinutes(input.startTime));
  const localPlan = (): AgendaPlan => {
    const weight = (a: AgendaItem) => {
      const text = `${a.title} ${a.description || ''}`;
      let w = 1 + Math.min(2, text.length / 120);
      if (/(بودجه|راهبرد|قرارداد|سیاست|بحران|امنیت)/.test(text)) w += 1;
      if (/(گزارش|اطلاع|معرفی)/.test(text)) w -= 0.4;
      return Math.max(0.6, w);
    };
    const rank = (a: AgendaItem) => (PRIORITY_KEYWORDS.findIndex((k) => k.match.test(a.title)) + 4) % 4;
    const items = [...input.agendas].sort((a, b) => rank(a) - rank(b));
    const reserve = Math.min(10, Math.round(total * 0.1));
    const sum = items.reduce((s, a) => s + weight(a), 0) || 1;
    const order = items.map((a) => ({ id: a.id, minutes: Math.max(5, Math.round(((total - reserve) * weight(a)) / sum / 5) * 5), reason: rank(a) === 0 ? 'فوریت بالا — ابتدای جلسه' : /(گزارش|اطلاع)/.test(a.title) ? 'موضوع اطلاع‌رسانی — زمان کوتاه' : 'زمان متناسب با پیچیدگی موضوع' }));
    return {
      order,
      tips: [
        `${fa(reserve)} دقیقه پایانی برای جمع‌بندی و قرائت مصوبات رزرو شد.`,
        items.length > 6 ? 'تعداد بندها زیاد است؛ بندهای اطلاع‌رسانی را به‌صورت مکتوب ارسال کنید.' : 'تعداد بندها با مدت جلسه متناسب است.',
        'برای هر بند، مستندات را حداقل ۴۸ ساعت قبل برای اعضا ارسال کنید.',
      ],
    };
  };
  return runAi({
    feature: 'meetingPlanner',
    actorId,
    json: true,
    system: `وظیفه: برنامه‌ریزی دستورکار یک جلسه سازمانی در مجموع ${total} دقیقه. خروجی فقط JSON: order (آرایه به ترتیب پیشنهادی، هر عضو {id, minutes, reason} — minutes مضرب ۵، مجموع حداکثر ${total - 5}؛ reason یک عبارت کوتاه فارسی)، tips (آرایه ۲ تا ۳ توصیه کوتاه برای اثربخشی جلسه). موضوعات فوری و تصمیم‌محور را مقدم کن و برای جمع‌بندی زمان بگذار. همه id ها باید دقیقاً از ورودی باشند.`,
    messages: [{ role: 'user', content: `عنوان جلسه: ${input.meetingTitle}\nبندها:\n${input.agendas.map((a) => `- id=${a.id} | ${a.title}${a.description ? ` | ${a.description.slice(0, 160)}` : ''}`).join('\n')}` }],
    parse: (text) => {
      const d = extractJson<AgendaPlan>(text);
      const ids = new Set(input.agendas.map((a) => a.id));
      const order = (d.order || []).filter((o) => ids.has(o.id)).map((o) => ({ id: o.id, minutes: Math.max(5, Math.round(Number(o.minutes) / 5) * 5 || 10), reason: String(o.reason || '') }));
      input.agendas.forEach((a) => { if (!order.some((o) => o.id === a.id)) order.push({ id: a.id, minutes: 10, reason: '' }); });
      if (!order.length) throw new Error('برنامه خالی');
      return { order, tips: (d.tips || []).slice(0, 3) };
    },
    fallback: localPlan,
  });
};

// ——————————————————— 5) پیش‌نویس صورت‌جلسه ———————————————————

const OUTCOME_LABEL: Record<string, string> = {
  APPROVED: 'تصویب شد', NOT_APPROVED: 'تصویب نشد', NEEDS_REVISION: 'نیازمند اصلاح', NEEDS_MORE_REVIEW: 'نیازمند بررسی بیشتر',
  DEFERRED: 'به جلسه بعد موکول شد', REFERRED: 'ارجاع شد', CONDITIONAL: 'به‌صورت مشروط تصویب شد', CLOSED: 'مختومه شد',
};

export const draftMinutes = (meeting: Meeting, resolutions: Resolution[], actorId?: string): Promise<AiResult<string>> => {
  const agendas = meeting.agendaItems.filter((a) => !a.isRemoved);
  const facts = agendas.map((a, i) => {
    const res = resolutions.find((r) => r.agendaItemId === a.id);
    return `${i + 1}. ${a.title} | ارائه: ${a.presenterName || a.presenter || '—'} | نتیجه: ${a.outcomeStatus ? OUTCOME_LABEL[a.outcomeStatus] : 'ثبت نشده'}${a.outcomeNotes ? ` | توضیح: ${a.outcomeNotes}` : ''}${res ? ` | مصوبه ${res.resolutionNumber}: ${res.executionDescription || res.requestDescription} | مسئول: ${res.mainResponsibleName || '—'} | مهلت: ${res.deadlineJalali || '—'}` : ''}`;
  }).join('\n');
  const members = meeting.members.map((m) => `${m.fullName} (${m.roleTitle})`).join('، ');
  return runAi({
    feature: 'minutes',
    actorId,
    maxTokens: 1800,
    system: 'وظیفه: نگارش متن رسمی «صورت‌جلسه» به فارسی اداری. ساختار: مقدمه (عنوان، شماره، تاریخ، ساعت، مکان)، حاضران، شرح بندها به ترتیب با نتیجه هر بند، فهرست مصوبات با مسئول و مهلت، و جمع‌بندی پایانی. فقط بر اساس داده‌های داده‌شده؛ چیزی اضافه نکن. بدون Markdown و بدون علامت ستاره؛ از شماره‌گذاری فارسی استفاده کن.',
    messages: [{ role: 'user', content: `جلسه: ${meeting.title}\nشماره: ${meeting.meetingNumber}\nتاریخ: ${meeting.dateJalali} از ${meeting.startTime} تا ${meeting.endTime}\nمکان: ${meeting.location}\nدبیر: ${meeting.secretaryName}\nحاضران: ${members}\nبندها:\n${facts}` }],
    parse: (text) => text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim(),
    fallback: () => {
      const lines = [
        `صورت‌جلسه ${meeting.title}`,
        `شماره ${meeting.meetingNumber} — تاریخ ${meeting.dateJalali}، ساعت ${meeting.startTime} تا ${meeting.endTime} — محل: ${meeting.location}`,
        '',
        `حاضران: ${members || '—'}`,
        '',
        'شرح مذاکرات و نتایج:',
        ...agendas.map((a, i) => {
          const res = resolutions.find((r) => r.agendaItemId === a.id);
          return `${fa(i + 1)}. ${a.title}${a.presenterName ? ` (ارائه: ${a.presenterName})` : ''} — ${a.outcomeStatus ? OUTCOME_LABEL[a.outcomeStatus] : 'نتیجه ثبت نشده'}.${a.outcomeNotes ? ` ${sentence(a.outcomeNotes)}` : ''}${res ? ` مصوبه ${res.resolutionNumber}: ${sentence(res.executionDescription || res.requestDescription)} مسئول اجرا: ${res.mainResponsibleName || '—'}؛ مهلت: ${res.deadlineJalali || '—'}.` : ''}`;
        }),
        '',
        `جلسه در ساعت ${meeting.endTime} با جمع‌بندی دبیر جلسه (${meeting.secretaryName}) پایان یافت. مصوبات پس از تکمیل امضاها و ابلاغ رسمی، جهت اجرا به مسئولان مربوط ارسال خواهد شد.`,
      ];
      return lines.join('\n');
    },
  });
};

// ——————————————————— 6) دستیار ثبت مصوبه ———————————————————

export interface ResolutionSuggestion {
  executionDescription: string;
  mainResponsibleUserId?: string;
  responsibleDepartmentId?: string;
  priority: PriorityLevel;
  deadlineDays: number;
  rationale: string;
}

export const suggestResolution = (input: { topic: string; request: string; reviewNotes?: string; presenterName?: string; users: User[]; departments: Department[] }, actorId?: string): Promise<AiResult<ResolutionSuggestion>> => {
  const active = input.users.filter((u) => u.isActive !== false);
  const local = (): ResolutionSuggestion => {
    const text = `${input.topic} ${input.request} ${input.reviewNotes || ''}`;
    const hint = DEPARTMENT_KEYWORDS.find((k) => k.match.test(text))?.departmentHint;
    const department = (hint && input.departments.find((d) => d.name.includes(hint))) || undefined;
    const presenter = active.find((u) => input.presenterName && u.fullName === input.presenterName);
    const deptUser = department ? active.find((u) => u.departmentId === department.id && u.role === 'DEPT_MANAGER') || active.find((u) => u.departmentId === department.id) : undefined;
    const responsible = presenter || deptUser;
    const priority = PRIORITY_KEYWORDS.find((k) => k.match.test(text))?.priority || 'MEDIUM';
    return {
      executionDescription: `${sentence(formalizeLocally(input.request || input.topic))} مقرر شد ${responsible ? responsible.title : 'واحد مسئول'} نسبت به اجرای کامل این مصوبه اقدام و گزارش پیشرفت را به‌صورت دوره‌ای به دبیرخانه ارائه نماید.`,
      mainResponsibleUserId: responsible?.id,
      responsibleDepartmentId: department?.id || responsible?.departmentId,
      priority,
      deadlineDays: PRIORITY_DAYS[priority],
      rationale: `${department ? `بر اساس موضوع، حوزه «${department.name}» تشخیص داده شد` : 'حوزه مسئول از متن قابل تشخیص قطعی نبود'}؛ اولویت ${priority === 'CRITICAL' ? 'بحرانی' : priority === 'HIGH' ? 'بالا' : 'متوسط'} و مهلت ${fa(PRIORITY_DAYS[priority])} روزه پیشنهاد شد.`,
    };
  };
  return runAi({
    feature: 'resolutionDraft',
    actorId,
    json: true,
    system: 'وظیفه: پیشنهاد جزئیات اجرایی یک مصوبه جلسه. خروجی فقط JSON: executionDescription (متن رسمی و قابل اجرای مصوبه، ۲ تا ۳ جمله با فعل «مقرر شد»)، mainResponsibleUserId (دقیقاً یکی از id های کاربران داده‌شده یا null)، responsibleDepartmentId (یکی از id های واحدها یا null)، priority (LOW|MEDIUM|HIGH|URGENT|CRITICAL)، deadlineDays (عدد روز تا مهلت، واقع‌بینانه)، rationale (یک جمله دلیل انتخاب‌ها).',
    messages: [{ role: 'user', content: `موضوع: ${input.topic}\nشرح درخواست: ${input.request}\nنتیجه بررسی در جلسه: ${input.reviewNotes || '—'}\nارائه‌دهنده: ${input.presenterName || '—'}\nکاربران:\n${active.map(userBrief).join('\n')}\nواحدها:\n${input.departments.map((d) => `${d.id}: ${d.name}`).join('\n')}` }],
    parse: (text) => {
      const d = extractJson<Partial<ResolutionSuggestion>>(text);
      const priority = (['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'] as const).includes(d.priority as PriorityLevel) ? d.priority as PriorityLevel : 'MEDIUM';
      return {
        executionDescription: String(d.executionDescription || '').trim() || local().executionDescription,
        mainResponsibleUserId: active.some((u) => u.id === d.mainResponsibleUserId) ? d.mainResponsibleUserId : undefined,
        responsibleDepartmentId: input.departments.some((dep) => dep.id === d.responsibleDepartmentId) ? d.responsibleDepartmentId : undefined,
        priority,
        deadlineDays: Math.min(365, Math.max(3, Number(d.deadlineDays) || PRIORITY_DAYS[priority])),
        rationale: String(d.rationale || ''),
      };
    },
    fallback: local,
  });
};

// ——————————————————— 7) ریسک تأخیر مصوبه ———————————————————

export interface RiskAnalysis {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: string[];
  summary: string;
  recommendation: string;
}

/** امتیاز ریسک قطعی و قابل توضیح؛ AI فقط روایت و توصیه را غنی می‌کند. */
export const computeResolutionRisk = (resolution: Resolution, task?: Task): { score: number; factors: string[] } => {
  const factors: string[] = [];
  let score = 10;
  const left = daysUntil(resolution.deadlineJalali);
  const progress = resolution.progressPercent ?? task?.progressPercent ?? 0;
  if (['APPROVED_CLOSED', 'ARCHIVED'].includes(resolution.executionStatus)) return { score: 0, factors: ['مصوبه خاتمه یافته است'] };
  if (resolution.executionStatus === 'OVERDUE' || (left !== null && left < 0)) { score += 45; factors.push(`مهلت ${left !== null ? fa(Math.abs(left)) + ' روز' : ''} گذشته است`); }
  else if (left !== null && left <= 7) { score += 25; factors.push(`فقط ${fa(left)} روز تا مهلت باقی است`); }
  if (left !== null && left >= 0 && resolution.assignedDateJalali) {
    const totalSpan = (daysUntil(resolution.assignedDateJalali) ?? 0) * -1 + left;
    const elapsedRatio = totalSpan > 0 ? 1 - left / totalSpan : 0;
    if (elapsedRatio - progress / 100 > 0.3) { score += 20; factors.push(`${fa(Math.round(elapsedRatio * 100))}٪ زمان سپری شده اما پیشرفت ${fa(progress)}٪ است`); }
  }
  if (resolution.obstacles) { score += 12; factors.push('مانع اجرایی گزارش شده است'); }
  if (['NEEDS_FOLLOW_UP', 'WAITING_RESPONSE', 'REJECTED_RETURNED'].includes(resolution.executionStatus)) { score += 12; factors.push(`وضعیت «${getResolutionExecutionMeta(resolution.executionStatus).label}»`); }
  if (!resolution.progressReports?.length && ['IN_PROGRESS', 'NOTIFIED'].includes(resolution.executionStatus)) { score += 8; factors.push('هنوز گزارش پیشرفتی ثبت نشده است'); }
  if (['HIGH', 'URGENT', 'CRITICAL'].includes(resolution.priority)) { score += 5; factors.push('اولویت بالا'); }
  if (resolution.signatureWorkflow && resolution.signatureWorkflow.status !== 'COMPLETED') { score += 6; factors.push('هنوز در گردش امضا است'); }
  if (!factors.length) factors.push('روند اجرا مطابق برنامه است');
  return { score: Math.min(100, score), factors };
};

export const analyzeResolutionRisk = (resolution: Resolution, task: Task | undefined, actorId?: string): Promise<AiResult<RiskAnalysis>> => {
  const base = computeResolutionRisk(resolution, task);
  const level: RiskAnalysis['level'] = base.score >= 60 ? 'HIGH' : base.score >= 30 ? 'MEDIUM' : 'LOW';
  return runAi({
    feature: 'riskInsight',
    actorId,
    json: true,
    system: 'وظیفه: تحلیل وضعیت اجرای یک مصوبه سازمانی. امتیاز ریسک توسط سامانه محاسبه شده و نباید تغییر کند. خروجی فقط JSON: summary (۲ جمله خلاصه وضعیت برای مدیر)، recommendation (یک تا دو اقدام مشخص و عملی بعدی).',
    messages: [{ role: 'user', content: `مصوبه ${resolution.resolutionNumber}: ${resolution.topicTitle}\nمتن: ${resolution.executionDescription || resolution.requestDescription}\nوضعیت: ${getResolutionExecutionMeta(resolution.executionStatus).label}\nمسئول: ${resolution.mainResponsibleName || '—'}\nمهلت: ${resolution.deadlineJalali || '—'}\nپیشرفت: ${resolution.progressPercent ?? 0}٪\nآخرین اقدام: ${resolution.lastAction || '—'}\nموانع: ${resolution.obstacles || '—'}\nامتیاز ریسک: ${base.score}/100\nعوامل: ${base.factors.join('؛ ')}` }],
    parse: (text) => {
      const d = extractJson<Partial<RiskAnalysis>>(text);
      return { score: base.score, level, factors: base.factors, summary: d.summary || '', recommendation: d.recommendation || '' };
    },
    fallback: () => ({
      score: base.score,
      level,
      factors: base.factors,
      summary: `مصوبه «${resolution.topicTitle}» در وضعیت «${getResolutionExecutionMeta(resolution.executionStatus).label}» با پیشرفت ${fa(resolution.progressPercent ?? 0)}٪ است. سطح ریسک تأخیر ${level === 'HIGH' ? 'بالا' : level === 'MEDIUM' ? 'متوسط' : 'پایین'} ارزیابی می‌شود.`,
      recommendation: level === 'HIGH'
        ? `جلسه کوتاه پیگیری با ${resolution.mainResponsibleName || 'مسئول اجرا'} برگزار و برنامه جبرانی با مهلت جدید ثبت شود.`
        : level === 'MEDIUM' ? 'درخواست گزارش پیشرفت به‌روز از مسئول اجرا و بررسی موانع در پیگیری بعدی.' : 'ادامه پایش دوره‌ای طبق برنامه پیگیری کافی است.',
    }),
  });
};

// ——————————————————— 8) گزارش پیشرفت / پیگیری ———————————————————

export const draftProgressReport = (notes: string, resolution: Pick<Resolution, 'topicTitle' | 'resolutionNumber' | 'deadlineJalali'>, progress: number, actorId?: string): Promise<AiResult<string>> => runAi({
  feature: 'writer',
  actorId,
  system: 'وظیفه: تبدیل یادداشت‌های کوتاه مجری به «گزارش پیشرفت» رسمی ۳ تا ۴ جمله‌ای: اقدامات انجام‌شده، وضعیت فعلی، اقدام بعدی. فقط متن گزارش را برگردان.',
  messages: [{ role: 'user', content: `مصوبه ${resolution.resolutionNumber}: ${resolution.topicTitle}\nمهلت: ${resolution.deadlineJalali || '—'}\nدرصد پیشرفت: ${progress}\nیادداشت‌ها: ${notes}` }],
  parse: (t) => t.trim(),
  fallback: () => {
    const items = notes.split(/[\n،,؛]+/).map((s) => s.trim()).filter(Boolean);
    return `در راستای اجرای مصوبه «${resolution.topicTitle}»، اقدامات زیر انجام شد: ${items.map(formalizeLocally).map((s) => s.replace(/\.$/, '')).join('؛ ') || '—'}. پیشرفت فعلی ${fa(progress)} درصد برآورد می‌شود. اقدامات باقی‌مانده طبق برنامه تا مهلت ${resolution.deadlineJalali || 'تعیین‌شده'} پیگیری خواهد شد.`;
  },
});

export const draftFollowUp = (resolution: Resolution, previousTexts: string[], actorId?: string): Promise<AiResult<string>> => runAi({
  feature: 'writer',
  actorId,
  system: 'وظیفه: نوشتن متن «ثبت پیگیری» یک مصوبه توسط دفتر مدیرعامل؛ ۲ تا ۳ جمله رسمی شامل وضعیت فعلی، نکته مهم و درخواست مشخص از مسئول اجرا. فقط متن را برگردان.',
  messages: [{ role: 'user', content: `مصوبه ${resolution.resolutionNumber}: ${resolution.topicTitle}\nوضعیت: ${getResolutionExecutionMeta(resolution.executionStatus).label}\nمسئول: ${resolution.mainResponsibleName || '—'}\nپیشرفت: ${resolution.progressPercent ?? 0}٪\nمهلت: ${resolution.deadlineJalali || '—'}\nآخرین اقدام: ${resolution.lastAction || '—'}\nموانع: ${resolution.obstacles || '—'}\nپیگیری‌های قبلی: ${previousTexts.slice(0, 3).join(' | ') || 'ندارد'}` }],
  parse: (t) => t.trim(),
  fallback: () => {
    const risk = computeResolutionRisk(resolution);
    return `وضعیت مصوبه «${resolution.topicTitle}» در تاریخ ${todayJalali()} بررسی شد؛ پیشرفت ${fa(resolution.progressPercent ?? 0)}٪ و وضعیت «${getResolutionExecutionMeta(resolution.executionStatus).label}» است. ${risk.factors[0] ? sentence(risk.factors[0]) : ''} از ${resolution.mainResponsibleName || 'مسئول اجرا'} درخواست می‌شود گزارش اقدامات و برنامه تکمیل را تا پیگیری بعدی ارائه نماید.`;
  },
});

// ——————————————————— 9) خلاصه روزانه داشبورد ———————————————————

export interface DailyBrief { headline: string; bullets: string[]; focus: string }

export const dashboardBrief = (user: User, model: DashboardModel, actorId?: string): Promise<AiResult<DailyBrief>> => {
  const facts = [
    `امروز: ${model.today}`,
    `اقدام‌های در انتظار من: ${model.actionItems.length} (${model.actionItems.slice(0, 6).map((a) => `${a.kind}: ${a.title}`).join('؛ ')})`,
    `جلسات پیش‌رو: ${model.upcomingMeetings.slice(0, 4).map((m) => `${m.title} (${m.dateJalali} ${m.startTime})`).join('؛ ') || 'ندارد'}`,
    `مصوبات معوق: ${model.counts.overdue} (${model.overdue.slice(0, 3).map((r) => r.topicTitle).join('؛ ')})`,
    `در گردش امضا: ${model.counts.awaitingSignature}، در انتظار ابلاغ: ${model.counts.awaitingNotice}، در انتظار صحه‌گذاری: ${model.counts.pendingVerification}، در حال اجرا: ${model.counts.activeResolutions}`,
    `وظایف من: ${model.myTasks.length} (${model.myTasks.filter((t) => (t.daysLeft ?? 99) <= 7).length} نزدیک به مهلت)`,
  ].join('\n');
  return runAi({
    feature: 'dashboardBrief',
    actorId,
    json: true,
    system: 'وظیفه: «خلاصه هوشمند امروز» برای داشبورد یک کاربر سامانه. خروجی فقط JSON: headline (یک جمله گرم و حرفه‌ای با اشاره به مهم‌ترین موضوع امروز)، bullets (۳ مورد کوتاه و عملی)، focus (یک جمله: اولین کاری که باید همین الان انجام دهد). فقط از داده‌های داده‌شده استفاده کن.',
    messages: [{ role: 'user', content: `کاربر: ${user.fullName} — ${user.title}\n${facts}` }],
    parse: (text) => {
      const d = extractJson<DailyBrief>(text);
      if (!d.headline) throw new Error('خروجی ناقص');
      return { headline: d.headline, bullets: (d.bullets || []).slice(0, 3), focus: d.focus || '' };
    },
    fallback: () => {
      const urgent = model.actionItems[0];
      const bullets: string[] = [];
      if (model.actionItems.length) bullets.push(`${fa(model.actionItems.length)} اقدام در کارتابل شما منتظر است؛ مهم‌ترین: ${urgent.kind} «${urgent.title}».`);
      if (model.upcomingMeetings[0]) bullets.push(`جلسه بعدی: «${model.upcomingMeetings[0].title}» در ${model.upcomingMeetings[0].dateJalali} ساعت ${model.upcomingMeetings[0].startTime}.`);
      if (model.counts.overdue) bullets.push(`${fa(model.counts.overdue)} مصوبه از مهلت عقب افتاده است و نیاز به پیگیری دارد.`);
      if (model.counts.awaitingSignature) bullets.push(`${fa(model.counts.awaitingSignature)} مصوبه در گردش امضا است.`);
      if (!bullets.length) bullets.push('کارتابل شما خالی است و مورد فوری وجود ندارد.');
      return {
        headline: model.actionItems.length ? `${user.fullName.split(' ').slice(-1)[0]} عزیز، امروز ${fa(model.actionItems.length)} مورد نیازمند اقدام شماست.` : 'امروز مورد فوری در کارتابل شما نیست؛ زمان خوبی برای پایش روندهاست.',
        bullets: bullets.slice(0, 3),
        focus: urgent ? `ابتدا «${urgent.title}» را ${urgent.cta} کنید.` : 'مرور مصوبات در حال اجرا و برنامه جلسات پیش‌رو.',
      };
    },
  });
};

// ——————————————————— 10) گزارش مدیریتی روایی ———————————————————

export const reportNarrative = (stats: Record<string, string | number>, actorId?: string): Promise<AiResult<string>> => runAi({
  feature: 'reportNarrative',
  actorId,
  maxTokens: 1400,
  system: 'وظیفه: نوشتن «گزارش تحلیلی مدیریتی» از آمار سامانه مصوبات برای هیئت مدیره. ساختار: خلاصه اجرایی (۲ جمله)، نقاط قوت، گلوگاه‌ها و ریسک‌ها، توصیه‌های اقدام (۳ مورد). بدون Markdown، با تیترهای ساده فارسی و اعداد دقیق داده‌شده.',
  messages: [{ role: 'user', content: Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join('\n') }],
  parse: (t) => t.replace(/تصیه/g, 'توصیه').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim(),
  fallback: () => {
    const get = (k: string) => Number(stats[k] ?? 0);
    const total = get('کل مصوبات'); const closed = get('مصوبات خاتمه‌یافته'); const overdue = get('مصوبات معوق');
    const rate = total ? Math.round((closed / total) * 100) : 0;
    return [
      'خلاصه اجرایی',
      `از مجموع ${fa(total)} مصوبه، ${fa(closed)} مورد (${fa(rate)}٪) خاتمه یافته و ${fa(overdue)} مورد از مهلت عقب است.`,
      '',
      'نقاط قوت',
      rate >= 50 ? `نرخ خاتمه ${fa(rate)}٪ نشان‌دهنده اجرای مناسب مصوبات است.` : 'ساختار گردش امضا و ابلاغ به‌طور کامل در سامانه ثبت و قابل ردیابی است.',
      '',
      'گلوگاه‌ها و ریسک‌ها',
      overdue ? `${fa(overdue)} مصوبه معوق نیازمند تصمیم مدیریتی برای تمدید مهلت یا تخصیص منابع است.` : 'گلوگاه جدی در اجرای مصوبات مشاهده نشد.',
      get('در گردش امضا') ? `${fa(get('در گردش امضا'))} مصوبه در گردش امضا متوقف مانده است.` : '',
      '',
      'توصیه‌ها',
      '۱. پیگیری هفتگی مصوبات معوق در جلسه شورای مدیران.',
      '۲. تعیین جانشین امضا برای جلوگیری از توقف گردش امضا.',
      '۳. الزام ثبت گزارش پیشرفت دوره‌ای توسط مسئولان اجرا.',
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n');
  },
});

// ——————————————————— 11) دستیار گفت‌وگو ———————————————————

export const assistantAnswer = (question: string, history: { role: 'user' | 'assistant'; content: string }[], context: string, ruleBasedAnswer: string, actorId?: string): Promise<AiResult<string>> => runAi({
  feature: 'assistant',
  actorId,
  maxTokens: 900,
  system: `وظیفه: پاسخ به پرسش کاربر درباره داده‌های سامانه جلسات و مصوبات. فقط از «داده‌های سامانه» زیر استفاده کن؛ اگر پاسخ در داده نیست بگو. اگر نام واحد، شخص یا موضوعی که کاربر گفته در داده‌ها وجود ندارد، صریحاً بگو وجود ندارد و هرگز مورد نامرتبطی را به‌عنوان نتیجه معرفی نکن. نام کوتاه یا ناقص یک واحد (مثلاً «امور مالی» برای «اداره کل امور مالی و ذی‌حسابی») همان واحد است؛ اگر جستجوی ساخت‌یافته نتیجه‌ای برگردانده، هرگز نگو آن واحد یا مورد وجود ندارد. نتیجه جستجوی ساخت‌یافته زیر مرجع اصلی است؛ تعداد و فهرست آن را تغییر نده. پاسخ کوتاه (حداکثر ۶ جمله یا فهرست کوتاه)، دقیق و کاربردی بده و در صورت امکان اقدام بعدی را پیشنهاد کن. بدون Markdown سنگین.\n\nداده‌های سامانه (Scope همین کاربر):\n${context}\n\nنتیجه جستجوی ساخت‌یافته سامانه برای این پرسش:\n${ruleBasedAnswer}`,
  messages: [...history.slice(-6), { role: 'user', content: question }],
  parse: (t) => t.replace(/\*\*/g, '').trim(),
  fallback: () => ruleBasedAnswer,
});

/** خلاصه فشرده داده‌های Scope‌شده کاربر برای دستیار (بدون اطلاعات تماس). */
export const buildAssistantContext = (model: DashboardModel): string => [
  `امروز: ${model.today}`,
  `شمارنده‌ها: جلسات این ماه ${model.counts.meetingsThisMonth}، مصوبات فعال ${model.counts.activeResolutions}، در گردش امضا ${model.counts.awaitingSignature}، در انتظار ابلاغ ${model.counts.awaitingNotice}، در انتظار صحه‌گذاری ${model.counts.pendingVerification}، معوق ${model.counts.overdue}`,
  `کارتابل من: ${model.actionItems.slice(0, 10).map((a) => `${a.kind} — ${a.title} (${a.subtitle})`).join(' | ') || 'خالی'}`,
  `جلسات پیش‌رو: ${model.upcomingMeetings.slice(0, 6).map((m) => `${m.meetingNumber} ${m.title} ${m.dateJalali} ${m.startTime} وضعیت ${getMeetingStatusMeta(m.status).label}`).join(' | ') || 'ندارد'}`,
  `مصوبات معوق: ${model.overdue.slice(0, 6).map((r) => `${r.resolutionNumber} ${r.topicTitle} مسئول ${r.mainResponsibleName || '—'} مهلت ${r.deadlineJalali || '—'}`).join(' | ') || 'ندارد'}`,
  `در حال اجرا: ${model.inExecution.slice(0, 8).map((r) => `${r.resolutionNumber} ${r.topicTitle} ${r.progressPercent ?? 0}٪`).join(' | ') || 'ندارد'}`,
  `وظایف من: ${model.myTasks.slice(0, 6).map((t) => `${t.resolutionTitle} مهلت ${t.deadlineJalali}`).join(' | ') || 'ندارد'}`,
].join('\n');

// ——————————————————— 12) فرمان سریع با زبان طبیعی ———————————————————

export interface CommandOption { id: string; title: string; keywords: string }
export interface CommandIntent { commandId: string | null; reply: string }

/** امتیاز تطبیق محلی یک فرمان با جمله کاربر. */
export const scoreCommand = (query: string, command: CommandOption): number => {
  const q = normalize(query);
  if (!q) return 0;
  const haystack = normalize(`${command.title} ${command.keywords}`);
  if (haystack.includes(q)) return 1;
  const qt = tokens(q);
  const ht = tokens(haystack);
  let hit = 0; qt.forEach((t) => { if ([...ht].some((h) => h.startsWith(t) || t.startsWith(h))) hit += 1; });
  return qt.size ? hit / qt.size : 0;
};

export const interpretCommand = (query: string, commands: CommandOption[], actorId?: string): Promise<AiResult<CommandIntent>> => runAi({
  feature: 'command',
  actorId,
  json: true,
  maxTokens: 200,
  system: 'وظیفه: تشخیص فرمان کاربر در سامانه جلسات و مصوبات. از فهرست فرمان‌های مجاز، بهترین گزینه را انتخاب کن. خروجی فقط JSON: commandId (دقیقاً یکی از شناسه‌ها؛ اگر جمله پرسش یا جستجوی اطلاعاتی است یا فیلتری مثل نام واحد، شخص، وضعیت یا تاریخ دارد، حتماً null بگذار تا دستیار با داده واقعی پاسخ دهد) و reply (یک جمله کوتاه فارسی که توضیح می‌دهد چه کاری انجام می‌شود).',
  messages: [{ role: 'user', content: `فرمان‌های مجاز:\n${commands.map((c) => `${c.id}: ${c.title}`).join('\n')}\n\nجمله کاربر: ${query}` }],
  parse: (text) => {
    const d = extractJson<Partial<CommandIntent>>(text);
    const id = commands.some((c) => c.id === d.commandId) ? d.commandId! : null;
    return { commandId: id, reply: d.reply || '' };
  },
  fallback: () => {
    const best = commands.map((c) => ({ c, score: scoreCommand(query, c) })).sort((a, b) => b.score - a.score)[0];
    // فقط تطبیق کامل اجرا می‌شود؛ جمله‌ای که فیلتر اضافه دارد (مثل نام واحد)
    // به دستیار سپرده می‌شود تا با داده واقعی پاسخ دهد، نه فهرست فیلترنشده.
    return best && best.score >= 1
      ? { commandId: best.c.id, reply: `اجرای «${best.c.title}»` }
      : { commandId: null, reply: 'این پرسش را از دستیار هوشمند می‌پرسم.' };
  },
});
