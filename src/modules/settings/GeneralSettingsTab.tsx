import React, { useState } from 'react';
import { Building2, MessageSquare, CalendarDays, Palette, Save, Send, Plus, Pencil, Trash2, Droplets, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { loadLocalValue, saveLocalValue } from '../../services/localStore';
import { toPersianDigits } from '../../utils/formatters';
import { smsService, SmsSettings } from '../../services/smsService';
import { getOrganizationProfile, OrganizationProfile, saveOrganizationProfile } from '../../services/organizationProfile';

type GeneralSubTab = 'ORG' | 'SMS' | 'CALENDAR' | 'THEME';


interface CalendarEntry {
  id: string;
  name: string;
  accessType: 'PUBLIC' | 'RESTRICTED';
  allowedAccess: string;
  isPublic: boolean;
}

const DEFAULT_CALENDARS: CalendarEntry[] = [
  { id: 'cal-1', name: 'تقویم جلسات هیئت مدیره', accessType: 'RESTRICTED', allowedAccess: 'مدیران ارشد، دبیرخانه', isPublic: false },
  { id: 'cal-2', name: 'تقویم عمومی سازمانی', accessType: 'PUBLIC', allowedAccess: 'همه کاربران', isPublic: true },
];

export const GeneralSettingsTab: React.FC = () => {
  const { showToast, appTheme, setAppTheme } = useApp();
  const [subTab, setSubTab] = useState<GeneralSubTab>('ORG');

  const [orgInfo, setOrgInfo] = useState<OrganizationProfile>(getOrganizationProfile);
  const [smsSettings, setSmsSettings] = useState<SmsSettings>(() => smsService.getSettings());
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');

  const [calendars, setCalendars] = useState<CalendarEntry[]>(() => loadLocalValue('calendars', DEFAULT_CALENDARS));
  const [editingCalendar, setEditingCalendar] = useState<CalendarEntry | null>(null);
  const [isCalendarFormOpen, setIsCalendarFormOpen] = useState(false);

  const handleSaveOrgInfo = () => {
    saveOrganizationProfile(orgInfo);
    showToast('تنظیمات سازمان', 'اطلاعات سازمان با موفقیت ذخیره شد.', 'success');
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('فایل نامعتبر', 'فقط فایل تصویری قابل استفاده است.', 'error'); return; }
    if (file.size > 1_500_000) { showToast('حجم زیاد', 'حجم لوگو باید حداکثر ۱.۵ مگابایت باشد.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setOrgInfo((previous) => ({ ...previous, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const handleSaveSmsSettings = async () => {
    const response = await smsService.updateSettings(smsSettings, apiKeyInput);
    setSmsSettings(response.data);
    setApiKeyInput('');
    showToast('تنظیمات پنل پیامکی', 'تنظیمات پیامکی ذخیره شد.', 'success');
  };

  const handleSendTest = async () => {
    if (!testPhone || !testMessage) {
      showToast('خطا', 'شماره تلفن و متن آزمایشی را وارد کنید.', 'error');
      return;
    }
    await smsService.sendTest(testPhone, testMessage);
    showToast('ارسال آزمایشی', `پیامک آزمایشی به ${toPersianDigits(testPhone)} شبیه‌سازی شد (Mock).`, 'info');
    setTestMessage('');
  };

  const openNewCalendarForm = () => {
    setEditingCalendar({ id: `cal-${Date.now()}`, name: '', accessType: 'RESTRICTED', allowedAccess: '', isPublic: false });
    setIsCalendarFormOpen(true);
  };

  const openEditCalendarForm = (cal: CalendarEntry) => {
    setEditingCalendar(cal);
    setIsCalendarFormOpen(true);
  };

  const handleSaveCalendar = () => {
    if (!editingCalendar || !editingCalendar.name.trim()) {
      showToast('خطا', 'نام تقویم الزامی است.', 'error');
      return;
    }
    setCalendars((prev) => {
      const exists = prev.some((c) => c.id === editingCalendar.id);
      const next = exists ? prev.map((c) => (c.id === editingCalendar.id ? editingCalendar : c)) : [editingCalendar, ...prev];
      saveLocalValue('calendars', next);
      return next;
    });
    setIsCalendarFormOpen(false);
    setEditingCalendar(null);
    showToast('تقویم', 'تقویم با موفقیت ذخیره شد.', 'success');
  };

  const handleDeleteCalendar = (id: string) => {
    setCalendars((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveLocalValue('calendars', next);
      return next;
    });
    showToast('تقویم', 'تقویم حذف شد.', 'info');
  };

  const subTabs: { id: GeneralSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'ORG', label: 'اطلاعات سازمان', icon: Building2 },
    { id: 'SMS', label: 'پنل پیامکی', icon: MessageSquare },
    { id: 'CALENDAR', label: 'تقویم', icon: CalendarDays },
    { id: 'THEME', label: 'تم سامانه', icon: Palette },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              subTab === id ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {subTab === 'ORG' && (
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4">
          <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">اطلاعات سازمان</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نام سازمان</label>
              <input type="text" value={orgInfo.name} onChange={(e) => setOrgInfo({ ...orgInfo, name: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عنوان سامانه</label>
              <input type="text" value={orgInfo.systemTitle} onChange={(e) => setOrgInfo({ ...orgInfo, systemTitle: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نشان سازمان</label>
              <div className="flex items-center gap-3">
                <img src={orgInfo.logoUrl} alt="پیش‌نمایش نشان سازمان" className="h-10 w-10 rounded-lg border border-slate-200 object-contain" />
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-[12px] text-slate-500 file:ml-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-teal-800" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تلفن</label>
              <input type="text" value={orgInfo.phone} onChange={(e) => setOrgInfo({ ...orgInfo, phone: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ایمیل</label>
              <input type="email" value={orgInfo.email} onChange={(e) => setOrgInfo({ ...orgInfo, email: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">وب‌سایت</label>
              <input type="text" value={orgInfo.website} onChange={(e) => setOrgInfo({ ...orgInfo, website: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">شناسه ملی</label>
              <input type="text" value={orgInfo.nationalId} onChange={(e) => setOrgInfo({ ...orgInfo, nationalId: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">کد اقتصادی</label>
              <input type="text" value={orgInfo.economicCode} onChange={(e) => setOrgInfo({ ...orgInfo, economicCode: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">آدرس</label>
              <textarea rows={2} value={orgInfo.address} onChange={(e) => setOrgInfo({ ...orgInfo, address: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button onClick={handleSaveOrgInfo} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer">
              <Save className="w-3.5 h-3.5" />
              <span>ذخیره تنظیمات</span>
            </button>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">نام، عنوان و لوگو پس از ذخیره در سربرگ و صفحه ورود نمایش داده می‌شوند. لوگو فقط در مرورگر این نصب ذخیره می‌شود.</p>
        </div>
      )}

      {subTab === 'SMS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-800">تنظیمات پنل پیامکی</h3>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={smsSettings.isEnabled} onChange={(e) => setSmsSettings({ ...smsSettings, isEnabled: e.target.checked })} className="w-4 h-4 text-teal-700 rounded-md cursor-pointer" />
                <span className="text-[12px] font-bold text-slate-700">فعال‌سازی ارسال پیامک</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سرویس‌دهنده</label>
                <select value={smsSettings.provider} onChange={(e) => setSmsSettings({ ...smsSettings, provider: e.target.value as 'KAVENEGAR' })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                  <option value="KAVENEGAR">کاوه‌نگار</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">آدرس پایه رسمی کاوه نگار</label>
                <input type="text" value={smsSettings.baseUrl} onChange={(e) => setSmsSettings({ ...smsSettings, baseUrl: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">API KEY</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={smsSettings.hasApiKey ? 'کلید قبلاً ذخیره شده است؛ برای تغییر، کلید جدید وارد کنید.' : 'کلید API را وارد کنید'}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره خط فرستنده (اختیاری)</label>
                <input type="text" value={smsSettings.senderNumber} onChange={(e) => setSmsSettings({ ...smsSettings, senderNumber: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" dir="ltr" />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-[12px] font-bold text-slate-600">متن‌های پیامک</h4>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">متن پیامک نامه</label>
                <textarea rows={2} value={smsSettings.letterTemplate} onChange={(e) => setSmsSettings({ ...smsSettings, letterTemplate: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">متن پیامک ارجاع</label>
                <textarea rows={2} value={smsSettings.referralTemplate} onChange={(e) => setSmsSettings({ ...smsSettings, referralTemplate: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">پیامک اطلاع‌رسانی جلسه</label>
                <textarea rows={2} value={smsSettings.meetingTemplate} onChange={(e) => setSmsSettings({ ...smsSettings, meetingTemplate: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                <p className="text-[11px] text-slate-400 mt-1" dir="ltr">{'{meetingTitle} {meetingDate} {meetingTime} {departmentName}'}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">پیامک رد پیشنهاد</label>
                <textarea rows={2} value={smsSettings.proposalRejectionTemplate} onChange={(e) => setSmsSettings({ ...smsSettings, proposalRejectionTemplate: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                <p className="text-[11px] text-slate-400 mt-1" dir="ltr">{'{proposalTitle} {organizationName}'}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button onClick={handleSaveSmsSettings} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer">
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره تنظیمات</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">ارسال آزمایشی</h3>
            <p className="text-[12px] text-slate-400">این بخش صرفاً یک شبیه‌سازی (Mock) است و به هیچ سرویس پیامکی واقعی متصل نیست.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره تلفن آزمایشی</label>
                <input type="text" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="09121234567" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">متن آزمایشی</label>
                <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleSendTest} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer">
                <Send className="w-3.5 h-3.5" />
                <span>ذخیره و ارسال تست</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'CALENDAR' && (
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-800">مدیریت تقویم‌ها</h3>
            <button onClick={openNewCalendarForm} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow-xs cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>تقویم جدید</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[12px]">
                  <th className="py-2.5 px-3 font-semibold">تقویم</th>
                  <th className="py-2.5 px-3 font-semibold">دسترسی</th>
                  <th className="py-2.5 px-3 font-semibold">دسترسی‌های مجاز</th>
                  <th className="py-2.5 px-3 font-semibold">عمومی</th>
                  <th className="py-2.5 px-3 font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calendars.map((cal) => (
                  <tr key={cal.id}>
                    <td className="py-3 px-3 font-bold text-slate-800">{cal.name}</td>
                    <td className="py-3 px-3 text-slate-600">{cal.accessType === 'PUBLIC' ? 'عمومی' : 'محدود'}</td>
                    <td className="py-3 px-3 text-slate-600">{cal.allowedAccess || '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cal.isPublic ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {cal.isPublic ? 'بله' : 'خیر'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditCalendarForm(cal)} className="p-1.5 rounded-lg text-teal-700 hover:bg-teal-50 cursor-pointer" title="ویرایش">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteCalendar(cal.id)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" title="حذف">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isCalendarFormOpen && editingCalendar && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800">تعریف / ویرایش تقویم</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نام تقویم</label>
                  <input type="text" value={editingCalendar.name} onChange={(e) => setEditingCalendar({ ...editingCalendar, name: e.target.value })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع دسترسی</label>
                  <select value={editingCalendar.accessType} onChange={(e) => setEditingCalendar({ ...editingCalendar, accessType: e.target.value as 'PUBLIC' | 'RESTRICTED', isPublic: e.target.value === 'PUBLIC' })} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none">
                    <option value="RESTRICTED">محدود</option>
                    <option value="PUBLIC">عمومی</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">دسترسی‌های مجاز</label>
                  <input type="text" value={editingCalendar.allowedAccess} onChange={(e) => setEditingCalendar({ ...editingCalendar, allowedAccess: e.target.value })} placeholder="مثال: مدیران ارشد، واحد فناوری اطلاعات" className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={() => { setIsCalendarFormOpen(false); setEditingCalendar(null); }} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer">انصراف</button>
                  <button onClick={handleSaveCalendar} className="px-5 py-2 text-xs font-bold bg-teal-800 hover:bg-teal-700 text-white rounded-full shadow-xs cursor-pointer">ذخیره</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'THEME' && (
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4">
          <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">تم سامانه</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'brand' as const, label: 'تم سازمانی', icon: Palette },
              { id: 'glass' as const, label: 'آبی شیشه‌ای', icon: Droplets },
              { id: 'dark' as const, label: 'تم تیره', icon: Moon },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setAppTheme(id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  appTheme === id ? 'border-teal-700 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-6 h-6 ${appTheme === id ? 'text-teal-700' : 'text-slate-500'}`} />
                <span className={`text-xs font-bold ${appTheme === id ? 'text-teal-900' : 'text-slate-700'}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
