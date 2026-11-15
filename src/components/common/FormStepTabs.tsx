import React from 'react';
import { AlertCircle, Check } from 'lucide-react';

export interface FormStep {
  label: string;
  icon?: React.ElementType;
  /** تعداد خطاهای ضروری این بخش؛ فقط وقتی showErrors فعال باشد نمایش داده می‌شود. */
  errorCount?: number;
  /** بخش کامل است (برای تیک سبز‌آبی). */
  complete?: boolean;
}

interface FormStepTabsProps {
  steps: FormStep[];
  active: number;
  onSelect: (index: number) => void;
  showErrors?: boolean;
  ariaLabel: string;
}

/**
 * تب‌های مرحله فرم که ناوبری واقعی هستند: هر تب قابل کلیک است و عبور بین
 * بخش‌ها قفل نمی‌شود؛ خطاهای هر بخش با نشان روی همان تب دیده می‌شوند.
 */
export const FormStepTabs: React.FC<FormStepTabsProps> = ({ steps, active, onSelect, showErrors = false, ariaLabel }) => (
  <div className="form-steps" role="tablist" aria-label={ariaLabel}>
    {steps.map((step, index) => {
      const Icon = step.icon;
      const hasError = showErrors && (step.errorCount || 0) > 0;
      const isActive = index === active;
      return (
        <button
          key={step.label}
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-invalid={hasError || undefined}
          onClick={() => onSelect(index)}
          className={`form-step ${isActive ? 'form-step-active' : ''} ${hasError ? 'form-step-error' : ''}`}
        >
          <span className="form-step-index">
            {hasError ? <AlertCircle className="h-3.5 w-3.5" /> : step.complete && !isActive ? <Check className="h-3.5 w-3.5" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : (index + 1).toLocaleString('fa-IR')}
          </span>
          <span className="truncate">{step.label}</span>
          {hasError && <span className="form-step-badge">{(step.errorCount || 0).toLocaleString('fa-IR')}</span>}
        </button>
      );
    })}
  </div>
);

export interface FormFieldError { step: number; fieldId: string; message: string }

/** خلاصه خطاها؛ کلیک روی هر خطا کاربر را به همان تب و فیلد می‌برد. */
export const FormErrorSummary: React.FC<{ errors: FormFieldError[]; steps: FormStep[]; onJump: (error: FormFieldError) => void }> = ({ errors, steps, onJump }) => {
  if (errors.length === 0) return null;
  return (
    <div className="form-error-summary" role="alert">
      <p className="flex items-center gap-1.5 text-xs font-bold"><AlertCircle className="h-4 w-4" />پیش از ثبت، {errors.length.toLocaleString('fa-IR')} مورد ضروری را کامل کنید:</p>
      <ul className="mt-2 space-y-1">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <button type="button" onClick={() => onJump(error)} className="form-error-link">
              <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">{steps[error.step]?.label}</span>
              <span>{error.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** بعد از تغییر تب، فیلد موردنظر را پیدا و فوکوس می‌کند. */
export const focusField = (fieldId: string) => {
  window.setTimeout(() => {
    const host = document.getElementById(fieldId);
    if (!host) return;
    const target = (host.matches('input,select,textarea,button') ? host : host.querySelector('input,select,textarea,button')) as HTMLElement | null;
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
    host.classList.add('form-field-flash');
    window.setTimeout(() => host.classList.remove('form-field-flash'), 1600);
    target?.focus({ preventScroll: true });
  }, 60);
};
