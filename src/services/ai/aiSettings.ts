/**
 * تنظیمات هوش مصنوعی سامانه — انتخاب ارائه‌دهنده و مدل فقط با مدیر سیستم.
 */
import { User } from '../../types';
import { loadLocalValue, saveLocalValue } from '../localStore';

export type AiProviderId = 'gemini' | 'deepseek' | 'grok';
export type AiConnectionMode = 'DIRECT' | 'OPENROUTER';

export type AiFeatureId =
  | 'assistant'      // دستیار گفت‌وگومحور
  | 'command'        // فرمان سریع هوشمند (Ctrl+K)
  | 'writer'         // نگارش و بهبود متن (پیشنهاد، مصوبه، گزارش، پیگیری)
  | 'proposalReview' // تحلیل پیشنهاد برای تصمیم مدیرعامل
  | 'meetingPlanner' // برنامه‌ریزی هوشمند دستورکار
  | 'minutes'        // پیش‌نویس صورت‌جلسه
  | 'resolutionDraft'// پیش‌نویس و پیشنهاد مسئول/مهلت مصوبه
  | 'riskInsight'    // پیش‌بینی ریسک تأخیر و تحلیل مصوبه
  | 'dashboardBrief' // خلاصه هوشمند روزانه داشبورد
  | 'reportNarrative'; // گزارش مدیریتی روایی

export interface AiProviderPreset {
  id: AiProviderId;
  name: string;
  vendor: string;
  color: string;
  models: { connection: AiConnectionMode; model: string; label: string; free: boolean; note?: string }[];
  keyHint: string;
}

/**
 * مدل‌های پیش‌فرض با تمرکز بر نسخه‌های رایگان. فهرست رایگان‌ها را
 * ارائه‌دهنده تعیین می‌کند و ممکن است تغییر کند؛ به همین دلیل نام مدل در
 * تنظیمات قابل ویرایش دستی است.
 */
export const AI_PROVIDERS: AiProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Gemini',
    vendor: 'Google',
    color: '#1a73e8',
    keyHint: 'کلید رایگان از aistudio.google.com — سطح رایگان با محدودیت تعداد درخواست',
    models: [
      { connection: 'DIRECT', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', free: true, note: 'سطح رایگان Google AI Studio' },
      { connection: 'DIRECT', model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', free: true, note: 'سریع‌ترین، سهمیه رایگان بیشتر' },
      { connection: 'DIRECT', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', free: true },
      { connection: 'OPENROUTER', model: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (OpenRouter)', free: true },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: 'DeepSeek',
    color: '#4d6bfe',
    keyHint: 'مدل‌های رایگان از طریق OpenRouter (پسوند :free)؛ اتصال مستقیم DeepSeek کم‌هزینه است اما رایگان نیست',
    models: [
      { connection: 'OPENROUTER', model: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (رایگان)', free: true },
      { connection: 'OPENROUTER', model: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 استدلالی (رایگان)', free: true, note: 'کندتر، مناسب تحلیل' },
      { connection: 'DIRECT', model: 'deepseek-chat', label: 'DeepSeek Chat (مستقیم)', free: false, note: 'پولی با هزینه بسیار کم' },
    ],
  },
  {
    id: 'grok',
    name: 'Grok',
    vendor: 'xAI',
    color: '#111827',
    keyHint: 'مدل رایگان از طریق OpenRouter؛ اتصال مستقیم xAI با اعتبار حساب کار می‌کند',
    models: [
      { connection: 'OPENROUTER', model: 'x-ai/grok-4-fast:free', label: 'Grok 4 Fast (رایگان)', free: true },
      { connection: 'DIRECT', model: 'grok-3-mini', label: 'Grok 3 Mini (مستقیم)', free: false, note: 'نیازمند اعتبار حساب xAI' },
    ],
  },
];

export const AI_FEATURES: { id: AiFeatureId; title: string; description: string }[] = [
  { id: 'assistant', title: 'دستیار هوشمند گفت‌وگومحور', description: 'پاسخ به پرسش‌ها درباره جلسات، مصوبات و کارها با زبان طبیعی' },
  { id: 'command', title: 'فرمان سریع هوشمند (Ctrl+K)', description: 'جابه‌جایی و انجام کار با یک جمله یا فرمان صوتی' },
  { id: 'writer', title: 'نگارش و بهبود متن', description: 'نوشتن پیشنهاد، شرح مصوبه، گزارش پیشرفت و پیگیری با لحن رسمی' },
  { id: 'proposalReview', title: 'تحلیل پیشنهاد برای مدیرعامل', description: 'خلاصه، نقاط قوت، ریسک‌ها، پیشنهادهای مشابه و توصیه تصمیم' },
  { id: 'meetingPlanner', title: 'برنامه‌ریز هوشمند جلسه', description: 'پیشنهاد عنوان، ترتیب و زمان‌بندی بندها و اعضای مرتبط' },
  { id: 'minutes', title: 'پیش‌نویس خودکار صورت‌جلسه', description: 'تولید متن رسمی صورت‌جلسه از نتایج بندها و مصوبات' },
  { id: 'resolutionDraft', title: 'دستیار ثبت مصوبه', description: 'پیشنهاد متن اجرایی، مسئول، واحد، مهلت و اولویت' },
  { id: 'riskInsight', title: 'تحلیل ریسک و خلاصه مصوبه', description: 'پیش‌بینی احتمال تأخیر و اقدام پیشنهادی' },
  { id: 'dashboardBrief', title: 'خلاصه هوشمند روزانه', description: 'گزارش کوتاه وضعیت و اولویت‌های امروز هر کاربر در داشبورد' },
  { id: 'reportNarrative', title: 'گزارش مدیریتی روایی', description: 'تحلیل متنی آمار و روندها برای مدیران ارشد' },
];

export interface AiProviderConfig {
  connection: AiConnectionMode;
  model: string;
  /** کلید محلی (فقط اگر کلید سمت سرور تنظیم نشده باشد). */
  apiKey?: string;
}

export interface AiSettings {
  enabled: boolean;
  activeProvider: AiProviderId;
  providers: Record<AiProviderId, AiProviderConfig>;
  features: Record<AiFeatureId, boolean>;
  temperature: number;
  /** اگر سرویس در دسترس نبود، موتور هوشمند محلی پاسخ دهد. */
  localFallback: boolean;
  /** ارسال داده‌های سامانه به‌صورت خلاصه و بدون اطلاعات تماس افراد. */
  privacyMode: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const KEY = 'aiSettings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  activeProvider: 'gemini',
  providers: {
    gemini: { connection: 'DIRECT', model: 'gemini-2.5-flash' },
    deepseek: { connection: 'OPENROUTER', model: 'deepseek/deepseek-chat-v3-0324:free' },
    grok: { connection: 'OPENROUTER', model: 'x-ai/grok-4-fast:free' },
  },
  features: AI_FEATURES.reduce((acc, feature) => ({ ...acc, [feature.id]: true }), {} as Record<AiFeatureId, boolean>),
  temperature: 0.4,
  localFallback: true,
  privacyMode: true,
};

export const getAiSettings = (): AiSettings => {
  const saved = loadLocalValue<Partial<AiSettings>>(KEY, {});
  return {
    ...DEFAULT_AI_SETTINGS,
    ...saved,
    providers: {
      gemini: { ...DEFAULT_AI_SETTINGS.providers.gemini, ...(saved.providers?.gemini || {}) },
      deepseek: { ...DEFAULT_AI_SETTINGS.providers.deepseek, ...(saved.providers?.deepseek || {}) },
      grok: { ...DEFAULT_AI_SETTINGS.providers.grok, ...(saved.providers?.grok || {}) },
    },
    features: { ...DEFAULT_AI_SETTINGS.features, ...(saved.features || {}) },
  };
};

/** فقط مدیر سیستم (نقش ADMIN) — نه حتی دارنده مجوز مدیریت کاربران. */
export const canManageAi = (actor?: User): boolean => actor?.role === 'ADMIN';

export const saveAiSettings = (settings: AiSettings, actor: User): AiSettings => {
  if (!canManageAi(actor)) throw new Error('فقط مدیر سیستم می‌تواند تنظیمات هوش مصنوعی را تغییر دهد.');
  const next = { ...settings, updatedAt: new Date().toISOString(), updatedBy: actor.fullName };
  saveLocalValue(KEY, next);
  window.dispatchEvent(new CustomEvent('msb-ai-settings-changed'));
  return next;
};

export const isAiFeatureEnabled = (feature: AiFeatureId): boolean => {
  const settings = getAiSettings();
  return settings.enabled && settings.features[feature] !== false;
};

export const providerPreset = (id: AiProviderId) => AI_PROVIDERS.find((item) => item.id === id)!;

export const maskKey = (key?: string) => (key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '');

// ——— لاگ مصرف ———
export interface AiUsageEntry {
  id: string;
  at: string;
  feature: AiFeatureId;
  provider: AiProviderId | 'local';
  model: string;
  ok: boolean;
  latencyMs: number;
  userId: string;
  error?: string;
}

const USAGE_KEY = 'aiUsageLog';

export const logAiUsage = (entry: Omit<AiUsageEntry, 'id' | 'at'>) => {
  const log = loadLocalValue<AiUsageEntry[]>(USAGE_KEY, []);
  log.unshift({ ...entry, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() });
  saveLocalValue(USAGE_KEY, log.slice(0, 300));
};

export const getAiUsageLog = (): AiUsageEntry[] => loadLocalValue<AiUsageEntry[]>(USAGE_KEY, []);
