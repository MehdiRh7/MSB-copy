import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, 
  Search, 
  Bell, 
  Moon, 
  Sun, 
  LogOut, 
  Layers, 
  CheckCircle2, 
  Calendar, 
  FileText, 
  UserCheck, 
  ChevronDown,
  User as UserIcon,
  ShieldAlert,
  Check,
  Trash2,
  Inbox
  ,Palette
  ,Droplets
  ,Clock3
} from 'lucide-react';
import { useApp, AppRoute } from '../../context/AppContext';
import { requestDesktopNotifications } from '../../services/proactiveAlertService';
import { toPersianDigits } from '../../utils/formatters';
import { meetingService, resolutionService, taskService } from '../../services';
import { Meeting, Resolution, Task } from '../../types';
import { DEFAULT_ORGANIZATION_PROFILE, useOrganizationProfile } from '../../services/organizationProfile';
import { hasDemoData } from '../../services/demoDataService';

export const Navbar: React.FC = () => {
  const { 
    currentUser, 
    setCurrentUser, 
    availableUsers, 
    toggleSidebar, 
    globalSearch, 
    setGlobalSearch,
    notifications,
    unreadNotificationsCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearAllNotifications,
    navigateTo,
    setIsLoginModalOpen,
    showToast,
    appTheme,
    setAppTheme
  } = useApp();
  const organization = useOrganizationProfile();
  // برچسب واضح وقتی داده نمونه (دمو) در این مرورگر بارگذاری شده است.
  const showingSample = hasDemoData();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<{ meetings: Meeting[]; resolutions: Resolution[]; tasks: Task[] }>({ meetings: [], resolutions: [], tasks: [] });
  const [now, setNow] = useState(new Date());
  const todayJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const currentTime = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global search: query meetings/resolutions/tasks visible to the current user
  useEffect(() => {
    const term = globalSearch.trim();
    if (term.length < 2) {
      setSearchResults({ meetings: [], resolutions: [], tasks: [] });
      setShowSearchResults(false);
      return;
    }
    const isAdmin = currentUser.role === 'ADMIN';
    const timer = window.setTimeout(() => {
      Promise.all([
        meetingService.getMeetings({ searchTerm: term, pageSize: 5, participantUserId: isAdmin ? undefined : currentUser.id }),
        resolutionService.getResolutions({ searchTerm: term, pageSize: 5, relatedUserId: isAdmin ? undefined : currentUser.id }),
        taskService.getMyTasks(currentUser.id, { searchTerm: term, pageSize: 5 }),
      ]).then(([meetingsRes, resRes, taskRes]) => {
        setSearchResults({
          meetings: meetingsRes.isSuccess ? meetingsRes.data.items : [],
          resolutions: resRes.isSuccess ? resRes.data.items : [],
          tasks: taskRes.isSuccess ? taskRes.data.items : [],
        });
        setShowSearchResults(true);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [globalSearch, currentUser.id]);

  const totalSearchResults = searchResults.meetings.length + searchResults.resolutions.length + searchResults.tasks.length;

  const handleSelectMeeting = (meeting: Meeting) => {
    navigateTo('meeting-details', { meetingId: meeting.id });
    setShowSearchResults(false);
    setGlobalSearch('');
  };

  const handleSelectResolution = (resolution: Resolution) => {
    navigateTo('resolutions', { resolutionId: resolution.id });
    setShowSearchResults(false);
    setGlobalSearch('');
  };

  const handleSelectTask = (task: Task) => {
    navigateTo('tasks');
    setShowSearchResults(false);
    setGlobalSearch('');
  };

  // Single unified list, newest first. dateJalali/timeString are zero-padded
  // Persian-digit strings (e.g. "۱۴۰۳/۰۶/۱۱", "۰۹:۱۵"), and Persian digits are
  // sequential Unicode code points, so plain string comparison on the
  // concatenated key sorts them chronologically without needing a parser.
  const sortedNotifications = [...notifications].sort((a, b) => {
    const keyA = toPersianDigits(`${a.dateJalali} ${a.timeString}`);
    const keyB = toPersianDigits(`${b.dateJalali} ${b.timeString}`);
    return keyA < keyB ? 1 : keyA > keyB ? -1 : 0;
  });

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    markNotificationAsRead(notif.id);
    setShowNotifications(false);

    if (notif.targetResolutionId) {
      navigateTo('resolutions', { resolutionId: notif.targetResolutionId });
      showToast(notif.title, 'مصوبه مربوطه نمایش داده شد.', 'info');
    } else if (notif.targetRoute) {
      const cleanRoute = notif.targetRoute.replace('/', '') as AppRoute;
      navigateTo(cleanRoute);
      showToast(notif.title, 'انتقال به بخش مربوطه انجام شد.', 'info');
    }
  };

  return (
    <header className="no-print app-surface h-[72px] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 shrink-0 sticky top-0 z-40 shadow-xs select-none">
      <div className="w-full flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Right side: App Title & Toggle & Organization Logo */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button 
            onClick={toggleSidebar}
            className="md:hidden p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
            title="منو"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="flex min-w-0 items-center gap-3 cursor-pointer select-none rounded-2xl text-right"
            title="بازگشت به پیشخوان"
          >
            {/* لوگو روی کاشی سفید با حاشیه روشن قرار می‌گیرد تا روی هر زمینه‌ای
                (آبی شیشه‌ای، سازمانی یا تیره) دیده شود. نام و لوگو از
                «اطلاعات سازمان» در تنظیمات خوانده می‌شوند. */}
            {/* لوگو روی پلاک روشن با هاله آبی؛ اگر فایل ذخیره‌شده خراب باشد، نشان پیش‌فرض نمایش داده می‌شود. */}
            <span className="app-logo-plate">
              <img
                src={organization.logoUrl || DEFAULT_ORGANIZATION_PROFILE.logoUrl}
                onError={(e) => { if (!e.currentTarget.src.endsWith(DEFAULT_ORGANIZATION_PROFILE.logoUrl)) e.currentTarget.src = DEFAULT_ORGANIZATION_PROFILE.logoUrl; }}
                alt={`نشان ${organization.name || organization.systemTitle}`}
                className="app-logo"
              />
            </span>
            <span className="hidden sm:block h-9 w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent" aria-hidden="true" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] sm:text-[15px] font-black text-slate-900 dark:text-slate-100 tracking-tight">{organization.systemTitle}</span>
              {organization.name.trim() && (
                <span className="hidden sm:block truncate text-[11px] font-bold text-[var(--app-primary)] mt-0.5">{organization.name}</span>
              )}
            </span>
          </button>
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden lg:flex flex-1 max-w-md mx-4 items-center gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('msb-open-command-palette'))}
            title="فرمان سریع هوشمند (Ctrl+K)"
            className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-bold text-white bg-gradient-to-l from-violet-600 via-indigo-600 to-sky-500 shadow-sm hover:shadow-md"
          >
            <span aria-hidden>✨</span>
            <span>فرمان سریع</span>
            <kbd className="rounded bg-white/20 px-1 text-[9px]">Ctrl K</kbd>
          </button>
          <div className="relative w-full" ref={searchRef}>
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={() => { if (totalSearchResults > 0) setShowSearchResults(true); }}
              placeholder="جستجوی شماره مصوبه، عنوان جلسه، نام مسئول..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 pr-9 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            {globalSearch && (
              <button
                onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600"
              >
                پاک کردن
              </button>
            )}

            {showSearchResults && (
              <div className="absolute top-full mt-2 w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 max-h-96 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                {totalSearchResults === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">نتیجه‌ای یافت نشد</div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.resolutions.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400">مصوبات</div>
                        {searchResults.resolutions.map((r) => (
                          <button key={r.id} onClick={() => handleSelectResolution(r)} className="w-full text-right px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{r.topicTitle}</div>
                              <div className="text-[10px] text-slate-400">{r.resolutionNumber}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.meetings.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400">جلسات</div>
                        {searchResults.meetings.map((m) => (
                          <button key={m.id} onClick={() => handleSelectMeeting(m)} className="w-full text-right px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{m.title}</div>
                              <div className="text-[10px] text-slate-400">{m.meetingNumber}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.tasks.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-extrabold text-slate-400">وظایف</div>
                        {searchResults.tasks.map((t) => (
                          <button key={t.id} onClick={() => handleSelectTask(t)} className="w-full text-right px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{t.resolutionTitle}</div>
                              <div className="text-[10px] text-slate-400">{t.resolutionNumber}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Left side: Role switcher, Notifications, Theme switch, User Profile, Date & Time */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          
          {/* Quick Role Switcher */}
          <div className="relative order-4" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 max-w-[56px] sm:max-w-[260px] bg-white/80 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-1 pr-1 pl-1 sm:pl-3 rounded-full border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
              aria-label={`کاربر: ${currentUser.fullName}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-blue-900 text-[10px] font-black text-white">
                {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" /> : currentUser.fullName.replace(/^(مهندس|دکتر|خانم|آقای)\s+/, '').slice(0, 2)}
              </span>
              <span className="hidden sm:flex min-w-0 flex-col text-right leading-tight">
                <span className="sr-only">کاربر:</span>
                <span className="truncate font-extrabold text-[11.5px]">{currentUser.fullName}</span>
                <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{currentUser.title}</span>
              </span>
              <ChevronDown className="hidden sm:block w-3 h-3 shrink-0 text-slate-400" />
            </button>

            {/* Dropdown for role switching */}
            {showUserMenu && (
              <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">تغییر کاربر فعال (شبیه‌سازی)</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400">بررسی سطح دسترسی‌ها و کارتابل‌ها با هویت‌های مختلف</p>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {availableUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setCurrentUser(user);
                        setShowUserMenu(false);
                        showToast('تغییر کاربر فعال', `شما اکنون با هویت "${user.fullName}" در سامانه هستید.`, 'info');
                      }}
                      className={`w-full text-right p-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        currentUser.id === user.id 
                          ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{user.fullName}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-400">{user.title}</div>
                      </div>
                      {currentUser.id === user.id && <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notifications Dropdown (Item 5 Fixed) */}
          {showingSample && (
            <span className="order-1 hidden md:inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10.5px] font-extrabold text-sky-800" title="داده‌های نمونه برای نمایش؛ از تنظیمات ← داده نمایشی قابل حذف است">داده نمونه</span>
          )}
          <div className="relative order-2" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`p-2 rounded-full relative transition-colors cursor-pointer ${
                showNotifications 
                  ? 'bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-teal-800 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="اعلان‌ها و اطلاعیه‌ها"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center px-1 border-2 border-white dark:border-slate-900">
                  {toPersianDigits(unreadNotificationsCount)}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3.5 z-50 animate-in fade-in slide-in-from-top-2 space-y-2.5">
                {/* Notification Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900 dark:text-slate-100">اعلان‌های سامانه</h4>
                      <p className="text-[10px] text-slate-400">پیام‌ها و ارجاعات جدید شما</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                      <button
                        onClick={async () => { const result = await requestDesktopNotifications(); showToast('اعلان دسکتاپ', result === 'granted' ? 'اعلان‌های فوری حتی وقتی سامانه در پس‌زمینه است نمایش داده می‌شوند.' : 'اجازه اعلان دسکتاپ داده نشد.', result === 'granted' ? 'success' : 'info'); }}
                        className="text-[10px] text-indigo-700 font-bold px-2 py-1 rounded-lg hover:bg-indigo-50 cursor-pointer"
                        title="دریافت اعلان فوری روی دسکتاپ"
                      >
                        🔔 اعلان دسکتاپ
                      </button>
                    )}
                    {unreadNotificationsCount > 0 && (
                      <button
                        onClick={markAllNotificationsAsRead}
                        className="text-[10px] text-teal-800 dark:text-teal-300 hover:underline font-bold px-2 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950 cursor-pointer flex items-center gap-1"
                        title="علامت‌گذاری همه به عنوان خوانده‌شده"
                      >
                        <Check className="w-3 h-3" />
                        <span>خوانده شد</span>
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-[10px] text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="پاکسازی اعلان‌ها"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Notification List — a single unified list (no read/unread
                    tabs), newest first; unread items get a soft highlighted
                    background, seen items look normal but stay in the list. */}
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-0.5">
                  {sortedNotifications.length === 0 ? (
                    <div className="text-center py-8 space-y-2 text-slate-400 dark:text-slate-500">
                      <Inbox className="w-7 h-7 mx-auto opacity-40" />
                      <p className="text-xs font-medium">اعلانی وجود ندارد</p>
                    </div>
                  ) : (
                    sortedNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-2.5 rounded-2xl text-xs transition-all cursor-pointer border ${
                          !notif.isRead 
                            ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/70' 
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {!notif.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0"></span>
                            )}
                            <span className="font-extrabold text-slate-800 dark:text-slate-200">{notif.title}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono whitespace-nowrap">
                            {toPersianDigits(notif.dateJalali)} {toPersianDigits(notif.timeString)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{notif.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme selector */}
          <div className="relative order-3" ref={themeMenuRef}>
            <button
              onClick={() => setShowThemeMenu((prev) => !prev)}
              className="hidden sm:block p-2 text-slate-500 dark:text-slate-400 hover:text-[var(--app-primary)] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="انتخاب تم سامانه"
            >
              {appTheme === 'glass' ? <Droplets className="w-4 h-4 text-sky-500" /> : appTheme === 'dark' ? <Moon className="w-4 h-4" /> : <Palette className="w-4 h-4 text-fuchsia-700" />}
            </button>
            {showThemeMenu && (
              <div className="app-surface absolute left-0 mt-2 w-44 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 z-50">
                {[
                  { id: 'brand', label: 'تم سازمانی', icon: Palette },
                  { id: 'glass', label: 'آبی شیشه‌ای', icon: Droplets },
                  { id: 'dark', label: 'تم تیره', icon: Moon },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setAppTheme(id as 'brand' | 'glass' | 'dark'); setShowThemeMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${appTheme === id ? 'app-nav-active text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="order-1 hidden xl:flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[11px] py-1.5 px-3 rounded-full border border-slate-200 dark:border-slate-700 whitespace-nowrap"
            title="تاریخ و ساعت جاری"
          >
            <Calendar className="w-3.5 h-3.5 text-[var(--app-primary)]" />
            <span>{todayJalali}</span>
            <span className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
            <Clock3 className="w-3.5 h-3.5 text-[var(--app-primary)] shrink-0" />
            {/* Fixed width (not just tabular-nums) so a second's digit change
                never nudges the elements to its right — Persian numeral
                glyphs aren't guaranteed tabular figures in every font. */}
            <span dir="ltr" className="tabular-nums inline-block text-left" style={{ width: '6.5ch' }}>{currentTime}</span>
          </div>

          {/* Logout / Switch User */}
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="order-5 p-2 text-slate-400 hover:text-rose-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="خروج / تغییر کاربر"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
