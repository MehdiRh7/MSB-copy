import React, { useMemo, useState } from 'react';
import { ArrowLeft, GripVertical, Layers, Mail, PenTool, Play, Search, Send, Trash2, Users } from 'lucide-react';
import { ApprovalMode, ApprovalPolicy, MeetingWorkflowConfig, SignatureChainMode, User } from '../../types';
import { APPROVAL_MODE_LABELS, SIGNATURE_MODE_LABELS } from '../../services/workflowPolicyService';
import { toPersianDigits } from '../../utils/formatters';

type StageId = 'agenda' | 'minutes' | 'signature' | 'notice';
interface DragPayload { userId: string; from?: StageId }

const APPROVAL_CYCLE: ApprovalMode[] = ['ANY', 'ALL', 'SEQUENTIAL'];
const SIGNATURE_CYCLE: SignatureChainMode[] = ['SEQUENTIAL', 'PARALLEL'];

const readPayload = (event: React.DragEvent): DragPayload | null => {
  try { return JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return null; }
};

/**
 * «طراح گرافیکی گردش کار» — مراحل جلسه به‌صورت یک نقشه جریان نمایش داده
 * می‌شوند؛ افراد را از فهرست سمت راست روی هر مرحله بکشید، داخل مرحله
 * جابه‌جا کنید (ترتیب) یا روی سطل زباله بیندازید. منطق همان سیاست‌های
 * فرم است؛ فقط شیوه ویرایش گرافیکی است.
 */
export const WorkflowDesigner: React.FC<{
  users: User[];
  value: MeetingWorkflowConfig;
  onChange: (value: MeetingWorkflowConfig) => void;
}> = ({ users, value, onChange }) => {
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const active = users.filter((u) => u.isActive !== false);
  const filtered = useMemo(() => active.filter((u) => !query.trim() || u.fullName.includes(query) || u.title.includes(query)), [active, query]);
  const nameOf = (id: string) => users.find((u) => u.id === id);

  const idsOf = (stage: StageId): string[] => {
    if (stage === 'agenda') return value.agendaApproval.approverUserIds;
    if (stage === 'minutes') return value.minutesApproval?.approverUserIds || [];
    if (stage === 'signature') return value.resolutionSignature?.signerUserIds || [];
    return value.noticeSignerUserId ? [value.noticeSignerUserId] : [];
  };

  const withIds = (base: MeetingWorkflowConfig, stage: StageId, ids: string[]): MeetingWorkflowConfig => {
    if (stage === 'agenda') return { ...base, agendaApproval: { ...base.agendaApproval, approverUserIds: ids } };
    if (stage === 'minutes') return { ...base, minutesApproval: ids.length ? { mode: base.minutesApproval?.mode || 'ALL', approverUserIds: ids } : undefined };
    if (stage === 'signature') return { ...base, resolutionSignature: ids.length ? { mode: base.resolutionSignature?.mode || 'SEQUENTIAL', signerUserIds: ids } : undefined };
    return { ...base, noticeSignerUserId: ids[ids.length - 1] };
  };

  /** افزودن/جابه‌جایی فرد؛ اگر beforeId داده شود، قبل از آن فرد درج می‌شود. */
  const drop = (stage: StageId, payload: DragPayload | null, beforeId?: string) => {
    setHover(null);
    if (!payload?.userId) return;
    let next = value;
    if (payload.from && payload.from !== stage) next = withIds(next, payload.from, idsOf(payload.from).filter((id) => id !== payload.userId));
    const current = (payload.from === stage ? idsOf(stage) : idsOf(stage)).filter((id) => id !== payload.userId);
    if (stage === 'notice') { onChange(withIds(next, stage, [payload.userId])); return; }
    const index = beforeId ? current.indexOf(beforeId) : -1;
    const ids = index >= 0 ? [...current.slice(0, index), payload.userId, ...current.slice(index)] : [...current, payload.userId];
    onChange(withIds(next, stage, ids));
  };

  const removeFrom = (payload: DragPayload | null) => {
    setHover(null);
    if (!payload?.from) return;
    onChange(withIds(value, payload.from, idsOf(payload.from).filter((id) => id !== payload.userId)));
  };

  const cycleMode = (stage: StageId) => {
    if (stage === 'agenda' || stage === 'minutes') {
      const policy = stage === 'agenda' ? value.agendaApproval : value.minutesApproval;
      if (!policy) return;
      const mode = APPROVAL_CYCLE[(APPROVAL_CYCLE.indexOf(policy.mode) + 1) % APPROVAL_CYCLE.length];
      const updated: ApprovalPolicy = { ...policy, mode };
      onChange(stage === 'agenda' ? { ...value, agendaApproval: updated } : { ...value, minutesApproval: updated });
    } else if (stage === 'signature' && value.resolutionSignature) {
      const mode = SIGNATURE_CYCLE[(SIGNATURE_CYCLE.indexOf(value.resolutionSignature.mode) + 1) % SIGNATURE_CYCLE.length];
      onChange({ ...value, resolutionSignature: { ...value.resolutionSignature, mode } });
    }
  };

  const stages: { id: StageId; title: string; icon: React.ElementType; color: string; empty: string; mode?: string; ordered: boolean }[] = [
    { id: 'agenda', title: 'تأیید دستورکار', icon: Layers, color: 'from-amber-500 to-orange-500', empty: 'حداقل یک نفر را اینجا بکشید', mode: APPROVAL_MODE_LABELS[value.agendaApproval.mode], ordered: value.agendaApproval.mode === 'SEQUENTIAL' },
    { id: 'minutes', title: 'تأیید صورت‌جلسه', icon: Users, color: 'from-sky-500 to-indigo-500', empty: 'بدون تأیید — برای فعال‌سازی فرد بکشید', mode: value.minutesApproval ? APPROVAL_MODE_LABELS[value.minutesApproval.mode] : undefined, ordered: value.minutesApproval?.mode === 'SEQUENTIAL' },
    { id: 'signature', title: 'امضای مصوبات', icon: PenTool, color: 'from-emerald-500 to-teal-600', empty: 'سه امضای سراسری — برای اختصاصی‌کردن فرد بکشید', mode: value.resolutionSignature ? SIGNATURE_MODE_LABELS[value.resolutionSignature.mode] : undefined, ordered: value.resolutionSignature?.mode === 'SEQUENTIAL' },
    { id: 'notice', title: 'امضای ابلاغیه', icon: Send, color: 'from-fuchsia-500 to-purple-600', empty: 'تنظیم سراسری — یک نفر را بکشید', ordered: false },
  ];

  const Pill: React.FC<{ id: string; stage?: StageId; index?: number; ordered?: boolean }> = ({ id, stage, index, ordered }) => {
    const user = nameOf(id);
    return (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ userId: id, from: stage })); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => { if (stage) { e.preventDefault(); e.stopPropagation(); setHover(`${stage}:${id}`); } }}
        onDrop={(e) => { if (stage) { e.preventDefault(); e.stopPropagation(); drop(stage, readPayload(e), id); } }}
        className={`group flex items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 shadow-xs cursor-grab active:cursor-grabbing select-none ${hover === `${stage}:${id}` ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}
        title="بکشید و رها کنید"
      >
        <GripVertical className="w-3 h-3 text-slate-300 shrink-0" />
        {ordered && index !== undefined && <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">{toPersianDigits(index + 1)}</span>}
        <span className="min-w-0">
          <span className="block text-[11px] font-bold text-slate-800 truncate">{user?.fullName || id}</span>
          <span className="block text-[9px] text-slate-500 truncate">{user?.title}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-3" dir="rtl">
      {/* فهرست افراد */}
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] font-extrabold text-slate-700">افراد سازمان — بکشید و روی مرحله رها کنید</div>
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو..." className="w-full text-[11px] p-1.5 pr-6 bg-white border border-slate-200 rounded-lg" />
            <Search className="w-3 h-3 text-slate-400 absolute right-2 top-2.5" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {filtered.map((user) => <Pill key={user.id} id={user.id} />)}
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setHover('trash'); }}
          onDragLeave={() => setHover(null)}
          onDrop={(e) => { e.preventDefault(); removeFrom(readPayload(e)); }}
          className={`flex items-center justify-center gap-1 rounded-xl border-2 border-dashed p-2 text-[10px] font-bold ${hover === 'trash' ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-slate-300 text-slate-400'}`}
        >
          <Trash2 className="w-3.5 h-3.5" />برای حذف اینجا رها کنید
        </div>
      </aside>

      {/* نقشه جریان */}
      <div className="overflow-x-auto">
        <div className="flex items-stretch gap-2 min-w-[700px]">
          <div className="flex flex-col items-center justify-center gap-1 px-1 text-slate-400">
            <span className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center"><Play className="w-4 h-4" /></span>
            <span className="text-[9px] font-bold">ایجاد جلسه</span>
          </div>
          {stages.map((stage, i) => {
            const ids = idsOf(stage.id);
            const Icon = stage.icon;
            return (
              <React.Fragment key={stage.id}>
                <div className="flex items-center text-slate-300"><ArrowLeft className="w-4 h-4" /></div>
                {i === 1 && (
                  <>
                    <div className="flex flex-col items-center justify-center gap-1 px-1 text-slate-400 w-16 text-center">
                      <span className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center"><Mail className="w-4 h-4" /></span>
                      <span className="text-[9px] font-bold leading-3">دعوتنامه خودکار و برگزاری</span>
                    </div>
                    <div className="flex items-center text-slate-300"><ArrowLeft className="w-4 h-4" /></div>
                  </>
                )}
                <div
                  onDragOver={(e) => { e.preventDefault(); setHover(stage.id); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null); }}
                  onDrop={(e) => { e.preventDefault(); drop(stage.id, readPayload(e)); }}
                  className={`flex-1 min-w-[112px] rounded-2xl border-2 bg-white overflow-hidden transition ${hover === stage.id ? 'border-indigo-400 shadow-lg shadow-indigo-100 scale-[1.01]' : ids.length ? 'border-slate-200' : 'border-dashed border-slate-300'}`}
                >
                  <div className={`bg-gradient-to-l ${stage.color} text-white px-2.5 py-2 flex items-center gap-1.5`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px] font-extrabold">{stage.title}</span>
                  </div>
                  <div className="p-2 space-y-1.5 min-h-[120px]">
                    {stage.mode && ids.length > 1 && (
                      <button type="button" onClick={() => cycleMode(stage.id)} className="w-full text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100" title="کلیک برای تغییر منطق">
                        {stage.mode} ⟳
                      </button>
                    )}
                    {ids.length === 0
                      ? <p className="text-[10px] text-slate-400 text-center pt-6 leading-4">{stage.empty}</p>
                      : ids.map((id, index) => <Pill key={id} id={id} stage={stage.id} index={index} ordered={stage.ordered} />)}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div className="flex items-center text-slate-300"><ArrowLeft className="w-4 h-4" /></div>
          <div className="flex flex-col items-center justify-center gap-1 px-1 text-slate-400">
            <span className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">✓</span>
            <span className="text-[9px] font-bold">اجرای مصوبه</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">افراد را بکشید و روی مراحل رها کنید؛ برای تغییر ترتیب، روی فرد دیگر همان مرحله رها کنید. روی منطق هر مرحله کلیک کنید تا بین «یک نفر کافی / همه / به ترتیب» تغییر کند.</p>
      </div>
    </div>
  );
};
