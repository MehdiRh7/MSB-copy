import { 
  PriorityLevel, 
  ResolutionApprovalStatus, 
  ResolutionExecutionStatus, 
  MeetingStatus, 
  MeetingType 
} from '../types';

/**
 * Converts English digits to Persian digits
 */
export function toPersianDigits(n: number | string | undefined | null): string {
  if (n === undefined || n === null) return '';
  const str = String(n);
  const persianMap = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/[0-9]/g, (char) => persianMap[parseInt(char, 10)]);
}

/**
 * Formats file size in KB or MB in Persian
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

/**
 * Priority label and styling helpers
 */
export function getPriorityMeta(priority: PriorityLevel): { label: string; bg: string; text: string; border: string } {
  switch (priority) {
    case 'CRITICAL':
    case 'URGENT':
      return { label: 'بسیار فوری و حیاتی', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'HIGH':
      return { label: 'مهم / با اولویت', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    case 'MEDIUM':
      return { label: 'متوسط', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'LOW':
    default:
      return { label: 'عادی', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
  }
}

/**
 * Meeting Type Persian Label
 */
export function getMeetingTypeLabel(type: MeetingType): string {
  switch (type) {
    case 'BOARD_OF_DIRECTORS':
      return 'هیئت مدیره';
    case 'MANAGEMENT_COUNCIL':
      return 'شورای معاونین و مدیران';
    case 'TECHNICAL_COMMITTEE':
      return 'کمیته تخصصی فناوری و امنیت';
    case 'PROJECT_STEERING':
      return 'کارگروه راهبری پروژه';
    case 'CRISIS_MANAGEMENT':
      return 'کمیته مدیریت بحران';
    case 'EXTRAORDINARY':
      return 'جلسه فوق‌العاده';
    default:
      return 'جلسه سازمانی';
  }
}

/**
 * Meeting status styling helpers
 */
export function getMeetingStatusMeta(status: MeetingStatus): { label: string; bg: string; text: string; dot: string } {
  switch (status) {
    case 'AGENDA_PREPARATION':
      return { label: 'در حال تهیه دستورکار', bg: 'bg-slate-50 text-slate-700 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500' };
    case 'WAITING_FOR_CEO_APPROVAL':
      return { label: 'در انتظار تأیید دستورکار', bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' };
    case 'AGENDA_RETURNED':
      return { label: 'دستورکار برگشتی به دبیرخانه', bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' };
    case 'READY_FOR_INVITATION':
      return { label: 'آماده ارسال دعوتنامه', bg: 'bg-violet-50 text-violet-700 border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500' };
    case 'INVITATION_SENT':
      return { label: 'دعوتنامه ارسال شده', bg: 'bg-cyan-50 text-cyan-700 border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' };
    case 'HELD':
      return { label: 'برگزار شده و نهایی', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'IN_PROGRESS':
      return { label: 'در حال برگزاری', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500 animate-pulse' };
    case 'SCHEDULED':
      return { label: 'برنامه‌ریزی شده', bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500' };
    case 'DRAFT':
      return { label: 'پیش‌نویس دستور کار', bg: 'bg-slate-50 text-slate-600 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' };
    case 'CANCELLED':
      return { label: 'لغو شده', bg: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-700', dot: 'bg-red-500' };
  }
}

/**
 * Resolution Approval Status styling
 */
export function getResolutionApprovalMeta(status: ResolutionApprovalStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'APPROVED':
      return { label: 'مصوب و ابلاغ شده', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700' };
    case 'CONDITIONAL_APPROVED':
      return { label: 'مصوب مشروط', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700' };
    case 'REFERRED_FOR_REVIEW':
      return { label: 'ارجاع جهت اصلاح', bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700' };
    case 'REJECTED':
      return { label: 'رد شده / عدم تصویب', bg: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-700' };
    case 'NEEDS_REVIEW':
      return { label: 'نیازمند بررسی تکمیلی', bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700' };
    case 'NOT_APPROVED':
    default:
      return { label: 'تصویب نشده', bg: 'bg-slate-100 text-slate-600 border-slate-200', text: 'text-slate-600' };
  }
}

/**
 * Resolution Execution Workflow Status styling
 */
export function getResolutionExecutionMeta(status: ResolutionExecutionStatus): { label: string; bg: string; text: string; dot: string } {
  switch (status) {
    case 'PENDING_OFFICE_SIGNATURE':
      return { label: 'در انتظار امضای مسئول دفتر', bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' };
    case 'PENDING_CEO_SIGNATURE':
      return { label: 'در انتظار امضای مدیرعامل', bg: 'bg-violet-50 text-violet-700 border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500' };
    case 'PENDING_ADMIN_SIGNATURE':
      return { label: 'در انتظار امضای ادمین', bg: 'bg-cyan-50 text-cyan-700 border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' };
    case 'PENDING_SIGNATURES':
      return { label: 'در انتظار امضا (گردش اختصاصی)', bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' };
    case 'WAITING_MINUTES_SIGNATURE':
      return { label: 'در انتظار امضای صورت‌جلسه تجمیعی', bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' };
    case 'WAITING_NOTIFICATION':
      return { label: 'در انتظار ابلاغ رسمی', bg: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500' };
    case 'PENDING_SECRETARY_NOTICE_SIGNATURE':
      return { label: 'در انتظار امضای دبیر جلسه', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' };
    case 'NOTIFIED':
      return { label: 'ابلاغ شده', bg: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-700', dot: 'bg-teal-500' };
    case 'APPROVED_CLOSED':
      return { label: 'مختومه', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'PENDING_APPROVAL':
      return { label: 'در انتظار صحه‌گذاری', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' };
    case 'IN_PROGRESS':
      return { label: 'در حال انجام توسط مجری', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' };
    case 'WAITING_RESPONSE':
      return { label: 'در انتظار پاسخ', bg: 'bg-cyan-50 text-cyan-700 border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' };
    case 'NEEDS_FOLLOW_UP':
      return { label: 'نیازمند پیگیری', bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' };
    case 'DONE_BY_ASSIGNEE':
      return { label: 'اتمام توسط مجری', bg: 'bg-blue-50 text-blue-800 border-blue-200', text: 'text-blue-800', dot: 'bg-blue-500' };
    case 'OVERDUE':
      return { label: 'عقب‌افتاده از موعد', bg: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-700', dot: 'bg-red-500' };
    case 'REJECTED_RETURNED':
      return { label: 'برگشتی از صحه‌گذاری', bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' };
    case 'ARCHIVED':
      return { label: 'بایگانی‌شده', bg: 'bg-slate-100 text-slate-700 border-slate-300', text: 'text-slate-700', dot: 'bg-slate-500' };
    case 'NOT_STARTED':
    default:
      return { label: 'شروع نشده', bg: 'bg-slate-100 text-slate-600 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' };
  }
}

/**
 * Verification Step status meta
 */
export function getVerificationStepStatusMeta(status: 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED'): { label: string; bg: string } {
  switch (status) {
    case 'APPROVED':
      return { label: 'تایید و صحه‌گذاری شد', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'REJECTED':
      return { label: 'عدم تایید / بازگشت داده شد', bg: 'bg-red-50 text-red-700 border-red-200' };
    case 'PENDING':
      return { label: 'در نوبت بررسی', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    case 'NOT_STARTED':
    default:
      return { label: 'در انتظار نوبت', bg: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

/**
 * Task Status styling
 */
export function getTaskStatusMeta(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case 'NEW':
      return { label: 'جدید', bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700' };
    case 'IN_PROGRESS':
      return { label: 'در حال انجام', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700' };
    case 'WAITING_RESPONSE':
      return { label: 'در انتظار پاسخ', bg: 'bg-cyan-50 text-cyan-700 border-cyan-200', text: 'text-cyan-700' };
    case 'NEEDS_FOLLOW_UP':
      return { label: 'نیازمند پیگیری', bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700' };
    case 'COMPLETED':
      return { label: 'انجام شده', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700' };
    case 'PENDING_APPROVAL':
      return { label: 'منتظر تأیید', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200', text: 'text-yellow-700' };
    case 'CLOSED':
      return { label: 'خاتمه یافته', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700' };
    case 'RETURNED':
      return { label: 'برگشت داده شده', bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700' };
    case 'OVERDUE':
      return { label: 'عقب‌افتاده', bg: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-700' };
    default:
      return { label: status, bg: 'bg-slate-50 text-slate-600 border-slate-200', text: 'text-slate-600' };
  }
}
