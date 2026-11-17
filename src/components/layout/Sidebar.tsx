import React, { useEffect, useState } from 'react';
import { PanelRightClose, PanelRightOpen,
  LayoutDashboard,
  Calendar,
  FileCheck2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet,
  Clock,
  UserCheck,
  Settings,
  Lightbulb,
  Archive,
  Send,
  ClipboardList
} from 'lucide-react';
import { useApp, AppRoute } from '../../context/AppContext';
import { toPersianDigits } from '../../utils/formatters';
import { meetingService, resolutionService, taskService, approvalService } from '../../services';
import { followUpService } from '../../services/followUpService';
import { hasOrgWideMeetingAccess } from '../../services/userScope';

interface NavGroup {
  id: string;
  title: string;
  items: {
    route: AppRoute;
    title: string;
    icon: React.ElementType;
    badge?: number;
    badgeColor?: string;
    action?: () => void;
  }[];
}

export const Sidebar: React.FC = () => {
  const {
    currentRoute,
    navigateTo,
    isSidebarCollapsed,
    toggleSidebar,
    currentUser,
    hasPermission,
    refreshTrigger,
    setIsSidebarCollapsed
  } = useApp();

  const [counts, setCounts] = useState({ meetings: 0, resolutions: 0, tasks: 0, approvals: 0, notifyPending: 0, noticeSignaturePending: 0, followUpPending: 0 });

  useEffect(() => {
    const isAdmin = currentUser.role === 'ADMIN';
    const canNotify = hasPermission('NOTIFY_RESOLUTION');
    const canFollowUp = hasPermission('VIEW_RESOLUTION_FOLLOWUP');
    Promise.all([
      meetingService.getMeetings({ pageSize: 1, participantUserId: hasOrgWideMeetingAccess(currentUser.role) ? undefined : currentUser.id }),
      resolutionService.getResolutions({ pageSize: 1, relatedUserId: isAdmin ? undefined : currentUser.id }),
      taskService.getMyTasks(currentUser.id, { pageSize: 1 }),
      approvalService.getMyApprovals(currentUser.id, { pageSize: 1, status: 'PENDING' }),
      canNotify ? resolutionService.getResolutions({ pageSize: 1, executionStatus: 'WAITING_NOTIFICATION' }) : Promise.resolve(null),
      // ابلاغیه‌های در انتظار امضای همین کاربر به‌عنوان دبیر جلسه — کارتابل
      // ابلاغ برای ایشان هم باز می‌شود، حتی بدون مجوز NOTIFY_RESOLUTION.
      resolutionService
        .getResolutions({ pageSize: 200, executionStatus: 'PENDING_SECRETARY_NOTICE_SIGNATURE' })
        .then((res) => (res.isSuccess ? resolutionService.filterNoticesAwaitingSignatureBy(res.data.items, currentUser) : []))
        .catch(() => []),
      canFollowUp ? followUpService.getFollowUpCartable(currentUser).catch(() => null) : Promise.resolve(null),
    ]).then(([meetingsRes, resRes, taskRes, apprRes, notifyRes, noticeSignatureRes, followUpRes]) => {
      setCounts({
        meetings: meetingsRes.isSuccess ? meetingsRes.data.totalCount : 0,
        resolutions: resRes.isSuccess ? resRes.data.totalCount : 0,
        tasks: taskRes.isSuccess ? taskRes.data.totalCount : 0,
        approvals: apprRes.isSuccess ? apprRes.data.totalCount : 0,
        notifyPending: notifyRes?.isSuccess ? notifyRes.data.totalCount : 0,
        noticeSignaturePending: noticeSignatureRes?.length || 0,
        followUpPending: followUpRes?.isSuccess ? followUpRes.data.length : 0,
      });
    });
  }, [currentUser.id, refreshTrigger]);

  const allNavGroups: NavGroup[] = [
    {
      id: 'dashboards',
      title: 'پیشخوان',
      items: [
        {
          route: 'dashboard',
          title: 'داشبورد مدیریتی',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      id: 'meetings_resolutions',
      title: 'جلسات و مصوبات',
      items: [
        // ثبت پیشنهاد برای کاربر عادی تنها مسیر عملیاتی مجاز اوست؛ کنترل
        // اقدام‌های بررسی/تبدیل داخل خود صفحه بر اساس نقش انجام می‌شود.
        ...([{
          route: 'proposals' as AppRoute,
          title: 'مصوبات پیشنهادی',
          icon: Lightbulb,
        }]),
        {
          route: 'meetings' as AppRoute,
          title: 'مدیریت جلسات',
          icon: Calendar,
          badge: counts.meetings,
          badgeColor: 'bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
        },
        {
          route: 'resolutions' as AppRoute,
          title: 'بانک مصوبات',
          icon: FileCheck2,
          badge: counts.resolutions,
          badgeColor: 'bg-teal-700 text-white',
        },
        {
          route: 'calendar' as AppRoute,
          title: 'تقویم جلسات',
          icon: Clock,
        },
      ],
    },
    {
      id: 'cartable',
      title: 'کارتابل و تکالیف',
      items: [
        ...(currentUser.role !== 'CEO' && hasPermission('VIEW_TASKS')
          ? [
              {
                route: 'tasks' as AppRoute,
                title: 'وظایف ارجاعی من',
                icon: CheckSquare,
                badge: counts.tasks,
                badgeColor: 'bg-rose-500 text-white',
              },
            ]
          : []),
        ...(hasPermission('VIEW_APPROVALS') || currentUser.role === 'ADMIN' || currentUser.role === 'DEPT_MANAGER' || currentUser.role === 'CEO'
          ? [
              {
                route: 'approvals' as AppRoute,
                title: 'کارتابل صحه‌گذاری',
                icon: ShieldCheck,
                badge: counts.approvals,
                badgeColor: 'bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
              },
            ]
          : []),
        // کارتابل ابلاغ برای مسئول دفتر (ثبت ابلاغ) و برای دبیر جلسه‌ای که
        // ابلاغیه‌ای در انتظار امضای اوست، باز می‌شود.
        ...(hasPermission('NOTIFY_RESOLUTION') || hasPermission('VIEW_NOTIFICATION_DRAFT') || counts.noticeSignaturePending > 0
          ? [
              {
                route: 'notification-inbox' as AppRoute,
                title: 'کارتابل ابلاغ',
                icon: Send,
                badge: counts.notifyPending + counts.noticeSignaturePending,
                badgeColor: 'bg-fuchsia-50 dark:bg-fuchsia-950 text-fuchsia-800 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800',
              },
            ]
          : []),
        ...(hasPermission('VIEW_RESOLUTION_FOLLOWUP')
          ? [
              {
                route: 'follow-up' as AppRoute,
                title: 'پیگیری',
                icon: ClipboardList,
                badge: counts.followUpPending,
                badgeColor: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
              },
            ]
          : []),
        ...(hasPermission('VIEW_ORGANIZATION_ARCHIVE') || currentUser.role === 'ADMIN' ? [{
          route: 'archive' as AppRoute,
          title: 'بایگانی',
          icon: Archive,
        }] : []),
      ],
    },
    {
      id: 'reports_system',
      title: 'گزارش و راهنما',
      items: [
        ...(currentUser.role === 'ADMIN' ? [{
          route: 'reports' as AppRoute,
          title: 'گزارش عملکرد',
          icon: FileSpreadsheet,
        }] : []),
        // تنظیمات برای همه باز است (اینفوگراف، راهنمای کاربری و جانشین امضا)؛
        // تب‌های مدیریتی داخل SettingsView فقط برای مدیر سیستم نمایش داده می‌شوند.
        {
          route: 'settings' as AppRoute,
          title: currentUser.role === 'ADMIN' || hasPermission('MANAGE_USERS') ? 'تنظیمات' : 'راهنما و تنظیمات',
          icon: Settings,
        },
      ],
    },
  ];

  const navGroups = allNavGroups.filter((g) => g.items.length > 0);

  // در موبایل منو یک کشوی روی صفحه است و به‌صورت پیش‌فرض بسته می‌ماند تا
  // محتوای اصلی تمام عرض صفحه را داشته باشد.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (isMobile) setIsSidebarCollapsed(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);
  const showLabels = isMobile || !isSidebarCollapsed;

  if (isMobile && isSidebarCollapsed) return null;

  return (
    <>
    {isMobile && <div className="no-print fixed inset-0 top-[72px] z-40 bg-slate-950/40 backdrop-blur-[2px]" onClick={toggleSidebar} aria-hidden="true" />}
    <aside
      className={`no-print app-surface bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-l border-slate-200 dark:border-slate-800 transition-[width] duration-300 ease-in-out flex flex-col justify-start shrink-0 select-none ${
        isMobile ? 'fixed right-0 top-[72px] bottom-0 z-50 w-72 shadow-2xl' : `z-30 h-full sticky top-0 shadow-xs relative ${isSidebarCollapsed ? 'w-16' : 'w-56'}`
      }`}
    >
      {/* Floating drawer handle — the primary, always-reachable way to
          collapse/expand the sidebar, sitting on its outer edge so it never
          scrolls out of reach and reads as a deliberate "drawer" control. */}
      <button
        onClick={toggleSidebar}
        title={!showLabels ? 'باز کردن منو' : 'جمع کردن منو'}
        aria-label={!showLabels ? 'باز کردن منو' : 'جمع کردن منو'} className="sidebar-toggle group absolute top-[8.4rem] -left-3.5 z-50 w-7 h-7 rounded-lg hidden md:flex items-center justify-center cursor-pointer"
      >
        {!showLabels ? (
          <PanelRightOpen className="w-4 h-4" />
        ) : (
          <PanelRightClose className="w-4 h-4" />
        )}
      </button>

      {/* User Info Box - Placed at the very TOP, above "پیشخوان" (Dashboard) */}
      <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:from-slate-800/40">
        {showLabels ? (
          <div className="profile-card p-2.5 rounded-xl flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 text-white flex items-center justify-center text-[12px] font-bold shrink-0 overflow-hidden ring-1 ring-white/30">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt={currentUser.fullName} className="w-full h-full object-cover" />
              ) : (
                <span>{currentUser.fullName.slice(0, 2)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-white truncate">{currentUser.fullName}</p>
              <p className="text-[11px] text-white/75 font-semibold truncate">{currentUser.title}</p>
            </div>
          </div>
        ) : (
          <div
            className="w-9 h-9 mx-auto rounded-lg bg-[var(--app-primary)] text-white flex items-center justify-center text-[11px] font-bold shadow-xs ring-2 ring-white dark:ring-slate-800 cursor-pointer overflow-hidden"
            title={`${currentUser.fullName} - ${currentUser.title}`}
            onClick={toggleSidebar}
          >
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.fullName} className="w-full h-full object-cover" />
            ) : (
              <span>{currentUser.fullName.slice(0, 2)}</span>
            )}
          </div>
        )}
      </div>

      {/* Navigation List — scrolls independently within the sidebar itself
          (never clipped, never tied to the page's own scroll) so every item
          stays reachable no matter how tall the menu grows. */}
      <div className="flex-1 py-2 px-2 space-y-2.5 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group) => (
          <div key={group.id} className="space-y-0.5">
            {/* Group Header */}
            {showLabels ? (
              <div className="px-2 pt-1 pb-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {group.title}
              </div>
            ) : (
              <div className="h-2 flex items-center justify-center">
                <div className="w-4 h-px bg-slate-200 dark:bg-slate-700" />
              </div>
            )}

            {/* Group Items */}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const ItemIcon = item.icon;
                const isActive = currentRoute === item.route && !item.action;

                return (
                  <button
                    key={item.title}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      } else {
                        navigateTo(item.route);
                        if (isMobile) setIsSidebarCollapsed(true);
                      }
                    }}
                    title={item.title}
                    className={`group relative w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'app-nav-active text-white font-bold shadow-xs'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-bold hover:translate-x-[-2px]'
                    } ${!showLabels ? 'justify-center px-1 py-2' : ''}`}
                  >
                    {/* Active-item accent bar */}
                    {isActive && showLabels && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 h-4/5 w-1 rounded-full bg-white/70" />
                    )}
                    <div className="flex items-center gap-2 truncate">
                      <ItemIcon
                        className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-white' : 'text-slate-400 dark:text-slate-400'
                        }`}
                      />
                      {showLabels && (
                        <span className="truncate text-[13px] leading-5">{item.title}</span>
                      )}
                    </div>

                    {showLabels && item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full leading-tight ${
                          item.badgeColor || 'bg-teal-700 text-white'
                        }`}
                      >
                        {toPersianDigits(item.badge)}
                      </span>
                    )}

                    {/* Collapsed-state badge dot (no room for a full pill) */}
                    {!showLabels && item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute top-1 left-1/2 translate-x-3 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
    </>
  );
};
