import React, { useEffect, useState } from 'react';
import { History, FileText } from 'lucide-react';
import { followUpService } from '../../services/followUpService';
import { ResolutionFollowUpRecord } from '../../types';
import { toPersianDigits } from '../../utils/formatters';

interface FollowUpHistoryProps {
  resolutionId: string;
  /** Bumped by the parent after a new follow-up is recorded. */
  reloadKey?: number;
}

/** Read-only history of every follow-up recorded against one resolution. */
export const FollowUpHistory: React.FC<FollowUpHistoryProps> = ({ resolutionId, reloadKey = 0 }) => {
  const [records, setRecords] = useState<ResolutionFollowUpRecord[]>([]);

  useEffect(() => {
    followUpService.getFollowUpRecords(resolutionId).then((response) => {
      if (response.isSuccess) setRecords(response.data);
    });
  }, [resolutionId, reloadKey]);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
        <History className="w-4 h-4 text-amber-700" />
        <span>تاریخچه پیگیری مصوبه</span>
      </h4>

      {records.length === 0 ? (
        <div className="text-[12px] text-slate-400 py-3">هنوز پیگیری‌ای برای این مصوبه ثبت نشده است.</div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div key={record.id} className="p-3 bg-white border border-amber-200/80 rounded-xl space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span className="font-bold text-amber-900">{toPersianDigits(record.followUpDateJalali)}</span>
                <span className="text-slate-500">مسئول پیگیری: {record.createdByName}</span>
              </div>
              <p className="text-xs text-slate-700 leading-6">{record.text}</p>
              {record.notes && <p className="text-[12px] text-slate-500">{record.notes}</p>}
              {record.nextDeadlineJalali && (
                <div className="text-[12px] text-slate-600">
                  موعد بعدی: <strong>{toPersianDigits(record.nextDeadlineJalali)}</strong>
                </div>
              )}
              {record.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {record.attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="flex items-center gap-1 text-[11px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded-lg"
                    >
                      <FileText className="w-3 h-3" />
                      {attachment.fileName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
