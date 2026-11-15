/**
 * پیکربندی ثابت موتور پیشنهاددهنده سامانه — فقط سمت سرور.
 *
 * ارائه‌دهنده و مدل اینجا تعیین می‌شوند و هیچ‌وقت به مرورگر ارسال یا در رابط کاربری
 * نمایش داده نمی‌شوند. کلیدها از متغیرهای محیطی سرور خوانده می‌شوند (در Vercel:
 * Settings ← Environment Variables) و هرگز در کد یا مخزن قرار نمی‌گیرند.
 *
 * بعداً با اضافه شدن بک‌اند، این مقادیر از تنظیمات سرور خوانده خواهند شد.
 *
 * ترتیب مهم است: اولین گزینه‌ای که کلیدش روی سرور موجود است استفاده می‌شود.
 */
import type { AiConnectionMode, AiProviderId } from './aiProxy.js';

export interface EngineOption { provider: AiProviderId; connection: AiConnectionMode; model: string }

export const ENGINE_CHAIN: EngineOption[] = [
  // کلید: GEMINI_API_KEY — اگر این مدل شلوغ یا سهمیه‌اش تمام باشد، مدل‌های جایگزین همان ارائه‌دهنده خودکار امتحان می‌شوند.
  { provider: 'gemini', connection: 'DIRECT', model: 'gemini-flash-lite-latest' },
  // کلید: OPENROUTER_API_KEY
  { provider: 'deepseek', connection: 'OPENROUTER', model: 'deepseek/deepseek-chat-v3-0324:free' },
  // کلید: DEEPSEEK_API_KEY
  { provider: 'deepseek', connection: 'DIRECT', model: 'deepseek-chat' },
  // کلید: XAI_API_KEY
  { provider: 'grok', connection: 'DIRECT', model: 'grok-3-mini' },
];
