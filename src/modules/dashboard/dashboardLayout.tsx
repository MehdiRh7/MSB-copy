import React, { useState } from 'react';
import { ArrowDown, ArrowUp, LayoutGrid, RotateCcw, X } from 'lucide-react';
import { loadLocalValue, saveLocalValue } from '../../services/localStore';

/** بخش‌های قابل شخصی‌سازی داشبورد. */
export const DASHBOARD_SECTIONS = [
  { id: 'pulse', label: 'ردیف اعداد (کارها، جلسات، مصوبات)' },
  { id: 'brief', label: 'خلاصه امروز' },
  { id: 'status', label: 'نمودار وضعیت مصوبات' },
  { id: 'todo', label: 'کارهای من' },
  { id: 'meetings', label: 'جلسات پیش‌رو' },
  { id: 'resolutions', label: 'مصوبات در جریان' },
  { id: 'role', label: 'وضعیت واحدها / کارهای نقش من' },
  { id: 'activity', label: 'آخرین فعالیت‌ها' },
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
  <div className="fixed inset-0 z-50 bg-slate-950/30" onMouseDown={onClose} dir="rtl">
    <div className="layout-drawer fixed left-0 inset-y-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="شخصی‌سازی داشبورد">
      <div className="drawer-head">
        <div className="flex items-center gap-2.5">
          <span className="drawer-head-icon"><LayoutGrid className="w-5 h-5" /></span>
          <div>
            <h3 className="text-[15px] font-bold">شخصی‌سازی پیشخوان</h3>
            <p className="text-[12px] text-white/75 mt-0.5">انتخاب کنید چه بخش‌هایی و به چه ترتیبی دیده شوند</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="بستن" className="p-1.5 rounded-lg text-white/80 hover:bg-white/15"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center justify-between text-[12px] text-slate-500">
          <span>بخش‌های پیشخوان</span>
          <span>{api.layout.order.filter((id) => api.isVisible(id)).length} از {api.layout.order.length} فعال</span>
        </div>
        <ul className="space-y-2">
          {api.layout.order.map((id, index) => {
            const section = DASHBOARD_SECTIONS.find((s) => s.id === id)!;
            const visible = api.isVisible(id);
            return (
              <li key={id} className={`drawer-row ${visible ? '' : 'drawer-row-off'}`}>
                <span className="drawer-row-num">{index + 1}</span>
                <span className="flex-1 text-[13px] font-semibold text-slate-800">{section.label}</span>
                <span className="flex flex-col">
                  <button onClick={() => api.move(id, -1)} disabled={index === 0} aria-label="بالا" title="بالاتر" className="drawer-move"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => api.move(id, 1)} disabled={index === api.layout.order.length - 1} aria-label="پایین" title="پایین‌تر" className="drawer-move"><ArrowDown className="w-3.5 h-3.5" /></button>
                </span>
                <button onClick={() => api.toggle(id)} aria-label={visible ? 'پنهان کردن' : 'نمایش'} title={visible ? 'پنهان کردن' : 'نمایش'} className={`drawer-switch ${visible ? 'is-on' : ''}`} role="switch" aria-checked={visible}><span /></button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-slate-200 p-3 flex items-center justify-between gap-2 bg-slate-50">
        <button onClick={api.reset} className="flex items-center gap-1 text-[12px] font-bold text-slate-600 hover:text-slate-900"><RotateCcw className="w-3.5 h-3.5" />بازگشت به پیش‌فرض</button>
        <button onClick={onClose} className="app-btn-primary">تأیید</button>
      </div>
    </div>
  </div>
);
