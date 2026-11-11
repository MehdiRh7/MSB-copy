import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Sparkles } from 'lucide-react';
import { User } from '../../types';
import { AiSourceBadge, useAiFeature } from '../../components/ai/AiKit';
import { dashboardBrief, DailyBrief } from '../../services/ai/aiService';
import type { AiResult } from '../../services/ai/aiClient';
import type { DashboardModel } from './dashboardData';

// درخواست‌های هم‌زمان با یک کلید (StrictMode / رندر مجدد) فقط یک بار ارسال می‌شوند.
const inFlight = new Map<string, Promise<AiResult<DailyBrief>>>();

const cacheKey = (user: User, model: DashboardModel) => `msb-ai-brief:${user.id}:${model.today}:${model.actionItems.length}:${model.counts.overdue}`;

/**
 * «خلاصه هوشمند امروز» — یک بار در روز (یا با تغییر کارتابل) برای هر کاربر
 * تولید و در مرورگر Cache می‌شود تا سهمیه رایگان ارائه‌دهنده هدر نرود.
 */
export const AiDailyBrief: React.FC<{ user: User; model: DashboardModel; onOpenTodo: () => void }> = ({ user, model, onOpenTodo }) => {
  const enabled = useAiFeature('dashboardBrief');
  const [result, setResult] = useState<AiResult<DailyBrief> | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async (force = false) => {
    const key = cacheKey(user, model);
    if (!force) {
      try {
        const cached = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (cached) { setResult(JSON.parse(cached)); return; }
      } catch { /* ignore */ }
    }
    setLoading(true);
    try {
      let pending = inFlight.get(key);
      if (!pending || force) {
        pending = dashboardBrief(user, model, user.id).then((res) => {
          try { localStorage.setItem(key, JSON.stringify(res)); } catch { /* ignore */ }
          return res;
        }).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      setResult(await pending);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (enabled && model.hasAnyData) generate(); }, [enabled, user.id, model.today, model.actionItems.length, model.counts.overdue]);

  if (!enabled || !model.hasAnyData) return null;
  return (
    <section className="ai-brief relative overflow-hidden rounded-3xl p-4 sm:p-5 text-white shadow-lg bg-gradient-to-l from-[#0b2a5b] via-[#1e40af] to-[#6d28d9]">
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-10 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-2xl bg-white/15 p-2"><Sparkles className="h-5 w-5" /></span>
          <div>
            <div className="text-[11px] font-bold text-blue-100">خلاصه هوشمند امروز</div>
            {loading && !result ? <div className="mt-1 h-4 w-64 animate-pulse rounded bg-white/20" /> : <h2 className="text-sm sm:text-base font-extrabold leading-7">{result?.data.headline}</h2>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && <span className="rounded-full bg-white p-0.5"><AiSourceBadge result={result} /></span>}
          <button onClick={() => generate(true)} disabled={loading} title="تولید دوباره" aria-label="تولید دوباره خلاصه" className="rounded-xl bg-white/10 p-2 hover:bg-white/20 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {result && (
        <div className="relative mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <ul className="space-y-1.5 text-[12px] text-blue-50">
            {result.data.bullets.map((bullet) => <li key={bullet} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />{bullet}</li>)}
          </ul>
          {result.data.focus && (
            <button onClick={onOpenTodo} className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[12px] font-extrabold text-indigo-900 shadow hover:bg-blue-50">
              <span>🎯 {result.data.focus}</span><ArrowLeft className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>
      )}
    </section>
  );
};
