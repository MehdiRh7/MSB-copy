const STORAGE_PREFIX = 'postbank-mosavabat-v1:';

export type LocalCollectionKey =
  | 'users'
  | 'meetings'
  | 'resolutions'
  | 'tasks'
  | 'approvals'
  | 'activityLogs'
  | 'notifications'
  | 'boardMinutes'
  | 'resolutionNotices'
  | 'resolutionFollowUps'
  | 'governanceAudit'
  | 'outcomeLetters';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const loadLocalCollection = <T,>(key: LocalCollectionKey, fallback: T): T => {
  if (typeof window === 'undefined') return clone(fallback);
  try {
    const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return saved ? (JSON.parse(saved) as T) : clone(fallback);
  } catch {
    return clone(fallback);
  }
};

/** رویداد تغییر داده در همین تب (رویداد storage فقط به تب‌های دیگر می‌رسد). */
// با تأخیر صفر ارسال می‌شود تا هرگز وسط رندر/Updater ری‌اکت اجرا نشود.
const emitChange = (key: string) => {
  try { window.setTimeout(() => window.dispatchEvent(new CustomEvent('msb-data-changed', { detail: { key } })), 0); } catch { /* ignore */ }
};

export const saveLocalCollection = <T,>(key: LocalCollectionKey, value: T): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  emitChange(key);
};

export const loadLocalValue = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return saved === null ? fallback : (JSON.parse(saved) as T);
  } catch {
    return fallback;
  }
};

export const saveLocalValue = <T,>(key: string, value: T): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  emitChange(key);
};
