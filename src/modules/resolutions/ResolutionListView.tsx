import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  Search, 
  Filter, 
  Plus, 
  FileDown, 
  ShieldCheck, 
  Clock, 
  User, 
  ChevronLeft, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Calendar
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { resolutionService } from '../../services/resolutionService';
import { Resolution, ResolutionExecutionStatus } from '../../types';
import { toPersianDigits, getResolutionApprovalMeta, getResolutionExecutionMeta, getPriorityMeta } from '../../utils/formatters';
import { mockDepartments } from '../../mock/data';
import { CreateResolutionModal } from './CreateResolutionModal';
import { ResolutionDetailModal } from './ResolutionDetailModal';
import { ListViewActions, ListViewMode } from '../../components/common/ListViewActions';
import { exportListToPdf } from '../../utils/pdfExport';
import { AiButton, AiSourceBadge, useAiFeature, VoiceInputButton } from '../../components/ai/AiKit';
import { semanticSearch, SemanticHit } from '../../services/ai/aiInsights';
import type { AiResult } from '../../services/ai/aiClient';

export const ResolutionListView: React.FC = () => {
  const { showToast, refreshTrigger, selectedResolutionId, setSelectedResolutionId, currentUser, hasPermission } = useApp();

  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [executionFilter, setExecutionFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [proposerDepartmentFilter, setProposerDepartmentFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeModalResId, setActiveModalResId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ListViewMode>('grid');
  // ——— جستجوی مفهومی ———
  const aiSemantic = useAiFeature('semanticSearch');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [semantic, setSemantic] = useState<AiResult<SemanticHit[]> | null>(null);
  const runSemantic = async (text = semanticQuery) => {
    if (!text.trim()) return;
    setSemanticBusy(true);
    try {
      const scope = await resolutionService.getResolutions({ relatedUserId: currentUser.role === 'ADMIN' ? undefined : currentUser.id, pageSize: 1000 });
      setSemantic(await semanticSearch(text, scope.data.items, currentUser.id));
    } finally { setSemanticBusy(false); }
  };

  useEffect(() => {
    fetchResolutions();
  }, [searchTerm, executionFilter, departmentFilter, proposerDepartmentFilter, fromDate, toDate, refreshTrigger, currentUser.id]);

  useEffect(() => {
    if (selectedResolutionId) setActiveModalResId(selectedResolutionId);
  }, [selectedResolutionId]);

  const displayed = semantic ? semantic.data.map((h) => h.resolution) : resolutions;

  const fetchResolutions = async () => {
    setLoading(true);
    try {
      const res = await resolutionService.getResolutions({
        searchTerm,
        executionStatus: executionFilter,
        departmentId: departmentFilter,
        proposerDepartmentName: proposerDepartmentFilter,
        fromDateJalali: fromDate || undefined,
        toDateJalali: toDate || undefined,
        relatedUserId: currentUser.role === 'ADMIN' ? undefined : currentUser.id,
        pageSize: 50,
      });
      if (res.isSuccess) {
        setResolutions(res.data.items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    const opened = exportListToPdf<Resolution>('بانک مصوبات سازمانی', resolutions, [
      { title: 'شماره مصوبه', value: (item) => item.resolutionNumber },
      { title: 'عنوان', value: (item) => item.topicTitle },
      { title: 'جلسه', value: (item) => item.meetingTitle },
      { title: 'مسئول', value: (item) => item.mainResponsibleName || 'نامشخص' },
      { title: 'واحد', value: (item) => item.responsibleDepartmentName },
      { title: 'مهلت', value: (item) => toPersianDigits(item.deadlineJalali || '—') },
      { title: 'وضعیت', value: (item) => getResolutionExecutionMeta(item.executionStatus).label },
    ]);
    showToast(opened ? 'خروجی PDF' : 'خطای خروجی', opened ? 'پنجره ذخیره PDF بانک مصوبات باز شد.' : 'مرورگر اجازه باز شدن پنجره PDF را نداد.', opened ? 'success' : 'error');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-blue-600" />
            <span>بانک مصوبات سازمانی و فرآیند صحه‌گذاری</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            پیگیری وضعیت اجرا، مهلت‌های اقدام، ارجاعات و مراحل صحه‌گذاری تاییدات
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ListViewActions filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} viewMode={viewMode} onViewModeChange={setViewMode} onExportPdf={handleExportPdf} />

          {hasPermission('CREATE_RESOLUTION') && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-full shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت مصوبه جدید</span>
            </button>
          )}
        </div>
      </div>

      {aiSemantic && (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-l from-violet-50 via-white to-white p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runSemantic(); }} placeholder="جستجوی مفهومی — مثلاً «هر چیزی درباره امنیت داده» یا «هزینه‌های شعب»" className="flex-1 min-w-[220px] text-xs p-2.5 bg-white border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-400 focus:outline-none" />
            <VoiceInputButton className="p-2 border border-violet-200 bg-white" onText={(text, isFinal) => { setSemanticQuery(text); if (isFinal) void runSemantic(text); }} />
            <AiButton onClick={() => { void runSemantic(); }} loading={semanticBusy} disabled={!semanticQuery.trim()}>جستجوی مفهومی</AiButton>
            {semantic && <button onClick={() => { setSemantic(null); setSemanticQuery(''); }} className="text-[11px] font-bold text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100">نمایش همه</button>}
          </div>
          {semantic && <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600"><b>{toPersianDigits(semantic.data.length)}</b> مصوبه مرتبط با مفهوم «{semanticQuery}» (به ترتیب ارتباط) <AiSourceBadge result={semantic} /></div>}
        </div>
      )}

      {/* Filter and Search Bar */}
      {filtersOpen && <div className="app-panel bg-white rounded-2xl p-4 shadow-xs border border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در موضوع، شماره مصوبه، نام مسئول..."
            className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
        </div>

        <div>
          <select
            value={executionFilter}
            onChange={(e) => setExecutionFilter(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">تمام وضعیت‌های اجرایی</option>
            <option value="PENDING_OFFICE_SIGNATURE">در انتظار امضای مسئول دفتر</option>
            <option value="PENDING_CEO_SIGNATURE">در انتظار امضای مدیرعامل</option>
            <option value="PENDING_ADMIN_SIGNATURE">در انتظار امضای ادمین</option>
            <option value="PENDING_SIGNATURES">در انتظار امضا (گردش اختصاصی)</option>
            <option value="WAITING_MINUTES_SIGNATURE">در انتظار امضای صورت‌جلسه</option>
            <option value="WAITING_NOTIFICATION">در انتظار ابلاغ رسمی</option>
            <option value="NOTIFIED">ابلاغ شده</option>
            <option value="IN_PROGRESS">در حال انجام (In Progress)</option>
            <option value="WAITING_RESPONSE">در انتظار پاسخ یا همکاری</option>
            <option value="NEEDS_FOLLOW_UP">نیازمند پیگیری دبیرخانه</option>
            <option value="PENDING_APPROVAL">در انتظار صحه‌گذاری (Pending Verification)</option>
            <option value="APPROVED_CLOSED">خاتمه یافته و تایید شده (Closed)</option>
            <option value="REJECTED_RETURNED">عدم تایید در صحه‌گذاری / برگشتی</option>
            <option value="OVERDUE">عقب‌افتاده از موعد (Overdue)</option>
            <option value="ARCHIVED">بایگانی‌شده</option>
          </select>
        </div>

        <div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">همه واحدهای سازمانی</option>
            {mockDepartments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <select value={proposerDepartmentFilter} onChange={(e) => setProposerDepartmentFilter(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700">
            <option value="ALL">همه واحدهای پیشنهاددهنده</option>
            {mockDepartments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
          </select>
        </div>
        <label className="text-[10px] text-slate-500">از تاریخ ثبت/ارجاع
          <input value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="۱۴۰۳/۰۱/۰۱" className="block w-full mt-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
        </label>
        <label className="text-[10px] text-slate-500">تا تاریخ ثبت/ارجاع
          <input value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="۱۴۰۳/۱۲/۲۹" className="block w-full mt-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
        </label>
      </div>}

      {/* Resolutions Grid */}
      {viewMode === 'cards' ? <div className="space-y-3">
        {displayed.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-xs">
            <FileCheck2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">هیچ مصوبه‌ای یافت نشد</h3>
            <p className="text-xs text-slate-400 mt-1">با معیارهای فیلتر فعلی موردی وجود ندارد.</p>
          </div>
        ) : (
          displayed.map((res) => {
            const hit = semantic?.data.find((h) => h.resolution.id === res.id);
            const sMeta = getResolutionExecutionMeta(res.executionStatus);
            const pMeta = getPriorityMeta(res.priority);
            const aMeta = getResolutionApprovalMeta(res.approvalStatus);
            const activeSigner = res.signatureWorkflow?.steps.find((step) => step.status === 'PENDING' && step.signerUserId === currentUser.id)
              || res.signatureWorkflow?.steps[res.signatureWorkflow.currentStepIndex];
            const isCurrentUserSignatureTurn = activeSigner?.status === 'PENDING' && activeSigner.signerUserId === currentUser.id;

            return (
              <div
                key={res.id}
                onClick={() => setActiveModalResId(res.id)}
                className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                      {res.resolutionNumber}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${sMeta.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sMeta.dot}`}></span>
                      <span>{sMeta.label}</span>
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pMeta.bg} ${pMeta.text} border ${pMeta.border}`}>
                      {pMeta.label}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-[-4px] transition-transform">
                    <Eye className="w-4 h-4" />
                    <span>{isCurrentUserSignatureTurn ? 'مشاهده صورت‌جلسه و امضا' : res.signatureWorkflow && res.signatureWorkflow.status !== 'COMPLETED' ? 'مشاهده صورت‌جلسه' : 'بررسی پرونده و صحه‌گذاری'}</span>
                  </div>
                </div>

                <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-1.5 group-hover:text-blue-900 transition-colors">
                  {res.topicTitle}
                </h3>
                {hit && <div className="flex flex-wrap gap-1 mb-2">{hit.matched.slice(0, 6).map((term) => <span key={term} className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">{term}</span>)}</div>}

                <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                  {res.executionDescription || res.requestDescription}
                </p>

                {/* Footer metadata */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>مسئول: <strong className="text-slate-700">{res.mainResponsibleName || 'نامشخص'}</strong> ({res.responsibleDepartmentName})</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>مهلت اقدام: <strong className="text-slate-700">{toPersianDigits(res.deadlineJalali || '—')}</strong></span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    مرجع: {res.meetingTitle} ({res.meetingNumber})
                  </div>

                  {res.verificationConfig?.requiresVerification && (
                    <div className="mr-auto text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{toPersianDigits(res.verificationConfig.steps.length)} مرحله صحه‌گذاری</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div> : (
        <div className="app-panel bg-white rounded-2xl border border-slate-100 shadow-xs overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs text-right">
            <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">شماره</th><th className="p-3">عنوان مصوبه</th><th className="p-3">مسئول / واحد</th><th className="p-3">مهلت</th><th className="p-3">مرجع جلسه</th><th className="p-3">وضعیت</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map((res) => { const meta = getResolutionExecutionMeta(res.executionStatus); return <tr key={res.id} onClick={() => setActiveModalResId(res.id)} className="hover:bg-slate-50 cursor-pointer transition-colors"><td className="p-3 font-bold text-blue-700">{res.resolutionNumber}</td><td className="p-3 font-bold text-slate-800">{res.topicTitle}</td><td className="p-3 text-slate-600">{res.mainResponsibleName || 'نامشخص'}<div className="text-[10px] text-slate-400">{res.responsibleDepartmentName}</div></td><td className="p-3">{toPersianDigits(res.deadlineJalali || '—')}</td><td className="p-3 text-slate-600">{res.meetingTitle}</td><td className="p-3"><span className={`px-2 py-1 rounded-full border font-bold whitespace-nowrap ${meta.bg}`}>{meta.label}</span></td></tr>; })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Resolution Modal */}
      <CreateResolutionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Detail & Action Modal */}
      <ResolutionDetailModal
        resolutionId={activeModalResId}
        onClose={() => {
          setActiveModalResId(null);
          setSelectedResolutionId(null);
        }}
      />
    </div>
  );
};
