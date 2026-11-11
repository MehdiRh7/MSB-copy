import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  Send, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  User,
  TrendingUp,
  Paperclip,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FormHero } from '../../components/common/FormHero';
import { taskService } from '../../services/taskService';
import { Task, Attachment } from '../../types';
import { toPersianDigits, getPriorityMeta, formatFileSize } from '../../utils/formatters';
import { ResolutionDetailModal } from '../resolutions/ResolutionDetailModal';
import { ListViewActions, ListViewMode } from '../../components/common/ListViewActions';
import { exportListToPdf } from '../../utils/pdfExport';
import { buildAttachmentFromFile } from '../../utils/attachmentFile';
import { AiButton, AiTextAssist, useAiFeature } from '../../components/ai/AiKit';
import { draftProgressReport } from '../../services/ai/aiService';

export const MyTasksView: React.FC = () => {
  const { currentUser, showToast, refreshTrigger } = useApp();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedResolutionId, setSelectedResolutionId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ListViewMode>('grid');

  // Complete task modal state
  const [activeCompletingTask, setActiveCompletingTask] = useState<Task | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeProgressTask, setActiveProgressTask] = useState<Task | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState<'IN_PROGRESS' | 'WAITING_RESPONSE' | 'NEEDS_FOLLOW_UP' | 'OVERDUE'>('IN_PROGRESS');
  const [progressAction, setProgressAction] = useState('');
  const [progressObstacles, setProgressObstacles] = useState('');
  const [progressFiles, setProgressFiles] = useState<File[]>([]);
  const aiWriter = useAiFeature('writer');
  const [draftingReport, setDraftingReport] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [currentUser.id, searchTerm, statusFilter, refreshTrigger]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await taskService.getMyTasks(currentUser.id, {
        searchTerm,
        status: statusFilter,
        pageSize: 50,
      });
      if (res.isSuccess) {
        setTasks(res.data.items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCompleteModal = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setActiveCompletingTask(task);
    setCompletionNotes('');
    setCompletionFiles([]);
  };

  const handleSubmitTaskCompletion = async () => {
    if (!activeCompletingTask) return;
    if (!completionNotes) {
      showToast('خطا', 'لطفاً شرح اقدامات انجام شده را درج فرمایید.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/[‎‏]/g, '');
      // محتوای واقعی فایل ذخیره می‌شود تا دانلود بعدی فایل واقعی بدهد.
      const attachments: Attachment[] = (await Promise.all(
        completionFiles.map((file) => buildAttachmentFromFile(file, currentUser.fullName, uploadDate))
      )).map((built) => built.attachment);
      const res = await taskService.submitTaskCompletion(activeCompletingTask.id, completionNotes, attachments);
      if (res.isSuccess) {
        showToast(
          'اتمام وظیفه',
          activeCompletingTask.requiresVerification
            ? 'وظیفه تکمیل گردید و به کارتابل صحه‌گذاری ارجاع شد.'
            : 'وظیفه خاتمه یافت.',
          'success'
        );
        setActiveCompletingTask(null);
        fetchTasks();
      }
    } catch (e) {
      showToast('خطا', 'خطا در ثبت اتمام وظیفه', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenProgressModal = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setActiveProgressTask(task);
    setProgressPercent(task.progressPercent || 0);
    setProgressStatus(['WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'OVERDUE'].includes(task.status) ? task.status as typeof progressStatus : 'IN_PROGRESS');
    setProgressAction(''); setProgressObstacles(task.obstacles || ''); setProgressFiles([]);
  };

  const handleSubmitProgress = async () => {
    if (!activeProgressTask) return;
    setIsSubmitting(true);
    try {
      const now = new Date();
      const uploadDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[\u200e\u200f]/g, '');
      const attachments = (await Promise.all(
        progressFiles.map((file) => buildAttachmentFromFile(file, currentUser.fullName, uploadDate))
      )).map((built) => built.attachment);
      await taskService.submitProgressReport(activeProgressTask.id, { progressPercent, status: progressStatus, actionDescription: progressAction, obstacles: progressObstacles, attachments }, currentUser);
      showToast('گزارش پیشرفت', 'گزارش پیشرفت ذخیره و به پرونده مصوبه و Timeline افزوده شد.', 'success');
      setActiveProgressTask(null); await fetchTasks();
    } catch (error) { showToast('خطا', error instanceof Error ? error.message : 'گزارش ذخیره نشد.', 'error'); }
    finally { setIsSubmitting(false); }
  };

  const getTaskStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'IN_PROGRESS':
        return { label: 'در حال اقدام', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'WAITING_RESPONSE':
        return { label: 'در انتظار پاسخ', bg: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
      case 'NEEDS_FOLLOW_UP':
        return { label: 'نیازمند پیگیری', bg: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'PENDING_APPROVAL':
        return { label: 'در انتظار صحه‌گذاری', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'RETURNED':
        return { label: 'عدم تایید / بازگشت به مجری', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'CLOSED':
        return { label: 'تایید و خاتمه یافته', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'OVERDUE':
        return { label: 'عقب‌افتاده از موعد', bg: 'bg-red-50 text-red-700 border-red-200' };
      default:
        return { label: 'جدید', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
  };

  const handleExportPdf = () => {
    const opened = exportListToPdf<Task>('لیست وظایف ارجاعی من', tasks, [
      { title: 'شماره مصوبه', value: (item) => item.resolutionNumber },
      { title: 'عنوان وظیفه', value: (item) => item.resolutionTitle },
      { title: 'جلسه', value: (item) => item.meetingTitle },
      { title: 'تاریخ ارجاع', value: (item) => toPersianDigits(item.referralDateJalali) },
      { title: 'مهلت', value: (item) => toPersianDigits(item.deadlineJalali) },
      { title: 'اولویت', value: (item) => getPriorityMeta(item.priority).label },
      { title: 'وضعیت', value: (item) => getTaskStatusBadge(item.status).label },
    ]);
    showToast(opened ? 'خروجی PDF' : 'خطای خروجی', opened ? 'پنجره ذخیره PDF وظایف باز شد.' : 'مرورگر اجازه باز شدن پنجره PDF را نداد.', opened ? 'success' : 'error');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span>کارتابل وظایف و تکالیف من</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            تکالیف ارجاع‌شده از مصوبات جلسات به کاربر: <strong className="text-slate-700">{currentUser.fullName}</strong>
          </p>
        </div>
        <ListViewActions filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} viewMode={viewMode} onViewModeChange={setViewMode} onExportPdf={handleExportPdf} />
      </div>

      {/* Filter toolbar */}
      {filtersOpen && <div className="app-panel bg-white rounded-2xl p-4 shadow-xs border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در عنوان مصوبه یا شماره ارجاع..."
            className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">تمام وظایف</option>
            <option value="IN_PROGRESS">در حال اقدام (In Progress)</option>
            <option value="WAITING_RESPONSE">در انتظار پاسخ</option>
            <option value="NEEDS_FOLLOW_UP">نیازمند پیگیری</option>
            <option value="OVERDUE">دارای تأخیر</option>
            <option value="PENDING_APPROVAL">ارسال‌شده جهت صحه‌گذاری (Pending Approval)</option>
            <option value="RETURNED">بازگشتی به دلیل عدم تایید (Returned)</option>
            <option value="CLOSED">خاتمه یافته (Closed)</option>
          </select>
        </div>
      </div>}

      {/* Tasks List */}
      {viewMode === 'cards' ? <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-xs">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">هیچ وظیفه فعالی در کارتابل ندارید</h3>
            <p className="text-xs text-slate-400 mt-1">کلیه وظایف ارجاع‌شده انجام شده یا فیلتر جاری نتیجه‌ای ندارد.</p>
          </div>
        ) : (
          tasks.map((task) => {
            const pMeta = getPriorityMeta(task.priority);
            const statusBadge = getTaskStatusBadge(task.status);
            const canComplete = ['IN_PROGRESS', 'WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'RETURNED', 'NEW', 'OVERDUE'].includes(task.status);

            return (
              <div
                key={task.id}
                onClick={() => setSelectedResolutionId(task.resolutionId)}
                className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all cursor-pointer space-y-3 group"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                      {task.resolutionNumber}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.bg}`}>
                      {statusBadge.label}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pMeta.bg} ${pMeta.text} border ${pMeta.border}`}>
                      اولویت: {pMeta.label}
                    </span>
                  </div>

                  {canComplete && (
                    <div className="flex flex-wrap gap-2"><button onClick={(e) => handleOpenProgressModal(e, task)} className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs py-1.5 px-3.5 rounded-full shadow-xs transition-colors flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /><span>ثبت پیشرفت</span></button><button
                      onClick={(e) => handleOpenCompleteModal(e, task)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-3.5 rounded-full shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>ثبت اتمام وظیفه</span>
                    </button></div>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-900 transition-colors">
                  {task.resolutionTitle}
                </h3>

                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                  {task.instructions}
                </p>

                {task.rejectionReason && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <div>
                      <strong>علت عدم تایید در مرحله صحه‌گذاری قبلی:</strong> {task.rejectionReason}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5"><div className="flex items-center justify-between text-[11px] font-bold text-slate-600"><span>پیشرفت اجرای مصوبه</span><span>{toPersianDigits(task.progressPercent || 0)}٪</span></div><div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${task.progressPercent || 0}%` }} /></div>{task.lastAction && <div className="text-[11px] text-slate-600">آخرین اقدام: {task.lastAction}</div>}{task.obstacles && <div className="text-[11px] text-orange-700">موانع: {task.obstacles}</div>}</div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div>تاریخ ارجاع: {toPersianDigits(task.referralDateJalali)}</div>
                  <div>مهلت اقدام: <strong className="text-slate-700">{toPersianDigits(task.deadlineJalali)}</strong></div>
                  <div>جلسه: {task.meetingTitle}</div>
                  {task.requiresVerification && (
                    <div className="mr-auto text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>نیاز به صحه‌گذاری پس از اتمام</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div> : (
        <div className="app-panel bg-white rounded-2xl border border-slate-100 shadow-xs overflow-x-auto">
          <table className="w-full min-w-[1000px] text-xs text-right">
            <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">شماره</th><th className="p-3">عنوان وظیفه</th><th className="p-3">جلسه</th><th className="p-3">مهلت</th><th className="p-3">پیشرفت</th><th className="p-3">اولویت</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => { const status = getTaskStatusBadge(task.status); const canReport = ['IN_PROGRESS', 'WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'RETURNED', 'NEW', 'OVERDUE'].includes(task.status); return <tr key={task.id} onClick={() => setSelectedResolutionId(task.resolutionId)} className="hover:bg-slate-50 cursor-pointer transition-colors"><td className="p-3 font-bold text-blue-700">{task.resolutionNumber}</td><td className="p-3 font-bold text-slate-800">{task.resolutionTitle}</td><td className="p-3 text-slate-600">{task.meetingTitle}</td><td className="p-3">{toPersianDigits(task.deadlineJalali)}</td><td className="p-3"><div className="w-24"><div className="flex justify-between text-[10px] mb-1"><span>{toPersianDigits(task.progressPercent || 0)}٪</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-600" style={{ width: `${task.progressPercent || 0}%` }} /></div></div></td><td className="p-3">{getPriorityMeta(task.priority).label}</td><td className="p-3"><span className={`px-2 py-1 rounded-full border font-bold ${status.bg}`}>{status.label}</span></td><td className="p-3">{canReport && <button onClick={(event) => handleOpenProgressModal(event, task)} className="px-3 py-1.5 bg-teal-700 text-white rounded-lg font-bold">ثبت پیشرفت</button>}</td></tr>; })}
            </tbody>
          </table>
        </div>
      )}

      {/* Completion Modal */}
      {activeProgressTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 space-y-4">
            <FormHero icon={TrendingUp} title="ثبت گزارش پیشرفت" subtitle="هر گزارش با نام شما، تاریخ و ساعت در سابقه مصوبه ذخیره می‌شود." meta={[activeProgressTask.resolutionNumber, activeProgressTask.resolutionTitle, `مهلت ${toPersianDigits(activeProgressTask.deadlineJalali)}`]} onClose={() => setActiveProgressTask(null)} />
            <div><label className="text-xs font-bold text-slate-700">درصد پیشرفت: {toPersianDigits(progressPercent)}٪</label><input type="range" min="0" max="100" step="5" value={progressPercent} onChange={(e) => setProgressPercent(Number(e.target.value))} className="w-full accent-teal-700 mt-2" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-slate-700 mb-1">وضعیت پیگیری</label><select value={progressStatus} onChange={(e) => setProgressStatus(e.target.value as typeof progressStatus)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"><option value="IN_PROGRESS">در حال اقدام</option><option value="WAITING_RESPONSE">در انتظار پاسخ</option><option value="NEEDS_FOLLOW_UP">نیازمند پیگیری دبیرخانه</option><option value="OVERDUE">دارای تأخیر</option></select></div><div><label className="block text-xs font-bold text-slate-700 mb-1">مستندات</label><label className="flex items-center gap-2 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"><Paperclip className="w-4 h-4" /><span>{progressFiles.length ? `${toPersianDigits(progressFiles.length)} فایل انتخاب شد` : 'انتخاب فایل‌ها'}</span><input type="file" multiple className="hidden" onChange={(e) => setProgressFiles(Array.from(e.target.files || []))} /></label></div></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">شرح آخرین اقدام *</label><textarea rows={3} value={progressAction} onChange={(e) => setProgressAction(e.target.value)} placeholder="اقدامات انجام‌شده از گزارش قبلی تا امروز — می‌توانید فقط چند کلمه بنویسید یا بگویید" className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl" /><div className="flex flex-wrap items-center gap-2"><AiTextAssist value={progressAction} onChange={setProgressAction} purpose="progress" actorId={currentUser.id} />{aiWriter && activeProgressTask && <AiButton variant="soft" loading={draftingReport} disabled={!progressAction.trim()} onClick={async () => { setDraftingReport(true); try { const res = await draftProgressReport(progressAction, { topicTitle: activeProgressTask.resolutionTitle, resolutionNumber: activeProgressTask.resolutionNumber, deadlineJalali: activeProgressTask.deadlineJalali }, progressPercent, currentUser.id); setProgressAction(res.data); } finally { setDraftingReport(false); } }}>تبدیل یادداشت به گزارش رسمی</AiButton>}</div></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">مشکلات و موانع</label><textarea rows={2} value={progressObstacles} onChange={(e) => setProgressObstacles(e.target.value)} placeholder="وابستگی‌ها، کمبود منابع یا پاسخ‌های در انتظار" className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl" /></div>
            <div className="flex justify-end gap-2"><button onClick={() => setActiveProgressTask(null)} className="app-btn-secondary">انصراف</button><button onClick={handleSubmitProgress} disabled={isSubmitting || !progressAction.trim()} aria-busy={isSubmitting} title={!progressAction.trim() ? 'شرح آخرین اقدام را وارد کنید' : undefined} className="app-btn-primary">{isSubmitting ? <><Clock className="w-4 h-4 animate-spin" />در حال ذخیره...</> : <><TrendingUp className="w-4 h-4" />ثبت گزارش پیشرفت</>}</button></div>
          </div>
        </div>
      )}

      {activeCompletingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4">
            <FormHero icon={CheckCircle2} title="ثبت گزارش اتمام وظیفه" subtitle={activeCompletingTask.requiresVerification ? 'پس از ثبت، مصوبه برای صحه‌گذاری ارسال می‌شود.' : 'پس از ثبت، مصوبه مختومه می‌شود.'} meta={[activeCompletingTask.resolutionNumber, activeCompletingTask.resolutionTitle]} onClose={() => setActiveCompletingTask(null)} />

            <p className="text-xs text-slate-600">
              لطفاً شرح اقدامات، دستاوردها و نتیجه اجرای این تکلیف سازمانی را وارد فرمایید:
            </p>

            <textarea
              rows={4}
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="مثال: پیاده‌سازی زیرساخت تکمیل گردید، تست‌های امنیتی اخذ شد و گزارش به پیوست ضمیمه گردید..."
              className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <AiTextAssist value={completionNotes} onChange={setCompletionNotes} purpose="progress" actorId={currentUser.id} />

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer w-fit">
                <Paperclip className="w-4 h-4" />
                <span>افزودن فایل پیوست</span>
                <input type="file" multiple className="hidden" onChange={(e) => setCompletionFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} />
              </label>
              {completionFiles.length > 0 && (
                <div className="space-y-1.5">
                  {completionFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-200 rounded-xl text-[11px]">
                      <span className="font-bold text-slate-700 truncate">{file.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400">{formatFileSize(file.size)}</span>
                        <button type="button" onClick={() => setCompletionFiles((prev) => prev.filter((_, i) => i !== index))} className="text-slate-400 hover:text-rose-600 cursor-pointer" title="حذف">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveCompletingTask(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSubmitTaskCompletion}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'در حال ثبت...' : 'تایید و ارسال'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution Detail Modal */}
      <ResolutionDetailModal
        resolutionId={selectedResolutionId}
        onClose={() => setSelectedResolutionId(null)}
      />
    </div>
  );
};
