import React, { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toPersianDigits } from '../../utils/formatters';

interface BulkSelectionBarProps {
  /** تعداد کل آیتم‌های قابل انتخاب در لیست فعلی */
  totalCount: number;
  /** تعداد آیتم‌های انتخاب‌شده در همین لیست */
  selectedCount: number;
  onToggleAll: (selectAll: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
  approveLabel?: string;
  rejectLabel?: string;
}

/**
 * نوار «انتخاب همه + عملیات گروهی» — Pattern مشترک کارتابل‌ها.
 * Checkbox سه‌حالته است: خالی / Indeterminate (انتخاب جزئی) / تیک‌خورده.
 * این Component فقط Selection را مدیریت می‌کند و هیچ منطق تأیید/ردی ندارد؛
 * تصمیم‌ها همان Handlerهای موجود هر کارتابل هستند.
 */
export const BulkSelectionBar: React.FC<BulkSelectionBarProps> = ({
  totalCount,
  selectedCount,
  onToggleAll,
  onApprove,
  onReject,
  onClear,
  approveLabel = 'تایید گروهی',
  rejectLabel = 'رد گروهی',
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const isIndeterminate = selectedCount > 0 && selectedCount < totalCount;

  // حالت Indeterminate فقط از طریق DOM قابل تنظیم است و Attribute ندارد.
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);

  if (totalCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-2 text-[12px] font-bold text-slate-600 cursor-pointer select-none">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={(event) => onToggleAll(event.target.checked)}
          className="w-4 h-4 text-teal-700 rounded-md cursor-pointer"
        />
        <span>انتخاب همه ({toPersianDigits(totalCount)})</span>
      </label>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-slate-500">{toPersianDigits(selectedCount)} مورد انتخاب شده</span>
          <button onClick={onApprove} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold py-1.5 px-3 rounded-full cursor-pointer">
            <CheckCircle2 className="w-3.5 h-3.5" />{approveLabel}
          </button>
          <button onClick={onReject} className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[12px] font-bold py-1.5 px-3 rounded-full cursor-pointer">
            <XCircle className="w-3.5 h-3.5" />{rejectLabel}
          </button>
          <button onClick={onClear} className="text-[12px] font-bold text-slate-500 hover:text-slate-700 px-2 cursor-pointer">لغو انتخاب</button>
        </div>
      )}
    </div>
  );
};
