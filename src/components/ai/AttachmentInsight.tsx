import React, { useState } from 'react';
import { AlertTriangle, CheckSquare, Hash, ListChecks, Sparkles, X } from 'lucide-react';
import { Attachment } from '../../types';
import { useApp } from '../../context/AppContext';
import { AiSourceBadge, useAiFeature } from './AiKit';
import { DocumentSummary, summarizeDocument } from '../../services/ai/aiInsights';
import type { AiResult } from '../../services/ai/aiClient';
import { extractAttachmentText, isReadableAttachment } from '../../utils/documentText';

/** دکمه «خلاصه هوشمند» یک پیوست + پنل نتیجه. */
export const AttachmentInsightButton: React.FC<{ attachment: Attachment; onResult: (attachment: Attachment, result: AiResult<DocumentSummary> | { error: string }) => void }> = ({ attachment, onResult }) => {
  const enabled = useAiFeature('documentReader');
  const { currentUser } = useApp();
  const [busy, setBusy] = useState(false);
  if (!enabled || !isReadableAttachment(attachment)) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { onResult(attachment, await summarizeDocument(await extractAttachmentText(attachment), attachment.fileName, currentUser.id)); }
        catch (error) { onResult(attachment, { error: error instanceof Error ? error.message : 'خواندن فایل انجام نشد.' }); }
        finally { setBusy(false); }
      }}
      title="خلاصه و نکات کلیدی این سند"
      className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 disabled:opacity-50"
    >
      <Sparkles className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} />
    </button>
  );
};

export const AttachmentInsightPanel: React.FC<{ attachment: Attachment; result: AiResult<DocumentSummary> | { error: string }; onClose: () => void }> = ({ attachment, result, onClose }) => (
  <div className="col-span-full rounded-2xl border border-violet-200 bg-gradient-to-bl from-violet-50 via-white to-white p-3.5 space-y-2.5 text-[11.5px]">
    <div className="flex items-center justify-between gap-2">
      <span className="font-extrabold text-violet-950 flex items-center gap-1.5"><Sparkles className="w-4 h-4" />خلاصه هوشمند «{attachment.fileName}»</span>
      <div className="flex items-center gap-2">{'data' in result && <AiSourceBadge result={result} />}<button onClick={onClose} aria-label="بستن" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" /></button></div>
    </div>
    {'error' in result ? <p className="text-amber-800 bg-amber-50 rounded-lg p-2">{result.error}</p> : (
      <>
        <p className="leading-6 text-slate-700">{result.data.summary}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {result.data.keyPoints.length > 0 && <div className="rounded-xl bg-white border border-slate-200 p-2.5"><div className="font-bold text-slate-800 mb-1 flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" />نکات کلیدی</div>{result.data.keyPoints.map((p) => <div key={p} className="text-slate-600">• {p}</div>)}</div>}
          {result.data.decisionsNeeded.length > 0 && <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-2.5"><div className="font-bold text-indigo-900 mb-1 flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />تصمیم‌های موردنیاز از جلسه</div>{result.data.decisionsNeeded.map((p) => <div key={p} className="text-slate-700">• {p}</div>)}</div>}
          {result.data.risks.length > 0 && <div className="rounded-xl bg-rose-50 border border-rose-100 p-2.5"><div className="font-bold text-rose-900 mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />ریسک‌ها و ابهام‌ها</div>{result.data.risks.map((p) => <div key={p} className="text-slate-700">• {p}</div>)}</div>}
          {result.data.figures.length > 0 && <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5"><div className="font-bold text-amber-900 mb-1 flex items-center gap-1"><Hash className="w-3.5 h-3.5" />اعداد و تاریخ‌های مهم</div>{result.data.figures.map((p) => <div key={p} className="text-slate-700">• {p}</div>)}</div>}
        </div>
      </>
    )}
  </div>
);
