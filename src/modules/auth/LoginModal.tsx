import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, UserCheck, CheckCircle2, Lock, ArrowLeft, X, User, KeyRound, Sparkles } from 'lucide-react';
import { UserRole } from '../../types';
import { OrganizationLogo } from '../../components/common/OrganizationLogo';
import { useOrganizationProfile } from '../../services/organizationProfile';

export const LoginModal: React.FC = () => {
  const organization = useOrganizationProfile();
  const { isLoginModalOpen, setIsLoginModalOpen, availableUsers, login, showToast } = useApp();
  
  const [activeTab, setActiveTab] = useState<'QUICK_ROLE' | 'CREDENTIALS'>('QUICK_ROLE');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  if (!isLoginModalOpen) return null;

  const handleCredentialsLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      showToast('خطا', 'لطفاً نام کاربری را وارد کنید.', 'error');
      return;
    }
    const success = login(usernameInput.trim(), passwordInput);
    if (success) {
      setIsLoginModalOpen(false);
    }
  };

  const handleQuickRoleLogin = (userId: string) => {
    const success = login(userId);
    if (success) {
      setIsLoginModalOpen(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'مدیر ارشد سیستم (دسترسی کامل)', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'CEO':
        return { label: 'رئیس شورا / مدیرعامل', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'SECRETARY':
        return { label: 'دبیر جلسات و مصوبات', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'DEPT_MANAGER':
        return { label: 'مدیر واحد / صحه‌گذار', bg: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'EXPERT_ASSIGNEE':
        return { label: 'کارشناس مسئول اجرا', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      default:
        return { label: 'کاربر سازمانی', bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="app-modal-header text-white p-5 text-center relative shrink-0">
          <button
            onClick={() => setIsLoginModalOpen(false)}
            className="absolute top-4 left-4 text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex justify-center mb-2">
            <OrganizationLogo size={44} src={organization.logoUrl} className="rounded-xl" />
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <span className="text-sm font-bold text-[#ff5260]">{organization.name || organization.systemTitle}</span>
          </div>
          <h2 className="text-base font-bold text-white">ورود و مدیریت نشست کاربری</h2>
          <p className="text-xs text-teal-200 mt-0.5">سامانه جامع جلسات، پیگیری مصوبات و صحه‌گذاری</p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('QUICK_ROLE')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'QUICK_ROLE'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            انتخاب سریع نقش (تست سناریوها)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CREDENTIALS')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'CREDENTIALS'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ورود با نام کاربری و رمز
          </button>
        </div>

        {/* Tab 1: Quick Role Selector */}
        {activeTab === 'QUICK_ROLE' && (
          <div className="p-5 overflow-y-auto space-y-3 flex-1">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>هویت سازمانی مورد نظر را انتخاب نمایید:</span>
              <span className="text-[12px] text-slate-400">تغییر بلادرنگ سطح دسترسی</span>
            </div>

            <div className="space-y-2">
              {availableUsers.slice(0, 7).map((user) => {
                const badge = getRoleBadge(user.role);
                const isSelected = selectedUserId === user.id;

                return (
                  <div
                    key={user.id}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      handleQuickRoleLogin(user.id);
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-400/30'
                        : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-800 text-white flex items-center justify-center font-bold text-xs">
                        {user.fullName.split(' ')[0][0]}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{user.fullName}</div>
                        <div className="text-[12px] text-slate-500">{user.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-teal-700 font-bold">
                      <span>ورود</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Manual Credentials */}
        {activeTab === 'CREDENTIALS' && (
          <form onSubmit={handleCredentialsLogin} className="p-6 space-y-4 flex-1">
            <div className="p-3 bg-teal-50 rounded-2xl border border-teal-200/70 text-xs text-teal-900 leading-relaxed">
              <span className="font-bold block mb-1">راهنمای حساب‌های کاربری تستی:</span>
              نام‌های کاربری نمونه: <code className="font-bold text-teal-800">admin</code> (مدیر سیستم), <code className="font-bold text-teal-800">rostami</code> (مدیرعامل), <code className="font-bold text-teal-800">hosseini</code> (مدیر فناوری), <code className="font-bold text-teal-800">sadeghi</code> (دبیر), <code className="font-bold text-teal-800">niknam</code> (کارشناس)
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">نام کاربری (Username)</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="admin"
                  className="w-full text-xs p-3 pr-9 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono font-bold"
                  dir="ltr"
                />
                <User className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">رمز عبور (Password)</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full text-xs p-3 pr-9 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                  dir="ltr"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-teal-800 hover:bg-teal-700 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>تایید هویت و ورود به سامانه</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
