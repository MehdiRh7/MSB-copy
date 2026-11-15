import React, { useMemo, useState } from 'react';
import { PenTool, Save, ArrowDown, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  SIGNATURE_STAGES,
  SignatureStageId,
  SignerAssignment,
  USER_ROLE_LABELS,
  canManageSignatureWorkflow,
  describeAssignment,
  getSignatureWorkflowSettings,
  resolveStageSigner,
  updateStageAssignment,
} from '../../services/signatureWorkflowSettingsService';
import { UserRole } from '../../types';
import { toPersianDigits } from '../../utils/formatters';

/**
 * «تنظیمات گردش امضا» — Admin تعیین می‌کند امضاکننده هر مرحله چه کسی باشد.
 * تعداد و ترتیب مراحل در این صفحه قابل تغییر نیست؛ فقط امضاکننده هر مرحله.
 */
export const SignatureWorkflowTab: React.FC = () => {
  const { currentUser, availableUsers, showToast } = useApp();
  const [settings, setSettings] = useState(() => getSignatureWorkflowSettings());
  const [drafts, setDrafts] = useState<Record<string, SignerAssignment>>({});

  const canManage = canManageSignatureWorkflow(currentUser);

  const workflows = useMemo(() => {
    const grouped = new Map<string, typeof SIGNATURE_STAGES>();
    SIGNATURE_STAGES.forEach((stage) => {
      grouped.set(stage.workflow, [...(grouped.get(stage.workflow) || []), stage]);
    });
    return Array.from(grouped.entries());
  }, []);

  const assignmentFor = (stageId: SignatureStageId): SignerAssignment =>
    drafts[stageId] || settings.stages[stageId];

  const setDraft = (stageId: SignatureStageId, assignment: SignerAssignment) =>
    setDrafts((prev) => ({ ...prev, [stageId]: assignment }));

  const handleSave = (stageId: SignatureStageId) => {
    try {
      const next = updateStageAssignment(stageId, assignmentFor(stageId), currentUser);
      setSettings(next);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[stageId];
        return copy;
      });
      showToast('تنظیمات گردش امضا', 'امضاکننده این مرحله ذخیره شد. درخواست‌های امضای جدید طبق همین تنظیم ساخته می‌شوند.', 'success');
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ذخیره تنظیمات انجام نشد.', 'error');
    }
  };

  if (!canManage) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center shadow-xs border border-slate-100 text-xs text-slate-400">
        شما مجاز به مشاهده و تغییر تنظیمات گردش امضا نیستید.
      </div>
    );
  }

  const field = 'w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-5">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
          <PenTool className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-800">تنظیمات گردش امضا</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            تعیین امضاکننده هر مرحله. تعداد و ترتیب مراحل تغییر نمی‌کند و مراحل ترتیبی همچنان به‌ترتیب انجام می‌شوند.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-[12px] text-sky-900 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          تغییر امضاکننده فقط روی درخواست‌های امضای <strong>جدید</strong> اثر می‌گذارد. پرونده‌هایی که از قبل در گردش هستند،
          امضاکننده ثبت‌شده خودشان را نگه می‌دارند و جابه‌جا نمی‌شوند.
        </span>
      </div>

      {workflows.map(([workflowName, stages]) => (
        <div key={workflowName} className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <h4 className="text-xs font-bold text-slate-800">{workflowName}</h4>
          </div>

          <div className="p-4 space-y-3">
            {stages.map((stage, index) => {
              const assignment = assignmentFor(stage.id);
              const isDirty = Boolean(drafts[stage.id]);
              const resolved = resolveStageSigner(stage.id);

              return (
                <React.Fragment key={stage.id}>
                  {index > 0 && stage.sequential && (
                    <div className="flex justify-center text-slate-300"><ArrowDown className="w-4 h-4" /></div>
                  )}
                  <div className={`p-3.5 rounded-2xl border ${isDirty ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2.5">
                      <div>
                        <div className="text-xs font-bold text-slate-800">{stage.title}</div>
                        <p className="text-[11px] text-slate-500 mt-0.5 max-w-xl leading-5">{stage.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {stage.sequential && stage.order && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            ترتیب: {toPersianDigits(stage.order)}
                          </span>
                        )}
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {stage.sequential ? 'ترتیبی' : 'مستقل'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع تخصیص امضاکننده</label>
                        <select
                          value={assignment.mode}
                          onChange={(event) => {
                            const mode = event.target.value as SignerAssignment['mode'];
                            setDraft(stage.id, mode === 'ROLE'
                              ? { mode, role: assignment.role || 'SECRETARY' }
                              : mode === 'USER'
                                ? { mode, userId: assignment.userId || availableUsers[0]?.id }
                                : { mode });
                          }}
                          className={field}
                        >
                          <option value="ROLE">نقش سازمانی</option>
                          <option value="USER">کاربر مشخص</option>
                          {stage.id === 'RESOLUTION_NOTICE' && <option value="MEETING_SECRETARY">دبیر جلسهِ همان جلسه</option>}
                        </select>
                      </div>

                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">امضاکننده</label>
                        {assignment.mode === 'ROLE' && (
                          <select
                            value={assignment.role || ''}
                            onChange={(event) => setDraft(stage.id, { mode: 'ROLE', role: event.target.value as UserRole })}
                            className={field}
                          >
                            {Object.entries(USER_ROLE_LABELS).map(([role, label]) => (
                              <option key={role} value={role}>{label}</option>
                            ))}
                          </select>
                        )}
                        {assignment.mode === 'USER' && (
                          <select
                            value={assignment.userId || ''}
                            onChange={(event) => setDraft(stage.id, { mode: 'USER', userId: event.target.value })}
                            className={field}
                          >
                            <option value="">انتخاب کاربر...</option>
                            {availableUsers.map((user) => (
                              <option key={user.id} value={user.id}>{user.fullName} ({user.title})</option>
                            ))}
                          </select>
                        )}
                        {assignment.mode === 'MEETING_SECRETARY' && (
                          <div className={`${field} bg-slate-100 text-slate-500`}>دبیر جلسهِ ثبت‌شده روی همان جلسه</div>
                        )}
                      </div>

                      <div className="sm:col-span-3 flex items-end">
                        <button
                          type="button"
                          onClick={() => handleSave(stage.id)}
                          disabled={!isDirty}
                          className="w-full flex items-center justify-center gap-1.5 bg-teal-800 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 px-3 rounded-xl cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>ذخیره</span>
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-2">
                      امضاکننده فعلی: <strong className="text-slate-700">{describeAssignment(settings.stages[stage.id], availableUsers)}</strong>
                      {resolved && assignment.mode !== 'MEETING_SECRETARY' && (
                        <span className="text-slate-400"> — در حال حاضر: {resolved.name}</span>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
