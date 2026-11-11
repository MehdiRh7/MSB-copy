import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ToastContainer } from './components/common/ToastContainer';
import { AiAssistantModal } from './components/common/AiAssistantModal';
import { LoginModal } from './modules/auth/LoginModal';
import { CreateMeetingModal } from './modules/meetings/CreateMeetingModal';
import { CreateResolutionModal } from './modules/resolutions/CreateResolutionModal';

// Views
import { DashboardView } from './modules/dashboard/DashboardView';
import { ProposalsView } from './modules/proposals/ProposalsView';
import { ArchiveView } from './modules/archive/ArchiveView';
import { MeetingListView } from './modules/meetings/MeetingListView';
import { MeetingDetailView } from './modules/meetings/MeetingDetailView';
import { ResolutionListView } from './modules/resolutions/ResolutionListView';
import { MyTasksView } from './modules/tasks/MyTasksView';
import { ApprovalsView } from './modules/approvals/ApprovalsView';
import { NotificationInboxView } from './modules/resolutions/NotificationInboxView';
import { FollowUpCartableView } from './modules/resolutions/FollowUpCartableView';
import { ReportsView } from './modules/reports/ReportsView';
import { InfographicsView } from './modules/infographics/InfographicsView';
import { CalendarView } from './modules/calendar/CalendarView';
import { UsersView } from './modules/users/UsersView';
import { UserGuideView } from './modules/guide/UserGuideView';
import { SettingsView } from './modules/settings/SettingsView';
import { WorkflowMapLauncher } from './modules/workflowMap/WorkflowMapLauncher';
import { CommandPalette } from './components/ai/CommandPalette';

import { Sparkles, Bot, ShieldAlert } from 'lucide-react';

const AccessDenied: React.FC = () => (
  <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-xs">
    <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">دسترسی غیرمجاز</h3>
    <p className="text-xs text-slate-400 mt-1">شما مجوز دسترسی به این بخش را ندارید.</p>
  </div>
);

const AppContent: React.FC = () => {
  const {
    currentRoute,
    selectedMeetingId,
    setIsAiAssistantOpen,
    resolutionModalState,
    closeCreateResolutionModal,
    isDarkMode,
    currentUser,
    hasPermission
  } = useApp();

  const canManageUsers = currentUser.role === 'ADMIN' || hasPermission('MANAGE_USERS');
  const canViewApprovals = hasPermission('VIEW_APPROVALS') || currentUser.role === 'ADMIN' || currentUser.role === 'DEPT_MANAGER' || currentUser.role === 'CEO';
  const canNotifyResolutions = hasPermission('NOTIFY_RESOLUTION');
  const canViewNotificationDraft = hasPermission('VIEW_NOTIFICATION_DRAFT');
  // دبیر جلسه‌ها ابلاغیه امضا می‌کنند و باید به همان کارتابل دسترسی داشته باشند.
  const canSignNotices = currentUser.role === 'ADMIN' || currentUser.role === 'SECRETARY' || hasPermission('APPROVE_MEETING_CONFIRMATION');
  const canViewFollowUp = hasPermission('VIEW_RESOLUTION_FOLLOWUP');

  const renderCurrentView = () => {
    switch (currentRoute) {
      case 'dashboard':
        return <DashboardView />;
      case 'proposals':
        return <ProposalsView />;
      case 'archive':
        return <ArchiveView />;
      case 'meetings':
        return <MeetingListView />;
      case 'meeting-details':
        return <MeetingDetailView meetingId={selectedMeetingId || 'meet-1'} />;
      case 'resolutions':
        return <ResolutionListView />;
      case 'tasks':
        return <MyTasksView />;
      case 'approvals':
        return canViewApprovals ? <ApprovalsView /> : <AccessDenied />;
      case 'notification-inbox':
        // مسئول دفتر (ثبت ابلاغ) و دبیر جلسه (امضای ابلاغیه) هر دو به این
        // کارتابل دسترسی دارند؛ محتوای هر تب خودش Scope شده است.
        return canNotifyResolutions || canSignNotices || canViewNotificationDraft ? <NotificationInboxView /> : <AccessDenied />;
      case 'follow-up':
        return canViewFollowUp ? <FollowUpCartableView /> : <AccessDenied />;
      case 'reports':
        return <ReportsView />;
      case 'infographics':
        return <InfographicsView />;
      case 'calendar':
        return <CalendarView />;
      case 'users':
        return canManageUsers ? <UsersView /> : <AccessDenied />;
      case 'guide':
        return <UserGuideView />;
      case 'settings':
        // اینفوگراف و راهنمای کاربری داخل Settings تب مستقل دارند، پس این صفحه
        // برای همه باز است؛ تب‌های مدیریتی درون SettingsView خودش گیت می‌شوند.
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="app-shell h-screen overflow-hidden bg-white dark:bg-slate-950 flex flex-col text-slate-800 dark:text-slate-100 font-sans antialiased selection:bg-[var(--app-primary)] selection:text-white" dir="rtl">
      {/* Top Navbar */}
      <Navbar />

      {/* Body container: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Right Collapsible Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main className={`app-main flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-950 ${currentRoute === 'calendar' ? 'overflow-hidden' : ''}`}>
          <div className="max-w-7xl mx-auto h-full">
            {renderCurrentView()}
          </div>
        </main>
      </div>

      {/* Floating AI Assistant Trigger */}
      <div className="no-print fixed bottom-4 left-4 z-40">
        <button
          onClick={() => setIsAiAssistantOpen(true)}
          title="دستیار هوشمند (چت)"
          aria-label="دستیار هوشمند (چت)"
          className="group relative flex items-center text-white font-bold text-xs p-1.5 rounded-full shadow-lg hover:shadow-xl border border-blue-900/40 transition-all cursor-pointer bg-gradient-to-br from-[#1d5fd1] to-[#0b2a5b]"
        >
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="tracking-tight max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 group-hover:max-w-40 group-hover:px-2 group-focus-visible:max-w-40 group-focus-visible:px-2">دستیار هوشمند (چت)</span>
        </button>
      </div>

      {/* «نقشه گردش کار» — قابلیت مستقل و Read-Only برای Demo.
          تنها نقطه اتصال این Feature به سامانه همین یک خط است؛ حذف این خط
          و پوشه src/modules/workflowMap آن را کاملاً برمی‌دارد. */}
      <WorkflowMapLauncher />

      {/* فرمان سریع هوشمند (Ctrl+K) */}
      <CommandPalette />

      {/* Global Modals & Notifications */}
      <ToastContainer />
      <AiAssistantModal />
      <LoginModal />
      <CreateMeetingModal />
      
      {/* Global Create Resolution Modal (Triggerable from anywhere, including Meeting Agendas) */}
      <CreateResolutionModal
        isOpen={resolutionModalState.isOpen}
        onClose={closeCreateResolutionModal}
        defaultMeetingId={resolutionModalState.defaultMeetingId}
        defaultAgendaItemId={resolutionModalState.defaultAgendaItemId}
        defaultTopicTitle={resolutionModalState.defaultTopicTitle}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
