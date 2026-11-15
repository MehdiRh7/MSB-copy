import React, { useEffect, useState } from 'react';
import { Send, Inbox, PenLine } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { resolutionService } from '../../services/resolutionService';
import { Resolution } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { NotifyResolutionAction } from './NotifyResolutionAction';
import { SignNotificationLetterAction } from './SignNotificationLetterAction';

type InboxTab = 'NOTIFY' | 'SIGN';

// کارتابل ابلاغ: only resolutions whose three main signatures are already
// complete and are sitting in WAITING_NOTIFICATION — i.e. the same real
// status the rest of the app already uses for «در انتظار ابلاغ». Reuses
// the app's existing simple table/list pattern rather than a new Inbox
// component.
export const NotificationInboxView: React.FC = () => {
  const { currentUser, triggerRefresh, refreshTrigger, hasPermission } = useApp();
  const [items, setItems] = useState<Resolution[]>([]);
  // ابلاغیه‌هایی که ثبت ابلاغ آنها انجام شده و منتظر امضای همین کاربر
  // به‌عنوان دبیر جلسه هستند — همان کارتابل، یک تب اضافه، بدون View موازی.
  const [pendingSignature, setPendingSignature] = useState<Resolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const canNotify = currentUser.role === 'ADMIN' || hasPermission('NOTIFY_RESOLUTION');

  useEffect(() => {
    fetchItems();
  }, [refreshTrigger, currentUser.id]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [waiting, awaitingSignature] = await Promise.all([
        resolutionService.getResolutions({ executionStatus: 'WAITING_NOTIFICATION', pageSize: 200 }),
        resolutionService.getResolutions({ executionStatus: 'PENDING_SECRETARY_NOTICE_SIGNATURE', pageSize: 200 }),
      ]);
      if (waiting.isSuccess) setItems(waiting.data.items);
      if (awaitingSignature.isSuccess) {
        // فقط ابلاغیه‌هایی که همین کاربر دبیر جلسه‌شان است (ADMIN همه را می‌بیند).
        const mine = await resolutionService.filterNoticesAwaitingSignatureBy(awaitingSignature.data.items, currentUser);
        setPendingSignature(mine);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNotified = () => {
    setExpandedId(null);
    triggerRefresh();
  };

  const [tab, setTab] = useState<InboxTab>('NOTIFY');
  const activeTab: InboxTab = canNotify ? tab : 'SIGN';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-fuchsia-50 text-fuchsia-700">
          <Send className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-800">کارتابل ابلاغ</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {canNotify
              ? 'ثبت ابلاغ رسمی مصوبات و امضای ابلاغیه‌ها — مصوبه تنها پس از امضای دبیر جلسه وارد فاز اجرا می‌شود'
              : 'ابلاغیه‌هایی که در انتظار امضای شما به‌عنوان دبیر جلسه هستند'}
          </p>
        </div>
      </div>

      {(canNotify || pendingSignature.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {canNotify && (
            <button
              type="button"
              onClick={() => setTab('NOTIFY')}
              className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${activeTab === 'NOTIFY' ? 'bg-fuchsia-700 text-white border-fuchsia-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>در انتظار ابلاغ</span>
              {items.length > 0 && <span className={`text-[11px] font-bold px-1.5 rounded-full ${activeTab === 'NOTIFY' ? 'bg-white/20' : 'bg-slate-100'}`}>{toPersianDigits(items.length)}</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('SIGN')}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${activeTab === 'SIGN' ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>امضای ابلاغیه (دبیر جلسه)</span>
            {pendingSignature.length > 0 && <span className={`text-[11px] font-bold px-1.5 rounded-full ${activeTab === 'SIGN' ? 'bg-white/20' : 'bg-slate-100'}`}>{toPersianDigits(pendingSignature.length)}</span>}
          </button>
        </div>
      )}

      {activeTab === 'SIGN' ? (
        loading ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs text-xs text-slate-400">در حال بارگذاری...</div>
        ) : pendingSignature.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs">
            <PenLine className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">ابلاغیه‌ای در انتظار امضای شما نیست.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[12px]">
                  <th className="py-2.5 px-3 font-semibold">شماره مصوبه</th>
                  <th className="py-2.5 px-3 font-semibold">شماره نامه ابلاغیه</th>
                  <th className="py-2.5 px-3 font-semibold">موضوع مصوبه</th>
                  <th className="py-2.5 px-3 font-semibold">ابلاغ‌کننده</th>
                  <th className="py-2.5 px-3 font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingSignature.map((resolution) => (
                  <tr key={resolution.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-3 font-bold text-teal-700">{toPersianDigits(resolution.resolutionNumber)}</td>
                    <td className="py-3 px-3 font-bold text-indigo-700">{toPersianDigits(resolution.notificationLetterNumber || '—')}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">{resolution.topicTitle}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{resolution.meetingNumber} — {resolution.meetingTitle}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {resolution.notifiedByName || '—'}
                      <div className="text-[11px] text-slate-400">
                        {toPersianDigits(resolution.notifiedDateJalali || '—')} {resolution.notifiedTimeString ? `ساعت ${toPersianDigits(resolution.notifiedTimeString)}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <SignNotificationLetterAction resolution={resolution} onSigned={handleNotified} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : loading ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs text-xs text-slate-400">در حال بارگذاری...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">موردی در انتظار ابلاغ نیست.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[12px]">
                <th className="py-2.5 px-3 font-semibold">شماره مصوبه</th>
                <th className="py-2.5 px-3 font-semibold">جلسه</th>
                <th className="py-2.5 px-3 font-semibold">موضوع مصوبه</th>
                <th className="py-2.5 px-3 font-semibold">واحد مربوطه</th>
                <th className="py-2.5 px-3 font-semibold">وضعیت</th>
                <th className="py-2.5 px-3 font-semibold">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((resolution) => (
                <React.Fragment key={resolution.id}>
                  <tr className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-3 font-bold text-teal-700">{toPersianDigits(resolution.resolutionNumber)}</td>
                    <td className="py-3 px-3">{resolution.meetingNumber} — {resolution.meetingTitle}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">{resolution.topicTitle}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">تاریخ مصوبه: {toPersianDigits(resolution.assignedDateJalali || resolution.createdAt.slice(0, 10))}</div>
                    </td>
                    <td className="py-3 px-3">{resolution.responsibleDepartmentName || '—'}</td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">در انتظار ابلاغ</span>
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId((prev) => (prev === resolution.id ? null : resolution.id))}
                        className="flex items-center gap-1.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-[12px] font-bold py-1.5 px-3 rounded-full cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>ابلاغ</span>
                      </button>
                    </td>
                  </tr>
                  {expandedId === resolution.id && (
                    <tr>
                      <td colSpan={6} className="p-3 bg-fuchsia-50/40">
                        <NotifyResolutionAction resolutionId={resolution.id} resolutionNumber={resolution.resolutionNumber} onNotified={handleNotified} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
