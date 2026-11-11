import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, BarChart3, Bell, BookOpen, Bot, Calendar, CalendarDays, ClipboardCheck, Command, CornerDownLeft, FileText, Gavel,
  LayoutDashboard, Lightbulb, ListTodo, Loader2, Moon, Plus, Search, Send, Settings, Sparkles, Sun, Users, Zap,
} from 'lucide-react';
import { AppRoute, useApp } from '../../context/AppContext';
import { loadLocalCollection, loadLocalValue } from '../../services/localStore';
import { mockMeetings, mockResolutions } from '../../mock/data';
import { hasOrgWideMeetingAccess, hasOrgWideResolutionAccess, isMeetingRelatedToUser, isResolutionRelatedToUser } from '../../services/userScope';
import { interpretCommand, scoreCommand } from '../../services/ai/aiService';
import { Meeting, Proposal, Resolution } from '../../types';
import { getMeetingStatusMeta, getResolutionExecutionMeta } from '../../utils/formatters';
import { useAiFeature, VoiceInputButton } from './AiKit';

interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  keywords: string;
  icon: React.ElementType;
  group: 'اقدام' | 'رفتن به' | 'تنظیمات';
  run: () => void;
}

interface EntityHit { id: string; title: string; subtitle: string; kind: 'جلسه' | 'مصوبه' | 'پیشنهاد'; run: () => void }

/**
 * «فرمان سریع» — Ctrl+K / ⌘K از هر جای سامانه. جست‌وجوی هم‌زمان فرمان‌ها،
 * جلسات، مصوبات و پیشنهادها (فقط در Scope خود کاربر)، فرمان صوتی فارسی و
 * درک زبان طبیعی با هوش مصنوعی («یک جلسه جدید برای فردا بساز»).
 */
export const CommandPalette: React.FC = () => {
  const {
    currentUser, hasPermission, navigateTo, openCreateMeetingModal, openCreateResolutionModal, setIsAiAssistantOpen,
    appTheme, setAppTheme, showToast,
  } = useApp();
  const aiCommand = useAiFeature('command');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen((prev) => !prev); }
      if (event.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('msb-open-command-palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('msb-open-command-palette', onOpen); };
  }, []);

  useEffect(() => { if (open) { setQuery(''); setActive(0); window.setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const close = () => setOpen(false);
  const go = (route: AppRoute, params?: Parameters<typeof navigateTo>[1]) => { navigateTo(route, params); close(); };

  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [];
    if (hasPermission('CREATE_MEETING')) list.push({ id: 'new-meeting', title: 'ایجاد جلسه جدید', keywords: 'جلسه جدید بساز برنامه ریزی تشکیل جلسه', icon: Plus, group: 'اقدام', run: () => { openCreateMeetingModal(); close(); } });
    if (hasPermission('CREATE_RESOLUTION')) list.push({ id: 'new-resolution', title: 'ثبت مصوبه جدید', keywords: 'مصوبه جدید ثبت تصویب', icon: Gavel, group: 'اقدام', run: () => { openCreateResolutionModal(); close(); } });
    list.push({ id: 'new-proposal', title: 'ثبت مصوبه پیشنهادی', keywords: 'پیشنهاد جدید ایده ثبت پیشنهاد', icon: Lightbulb, group: 'اقدام', run: () => go('proposals') });
    list.push({ id: 'ask-ai', title: 'پرسش از دستیار هوشمند', keywords: 'دستیار چت سوال هوش مصنوعی', icon: Bot, group: 'اقدام', run: () => { setIsAiAssistantOpen(true); close(); } });
    list.push({ id: 'go-dashboard', title: 'داشبورد', keywords: 'خانه پیشخوان داشبورد', icon: LayoutDashboard, group: 'رفتن به', run: () => go('dashboard') });
    list.push({ id: 'go-meetings', title: 'مدیریت جلسات', keywords: 'جلسات فهرست جلسه', icon: Calendar, group: 'رفتن به', run: () => go('meetings') });
    list.push({ id: 'go-resolutions', title: 'بانک مصوبات', keywords: 'مصوبات فهرست', icon: FileText, group: 'رفتن به', run: () => go('resolutions') });
    list.push({ id: 'go-proposals', title: 'مصوبات پیشنهادی', keywords: 'پیشنهادها کارتابل پیشنهاد', icon: Lightbulb, group: 'رفتن به', run: () => go('proposals') });
    list.push({ id: 'go-calendar', title: 'تقویم هوشمند', keywords: 'تقویم برنامه زمان', icon: CalendarDays, group: 'رفتن به', run: () => go('calendar') });
    if (currentUser.role !== 'CEO') list.push({ id: 'go-tasks', title: 'وظایف ارجاعی من', keywords: 'وظایف کارهای من تسک', icon: ListTodo, group: 'رفتن به', run: () => go('tasks') });
    if (hasPermission('VIEW_APPROVALS') || ['ADMIN', 'DEPT_MANAGER', 'CEO'].includes(currentUser.role)) list.push({ id: 'go-approvals', title: 'کارتابل صحه‌گذاری', keywords: 'صحه گذاری تایید', icon: ClipboardCheck, group: 'رفتن به', run: () => go('approvals') });
    if (hasPermission('NOTIFY_RESOLUTION') || hasPermission('VIEW_NOTIFICATION_DRAFT') || currentUser.role === 'SECRETARY') list.push({ id: 'go-notify', title: 'کارتابل ابلاغ', keywords: 'ابلاغ ابلاغیه امضا', icon: Send, group: 'رفتن به', run: () => go('notification-inbox') });
    if (hasPermission('VIEW_RESOLUTION_FOLLOWUP')) list.push({ id: 'go-followup', title: 'کارتابل پیگیری', keywords: 'پیگیری', icon: Bell, group: 'رفتن به', run: () => go('follow-up') });
    if (hasPermission('VIEW_ORGANIZATION_ARCHIVE') || currentUser.role === 'ADMIN') list.push({ id: 'go-archive', title: 'بایگانی', keywords: 'بایگانی آرشیو', icon: Archive, group: 'رفتن به', run: () => go('archive') });
    if (currentUser.role === 'ADMIN') list.push({ id: 'go-reports', title: 'گزارش عملکرد', keywords: 'گزارش آمار عملکرد', icon: BarChart3, group: 'رفتن به', run: () => go('reports') });
    list.push({ id: 'go-settings', title: 'تنظیمات و راهنما', keywords: 'تنظیمات راهنما', icon: Settings, group: 'رفتن به', run: () => go('settings') });
    list.push({ id: 'go-guide', title: 'راهنمای کاربری', keywords: 'راهنما آموزش', icon: BookOpen, group: 'رفتن به', run: () => go('guide') });
    if (currentUser.role === 'ADMIN' || hasPermission('MANAGE_USERS')) list.push({ id: 'go-users', title: 'مدیریت کاربران', keywords: 'کاربران دسترسی', icon: Users, group: 'رفتن به', run: () => go('users') });
    list.push({ id: 'toggle-theme', title: appTheme === 'dark' ? 'حالت روشن' : 'حالت تاریک', keywords: 'تم تاریک روشن شب', icon: appTheme === 'dark' ? Sun : Moon, group: 'تنظیمات', run: () => { setAppTheme(appTheme === 'dark' ? 'glass' : 'dark'); close(); } });
    return list;
  }, [currentUser, appTheme]);

  const entityHits = useMemo<EntityHit[]>(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const meetings = loadLocalCollection<Meeting[]>('meetings', mockMeetings).filter((m) => hasOrgWideMeetingAccess(currentUser.role) || isMeetingRelatedToUser(m, currentUser.id));
    const resolutions = loadLocalCollection<Resolution[]>('resolutions', mockResolutions).filter((r) => hasOrgWideResolutionAccess(currentUser) || isResolutionRelatedToUser(r, currentUser));
    const proposals = loadLocalValue<Proposal[]>('proposals', []).filter((p) => ['ADMIN', 'CEO', 'SECRETARY'].includes(currentUser.role) || p.proposerUserId === currentUser.id);
    const match = (...fields: (string | undefined)[]) => fields.some((f) => f && f.toLowerCase().includes(q.toLowerCase()));
    return [
      ...meetings.filter((m) => match(m.title, m.meetingNumber, m.location)).slice(0, 4).map((m) => ({ id: `m-${m.id}`, kind: 'جلسه' as const, title: m.title, subtitle: `${m.meetingNumber} · ${m.dateJalali} · ${getMeetingStatusMeta(m.status).label}`, run: () => go('meeting-details', { meetingId: m.id }) })),
      ...resolutions.filter((r) => match(r.topicTitle, r.resolutionNumber, r.mainResponsibleName, r.letterNumber)).slice(0, 4).map((r) => ({ id: `r-${r.id}`, kind: 'مصوبه' as const, title: r.topicTitle, subtitle: `${r.resolutionNumber} · ${getResolutionExecutionMeta(r.executionStatus).label}`, run: () => go('resolutions', { resolutionId: r.id }) })),
      ...proposals.filter((p) => match(p.title, p.proposalNumber, p.proposerName)).slice(0, 3).map((p) => ({ id: `p-${p.id}`, kind: 'پیشنهاد' as const, title: p.title, subtitle: `${p.proposalNumber || ''} · ${p.proposerName}`, run: () => go('proposals') })),
    ];
  }, [query, currentUser]);

  const groups = ['اقدام', 'رفتن به', 'تنظیمات'] as const;
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return groups.flatMap((group) => commands.filter((c) => c.group === group));
    return commands.map((c) => ({ c, score: scoreCommand(query, c) })).filter((x) => x.score >= 0.34).sort((a, b) => b.score - a.score).map((x) => x.c);
  }, [query, commands]);

  const showAiRow = aiCommand && query.trim().split(/\s+/).length >= 2;
  const rows: { key: string; run: () => void }[] = [
    ...filteredCommands.map((c) => ({ key: c.id, run: c.run })),
    ...entityHits.map((e) => ({ key: e.id, run: e.run })),
    ...(showAiRow ? [{ key: 'ai', run: () => runNaturalLanguage() }] : []),
  ];

  async function runNaturalLanguage(text = query) {
    if (!text.trim()) return;
    setThinking(true);
    try {
      const res = await interpretCommand(text, commands.map(({ id, title, keywords }) => ({ id, title, keywords })), currentUser.id);
      const command = commands.find((c) => c.id === res.data.commandId);
      if (command) {
        showToast('فرمان هوشمند', res.data.reply || command.title, 'info');
        command.run();
      } else {
        // پرسش اطلاعاتی است، نه فرمان: به دستیار گفت‌وگو سپرده می‌شود.
        close();
        setIsAiAssistantOpen(true);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('msb-ask-assistant', { detail: text })), 120);
      }
    } finally { setThinking(false); }
  }

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((prev) => Math.min(rows.length - 1, prev + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((prev) => Math.max(0, prev - 1)); }
    if (event.key === 'Enter') { event.preventDefault(); const row = rows[active]; if (row) row.run(); else if (aiCommand) runNaturalLanguage(); }
  };

  const rowClass = (i: number) => `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition ${i === active ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/50 backdrop-blur-sm p-4 pt-[10vh]" onMouseDown={close} dir="rtl">
      <div className="command-palette w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="فرمان سریع">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          {thinking ? <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" /> : <Search className="w-5 h-5 text-slate-400" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={aiCommand ? 'چه کاری انجام دهم؟ مثلاً «جلسه جدید بساز» یا «مصوبات معوق واحد مالی»' : 'جست‌وجوی فرمان، جلسه، مصوبه...'}
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <VoiceInputButton className="p-2" onText={(text, isFinal) => { setQuery(text); if (isFinal && aiCommand) runNaturalLanguage(text); }} />
          <kbd className="hidden sm:inline text-[10px] font-bold text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-2">
          {filteredCommands.map((c, i) => {
            const Icon = c.icon;
            const showHeader = !query.trim() && (i === 0 || filteredCommands[i - 1].group !== c.group);
            return (
              <React.Fragment key={c.id}>
                {showHeader && <div className="px-3 pt-1 pb-1 text-[10px] font-bold text-slate-400">{c.group}</div>}
                <button className={rowClass(i)} onMouseEnter={() => setActive(i)} onClick={c.run}>
                  <span className="p-1.5 rounded-lg bg-slate-100 text-slate-600"><Icon className="w-4 h-4" /></span>
                  <span className="flex-1 text-[13px] font-bold text-slate-800">{c.title}</span>
                  {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-500" />}
                </button>
              </React.Fragment>
            );
          })}
          {entityHits.length > 0 && (
            <div>
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold text-slate-400">نتایج جست‌وجو</div>
              {entityHits.map((hit, j) => {
                const i = filteredCommands.length + j;
                return (
                  <button key={hit.id} className={rowClass(i)} onMouseEnter={() => setActive(i)} onClick={hit.run}>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${hit.kind === 'جلسه' ? 'bg-teal-50 text-teal-700' : hit.kind === 'مصوبه' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{hit.kind}</span>
                    <span className="flex-1 min-w-0"><span className="block text-[13px] font-bold text-slate-800 truncate">{hit.title}</span><span className="block text-[10.5px] text-slate-500 truncate">{hit.subtitle}</span></span>
                  </button>
                );
              })}
            </div>
          )}
          {showAiRow && (
            <button className={`${rowClass(rows.length - 1)} bg-gradient-to-l from-indigo-50 to-white`} onMouseEnter={() => setActive(rows.length - 1)} onClick={() => runNaturalLanguage()}>
              <span className="p-1.5 rounded-lg bg-gradient-to-br from-violet-600 to-sky-500 text-white"><Sparkles className="w-4 h-4" /></span>
              <span className="flex-1 text-[13px] font-bold text-indigo-900">انجام با هوش مصنوعی: «{query}»</span>
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </button>
          )}
          {rows.length === 0 && <div className="py-10 text-center text-xs text-slate-400">موردی یافت نشد.</div>}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><Command className="w-3 h-3" />K برای باز و بسته کردن · ↑↓ برای حرکت · Enter برای اجرا</span>
          {aiCommand && <span className="flex items-center gap-1 text-indigo-600 font-bold"><Sparkles className="w-3 h-3" />درک زبان طبیعی فعال است</span>}
        </div>
      </div>
    </div>
  );
};
