import React, { useState } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { followUpService } from '../../services/followUpService';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { Attachment } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { todayJalali } from '../../utils/jalaliDate';
import { buildAttachmentFromFile } from '../../utils/attachmentFile';
import { AiButton, AiSourceBadge, AiTextAssist, useAiFeature } from '../../components/ai/AiKit';
import { draftFollowUp } from '../../services/ai/aiService';
import { resolutionService } from '../../services/resolutionService';
import type { AiResult } from '../../services/ai/aiClient';

interface RecordFollowUpFormProps {
  resolutionId: string;
  onRecorded: () => void;
}

/**
 * The single form for recording a follow-up. Shared by the «کارتابل پیگیری»
 * and the resolution's own detail view so both go through exactly one
 * service call — there is no second write path.
 */
export const RecordFollowUpForm: React.FC<RecordFollowUpFormProps> = ({ resolutionId, onRecorded }) => {
  const { currentUser, showToast, hasPermission } = useApp();
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDateJalali, setFollowUpDateJalali] = useState(todayJalali());
  const [nextDeadlineJalali, setNextDeadlineJalali] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const aiWriter = useAiFeature('writer');
  const [drafting, setDrafting] = useState(false);
  const [draftResult, setDraftResult] = useState<AiResult<string> | null>(null);
  const handleDraft = async () => {
    setDrafting(true);
    try {
      const [resolutionRes, recordsRes] = await Promise.all([resolutionService.getResolutionById(resolutionId), followUpService.getFollowUpRecords(resolutionId)]);
      if (!resolutionRes.data) return;
      const res = await draftFollowUp(resolutionRes.data, recordsRes.data.map((record) => record.text), currentUser.id);
      setText(res.data);
      setDraftResult(res);
    } finally { setDrafting(false); }
  };

  // Even though the caller already hides this form, the permission is checked
  // here too — and again in the service, which is the real gate.
  if (!hasPermission('MANAGE_RESOLUTION_FOLLOWUP')) {
    return (
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
        شما فقط مجوز مشاهده پیگیری را دارید و امکان ثبت پیگیری برای شما فعال نیست.
      </div>
    );
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // همان مسیر مشترک ساخت پیوست در کل سامانه: محتوای واقعی فایل هم
      // ذخیره می‌شود تا پیوست پیگیری قابل دانلود واقعی باشد.
      const attachments: Attachment[] = (await Promise.all(
        files.map((file) => buildAttachmentFromFile(file, currentUser.fullName, followUpDateJalali))
      )).map((built) => built.attachment);

      await followUpService.recordFollowUp(
        { resolutionId, text, followUpDateJalali, nextDeadlineJalali: nextDeadlineJalali || undefined, notes, attachments },
        currentUser
      );
      showToast('ثبت پیگیری', 'پیگیری مصوبه با موفقیت ثبت شد.', 'success');
      setText('');
      setNotes('');
      setNextDeadlineJalali('');
      setFiles([]);
      onRecorded();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت پیگیری انجام نشد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold text-amber-950">ثبت پیگیری جدید</div>
        {aiWriter && <div className="flex items-center gap-2"><AiSourceBadge result={draftResult} /><AiButton variant="soft" onClick={handleDraft} loading={drafting}>پیشنهاد متن پیگیری</AiButton></div>}
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">شرح / متن پیگیری *</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="شرح اقدامات انجام‌شده، نتیجه تماس یا مکاتبه پیگیری..."
          className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
        />
        <AiTextAssist value={text} onChange={setText} purpose="followup" actorId={currentUser.id} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PersianDatePicker label="تاریخ پیگیری *" value={followUpDateJalali} onChange={setFollowUpDateJalali} />
        <PersianDatePicker label="موعد پیگیری بعدی" value={nextDeadlineJalali} onChange={setNextDeadlineJalali} />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات تکمیلی</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs p-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer">
          <Paperclip className="w-4 h-4 text-amber-700" />
          <span>{files.length ? `${toPersianDigits(files.length)} فایل انتخاب شد` : 'افزودن فایل پیوست'}</span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
          />
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSubmitting ? 'در حال ثبت...' : 'ثبت پیگیری'}</span>
        </button>
      </div>
    </div>
  );
};
