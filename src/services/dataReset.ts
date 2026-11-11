const STORAGE_PREFIX = 'postbank-mosavabat-v1:';

/**
 * Keyهای Operational / Transactional — داده فرآیندی سامانه.
 * اینها با Reset پاک می‌شوند تا سامانه برای ثبت یک سناریوی جدید از صفر
 * آماده شود.
 */
export const OPERATIONAL_STORAGE_KEYS = [
  'proposals',              // مصوبات پیشنهادی و تاریخچه/Workflow آنها
  'meetings',               // جلسات، دستورکار، دعوتنامه‌ها، مدعوین، نتایج
  'resolutions',            // مصوبات، امضاهای فرآیندی، ابلاغ، اجرا، پیگیری
  'tasks',                  // وظایف و ارجاعات اجرایی
  'approvals',              // کارتابل صحه‌گذاری
  'activityLogs',           // Timeline / History / Audit موجودیت‌های عملیاتی
  'notifications',          // Notification Center
  'boardMinutes',           // صورت‌جلسه‌های تجمیعی
  'resolutionNotices',      // ابلاغیه‌ها و امضای ابلاغیه
  'resolutionFollowUps',    // رکوردهای پیگیری
  'governanceAudit',        // ردپای دبیرخانه هیأت‌مدیره
  'outcomeLetters',         // نامه‌های نتیجه بند دستور جلسه
  'archiveFolders',         // پوشه‌های بایگانی (Demo/Operational)
  'archiveItems',           // محتوای بایگانی و ارتباط آن با پرونده‌های قبلی
  'notificationLetterSequence', // شمارنده شماره نامه ابلاغیه
  'smsMockLog',             // لاگ پیامک‌های شبیه‌سازی‌شده
  'aiUsageLog',             // لاگ مصرف هوش مصنوعی
] as const;

/**
 * Keyهای Master / Authentication / Settings — به هیچ عنوان پاک نمی‌شوند.
 * اینجا فهرست می‌شوند تا هر Key جدیدی که اضافه می‌شود آگاهانه در یکی از
 * این دو دسته قرار بگیرد و Reset کورکورانه (localStorage.clear) لازم نشود.
 */
export const PRESERVED_STORAGE_KEYS = [
  'users',            // کاربران، نقش، مجوزها، سمت، واحد و تصویر امضای پروفایل
  'isAuthenticated',  // وضعیت ورود
  'currentUserId',    // کاربر جاری
  'customPositions',  // سمت‌های سازمانی تعریف‌شده
  'orgInfo',          // اطلاعات پایه سازمان
  'calendars',        // تقویم‌های سازمانی
  'smsSettings',      // تنظیمات پنل پیامکی
  'ldapSettings',     // تنظیمات دایرکتوری سازمانی
  'signatureWorkflowSettings', // امضاکننده هر مرحله گردش امضا (تنظیم سامانه)
  'signatureDelegations',      // جانشین امضای کاربران (تنظیم شخصی کاربر)
  'workflowTemplates',         // قالب‌های گردش کار پویا (تنظیم سامانه)
  'aiSettings',                // تنظیمات ارائه‌دهنده هوش مصنوعی (فقط مدیر سیستم)
] as const;

/**
 * فقط Keyهای عملیاتی را حذف می‌کند. عمداً از localStorage.clear استفاده
 * نمی‌شود، چون کاربران، احراز هویت، مجوزها، ساختار سازمانی و تنظیمات پایه
 * در همین Storage نگهداری می‌شوند و باید دست‌نخورده بمانند.
 */
export const resetOperationalData = (): string[] => {
  if (typeof window === 'undefined') return [];
  const cleared: string[] = [];
  OPERATIONAL_STORAGE_KEYS.forEach((key) => {
    const storageKey = `${STORAGE_PREFIX}${key}`;
    if (window.localStorage.getItem(storageKey) !== null) {
      window.localStorage.removeItem(storageKey);
      cleared.push(key);
    }
  });
  // sessionStorage هیچ داده عملیاتی سامانه را نگه نمی‌دارد، اما اگر
  // Keyای با همین Prefix در آن مانده باشد نیز پاک می‌شود.
  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    /* sessionStorage در دسترس نیست — نادیده گرفته می‌شود */
  }
  return cleared;
};

const RESET_MARKER_KEY = `${STORAGE_PREFIX}operationalResetVersion`;
/**
 * با هر بار بالا بردن این عدد، Reset دقیقاً یک‌بار روی مرورگرهایی که هنوز
 * داده قدیمی دارند اجرا می‌شود.
 */
const CURRENT_RESET_VERSION = '1';

/**
 * Reset یک‌باره هنگام بالا آمدن برنامه: داده‌های Demo/عملیاتی قبلی که در
 * مرورگر کاربر مانده‌اند پاک می‌شوند. چون نتیجه با یک Marker علامت‌گذاری
 * می‌شود، داده‌ای که کاربر از این پس ثبت می‌کند هرگز پاک نخواهد شد.
 */
export const runOneTimeOperationalReset = (): void => {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(RESET_MARKER_KEY) === CURRENT_RESET_VERSION) return;
    resetOperationalData();
    window.localStorage.setItem(RESET_MARKER_KEY, CURRENT_RESET_VERSION);
  } catch {
    /* Storage در دسترس نیست — برنامه بدون Reset ادامه می‌دهد */
  }
};
