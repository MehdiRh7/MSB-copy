import { toPersianDigits } from './formatters';
import { addJalaliDays, todayJalali } from './jalaliDate';

/** تاریخ جاری شمسی؛ برای مقدار پیش‌فرض فرم‌ها، نه داده‌های نمونه. */
export const getCurrentJalaliDate = (): string => toPersianDigits(todayJalali());

export const addDaysToJalaliDate = (date: string, days: number): string => {
  return toPersianDigits(addJalaliDays(date, days) || todayJalali());
};

export const formatJalaliFallback = (value?: string): string =>
  value ? toPersianDigits(value) : '—';

/** ساعت جاری به‌صورت «۰۹:۳۰» برای ثبت رویدادها. */
export const getCurrentTimeString = (): string =>
  new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });

const toLatinDigits = (value: string) => value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * شماره پرونده بعدی با سال جاری شمسی و رقم فارسی، مثل «ج-۱۴۰۵-۰۴۲».
 * شماره بعد از بزرگ‌ترین شماره موجود همان پیشوند و همان سال است (حذف یک پرونده باعث تکرار شماره نمی‌شود).
 */
export const nextRecordNumber = (prefix: string, existing: Array<string | undefined>): string => {
  const year = todayJalali().slice(0, 4);
  const pattern = new RegExp(`${prefix}-${year}-(\\d+)\\s*$`);
  const max = existing.reduce((acc, value) => {
    const match = toLatinDigits(String(value || '')).match(pattern);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return toPersianDigits(`${prefix}-${year}-${String(max + 1).padStart(3, '0')}`);
};
