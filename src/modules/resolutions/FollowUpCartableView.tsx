import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Inbox } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { followUpService, FollowUpCartableRow, FOLLOW_UP_NEAR_DUE_DAYS, nextDueDate } from '../../services/followUpService';
import { ResolutionFollowUpType } from '../../types';
import { toPersianDigits, getResolutionExecutionMeta } from '../../utils/formatters';
import { RecordFollowUpForm } from './RecordFollowUpForm';
import { FollowUpHistory } from './FollowUpHistory';

const FOLLOW_UP_TYPE_LABELS: Record<ResolutionFollowUpType, string> = {
  WEEKLY: 'گزارش هفتگی',
  MONTHLY: 'گزارش ماهانه',
  QUARTERLY: 'گزارش فصلی',
  CUSTOM: 'سفارشی',
};

export const FollowUpCartableView: React.FC = () => {
  const { currentUser, refreshTrigger, triggerRefresh } = useApp();
  const [rows, setRows] = useState<FollowUpCartableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await followUpService.getFollowUpCartable(currentUser);
      if (response.isSuccess) setRows(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دریافت کارتابل پیگیری انجام نشد.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows, refreshTrigger]);

  const handleRecorded = () => {
    setExpandedId(null);
    setHistoryKey((previous) => previous + 1);
    triggerRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-800">کارتابل پیگیری مصوبات</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            مصوباتی که موعد پیگیری آن‌ها رسیده یا تا {toPersianDigits(FOLLOW_UP_NEAR_DUE_DAYS)} روز آینده فرا می‌رسد
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-rose-100 shadow-xs text-xs text-rose-600">{error}</div>
      ) : loading ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs text-xs text-slate-400">در حال بارگذاری...</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">مصوبه‌ای در موعد پیگیری نیست.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-x-auto">
          <table className="w-full min-w-[980px] text-right text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[12px]">
                <th className="py-2.5 px-3 font-semibold">شماره مصوبه</th>
                <th className="py-2.5 px-3 font-semibold">موضوع مصوبه</th>
                <th className="py-2.5 px-3 font-semibold">واحد مسئول</th>
                <th className="py-2.5 px-3 font-semibold">نوع پیگیری</th>
                <th className="py-2.5 px-3 font-semibold">موعد پیگیری</th>
                <th className="py-2.5 px-3 font-semibold">آخرین پیگیری</th>
                <th className="py-2.5 px-3 font-semibold">وضعیت مصوبه</th>
                <th className="py-2.5 px-3 font-semibold">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ resolution, plan, isDue, daysRemaining }) => {
                const executionMeta = getResolutionExecutionMeta(resolution.executionStatus);
                const dueDate = nextDueDate(plan) || plan.startDateJalali;
                return (
                  <React.Fragment key={resolution.id}>
                    <tr className="hover:bg-slate-50/70 align-top">
                      <td className="py-3 px-3 font-bold text-teal-700">{toPersianDigits(resolution.resolutionNumber)}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">{resolution.topicTitle}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{resolution.meetingNumber} — {resolution.meetingTitle}</div>
                      </td>
                      <td className="py-3 px-3">{resolution.responsibleDepartmentName || '—'}</td>
                      <td className="py-3 px-3">{FOLLOW_UP_TYPE_LABELS[plan.type]}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">{toPersianDigits(dueDate)}</div>
                        <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${isDue ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {isDue ? 'رسیده' : `${toPersianDigits(daysRemaining)} روز تا موعد`}
                        </span>
                      </td>
                      <td className="py-3 px-3">{plan.lastFollowUpDateJalali ? toPersianDigits(plan.lastFollowUpDateJalali) : '—'}</td>
                      <td className="py-3 px-3">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${executionMeta.bg}`}>{executionMeta.label}</span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId((previous) => (previous === resolution.id ? null : resolution.id))}
                          className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white text-[12px] font-bold py-1.5 px-3 rounded-full cursor-pointer"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>پیگیری</span>
                        </button>
                      </td>
                    </tr>
                    {expandedId === resolution.id && (
                      <tr>
                        <td colSpan={8} className="p-3 bg-amber-50/40 space-y-3">
                          <RecordFollowUpForm resolutionId={resolution.id} onRecorded={handleRecorded} />
                          <FollowUpHistory resolutionId={resolution.id} reloadKey={historyKey} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
