import React, { useState } from 'react';
import { Network, Save, PlugZap, ShieldAlert, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ldapService, LdapSettings, LdapConnectionTestResult } from '../../services/ldapService';
import { toPersianDigits } from '../../utils/formatters';

/**
 * تنظیمات LDAP / Active Directory.
 * فقط Configuration است: Login فعلی سامانه به LDAP وابسته نمی‌شود و هیچ
 * اتصال واقعی یا نتیجه موفقیت جعلی نمایش داده نمی‌شود.
 * رمز عبور Masked است و در Source Code یا Storage نوشته نمی‌شود.
 */
export const LdapSettingsTab: React.FC = () => {
  const { showToast } = useApp();
  const [settings, setSettings] = useState<LdapSettings>(() => ldapService.getSettings());
  const [bindPassword, setBindPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<LdapConnectionTestResult | null>(null);

  const update = <K extends keyof LdapSettings>(key: K, value: LdapSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await ldapService.updateSettings(settings, bindPassword);
      setSettings(res.data);
      setBindPassword('');
      setTestResult(null);
      showToast('تنظیمات LDAP', 'تنظیمات دایرکتوری سازمانی ذخیره شد.', 'success');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearPassword = async () => {
    const res = await ldapService.clearBindPassword();
    setSettings(res.data);
    setBindPassword('');
    showToast('تنظیمات LDAP', 'رمز عبور Bind پاک شد.', 'info');
  };

  const handleTest = async () => {
    const res = await ldapService.testConnection();
    setTestResult(res.data);
  };

  const field = 'w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none';
  const label = 'block text-[12px] font-bold text-slate-700 mb-1';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-5">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700">
          <Network className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-800">اتصال به دایرکتوری سازمانی (LDAP / Active Directory)</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            پیکربندی اتصال برای شناسایی و احراز هویت کاربران سازمانی در آینده. ورود فعلی کاربران به سامانه با این تنظیمات تغییر نمی‌کند.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[12px] text-amber-900 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          در این نسخه فقط پیکربندی ذخیره می‌شود و اتصال واقعی به سرور LDAP برقرار نمی‌گردد. رمز عبور Bind در مرورگر ذخیره نمی‌شود و
          پس از راه‌اندازی سرویس سمت سرور، مستقیماً به همان سرویس ارسال خواهد شد.
        </span>
      </div>

      <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={settings.isEnabled}
          onChange={(e) => update('isEnabled', e.target.checked)}
          className="w-4 h-4 text-teal-700 rounded-md cursor-pointer"
        />
        <span className="text-xs font-bold text-slate-700">فعال بودن اتصال LDAP</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>آدرس سرور (Host)</label>
          <input type="text" value={settings.host} onChange={(e) => update('host', e.target.value)} className={field} placeholder="ldap.example.org" dir="ltr" />
        </div>
        <div>
          <label className={label}>پورت (Port)</label>
          <input type="number" value={settings.port} onChange={(e) => update('port', Number(e.target.value))} className={field} dir="ltr" />
          <p className="text-[11px] text-slate-400 mt-1">پیش‌فرض {toPersianDigits('389')} و برای LDAPS معمولاً {toPersianDigits('636')}</p>
        </div>
        <div>
          <label className={label}>Base DN</label>
          <input type="text" value={settings.baseDn} onChange={(e) => update('baseDn', e.target.value)} className={field} placeholder="dc=example,dc=org" dir="ltr" />
        </div>
        <div>
          <label className={label}>Bind DN / نام کاربری</label>
          <input type="text" value={settings.bindDn} onChange={(e) => update('bindDn', e.target.value)} className={field} placeholder="cn=service-account,dc=example,dc=org" dir="ltr" />
        </div>

        <div>
          <label className={label}>رمز عبور Bind</label>
          <div className="flex items-center gap-1.5">
            <input
              type={showPassword ? 'text' : 'password'}
              value={bindPassword}
              onChange={(e) => setBindPassword(e.target.value)}
              className={field}
              placeholder={settings.hasBindPassword ? '••••••••  (رمز فعلی تنظیم شده است)' : 'رمز عبور را وارد کنید'}
              autoComplete="new-password"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              title={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer shrink-0"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            {settings.hasBindPassword && (
              <button
                type="button"
                onClick={handleClearPassword}
                title="پاک کردن رمز ذخیره‌شده"
                className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {settings.hasBindPassword ? 'رمزی تنظیم شده است. برای تغییر، رمز جدید را وارد و ذخیره کنید.' : 'هنوز رمزی تنظیم نشده است.'}
          </p>
        </div>

        <div>
          <label className={label}>User Search Base</label>
          <input type="text" value={settings.userSearchBase} onChange={(e) => update('userSearchBase', e.target.value)} className={field} placeholder="ou=users,dc=example,dc=org" dir="ltr" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>User Search Filter</label>
          <input type="text" value={settings.userSearchFilter} onChange={(e) => update('userSearchFilter', e.target.value)} className={field} placeholder="(sAMAccountName={username})" dir="ltr" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={settings.useSsl} onChange={(e) => update('useSsl', e.target.checked)} className="w-4 h-4 text-teal-700 rounded-md cursor-pointer" />
          <span>استفاده از SSL (LDAPS)</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={settings.useStartTls} onChange={(e) => update('useStartTls', e.target.checked)} className="w-4 h-4 text-teal-700 rounded-md cursor-pointer" />
          <span>استفاده از StartTLS</span>
        </label>
      </div>

      {testResult && (
        <div
          className={`p-3 rounded-2xl border text-[12px] font-bold ${
            testResult.state === 'NOT_CONFIGURED'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
        </button>
        <button
          type="button"
          onClick={handleTest}
          className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer"
        >
          <PlugZap className="w-4 h-4" />
          <span>بررسی پیکربندی اتصال</span>
        </button>
      </div>
    </div>
  );
};
