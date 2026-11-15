import React, { useState } from 'react';
import { UserCheck, Save, Trash2, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import {
  clearDelegation,
  getDelegationFor,
  getOwnersDelegatedTo,
  setDelegation,
} from '../../services/signatureDelegationService';
import { toPersianDigits } from '../../utils/formatters';

/**
 * «جانشین امضا» — هر کاربر فقط جانشین خودش را مدیریت می‌کند.
 * این صفحه هیچ دسترسی به تنظیمات گردش امضای سامانه نمی‌دهد.
 */
export const SignatureDelegationTab: React.FC = () => {
  const { currentUser, availableUsers, showToast } = useApp();
  const existing = getDelegationFor(currentUser.id);

  const [delegateUserId, setDelegateUserId] = useState(existing?.delegateUserId || '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [fromDate, setFromDate] = useState(existing?.fromDateJalali || '');
  const [toDate, setToDate] = useState(existing?.toDateJalali || '');
  const [saved, setSaved] = useState(existing);

  // مواردی که این کاربر جانشین فعال آنهاست — فقط برای اطلاع.
  const delegatedToMe = getOwnersDelegatedTo(currentUser.id);

  const selectableUsers = availableUsers.filter((user) => user.id !== currentUser.id);

  const handleSave = () => {
    try {
      const record = setDelegation(
        {
          ownerUserId: currentUser.id,
          delegateUserId,
          isActive,
          fromDateJalali: fromDate || undefined,
          toDateJalali: toDate || undefined,
        },
        currentUser
      );
      setSaved(record);
      showToast('جانشین امضا', isActive ? 'جانشین شما ثبت و فعال شد.' : 'جانشین شما ثبت شد اما غیرفعال است.', 'success');
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت جانشین انجام نشد.', 'error');
    }
  };

  const handleClear = () => {
    try {
      clearDelegation(currentUser.id, currentUser);
      setSaved(undefined);
      setDelegateUserId('');
      setIsActive(true);
      setFromDate('');
      setToDate('');
      showToast('جانشین امضا', 'جانشینی حذف شد. از این پس فقط خودتان می‌توانید امضا کنید.', 'info');
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'حذف جانشین انجام نشد.', 'error');
    }
  };

  const field = 'w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-5">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
          <UserCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-800">جانشین امضا</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            اگر مسئول امضای مرحله‌ای هستید، می‌توانید یک کاربر را به‌عنوان جانشین خود تعیین کنید تا در صورت نیاز به‌جای شما امضا کند.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[12px] text-amber-900 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          جانشینی فقط اجازه <strong>امضا</strong> را منتقل می‌کند و هیچ دسترسی دیگری از شما به جانشین داده نمی‌شود.
          امضای جانشین با نام خودش و به‌همراه نام شما در سوابق ثبت می‌شود.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">جانشین من</label>
          <select value={delegateUserId} onChange={(event) => setDelegateUserId(event.target.value)} className={field}>
            <option value="">انتخاب کاربر...</option>
            {selectableUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.fullName} ({user.title})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">وضعیت جانشینی</label>
          <select value={isActive ? 'ACTIVE' : 'INACTIVE'} onChange={(event) => setIsActive(event.target.value === 'ACTIVE')} className={field}>
            <option value="ACTIVE">فعال</option>
            <option value="INACTIVE">غیرفعال</option>
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">از تاریخ (اختیاری)</label>
          <PersianDatePicker value={fromDate} onChange={setFromDate} />
        </div>
        <div>
          <label className="block text-[12px] font-bold text-slate-700 mb-1">تا تاریخ (اختیاری)</label>
          <PersianDatePicker value={toDate} onChange={setToDate} />
        </div>
      </div>

      {saved && (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[12px] text-slate-700 space-y-1">
          <div>
            جانشین ثبت‌شده: <strong className="text-slate-900">{saved.delegateName}</strong>
            <span className={`mr-2 px-2 py-0.5 rounded-full border text-[11px] font-bold ${
              saved.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              {saved.isActive ? 'فعال' : 'غیرفعال'}
            </span>
          </div>
          {(saved.fromDateJalali || saved.toDateJalali) && (
            <div className="text-slate-500">
              بازه: {toPersianDigits(saved.fromDateJalali || 'بدون محدودیت')} تا {toPersianDigits(saved.toDateJalali || 'بدون محدودیت')}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={!delegateUserId}
          className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>ذخیره جانشین</span>
        </button>
        {saved && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>حذف جانشینی</span>
          </button>
        )}
      </div>

      {delegatedToMe.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <div className="text-[12px] font-bold text-slate-700 mb-1.5">شما هم‌اکنون جانشین فعال این افراد هستید:</div>
          <div className="flex flex-wrap gap-1.5">
            {delegatedToMe.map((item) => (
              <span key={item.ownerUserId} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {item.ownerName}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            فقط امضاهای واگذارشده در کارتابل شما نمایش داده می‌شوند؛ هیچ دسترسی دیگری به اطلاعات این افراد ندارید.
          </p>
        </div>
      )}
    </div>
  );
};
