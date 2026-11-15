/**
 * لایه فراخوانی سرویس کمکی در مرورگر. همه درخواست‌ها از درگاه سرور (/api/assist/run)
 * عبور می‌کنند؛ مرورگر نه نوع سرویس را می‌داند و نه کلیدی دارد. اگر سرویس در دسترس نباشد،
 * همان قابلیت با تحلیل قاعده‌محور خود سامانه انجام می‌شود.
 */
import { AiFeatureId, isAiFeatureEnabled } from './aiSettings';

export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface AiResult<T> {
  data: T;
  /** فقط برای منطق داخلی (مثلاً Cache)؛ در رابط کاربری نمایش داده نمی‌شود. */
  source: 'AI' | 'LOCAL';
  latencyMs?: number;
}

export interface AiCallOptions<T> {
  feature: AiFeatureId;
  system: string;
  messages: AiMessage[];
  json?: boolean;
  maxTokens?: number;
  actorId?: string;
  parse: (text: string) => T;
  fallback: () => T;
}

export class AiUnavailableError extends Error {}

const SYSTEM_PREAMBLE = 'شما «دستیار سامانه مدیریت جلسات و مصوبات سازمانی» هستید. همیشه به فارسی رسمی، دقیق، مختصر و حرفه‌ای پاسخ دهید. هرگز داده‌ای را که در متن داده نشده جعل نکنید؛ اگر اطلاعات کافی نیست صریحاً بگویید. هرگز درباره اینکه چه مدل یا سرویسی هستید یا توسط چه شرکتی ساخته شده‌اید صحبت نکنید.';

/** استخراج JSON از پاسخ (حذف ```json و متن اضافه). */
export const extractJson = <T,>(text: string): T => {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }
  const start = cleaned.search(/[\[{]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
  throw new Error('پاسخ JSON معتبر نیست');
};

export const callAiRaw = async (options: { system: string; messages: AiMessage[]; json?: boolean; maxTokens?: number }) => {
  const response = await fetch('/api/assist/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: `${SYSTEM_PREAMBLE}\n\n${options.system}` }, ...options.messages],
      temperature: 0.4,
      maxTokens: options.maxTokens || 1200,
      json: options.json,
    }),
  });
  const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !data.ok) throw new AiUnavailableError(data.error || `HTTP ${response.status}`);
  return { text: String(data.text), latencyMs: Number(data.latencyMs || 0) };
};

// در دسترس بودن سرویس یک بار در هر بارگذاری خوانده می‌شود.
let availabilityPromise: Promise<boolean> | null = null;
export const isAssistAvailable = (): Promise<boolean> => (availabilityPromise ||= fetch('/api/assist/status')
  .then((r) => r.json())
  .then((d) => d?.available !== false)
  .catch(() => true)); // وضعیت نامعلوم: تلاش کن و در صورت خطا به تحلیل داخلی برگرد.

/** قابلیت‌هایی که خروجی‌شان متن روایی برای خواندن انسان است (نه شناسه، تاریخ فرم یا عدد قابل محاسبه). */
const PROSE_FEATURES = new Set<AiFeatureId>(['dashboardBrief', 'reportNarrative', 'assistant', 'minutes', 'riskInsight', 'writer', 'meetingRecorder', 'documentReader', 'proposalReview']);
/** غلط‌های املایی پرتکرار مدل‌ها در فارسی. */
const COMMON_TYPOS: [RegExp, string][] = [[/تصیه/g, 'توصیه'], [/هنور/g, 'هنوز'], [/بنابر این/g, 'بنابراین'], [/می باشد/g, 'می‌باشد']];
const SKIP_KEYS = /(^id$|Id$|^ids$|Ids$|^key$|^route$|^url$)/;
const polishString = (text: string) => COMMON_TYPOS.reduce((acc, [re, to]) => acc.replace(re, to), text).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const polishDeep = (value: unknown, key = ''): unknown => {
  if (SKIP_KEYS.test(key)) return value;
  if (typeof value === 'string') return polishString(value);
  if (Array.isArray(value)) return value.map((item) => polishDeep(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, polishDeep(v, k)]));
  return value;
};
/** رقم فارسی و اصلاح غلط‌های رایج فقط برای خروجی‌های روایی؛ شناسه‌ها دست‌نخورده می‌مانند. */
export const polishProse = <T,>(feature: AiFeatureId, data: T): T => (PROSE_FEATURES.has(feature) ? polishDeep(data) as T : data);

export const runAi = async <T,>(options: AiCallOptions<T>): Promise<AiResult<T>> => {
  const local = (): AiResult<T> => ({ data: options.fallback(), source: 'LOCAL' });
  if (!isAiFeatureEnabled(options.feature)) return local();
  if (!(await isAssistAvailable())) return local();
  try {
    const raw = await callAiRaw(options);
    const data = polishProse(options.feature, options.parse(raw.text));
    return { data, source: 'AI', latencyMs: raw.latencyMs };
  } catch {
    // سرویس در دسترس نبود یا پاسخ قابل استفاده نبود: تحلیل داخلی سامانه.
    return local();
  }
};
