import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, GitBranch, Layers, PenTool, Search, ShieldCheck, Users, X } from 'lucide-react';
import { ApprovalMode, ApprovalPolicy, MeetingWorkflowConfig, SignatureChainMode, SignatureChainPolicy, User } from '../../types';
import { APPROVAL_MODE_HINTS, APPROVAL_MODE_LABELS, SIGNATURE_MODE_LABELS } from '../../services/workflowPolicyService';
import { toPersianDigits } from '../../utils/formatters';

/** انتخاب‌گر چندنفره با حفظ ترتیب (ترتیب انتخاب = ترتیب گردش). */
const OrderedUserPicker: React.FC<{
  users: User[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  ordered: boolean;
  emptyText: string;
}> = ({ users, selectedIds, onChange, ordered, emptyText }) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => user.isActive !== false && !selectedIds.includes(user.id) && (!q || user.fullName.toLowerCase().includes(q) || user.title.toLowerCase().includes(q)));
  }, [users, selectedIds, query]);
  const move = (index: number, delta: number) => {
    const next = [...selectedIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {selectedIds.length === 0 ? (
        <p className="text-[11px] text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-2.5">{emptyText}</p>
      ) : (
        <ol className="space-y-1.5">
          {selectedIds.map((id, index) => {
            const user = users.find((item) => item.id === id);
            return (
              <li key={id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                {ordered && <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">{toPersianDigits(index + 1)}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold text-slate-800 truncate">{user?.fullName || id}</span>
                  <span className="block text-[9px] text-slate-500 truncate">{user?.title}</span>
                </span>
                {ordered && (
                  <>
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="انتقال به بالا" className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === selectedIds.length - 1} aria-label="انتقال به پایین" className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  </>
                )}
                <button type="button" onClick={() => onChange(selectedIds.filter((item) => item !== id))} aria-label={`حذف ${user?.fullName || ''}`} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50"><X className="w-3.5 h-3.5" /></button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="relative">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="افزودن فرد: جستجوی نام یا سمت..." className="w-full text-[11px] p-2 pr-7 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
      </div>
      {(query || selectedIds.length === 0) && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
          {filtered.slice(0, 12).map((user) => (
            <button key={user.id} type="button" onClick={() => { onChange([...selectedIds, user.id]); setQuery(''); }} className="p-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-right">
              <span className="block text-[11px] font-bold text-slate-800">{user.fullName}</span>
              <span className="block text-[9px] text-slate-500">{user.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ModeChips = <T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((option) => (
      <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition ${value === option.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
        {value === option.value && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
        {option.label}
      </button>
    ))}
  </div>
);

export const ApprovalPolicyEditor: React.FC<{
  title: string;
  description?: string;
  icon?: React.ElementType;
  users: User[];
  value?: ApprovalPolicy;
  onChange: (policy?: ApprovalPolicy) => void;
  optional?: boolean;
  optionalLabel?: string;
}> = ({ title, description, icon: Icon = ShieldCheck, users, value, onChange, optional, optionalLabel }) => {
  const enabled = Boolean(value);
  const policy = value || { approverUserIds: [], mode: 'ANY' as ApprovalMode };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700"><Icon className="w-4 h-4" /></span>
          <div>
            <div className="text-xs font-extrabold text-slate-800">{title}</div>
            {description && <p className="text-[10px] text-slate-500 leading-5">{description}</p>}
          </div>
        </div>
        {optional && (
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer shrink-0">
            <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked ? { approverUserIds: [], mode: 'ALL' } : undefined)} className="accent-indigo-600" />
            {optionalLabel || 'فعال'}
          </label>
        )}
      </div>
      {(enabled || !optional) && (
        <>
          <OrderedUserPicker users={users} selectedIds={policy.approverUserIds} ordered={policy.mode === 'SEQUENTIAL'} onChange={(ids) => onChange({ ...policy, approverUserIds: ids })} emptyText="هنوز تأییدکننده‌ای انتخاب نشده است." />
          {policy.approverUserIds.length > 1 && (
            <div className="space-y-1">
              <ModeChips value={policy.mode} onChange={(mode) => onChange({ ...policy, mode })} options={(Object.keys(APPROVAL_MODE_LABELS) as ApprovalMode[]).map((mode) => ({ value: mode, label: APPROVAL_MODE_LABELS[mode] }))} />
              <p className="text-[10px] text-indigo-700">{APPROVAL_MODE_HINTS[policy.mode]}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const SignatureChainEditor: React.FC<{
  users: User[];
  value?: SignatureChainPolicy;
  onChange: (policy?: SignatureChainPolicy) => void;
  defaultDescription: string;
}> = ({ users, value, onChange, defaultDescription }) => {
  const custom = Boolean(value);
  const policy = value || { signerUserIds: [], mode: 'SEQUENTIAL' as SignatureChainMode };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700"><PenTool className="w-4 h-4" /></span>
        <div>
          <div className="text-xs font-extrabold text-slate-800">امضای مصوبات</div>
          <p className="text-[10px] text-slate-500 leading-5">چه کسانی و با چه ترتیبی صورت‌جلسه مصوبات این گردش را امضا کنند.</p>
        </div>
      </div>
      <ModeChips
        value={custom ? 'CUSTOM' : 'DEFAULT'}
        onChange={(choice) => onChange(choice === 'CUSTOM' ? { signerUserIds: [], mode: 'SEQUENTIAL' } : undefined)}
        options={[{ value: 'DEFAULT', label: 'تنظیمات سراسری امضا' }, { value: 'CUSTOM', label: 'امضاکنندگان اختصاصی' }]}
      />
      {!custom && <p className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded-xl p-2">{defaultDescription}</p>}
      {custom && (
        <>
          <OrderedUserPicker users={users} selectedIds={policy.signerUserIds} ordered={policy.mode === 'SEQUENTIAL'} onChange={(ids) => onChange({ ...policy, signerUserIds: ids })} emptyText="امضاکنندگان را به ترتیب امضا اضافه کنید." />
          {policy.signerUserIds.length > 1 && (
            <ModeChips value={policy.mode} onChange={(mode) => onChange({ ...policy, mode })} options={(Object.keys(SIGNATURE_MODE_LABELS) as SignatureChainMode[]).map((mode) => ({ value: mode, label: SIGNATURE_MODE_LABELS[mode] }))} />
          )}
        </>
      )}
    </div>
  );
};

/** ویرایشگر کامل گردش کار یک جلسه/قالب. */
export const MeetingWorkflowEditor: React.FC<{
  users: User[];
  value: MeetingWorkflowConfig;
  onChange: (value: MeetingWorkflowConfig) => void;
  defaultSignatureDescription: string;
  defaultNoticeDescription: string;
}> = ({ users, value, onChange, defaultSignatureDescription, defaultNoticeDescription }) => (
  <div className="space-y-3">
    <ApprovalPolicyEditor
      title="تأیید دستورکار"
      description="پیش از ارسال خودکار دعوتنامه‌ها، چه کسانی دستورکار را تأیید کنند."
      icon={Layers}
      users={users}
      value={value.agendaApproval}
      onChange={(policy) => onChange({ ...value, agendaApproval: policy || { approverUserIds: [], mode: 'ANY' } })}
    />
    <ApprovalPolicyEditor
      title="تأیید صورت‌جلسه"
      description="در صورت فعال‌سازی، صورت‌جلسه تجمیعی پیش از نهایی‌سازی باید توسط این افراد تأیید شود."
      icon={Users}
      users={users}
      optional
      optionalLabel="نیاز به تأیید"
      value={value.minutesApproval}
      onChange={(policy) => onChange({ ...value, minutesApproval: policy })}
    />
    <SignatureChainEditor users={users} value={value.resolutionSignature} onChange={(policy) => onChange({ ...value, resolutionSignature: policy })} defaultDescription={defaultSignatureDescription} />
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="p-1.5 rounded-lg bg-fuchsia-100 text-fuchsia-700"><GitBranch className="w-4 h-4" /></span>
        <div>
          <div className="text-xs font-extrabold text-slate-800">امضاکننده ابلاغیه</div>
          <p className="text-[10px] text-slate-500 leading-5">پس از ثبت ابلاغ، چه کسی ابلاغیه مصوبات را امضا کند تا اجرا آغاز شود.</p>
        </div>
      </div>
      <select value={value.noticeSignerUserId || ''} onChange={(event) => onChange({ ...value, noticeSignerUserId: event.target.value || undefined })} className="w-full text-[11px] p-2 bg-white border border-slate-200 rounded-xl">
        <option value="">{defaultNoticeDescription}</option>
        {users.filter((user) => user.isActive !== false).map((user) => <option key={user.id} value={user.id}>{user.fullName} — {user.title}</option>)}
      </select>
    </div>
  </div>
);
