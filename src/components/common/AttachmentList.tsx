import React, { useState } from 'react';
import { AttachmentInsightButton, AttachmentInsightPanel } from '../ai/AttachmentInsight';
import type { AiResult } from '../../services/ai/aiClient';
import type { DocumentSummary } from '../../services/ai/aiInsights';
import { Attachment } from '../../types';
import { formatFileSize, toPersianDigits } from '../../utils/formatters';
import { FileText, Download, Trash2, Paperclip, FileWarning } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  ATTACHMENT_MAX_BYTES,
  buildAttachmentFromFile,
  downloadAttachment,
  hasDownloadableContent,
} from '../../utils/attachmentFile';
import { todayJalali } from '../../utils/jalaliDate';

interface AttachmentListProps {
  attachments: Attachment[];
  onDelete?: (id: string) => void;
  canUpload?: boolean;
  onAddFiles?: (newFiles: Attachment[]) => void;
}

export const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onDelete,
  canUpload = false,
  onAddFiles,
}) => {
  const { showToast, currentUser } = useApp();
  const [insight, setInsight] = useState<{ attachment: Attachment; result: AiResult<DocumentSummary> | { error: string } } | null>(null);

  // دانلود واقعی: فایل از روی محتوای ذخیره‌شده ساخته و تحویل مرورگر می‌شود.
  // پیام موفقیت فقط وقتی نمایش داده می‌شود که دانلود واقعاً شروع شده باشد.
  const handleDownload = (attachment: Attachment) => {
    if (!hasDownloadableContent(attachment)) {
      showToast(
        'دانلود فایل',
        `محتوای فایل «${attachment.fileName}» در این نسخه ذخیره نشده و فقط مشخصات آن ثبت است.`,
        'warning'
      );
      return;
    }
    if (downloadAttachment(attachment)) {
      showToast('دانلود فایل', `دانلود فایل «${attachment.fileName}» آغاز شد.`, 'success');
    } else {
      showToast('دانلود فایل', `دانلود فایل «${attachment.fileName}» انجام نشد.`, 'error');
    }
  };

  // بارگذاری چندفایلی و تجمعی: فایل‌های جدید به فایل‌های قبلی اضافه
  // می‌شوند (Replace نمی‌کنند) — همان قرارداد onAddFiles.
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files: File[] = Array.from(e.target.files);
    e.target.value = '';

    const tooLarge = files.filter((file) => file.size > ATTACHMENT_MAX_BYTES);
    const accepted = files.filter((file) => file.size <= ATTACHMENT_MAX_BYTES);
    if (tooLarge.length > 0) {
      showToast(
        'بارگذاری پیوست',
        `${tooLarge.map((file) => `«${file.name}»`).join('، ')} بزرگ‌تر از حد مجاز (۱۰ مگابایت) است و پیوست نشد.`,
        'error'
      );
    }
    if (accepted.length === 0) return;

    const built = await Promise.all(
      accepted.map((file) => buildAttachmentFromFile(file, currentUser?.fullName || 'کاربر جاری', todayJalali()))
    );

    if (onAddFiles) onAddFiles(built.map((item) => item.attachment));

    const withoutContent = built.filter((item) => !item.contentStored);
    showToast(
      'بارگذاری پیوست',
      accepted.length === 1 ? `فایل «${accepted[0].name}» پیوست شد.` : `${accepted.length} فایل پیوست شدند.`,
      'success'
    );
    if (withoutContent.length > 0) {
      showToast(
        'توجه',
        `محتوای ${withoutContent.map((item) => `«${item.attachment.fileName}»`).join('، ')} برای ذخیره در مرورگر بزرگ است؛ فقط مشخصات فایل ثبت شد و قابل دانلود نیست.`,
        'warning'
      );
    }
  };

  return (
    <div className="space-y-3">
      {canUpload && (
        <div className="flex items-center justify-between border-dashed border-2 border-slate-200 hover:border-teal-400 rounded-2xl p-4 transition-colors bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700">
              <Paperclip className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-700">افزودن مستندات یا فایل‌های پیوست</div>
              <div className="text-[10px] text-slate-400">فرمت‌های مجاز: PDF, DOCX, XLSX, JPG (حداکثر ۱۰ مگابایت)</div>
            </div>
          </div>
          <label className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold py-1.5 px-3.5 rounded-xl cursor-pointer transition-colors">
            انتخاب فایل
            <input type="file" multiple className="hidden" onChange={handleUpload} />
          </label>
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="text-center py-4 text-xs text-slate-400">هیچ فایل پیوستی ثبت نشده است.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center justify-between p-2.5 bg-white border border-slate-200/90 rounded-xl hover:border-teal-300 transition-all shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-teal-50 text-teal-700 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate" title={att.fileName}>
                    {att.fileName}
                  </p>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{formatFileSize(att.fileSizeBytes)}</span>
                    <span>•</span>
                    <span>{toPersianDigits(att.uploadDate)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <AttachmentInsightButton attachment={att} onResult={(attachment, result) => setInsight({ attachment, result })} />
                <button
                  onClick={() => handleDownload(att)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    hasDownloadableContent(att)
                      ? 'text-slate-500 hover:bg-teal-50 hover:text-teal-700'
                      : 'text-slate-300 hover:bg-amber-50 hover:text-amber-600'
                  }`}
                  title={hasDownloadableContent(att) ? 'دانلود فایل' : 'محتوای این فایل ذخیره نشده و قابل دانلود نیست'}
                >
                  {hasDownloadableContent(att) ? <Download className="w-3.5 h-3.5" /> : <FileWarning className="w-3.5 h-3.5" />}
                </button>
                {onDelete && (
                  <button
                    onClick={() => onDelete(att.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    title="حذف فایل"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {insight && attachments.some((a) => a.id === insight.attachment.id) && <AttachmentInsightPanel attachment={insight.attachment} result={insight.result} onClose={() => setInsight(null)} />}
        </div>
      )}
    </div>
  );
};
