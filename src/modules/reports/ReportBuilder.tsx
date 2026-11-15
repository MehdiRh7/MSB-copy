import React, { useMemo, useRef, useState } from 'react';
import { FileDown, History, LayoutTemplate, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../context/AppContext';
import { VoiceInputButton } from '../../components/ai/AiKit';
import {
  applyFilter, BLOCK_LABELS, describeBlock, designReport, DIMENSION_LABELS, ENTITY_LABELS, groupRows, loadReportDataset,
  ReportBlock, ReportDataset, ReportSpec, STATE_LABELS,
} from '../../services/ai/reportBuilder';
import { officialDocumentHtml } from '../../services/documentService';
import { exportHtmlToPdf } from '../../utils/pdfExport';
import { getCurrentJalaliDate } from '../../utils/date';
import { toPersianDigits } from '../../utils/formatters';

const COLORS = ['#2563eb', '#0d9488', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#db2777', '#475569', '#ea580c'];
const EXAMPLES = [
  'یک لیست از همه مصوبات معوق، یک نمودار دایره‌ای از وضعیت مصوبات و یک نمودار میله‌ای از تعداد مصوبات هر واحد',
  'روند ماهانه جلسات و نمودار دایره‌ای انواع جلسه',
  'تعداد کل وظایف، نمودار میله‌ای وظایف به تفکیک مسئول و لیست وظایف معوق',
  'مصوبات اداره کل امور مالی: نمودار دایره‌ای وضعیت و جدول همه مصوبات',
];
const HISTORY_KEY = 'msb-report-requests';

const fa = (n: number | string) => toPersianDigits(String(n));

/** یک بلوک گزارش با داده واقعی. */
const BlockView: React.FC<{ block: ReportBlock; data: ReportDataset; onRemove: () => void; onOpen: (route: string, id: string) => void }> = ({ block, data, onRemove, onOpen }) => {
  const rows = useMemo(() => applyFilter(data[block.entity], block.filter), [block, data]);
  const grouped = useMemo(() => (block.groupBy ? groupRows(rows, block.groupBy) : []), [rows, block.groupBy]);
  const title = describeBlock(block);
  const wide = block.type === 'table' || block.type === 'line';
  return (
    <section className={`report-block bg-white rounded-2xl border border-slate-200 p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <header className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{fa(rows.length)} مورد · {BLOCK_LABELS[block.type]}</p>
        </div>
        <button type="button" onClick={onRemove} aria-label="حذف این بخش از گزارش" title="حذف این بخش" className="no-export p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50"><X className="w-4 h-4" /></button>
      </header>

      {rows.length === 0 && <div className="text-xs text-slate-400 text-center py-8">با این شرایط موردی پیدا نشد.</div>}

      {rows.length > 0 && block.type === 'kpi' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: `کل ${ENTITY_LABELS[block.entity]}`, value: rows.length },
            { label: 'معوق', value: rows.filter((r) => r.overdue).length },
            { label: 'خاتمه‌یافته', value: rows.filter((r) => r.closed).length },
            { label: 'در جریان', value: rows.filter((r) => !r.closed && !r.overdue).length },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <div className="text-2xl font-black text-slate-900">{fa(k.value)}</div>
              <div className="text-[10px] font-bold text-slate-500 mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && block.type === 'pie' && (
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={grouped} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={2} label={({ value }) => fa(value as number)} isAnimationActive={false}>
                {grouped.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${fa(v as number)} مورد`, 'تعداد']} contentStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: 11, borderRadius: 12 }} />
              <Legend wrapperStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {rows.length > 0 && block.type === 'bar' && (
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grouped} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={60} tick={{ fontSize: 10, fontFamily: 'Vazirmatn' }} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: 'Vazirmatn' }} tickFormatter={(v) => fa(v)} />
              <Tooltip formatter={(v) => [`${fa(v as number)} مورد`, 'تعداد']} contentStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: 11, borderRadius: 12 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {grouped.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {rows.length > 0 && block.type === 'line' && (
        grouped.length === 0
          ? <div className="text-xs text-slate-400 text-center py-8">این موارد تاریخ ثبت‌شده ندارند.</div>
          : (
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={grouped} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'Vazirmatn' }} tickFormatter={(v: string) => toPersianDigits(v)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: 'Vazirmatn' }} tickFormatter={(v) => fa(v)} />
                  <Tooltip formatter={(v) => [`${fa(v as number)} مورد`, 'تعداد']} labelFormatter={(l) => toPersianDigits(String(l))} contentStyle={{ direction: 'rtl', fontFamily: 'Vazirmatn', fontSize: 11, borderRadius: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
      )}

      {rows.length > 0 && block.type === 'table' && (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500 sticky top-0">
              <tr className="text-right">
                <th className="p-2">شماره</th><th className="p-2">عنوان</th><th className="p-2">{block.entity === 'meetings' ? 'دبیر' : block.entity === 'proposals' ? 'پیشنهاددهنده' : 'مسئول'}</th><th className="p-2">واحد</th><th className="p-2">{block.entity === 'meetings' ? 'تاریخ' : 'مهلت'}</th><th className="p-2">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, block.limit || 200).map((r) => (
                <tr key={r.id} onClick={() => onOpen(r.route, r.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="p-2 font-bold text-blue-700 whitespace-nowrap">{fa(r.number || '—')}</td>
                  <td className="p-2 font-bold text-slate-800">{r.title}</td>
                  <td className="p-2 text-slate-600">{r.person}</td>
                  <td className="p-2 text-slate-600">{r.department}</td>
                  <td className="p-2 text-slate-600 whitespace-nowrap">{fa((block.entity === 'meetings' ? r.date : r.deadline) || '—')}</td>
                  <td className="p-2"><span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${r.overdue ? 'bg-rose-50 text-rose-700' : r.closed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{r.statusLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

/** «گزارش‌ساز»: درخواست متنی ← طرح گزارش ← جدول و نمودار با داده واقعی. */
export const ReportBuilder: React.FC = () => {
  const { currentUser, navigateTo, showToast } = useApp();
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useState<ReportSpec | null>(null);
  const [asked, setAsked] = useState('');
  const [history, setHistory] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`${HISTORY_KEY}:${currentUser.id}`) || '[]'); } catch { return []; } });
  const reportRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => (spec ? loadReportDataset(currentUser) : null), [spec, currentUser]);

  const build = async (text = request) => {
    const q = text.trim();
    if (!q) { showToast('گزارش‌ساز', 'بنویسید چه گزارشی لازم دارید.', 'warning'); return; }
    setBusy(true);
    try {
      const res = await designReport(q, currentUser.id);
      setSpec(res.data);
      setAsked(q);
      const next = [q, ...history.filter((h) => h !== q)].slice(0, 6);
      setHistory(next);
      try { localStorage.setItem(`${HISTORY_KEY}:${currentUser.id}`, JSON.stringify(next)); } catch { /* ignore */ }
    } finally { setBusy(false); }
  };

  const removeBlock = (index: number) => setSpec((s) => (s ? { ...s, blocks: s.blocks.filter((_, i) => i !== index) } : s));

  const exportPdf = () => {
    if (!reportRef.current || !spec) return;
    const clone = reportRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-export').forEach((el) => el.remove());
    clone.querySelectorAll('.report-block').forEach((el) => { (el as HTMLElement).style.cssText = 'border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:14px;page-break-inside:avoid;'; });
    const body = `<p style="font-size:11px;color:#64748b">درخواست: «${asked.replace(/</g, '&lt;')}»</p>${clone.innerHTML}`;
    const opened = exportHtmlToPdf(spec.title, officialDocumentHtml(spec.title, `تهیه‌شده برای ${currentUser.fullName}`, body, { date: getCurrentJalaliDate() }), { wordExport: true, autoPrint: false, fileName: 'CustomReport' });
    if (!opened) showToast('خطا', 'مرورگر پنجره چاپ را مسدود کرد.', 'error');
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5"><LayoutTemplate className="w-4 h-4 text-teal-700" />گزارش‌ساز: هر گزارشی لازم دارید بنویسید</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">مثلاً «یک لیست از همه مصوبات معوق و یک نمودار دایره‌ای از وضعیت مصوبات». اعداد همیشه از داده‌های واقعی سامانه و در محدوده دسترسی شما محاسبه می‌شوند.</p>
        </div>
      </div>

      <div className="flex gap-2 items-start">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void build(); }}
          rows={2}
          placeholder="گزارشی که لازم دارید را بنویسید یا بگویید…"
          aria-label="درخواست گزارش"
          className="flex-1 text-xs leading-6 p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
        />
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => void build()} disabled={busy} className="flex items-center gap-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 px-4 py-2.5 rounded-xl">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}ساخت گزارش
          </button>
          <VoiceInputButton className="justify-center p-2 border border-slate-200" label="گفتن" onText={(t, isFinal) => { if (isFinal) setRequest((prev) => (prev ? `${prev} ${t}` : t)); }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setRequest(ex); void build(ex); }} className="text-[10.5px] font-bold text-slate-600 bg-slate-50 border border-slate-200 hover:border-teal-300 hover:text-teal-800 px-2.5 py-1 rounded-full text-right">{ex}</button>
        ))}
      </div>
      {history.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="flex items-center gap-1 text-slate-400"><History className="w-3.5 h-3.5" />اخیر:</span>
          {history.map((h) => <button key={h} type="button" onClick={() => { setRequest(h); void build(h); }} className="text-teal-800 hover:underline max-w-[320px] truncate">{h}</button>)}
        </div>
      )}

      {spec && data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-teal-50/60 border border-teal-100 p-3">
            <div className="space-y-1.5">
              <div className="text-xs font-extrabold text-teal-950">{spec.title}</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-slate-500">برداشت سامانه از درخواست شما:</span>
                {spec.blocks.map((b, i) => (
                  <span key={i} className="text-[10px] font-bold bg-white border border-teal-200 text-teal-900 px-2 py-0.5 rounded-full">
                    {BLOCK_LABELS[b.type]} · {ENTITY_LABELS[b.entity]}{b.groupBy ? ` · ${DIMENSION_LABELS[b.groupBy]}` : ''}{b.filter?.state ? ` · ${STATE_LABELS[b.filter.state]}` : ''}{b.filter?.department ? ` · ${b.filter.department}` : ''}{b.filter?.year ? ` · ${fa(b.filter.year)}` : ''}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={exportPdf} className="flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-white border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-xl"><FileDown className="w-3.5 h-3.5" />خروجی PDF / Word</button>
              <button type="button" onClick={() => { setSpec(null); setRequest(''); }} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl"><RotateCcw className="w-3.5 h-3.5" />گزارش تازه</button>
            </div>
          </div>
          <div ref={reportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {spec.blocks.map((block, i) => (
              <BlockView key={`${i}-${block.type}-${block.entity}-${block.groupBy || ''}`} block={block} data={data} onRemove={() => removeBlock(i)} onOpen={(route, id) => navigateTo(route as never, route === 'meeting-details' ? { meetingId: id } : route === 'resolutions' ? { resolutionId: id } : undefined)} />
            ))}
          </div>
          {spec.blocks.length === 0 && <div className="text-xs text-slate-400 text-center py-6">همه بخش‌ها حذف شدند؛ درخواست تازه‌ای بنویسید.</div>}
        </div>
      )}
    </section>
  );
};
