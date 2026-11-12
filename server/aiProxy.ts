/**
 * پراکسی سمت سرور هوش مصنوعی — تنها نقطه‌ای که با DeepSeek / Gemini / Grok
 * صحبت می‌کند.
 *
 * چرا سمت سرور؟
 *  - کلید API در مرورگر کاربران پخش نمی‌شود (کلیدها از متغیرهای محیطی سرور
 *    خوانده می‌شوند؛ .env.local).
 *  - مشکل CORS ارائه‌دهنده‌ها حل می‌شود.
 *  - آدرس پایه هر ارائه‌دهنده فقط از env قابل تغییر است (مثلاً Relay سازمانی)
 *    و هرگز از کلاینت گرفته نمی‌شود تا سرور به هر آدرسی درخواست نزند (SSRF).
 *
 * همین Handler هم در Vite (dev/preview) و هم در سرور Express تولید استفاده
 * می‌شود.
 */

export type AiProviderId = 'gemini' | 'deepseek' | 'grok';
export type AiConnectionMode = 'DIRECT' | 'OPENROUTER';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProxyRequest {
  provider: AiProviderId;
  connection: AiConnectionMode;
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  /** کلید واردشده توسط مدیر سیستم در تنظیمات؛ فقط اگر کلید سمت سرور نباشد. */
  apiKey?: string;
}

export interface AiProxyResponse {
  ok: boolean;
  text?: string;
  provider?: AiProviderId;
  model?: string;
  /** اگر مدل درخواستی منسوخ بود و با مدل جایگزین پیشنهادی ارائه‌دهنده پاسخ داده شد. */
  replacedModel?: string;
  /** مدل انتخابی شلوغ بود و این پاسخ از مدل جایگزین آمد (تنظیمات تغییر نمی‌کند). */
  fallbackFrom?: string;
  latencyMs?: number;
  usage?: { promptTokens?: number; completionTokens?: number };
  error?: string;
  status?: number;
}

export type AiEnv = Record<string, string | undefined>;

const DEFAULT_BASE = {
  gemini: 'https://generativelanguage.googleapis.com',
  deepseek: 'https://api.deepseek.com',
  grok: 'https://api.x.ai',
  openrouter: 'https://openrouter.ai/api',
};

const baseUrl = (env: AiEnv, key: keyof typeof DEFAULT_BASE) => {
  const override = env[`${key.toUpperCase()}_BASE_URL`];
  return (override && /^https?:\/\//.test(override) ? override : DEFAULT_BASE[key]).replace(/\/+$/, '');
};

const serverKey = (env: AiEnv, provider: AiProviderId, connection: AiConnectionMode): string | undefined => {
  if (connection === 'OPENROUTER') return env.OPENROUTER_API_KEY;
  if (provider === 'gemini') return env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? env.GEMINI_API_KEY : undefined;
  if (provider === 'deepseek') return env.DEEPSEEK_API_KEY;
  return env.XAI_API_KEY || env.GROK_API_KEY;
};

/** وضعیت کلیدهای سمت سرور (بدون افشای مقدار). */
export const aiServerStatus = (env: AiEnv) => ({
  gemini: Boolean(serverKey(env, 'gemini', 'DIRECT')),
  deepseek: Boolean(serverKey(env, 'deepseek', 'DIRECT')),
  grok: Boolean(serverKey(env, 'grok', 'DIRECT')),
  openrouter: Boolean(env.OPENROUTER_API_KEY),
});

const MODEL_PATTERN = /^[A-Za-z0-9._:\/-]{1,120}$/;

const validate = (body: AiProxyRequest): string | null => {
  if (!body || typeof body !== 'object') return 'درخواست نامعتبر است';
  if (!['gemini', 'deepseek', 'grok'].includes(body.provider)) return 'ارائه‌دهنده نامعتبر است';
  if (!['DIRECT', 'OPENROUTER'].includes(body.connection)) return 'نوع اتصال نامعتبر است';
  if (!MODEL_PATTERN.test(body.model || '')) return 'نام مدل نامعتبر است';
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 60) return 'پیام‌ها نامعتبرند';
  const total = body.messages.reduce((sum, m) => sum + String(m?.content || '').length, 0);
  if (total > 120_000) return 'متن درخواست بیش از حد طولانی است';
  return null;
};

/**
 * Vercel تابع را پس از maxDuration (۶۰ ثانیه) قطع می‌کند و پاسخ 504 بدون توضیح برمی‌گردد.
 * کل درخواست (همراه تلاش دوباره و مدل جایگزین) باید زودتر تمام شود تا همیشه پاسخ JSON برگردد.
 */
const TOTAL_BUDGET_MS = 50_000;
const CALL_TIMEOUT_MS = 45_000;
const FIRST_TRY_MS = 25_000;

const withTimeout = async (url: string, init: RequestInit, ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const callOpenAiCompatible = async (url: string, key: string, body: AiProxyRequest, extraHeaders: Record<string, string> = {}, timeoutMs = CALL_TIMEOUT_MS) => {
  const response = await withTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature ?? 0.4,
      max_tokens: body.maxTokens ?? 1200,
      ...(body.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  }, timeoutMs);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${response.status}`), { status: response.status });
  return {
    text: String(data?.choices?.[0]?.message?.content ?? ''),
    usage: { promptTokens: data?.usage?.prompt_tokens, completionTokens: data?.usage?.completion_tokens },
  };
};

const callGemini = async (env: AiEnv, key: string, body: AiProxyRequest, timeoutMs = CALL_TIMEOUT_MS) => {
  const system = body.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `${baseUrl(env, 'gemini')}/v1beta/models/${encodeURIComponent(body.model)}:generateContent`;
  const response = await withTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature: body.temperature ?? 0.4,
        maxOutputTokens: body.maxTokens ?? 1200,
        ...(body.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  }, timeoutMs);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${response.status}`), { status: response.status });
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
  return { text, usage: { promptTokens: data?.usageMetadata?.promptTokenCount, completionTokens: data?.usageMetadata?.candidatesTokenCount } };
};

/** خطای موقت «شلوغی» ارائه‌دهنده (۵۰۳ / overloaded / high demand). */
const isOverloaded = (error: any) => {
  const m = String(error?.message || '').toLowerCase();
  return error?.status === 503 || m.includes('high demand') || m.includes('overloaded') || m.includes('unavailable') || m.includes('try again later');
};
/** سهمیه (۴۲۹ / RESOURCE_EXHAUSTED). در Gemini سهمیه رایگان برای هر مدل جداست. */
const isQuota = (error: any) => {
  const m = String(error?.message || '').toLowerCase();
  return error?.status === 429 || m.includes('quota') || m.includes('resource_exhausted') || m.includes('rate limit');
};
const isTimeout = (error: any) => error?.name === 'AbortError';
const isModelMissing = (error: any) => error?.status === 404 || /not found|not supported/i.test(String(error?.message));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * مدل‌های جایگزین Gemini (هر کدام سهمیه رایگان جداگانه دارند). اگر مدل انتخابی شلوغ بود، دیر جواب داد
 * یا سهمیه‌اش تمام شد، به ترتیب امتحان می‌شوند. نام‌های نامعتبر بی‌صدا رد می‌شوند.
 */
const GEMINI_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];

/** «Please retry in 10h37m15.8s» → میلی‌ثانیه. */
export const parseRetryDelay = (message: string): number | null => {
  const m = String(message).match(/retry in\s+((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i);
  if (!m || !m[1]) return null;
  const h = Number(m[1].match(/(\d+)h/)?.[1] || 0), min = Number(m[1].match(/(\d+)m(?!s)/)?.[1] || 0), sec = Number(m[1].match(/([\d.]+)s/)?.[1] || 0);
  const ms = ((h * 60 + min) * 60 + sec) * 1000;
  return ms > 0 ? ms : null;
};

/** مدل‌هایی که سهمیه‌شان تمام شده تا زمان بازشدن کنار گذاشته می‌شوند (تا درخواست هدر نرود). */
const quotaCooldown = new Map<string, { until: number; error: any }>();
const coolingDown = (model: string) => {
  const entry = quotaCooldown.get(model);
  if (!entry) return null;
  if (entry.until <= Date.now()) { quotaCooldown.delete(model); return null; }
  return entry;
};
const rememberQuota = (model: string, error: any) => {
  const delay = parseRetryDelay(error?.message || '') ?? 60_000;
  quotaCooldown.set(model, { until: Date.now() + delay, error });
};

/**
 * مدل انتخابی؛ اگر شلوغ بود، دیر جواب داد یا سهمیه‌اش تمام شد: (برای شلوغی کوتاه) یک تلاش دوباره،
 * سپس مدل‌های جایگزین — همه داخل بودجه زمانی کل. خطاهای دیگر (کلید نامعتبر و ...) همان‌طور برمی‌گردند.
 */
const callGeminiResilient = async (env: AiEnv, key: string, body: AiProxyRequest, deadline: number) => {
  const left = () => deadline - Date.now();
  const recoverable = (e: any) => isOverloaded(e) || isTimeout(e) || isQuota(e);
  let last: any = coolingDown(body.model)?.error;
  if (!last) {
    try {
      return { ...(await callGemini(env, key, body, Math.min(FIRST_TRY_MS, left()))), model: body.model };
    } catch (error: any) {
      if (!recoverable(error)) throw error;
      if (isQuota(error)) rememberQuota(body.model, error);
      last = error;
    }
    // شلوغی سریع → یک بار دیگر همان مدل؛ دیرکرد یا سهمیه → مستقیم سراغ جایگزین.
    if (isOverloaded(last) && !isTimeout(last) && !isQuota(last) && left() > 15_000) {
      await wait(1000);
      try {
        return { ...(await callGemini(env, key, body, Math.min(15_000, left() - 8_000))), model: body.model };
      } catch (error: any) {
        if (!recoverable(error)) throw error;
        if (isQuota(error)) rememberQuota(body.model, error);
        last = error;
      }
    }
  }
  // شلوغی یا دیرکرد مدل اصلی: ۲ دقیقه کنار گذاشته می‌شود تا درخواست‌های بعدی بی‌معطلی سراغ جایگزین بروند.
  if (last && !isQuota(last) && (isOverloaded(last) || isTimeout(last)) && !coolingDown(body.model)) {
    quotaCooldown.set(body.model, { until: Date.now() + 120_000, error: last });
  }
  const primaryError = last;
  for (const alt of GEMINI_FALLBACKS.filter((m) => m !== body.model)) {
    if (left() < 5_000) break;
    if (coolingDown(alt)) continue;
    try {
      return { ...(await callGemini(env, key, { ...body, model: alt }, Math.min(FIRST_TRY_MS, left() - 1_000))), model: alt };
    } catch (error: any) {
      if (isQuota(error)) rememberQuota(alt, error);
      if (isModelMissing(error)) quotaCooldown.set(alt, { until: Date.now() + 6 * 3600_000, error });
      if (!recoverable(error) && !isModelMissing(error)) throw error;
    }
  }
  // پیام خطای مدل اصلی (مثلاً «سهمیه روزانه ...») گویاتر از خطای آخرین جایگزین است.
  throw primaryError;
};

export const handleAiChat = async (body: AiProxyRequest, env: AiEnv): Promise<AiProxyResponse> => {
  const invalid = validate(body);
  if (invalid) return { ok: false, error: invalid, status: 400 };
  const key = serverKey(env, body.provider, body.connection) || (typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined);
  if (!key) return { ok: false, error: 'کلید API برای این ارائه‌دهنده تنظیم نشده است', status: 401 };
  const started = Date.now();
  try {
    let result: { text: string; usage?: AiProxyResponse['usage']; model?: string };
    if (body.connection === 'OPENROUTER') {
      result = await callOpenAiCompatible(`${baseUrl(env, 'openrouter')}/v1/chat/completions`, key, body, { 'X-Title': 'Meeting Resolution System' });
    } else if (body.provider === 'gemini') {
      try {
        result = await callGeminiResilient(env, key, body, started + TOTAL_BUDGET_MS);
        if (result.model !== body.model) {
          if (!result.text.trim()) return { ok: false, error: 'پاسخ خالی از ارائه‌دهنده دریافت شد', status: 502 };
          return { ok: true, text: result.text, provider: body.provider, model: result.model, fallbackFrom: body.model, latencyMs: Date.now() - started, usage: result.usage };
        }
      } catch (error: any) {
        // گوگل مدل‌ها را منسوخ می‌کند و در پیام خطا جایگزین را معرفی می‌کند
        // («... use models/<name> ...»). یک بار با همان مدل تلاش می‌شود.
        const suggested = String(error?.message || '').match(/use\s+models\/([A-Za-z0-9._-]+)/i)?.[1];
        if (!suggested || suggested === body.model || !MODEL_PATTERN.test(suggested)) throw error;
        result = await callGemini(env, key, { ...body, model: suggested }, Math.max(3_000, started + TOTAL_BUDGET_MS - Date.now()));
        if (!result.text.trim()) return { ok: false, error: 'پاسخ خالی از ارائه‌دهنده دریافت شد', status: 502 };
        return { ok: true, text: result.text, provider: body.provider, model: suggested, replacedModel: body.model, latencyMs: Date.now() - started, usage: result.usage };
      }
    } else if (body.provider === 'deepseek') {
      result = await callOpenAiCompatible(`${baseUrl(env, 'deepseek')}/chat/completions`, key, body);
    } else {
      result = await callOpenAiCompatible(`${baseUrl(env, 'grok')}/v1/chat/completions`, key, body);
    }
    if (!result.text.trim()) return { ok: false, error: 'پاسخ خالی از ارائه‌دهنده دریافت شد', status: 502 };
    return { ok: true, text: result.text, provider: body.provider, model: body.model, latencyMs: Date.now() - started, usage: result.usage };
  } catch (error: any) {
    const aborted = error?.name === 'AbortError';
    return { ok: false, error: aborted ? 'زمان پاسخ‌گویی ارائه‌دهنده به پایان رسید' : (error?.message || 'خطای ناشناخته'), status: aborted ? 504 : (error?.status || 502), latencyMs: Date.now() - started };
  }
};

export interface AiModelInfo { id: string; label: string; free: boolean }

/**
 * فهرست زنده مدل‌های در دسترس همین کلید/حساب — تا با منسوخ شدن مدل‌ها،
 * نام مدل‌ها در کد ثابت نماند.
 */
export const handleAiModels = async (provider: AiProviderId, connection: AiConnectionMode, env: AiEnv, apiKey?: string): Promise<{ ok: boolean; models?: AiModelInfo[]; error?: string; status?: number }> => {
  if (!['gemini', 'deepseek', 'grok'].includes(provider) || !['DIRECT', 'OPENROUTER'].includes(connection)) return { ok: false, error: 'درخواست نامعتبر است', status: 400 };
  try {
    if (connection === 'OPENROUTER') {
      const response = await withTimeout(`${baseUrl(env, 'openrouter')}/v1/models`, { headers: { Accept: 'application/json' } }, 20_000);
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: data?.error?.message || `HTTP ${response.status}`, status: response.status };
      const vendor = provider === 'gemini' ? 'google/' : provider === 'deepseek' ? 'deepseek/' : 'x-ai/';
      const models = (data?.data || [])
        .filter((m: any) => String(m?.id || '').startsWith(vendor))
        .map((m: any) => ({ id: String(m.id), label: String(m.name || m.id), free: String(m.id).endsWith(':free') || (Number(m?.pricing?.prompt) === 0 && Number(m?.pricing?.completion) === 0) }))
        .sort((a: AiModelInfo, b: AiModelInfo) => Number(b.free) - Number(a.free));
      return { ok: true, models };
    }
    if (provider !== 'gemini') return { ok: true, models: [] };
    const key = serverKey(env, 'gemini', 'DIRECT') || apiKey?.trim();
    if (!key) return { ok: false, error: 'کلید API برای این ارائه‌دهنده تنظیم نشده است', status: 401 };
    const response = await withTimeout(`${baseUrl(env, 'gemini')}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 20_000);
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data?.error?.message || `HTTP ${response.status}`, status: response.status };
    const models = (data?.models || [])
      .filter((m: any) => (m?.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(String(m?.name || '')) && !/embedding|image|tts|audio|live/i.test(String(m?.name || '')))
      .map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), label: String(m.displayName || m.name), free: true }));
    return { ok: true, models };
  } catch (error: any) {
    return { ok: false, error: error?.name === 'AbortError' ? 'زمان پاسخ‌گویی به پایان رسید' : (error?.message || 'خطای ناشناخته'), status: 502 };
  }
};

/** Middleware سازگار با Connect/Express برای مسیرهای /api/ai/*. */
export const createAiMiddleware = (env: AiEnv) => async (req: any, res: any, next: () => void) => {
  const url: string = req.url || '';
  if (!url.startsWith('/api/ai/')) return next();
  const send = (status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  };
  if (req.method === 'GET' && url.startsWith('/api/ai/status')) return send(200, { ok: true, serverKeys: aiServerStatus(env) });
  if (req.method === 'GET' && url.startsWith('/api/ai/models')) {
    const params = new URL(url, 'http://local').searchParams;
    const result = await handleAiModels(params.get('provider') as AiProviderId, (params.get('connection') || 'DIRECT') as AiConnectionMode, env);
    return send(result.ok ? 200 : (result.status || 500), result);
  }
  if (req.method !== 'POST' || !url.startsWith('/api/ai/chat')) return send(404, { ok: false, error: 'not found' });
  let raw = '';
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > 512_000) { send(413, { ok: false, error: 'درخواست بیش از حد بزرگ است' }); req.destroy(); return; }
    raw += chunk.toString('utf8');
  });
  req.on('end', async () => {
    if (res.writableEnded) return;
    let body: AiProxyRequest;
    try { body = JSON.parse(raw || '{}'); } catch { return send(400, { ok: false, error: 'JSON نامعتبر' }); }
    const result = await handleAiChat(body, env);
    send(result.ok ? 200 : (result.status || 500), result);
  });
};
