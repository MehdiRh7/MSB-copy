import { officialDocumentHtml } from '../../services/documentService';
import { getCurrentJalaliDate } from '../../utils/date';
import React, { useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { DashboardKPIs, DepartmentPerformance } from '../../types';
import { AiButton, useAiFeature } from '../../components/ai/AiKit';
import { reportNarrative } from '../../services/ai/aiService';
import { exportHtmlToPdf } from '../../utils/pdfExport';
import type { AiResult } from '../../services/ai/aiClient';

/** «گزارش تحلیلی مدیریتی» — روایت متنی آمار برای هیئت مدیره. */
export const AiReportNarrative: React.FC<{ kpis: DashboardKPIs | null; departments: DepartmentPerformance[]; period: string; actorId: string }> = ({ kpis, departments, period, actorId }) => {
  const enabled = useAiFeature('reportNarrative');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult<string> | null>(null);
  if (!enabled || !kpis) return null;
  const run = async () => {
    setLoading(true);
    try {
      const stats: Record<string, string | number> = {
        'بازه گزارش': period,
        'کل جلسات': kpis.totalMeetings,
        'کل مصوبات': kpis.totalResolutions,
        'مصوبات در حال اجرا': kpis.inProgressResolutions,
        'مصوبات خاتمه‌یافته': kpis.completedClosedResolutions,
        'در انتظار صحه‌گذاری': kpis.pendingApprovalResolutions,
        'مصوبات معوق': kpis.overdueResolutions,
        ...Object.fromEntries(departments.slice(0, 8).map((d) => [`واحد ${d.departmentName}`, `ارجاع ${d.totalAssigned}، خاتمه ${d.completed}، معوق ${d.overdue}، نرخ تحقق ${d.completionRatePercent}٪`])),
      };
      setResult(await reportNarrative(stats, actorId));
    } finally { setLoading(false); }
  };
  return (
    <section className="rounded-2xl border border-indigo-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-indigo-950 flex items-center gap-1.5"><FileText className="w-4 h-4" />گزارش تحلیلی مدیریتی</h2>
          <p className="text-xs text-slate-500">متن تحلیلی آمار برای ارائه به مدیران</p>
        </div>
        <div className="flex items-center gap-2">
          
          {result && <button onClick={() => {
            const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const body = esc(result.data).split('\n').map((line) => line.trim() ? (line.length < 40 && !/[.،]$/.test(line) ? `<h2>${line}</h2>` : `<p style="margin:4px 0">${line}</p>`) : '').join('');
            exportHtmlToPdf(`ManagementReport-${period}`, officialDocumentHtml('گزارش تحلیلی مدیریتی', `دوره: ${period}`, body, { date: getCurrentJalaliDate() }), { wordExport: true, autoPrint: false });
          }} className="text-[12px] font-bold text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50"><FileText className="w-3.5 h-3.5" />خروجی رسمی PDF / Word</button>}
          {result && <button onClick={() => navigator.clipboard.writeText(result.data)} className="text-[12px] font-bold text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50"><Copy className="w-3.5 h-3.5" />کپی</button>}
          <AiButton onClick={run} loading={loading}>{result ? 'تولید دوباره' : 'تولید گزارش تحلیلی'}</AiButton>
        </div>
      </div>
      {result && <pre className="whitespace-pre-wrap font-sans text-[13px] leading-7 text-slate-700 bg-white border border-slate-200 rounded-2xl p-4">{result.data}</pre>}
    </section>
  );
};
