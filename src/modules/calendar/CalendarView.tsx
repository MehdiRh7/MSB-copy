import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  Clock,
  Plus,
  Users,
  MapPin,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { meetingService } from '../../services/meetingService';
import { hasOrgWideMeetingAccess } from '../../services/userScope';
import { Meeting } from '../../types';
import { toPersianDigits, getMeetingTypeLabel } from '../../utils/formatters';

const PERSIAN_MONTHS = [
  { name: 'فروردین', index: 1, days: 31 },
  { name: 'اردیبهشت', index: 2, days: 31 },
  { name: 'خرداد', index: 3, days: 31 },
  { name: 'تیر', index: 4, days: 31 },
  { name: 'مرداد', index: 5, days: 31 },
  { name: 'شهریور', index: 6, days: 31 },
  { name: 'مهر', index: 7, days: 30 },
  { name: 'آبان', index: 8, days: 30 },
  { name: 'آذر', index: 9, days: 30 },
  { name: 'دی', index: 10, days: 30 },
  { name: 'بهمن', index: 11, days: 30 },
  { name: 'اسفند', index: 12, days: 29 },
];

// Real current Jalali year/month/day (numeric, not Persian-digit strings) —
// used both as the calendar's initial view and to highlight "today".
const getTodayJalaliParts = (): { year: number; month: number; day: number } => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
};

export const CalendarView: React.FC = () => {
  const { navigateTo, openCreateMeetingModal, isDarkMode, hasPermission, currentUser, refreshTrigger } = useApp();
  const canCreateMeeting = hasPermission('CREATE_MEETING');

  const today = getTodayJalaliParts();
  const PERSIAN_YEARS = [today.year - 2, today.year - 1, today.year, today.year + 1, today.year + 2];

  const [selectedYear, setSelectedYear] = useState<number>(today.year);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(today.month - 1);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [calendarScope, setCalendarScope] = useState<'MINE' | 'DEPARTMENT' | 'PERMITTED'>('MINE');
  const canViewAllMeetings = hasOrgWideMeetingAccess(currentUser.role);

  useEffect(() => {
    meetingService
      .getMeetings({
        pageSize: 500,
        participantUserId: calendarScope === 'MINE' || !canViewAllMeetings ? currentUser.id : undefined,
        departmentId: calendarScope === 'DEPARTMENT' ? currentUser.departmentId : undefined,
      })
      .then((res) => {
        if (res.isSuccess) setMeetings(res.data.items);
      });
  }, [currentUser.id, currentUser.departmentId, calendarScope, canViewAllMeetings, refreshTrigger]);

  const currentMonthInfo = PERSIAN_MONTHS[selectedMonthIndex] || PERSIAN_MONTHS[today.month - 1];
  const daysCount = currentMonthInfo.days;

  const handlePrevMonth = () => {
    if (selectedMonthIndex === 0) {
      setSelectedMonthIndex(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonthIndex === 11) {
      setSelectedMonthIndex(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonthIndex((m) => m + 1);
    }
  };

  const handleSetToday = () => {
    setSelectedYear(today.year);
    setSelectedMonthIndex(today.month - 1);
  };

  // Convert day number to padded string and full Jalali date
  const formatJalaliDate = (day: number) => {
    const monthNum = (selectedMonthIndex + 1).toString().padStart(2, '0');
    const dayNum = day.toString().padStart(2, '0');
    return `${toPersianDigits(selectedYear.toString())}/${toPersianDigits(monthNum)}/${toPersianDigits(dayNum)}`;
  };

  // Map meetings to days based on the currently viewed month/year.
  const getMeetingsForDay = (day: number) => {
    const monthNumStr = (selectedMonthIndex + 1).toString().padStart(2, '0');
    const dayNumStr = day.toString().padStart(2, '0');
    const targetJalali = `${toPersianDigits(selectedYear.toString())}/${toPersianDigits(monthNumStr)}/${toPersianDigits(dayNumStr)}`;
    return meetings.filter((m) => m.dateJalali === targetJalali);
  };

  // Handle clicking on a calendar day
  const handleDayClick = (day: number) => {
    if (!canCreateMeeting) return;
    const dateStr = formatJalaliDate(day);
    openCreateMeetingModal(dateStr);
  };

  // Calculate starting empty slots for alignment (sample calculation based on month)
  const startDayOffset = (selectedMonthIndex * 2 + (selectedYear % 7)) % 7;
  const emptyDaysBefore = Array.from({ length: startDayOffset }, (_, i) => i);
  const daysArray = Array.from({ length: daysCount }, (_, i) => i + 1);

  return (
    <div className="h-[min(calc(100vh-7.5rem),660px)] w-full max-w-5xl mx-auto flex flex-col space-y-2.5 overflow-hidden">
      {/* Top Header Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">تقویم جلسات سازمانی</h1>
            <p className="text-[12px] text-slate-400 dark:text-slate-400 font-medium">{canCreateMeeting ? 'برای ثبت جلسه جدید، روی روز مورد نظر کلیک کنید.' : 'فقط جلسه‌های مجاز شما نمایش داده می‌شوند.'}</p>
          </div>
        </div>

        {/* Year and Month Pickers */}
        <div className="flex items-center gap-2">
          {/* Month Dropdown */}
          <div className="relative">
            <select
              value={selectedMonthIndex}
              onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
              aria-label="انتخاب ماه"
              className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer appearance-none pl-7"
            >
              {PERSIAN_MONTHS.map((m, idx) => (
                <option key={m.name} value={idx}>
                  ماه {m.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5 pointer-events-none" />
          </div>

          {/* Year Dropdown */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="انتخاب سال"
              className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer appearance-none pl-7"
            >
              {PERSIAN_YEARS.map((y) => (
                <option key={y} value={y}>
                  سال {toPersianDigits(y.toString())}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5 pointer-events-none" />
          </div>

          {/* Month Navigation Prev / Next */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="ماه قبل"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleSetToday}
              className="px-2 text-[12px] font-bold text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-400 cursor-pointer"
            >
              امروز
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="ماه بعد"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* New Meeting Button */}
          {canCreateMeeting && (
            <button
              onClick={() => openCreateMeetingModal()}
              className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white font-bold text-xs py-1.5 px-3.5 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>جلسه جدید</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-1 text-[12px] font-bold">
        {[['MINE', 'جلسات من'], ['DEPARTMENT', 'واحد من'], ...(canViewAllMeetings ? [['PERMITTED', 'همه جلسات مجاز']] : [])].map(([value, label]) => <button key={value} onClick={() => setCalendarScope(value as typeof calendarScope)} className={`rounded-full border px-3 py-1.5 ${calendarScope === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
        {calendarScope === 'DEPARTMENT' && !canViewAllMeetings && <span className="self-center text-slate-500">نمای واحد برای نقش شما به جلسه‌های مرتبط با خودتان محدود می‌شود.</span>}
      </div>

      {/* Calendar Grid Container (Fixed Fit - No Scroll) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-xs border border-slate-200 dark:border-slate-800 flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Days of week header in Persian */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] font-bold text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>شنبه</div>
          <div>یکشنبه</div>
          <div>دوشنبه</div>
          <div>سه‌شنبه</div>
          <div>چهارشنبه</div>
          <div>پنجشنبه</div>
          <div className="text-rose-500 font-bold">جمعه</div>
        </div>

        {/* Days Grid - Flex-1 with autofit rows */}
        <div className="grid grid-cols-7 gap-1.5 flex-1 pt-1.5 min-h-0 auto-rows-fr">
          {/* Empty initial slots */}
          {emptyDaysBefore.map((idx) => (
            <div
              key={`empty-${idx}`}
              className="rounded-xl bg-slate-50/50 dark:bg-slate-900/40 border border-dashed border-slate-100 dark:border-slate-800/60 opacity-40"
            />
          ))}

          {/* Actual days */}
          {daysArray.map((day) => {
            const dayMeetings = getMeetingsForDay(day);
            const isToday = selectedYear === today.year && selectedMonthIndex === today.month - 1 && day === today.day;
            const isWeekend = (emptyDaysBefore.length + day) % 7 === 0;

            return (
              <div
                key={day}
                onClick={() => handleDayClick(day)}
                className={`p-1.5 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group relative overflow-hidden ${
                  isToday
                    ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-400 dark:border-teal-600 ring-2 ring-teal-200 dark:ring-teal-900/60'
                    : isWeekend
                    ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-100 dark:border-rose-950/40 hover:border-rose-300'
                    : dayMeetings.length > 0
                    ? 'bg-slate-50/90 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-500'
                    : 'bg-white dark:bg-slate-850 border-slate-100 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/30 dark:hover:bg-slate-800/90'
                }`}
                title={`کلیک جهت ثبت جلسه برای تاریخ ${formatJalaliDate(day)}`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between shrink-0">
                  <span
                    className={`text-[12px] font-bold w-5 h-5 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isToday
                        ? 'bg-teal-700 text-white shadow-xs font-bold'
                        : isWeekend
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {toPersianDigits(day)}
                  </span>

                  {/* Plus icon hint on hover */}
                  <span className="opacity-0 group-hover:opacity-100 text-[11px] text-teal-800 dark:text-teal-300 font-bold flex items-center gap-0.5 transition-opacity">
                    <Plus className="w-3 h-3" />
                  </span>

                  {dayMeetings.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400"></span>
                  )}
                </div>

                {/* Day Events list (Compact) */}
                <div className="space-y-1 my-0.5 overflow-hidden flex-1 flex flex-col justify-start">
                  {dayMeetings.slice(0, 2).map((m) => (
                    <div
                      key={m.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateTo('meeting-details', { meetingId: m.id });
                      }}
                      className="p-1 bg-teal-800 hover:bg-teal-700 text-white rounded-lg text-[11px] font-bold truncate cursor-pointer transition-colors shadow-2xs flex items-center justify-between gap-1"
                      title={`${m.title} (ساعت ${m.startTime})`}
                    >
                      <span className="truncate">{m.title}</span>
                      <span className="text-[8px] text-teal-200 shrink-0">{toPersianDigits(m.startTime)}</span>
                    </div>
                  ))}
                  {dayMeetings.length > 2 && (
                    <span className="text-[8px] font-bold text-teal-800 dark:text-teal-300 text-center block">
                      +{toPersianDigits(dayMeetings.length - 2)} جلسه دیگر
                    </span>
                  )}
                </div>

                {/* Day Footer note */}
                <div className="text-[8px] text-slate-400 dark:text-slate-500 text-left shrink-0">
                  {dayMeetings.length > 0 ? `${toPersianDigits(dayMeetings.length)} جلسه` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
