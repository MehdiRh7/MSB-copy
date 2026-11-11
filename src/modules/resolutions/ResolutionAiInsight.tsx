import React, { useMemo, useState } from 'react';
import { Activity, Lightbulb } from 'lucide-react';
import { Resolution } from '../../types';
import { AiButton, AiSourceBadge, useAiFeature } from '../../components/ai/AiKit';
import { analyzeResolutionRisk, computeResolutionRisk, RiskAnalysis } from '../../services/ai/aiService';
import type { AiResult } from '../../services/ai/aiClient';
import { toPersianDigits } from '../../utils/formatters';

const LEVEL_META = {
  LOW: { label: 'پایین', ring: '#10b981', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MEDIUM: { label: 'متوسط', ring: '#f59e0b', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  HIGH: { label: 'بالا', ring: '#ef4444', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
};

/** کارت «پیش‌بینی ریسک تأخیر» با امتیاز قطعی سامانه + روایت و توصیه هوشمند. */
export const ResolutionAiInsight: React.FC<{ resolution: Resolution; actorId: string }> = ({ resolution, actorId }) => {
  const enabled = useAiFeature('riskInsight');
  const base = useMemo(() => computeResolutionRisk(resolution), [resolution]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult<RiskAnalysis> | null>(null);
  if (!enabled || resolution.approvalStatus !== 'APPROVED' || ['APPROVED_CLOSED', 'ARCHIVED'].includes(resolution.executionStatus)) return null;
  const level = base.score >= 60 ? 'HIGH' : base.score >= 30 ? 'MEDIUM' : 'LOW';
  const meta = LEVEL_META[level];
  const circumference = 2 * Math.PI * 22;
  return (
    <section className="rounded-3xl border border-indigo-100 bg-gradient-to-l from-indigo-50/70 via-white to-white p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-16 h-16 shrink-0" aria-label={`ریسک تأخیر ${base.score} از ۱۰۰`}>
          <svg viewBox="0 0 52 52" className="w-16 h-16 -rotate-90">
            <circle cx="26" cy="26" r="22" fill="none" stroke="#e2e8f0" strokeWidth="5" />
            <circle cx="26" cy="26" r="22" fill="none" stroke={meta.ring} strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - base.score / 100)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-slate-800">{toPersianDigits(base.score)}</span>
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1"><Activity className="w-4 h-4 text-indigo-600" />پیش‌بینی ریسک تأخیر</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.chip}`}>سطح {meta.label}</span>
            <AiSourceBadge result={result} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {base.factors.map((factor) => <span key={factor} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{factor}</span>)}
          </div>
        </div>
        {!result && <AiButton variant="soft" loading={loading} onClick={async () => { setLoading(true); try { setResult(await analyzeResolutionRisk(resolution, undefined, actorId)); } finally { setLoading(false); } }}>تحلیل و توصیه هوشمند</AiButton>}
      </div>
      {result && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <p className="rounded-2xl bg-white border border-slate-200 p-3 text-slate-700 leading-6">{result.data.summary}</p>
          <p className="rounded-2xl bg-indigo-50 border border-indigo-200 p-3 text-indigo-900 leading-6 flex gap-1.5"><Lightbulb className="w-4 h-4 shrink-0 text-amber-500" />{result.data.recommendation}</p>
        </div>
      )}
    </section>
  );
};
