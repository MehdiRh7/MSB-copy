import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { resolutionService } from '../../services/resolutionService';
import { meetingService } from '../../services/meetingService';
import { proposalService } from '../../services/proposalService';
import { mockDepartments, mockMeetings } from '../../mock/data';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import {
  X,
  FileCheck2,
  Calendar,
  ShieldCheck,
  Lock,
  Building2,
  Repeat,
  CalendarDays,
  UserCheck
} from 'lucide-react';
import {
  ResolutionApprovalStatus,
  PriorityLevel,
  VerificationConfig,
  ResolutionFollowUpType,
} from '../../types';
import { FormStepTabs, FormErrorSummary, FormFieldError, focusField } from '../../components/common/FormStepTabs';
import { buildFollowUpPlan } from '../../services/followUpService';
import { Meeting } from '../../types';
import { addDaysToJalaliDate, getCurrentJalaliDate } from '../../utils/date';
import { AiButton, AiSourceBadge, AiTextAssist, useAiFeature } from '../../components/ai/AiKit';
import { suggestResolution, ResolutionSuggestion } from '../../services/ai/aiService';
import type { AiResult } from '../../services/ai/aiClient';

interface CreateResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMeetingId?: string;
  defaultAgendaItemId?: string;
  defaultTopicTitle?: string;
}

export const CreateResolutionModal: React.FC<CreateResolutionModalProps> = ({
  isOpen,
  onClose,
  defaultMeetingId,
  defaultAgendaItemId,
  defaultTopicTitle,
}) => {
  const { availableUsers, showToast, triggerRefresh, hasPermission, currentUser } = useApp();
  const [meetingOptions, setMeetingOptions] = useState<Meeting[]>(mockMeetings);

  const [selectedMeetingId, setSelectedMeetingId] = useState(defaultMeetingId || '');
  const [selectedAgendaItemId, setSelectedAgendaItemId] = useState(defaultAgendaItemId || '');
  const [topicTitle, setTopicTitle] = useState(defaultTopicTitle || '');
  const [letterNumber, setLetterNumber] = useState('');
  const [proposerName, setProposerName] = useState('');
  const [proposerDepartment, setProposerDepartment] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [reviewResultNotes, setReviewResultNotes] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<ResolutionApprovalStatus>('APPROVED');

  // Execution Details
  const [executionDescription, setExecutionDescription] = useState('');
  const [mainResponsibleUserId, setMainResponsibleUserId] = useState('');
  const [responsibleDepartmentId, setResponsibleDepartmentId] = useState('');
  const [assignedDateJalali, setAssignedDateJalali] = useState(getCurrentJalaliDate);
  const [deadlineJalali, setDeadlineJalali] = useState(() => addDaysToJalaliDate(getCurrentJalaliDate(), 14));
  const [priority, setPriority] = useState<PriorityLevel>('HIGH');

  // Follow-up plan (برنامه پیگیری مصوبه) — monitoring only, never part of
  // the signature/ابلاغ/execution chain.
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpType, setFollowUpType] = useState<ResolutionFollowUpType>('MONTHLY');
  const [followUpStartDateJalali, setFollowUpStartDateJalali] = useState(getCurrentJalaliDate);

  // Verification Settings (single-step only)
  const [requiresVerification, setRequiresVerification] = useState(true);
  const [verifierId, setVerifierId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  // ——— دستیار هوشمند ثبت مصوبه ———
  const aiResolution = useAiFeature('resolutionDraft');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<AiResult<ResolutionSuggestion> | null>(null);
  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const res = await suggestResolution({ topic: topicTitle, request: requestDescription, reviewNotes: reviewResultNotes, presenterName: proposerName, users: availableUsers, departments: mockDepartments }, currentUser.id);
      setSuggestion(res);
      setExecutionDescription(res.data.executionDescription);
      if (res.data.mainResponsibleUserId) setMainResponsibleUserId(res.data.mainResponsibleUserId);
      if (res.data.responsibleDepartmentId) setResponsibleDepartmentId(res.data.responsibleDepartmentId);
      setPriority(res.data.priority);
      setDeadlineJalali(addDaysToJalaliDate(assignedDateJalali || getCurrentJalaliDate(), res.data.deadlineDays));
    } finally { setSuggesting(false); }
  };
  const [activeSection, setActiveSection] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  // Sync with props when modal opens
  useEffect(() => {
    if (isOpen) {
      meetingService.getMeetings({ pageSize: 100 }).then((response) => {
        if (response.isSuccess) setMeetingOptions(response.data.items);
      });
      setSelectedMeetingId(defaultMeetingId || '');
      setSelectedAgendaItemId(defaultAgendaItemId || '');
      setTopicTitle(defaultTopicTitle || '');
      setLetterNumber('');
      setProposerName('');
      setProposerDepartment('');
      void autofillFromSourceProposal(defaultMeetingId, defaultAgendaItemId);
      setRequestDescription('');
      setReviewResultNotes('');
      setExecutionDescription('');
      setMainResponsibleUserId('');
      setResponsibleDepartmentId('');
      setVerifierId('');
      setFollowUpEnabled(true);
      setFollowUpType('MONTHLY');
      const today = getCurrentJalaliDate();
      setAssignedDateJalali(today);
      setDeadlineJalali(addDaysToJalaliDate(today, 14));
      setFollowUpStartDateJalali(today);
    }
  }, [isOpen, defaultMeetingId, defaultAgendaItemId, defaultTopicTitle]);

  /**
   * Autofill شماره نامه / پیشنهاددهنده / واحد پیشنهاددهنده از روی همان
   * Proposal ای که این بند دستور جلسه از آن ساخته شده است.
   * مسیر Relation موجود دنبال می‌شود (بدون Data جدید):
   *   Meeting → AgendaItem.sourceProposalId → Proposal
   * فیلدها همچنان قابل ویرایش‌اند؛ فقط مقدار اولیه درست پر می‌شود.
   */
  const autofillFromSourceProposal = async (meetingId?: string, agendaItemId?: string) => {
    if (!meetingId || !agendaItemId) return;
    const meetingRes = await meetingService.getMeetingById(meetingId);
    const agenda = meetingRes.data?.agendaItems.find((item) => item.id === agendaItemId);
    if (!agenda?.sourceProposalId) return;

    const proposalRes = await proposalService.getProposals({ pageSize: 500 });
    const proposal = proposalRes.isSuccess
      ? proposalRes.data.items.find((item) => item.id === agenda.sourceProposalId)
      : undefined;
    if (!proposal) return;

    // شماره نامه: همان Field مشترک پیشنهاد (فرم دستی و Excel Import).
    if (proposal.sourceLetterNumber) setLetterNumber(proposal.sourceLetterNumber);

    // پیشنهاددهنده: ارائه‌دهنده تأییدشده پیشنهاد، وگرنه ارائه‌دهنده اولیه.
    const presenterName = proposal.confirmedPresenterName || proposal.presenterName;
    if (presenterName) setProposerName(presenterName);

    // واحد پیشنهاددهنده: واحد سازمانی همان ارائه‌دهنده، وگرنه واحد ثبت پیشنهاد.
    const presenterId = proposal.confirmedPresenterId || proposal.presenterUserId;
    const presenterUser = availableUsers.find((user) => user.id === presenterId);
    const department = presenterUser?.departmentName || proposal.proposerDepartmentName;
    if (department) setProposerDepartment(department);
  };

  // Auto-fill responsible department when mainResponsibleUserId changes (Requirement 8)
  useEffect(() => {
    const user = availableUsers.find((u) => u.id === mainResponsibleUserId);
    if (user && user.departmentId) {
      setResponsibleDepartmentId(user.departmentId);
    }
  }, [mainResponsibleUserId, availableUsers]);

  useEffect(() => { if (isOpen) { setShowErrors(false); setActiveSection(0); } }, [isOpen]);

  if (!isOpen) return null;

  const currentResponsibleUser = availableUsers.find((u) => u.id === mainResponsibleUserId);
  const currentResponsibleDept = mockDepartments.find((d) => d.id === responsibleDepartmentId) || 
    { id: responsibleDepartmentId, name: currentResponsibleUser?.departmentName || '' };

  const isLockedMeeting = Boolean(defaultMeetingId);

  // خطاهای ضروری هر بخش؛ پس از اولین تلاش ثبت روی تب‌ها و در خلاصه خطا نمایش داده می‌شوند.
  const approved = approvalStatus === 'APPROVED';
  const formErrors: FormFieldError[] = [
    ...(!selectedMeetingId ? [{ step: 0, fieldId: 'rf-meeting', message: 'جلسه مرجع را انتخاب کنید.' }] : []),
    ...(!topicTitle.trim() ? [{ step: 0, fieldId: 'rf-meeting', message: 'عنوان موضوع مصوبه را وارد کنید.' }] : []),
    ...(approved && !mainResponsibleUserId ? [{ step: 1, fieldId: 'rf-exec', message: 'مسئول اصلی اجرای مصوبه را انتخاب کنید.' }] : []),
    ...(approved && followUpEnabled && !followUpStartDateJalali.trim() ? [{ step: 2, fieldId: 'rf-followup', message: 'تاریخ شروع پیگیری را مشخص کنید.' }] : []),
    ...(approved && requiresVerification && !verifierId ? [{ step: 3, fieldId: 'rf-verify', message: 'صحه‌گذار را انتخاب کنید یا نیاز به صحه‌گذاری را غیرفعال کنید.' }] : []),
  ];
  const sectionIds = ['rf-meeting', 'rf-exec', 'rf-followup', 'rf-verify'];
  const jumpToError = (error: FormFieldError) => { setActiveSection(error.step); focusField(sectionIds[error.step]); };
  const sectionSteps = [
    { label: 'جلسه و موضوع', icon: CalendarDays, errorCount: formErrors.filter((e) => e.step === 0).length, complete: Boolean(selectedMeetingId && topicTitle.trim()) },
    { label: 'مجری و مهلت', icon: UserCheck, errorCount: formErrors.filter((e) => e.step === 1).length, complete: !approved || Boolean(mainResponsibleUserId && deadlineJalali) },
    { label: 'پیگیری', icon: Repeat, errorCount: formErrors.filter((e) => e.step === 2).length, complete: !approved || !followUpEnabled || Boolean(followUpStartDateJalali) },
    { label: 'صحه‌گذاری', icon: ShieldCheck, errorCount: formErrors.filter((e) => e.step === 3).length, complete: !approved || !requiresVerification || Boolean(verifierId) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('CREATE_RESOLUTION')) {
      showToast('دسترسی غیرمجاز', 'شما مجاز به ثبت مصوبه جدید نیستید.', 'error');
      return;
    }
    if (formErrors.length > 0) {
      setShowErrors(true);
      jumpToError(formErrors[0]);
      return;
    }

    const meeting = meetingOptions.find((m) => m.id === selectedMeetingId);
    if (!meeting) return;
    const responsibleUser = availableUsers.find((u) => u.id === mainResponsibleUserId);

    setIsSubmitting(true);
    try {
      const verifier = availableUsers.find((u) => u.id === verifierId);
      const vConfig: VerificationConfig = {
        requiresVerification,
        mode: 'SEQUENTIAL',
        currentStepIndex: 0,
        steps: requiresVerification && verifier ? [{
          stepNumber: 1,
          approverId: verifier.id,
          approverName: verifier.fullName,
          approverRole: verifier.title,
          status: 'NOT_STARTED',
        }] : [],
      };

      const res = await resolutionService.createResolution({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        meetingNumber: meeting.meetingNumber,
        agendaItemId: selectedAgendaItemId || undefined,
        agendaItemTitle: defaultTopicTitle || undefined,
        topicTitle: topicTitle.trim(),
        letterNumber: letterNumber.trim() || undefined,
        proposerName,
        proposerDepartment,
        requestDescription,
        reviewResultNotes,
        approvalStatus,
        executionDescription: executionDescription || requestDescription || topicTitle,
        mainResponsibleUserId: responsibleUser?.id,
        mainResponsibleName: responsibleUser?.fullName,
        responsibleDepartmentId: currentResponsibleDept.id,
        responsibleDepartmentName: currentResponsibleDept.name,
        assignedDateJalali,
        deadlineJalali,
        priority,
        verificationConfig: vConfig,
        attachments: [],
        followUp: approvalStatus === 'APPROVED' && followUpEnabled
          ? buildFollowUpPlan(followUpType, followUpStartDateJalali)
          : undefined,
      });

      if (res.isSuccess) {
        showToast('ثبت موفق مصوبه', `مصوبه با شماره ${res.data.resolutionNumber} ثبت و برای امضاهای ترتیبی ارسال شد.`, 'success');
        triggerRefresh();
        onClose();
      }
    } catch (err) {
      showToast('خطا', 'ثبت مصوبه با خطا مواجه شد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-200">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">ثبت و صدور مصوبه جدید سازمانی</h3>
              <p className="text-[11px] text-teal-200">
                {isLockedMeeting ? 'ثبت مستقیم مصوبه از دستور جلسه انتخاب‌شده' : 'تنظیم اطلاعات ارجاع، مسئول اجرا و زنجیره صحه‌گذاری'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form noValidate onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* ناوبری بخش‌ها: هر تب مستقیماً به همان بخش فرم می‌رود؛ تیک یعنی بخش کامل است. */}
          <FormStepTabs
            ariaLabel="بخش‌های فرم مصوبه"
            active={activeSection}
            onSelect={(index) => { setActiveSection(index); focusField(sectionIds[index]); }}
            showErrors={showErrors}
            steps={sectionSteps}
          />
          {showErrors && <FormErrorSummary errors={formErrors.map((e, i) => ({ ...e, fieldId: `${e.fieldId}-${i}` }))} steps={sectionSteps} onJump={jumpToError} />}
          {/* Meeting Selection & Proposal */}
          <div id="rf-meeting" className="space-y-3 scroll-mt-20">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-2 h-2 rounded-full bg-teal-600"></span>
              مشخصات جلسه و مصوبه
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>جلسه مرجع *</span>
                  {isLockedMeeting && (
                    <span className="text-[10px] text-teal-800 font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      قفل شده بر اساس جلسه
                    </span>
                  )}
                </label>
                {isLockedMeeting ? (
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-700" />
                    <span>{meetingOptions.find((m) => m.id === selectedMeetingId)?.title || 'جلسه انتخاب‌شده'}</span>
                  </div>
                ) : (
                  <select
                    value={selectedMeetingId}
                    onChange={(e) => setSelectedMeetingId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">انتخاب جلسه مرجع...</option>
                    {meetingOptions.map((m) => (
                      <option key={m.id} value={m.id}>{m.meetingNumber} - {m.title}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نتیجه بررسی / وضعیت تصویب *</label>
                <select
                  value={approvalStatus}
                  onChange={(e) => setApprovalStatus(e.target.value as ResolutionApprovalStatus)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-bold text-teal-900"
                >
                  <option value="APPROVED">مصوب و ارسال برای امضا (Approved)</option>
                  <option value="CONDITIONAL_APPROVED">مصوب مشروط (Conditional)</option>
                  <option value="REFERRED_FOR_REVIEW">ارجاع مجدد جهت بازبینی و اصلاح</option>
                  <option value="REJECTED">رد شده / عدم تصویب (Rejected)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  عنوان موضوع مصوبه <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  placeholder="مثال: استقرار زیرساخت احراز هویت مرکزی (SSO) سازمانی"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره نامه مربوطه</label>
                <input
                  type="text"
                  value={letterNumber}
                  onChange={(e) => setLetterNumber(e.target.value)}
                  placeholder="مثال: ۱۲۳۴/الف"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">پیشنهاددهنده</label>
                <input
                  type="text"
                  value={proposerName}
                  onChange={(e) => setProposerName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">واحد پیشنهاددهنده</label>
                <input
                  type="text"
                  value={proposerDepartment}
                  onChange={(e) => setProposerDepartment(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">شرح درخواست اولیه و ضرورت</label>
                <textarea
                  rows={2}
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  placeholder="توضیحات و مستندات موضوع مطروحه در جلسه..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Execution & Assignment (Shown when approved) */}
          {approvalStatus === 'APPROVED' && (
            <div id="rf-exec" className="space-y-3 pt-2 scroll-mt-20">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                دستور اجرا، ارجاع و مهلت اقدام
              </h4>

              {aiResolution && (
                <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-indigo-950">✨ متن اجرایی، مسئول، واحد، اولویت و مهلت را هوش مصنوعی پیشنهاد دهد</span>
                    <div className="flex items-center gap-2"><AiSourceBadge result={suggestion} /><AiButton onClick={handleSuggest} loading={suggesting} disabled={!topicTitle.trim() && !requestDescription.trim()}>پیشنهاد هوشمند</AiButton></div>
                  </div>
                  {suggestion?.data.rationale && <p className="text-[10.5px] text-slate-600">{suggestion.data.rationale} — همه موارد قابل ویرایش است.</p>}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">متن نهایی مصوبه و شرح اقدام اجرایی *</label>
                  <textarea
                    rows={2}
                    value={executionDescription}
                    onChange={(e) => setExecutionDescription(e.target.value)}
                    placeholder="شرح تکالیف محوله به واحد مجری..."
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
                  />
                  <AiTextAssist value={executionDescription} onChange={setExecutionDescription} purpose="resolution" actorId={currentUser.id} />
                </div>

                {/* Responsible User Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مسئول اصلی پیگیری و اقدام (Assignee)</label>
                  <select
                    value={mainResponsibleUserId}
                    onChange={(e) => setMainResponsibleUserId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-bold text-teal-900"
                  >
                    <option value="">انتخاب مسئول اجرا...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.title})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Responsible Department - Auto-filled & Locked (Requirement 8) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>واحد سازمانی مجری</span>
                    <span className="text-[10px] text-teal-800 font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      تکمیل خودکار بر اساس مسئول
                    </span>
                  </label>
                  <div className="w-full text-xs p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center gap-2 cursor-not-allowed">
                    <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
                    <span className="truncate">{mainResponsibleUserId ? currentResponsibleDept.name : 'پس از انتخاب مسئول تکمیل می‌شود'}</span>
                  </div>
                </div>

                {/* Date Pickers for Assigned Date and Deadline (Requirement 5) */}
                <div>
                  <PersianDatePicker
                    label="تاریخ ابلاغ مصوبه"
                    value={assignedDateJalali}
                    onChange={setAssignedDateJalali}
                  />
                </div>

                <div>
                  <PersianDatePicker
                    label="مهلت اقدام (Deadline)"
                    value={deadlineJalali}
                    onChange={setDeadlineJalali}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سطح اولویت</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="LOW">عادی (Low)</option>
                    <option value="MEDIUM">متوسط (Medium)</option>
                    <option value="HIGH">مهم و دارای اولویت (High)</option>
                    <option value="CRITICAL">بسیار فوری و حیاتی (Critical)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Follow-up plan — a parallel monitoring schedule, set here by the
              office manager. It only decides when the resolution surfaces in
              the «کارتابل پیگیری»; it never gates execution or validation. */}
          {approvalStatus === 'APPROVED' && (
            <div id="rf-followup" className="p-4 bg-sky-50/60 border border-sky-200/80 rounded-2xl space-y-4 scroll-mt-20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-sky-700" />
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900">برنامه پیگیری مصوبه</h4>
                    <p className="text-[10px] text-sky-700">
                      تعیین می‌کند این مصوبه در چه موعدهایی در کارتابل پیگیری نمایش داده شود.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followUpEnabled}
                    onChange={(e) => setFollowUpEnabled(e.target.checked)}
                    className="w-4 h-4 text-sky-700 rounded-md focus:ring-sky-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">پیگیری این مصوبه فعال باشد</span>
                </label>
              </div>

              {followUpEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">نوع پیگیری</label>
                    <select
                      value={followUpType}
                      onChange={(e) => setFollowUpType(e.target.value as ResolutionFollowUpType)}
                      className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                    >
                      <option value="WEEKLY">گزارش هفتگی</option>
                      <option value="MONTHLY">گزارش ماهانه</option>
                      <option value="QUARTERLY">گزارش فصلی</option>
                      <option value="CUSTOM">سفارشی</option>
                    </select>
                  </div>

                  <div>
                    <PersianDatePicker
                      label={followUpType === 'CUSTOM' ? 'تاریخ شروع پیگیری (سفارشی)' : 'تاریخ شروع پیگیری'}
                      value={followUpStartDateJalali}
                      onChange={setFollowUpStartDateJalali}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verification Workflow Config */}
          {approvalStatus === 'APPROVED' && (
            <div id="rf-verify" className="p-4 bg-teal-50/60 border border-teal-200/80 rounded-2xl space-y-4 scroll-mt-20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-700" />
                  <div>
                    <h4 className="text-xs font-extrabold text-teal-950">
                      صحه‌گذاری نهایی (Verification)
                    </h4>
                    <p className="text-[10px] text-teal-700">
                      پس از اتمام کار توسط مجری، مصوبه در کارتابل صحه‌گذار زیر جهت تایید یا رد قرار می‌گیرد.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresVerification}
                    onChange={(e) => setRequiresVerification(e.target.checked)}
                    className="w-4 h-4 text-teal-700 rounded-md focus:ring-teal-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-teal-900">نیاز به صحه‌گذاری دارد</span>
                </label>
              </div>

              {requiresVerification && (
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">صحه‌گذار (تایید کننده نهایی) *</label>
                  <select
                    value={verifierId}
                    onChange={(e) => setVerifierId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-bold text-teal-900"
                  >
                    <option value="">انتخاب صحه‌گذار...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} - {u.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? 'در حال ثبت مصوبه...' : 'تایید نهایی و ابلاغ مصوبه'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
