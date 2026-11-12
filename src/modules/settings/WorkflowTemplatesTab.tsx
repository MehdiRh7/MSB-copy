import React, { useState } from 'react';
import { CheckCircle2, Copy, GitBranch, Plus, Save, Star, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { WorkflowTemplate } from '../../types';
import { ApprovalPolicyEditor, MeetingWorkflowEditor } from '../../components/workflow/WorkflowEditors';
import { ProposalWorkflowSettings } from '../../types';
import {
  canManageWorkflowTemplates,
  deleteWorkflowTemplate,
  describePolicy,
  getProposalWorkflowSettings,
  getWorkflowTemplates,
  MEETING_TYPE_OPTIONS,
  saveProposalWorkflowSettings,
  saveWorkflowTemplate,
} from '../../services/workflowPolicyService';
import { describeAssignment, getStageAssignment } from '../../services/signatureWorkflowSettingsService';

const newTemplate = (): WorkflowTemplate => ({
  id: `wf-${Date.now()}`,
  name: 'قالب جدید',
  description: '',
  meetingTypes: [],
  agendaApproval: { approverUserIds: [], mode: 'ANY' },
  updatedAt: new Date().toISOString(),
});

/**
 * «قالب‌های گردش کار» — مدیر سیستم برای هر نوع جلسه تعیین می‌کند چه کسانی
 * دستورکار و صورت‌جلسه را تأیید کنند و مصوبات را چه کسانی امضا کنند.
 * سازنده جلسه همچنان می‌تواند برای همان یک جلسه قالب را تغییر دهد.
 */
export const WorkflowTemplatesTab: React.FC = () => {
  const { currentUser, availableUsers, showToast } = useApp();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(getWorkflowTemplates);
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id);
  const [draft, setDraft] = useState<WorkflowTemplate | null>(() => templates[0] ? JSON.parse(JSON.stringify(templates[0])) : null);
  const canManage = canManageWorkflowTemplates(currentUser);
  const [proposalWf, setProposalWf] = useState<ProposalWorkflowSettings>(getProposalWorkflowSettings);

  const select = (template: WorkflowTemplate) => {
    setSelectedId(template.id);
    setDraft(JSON.parse(JSON.stringify(template)));
  };

  const handleSave = () => {
    if (!draft) return;
    try {
      const next = saveWorkflowTemplate(draft, currentUser);
      setTemplates(next);
      showToast('قالب گردش کار', `قالب «${draft.name}» ذخیره شد و برای جلسات جدید اعمال می‌شود.`, 'success');
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ذخیره انجام نشد.', 'error');
    }
  };

  const handleDelete = () => {
    if (!draft || !window.confirm(`قالب «${draft.name}» حذف شود؟ جلسات ایجادشده با این قالب تغییری نمی‌کنند.`)) return;
    try {
      const next = deleteWorkflowTemplate(draft.id, currentUser);
      setTemplates(next);
      select(next[0]);
      showToast('قالب گردش کار', 'قالب حذف شد.', 'info');
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'حذف انجام نشد.', 'error');
    }
  };

  const addTemplate = (base?: WorkflowTemplate) => {
    const template = base
      ? { ...JSON.parse(JSON.stringify(base)), id: `wf-${Date.now()}`, name: `${base.name} (کپی)`, isDefault: false, meetingTypes: [] }
      : newTemplate();
    setTemplates((prev) => [...prev, template]);
    select(template);
  };

  if (!canManage) {
    return <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-500 border border-slate-200">فقط مدیر سیستم می‌تواند قالب‌های گردش کار را مدیریت کند.</div>;
  }

  const takenTypes = new Map(templates.filter((t) => t.id !== draft?.id).flatMap((t) => t.meetingTypes.map((type) => [type, t.name] as const)));

  return (
    <div className="space-y-4">
    <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5"><GitBranch className="w-4 h-4 text-violet-600" />گردش مصوبات پیشنهادی</h3>
          <p className="text-[10.5px] text-slate-500 mt-0.5">بدون تنظیم، رفتار فعلی حفظ می‌شود: بررسی توسط مدیرعامل و تأیید نهایی توسط دارنده مجوز «دبیر جلسه».</p>
        </div>
        <button onClick={() => { try { setProposalWf(saveProposalWorkflowSettings(proposalWf, currentUser)); showToast('گردش پیشنهادها', 'تنظیمات گردش پیشنهادها ذخیره شد.', 'success'); } catch (error) { showToast('خطا', error instanceof Error ? error.message : 'ذخیره انجام نشد.', 'error'); } }} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-violet-700 text-white"><Save className="w-3.5 h-3.5" />ذخیره گردش پیشنهادها</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ApprovalPolicyEditor title="بررسی و تصمیم (به‌جای مدیرعامل)" description="مثلاً تأیید هم‌زمان مدیرعامل و معاون، یا تأیید ترتیبی." users={availableUsers} optional optionalLabel="سفارشی" value={proposalWf.ceoReview} onChange={(policy) => setProposalWf({ ...proposalWf, ceoReview: policy })} />
        <ApprovalPolicyEditor title="تأیید نهایی برای ورود به جلسه" description="به‌جای دارندگان مجوز «دبیر جلسه»." users={availableUsers} optional optionalLabel="سفارشی" value={proposalWf.secretaryConfirmation} onChange={(policy) => setProposalWf({ ...proposalWf, secretaryConfirmation: policy })} />
      </div>
    </section>
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="bg-white rounded-3xl border border-slate-200 p-3 space-y-2 h-fit">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5"><GitBranch className="w-4 h-4 text-indigo-600" />قالب‌های گردش کار</h3>
          <button onClick={() => addTemplate()} className="p-1.5 rounded-lg bg-indigo-600 text-white" aria-label="افزودن قالب"><Plus className="w-3.5 h-3.5" /></button>
        </div>
        {templates.map((template) => (
          <button key={template.id} onClick={() => select(template)} className={`w-full text-right p-3 rounded-2xl border transition ${selectedId === template.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-800">
              {template.isDefault && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />}
              {template.name}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">دستورکار: {describePolicy(template.agendaApproval)}</div>
            {template.meetingTypes.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{template.meetingTypes.map((type) => <span key={type} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{MEETING_TYPE_OPTIONS.find((o) => o.value === type)?.label || type}</span>)}</div>}
          </button>
        ))}
        <p className="text-[10px] leading-5 text-slate-400 px-1">هر نوع جلسه به قالب مخصوص خودش وصل می‌شود؛ انواع بدون قالب از قالب پیش‌فرض (⭐) پیروی می‌کنند.</p>
      </aside>

      {draft && (
        <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-4 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold text-slate-700 mb-1">نام قالب</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-slate-700 mb-1">توضیح</span>
              <input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="مثلاً: جلسات هیئت مدیره با تأیید دو مرحله‌ای" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
            </label>
          </div>
          <div>
            <span className="block text-[11px] font-bold text-slate-700 mb-1.5">برای کدام انواع جلسه؟</span>
            <div className="flex flex-wrap gap-1.5">
              {MEETING_TYPE_OPTIONS.map((option) => {
                const active = draft.meetingTypes.includes(option.value);
                const takenBy = takenTypes.get(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={takenBy && !active ? `در حال حاضر متعلق به «${takenBy}» — با انتخاب، به این قالب منتقل می‌شود` : undefined}
                    onClick={() => setDraft({ ...draft, meetingTypes: active ? draft.meetingTypes.filter((t) => t !== option.value) : [...draft.meetingTypes, option.value] })}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-full border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    {active && <CheckCircle2 className="w-3 h-3 inline ml-1" />}{option.label}{takenBy && !active ? ' •' : ''}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-slate-600">
              <input type="checkbox" checked={Boolean(draft.isDefault)} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} className="accent-amber-500" />
              قالب پیش‌فرض برای سایر انواع جلسه
            </label>
          </div>

          <MeetingWorkflowEditor
            users={availableUsers}
            value={draft}
            onChange={(next) => setDraft({ ...draft, ...next })}
            defaultSignatureDescription={`سه امضای ترتیبی سراسری: ${(['RESOLUTION_STEP_1', 'RESOLUTION_STEP_2', 'RESOLUTION_STEP_3'] as const).map((stage) => describeAssignment(getStageAssignment(stage), availableUsers)).join(' ← ')}`}
            defaultNoticeDescription={`طبق تنظیم سراسری (${describeAssignment(getStageAssignment('RESOLUTION_NOTICE'), availableUsers)})`}
          />

          <div className="flex flex-wrap gap-2 justify-end border-t border-slate-100 pt-3">
            <button onClick={() => addTemplate(draft)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-700"><Copy className="w-3.5 h-3.5" />کپی از این قالب</button>
            <button onClick={handleDelete} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-rose-200 text-rose-700"><Trash2 className="w-3.5 h-3.5" />حذف</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-indigo-700 text-white"><Save className="w-3.5 h-3.5" />ذخیره قالب</button>
          </div>
        </section>
      )}
    </div>
    </div>
  );
};
