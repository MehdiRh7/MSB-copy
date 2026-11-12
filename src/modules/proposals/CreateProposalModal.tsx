import React, { useEffect, useMemo, useState } from 'react';
import { focusField } from '../../components/common/FormStepTabs';
import { X, Lightbulb, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { proposalService } from '../../services/proposalService';
import { Proposal } from '../../types';
import { AiButton, AiSourceBadge, AiTextAssist, useAiFeature, VoiceInputButton } from '../../components/ai/AiKit';
import { draftProposal, textSimilarity } from '../../services/ai/aiService';
import type { AiResult } from '../../services/ai/aiClient';

interface CreateProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateProposalModal: React.FC<CreateProposalModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, availableUsers, showToast, triggerRefresh } = useApp();
  // Office manager / CEO / Admin submit proposals on behalf of others, so
  // they pick the presenter; anyone else submitting their own proposal IS
  // the presenter — fixed to themselves, not a free choice.
  const canChoosePresenter = ['ADMIN', 'CEO', 'SECRETARY'].includes(currentUser.role);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  // «شماره نامه» پیشنهاد — همان Field ای که Excel Import هم پر می‌کند
  // (sourceLetterNumber)، نه یک Field موازی.
  const [letterNumber, setLetterNumber] = useState('');
  const [presenterUserId, setPresenterUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // ——— دستیار هوشمند نگارش پیشنهاد ———
  const aiWriter = useAiFeature('writer');
  const [idea, setIdea] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftResult, setDraftResult] = useState<AiResult<unknown> | null>(null);
  const [existing, setExisting] = useState<Proposal[]>([]);

  useEffect(() => {
    if (isOpen) proposalService.getProposals({ pageSize: 500 }).then((res) => setExisting(res.data.items)).catch(() => setExisting([]));
  }, [isOpen]);

  // تشخیص پیشنهاد تکراری/مشابه در لحظه تایپ — کاملاً محلی و بدون ارسال داده.
  const similar = useMemo(() => {
    const text = `${title} ${description}`.trim();
    if (text.length < 12) return [];
    return existing
      // عنوان با عنوان هم مقایسه می‌شود تا شرح طولانی، شباهت عنوان‌ها را کم‌رنگ نکند.
      .map((p) => ({ p, score: Math.max(textSimilarity(text, `${p.title} ${p.description}`), title.trim().length > 8 ? textSimilarity(title, p.title) : 0) }))
      .filter((item) => item.score >= 0.22)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [title, description, existing]);

  const handleDraft = async () => {
    if (!idea.trim()) return;
    setDrafting(true);
    try {
      const presenter = availableUsers.find((u) => u.id === presenterUserId) || currentUser;
      const res = await draftProposal(idea, presenter.departmentName, currentUser.id);
      setTitle(res.data.title);
      setDescription(res.data.description);
      setRationale(res.data.rationale);
      setDraftResult(res);
    } finally { setDrafting(false); }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const presenter = canChoosePresenter ? availableUsers.find((user) => user.id === presenterUserId) : currentUser;
    if (!title.trim() || !description.trim() || !presenter) {
      setShowErrors(true);
      focusField(!presenter ? 'pf-presenter' : !title.trim() ? 'pf-title' : 'pf-description');
      return;
    }
    setIsSubmitting(true);
    try {
      await proposalService.createProposal({
        title: title.trim(),
        description: description.trim(),
        rationale: rationale.trim(),
        proposerName: currentUser.fullName,
        proposerUserId: currentUser.id,
        proposerDepartmentId: currentUser.departmentId,
        proposerDepartmentName: currentUser.departmentName,
        presenterUserId: presenter.id,
        presenterName: presenter.fullName,
        sourceLetterNumber: letterNumber.trim() || undefined,
      });
      showToast(
        'ثبت مصوبه پیشنهادی',
        'برای بررسی مستقیماً به کارتابل مدیرعامل ارسال شد.',
        'success'
      );
      setTitle('');
      setDescription('');
      setRationale('');
      setLetterNumber('');
      setPresenterUserId('');
      setShowErrors(false);
      triggerRefresh();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-200">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">ثبت مصوبه پیشنهادی جدید</h3>
              <p className="text-[11px] text-teal-200">
                برای بررسی و تصمیم مستقیماً به کارتابل مدیرعامل ارسال می‌شود
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[calc(92vh-5.5rem)]">
          {aiWriter && (
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 via-white to-sky-50 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-indigo-950">✨ ایده‌تان را در یک جمله بگویید؛ بقیه را هوش مصنوعی می‌نویسد</span>
                <AiSourceBadge result={draftResult} />
              </div>
              <div className="flex items-center gap-2">
                <input value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDraft(); } }} placeholder="مثلاً: راه‌اندازی سامانه نوبت‌دهی آنلاین برای مراجعان شعب" className="flex-1 text-xs p-2.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                <VoiceInputButton className="p-2 border border-indigo-200 bg-white" onText={(text, isFinal) => { if (isFinal) setIdea((prev) => (prev ? `${prev} ${text}` : text)); }} />
                <AiButton onClick={handleDraft} loading={drafting} disabled={!idea.trim()}>نوشتن پیشنهاد</AiButton>
              </div>
              <p className="text-[10px] text-slate-500">عنوان، شرح و ضرورت به‌صورت پیش‌نویس پر می‌شود و قبل از ارسال قابل ویرایش است.</p>
            </div>
          )}
          <div className="app-form-card space-y-3.5">
            <h4 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-800"><span className="h-2 w-2 rounded-full bg-teal-600" />موضوع و ارائه‌دهنده</h4>
            <div id="pf-presenter">
              <label className="block text-xs font-bold text-slate-700 mb-1">ارائه‌دهنده <span className="text-rose-500">*</span></label>
              {canChoosePresenter ? (
                <select value={presenterUserId} aria-invalid={showErrors && !presenterUserId} onChange={(e) => setPresenterUserId(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <option value="">انتخاب ارائه‌دهنده...</option>
                  {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} ({user.title})</option>)}
                </select>
              ) : (
                <div className="w-full text-xs p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700">
                  {currentUser.fullName} ({currentUser.title})
                </div>
              )}
              {showErrors && canChoosePresenter && !presenterUserId && <p className="form-field-error">ارائه‌دهنده را انتخاب کنید.</p>}
            </div>
            <div className="grid gap-3.5 sm:grid-cols-[1fr_11rem]">
              <div id="pf-title">
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان <span className="text-rose-500">*</span></label>
                <input type="text" value={title} aria-invalid={showErrors && !title.trim()} onChange={(e) => setTitle(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl" placeholder="مثال: برگزاری دوره آموزشی امنیت سایبری" />
                {showErrors && !title.trim() && <p className="form-field-error">عنوان پیشنهاد را وارد کنید.</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره نامه</label>
                <input type="text" value={letterNumber} onChange={(e) => setLetterNumber(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl" placeholder="مثال: ۱۴۰۵/۱۲۳۴۵" />
              </div>
            </div>
            <p className="text-[10.5px] leading-5 text-slate-500">شماره نامه هنگام تبدیل این پیشنهاد به مصوبه، خودکار در فرم مصوبه درج می‌شود.</p>
          </div>
          <div className="app-form-card space-y-3.5">
            <h4 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-800"><span className="h-2 w-2 rounded-full bg-teal-600" />شرح و ضرورت</h4>
            <div id="pf-description">
              <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات <span className="text-rose-500">*</span></label>
              <textarea rows={4} value={description} aria-invalid={showErrors && !description.trim()} onChange={(e) => setDescription(e.target.value)} className="w-full text-xs leading-6 p-2.5 bg-slate-50 border border-slate-200 rounded-xl" placeholder="این موضوع چرا باید در جلسه مطرح و درباره آن تصمیم‌گیری شود؟" />
              <AiTextAssist value={description} onChange={setDescription} purpose="proposal" actorId={currentUser.id} />
              {showErrors && !description.trim() && <p className="form-field-error">شرح پیشنهاد را وارد کنید.</p>}
            </div>
            {similar.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 space-y-1">
                <div className="font-extrabold">⚠ پیشنهادهای مشابه قبلاً ثبت شده‌اند — از ثبت تکراری اطمینان حاصل کنید:</div>
                {similar.map(({ p, score }) => <div key={p.id}>• {p.title} <span className="text-amber-700">({Math.round(score * 100).toLocaleString('fa-IR')}٪ مشابهت)</span></div>)}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">دلایل و ضرورت طرح</label>
              <textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} className="w-full text-xs leading-6 p-2.5 bg-slate-50 border border-slate-200 rounded-xl" placeholder="دلایل اداری، مالی یا راهبردی طرح موضوع" />
              <AiTextAssist value={rationale} onChange={setRationale} purpose="proposal" actorId={currentUser.id} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-slate-100 pt-3">
            <button type="button" onClick={onClose} className="app-btn-secondary">انصراف</button>
            <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="app-btn-primary">
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ارسال...' : 'ارسال به کارتابل مدیرعامل'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
