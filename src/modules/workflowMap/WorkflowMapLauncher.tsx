import React, { useEffect, useMemo, useState } from 'react';
import { GitBranch, X, Search, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { proposalService } from '../../services/proposalService';
import { meetingService } from '../../services/meetingService';
import { resolutionService } from '../../services/resolutionService';
import { boardSecretariatService } from '../../services/boardSecretariatService';
import { taskService } from '../../services/taskService';
import { toPersianDigits } from '../../utils/formatters';
import {
  PHASES,
  STEP_OWNERS,
  STEP_STATE_META,
  WorkflowCase,
  WorkflowMapSource,
  WorkflowStep,
  buildWorkflowCases,
} from './workflowMapModel';

/**
 * «نقشه گردش کار» — قابلیت Read-Only و کاملاً ایزوله برای Demo.
 *
 * تنها نقطه اتصال آن به سامانه، یک خط رندر همین Component در App.tsx است.
 * هیچ Action ی را اجرا نمی‌کند، هیچ Status ی را تغییر نمی‌دهد و هیچ داده‌ای
 * ذخیره نمی‌کند — فقط از سرویس‌های موجود می‌خواند.
 */
export const WorkflowMapLauncher: React.FC = () => {
  const { currentUser, refreshTrigger } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<WorkflowMapSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // انتخاب پرونده با ID پایدارِ Entity ریشه نگهداری می‌شود، نه با Index یا
  // عنوان؛ پس رفتن به پرونده دیگر و برگشتن، وضعیت این یکی را Reset نمی‌کند.
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [proposalsRes, meetingsRes, resolutionsRes, noticesRes, tasksRes] = await Promise.all([
          proposalService.getProposals({ pageSize: 500 }),
          meetingService.getMeetings({ pageSize: 500 }),
          resolutionService.getResolutions({ pageSize: 500, includeArchived: true }),
          boardSecretariatService.getNotices(),
          taskService.getMyTasks(undefined, { pageSize: 500 }),
        ]);
        if (cancelled) return;
        setSource({
          proposals: proposalsRes.isSuccess ? proposalsRes.data.items : [],
          meetings: meetingsRes.isSuccess ? meetingsRes.data.items : [],
          resolutions: resolutionsRes.isSuccess ? resolutionsRes.data.items : [],
          notices: noticesRes.isSuccess ? noticesRes.data : [],
          tasks: tasksRes.isSuccess ? tasksRes.data.items : [],
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isOpen, refreshTrigger, currentUser.id]);

  const cases = useMemo(() => (source ? buildWorkflowCases(source) : []), [source]);

  const filteredCases = useMemo(() => {
    const term = search.trim();
    if (!term) return cases;
    return cases.filter((item) =>
      item.title.includes(term) || item.reference.includes(term) || toPersianDigits(item.reference).includes(term));
  }, [cases, search]);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );

  // اگر هیچ پرونده‌ای انتخاب نشده، اولین مورد فهرست نمایش داده می‌شود؛ اما
  // انتخاب صریح کاربر هرگز با Refresh داده جابه‌جا نمی‌شود.
  const activeCase = selectedCase || filteredCases[0] || null;

  return (
    <>
      <div className="no-print fixed bottom-[4.25rem] left-4 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="نقشه گردش کار"
          aria-label="نقشه گردش کار"
          className="group flex items-center bg-white/95 dark:bg-slate-800 text-slate-700 dark:text-slate-100 font-bold text-xs p-1.5 rounded-full shadow-lg hover:shadow-xl border border-slate-200 dark:border-slate-600 transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-indigo-900 text-blue-700 dark:text-indigo-300 flex items-center justify-center">
            <GitBranch className="w-4 h-4" />
          </div>
          <span className="tracking-tight max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 group-hover:max-w-40 group-hover:px-2 group-focus-visible:max-w-40 group-focus-visible:px-2">نقشه گردش کار</span>
        </button>
      </div>

      {isOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-800 text-teal-300">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">نقشه گردش کار</h3>
                  <p className="text-[12px] text-teal-200">نمای کلی مسیر هر پرونده — فقط نمایشی، هیچ اقدامی از اینجا ثبت نمی‌شود</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="بستن"
                className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
              {/* انتخاب پرونده */}
              <aside className="sm:w-72 shrink-0 border-l border-slate-100 bg-slate-50/60 flex flex-col max-h-48 sm:max-h-none">
                <div className="p-3 border-b border-slate-100">
                  <label className="block text-[12px] font-bold text-slate-600 mb-1.5">انتخاب پرونده</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 right-2.5" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="جستجوی عنوان یا شماره..."
                      className="w-full text-xs py-2 pr-8 pl-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {loading && <div className="text-center text-[12px] text-slate-400 py-6">در حال بارگذاری...</div>}
                  {!loading && filteredCases.length === 0 && (
                    <div className="text-center text-[12px] text-slate-400 py-6 px-3 leading-6">
                      هنوز پرونده‌ای در سامانه ثبت نشده است. با ثبت اولین پیشنهاد، نقشه گردش کار آن همین‌جا نمایش داده می‌شود.
                    </div>
                  )}
                  {filteredCases.map((item) => {
                    const isActive = activeCase?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedCaseId(item.id)}
                        className={`w-full text-right p-2.5 rounded-xl border transition-colors cursor-pointer ${
                          isActive ? 'bg-white border-teal-400 shadow-xs' : 'bg-white/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-[12px] font-bold text-slate-800 line-clamp-2">{item.title}</div>
                        <div className="text-[11px] text-teal-700 font-bold mt-0.5">{toPersianDigits(item.reference)}</div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {PHASES.find((phase) => phase.id === item.currentPhase)?.title} — {item.currentStepTitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* نقشه پرونده انتخاب‌شده */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {!activeCase ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    پرونده‌ای برای نمایش انتخاب نشده است.
                  </div>
                ) : (
                  <CaseMap workflowCase={activeCase} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * نوار فازها: همیشه کل مسیر End-to-End نمایش داده می‌شود تا مخاطب Demo
 * بداند پرونده در ادامه از چه فازهایی عبور خواهد کرد. فاز طی‌شده سبز،
 * فاز جاری پررنگ و فازهای نرسیده کم‌رنگ هستند.
 */
const PhaseRibbon: React.FC<{ workflowCase: WorkflowCase }> = ({ workflowCase }) => {
  const currentIndex = PHASES.findIndex((phase) => phase.id === workflowCase.currentPhase);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PHASES.map((phase, index) => {
        const isCurrent = index === currentIndex;
        const isPassed = currentIndex > -1 && index < currentIndex;
        return (
          <React.Fragment key={phase.id}>
            {index > 0 && <ArrowLeft className="w-3 h-3 text-slate-300 shrink-0" />}
            <span
              className={`text-[12px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                isCurrent
                  ? 'bg-teal-700 text-white border-teal-700'
                  : isPassed
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              {phase.title}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const StepCard: React.FC<{ step: WorkflowStep; isLast: boolean }> = ({ step, isLast }) => {
  const meta = STEP_STATE_META[step.state];
  const isCurrent = step.state === 'CURRENT';
  const branches = step.branches?.filter((branch) => branch.taken || isCurrent) || [];

  return (
    <div className="relative pr-7">
      {/* خط اتصال مراحل */}
      {!isLast && <span className="absolute top-7 right-[11px] bottom-[-14px] w-px bg-slate-200" aria-hidden />}
      <span
        className={`absolute top-1.5 right-0 w-6 h-6 rounded-full border-2 border-white shadow-xs flex items-center justify-center text-[12px] font-bold text-white ${meta.dot}`}
        aria-hidden
      >
        {meta.symbol}
      </span>

      <div
        className={`p-3 rounded-2xl border transition-colors ${
          isCurrent ? 'bg-teal-50/70 border-teal-300' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-slate-800">{step.title}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {STEP_OWNERS[step.ownerKey]}
              {step.ownerName ? <span className="text-slate-700 font-bold"> — {step.ownerName}</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {step.dateJalali && (
              <span className="text-[11px] text-slate-400">{toPersianDigits(step.dateJalali)}</span>
            )}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.chip}`}>
              {meta.symbol} {meta.label}
            </span>
          </div>
        </div>

        {step.note && <div className="text-[12px] text-slate-600 mt-2 leading-6">{step.note}</div>}

        {branches.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1">
            <div className="text-[11px] font-bold text-slate-500">
              {isCurrent ? 'مسیرهای ممکن از این مرحله:' : 'مسیر طی‌شده:'}
            </div>
            {branches.map((branch) => (
              <div
                key={branch.action}
                className={`flex items-start gap-1.5 text-[12px] ${
                  branch.taken ? 'text-slate-800 font-bold' : 'text-slate-400'
                }`}
              >
                <span className="shrink-0">{branch.taken ? '◀' : '◁'}</span>
                <span>
                  {branch.action}
                  <span className={branch.taken ? 'font-medium text-slate-600' : ''}> → {branch.outcome}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CaseMap: React.FC<{ workflowCase: WorkflowCase }> = ({ workflowCase }) => (
  <div className="space-y-4">
    <div className="space-y-2.5 pb-3 border-b border-slate-100">
      <div>
        <h4 className="text-sm font-bold text-slate-900">{workflowCase.title}</h4>
        <div className="text-[12px] text-slate-500 mt-0.5">شماره پرونده: {toPersianDigits(workflowCase.reference)}</div>
      </div>
      <PhaseRibbon workflowCase={workflowCase} />
      <div className="p-2.5 rounded-2xl bg-teal-50/60 border border-teal-200 text-[12px] text-teal-950">
        <strong>وضعیت فعلی:</strong> {workflowCase.currentStepTitle}
        <span className="text-teal-800"> (فاز {PHASES.find((phase) => phase.id === workflowCase.currentPhase)?.title})</span>
      </div>
      {workflowCase.relatedEntities.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {workflowCase.relatedEntities.map((entity) => (
            <span key={entity.label} className="text-[11px] px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600">
              <strong className="text-slate-700">{entity.label}:</strong> {toPersianDigits(entity.value)}
            </span>
          ))}
        </div>
      )}
    </div>

    <div className="space-y-3.5">
      {workflowCase.steps.map((step, index) => (
        <StepCard key={step.id} step={step} isLast={index === workflowCase.steps.length - 1} />
      ))}
    </div>
  </div>
);
