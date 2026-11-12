import React, { useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { DashboardKPIs, DepartmentPerformance } from '../../types';
import { AiButton, AiSourceBadge, useAiFeature } from '../../components/ai/AiKit';
import { reportNarrative } from '../../services/ai/aiService';
import { exportHtmlToPdf } from '../../utils/pdfExport';
import { getOrganizationProfile } from '../../services/organizationProfile';
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
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 via-white to-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-indigo-950 flex items-center gap-1.5"><FileText className="w-4 h-4" />گزارش تحلیلی هوشمند برای مدیران ارشد</h2>
          <p className="text-[11px] text-slate-500">تحلیل متنی آمار، گلوگاه‌ها و توصیه‌های اقدام — آماده ارائه در جلسه هیئت مدیره</p>
        </div>
        <div className="flex items-center gap-2">
          <AiSourceBadge result={result} />
          {result && <button onClick={() => {
            const profile = getOrganizationProfile();
            const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const logo = profile.logoUrl ? new URL(profile.logoUrl, window.location.origin).href : '';
            exportHtmlToPdf(`گزارش تحلیلی مدیریتی ${period}`, `<div style="font-family:Tahoma;font-size:12px;line-height:2.1">
              <table class="lh" style="width:100%;border-collapse:collapse"><tr><td style="width:20%;border:none">${logo ? `<img src="${logo}" style="height:60px" />` : ''}</td><td style="text-align:center;border:none"><b style="font-size:14px">${esc(profile.name || profile.systemTitle)}</b><div style="color:#64748b;font-size:11px">گزارش تحلیلی مدیریتی — ${esc(period)}</div></td><td style="width:20%;border:none;font-size:11px">تاریخ: ${new Date().toLocaleDateString('fa-IR')}</td></tr></table>
              <hr style="border:0;border-top:3px solid #541d50;margin:10px 0 16px" />
              ${esc(result.data).split('\n').map((line) => line.trim() ? (line.length < 40 && !/[.،]$/.test(line) ? `<h3 style="color:#541d50;font-size:13px;margin:14px 0 4px">${line}</h3>` : `<p style="margin:4px 0">${line}</p>`) : '').join('')}
            </div>`, { wordExport: true, autoPrint: false });
          }} className="text-[11px] font-bold text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50"><FileText className="w-3.5 h-3.5" />خروجی رسمی PDF / Word</button>}
          {result && <button onClick={() => navigator.clipboard.writeText(result.data)} className="text-[11px] font-bold text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50"><Copy className="w-3.5 h-3.5" />کپی</button>}
          <AiButton onClick={run} loading={loading}>{result ? 'تولید دوباره' : 'تولید گزارش تحلیلی'}</AiButton>
        </div>
      </div>
      {result && <pre className="whitespace-pre-wrap font-sans text-[12px] leading-7 text-slate-700 bg-white border border-slate-200 rounded-2xl p-4">{result.data}</pre>}
    </section>
  );
};
