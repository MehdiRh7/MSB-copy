import React, { useState } from 'react';
import { CheckCircle2, Clock3, GitBranch, RotateCcw, ShieldCheck, UserCheck } from 'lucide-react';
import { ApprovalDecision, ApprovalPolicy, Meeting, User } from '../../types';
import {
  APPROVAL_MODE_LABELS,
  evaluateApproval,
  namesOf,
  resolveApprovalAuthority,
  SIGNATURE_MODE_LABELS,
} from '../../services/workflowPolicyService';
import { toPersianDigits } from '../../utils/formatters';

/** نوار وضعیت تأییدکنندگان یک مرحله (چه کسی تأیید کرده، نوبت کیست). */
export const ApprovalProgress: React.FC<{ policy: ApprovalPolicy; decisions?: ApprovalDecision[] }> = ({ policy, decisions = [] }) => {
  const evaluation = evaluateApproval(policy, decisions);
  const names = namesOf(policy.approverUserIds);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600">
        <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200">{APPROVAL_MODE_LABELS[policy.mode]}</span>
        <span>پیشرفت: {toPersianDigits(evaluation.approvedCount)} از {toPersianDigits(evaluation.requiredCount)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {policy.approverUserIds.map((id, index) => {
          const approved = evaluation.approvedIds.includes(id);
          const isTurn = evaluation.currentTurnId === id;
          const decision = decisions.filter((item) => (item.onBehalfOfUserId || item.userId) === id).slice(-1)[0];
          return (
            <span
              key={id}
              title={decision ? `${decision.decision === 'APPROVED' ? 'تأیید' : 'برگشت'} — ${decision.dateJalali} ${decision.timeString}${decision.notes ? ` — ${decision.notes}` : ''}` : undefined}
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${approved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isTurn ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-100' : 'bg-white text-slate-500 border-slate-200'}`}
            >
              {policy.mode === 'SEQUENTIAL' && <span className="opacity-70">{toPersianDigits(index + 1)}.</span>}
              {approved ? <CheckCircle2 className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
              {names[index]}
              {decision?.onBehalfOfUserId && <span className="opacity-70">(توسط {decision.userName})</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** پنل تأیید پویای دستورکار — جایگزین پنل ثابت «تأیید مدیرعامل». */
export const AgendaApprovalPanel: React.FC<{
  meeting: Meeting;
  policy: ApprovalPolicy;
  currentUser: User;
  onDecide: (decision: 'APPROVE' | 'RETURN', notes: string) => Promise<void>;
}> = ({ meeting, policy, currentUser, onDecide }) => {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const authority = resolveApprovalAuthority(policy, meeting.agendaDecisions || [], currentUser, meeting.workflow ? undefined : (user) => user.role === 'CEO');
  const decide = async (decision: 'APPROVE' | 'RETURN') => {
    setBusy(true);
    try { await onDecide(decision, notes); setNotes(''); } finally { setBusy(false); }
  };
  return (
    <div className="no-print bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-extrabold text-amber-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />بررسی و تأیید دستورکار</div>
        {meeting.workflow?.templateName && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800">گردش: {meeting.workflow.templateName}</span>}
      </div>
      <ApprovalProgress policy={policy} decisions={meeting.agendaDecisions} />
      {authority.allowed ? (
        <>
          {authority.onBehalfOf && <p className="text-[10px] font-bold text-indigo-700">شما به‌عنوان مدیر سیستم به نمایندگی از {namesOf([authority.approverUserId!])[0]} اقدام می‌کنید.</p>}
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="توضیحات تأیید یا دلیل بازگشت" className="w-full text-xs p-3 bg-white border border-amber-200 rounded-xl" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => decide('APPROVE')} className="bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />تأیید دستورکار</button>
            <button disabled={busy} onClick={() => decide('RETURN')} className="bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />بازگشت به دبیرخانه</button>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-amber-800">{authority.reason}</p>
      )}
    </div>
  );
};

/** خلاصه گردش کار اختصاصی جلسه برای نمایش در صفحه جلسه. */
export const MeetingWorkflowSummary: React.FC<{ meeting: Meeting }> = ({ meeting }) => {
  const wf = meeting.workflow;
  if (!wf) return null;
  const rows = [
    { label: 'تأیید دستورکار', value: `${APPROVAL_MODE_LABELS[wf.agendaApproval.mode]} — ${namesOf(wf.agendaApproval.approverUserIds).join('، ')}` },
    { label: 'تأیید صورت‌جلسه', value: wf.minutesApproval ? `${APPROVAL_MODE_LABELS[wf.minutesApproval.mode]} — ${namesOf(wf.minutesApproval.approverUserIds).join('، ')}` : 'بدون تأیید اضافه' },
    { label: 'امضای مصوبات', value: wf.resolutionSignature ? `${SIGNATURE_MODE_LABELS[wf.resolutionSignature.mode]} — ${namesOf(wf.resolutionSignature.signerUserIds).join(' ← ')}` : 'تنظیمات سراسری امضا' },
    { label: 'امضای ابلاغیه', value: wf.noticeSignerUserId ? namesOf([wf.noticeSignerUserId])[0] : 'تنظیم سراسری' },
  ];
  return (
    <details className="no-print rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs">
      <summary className="cursor-pointer font-extrabold text-indigo-950 flex items-center gap-1.5"><GitBranch className="w-4 h-4" />گردش کار این جلسه{wf.templateName ? ` — ${wf.templateName}` : ''}</summary>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {rows.map((row) => (
          <div key={row.label} className="bg-white rounded-xl border border-indigo-100 p-2.5">
            <span className="block text-[10px] text-slate-400">{row.label}</span>
            <span className="block text-[11px] font-bold text-slate-800 mt-0.5">{row.value}</span>
          </div>
        ))}
      </div>
    </details>
  );
};
