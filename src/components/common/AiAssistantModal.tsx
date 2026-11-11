import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, BarChart3, Bot, CalendarDays, Check, ChevronDown,
  ChevronUp, ClipboardCheck, Copy, FileCheck2, ListFilter, LoaderCircle,
  RotateCcw, Send, Sparkles, User as UserIcon, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import {
  ChatChartResult, ChatEntity, ChatResponse, ChatResultItem, chatService,
} from '../../services/chatService';
import { toPersianDigits } from '../../utils/formatters';
import { AiSourceBadge, VoiceInputButton, useAiFeature } from '../ai/AiKit';
import { assistantAnswer, buildAssistantContext } from '../../services/ai/aiService';
import { buildDashboardModel } from '../../modules/dashboard/dashboardData';
import type { AiResult } from '../../services/ai/aiClient';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  timestamp: string;
  text: string;
  result?: ChatResponse;
  isError?: boolean;
  /** پاسخ روایی هوش مصنوعی (در صورت فعال‌بودن) — نتایج ساخت‌یافته دست‌نخورده می‌مانند. */
  ai?: AiResult<string>;
}

const INITIAL_MESSAGES: ChatMessage[] = [{
  id: 'msg-1',
  sender: 'bot',
  timestamp: 'هم‌اکنون',
  text: 'سلام! من دستیار هوشمند اطلاعات سامانه مصوبات هستم. می‌توانید با زبان طبیعی درباره مصوبات، جلسات، وظایف، تأییدها، آمار و نمودارهای سامانه سؤال کنید.',
}];

const SUGGESTED_PROMPTS = [
  'مصوبات در حال اجرا را ببین',
  'جلسات این ماه را نمایش بده',
  'وظایف من را نمایش بده',
  'موارد منتظر تأیید من را نمایش بده',
  'وضعیت کلی مصوبات را بررسی کن',
  'نمودار وضعیت مصوبات را نمایش بده',
  'امروز اول چه کاری انجام بدهم؟',
  'کدام مصوبات در خطر تأخیر هستند و چرا؟',
];

const RESULT_PAGE_SIZE = 10;
const PIE_COLORS = ['#0d9488', '#2563eb', '#7c3aed', '#f59e0b', '#ef4444', '#64748b', '#0891b2'];
const SUMMARY_TONES = {
  teal: 'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  slate: 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  violet: 'bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-800',
};

const getEntityIcon = (entity: ChatEntity) => {
  if (entity === 'meeting') return CalendarDays;
  if (entity === 'task') return ListFilter;
  if (entity === 'approval') return ClipboardCheck;
  return FileCheck2;
};

const getEntityActionLabel = (entity: ChatEntity) => {
  if (entity === 'meeting') return 'مشاهده جلسه';
  if (entity === 'task') return 'رفتن به کارتابل وظایف';
  if (entity === 'approval') return 'رفتن به کارتابل تأیید';
  return 'مشاهده در بانک مصوبات';
};

const getStatusClass = (item: ChatResultItem) => {
  if (['OVERDUE', 'REJECTED', 'REJECTED_RETURNED', 'CANCELLED'].includes(item.status || '')) {
    return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  }
  if (['APPROVED_CLOSED', 'CLOSED', 'COMPLETED', 'HELD', 'APPROVED'].includes(item.status || '')) {
    return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }
  if (['PENDING_APPROVAL', 'PENDING'].includes(item.status || '')) {
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  if (item.status === 'IN_PROGRESS') {
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
  }
  return 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
};

const ChatChart: React.FC<{ chart: ChatChartResult; isDarkMode: boolean }> = ({ chart, isDarkMode }) => {
  const axisColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    borderColor: isDarkMode ? '#334155' : '#cbd5e1',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    fontSize: '11px',
    borderRadius: '10px',
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          {chart.title}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          مجموع: {toPersianDigits(chart.data.reduce((sum, item) => sum + item.count, 0))}
        </span>
      </div>
      <div className="h-52 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'pie' ? (
            <PieChart>
              <Pie data={chart.data} dataKey="count" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {chart.data.map((item, index) => <Cell key={`${item.name}-${index}`} fill={item.fill || PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          ) : chart.type === 'line' ? (
            <LineChart data={chart.data} margin={{ top: 8, right: 10, left: -20, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#0d9488" strokeWidth={3} dot={{ r: 4, fill: '#0d9488' }} />
            </LineChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 8, right: 10, left: -20, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: axisColor }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                {chart.data.map((item, index) => <Cell key={`${item.name}-${index}`} fill={item.fill || PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-1.5" dir="rtl">
        {chart.data.map((item, index) => (
          <span key={item.name} className="text-[10px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill || PIE_COLORS[index % PIE_COLORS.length] }} />
            {item.name}: {toPersianDigits(item.count)}
          </span>
        ))}
      </div>
    </div>
  );
};

export const AiAssistantModal: React.FC = () => {
  const { currentUser, isAiAssistantOpen, setIsAiAssistantOpen, navigateTo, showToast, isDarkMode } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiAssistant = useAiFeature('assistant');
  // پرسش‌هایی که «فرمان سریع» تشخیص داد فرمان نیستند، مستقیم اینجا پرسیده می‌شوند.
  const sendRef = useRef<((text?: string) => void) | null>(null);
  useEffect(() => {
    const onAsk = (event: Event) => { const text = (event as CustomEvent<string>).detail; if (text) window.setTimeout(() => sendRef.current?.(text), 50); };
    window.addEventListener('msb-ask-assistant', onAsk);
    return () => window.removeEventListener('msb-ask-assistant', onAsk);
  }, []);

  useEffect(() => {
    if (isAiAssistantOpen) window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages, isAiAssistantOpen, isTyping, visibleCounts]);

  if (!isAiAssistantOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isTyping) return;
    setMessages((previous) => [...previous, {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      text: query,
    }]);
    setInputText('');
    setIsTyping(true);
    try {
      const result = await chatService.execute(query, currentUser.role === 'ADMIN' ? undefined : currentUser.id);
      // جستجوی ساخت‌یافته (فهرست، آمار، نمودار) همیشه اجرا می‌شود؛ هوش مصنوعی
      // روی همان داده‌های Scope‌شده کاربر یک پاسخ روایی و تحلیلی می‌سازد.
      let ai: AiResult<string> | undefined;
      if (aiAssistant) {
        const history = messages.filter((m) => !m.isError && m.id !== 'msg-1').slice(-6).map((m) => ({ role: m.sender === 'user' ? 'user' as const : 'assistant' as const, content: m.text }));
        const ruleText = `${result.text}\n${result.items.slice(0, 12).map((item) => `- ${item.number ? `${item.number} ` : ''}${item.title}${item.statusLabel ? ` (${item.statusLabel})` : ''}`).join('\n')}`;
        ai = await assistantAnswer(query, history, buildAssistantContext(buildDashboardModel(currentUser)), ruleText, currentUser.id);
      }
      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        text: ai?.source === 'AI' ? ai.data : result.text,
        result,
        ai,
      };
      setMessages((previous) => [...previous, botMessage]);
      setVisibleCounts((previous) => ({ ...previous, [botMessage.id]: RESULT_PAGE_SIZE }));
    } catch (error) {
      setMessages((previous) => [...previous, {
        id: `bot-error-${Date.now()}`,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        text: error instanceof Error ? error.message : 'در دریافت اطلاعات سامانه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.',
        isError: true,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  sendRef.current = handleSendMessage;

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2000);
    showToast('کپی در حافظه', 'متن پیام کپی شد.', 'info');
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
    setVisibleCounts({});
    setExpandedItems({});
    showToast('بازنشانی گفتگو', 'تاریخچه چت با دستیار هوشمند پاکسازی شد.', 'info');
  };

  const toggleDetails = (messageId: string, itemId: string) => {
    const key = `${messageId}:${itemId}`;
    setExpandedItems((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const openItem = (item: ChatResultItem) => {
    setIsAiAssistantOpen(false);
    if (item.route === 'meeting-details') return navigateTo('meeting-details', { meetingId: item.id });
    if (item.route === 'resolutions') return navigateTo('resolutions', { resolutionId: item.id });
    return navigateTo(item.route);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in select-none" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full h-[90vh] max-h-[820px] overflow-hidden flex flex-col">
        <div className="app-modal-header text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-400 to-emerald-300 flex items-center justify-center text-slate-950 font-black shadow-sm shrink-0"><Sparkles className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-white truncate">دستیار هوشمند اطلاعات سامانه مصوبات</h3>
                <span className="text-[10px] bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1 font-bold shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />آنلاین</span>
              </div>
              <p className="text-[11px] text-teal-200 font-medium truncate">جستجوی طبیعی، فیلتر ترکیبی، آمار، نمودار و دسترسی سریع به اطلاعات</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleResetChat} className="text-teal-200 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer" title="شروع مجدد گفتگو"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={() => setIsAiAssistantOpen(false)} className="text-teal-200 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer" title="بستن پنجره"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 p-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button key={prompt} onClick={() => handleSendMessage(prompt)} disabled={isTyping} className="text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-950 hover:text-teal-800 dark:hover:text-teal-300 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shrink-0 transition-all cursor-pointer shadow-2xs disabled:opacity-50">{prompt}</button>
          ))}
        </div>

        <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 bg-slate-50/70 dark:bg-slate-950/40">
          {messages.map((message) => {
            const visibleCount = visibleCounts[message.id] || RESULT_PAGE_SIZE;
            const visibleItems = message.result?.items.slice(0, visibleCount) || [];
            const hasMore = Boolean(message.result && visibleCount < message.result.items.length);
            return (
              <div key={message.id} className={`flex items-start gap-2.5 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-xs ${message.sender === 'user' ? 'bg-slate-800 text-white' : message.isError ? 'bg-rose-600 text-white' : 'bg-teal-700 text-white'}`}>
                  {message.sender === 'user' ? <UserIcon className="w-4 h-4" /> : message.isError ? <AlertCircle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[90%] sm:max-w-[86%] rounded-2xl p-3.5 space-y-2 text-xs leading-relaxed shadow-xs ${message.sender === 'user' ? 'bg-teal-800 text-white rounded-tr-none' : message.isError ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 rounded-tl-none' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none'}`}>
                  <div className="flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/5 pb-1.5">
                    <span className={`text-[10px] font-bold ${message.sender === 'user' ? 'text-teal-200' : message.isError ? 'text-rose-600 dark:text-rose-300' : 'text-teal-700 dark:text-teal-400'}`}>{message.sender === 'user' ? 'شما' : 'دستیار هوشمند'}</span>
                    <div className="flex items-center gap-2">
                      {message.ai && <AiSourceBadge result={message.ai} />}
                      <span className={`text-[9px] ${message.sender === 'user' ? 'text-teal-200' : 'text-slate-400'}`}>{message.timestamp}</span>
                      {message.sender === 'bot' && <button onClick={() => handleCopy(message.text, message.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="کپی متن">{copiedId === message.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button>}
                    </div>
                  </div>
                  <div className="whitespace-pre-line text-xs sm:text-[13px]">{message.text}</div>

                  {message.result?.summary && message.result.summary.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {message.result.summary.map((metric) => (
                        <div key={metric.label} className={`rounded-xl border p-2.5 ${SUMMARY_TONES[metric.tone]}`}>
                          <div className="text-[10px] font-bold opacity-80">{metric.label}</div>
                          <div className="text-lg font-black mt-0.5">{toPersianDigits(metric.value)} <span className="text-[10px] font-bold">مورد</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {message.result?.charts.map((chart) => <ChatChart key={chart.title} chart={chart} isDarkMode={isDarkMode} />)}
                  {message.result?.emptySuggestion && message.ai?.source !== 'AI' && <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-2.5 text-[11px]">{message.result.emptySuggestion}</div>}

                  {visibleItems.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <span className="font-extrabold text-[11px] text-slate-700 dark:text-slate-200">نتایج</span>
                        <span className="text-[10px] text-slate-400">نمایش {toPersianDigits(visibleItems.length)} از {toPersianDigits(message.result?.totalCount || 0)}</span>
                      </div>
                      {visibleItems.map((item, index) => {
                        const Icon = getEntityIcon(item.entity);
                        const detailsKey = `${message.id}:${item.id}`;
                        const isExpanded = Boolean(expandedItems[detailsKey]);
                        return (
                          <div key={`${item.entity}-${item.id}`} className="rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 overflow-hidden transition-all hover:border-teal-300 dark:hover:border-teal-700">
                            <button onClick={() => toggleDetails(message.id, item.id)} className="w-full text-right p-3 cursor-pointer group">
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 font-black text-[10px]">{toPersianDigits(index + 1)}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="font-extrabold text-[12px] text-slate-800 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300 line-clamp-2">{item.title}</div>
                                      {item.number && <div className="text-[10px] text-slate-400 font-mono mt-1">{item.number}</div>}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {item.statusLabel && <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getStatusClass(item)}`}>{item.statusLabel}</span>}
                                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-white/70 dark:bg-slate-800/60">
                                {item.description && <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-6">{item.description}</p>}
                                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                                  {item.details.map((detail) => (
                                    <div key={`${detail.label}-${detail.value}`} className="flex items-start gap-1 text-[10px] leading-5">
                                      <dt className="font-bold text-slate-500 dark:text-slate-400 shrink-0">{detail.label}:</dt>
                                      <dd className="text-slate-700 dark:text-slate-200">{detail.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                                <button onClick={() => openItem(item)} className="mt-1 inline-flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white rounded-xl px-3 py-1.5 text-[10px] font-bold cursor-pointer">
                                  <Icon className="w-3.5 h-3.5" />{getEntityActionLabel(item.entity)}<ArrowLeft className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {hasMore && (
                        <button onClick={() => setVisibleCounts((previous) => ({ ...previous, [message.id]: Math.min(visibleCount + RESULT_PAGE_SIZE, message.result?.items.length || visibleCount) }))} className="w-full py-2 rounded-xl border border-dashed border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-[11px] font-bold cursor-pointer transition-colors">
                          نمایش {toPersianDigits(Math.min(RESULT_PAGE_SIZE, (message.result?.items.length || 0) - visibleCount))} مورد بعدی
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isTyping && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs pr-2">
              <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center"><LoaderCircle className="w-4 h-4 animate-spin" /></div>
              <span>در حال بررسی اطلاعات سامانه...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <form onSubmit={(event) => { event.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
            <input type="text" value={inputText} onChange={(event) => setInputText(event.target.value)} placeholder="مثلاً: مصوبات در حال اجرای واحد فناوری اطلاعات را نمایش بده" className="flex-1 text-xs p-3 px-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400" />
            <VoiceInputButton className="p-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl" onText={(text, isFinal) => { if (isFinal) handleSendMessage(text); else setInputText(text); }} />
            <button type="submit" disabled={!inputText.trim() || isTyping} className="bg-teal-800 hover:bg-teal-700 disabled:opacity-40 text-white font-bold text-xs p-3 px-4 rounded-2xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0"><span className="hidden sm:inline">ارسال</span><Send className="w-4 h-4 rotate-180" /></button>
          </form>
        </div>
      </div>
    </div>
  );
};
