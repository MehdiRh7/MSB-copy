import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AppNotification, PermissionKey } from '../types';
import { mockUsers, mockNotifications, mockTasks, mockResolutions } from '../mock/data';
import { userService } from '../services/userService';
import { loadLocalCollection, loadLocalValue, saveLocalCollection, saveLocalValue } from '../services/localStore';
import { getPermissionLabel } from '../utils/permissionLabels';
import { AUTO_REFRESH_INTERVAL_MS } from '../config/constants';
import { getCurrentJalaliDate } from '../utils/date';
import { buildProactiveRiskAlerts, showDesktopNotification } from '../services/proactiveAlertService';

export type AppRoute =
  | 'dashboard'
  | 'proposals'
  | 'archive'
  | 'meetings'
  | 'meeting-details'
  | 'resolutions'
  | 'tasks'
  | 'approvals'
  | 'notification-inbox'
  | 'follow-up'
  | 'reports'
  | 'infographics'
  | 'calendar'
  | 'users'
  | 'settings'
  | 'guide';

export type AppTheme = 'brand' | 'glass' | 'dark';

interface ToastInfo {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

export interface ResolutionPrefill {
  executionDescription?: string;
  mainResponsibleUserId?: string;
  priority?: import('../types').PriorityLevel;
  deadlineDays?: number;
}

export interface CreateResolutionModalState {
  isOpen: boolean;
  defaultMeetingId?: string;
  defaultAgendaItemId?: string;
  defaultTopicTitle?: string;
  /** پیش‌پر شدن از استخراج هوشمند مصوبه (قابل ویرایش). */
  prefill?: ResolutionPrefill;
}

interface AppContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  availableUsers: User[];
  addUser: (userData: Omit<User, 'id'>) => Promise<User>;
  updateUser: (id: string, userData: Omit<User, 'id'>) => Promise<User>;
  deleteUser: (id: string) => Promise<void>;
  currentRoute: AppRoute;
  navigateTo: (route: AppRoute, params?: { meetingId?: string; resolutionId?: string; taskId?: string }) => void;
  selectedMeetingId: string | null;
  setSelectedMeetingId: (id: string | null) => void;
  selectedResolutionId: string | null;
  setSelectedResolutionId: (id: string | null) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  clearAllNotifications: () => void;
  toasts: ToastInfo[];
  showToast: (title: string, message: string, type?: ToastInfo['type']) => void;
  removeToast: (id: string) => void;
  isCreateMeetingOpen: boolean;
  setIsCreateMeetingOpen: (open: boolean) => void;
  createMeetingInitialDate: string;
  openCreateMeetingModal: (defaultDate?: string) => void;
  isAiAssistantOpen: boolean;
  setIsAiAssistantOpen: (open: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  isAuthenticated: boolean;
  login: (usernameOrId: string, password?: string) => boolean;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  resolutionModalState: CreateResolutionModalState;
  openCreateResolutionModal: (opts?: { meetingId?: string; agendaItemId?: string; topicTitle?: string; prefill?: ResolutionPrefill }) => void;
  closeCreateResolutionModal: () => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to User-2 (مهندس حسینی - مدیر فناوری اطلاعات) or Admin
  const initialUsers = loadLocalCollection('users', mockUsers);
  const savedUserId = loadLocalValue<string | null>('currentUserId', null);
  const [currentUser, setCurrentUserState] = useState<User>(initialUsers.find((user) => user.id === savedUserId) || initialUsers[1] || initialUsers[0]);
  const [availableUsers, setAvailableUsers] = useState<User[]>(initialUsers);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(loadLocalValue('isAuthenticated', true));
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedResolutionId, setSelectedResolutionId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  // The full store, across every user — never expose this directly; consumers
  // must only ever see their own notifications (derived below).
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>(loadLocalCollection('notifications', mockNotifications));
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState<boolean>(false);
  const [createMeetingInitialDate, setCreateMeetingInitialDate] = useState<string>(getCurrentJalaliDate);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [appTheme, setAppThemeState] = useState<AppTheme>('glass');
  const isDarkMode = appTheme === 'dark';
  const [resolutionModalState, setResolutionModalState] = useState<CreateResolutionModalState>({
    isOpen: false,
  });
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const applyTheme = (theme: AppTheme) => {
    document.documentElement.classList.remove('dark', 'theme-brand', 'theme-glass');
    document.documentElement.classList.add(theme === 'dark' ? 'dark' : `theme-${theme}`);
  };

  // Initialize selected visual theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme');
    const initialTheme: AppTheme = savedTheme === 'dark' || savedTheme === 'glass' || savedTheme === 'brand'
      ? savedTheme
      : 'glass';
    setAppThemeState(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const setAppTheme = (theme: AppTheme) => {
    setAppThemeState(theme);
    applyTheme(theme);
    localStorage.setItem('app-theme', theme);
  };

  const toggleDarkMode = () => {
    setAppTheme(isDarkMode ? 'brand' : 'dark');
  };

  useEffect(() => {
    const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/[\u200e\u200f]/g, '');
    // Parses each Jalali date component separately and recombines them
    // arithmetically (year*10000 + month*100 + day) so the comparison is a
    // real calendar comparison, not a comparison of the display strings, and
    // stays correct regardless of how the source string happens to be padded.
    const toComparableDate = (value: string): number => {
      const western = value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
      const match = western.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
      if (!match) return 0;
      const [, y, m, d] = match;
      return Number(y) * 10000 + Number(m) * 100 + Number(d);
    };
    const todayValue = toComparableDate(today);
    const allTasks = loadLocalCollection('tasks', mockTasks);
    const overdueResolutionIds = new Set<string>();
    // فقط وقتی واقعاً وضعیتی تغییر کند ذخیره می‌شود؛ ذخیره تکراری بدون تغییر،
    // با همگام‌سازی لحظه‌ای بین تب‌ها حلقه بی‌پایان می‌ساخت.
    allTasks.forEach((task) => { const deadline = toComparableDate(task.deadlineJalali); if (deadline > 0 && !['CLOSED', 'COMPLETED', 'PENDING_APPROVAL', 'OVERDUE'].includes(task.status) && deadline < todayValue) { task.status = 'OVERDUE'; overdueResolutionIds.add(task.resolutionId); } });
    if (overdueResolutionIds.size > 0) {
      saveLocalCollection('tasks', allTasks);
      const resolutions = loadLocalCollection('resolutions', mockResolutions);
      resolutions.forEach((resolution) => { if (overdueResolutionIds.has(resolution.id) && !['APPROVED_CLOSED', 'ARCHIVED', 'OVERDUE'].includes(resolution.executionStatus)) resolution.executionStatus = 'OVERDUE'; });
      saveLocalCollection('resolutions', resolutions);
    }
    // isOverdue = now > deadline && !isCompleted — restricted to the current
    // user's own tasks, since a deadline notification only belongs to the
    // person it's actually about.
    const tasks = allTasks.filter((task) => task.assignedToUserId === currentUser.id && !['CLOSED', 'COMPLETED', 'PENDING_APPROVAL'].includes(task.status));
    setAllNotifications(() => {
      // Read the current truth from storage rather than the possibly-stale
      // `previous` React state — a service (e.g. proposalService) may have
      // written a notification directly to this same collection since this
      // component mounted, and rebuilding from stale state here would
      // silently drop that write when this effect saves back.
      const stored = loadLocalCollection('notifications', mockNotifications);
      const next = [...stored];
      tasks.forEach((task) => {
        const deadline = toComparableDate(task.deadlineJalali); const overdue = deadline > 0 && deadline < todayValue; const near = !overdue && Math.floor(deadline / 100) === Math.floor(todayValue / 100) && deadline - todayValue <= 7;
        if (!overdue && !near) return;
        const id = `deadline-${task.id}-${overdue ? 'overdue' : 'near'}`;
        if (!next.some((item) => item.id === id)) next.unshift({ id, recipientUserId: currentUser.id, title: overdue ? 'تأخیر در اجرای مصوبه' : 'نزدیک‌شدن مهلت مصوبه', message: `${task.resolutionNumber} — ${task.resolutionTitle} — مهلت ${task.deadlineJalali}`, dateJalali: today, timeString: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }), isRead: false, type: overdue ? 'DEADLINE' : 'FOLLOW_UP', targetRoute: 'tasks', targetResolutionId: task.resolutionId });
      });
      // هشدار پیشگیرانه ریسک تأخیر (روزی یک بار برای هر مصوبه پرریسک).
      next.unshift(...buildProactiveRiskAlerts(currentUser, next));
      if (next.length !== stored.length) saveLocalCollection('notifications', next);
      return next;
    });
  }, [currentUser.id, refreshTrigger]);

  // ——— اعلان لحظه‌ای ———
  // هر تغییر در داده‌ها (همین تب یا تب دیگر) بلافاصله اعلان‌ها را به‌روز
  // می‌کند؛ تغییرات تب‌های دیگر فهرست‌ها را هم بی‌درنگ تازه می‌کنند.
  const knownNotificationIds = React.useRef<Set<string> | null>(null);
  useEffect(() => {
    const announce = (list: AppNotification[]) => {
      const mine = list.filter((n) => n.recipientUserId === currentUser.id && !n.isRead);
      if (knownNotificationIds.current) {
        const fresh = mine.filter((n) => !knownNotificationIds.current!.has(n.id));
        fresh.slice(0, 3).forEach((n) => {
          showToast(`🔔 ${n.title}`, n.message, n.type === 'RISK_ALERT' || n.type === 'DEADLINE' ? 'warning' : 'info');
          showDesktopNotification(n.title, n.message);
        });
      }
      knownNotificationIds.current = new Set(list.filter((n) => n.recipientUserId === currentUser.id).map((n) => n.id));
    };
    knownNotificationIds.current = null;
    announce(loadLocalCollection('notifications', mockNotifications));
    let refreshTimer: number | undefined;
    const reloadNotifications = () => {
      const list = loadLocalCollection('notifications', mockNotifications);
      setAllNotifications(list);
      announce(list);
    };
    const onLocalChange = (event: Event) => {
      const key = (event as CustomEvent<{ key: string }>).detail?.key;
      if (key === 'notifications') reloadNotifications();
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith('postbank-mosavabat-v1:')) return;
      const key = event.key.slice('postbank-mosavabat-v1:'.length);
      if (key === 'notifications') { reloadNotifications(); return; }
      if (['currentUserId', 'isAuthenticated'].includes(key)) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => setRefreshTrigger((prev) => prev + 1), 600);
    };
    window.addEventListener('msb-data-changed', onLocalChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('msb-data-changed', onLocalChange); window.removeEventListener('storage', onStorage); window.clearTimeout(refreshTimer); };
  }, [currentUser.id]);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  // Single, central background refetch: every list page already re-fetches
  // its own data (unchanged loading-free fetch functions) whenever
  // refreshTrigger changes, so one interval here is enough to keep every
  // list/cartable page current without a full browser refresh — no page
  // needs its own setInterval or polling constant.
  useEffect(() => {
    const intervalId = setInterval(triggerRefresh, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  const setCurrentUser = (user: User) => {
    setCurrentUserState(user);
    saveLocalValue('currentUserId', user.id);
  };

  const navigateTo = (route: AppRoute, params?: { meetingId?: string; resolutionId?: string; taskId?: string }) => {
    if (params?.meetingId) {
      setSelectedMeetingId(params.meetingId);
    }
    if (params?.resolutionId) {
      setSelectedResolutionId(params.resolutionId);
    }
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);

  // Every mutation below is scoped to currentUser.id: a notification is only
  // ever marked read/cleared for the person it actually belongs to, so one
  // user's "mark all as read" (or "clear all") can never touch anyone else's.
  const markNotificationAsRead = (id: string) => {
    setAllNotifications((prev) => {
      const next = prev.map((n) => (n.id === id && n.recipientUserId === currentUser.id ? { ...n, isRead: true } : n));
      saveLocalCollection('notifications', next);
      return next;
    });
  };

  const markAllNotificationsAsRead = () => {
    setAllNotifications((prev) => {
      const next = prev.map((n) => (n.recipientUserId === currentUser.id ? { ...n, isRead: true } : n));
      saveLocalCollection('notifications', next);
      return next;
    });
    showToast('اعلان‌ها', 'تمامی اعلان‌ها به عنوان خوانده‌شده علامت‌گذاری شدند.', 'info');
  };

  const clearAllNotifications = () => {
    setAllNotifications((prev) => {
      const next = prev.filter((n) => n.recipientUserId !== currentUser.id);
      saveLocalCollection('notifications', next);
      return next;
    });
    showToast('اعلان‌ها', 'تمامی اعلان‌ها پاک شدند.', 'info');
  };

  // The only notifications ever exposed to consumers (Navbar, badge count,
  // etc.) — filtered to the signed-in user, at the data layer, before any
  // component gets a look at the full multi-user collection.
  const notifications = allNotifications.filter((n) => n.recipientUserId === currentUser.id);
  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  const showToast = (title: string, message: string, type: ToastInfo['type'] = 'success') => {
    const id = `toast-${Date.now()}`;
    const newToast: ToastInfo = { id, title, message, type };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openCreateMeetingModal = (defaultDate?: string) => {
    setCreateMeetingInitialDate(defaultDate || getCurrentJalaliDate());
    setIsCreateMeetingOpen(true);
  };

  const hasPermission = (permission: string): boolean => {
    if (!currentUser) return false;
    // Every authenticated user can access personal meetings, resolutions and tasks.
    // VIEW_APPROVALS is intentionally NOT included here: the verification cartable
    // must reflect each user's real access, not be open to everyone.
    if (['VIEW_MEETINGS', 'VIEW_RESOLUTIONS', 'VIEW_TASKS'].includes(permission)) return true;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.permissions?.includes('VIEW_ALL') || currentUser.permissions?.includes('APPROVE_ALL')) {
      if (permission.startsWith('VIEW_')) return true;
    }
    return currentUser.permissions?.includes(permission) ?? false;
  };

  const login = (usernameOrId: string, password?: string): boolean => {
    // Find user by id, username, or national code
    const user = availableUsers.find(
      (u) =>
        u.id === usernameOrId ||
        (u.username && u.username.toLowerCase() === usernameOrId.toLowerCase()) ||
        u.nationalCode === usernameOrId ||
        u.email.toLowerCase() === usernameOrId.toLowerCase()
    );

    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
      saveLocalValue('isAuthenticated', true);
      setIsLoginModalOpen(false);
      navigateTo('dashboard');
      showToast('ورود موفق', `خوش آمدید ${user.fullName} (${user.title})`, 'success');
      return true;
    }
    showToast('خطای ورود', 'کاربر مورد نظر یافت نشد.', 'error');
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    saveLocalValue('isAuthenticated', false);
    setIsLoginModalOpen(true);
    showToast('خروج از سیستم', 'از حساب کاربری خارج شدید.', 'info');
  };

  const addUser = async (userData: Omit<User, 'id'>): Promise<User> => {
    const res = await userService.createUser(userData);
    const newUser = res.data;
    setAvailableUsers((prev) => [newUser, ...prev]);
    showToast('ثبت کاربر جدید', `کاربر "${newUser.fullName}" با موفقیت اضافه شد.`, 'success');
    triggerRefresh();
    return newUser;
  };

  const updateUser = async (id: string, userData: Omit<User, 'id'>): Promise<User> => {
    const previousPermissions = availableUsers.find((user) => user.id === id)?.permissions || [];
    // The acting user is always passed so the service can enforce who may
    // change a signature image, not just who may open the form.
    const res = await userService.updateUser(id, userData, currentUser);
    const updatedUser = res.data;
    setAvailableUsers((prev) => prev.map((user) => user.id === id ? updatedUser : user));
    if (currentUser.id === id) setCurrentUser(updatedUser);

    // Real Event → real notification: only permissions actually newly granted
    // by this save produce a "دسترسی جدید" notice, so it never gets confused
    // with (or reuses the copy of) unrelated events like a validation request.
    const newlyAssignedPermissions = (updatedUser.permissions || []).filter((p) => !previousPermissions.includes(p));
    if (newlyAssignedPermissions.length > 0) {
      const labels = newlyAssignedPermissions.map((p) => `«${getPermissionLabel(p)}»`).join('، ');
      const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/[‎‏]/g, '');
      const nowTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      const notification: AppNotification = {
        id: `notif-permission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        recipientUserId: id,
        title: 'دسترسی جدید',
        message: newlyAssignedPermissions.length === 1
          ? `دسترسی ${labels} به حساب کاربری شما اضافه شد.`
          : `دسترسی‌های ${labels} به حساب کاربری شما اضافه شد.`,
        dateJalali: today,
        timeString: nowTime,
        isRead: false,
        type: 'PERMISSION_ASSIGNED',
        targetRoute: 'dashboard',
      };
      setAllNotifications((prev) => {
        const next = [notification, ...prev];
        saveLocalCollection('notifications', next);
        return next;
      });
    }

    showToast('ویرایش کاربر', `اطلاعات کاربر «${updatedUser.fullName}» ذخیره شد.`, 'success');
    triggerRefresh();
    return updatedUser;
  };

  const deleteUser = async (id: string): Promise<void> => {
    const target = availableUsers.find((user) => user.id === id);
    await userService.deleteUser(id);
    // deleteUser only deactivates (isActive = false) — the user must stay in
    // the list (not be filtered out) so they remain visible and can be
    // reactivated later; removing them here would make that impossible.
    setAvailableUsers((prev) => prev.map((user) => (user.id === id ? { ...user, isActive: false } : user)));
    showToast('غیرفعال‌سازی کاربر', `کاربر «${target?.fullName || ''}» غیرفعال شد.`, 'info');
    triggerRefresh();
  };

  const openCreateResolutionModal = (opts?: {
    meetingId?: string;
    agendaItemId?: string;
    topicTitle?: string;
    prefill?: ResolutionPrefill;
  }) => {
    setResolutionModalState({
      isOpen: true,
      defaultMeetingId: opts?.meetingId,
      defaultAgendaItemId: opts?.agendaItemId,
      defaultTopicTitle: opts?.topicTitle,
      prefill: opts?.prefill,
    });
  };

  const closeCreateResolutionModal = () => {
    setResolutionModalState({ isOpen: false });
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        availableUsers,
        addUser,
        updateUser,
        deleteUser,
        currentRoute,
        navigateTo,
        selectedMeetingId,
        setSelectedMeetingId,
        selectedResolutionId,
        setSelectedResolutionId,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        toggleSidebar,
        globalSearch,
        setGlobalSearch,
        notifications,
        unreadNotificationsCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        clearAllNotifications,
        toasts,
        showToast,
        removeToast,
        isCreateMeetingOpen,
        setIsCreateMeetingOpen,
        createMeetingInitialDate,
        openCreateMeetingModal,
        isAiAssistantOpen,
        setIsAiAssistantOpen,
        isLoginModalOpen,
        setIsLoginModalOpen,
        isAuthenticated,
        login,
        logout,
        hasPermission,
        resolutionModalState,
        openCreateResolutionModal,
        closeCreateResolutionModal,
        refreshTrigger,
        triggerRefresh,
        isDarkMode,
        toggleDarkMode,
        appTheme,
        setAppTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
