/**
 * «هشدار پیشگیرانه» — پیش از آنکه مهلت بگذرد، مصوبه‌هایی که امتیاز ریسک
 * تأخیرشان بالا رفته (≥ ۶۰) به مسئول اجرا و پیگیری‌کنندگان هشدار داده
 * می‌شوند. روزی یک بار برای هر مصوبه، بدون تکرار.
 */
import { AppNotification, Resolution, User } from '../types';
import { mockResolutions } from '../mock/data';
import { loadLocalCollection, loadLocalValue, saveLocalValue } from './localStore';
import { computeResolutionRisk } from './ai/aiService';
import { isAiFeatureEnabled } from './ai/aiSettings';
import { todayJalali } from '../utils/jalaliDate';

export const RISK_ALERT_THRESHOLD = 60;
const LEDGER_KEY = 'riskAlertLedger';

const ACTIVE = (r: Resolution) => r.approvalStatus === 'APPROVED' && !['APPROVED_CLOSED', 'ARCHIVED'].includes(r.executionStatus) && !r.archive;

/** آیا این کاربر باید هشدار ریسک این مصوبه را بگیرد؟ */
const isRecipient = (resolution: Resolution, user: User) =>
  resolution.mainResponsibleUserId === user.id ||
  (user.role !== 'ADMIN' && (user.permissions || []).includes('VIEW_RESOLUTION_FOLLOWUP')) ||
  ((user.role === 'CEO' || user.role === 'ADMIN') && ['HIGH', 'URGENT', 'CRITICAL'].includes(resolution.priority));

export const buildProactiveRiskAlerts = (user: User, existing: AppNotification[]): AppNotification[] => {
  if (!isAiFeatureEnabled('proactiveAlerts')) return [];
  const today = todayJalali();
  // دفترچه هشدارهای صادرشده: اگر کاربر اعلان‌ها را پاک کند، همان هشدارِ همان روز دوباره ساخته نمی‌شود.
  const ledger = loadLocalValue<Record<string, string>>(LEDGER_KEY, {});
  const ids = new Set([...existing.map((n) => n.id), ...Object.keys(ledger)]);
  const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const fresh = loadLocalCollection<Resolution[]>('resolutions', mockResolutions)
    .filter((r) => ACTIVE(r) && isRecipient(r, user))
    .map((r) => ({ r, risk: computeResolutionRisk(r) }))
    .filter(({ risk }) => risk.score >= RISK_ALERT_THRESHOLD)
    .map(({ r, risk }) => ({
      id: `risk-${r.id}-${user.id}-${today}`,
      recipientUserId: user.id,
      title: `هشدار ریسک تأخیر (${risk.score.toLocaleString('fa-IR')}٪)`,
      message: `${r.resolutionNumber} — ${r.topicTitle}: ${risk.factors.slice(0, 2).join('؛ ')}`,
      dateJalali: today,
      timeString: time,
      isRead: false,
      type: 'RISK_ALERT' as const,
      targetRoute: 'resolutions',
      targetResolutionId: r.id,
    }))
    .filter((n) => !ids.has(n.id));
  if (fresh.length) {
    // فقط سوابق امروز نگه داشته می‌شود تا دفترچه بزرگ نشود.
    const kept = Object.fromEntries(Object.entries(ledger).filter(([, day]) => day === today));
    fresh.forEach((n) => { kept[n.id] = today; });
    saveLocalValue(LEDGER_KEY, kept);
  }
  return fresh;
};

/** اعلان دسکتاپ مرورگر (در صورت اجازه کاربر). */
export const showDesktopNotification = (title: string, body: string) => {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    new Notification(title, { body, dir: 'rtl', lang: 'fa', icon: '/POSTBANK_PM_LOGO.png' });
  } catch { /* ignore */ }
};

export const requestDesktopNotifications = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
};
