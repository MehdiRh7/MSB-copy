/**
 * «هشدار پیشگیرانه» — پیش از آنکه مهلت بگذرد، مصوبه‌هایی که امتیاز ریسک
 * تأخیرشان بالا رفته (≥ ۶۰) به مسئول اجرا و پیگیری‌کنندگان هشدار داده
 * می‌شوند. روزی یک بار برای هر مصوبه، بدون تکرار.
 */
import { AppNotification, Resolution, User } from '../types';
import { mockResolutions } from '../mock/data';
import { loadLocalCollection } from './localStore';
import { computeResolutionRisk } from './ai/aiService';
import { isAiFeatureEnabled } from './ai/aiSettings';
import { todayJalali } from '../utils/jalaliDate';

export const RISK_ALERT_THRESHOLD = 60;

const ACTIVE = (r: Resolution) => r.approvalStatus === 'APPROVED' && !['APPROVED_CLOSED', 'ARCHIVED'].includes(r.executionStatus) && !r.archive;

/** آیا این کاربر باید هشدار ریسک این مصوبه را بگیرد؟ */
const isRecipient = (resolution: Resolution, user: User) =>
  resolution.mainResponsibleUserId === user.id ||
  (user.role !== 'ADMIN' && (user.permissions || []).includes('VIEW_RESOLUTION_FOLLOWUP')) ||
  (user.role === 'CEO' && ['HIGH', 'URGENT', 'CRITICAL'].includes(resolution.priority));

export const buildProactiveRiskAlerts = (user: User, existing: AppNotification[]): AppNotification[] => {
  if (!isAiFeatureEnabled('proactiveAlerts')) return [];
  const today = todayJalali();
  const ids = new Set(existing.map((n) => n.id));
  const time = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return loadLocalCollection<Resolution[]>('resolutions', mockResolutions)
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
