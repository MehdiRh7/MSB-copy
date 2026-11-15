import React from 'react';
import { X } from 'lucide-react';

interface FormHeroProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  meta?: string[];
  onClose?: () => void;
}

/**
 * سربرگ آبی فرم‌های سبک (مودال‌هایی که داخل کارت p-5 رندر می‌شوند)؛ هم‌خانواده
 * با app-modal-header فرم‌های بزرگ مثل جلسه جدید و ثبت مصوبه.
 */
export const FormHero: React.FC<FormHeroProps> = ({ icon: Icon, title, subtitle, meta, onClose }) => (
  <div className="app-form-hero">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="app-form-hero-icon"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-6 text-white">{title}</h3>
          {subtitle && <p className="text-[12px] leading-5 text-blue-100/90">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-blue-100 hover:bg-white/15 hover:text-white" aria-label="بستن">
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
    {meta && meta.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {meta.map((m) => <span key={m} className="max-w-full truncate rounded-full bg-white/14 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-white/20">{m}</span>)}
      </div>
    )}
  </div>
);
