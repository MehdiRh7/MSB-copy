/**
 * شناسه قابلیت‌های کمکی سامانه. پیکربندی سرویس (ارائه‌دهنده، مدل، کلید) فقط سمت سرور
 * و در server/aiConfig.ts است؛ مرورگر هیچ اطلاعی از نوع آن ندارد و کاربر هم تنظیمی نمی‌بیند.
 */
export type AiFeatureId =
  | 'assistant'      // دستیار گفت‌وگومحور
  | 'command'        // فرمان سریع (Ctrl+K)
  | 'writer'         // نگارش و بهبود متن (پیشنهاد، مصوبه، گزارش، پیگیری)
  | 'proposalReview' // تحلیل پیشنهاد برای تصمیم مدیرعامل
  | 'meetingPlanner' // زمان‌بندی دستورکار
  | 'minutes'        // پیش‌نویس صورت‌جلسه
  | 'resolutionDraft'// پیش‌نویس و پیشنهاد مسئول/مهلت مصوبه
  | 'riskInsight'    // پیش‌بینی ریسک تأخیر و تحلیل مصوبه
  | 'dashboardBrief' // خلاصه روزانه داشبورد
  | 'reportNarrative' // گزارش مدیریتی روایی
  | 'proactiveAlerts' // هشدار پیشگیرانه ریسک تأخیر
  | 'semanticSearch'  // جستجوی مفهومی
  | 'conflictCheck'   // بررسی تناقض و تکرار مصوبه
  | 'extraction'      // استخراج مصوبه از متن
  | 'documentReader'  // خلاصه پیوست‌ها
  | 'meetingRecorder' // صورت‌جلسه از گفتار جلسه
  | 'meetingScheduler' // پیشنهاد زمان جلسه
  | 'reportBuilder';   // گزارش‌ساز با درخواست متنی

/** همه قابلیت‌ها فعال‌اند؛ تا اضافه شدن بک‌اند، کنترلی در رابط کاربری وجود ندارد. */
export const isAiFeatureEnabled = (_feature: AiFeatureId): boolean => true;

// پاک‌سازی تنظیمات و لاگ‌های نسخه‌های قبلی که ممکن است نام سرویس یا کلید را در مرورگر نگه داشته باشند.
try {
  ['aiSettings', 'aiUsageLog'].forEach((key) => window.localStorage?.removeItem(`postbank-mosavabat-v1:${key}`));
} catch { /* ignore */ }
