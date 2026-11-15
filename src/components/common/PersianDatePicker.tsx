import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { toPersianDigits } from '../../utils/formatters';
import { jalaliToGregorian } from '../../utils/jalaliDate';
import { getCurrentJalaliDate } from '../../utils/date';

interface PersianDatePickerProps {
  value: string; // e.g. "۱۴۰۳/۰۷/۰۵" or "1403/07/05"
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  minYear?: number;
  maxYear?: number;
}

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const OFFICIAL_SOLAR_HOLIDAYS: Record<string, string> = {
  '01/01': 'نوروز',
  '01/02': 'نوروز',
  '01/03': 'نوروز',
  '01/04': 'نوروز',
  '01/12': 'روز جمهوری اسلامی',
  '01/13': 'روز طبیعت',
  '03/14': 'رحلت امام خمینی (ره)',
  '03/15': 'قیام ۱۵ خرداد',
  '11/22': 'پیروزی انقلاب اسلامی',
  '12/29': 'ملی شدن صنعت نفت',
};

const getWeekDayIndex = (year: number, month: number, day: number) => {
  const [gy, gm, gd] = jalaliToGregorian(year, month, day);
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7;
};

export const PersianDatePicker: React.FC<PersianDatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'انتخاب تاریخ شمسی',
  required = false,
  disabled = false,
  className = '',
  minYear = 1400,
  maxYear = 1408,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const parseJalali = (valStr: string) => {
    if (!valStr) valStr = getCurrentJalaliDate();
    // Convert any Persian digits to English for parsing
    const standardStr = valStr
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[^0-9/]/g, '');
    const parts = standardStr.split('/');
    const [todayYear, todayMonth, todayDay] = getCurrentJalaliDate().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).split('/').map(Number);
    const y = parts[0] ? parseInt(parts[0], 10) : todayYear;
    const m = parts[1] ? parseInt(parts[1], 10) : todayMonth;
    const d = parts[2] ? parseInt(parts[2], 10) : todayDay;
    return {
      year: isNaN(y) ? todayYear : y,
      month: isNaN(m) || m < 1 || m > 12 ? todayMonth : m,
      day: isNaN(d) || d < 1 || d > 31 ? todayDay : d,
    };
  };

  const currentParsed = parseJalali(value);
  const [viewYear, setViewYear] = useState<number>(currentParsed.year);
  const [viewMonth, setViewMonth] = useState<number>(currentParsed.month);

  useEffect(() => {
    if (value) {
      const parsed = parseJalali(value);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysInMonth = (year: number, month: number): number => {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    // Leap year check approximation for Jalali
    const isLeap = [1, 5, 9, 13, 17, 22, 26, 30].includes(year % 33);
    return isLeap ? 30 : 29;
  };

  const handleSelectDay = (day: number) => {
    const yStr = viewYear.toString();
    const mStr = viewMonth < 10 ? `0${viewMonth}` : `${viewMonth}`;
    const dStr = day < 10 ? `0${day}` : `${day}`;
    const formatted = `${yStr}/${mStr}/${dStr}`;
    onChange(toPersianDigits(formatted));
    setIsOpen(false);
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleQuickSelect = (daysToAdd: number) => {
    // Current base: 1403/07/15 + daysToAdd
    let d = currentParsed.day + daysToAdd;
    let m = currentParsed.month;
    let y = currentParsed.year;
    while (d > getDaysInMonth(y, m)) {
      d -= getDaysInMonth(y, m);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    const yStr = y.toString();
    const mStr = m < 10 ? `0${m}` : `${m}`;
    const dStr = d < 10 ? `0${d}` : `${d}`;
    onChange(toPersianDigits(`${yStr}/${mStr}/${dStr}`));
    setIsOpen(false);
  };

  const daysCount = getDaysInMonth(viewYear, viewMonth);
  const firstDayOffset = getWeekDayIndex(viewYear, viewMonth, 1);
  const yearsList = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearsList.push(y);
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full text-xs p-2.5 bg-slate-50 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
          disabled
            ? 'opacity-60 bg-slate-100 cursor-not-allowed border-slate-200'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white shadow-xs'
            : 'border-slate-200 hover:border-slate-300 hover:bg-white'
        }`}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
          <span className={value ? 'text-slate-800 font-bold' : 'text-slate-400'}>
            {value ? toPersianDigits(value) : placeholder}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 bg-slate-200/60 rounded-md">
          شمسی
        </span>
      </div>

      {/* Date Picker Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-3.5 w-72 animate-in fade-in zoom-in-95 text-slate-800 select-none">
          {/* Header Controls: Year & Month Selectors */}
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
              title="ماه قبل"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>
                    {toPersianDigits(y)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
              title="ماه بعد"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1 mb-2.5 overflow-x-auto pb-1 text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickSelect(0)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 shrink-0 font-medium"
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(3)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 shrink-0 font-medium"
            >
              ۳ روز دیگر
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(7)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 shrink-0 font-medium"
            >
              ۱ هفته دیگر
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(14)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 shrink-0 font-medium"
            >
              ۲ هفته دیگر
            </button>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 mb-1">
            {WEEK_DAYS.map((day, index) => <span key={day} className={index === 6 ? 'text-rose-500' : ''}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: firstDayOffset }).map((_, idx) => <span key={`blank-${idx}`} />)}
            {Array.from({ length: daysCount }).map((_, idx) => {
              const day = idx + 1;
              const key = `${viewMonth.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
              const officialHoliday = OFFICIAL_SOLAR_HOLIDAYS[key];
              const isFriday = getWeekDayIndex(viewYear, viewMonth, day) === 6;
              const holidayTitle = officialHoliday || (isFriday ? 'جمعه' : '');
              const isSelected =
                currentParsed.year === viewYear &&
                currentParsed.month === viewMonth &&
                currentParsed.day === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  title={holidayTitle || undefined}
                  aria-label={holidayTitle ? `${toPersianDigits(day)}، تعطیل: ${holidayTitle}` : toPersianDigits(day)}
                  className={`h-8 rounded-lg font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : holidayTitle
                      ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 ring-1 ring-rose-100'
                      : 'hover:bg-blue-50 hover:text-blue-700 text-slate-700'
                  }`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>

          {/* Footer close */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[12px]">
            <span className="text-slate-400 flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-rose-500" /> تعطیلات رسمی و جمعه‌ها</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-blue-600 hover:underline font-bold"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
