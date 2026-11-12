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
const isTimeout = (error: any) => error?.name === 'AbortError';

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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** مدل‌های جایگزین Gemini وقتی مدل انتخابی موقتاً شلوغ است. */
const GEMINI_OVERLOAD_FALLBACKS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

/**
 * مدل انتخابی؛ اگر شلوغ بود یا دیر جواب داد: (در صورت وقت کافی) یک تلاش دوباره، سپس مدل‌های جایگزین.
 * همه در بودجه زمانی کل؛ خطاهای دیگر همان‌طور برمی‌گردند.
 */
const callGeminiResilient = async (env: AiEnv, key: string, body: AiProxyRequest, deadline: number) => {
  const left = () => deadline - Date.now();
  let last: any;
  try {
    return { ...(await callGemini(env, key, body, Math.min(FIRST_TRY_MS, left()))), model: body.model };
  } catch (error: any) {
    if (!isOverloaded(error) && !isTimeout(error)) throw error;
    last = error;
  }
  // اگر خطای سریع «شلوغی» بود، یک بار دیگر همان مدل؛ اگر دیر جواب داد، مستقیم سراغ جایگزین.
  if (!isTimeout(last) && left() > 15_000) {
    await wait(1000);
    try {
      return { ...(await callGemini(env, key, body, Math.min(15_000, left() - 8_000))), model: body.model };
    } catch (error: any) {
      if (!isOverloaded(error) && !isTimeout(error)) throw error;
      last = error;
    }
  }
  for (const alt of GEMINI_OVERLOAD_FALLBACKS.filter((m) => m !== body.model)) {
    if (left() < 5_000) break;
    try {
      return { ...(await callGemini(env, key, { ...body, model: alt }, left() - 1_000)), model: alt };
    } catch (error: any) {
      last = error;
      if (!isOverloaded(error) && !isTimeout(error) && !/not found|not supported/i.test(String(error?.message))) throw error;
    }
  }
  throw last;
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
