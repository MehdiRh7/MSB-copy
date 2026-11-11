/**
 * لایه فراخوانی هوش مصنوعی در مرورگر. همه درخواست‌ها از پراکسی سمت سرور
 * (/api/ai/chat) عبور می‌کنند. اگر سرویس در دسترس نباشد و «موتور محلی»
 * فعال باشد، پاسخ از تحلیل قاعده‌محور خود سامانه می‌آید و صریحاً با برچسب
 * «موتور محلی» نمایش داده می‌شود — هیچ پاسخی به‌دروغ به AI نسبت داده نمی‌شود.
 */
import { AiFeatureId, AiProviderId, getAiSettings, isAiFeatureEnabled, logAiUsage } from './aiSettings';

export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface AiResult<T> {
  data: T;
  source: 'AI' | 'LOCAL';
  provider?: AiProviderId;
  model?: string;
  latencyMs?: number;
  /** توضیح برای کاربر وقتی پاسخ از موتور محلی آمده است. */
  notice?: string;
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
  /** برای تست اتصال: ارائه‌دهنده/مدل غیر از تنظیم فعال. */
  override?: { provider: AiProviderId };
}

export class AiUnavailableError extends Error {}

const SYSTEM_PREAMBLE = 'شما «دستیار هوشمند سامانه مدیریت جلسات و مصوبات سازمانی» هستید. همیشه به فارسی رسمی، دقیق، مختصر و حرفه‌ای پاسخ دهید. هرگز داده‌ای را که در متن داده نشده جعل نکنید؛ اگر اطلاعات کافی نیست صریحاً بگویید.';

/** استخراج JSON از پاسخ مدل‌ها (حذف ```json و متن اضافه). */
export const extractJson = <T,>(text: string): T => {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }
  const start = cleaned.search(/[\[{]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
  throw new Error('پاسخ JSON معتبر نیست');
};

export const callAiRaw = async (options: { feature: AiFeatureId; system: string; messages: AiMessage[]; json?: boolean; maxTokens?: number; provider?: AiProviderId }) => {
  const settings = getAiSettings();
  const provider = options.provider || settings.activeProvider;
  const config = settings.providers[provider];
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      connection: config.connection,
      model: config.model,
      messages: [{ role: 'system', content: `${SYSTEM_PREAMBLE}\n\n${options.system}` }, ...options.messages],
      temperature: settings.temperature,
      maxTokens: options.maxTokens || 1200,
      json: options.json,
      apiKey: config.apiKey,
    }),
  });
  const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !data.ok) throw new AiUnavailableError(data.error || `HTTP ${response.status}`);
  return { text: String(data.text), provider, model: config.model, latencyMs: Number(data.latencyMs || 0) };
};

// وضعیت کلیدهای سمت سرور یک بار در هر بارگذاری خوانده می‌شود.
let serverStatusPromise: Promise<Record<string, boolean> | null> | null = null;
const cachedServerStatus = () => (serverStatusPromise ||= getAiServerStatus());

/** آیا برای ارائه‌دهنده فعال کلیدی (سرور یا محلی) وجود دارد؟ */
export const hasUsableKey = async (provider?: AiProviderId): Promise<boolean> => {
  const settings = getAiSettings();
  const id = provider || settings.activeProvider;
  const config = settings.providers[id];
  if (config.apiKey) return true;
  const status = await cachedServerStatus();
  if (!status) return true; // وضعیت نامعلوم: تلاش کن و در صورت خطا به موتور محلی برگرد.
  return config.connection === 'OPENROUTER' ? Boolean(status.openrouter) : Boolean(status[id]);
};

window.addEventListener?.('msb-ai-settings-changed', () => { serverStatusPromise = null; });

export const runAi = async <T,>(options: AiCallOptions<T>): Promise<AiResult<T>> => {
  const settings = getAiSettings();
  const local = (notice: string): AiResult<T> => ({ data: options.fallback(), source: 'LOCAL', notice });
  if (!isAiFeatureEnabled(options.feature)) {
    return local(settings.enabled ? 'این قابلیت توسط مدیر سیستم برای هوش مصنوعی غیرفعال شده؛ نتیجه از موتور هوشمند محلی است.' : 'هوش مصنوعی غیرفعال است؛ نتیجه از موتور هوشمند محلی است.');
  }
  if (!options.override && settings.localFallback && !(await hasUsableKey())) {
    return local('کلید API برای ارائه‌دهنده فعال تنظیم نشده؛ نتیجه از موتور هوشمند محلی است. (تنظیمات ← هوش مصنوعی)');
  }
  const started = performance.now();
  try {
    const raw = await callAiRaw({ ...options, provider: options.override?.provider });
    const data = options.parse(raw.text);
    logAiUsage({ feature: options.feature, provider: raw.provider, model: raw.model, ok: true, latencyMs: raw.latencyMs || Math.round(performance.now() - started), userId: options.actorId || '' });
    return { data, source: 'AI', provider: raw.provider, model: raw.model, latencyMs: raw.latencyMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطای ناشناخته';
    logAiUsage({ feature: options.feature, provider: settings.activeProvider, model: settings.providers[settings.activeProvider].model, ok: false, latencyMs: Math.round(performance.now() - started), userId: options.actorId || '', error: message });
    if (!settings.localFallback) throw new AiUnavailableError(message);
    return local(`سرویس هوش مصنوعی در دسترس نبود (${message})؛ نتیجه از موتور هوشمند محلی است.`);
  }
};

export const getAiServerStatus = async (): Promise<Record<string, boolean> | null> => {
  try {
    const response = await fetch('/api/ai/status');
    const data = await response.json();
    return data?.serverKeys || null;
  } catch {
    return null;
  }
};
