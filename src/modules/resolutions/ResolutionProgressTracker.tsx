import React from 'react';
import { Check, FileCheck2, PenTool, Send, ShieldCheck, UserCog, Flag } from 'lucide-react';
import type { Resolution } from '../../types';
import { toPersianDigits } from '../../utils/formatters';

/**
 * خط زمانی گردش یک مصوبه: مراحل طی‌شده، مرحله فعلی، مسئول اقدام بعدی و
 * آخرین تصمیم؛ همه از فیلدهای واقعی همان مصوبه محاسبه می‌شوند.
 */
const STAGES = [
  { key: 'register', label: 'ثبت مصوبه', icon: FileCheck2 },
  { key: 'sign', label: 'امضا', icon: PenTool },
  { key: 'notice', label: 'ابلاغ', icon: Send },
  { key: 'execute', label: 'اقدام مجری', icon: UserCog },
  { key: 'verify', label: 'صحه‌گذاری', icon: ShieldCheck },
  { key: 'close', label: 'خاتمه', icon: Flag },
] as const;

const stageIndexOf = (status: Resolution['executionStatus']): number => {
  if (['PENDING_OFFICE_SIGNATURE', 'PENDING_CEO_SIGNATURE', 'PENDING_ADMIN_SIGNATURE', 'PENDING_SIGNATURES', 'WAITING_MINUTES_SIGNATURE'].includes(status)) return 1;
  if (['WAITING_NOTIFICATION', 'PENDING_SECRETARY_NOTICE_SIGNATURE'].includes(status)) return 2;
  if (['NOTIFIED', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'DONE_BY_ASSIGNEE', 'REJECTED_RETURNED', 'OVERDUE', 'NOT_STARTED'].includes(status)) return 3;
  if (status === 'PENDING_APPROVAL') return 4;
  if (status === 'APPROVED_CLOSED' || status === 'ARCHIVED') return 5;
  return 0;
};

const nextResponsible = (r: Resolution): string => {
  const sig = r.signatureWorkflow && r.signatureWorkflow.status !== 'COMPLETED' ? r.signatureWorkflow.steps[r.signatureWorkflow.currentStepIndex] : undefined;
  const pendingSigners = r.signatureWorkflow?.steps.filter((step) => step.status === 'PENDING') || [];
  switch (r.executionStatus) {
    case 'PENDING_OFFICE_SIGNATURE':
    case 'PENDING_CEO_SIGNATURE':
    case 'PENDING_ADMIN_SIGNATURE':
      return sig ? `${sig.signerName} — امضای مرحله ${toPersianDigits(sig.order)}` : 'امضاکننده مرحله جاری';
    case 'PENDING_SIGNATURES':
      return pendingSigners.length > 1
        ? `امضای همزمان: ${pendingSigners.map((step) => step.signerName).join('، ')}`
        : sig ? `${sig.signerName} — امضای مرحله ${toPersianDigits(sig.order)}` : 'امضاکنندگان تعیین‌شده';
    case 'WAITING_NOTIFICATION':
      return 'مسئول دفتر — ثبت ابلاغ';
    case 'PENDING_SECRETARY_NOTICE_SIGNATURE':
      return 'دبیر جلسه — امضای ابلاغیه';
    case 'PENDING_APPROVAL': {
      const step = r.verificationConfig.steps[r.verificationConfig.currentStepIndex];
      return step ? `${step.approverName} — صحه‌گذاری` : 'صحه‌گذار';
    }
    case 'APPROVED_CLOSED':
    case 'ARCHIVED':
      return 'اقدامی باقی نمانده است';
    case 'NOT_STARTED':
      return r.approvalStatus === 'APPROVED' ? `${r.mainResponsibleName || 'مجری'} — شروع اجرا` : 'بدون اقدام (مصوب نشده)';
    default:
      return `${r.mainResponsibleName || 'مجری'} — گزارش پیشرفت یا اعلام اتمام`;
  }
};

export const ResolutionProgressTracker: React.FC<{ resolution: Resolution }> = ({ resolution: r }) => {
  const current = stageIndexOf(r.executionStatus);
  const isClosed = current === 5;
  const late = r.executionStatus === 'OVERDUE';
  const lastDecision = r.verificationConfig.steps.filter((s) => s.comments).slice(-1)[0]?.comments || r.lastAction || r.reviewResultNotes;
  const stageDate = [r.createdAt ? new Date(r.createdAt).toLocaleDateString('fa-IR-u-ca-persian') : '', r.signatureWorkflow?.steps.slice(-1)[0]?.signedDateJalali, r.notifiedDateJalali, r.executionStartDateJalali || r.assignedDateJalali, r.completionDateJalali, r.verificationConfig.steps.slice(-1)[0]?.actionDateJalali];

  return (
    <section className="rpt">
      <ol className="rpt-steps" aria-label="مراحل گردش مصوبه">
        {STAGES.map((stage, index) => {
          const Icon = stage.icon;
          const done = index < current || (isClosed && index === 5);
          const active = index === current && !isClosed;
          return (
            <li key={stage.key} className={`rpt-step ${done ? 'rpt-done' : ''} ${active ? (late ? 'rpt-late' : 'rpt-active') : ''}`} aria-current={active ? 'step' : undefined}>
              <span className="rpt-dot">{done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}</span>
              <span className="rpt-label">{stage.label}</span>
              {done && stageDate[index] && <span className="rpt-date">{toPersianDigits(stageDate[index])}</span>}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-blue-100"><span className="block text-[10px] font-bold text-slate-500">مسئول اقدام بعدی</span><strong className={`text-[12px] ${late ? 'text-red-700' : 'text-slate-900'}`}>{nextResponsible(r)}</strong></div>
        <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-blue-100"><span className="block text-[10px] font-bold text-slate-500">آخرین تصمیم / اقدام</span><span className="line-clamp-2 text-[12px] text-slate-700">{lastDecision || '—'}</span></div>
      </div>
    </section>
  );
};
