import React, { useState } from 'react';
import { Settings, Users2, PieChart, BookOpen, Network, PenTool, UserCheck, Database, GitBranch, Sparkles } from 'lucide-react';
import { WorkflowTemplatesTab } from './WorkflowTemplatesTab';
import { AiSettingsTab } from './AiSettingsTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { UserManagementTab } from './UserManagementTab';
import { LdapSettingsTab } from './LdapSettingsTab';
import { SignatureWorkflowTab } from './SignatureWorkflowTab';
import { SignatureDelegationTab } from './SignatureDelegationTab';
import { DemoDataTab } from './DemoDataTab';
import { InfographicsView } from '../infographics/InfographicsView';
import { UserGuideView } from '../guide/UserGuideView';
import { PageHeader } from '../../components/common/PageHeader';
import { useApp } from '../../context/AppContext';

type SettingsMainTab = 'GENERAL' | 'USERS' | 'SIGNATURE_WORKFLOW' | 'WORKFLOW_TEMPLATES' | 'AI' | 'LDAP' | 'DELEGATION' | 'INFOGRAPHICS' | 'GUIDE' | 'DEMO';

export const SettingsView: React.FC = () => {
  const { currentUser, hasPermission } = useApp();

  // اینفوگراف، راهنمای کاربری و جانشین امضا برای همه کاربران در دسترس‌اند؛
  // تنظیمات عمومی، کاربران، گردش امضا، LDAP و داده نمایشی فقط برای مدیر سیستم.
  const canManageSystem = currentUser.role === 'ADMIN' || hasPermission('MANAGE_USERS');

  const tabs: { id: SettingsMainTab; label: string; icon: React.ElementType }[] = [
    ...(canManageSystem
      ? [
          { id: 'GENERAL' as SettingsMainTab, label: 'تنظیمات عمومی', icon: Settings },
          { id: 'USERS' as SettingsMainTab, label: 'مدیریت کاربران', icon: Users2 },
          { id: 'SIGNATURE_WORKFLOW' as SettingsMainTab, label: 'تنظیمات گردش امضا', icon: PenTool },
          { id: 'WORKFLOW_TEMPLATES' as SettingsMainTab, label: 'قالب‌های گردش کار', icon: GitBranch },
          { id: 'LDAP' as SettingsMainTab, label: 'LDAP', icon: Network },
          { id: 'DEMO' as SettingsMainTab, label: 'داده نمایشی', icon: Database },
        ]
      : []),
    // انتخاب و پیکربندی ارائه‌دهنده هوش مصنوعی فقط با مدیر سیستم است.
    ...(currentUser.role === 'ADMIN' ? [{ id: 'AI' as SettingsMainTab, label: 'هوش مصنوعی', icon: Sparkles }] : []),
    { id: 'DELEGATION' as SettingsMainTab, label: 'جانشین امضا', icon: UserCheck },
    { id: 'INFOGRAPHICS' as SettingsMainTab, label: 'اینفوگراف', icon: PieChart },
    { id: 'GUIDE' as SettingsMainTab, label: 'راهنمای کاربری', icon: BookOpen },
  ];

  const [mainTab, setMainTab] = useState<SettingsMainTab>(canManageSystem ? tabs[0].id : 'INFOGRAPHICS');
  const activeTab = tabs.some((t) => t.id === mainTab) ? mainTab : tabs[0].id;

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        icon={Settings}
        title={canManageSystem ? 'تنظیمات سامانه' : 'راهنما و تنظیمات'}
        description={canManageSystem
          ? 'اطلاعات و نشان سازمان، کاربران، گردش امضا، دایرکتوری سازمانی، داده نمایشی، اینفوگراف و راهنمای کاربری'
          : 'مسیر کار سامانه، راهنمای کاربری و تنظیم جانشین امضا'}
      >
        <div className="app-tabs mt-4" role="tablist" aria-label="بخش‌های تنظیمات">
          {tabs.map((tabItem) => {
            const Icon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                role="tab"
                aria-selected={activeTab === tabItem.id}
                onClick={() => setMainTab(tabItem.id)}
                className="app-tab cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tabItem.label}</span>
              </button>
            );
          })}
        </div>
      </PageHeader>

      {activeTab === 'GENERAL' && <GeneralSettingsTab />}
      {activeTab === 'USERS' && <UserManagementTab />}
      {activeTab === 'SIGNATURE_WORKFLOW' && <SignatureWorkflowTab />}
      {activeTab === 'WORKFLOW_TEMPLATES' && <WorkflowTemplatesTab />}
      {activeTab === 'AI' && currentUser.role === 'ADMIN' && <AiSettingsTab />}
      {activeTab === 'LDAP' && <LdapSettingsTab />}
      {activeTab === 'DEMO' && <DemoDataTab />}
      {activeTab === 'DELEGATION' && <SignatureDelegationTab />}
      {activeTab === 'INFOGRAPHICS' && <InfographicsView />}
      {activeTab === 'GUIDE' && <UserGuideView />}
    </div>
  );
};
