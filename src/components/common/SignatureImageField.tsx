import React, { useRef, useState } from 'react';
import { PenTool, Upload, Trash2, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  SAMPLE_SIGNATURE_DATA_URL,
  SIGNATURE_IMAGE_ACCEPT,
  validateSignatureImageFile,
} from '../../utils/signatureImage';

interface SignatureImageFieldProps {
  /** The user this signature belongs to — shown so it is always unambiguous. */
  ownerName?: string;
  value?: string;
  onChange: (signatureUrl: string | undefined) => void;
  /** False renders a read-only preview with no upload or remove controls. */
  canManage: boolean;
}

/**
 * The single signature-image editor in the app. It is used from user
 * management only: a user never manages their own signature image, so there is
 * no self-service copy of this component anywhere.
 *
 * Validation and the shared sample come from utils/signatureImage, so no
 * template or screen carries a signature of its own.
 */
export const SignatureImageField: React.FC<SignatureImageFieldProps> = ({ ownerName, value, onChange, canManage }) => {
  const { showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const validation = validateSignatureImageFile(file);
    if (!validation.isValid) {
      setError(validation.message || 'فایل انتخاب‌شده مجاز نیست.');
      showToast('فایل نامعتبر', validation.message || 'فایل انتخاب‌شده مجاز نیست.', 'error');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-56 h-28 shrink-0 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt={`امضای ${ownerName || 'کاربر'}`} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-center px-3">
              <PenTool className="w-5 h-5 text-slate-300 mx-auto mb-1" />
              <span className="text-[11px] text-slate-400">برای این کاربر امضایی ثبت نشده است.</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-[200px] space-y-2.5">
          {ownerName && (
            <div className="text-[12px] font-bold text-slate-700">امضای کاربر: {ownerName}</div>
          )}
          <p className="text-[11px] text-slate-500 leading-5">
            فرمت‌های مجاز: PNG، JPG، JPEG و WEBP (حداکثر ۲ مگابایت). ترجیحاً تصویری با پس‌زمینه شفاف یا سفید.
          </p>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-[12px] font-bold py-2 px-3 rounded-xl cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{value ? 'جایگزینی امضا' : 'انتخاب تصویر امضا'}</span>
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => onChange(undefined)}
                  className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[12px] font-bold py-2 px-3 rounded-xl cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف امضا</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept={SIGNATURE_IMAGE_ACCEPT} className="hidden" onChange={handleFile} />
            </div>
          ) : (
            <div className="text-[11px] font-bold text-amber-700">
              مدیریت تصویر امضا فقط برای مدیر سیستم فعال است.
            </div>
          )}

          {error && <div className="text-[11px] font-bold text-rose-600">{error}</div>}

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
            <span>
              اسنادی که پیش از این امضا شده‌اند تصویر امضای همان لحظه را نگه می‌دارند و با جایگزینی امضا تغییر نمی‌کنند.
            </span>
          </div>
        </div>
      </div>

      {!value && (
        <div className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white">
          <img src={SAMPLE_SIGNATURE_DATA_URL} alt="نمونه امضا" className="h-12 object-contain" />
          <span className="text-[11px] text-slate-500">
            تا زمان بارگذاری امضای واقعی، این «نمونه امضا»ی مرکزی روی اسناد این کاربر درج می‌شود.
          </span>
        </div>
      )}
    </div>
  );
};
