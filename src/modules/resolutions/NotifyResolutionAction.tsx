import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { resolutionService } from '../../services/resolutionService';

interface NotifyResolutionActionProps {
  resolutionId: string;
  resolutionNumber: string;
  onNotified: () => void;
  compact?: boolean;
}

// Single shared ابلاغ action — used identically from the کارتابل ابلاغ
// inbox (NotificationInboxView) and from inside the resolution's own
// detail form (ResolutionDetailModal), both calling the same
// resolutionService.notifyResolution rather than two separate Business
// Logic paths.
//
// تاریخ ابلاغ از کاربر گرفته نمی‌شود: با کلیک روی «ابلاغ»، تاریخ، ساعت و
// کاربر ابلاغ‌کننده به‌صورت خودکار از DateTime واقعی سیستم ثبت می‌شوند.
export const NotifyResolutionAction: React.FC<NotifyResolutionActionProps> = ({ resolutionId, resolutionNumber, onNotified, compact = false }) => {
  const { currentUser, showToast } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNotify = async () => {
    const confirmed = window.confirm(`آیا از ثبت ابلاغ مصوبه «${resolutionNumber}» اطمینان دارید؟ تاریخ و ساعت ابلاغ به‌صورت خودکار ثبت می‌شود.`);
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await resolutionService.notifyResolution(resolutionId, currentUser);
      showToast('ابلاغ مصوبه', 'ابلاغ ثبت شد و ابلاغیه برای امضا به کارتابل دبیر جلسه ارسال گردید.', 'success');
      onNotified();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت ابلاغ انجام نشد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2' : 'p-3.5 bg-fuchsia-50/60 border border-fuchsia-200/80 rounded-2xl space-y-2.5'}>
      {!compact && (
        <div className="text-xs font-bold text-fuchsia-950">ثبت ابلاغ رسمی مصوبه</div>
      )}
      {!compact && (
        <p className="text-[12px] text-fuchsia-900">
          تاریخ، ساعت و نام ابلاغ‌کننده به‌صورت خودکار ثبت می‌شود. پس از ثبت، ابلاغیه برای امضا به کارتابل دبیر جلسه می‌رود و مصوبه تنها پس از امضای ایشان وارد فاز اجرا می‌شود.
        </p>
      )}
      <button
        type="button"
        onClick={handleNotify}
        disabled={isSubmitting}
        className="flex items-center gap-1.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="w-3.5 h-3.5" />
        <span>{isSubmitting ? 'در حال ثبت...' : 'ابلاغ مصوبه'}</span>
      </button>
    </div>
  );
};
