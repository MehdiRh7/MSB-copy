import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid, RotateCcw, X } from 'lucide-react';
import { loadLocalValue, saveLocalValue } from '../../services/localStore';

/** بخش‌های قابل شخصی‌سازی داشبورد. */
export const DASHBOARD_SECTIONS = [
  { id: 'brief', label: 'خلاصه هوشمند امروز' },
  { id: 'pulse', label: 'نبض مصوبات (نمودار و شاخص‌ها)' },
  { id: 'todo', label: 'کارهای من' },
  { id: 'meetings', label: 'جلسات پیش‌رو' },
  { id: 'resolutions', label: 'مصوبات در جریان' },
  { id: 'role', label: 'کارت مخصوص نقش' },
  { id: 'activity', label: 'آخرین اتفاقات' },
] as const;
export type DashboardSectionId = typeof DASHBOARD_SECTIONS[number]['id'];

interface Layout { order: DashboardSectionId[]; hidden: DashboardSectionId[] }
const DEFAULT: Layout = { order: DASHBOARD_SECTIONS.map((s) => s.id), hidden: [] };
const KEY = 'dashboardLayouts';

const load = (userId: string): Layout => {
  const saved = loadLocalValue<Record<string, Layout>>(KEY, {})[userId];
  if (!saved) return DEFAULT;
  const order = [...saved.order.filter((id) => DEFAULT.order.includes(id)), ...DEFAULT.order.filter((id) => !saved.order.includes(id))];
  return { order, hidden: saved.hidden.filter((id) => DEFAULT.order.includes(id)) };
};

/** چیدمان شخصی هر کاربر (ترتیب و نمایش بخش‌ها) — در مرورگر ذخیره می‌شود. */
export const useDashboardLayout = (userId: string) => {
  const [layout, setLayout] = useState<Layout>(() => load(userId));
  const [loadedFor, setLoadedFor] = useState(userId);
  if (loadedFor !== userId) { setLoadedFor(userId); setLayout(load(userId)); }
  const persist = (next: Layout) => {
    setLayout(next);
    saveLocalValue(KEY, { ...loadLocalValue<Record<string, Layout>>(KEY, {}), [userId]: next });
  };
  return {
    layout,
    isVisible: (id: DashboardSectionId) => !layout.hidden.includes(id),
    /** مقدار CSS order — بخش‌ها با flex/grid order مرتب می‌شوند. */
    orderOf: (id: DashboardSectionId) => layout.order.indexOf(id) + 1,
    toggle: (id: DashboardSectionId) => persist({ ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] }),
    move: (id: DashboardSectionId, delta: number) => {
      const order = [...layout.order];
      const i = order.indexOf(id); const j = i + delta;
      if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      persist({ ...layout, order });
    },
    reset: () => persist(DEFAULT),
  };
};

export const DashboardCustomizer: React.FC<{ api: ReturnType<typeof useDashboardLayout>; onClose: () => void }> = ({ api, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh]" onMouseDown={onClose} dir="rtl">
    <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 p-4 space-y-3" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="شخصی‌سازی داشبورد">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5"><LayoutGrid className="w-4 h-4 text-indigo-600" />شخصی‌سازی داشبورد</h3>
        <button onClick={onClose} aria-label="بستن" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[11px] text-slate-500">بخش‌ها را نمایش دهید یا پنهان کنید و ترتیبشان را تغییر دهید. چیدمان فقط برای شما ذخیره می‌شود.</p>
      <ul className="space-y-1.5">
        {api.layout.order.map((id, index) => {
          const section = DASHBOARD_SECTIONS.find((s) => s.id === id)!;
          const visible = api.isVisible(id);
          return (
            <li key={id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${visible ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-60'}`}>
              <button onClick={() => api.toggle(id)} aria-label={visible ? 'پنهان کردن' : 'نمایش'} className={`p-1 rounded-lg ${visible ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-slate-100'}`}>{visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
              <span className="flex-1 text-[12px] font-bold text-slate-700">{section.label}</span>
              <button onClick={() => api.move(id, -1)} disabled={index === 0} aria-label="بالا" className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => api.move(id, 1)} disabled={index === api.layout.order.length - 1} aria-label="پایین" className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
            </li>
          );
        })}
      </ul>
      <button onClick={api.reset} className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800"><RotateCcw className="w-3.5 h-3.5" />بازگشت به چیدمان پیش‌فرض</button>
    </div>
  </div>
);
