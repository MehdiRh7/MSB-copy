import React, { useState } from 'react';
import { Database, DownloadCloud, Eraser, Info, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { countDemoRecords, countManualRecords, DEMO_COLLECTION_KEYS, DEMO_COLLECTION_LABELS, DEMO_DATA_VERSION, getDemoDataInfo, loadDemoData, resetDemoData } from '../../services/demoDataService';
import { toPersianDigits } from '../../utils/formatters';

/**
 * کنترل صریح مدیر سیستم روی داده نمایشی. هیچ داده‌ای بدون تأیید بارگذاری یا
 * حذف نمی‌شود و محدوده بازنشانی پیش از اقدام به‌صورت شمارشی نمایش داده می‌شود.
 */
export const DemoDataTab: React.FC = () => {
  const { showToast } = useApp();
  const [busy, setBusy] = useState<'load' | 'reset' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const demoCounts = countDemoRecords();
  const manualCounts = countManualRecords();
  const info = getDemoDataInfo();
  const totalDemo = Object.values(demoCounts).reduce((a, b) => a + b, 0);
  const totalManual = Object.values(manualCounts).reduce((a, b) => a + b, 0);
  const outdated = Boolean(info && info.version < DEMO_DATA_VERSION && totalDemo > 0);

  const reloadSoon = () => window.setTimeout(() => window.location.reload(), 500);

  const handleLoad = () => {
    setBusy('load');
    loadDemoData();
    showToast('داده نمایشی', 'داده نمایشی بارگذاری شد؛ صفحه برای خواندن مجدد اطلاعات تازه می‌شود.', 'success');
    reloadSoon();
  };

  const handleReset = () => {
    setBusy('reset');
    resetDemoData();
    showToast('بازنشانی داده نمایشی', 'فقط رکوردهای نمایشی حذف شدند؛ صفحه تازه می‌شود.', 'success');
    reloadSoon();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="app-panel p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="dash-section-icon"><Database className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-bold text-slate-800">داده نمایشی دمو</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500">یک گردش کامل و قابل کلیک شامل پیشنهاد، جلسه، مصوبه در حال اجرا، مصوبه معوق، مورد در انتظار امضا، ابلاغیه، وظیفه مجری و مورد در انتظار صحه‌گذاری. همه رکوردها شناسه «demo-» دارند و در همین مرورگر (localStorage) ذخیره می‌شوند.</p>
          </div>
        </div>

        <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${totalDemo > 0 ? 'border-blue-200 bg-blue-50/70 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          <Info className="h-4 w-4 shrink-0" />
          {totalDemo > 0
            ? <span>داده نمایشی بارگذاری شده است ({toPersianDigits(totalDemo)} رکورد{info ? `، نسخه ${toPersianDigits(info.version)}` : ''}).{outdated && ' نسخه جدیدتری موجود است؛ با «بارگذاری مجدد» به‌روز می‌شود.'}</span>
            : <span>داده نمایشی بارگذاری نشده است؛ سامانه در حالت شروع بدون داده نمایشی است.</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={handleLoad} disabled={busy !== null} aria-busy={busy === 'load'} className="app-btn-primary">
            {busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
            {totalDemo > 0 ? 'بارگذاری مجدد داده نمایشی' : 'بارگذاری داده نمایشی'}
          </button>
          <button onClick={() => setConfirmReset(true)} disabled={busy !== null || totalDemo === 0} className="app-btn-secondary">
            <Eraser className="h-4 w-4" />بازنشانی فقط داده نمایشی
          </button>
        </div>

        {confirmReset && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
            <p className="text-xs font-bold text-amber-900">محدوده بازنشانی</p>
            <p className="mt-1 text-[12px] leading-6 text-amber-900/80">فقط رکوردهای زیر حذف می‌شوند. {totalManual > 0 ? `${toPersianDigits(totalManual)} رکورد ثبت‌شده توسط کاربران` : 'رکوردهای ثبت‌شده توسط کاربران'}، کاربران، ساختار سازمانی و تنظیمات دست‌نخورده می‌مانند. تغییراتی که روی رکوردهای نمایشی انجام داده‌اید نیز حذف می‌شود.</p>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {DEMO_COLLECTION_KEYS.filter((k) => demoCounts[k] > 0).map((key) => (
                <li key={key} className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 text-[12px]"><span className="text-slate-600">{DEMO_COLLECTION_LABELS[key]}</span><strong className="text-slate-900">{toPersianDigits(demoCounts[key])}</strong></li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-white">انصراف</button>
              <button onClick={handleReset} disabled={busy !== null} aria-busy={busy === 'reset'} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50">
                {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}حذف {toPersianDigits(totalDemo)} رکورد نمایشی
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="app-panel p-5">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--app-primary)]" /><h3 className="text-xs font-bold text-slate-800">داده‌های فعلی این مرورگر</h3></div>
        <table className="dash-table mt-3">
          <thead><tr><th>مجموعه</th><th>دستی</th><th>نمایشی</th></tr></thead>
          <tbody>
            {DEMO_COLLECTION_KEYS.filter((k) => demoCounts[k] + manualCounts[k] > 0).map((key) => (
              <tr key={key}><td className="text-slate-700">{DEMO_COLLECTION_LABELS[key]}</td><td>{toPersianDigits(manualCounts[key])}</td><td>{toPersianDigits(demoCounts[key])}</td></tr>
            ))}
            {totalDemo + totalManual === 0 && <tr><td colSpan={3} className="text-center text-slate-400">هنوز داده‌ای ثبت نشده است.</td></tr>}
          </tbody>
        </table>
        <p className="mt-3 text-[12px] leading-6 text-slate-500">بارگذاری مجدد فقط رکوردهای نمایشی را بازسازی می‌کند و داده دستی را پاک نمی‌کند.</p>
      </section>
    </div>
  );
};
