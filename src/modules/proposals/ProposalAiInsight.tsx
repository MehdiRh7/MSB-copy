import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Copy, Gauge } from 'lucide-react';
import { Proposal } from '../../types';
import { AiButton, AiSourceBadge, useAiFeature } from '../../components/ai/AiKit';
import { analyzeProposal, ProposalAnalysis, RECOMMENDATION_LABELS } from '../../services/ai/aiService';
import type { AiResult } from '../../services/ai/aiClient';
import { toPersianDigits } from '../../utils/formatters';

/** «تحلیل هوشمند» یک پیشنهاد برای تصمیم سریع‌تر مدیرعامل. */
export const ProposalAiInsight: React.FC<{ proposal: Proposal; allProposals: Proposal[]; actorId: string; onUseNote: (text: string) => void }> = ({ proposal, allProposals, actorId, onUseNote }) => {
  const enabled = useAiFeature('proposalReview');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult<ProposalAnalysis> | null>(null);
  if (!enabled) return null;
  if (!result) {
    return <AiButton variant="soft" loading={loading} onClick={async () => { setLoading(true); try { setResult(await analyzeProposal(proposal, allProposals, actorId)); } finally { setLoading(false); } }}>تحلیل هوشمند پیشنهاد</AiButton>;
  }
  const a = result.data;
  const toneClass = { APPROVE: 'bg-emerald-50 border-emerald-200 text-emerald-800', RETURN: 'bg-orange-50 border-orange-200 text-orange-800', CEO_ORDER: 'bg-purple-50 border-purple-200 text-purple-800', NO_BOARD: 'bg-slate-50 border-slate-200 text-slate-800' }[a.recommendation];
  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-bl from-indigo-50/80 via-white to-white p-3.5 space-y-3 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-extrabold text-indigo-950">تحلیل هوشمند پیشنهاد</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-slate-600" title="میزان کامل‌بودن اطلاعات پیشنهاد"><Gauge className="w-3.5 h-3.5" />کامل‌بودن {toPersianDigits(a.completeness)}٪</span>
          <AiSourceBadge result={result} />
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${a.completeness >= 70 ? 'bg-emerald-500' : a.completeness >= 45 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${a.completeness}%` }} /></div>
      <p className="text-slate-700 leading-6">{a.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-2.5"><div className="font-bold text-emerald-800 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />نقاط قوت</div>{a.strengths.map((s) => <div key={s} className="text-slate-700">• {s}</div>)}</div>
        <div className="rounded-xl bg-rose-50/70 border border-rose-100 p-2.5"><div className="font-bold text-rose-800 mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />ریسک‌ها و ابهام‌ها</div>{a.risks.map((s) => <div key={s} className="text-slate-700">• {s}</div>)}</div>
      </div>
      {a.questions.length > 0 && <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5"><div className="font-bold text-slate-700 mb-1 flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" />پرسش‌های کلیدی از پیشنهاددهنده</div>{a.questions.map((q) => <div key={q} className="text-slate-600">• {q}</div>)}</div>}
      {a.similar.length > 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-amber-900"><b>موارد مشابه قبلی:</b> {a.similar.map((s) => `${s.title} (${toPersianDigits(Math.round(s.score * 100))}٪)`).join('، ')}</div>}
      <div className={`rounded-xl border p-2.5 ${toneClass}`}>
        <div className="font-extrabold">توصیه: {RECOMMENDATION_LABELS[a.recommendation]}</div>
        <div className="text-slate-700 mt-0.5">{a.rationale}</div>
        <button type="button" onClick={() => onUseNote(a.rationale)} className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 hover:underline"><Copy className="w-3 h-3" />استفاده به‌عنوان توضیح تصمیم</button>
      </div>
      <p className="text-[9.5px] text-slate-400">تحلیل صرفاً کمکی است و تصمیم نهایی با مدیرعامل است.</p>
    </div>
  );
};
