import React from 'react';
import { ActivityLog } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { CheckCircle, Clock, Send, AlertTriangle, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

interface TimelineViewProps {
  logs: ActivityLog[];
  title?: string;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ logs, title = 'تاریخچه رویدادها و گردش کار (Timeline)' }) => {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-xs">
        هنوز هیچ رویدادی برای این آیتم ثبت نشده است.
      </div>
    );
  }

  const getActionIcon = (action: string) => {
    if (action.includes('تایید') || action.includes('خاتمه')) {
      return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    }
    if (action.includes('رد') || action.includes('برگشت')) {
      return <AlertTriangle className="w-4 h-4 text-rose-600" />;
    }
    if (action.includes('صحه‌گذاری') || action.includes('ارسال')) {
      return <Send className="w-4 h-4 text-purple-600" />;
    }
    if (action.includes('جلسه') || action.includes('تصویب')) {
      return <FileText className="w-4 h-4 text-teal-600" />;
    }
    return <Clock className="w-4 h-4 text-blue-600" />;
  };

  return (
    <div className="space-y-4">
      {title && <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-teal-600"></span>
        {title}
      </h4>}

      <div className="relative border-r-2 border-teal-100 mr-3.5 space-y-6">
        {logs.map((log) => (
          <div key={log.id} className="relative pr-6 group">
            {/* Timeline dot */}
            <div className="absolute -right-2 top-0.5 w-4 h-4 rounded-full bg-white border-2 border-teal-600 flex items-center justify-center shadow-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-600"></div>
            </div>

            {/* Content card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 hover:bg-white hover:border-teal-200 transition-all">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  {getActionIcon(log.action)}
                  <span className="text-xs font-bold text-slate-800">{log.action}</span>
                </div>
                <div className="text-[12px] font-medium text-slate-400">
                  {toPersianDigits(log.timestampJalali)} - ساعت {toPersianDigits(log.timeString)}
                </div>
              </div>

              <div className="text-[12px] text-slate-600 mb-1 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">{log.actorName}</span>
                <span className="text-slate-400">({log.actorRole})</span>
              </div>

              {log.details && (
                <p className="text-[12px] text-slate-500 bg-white/80 p-2 rounded-xl border border-slate-100 leading-relaxed mt-2">
                  {log.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
