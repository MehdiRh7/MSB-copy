import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { meetingService } from '../../services/meetingService';
import { proposalService } from '../../services/proposalService';
import { mockDepartments } from '../../mock/data';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { PersianTimePicker } from '../../components/common/PersianTimePicker';
import { FormStepTabs, FormErrorSummary, FormFieldError, focusField } from '../../components/common/FormStepTabs';
import { SearchableUserMultiSelect } from '../../components/common/SearchableUserMultiSelect';
import { AttachmentList } from '../../components/common/AttachmentList';
import { X, Plus, Trash2, Calendar, Clock, MapPin, Users, FileText, UserCheck, Lightbulb, ListChecks, ClipboardCheck, GitBranch } from 'lucide-react';
import { MeetingType, MeetingMember, AgendaItem, Proposal, Attachment, MeetingWorkflowConfig } from '../../types';
import { MeetingWorkflowEditor } from '../../components/workflow/WorkflowEditors';
import { describePolicy, getTemplateForMeetingType, getWorkflowTemplates, namesOf, SIGNATURE_MODE_LABELS, workflowFromTemplate } from '../../services/workflowPolicyService';
import { describeAssignment, getStageAssignment } from '../../services/signatureWorkflowSettingsService';
// منطق زمان‌بندی/همپوشانی بندها فقط در همین یک ماژول است (بدون کپی موازی).
import { getMinutesDiff, validateAgendaTimeSlot, formatAgendaTimeRange, timeToMinutes } from '../../utils/agendaTime';
import { AiButton, AiSourceBadge, useAiFeature } from '../../components/ai/AiKit';
import { planAgenda, AgendaPlan } from '../../services/ai/aiService';
import type { AiResult } from '../../services/ai/aiClient';
import { getCurrentJalaliDate } from '../../utils/date';

export const CreateMeetingModal: React.FC = () => {
  const {
    isCreateMeetingOpen,
    setIsCreateMeetingOpen,
    createMeetingInitialDate,
    availableUsers,
    currentUser,
    showToast,
    triggerRefresh,
    hasPermission
  } = useApp();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<MeetingType>('COMMISSION');
  const [dateJalali, setDateJalali] = useState(createMeetingInitialDate || getCurrentJalaliDate());
  const [startTime, setStartTime] = useState('۰۹:۰۰');
  const [endTime, setEndTime] = useState('۱۱:۳۰');
  const [location, setLocation] = useState('');
  const [departmentId, setDepartmentId] = useState('dept-1');
  const [organizerId, setOrganizerId] = useState('');
  const [secretaryId, setSecretaryId] = useState('');
  const [description, setDescription] = useState('');
  // گردش کار پویای همین جلسه — از قالب متناسب با نوع جلسه شروع می‌شود و
  // برای همین یک جلسه قابل تغییر است.
  const [workflow, setWorkflow] = useState<MeetingWorkflowConfig>(() => workflowFromTemplate(getTemplateForMeetingType('COMMISSION')));
  const [workflowTouched, setWorkflowTouched] = useState(false);
  // ——— برنامه‌ریز هوشمند دستورکار ———
  const aiPlanner = useAiFeature('meetingPlanner');
  const [planning, setPlanning] = useState(false);
  const [planResult, setPlanResult] = useState<AiResult<AgendaPlan> | null>(null);
  // پیوست‌های خودِ جلسه (متعلق به توضیحات کلی) — جدا از پیوست بندهای
  // دستور جلسه که روی همان AgendaItem می‌نشینند.
  const [meetingAttachments, setMeetingAttachments] = useState<Attachment[]>([]);

  // هر بار بازشدن فرم، یک جلسه تازه می‌سازیم؛ حفظ داده فقط میان مراحل همین
  // فرم است و تا وقتی سرویس پیش‌نویس واقعی نداریم، پس از بستن بازیابی نمی‌شود.
  useEffect(() => {
    if (isCreateMeetingOpen) {
      setDateJalali(createMeetingInitialDate || getCurrentJalaliDate());
      setTitle('');
      setLocation('');
      setOrganizerId('');
      setSecretaryId('');
      setDescription('');
      setSelectedMemberIds([]);
      setAgendas([]);
      setNewAgendaTitle('');
      setNewAgendaPresenterId('');
      setNewAgendaRelatedUserIds([]);
      setConsumedProposalIds([]);
      setSelectedProposalId('');
      setProposalRelatedUserIds([]);
      setProposalPresenterId('');
      setMeetingAttachments([]);
      setNewAgendaAttachments([]);
      setProposalAgendaAttachments([]);
      setAgendaError(null);
      setActiveStep(0);
      setShowErrors(false);
      setWorkflow(workflowFromTemplate(getTemplateForMeetingType(type)));
      setWorkflowTouched(false);
    }
  }, [isCreateMeetingOpen, createMeetingInitialDate]);

  // تغییر نوع جلسه، قالب متناسب را پیشنهاد می‌دهد — مگر کاربر دستی تغییر داده باشد.
  useEffect(() => {
    if (!workflowTouched) setWorkflow(workflowFromTemplate(getTemplateForMeetingType(type)));
  }, [type]);

  // Proposed resolutions confirmed for a meeting ("تایید جلسه"), ready to be picked as a ready-made agenda item
  const [confirmedProposals, setConfirmedProposals] = useState<Proposal[]>([]);
  const [consumedProposalIds, setConsumedProposalIds] = useState<string[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [proposalStartTime, setProposalStartTime] = useState('09:00');
  const [proposalEndTime, setProposalEndTime] = useState('09:30');
  const [proposalRelatedUserIds, setProposalRelatedUserIds] = useState<string[]>([]);
  // ارائه‌دهندهٔ بندِ ساخته‌شده از پیشنهاد، یکی از افراد مرتبط است. با انتخاب
  // پیشنهاد، پیشنهاددهنده/ارائه‌دهندهٔ تأییدشده به‌صورت پیش‌فرض انتخاب می‌شود.
  const [proposalPresenterId, setProposalPresenterId] = useState('');
  // Files attached to this specific agenda item — kept separate per add-flow
  // (confirmed-proposal vs brand-new) and moved onto the AgendaItem itself
  // once added, never onto the meeting's own top-level attachments.
  const [proposalAgendaAttachments, setProposalAgendaAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (isCreateMeetingOpen) {
      proposalService.getProposals({ status: 'CONFIRMED_FOR_MEETING', pageSize: 200 }).then((res) => {
        if (res.isSuccess) setConfirmedProposals(res.data.items);
      });
    }
  }, [isCreateMeetingOpen]);

  // Agenda items
  const [agendas, setAgendas] = useState<AgendaItem[]>([]);

  const [newAgendaTitle, setNewAgendaTitle] = useState('');
  const [newAgendaPresenterId, setNewAgendaPresenterId] = useState('');
  const [newAgendaRelatedUserIds, setNewAgendaRelatedUserIds] = useState<string[]>([]);
  const [newAgendaStartTime, setNewAgendaStartTime] = useState('09:00');
  const [newAgendaEndTime, setNewAgendaEndTime] = useState('09:30');
  const [newAgendaAttachments, setNewAgendaAttachments] = useState<Attachment[]>([]);

  // Selected members
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Shown as a banner inside the modal itself (not the global toast), since
  // the toast renders behind this modal's own backdrop/z-index and was
  // never actually visible to the user when this validation failed.
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  // خطاها پس از اولین تلاش برای ثبت یا ورود به «بازبینی» روی تب‌ها نشان داده می‌شوند.
  const [showErrors, setShowErrors] = useState(false);

  if (!isCreateMeetingOpen) return null;

  const handleAddAgenda = () => {
    if (!newAgendaTitle.trim()) {
      setAgendaError('لطفاً عنوان دستور جلسه را وارد کنید');
      return;
    }

    const timeError = validateAgendaTimeSlot(newAgendaStartTime, newAgendaEndTime, startTime, endTime, agendas);
    if (timeError) {
      setAgendaError(timeError);
      return;
    }
    setAgendaError(null);

    const selectedPresenter = availableUsers.find((u) => u.id === newAgendaPresenterId);
    const presenterName = selectedPresenter ? selectedPresenter.fullName : 'دبیر جلسه';
    const minutes = getMinutesDiff(newAgendaStartTime, newAgendaEndTime);

    const newAg: AgendaItem = {
      id: `ag-${Date.now()}`,
      order: agendas.length + 1,
      rowNumber: agendas.length + 1,
      title: newAgendaTitle.trim(),
      presenter: presenterName,
      presenterName: presenterName,
      startTime: newAgendaStartTime,
      endTime: newAgendaEndTime,
      estimatedMinutes: minutes,
      allocatedMinutes: minutes,
      isDiscussed: false,
      status: 'PENDING',
      relatedUsers: availableUsers
        .filter((user) => Array.from(new Set([...newAgendaRelatedUserIds, newAgendaPresenterId])).includes(user.id))
        .map((user) => ({ userId: user.id, fullName: user.fullName, phone: user.phone })),
      attachments: newAgendaAttachments,
    };
    setAgendas([...agendas, newAg]);
    setNewAgendaTitle('');
    setNewAgendaPresenterId('');
    setNewAgendaRelatedUserIds([]);
    setNewAgendaStartTime('09:00');
    setNewAgendaEndTime('09:30');
    setNewAgendaAttachments([]);
  };

  const handleAddFromProposal = () => {
    const proposal = confirmedProposals.find((p) => p.id === selectedProposalId);
    if (!proposal) return;

    const timeError = validateAgendaTimeSlot(proposalStartTime, proposalEndTime, startTime, endTime, agendas);
    if (timeError) {
      setAgendaError(timeError);
      return;
    }
    setAgendaError(null);

    const minutes = getMinutesDiff(proposalStartTime, proposalEndTime);
    const selectedPresenter = availableUsers.find((user) => user.id === proposalPresenterId);
    const presenterName = selectedPresenter?.fullName || proposal.confirmedPresenterName || proposal.proposerName;
    const relatedUsers = availableUsers
      .filter((user) => Array.from(new Set([...proposalRelatedUserIds, proposalPresenterId])).includes(user.id))
      .map((user) => ({ userId: user.id, fullName: user.fullName, phone: user.phone }));

    const newAg: AgendaItem = {
      id: `ag-${Date.now()}`,
      order: agendas.length + 1,
      rowNumber: agendas.length + 1,
      title: proposal.title,
      presenter: presenterName,
      presenterName: presenterName,
      description: proposal.description,
      startTime: proposalStartTime,
      endTime: proposalEndTime,
      estimatedMinutes: minutes,
      allocatedMinutes: minutes,
      isDiscussed: false,
      status: 'PENDING',
      sourceProposalId: proposal.id,
      relatedUsers,
      attachments: proposalAgendaAttachments,
    };
    setAgendas([...agendas, newAg]);
    setConfirmedProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    setConsumedProposalIds((prev) => [...prev, proposal.id]);
    setSelectedProposalId('');
    setProposalStartTime('09:00');
    setProposalEndTime('09:30');
    setProposalRelatedUserIds([]);
    setProposalPresenterId('');
    setProposalAgendaAttachments([]);
  };

  /** ترتیب و زمان‌بندی پیشنهادی هوش مصنوعی را روی بندها اعمال می‌کند (داخل پنجره زمانی جلسه، بدون همپوشانی). */
  const handleSmartPlan = async () => {
    if (agendas.length === 0) return;
    setPlanning(true);
    try {
      const res = await planAgenda({ meetingTitle: title || 'جلسه', startTime, endTime, agendas }, currentUser.id);
      const fmt = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      const meetingStart = timeToMinutes(startTime);
      const meetingEnd = timeToMinutes(endTime);
      const available = Math.max(5 * res.data.order.length, meetingEnd - meetingStart);
      const requested = res.data.order.reduce((sum, item) => sum + item.minutes, 0);
      const scale = requested > available ? available / requested : 1;
      let cursor = meetingStart;
      const byId = new Map(agendas.map((agenda) => [agenda.id, agenda]));
      const next = res.data.order.map((item, index) => {
        const minutes = Math.max(5, Math.floor((item.minutes * scale) / 5) * 5);
        const slotStart = cursor;
        cursor = Math.min(meetingEnd, cursor + minutes);
        return { ...(byId.get(item.id) as AgendaItem), order: index + 1, rowNumber: index + 1, startTime: fmt(slotStart), endTime: fmt(cursor), allocatedMinutes: cursor - slotStart, estimatedMinutes: cursor - slotStart };
      });
      setAgendas(next);
      setPlanResult(res);
      setAgendaError(null);
    } finally { setPlanning(false); }
  };

  const handleRemoveAgenda = (id: string) => {
    setAgendas(agendas.filter((a) => a.id !== id).map((a, idx) => ({ ...a, rowNumber: idx + 1, order: idx + 1 })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('CREATE_MEETING')) {
      showToast('دسترسی غیرمجاز', 'شما مجاز به ایجاد جلسه جدید نیستید.', 'error');
      return;
    }
    if (fieldErrors.length > 0) {
      setShowErrors(true);
      jumpToError(fieldErrors[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      const participantIds = Array.from(new Set([...selectedMemberIds, organizerId, secretaryId]));
      const members: MeetingMember[] = participantIds.map((uId) => {
        const u = availableUsers.find((user) => user.id === uId) || availableUsers[0];
        return {
          userId: u.id,
          fullName: u.fullName,
          roleTitle: u.title,
          departmentName: u.departmentName,
          attendanceType: u.id === organizerId ? 'ORGANIZER' : u.id === secretaryId ? 'SECRETARY' : 'MEMBER',
          presenceStatus: 'PRESENT',
        };
      });

      const res = await meetingService.createMeeting({
        title: title.trim(),
        type,
        dateJalali,
        startTime,
        endTime,
        location,
        organizerId,
        secretaryId,
        createdByUserId: currentUser.id,
        createdByName: currentUser.fullName,
        departmentId,
        description,
        members,
        agendaItems: agendas,
        attachments: meetingAttachments,
        workflow,
      });

      if (res.isSuccess) {
        await Promise.all(
          consumedProposalIds.map((proposalId) => {
            const agenda = agendas.find((item) => item.sourceProposalId === proposalId);
            return proposalService.markConvertedToAgenda(proposalId, res.data.id, res.data.title, agenda?.relatedUsers || []);
          })
        );
        showToast('ثبت موفق', `جلسه "${res.data.title}" با شماره ${res.data.meetingNumber} ایجاد گردید.`, 'success');
        triggerRefresh();
        setIsCreateMeetingOpen(false);
      }
    } catch (err) {
      showToast('خطا', 'ثبت جلسه با خطا مواجه شد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldErrors: FormFieldError[] = [
    ...(!title.trim() ? [{ step: 0, fieldId: 'mf-title', message: 'عنوان جلسه را وارد کنید.' }] : []),
    ...(!dateJalali ? [{ step: 0, fieldId: 'mf-date', message: 'تاریخ جلسه را مشخص کنید.' }] : []),
    ...(startTime >= endTime ? [{ step: 0, fieldId: 'mf-time', message: 'ساعت پایان باید بعد از ساعت شروع باشد.' }] : []),
    ...(!location.trim() ? [{ step: 0, fieldId: 'mf-location', message: 'مکان یا شیوه برگزاری جلسه را وارد کنید.' }] : []),
    ...(!organizerId ? [{ step: 1, fieldId: 'mf-organizer', message: 'برگزارکننده جلسه را انتخاب کنید.' }] : []),
    ...(!secretaryId ? [{ step: 1, fieldId: 'mf-secretary', message: 'دبیر جلسه را انتخاب کنید.' }] : []),
    ...(workflow.agendaApproval.approverUserIds.length === 0 ? [{ step: 3, fieldId: 'mf-workflow', message: 'حداقل یک تأییدکننده دستورکار انتخاب کنید.' }] : []),
    ...(workflow.minutesApproval && workflow.minutesApproval.approverUserIds.length === 0 ? [{ step: 3, fieldId: 'mf-workflow', message: 'تأییدکنندگان صورت‌جلسه را انتخاب کنید یا گزینه را غیرفعال کنید.' }] : []),
    ...(workflow.resolutionSignature && workflow.resolutionSignature.signerUserIds.length === 0 ? [{ step: 3, fieldId: 'mf-workflow', message: 'امضاکنندگان اختصاصی مصوبات را انتخاب کنید یا تنظیمات سراسری را برگزینید.' }] : []),
  ];
  const errorOf = (fieldId: string) => (showErrors ? fieldErrors.find((e) => e.fieldId === fieldId)?.message : undefined);
  const steps = [
    { label: 'مشخصات و زمان', icon: Calendar, errorCount: fieldErrors.filter((e) => e.step === 0).length, complete: !fieldErrors.some((e) => e.step === 0) },
    { label: 'اعضا و مدعوین', icon: Users, errorCount: fieldErrors.filter((e) => e.step === 1).length, complete: !fieldErrors.some((e) => e.step === 1) && selectedMemberIds.length > 0 },
    { label: 'دستور جلسه', icon: ListChecks, errorCount: 0, complete: agendas.length > 0 },
    { label: 'گردش کار', icon: GitBranch, errorCount: fieldErrors.filter((e) => e.step === 3).length, complete: !fieldErrors.some((e) => e.step === 3) },
    { label: 'بازبینی و ثبت', icon: ClipboardCheck, errorCount: 0 },
  ];
  // جابه‌جایی بین تب‌ها هرگز قفل نمی‌شود و داده‌ها در state فرم می‌مانند.
  const goToStep = (nextStep: number) => {
    if (nextStep === 4) setShowErrors(true);
    setActiveStep(nextStep);
  };
  const jumpToError = (error: FormFieldError) => { setActiveStep(error.step); focusField(error.fieldId); };
  const fieldErrorText = (fieldId: string) => {
    const message = errorOf(fieldId);
    return message ? <p className="form-field-error">{message}</p> : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-300">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">برنامه‌ریزی و ایجاد جلسه جدید</h3>
              <p className="text-[11px] text-teal-200">ثبت اطلاعات زمان‌بندی، اعضا، مدعوین و دستور جلسات</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateMeetingOpen(false)}
            className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form noValidate onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1">
          <FormStepTabs steps={steps} active={activeStep} onSelect={goToStep} showErrors={showErrors} ariaLabel="بخش‌های فرم جلسه" />
          {activeStep === 4 && showErrors && <FormErrorSummary errors={fieldErrors} steps={steps} onJump={jumpToError} />}
          {/* Basic Info */}
          {activeStep === 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-2 h-2 rounded-full bg-teal-600"></span>
              اطلاعات پایه جلسه
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  عنوان جلسه <span className="text-rose-500">*</span>
                </label>
                <input
                  id="mf-title"
                  type="text"
                  aria-invalid={Boolean(errorOf('mf-title'))}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: جلسه بررسی استراتژی مهاجرت به سرویس‌های ابری و امنیت داده‌ها"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
                {fieldErrorText('mf-title')}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع جلسه</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as MeetingType)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
                >
                  <option value="BOARD">جلسه هیئت مدیره</option>
                  <option value="EXECUTIVE">جلسه هیئت عامل / اجرایی</option>
                  <option value="COMMISSION">جلسه کمیسیون تخصصی</option>
                  <option value="DEPARTMENTAL">جلسه داخلی واحد</option>
                  <option value="COORDINATION">جلسه هماهنگی بین‌بخشی</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">واحد برگزارکننده</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
                >
                  {mockDepartments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Jalali Date Picker */}
              <div id="mf-date">
                <PersianDatePicker
                  label="تاریخ برگزاری جلسه"
                  value={dateJalali}
                  onChange={setDateJalali}
                />
              </div>

              {/* Start & End Time Pickers */}
              <div id="mf-time" className="grid grid-cols-2 gap-2">
                <div>
                  <PersianTimePicker
                    label="ساعت شروع"
                    value={startTime}
                    onChange={setStartTime}
                  />
                </div>
                <div>
                  <PersianTimePicker
                    label="ساعت پایان"
                    value={endTime}
                    onChange={setEndTime}
                  />
                </div>
              </div>
              {fieldErrorText('mf-time') && <div className="md:col-span-2 -mt-2">{fieldErrorText('mf-time')}</div>}

              {/* Location (مکان جلسه) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">مکان جلسه</label>
                <div className="relative">
                  <input
                    id="mf-location"
                    type="text"
                    aria-invalid={Boolean(errorOf('mf-location'))}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: سالن جلسات شماره ۱ یا لینک وب‌کنفرانس سازمانی"
                    className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                  <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
                </div>
                {fieldErrorText('mf-location')}
              </div>
            </div>
          </div>
          )}

          {/* Members & Invitees Multi-select with Search and Chips */}
          {activeStep === 1 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                اعضا و مدعوین جلسه ({selectedMemberIds.length} نفر انتخاب شده)
              </span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">برگزارکننده جلسه *</label>
                <select id="mf-organizer" aria-invalid={Boolean(errorOf('mf-organizer'))} value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <option value="">انتخاب برگزارکننده...</option>
                  {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} ({user.title})</option>)}
                </select>
                {fieldErrorText('mf-organizer')}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">دبیر جلسه *</label>
                <select id="mf-secretary" aria-invalid={Boolean(errorOf('mf-secretary'))} value={secretaryId} onChange={(e) => setSecretaryId(e.target.value)} required className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <option value="">انتخاب دبیر جلسه...</option>
                  {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} ({user.title})</option>)}
                </select>
                {fieldErrorText('mf-secretary')}
              </div>
            </div>

            <SearchableUserMultiSelect users={availableUsers} selectedIds={selectedMemberIds} onChange={setSelectedMemberIds} label="اعضا و مدعوین" maxHeightClassName="max-h-48" />
          </div>
          )}

          {/* Agenda Items */}
          {activeStep === 2 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="w-2 h-2 rounded-full bg-teal-600"></span>
              دستور کار جلسه (Agendas)
            </h4>

            {aiPlanner && agendas.length > 0 && (
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-indigo-950">✨ برنامه‌ریز هوشمند: ترتیب و زمان هر بند را بر اساس اهمیت و مدت جلسه پیشنهاد می‌دهد</span>
                  <div className="flex items-center gap-2"><AiSourceBadge result={planResult} /><AiButton onClick={handleSmartPlan} loading={planning}>زمان‌بندی هوشمند</AiButton></div>
                </div>
                {planResult && (
                  <ul className="text-[10.5px] text-slate-600 space-y-0.5">
                    {planResult.data.order.filter((o) => o.reason).map((o) => <li key={o.id}>• <b>{agendas.find((a) => a.id === o.id)?.title}</b>: {o.reason}</li>)}
                    {planResult.data.tips.map((tip) => <li key={tip} className="text-indigo-700">💡 {tip}</li>)}
                  </ul>
                )}
              </div>
            )}

            {agendaError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl flex items-start justify-between gap-2.5">
                <p className="text-xs font-bold text-rose-700 leading-relaxed">{agendaError}</p>
                <button
                  type="button"
                  onClick={() => setAgendaError(null)}
                  className="text-rose-400 hover:text-rose-600 shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Add agenda item from a confirmed proposed resolution ("تایید جلسه") */}
            {confirmedProposals.length > 0 && (
              <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-2.5">
                <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-blue-700" />
                  <span>افزودن از تایید جلسات (مصوبات پیشنهادی تأییدشده):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-6">
                    <select
                      value={selectedProposalId}
                      onChange={(e) => {
                        const proposalId = e.target.value;
                        const proposal = confirmedProposals.find((item) => item.id === proposalId);
                        const defaultPresenterId = proposal?.confirmedPresenterId || proposal?.presenterUserId || proposal?.proposerUserId || '';
                        setSelectedProposalId(proposalId);
                        // فرد مرتبط با خودِ پیشنهاد، هم عضو مرتبط و هم
                        // ارائه‌دهندهٔ پیش‌فرض است؛ دبیر می‌تواند آن را تغییر دهد.
                        setProposalRelatedUserIds(defaultPresenterId ? [defaultPresenterId] : []);
                        setProposalPresenterId(defaultPresenterId);
                        setProposalAgendaAttachments([]);
                      }}
                      className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                    >
                      <option value="">انتخاب تایید جلسه...</option>
                      {confirmedProposals.map((p) => (
                        <option key={p.id} value={p.id}>{p.title} — {p.confirmedPresenterName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-4 grid grid-cols-2 gap-1.5">
                    <PersianTimePicker label="از ساعت" value={proposalStartTime} onChange={setProposalStartTime} />
                    <PersianTimePicker label="تا ساعت" value={proposalEndTime} onChange={setProposalEndTime} />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddFromProposal}
                      disabled={!selectedProposalId}
                      className="w-full px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>افزودن</span>
                    </button>
                  </div>
                </div>
                {selectedProposalId && (
                  <div className="p-3 bg-white/80 border border-blue-100 rounded-xl space-y-3">
                    <SearchableUserMultiSelect
                      users={availableUsers}
                      selectedIds={proposalRelatedUserIds}
                      onChange={setProposalRelatedUserIds}
                      label="افراد مرتبط با این موضوع"
                    />
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">ارائه‌دهندهٔ پیش‌فرض این موضوع</label>
                      <select
                        value={proposalPresenterId}
                        onChange={(e) => setProposalPresenterId(e.target.value)}
                        className="w-full text-xs p-2.5 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                      >
                        <option value="">انتخاب ارائه‌دهنده...</option>
                        {availableUsers.filter((user) => proposalRelatedUserIds.includes(user.id) || user.id === proposalPresenterId).map((user) => (
                          <option key={user.id} value={user.id}>{user.fullName} ({user.title})</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] text-slate-500">پیشنهاددهنده یا ارائه‌دهندهٔ تأییدشده به‌صورت خودکار انتخاب شده است؛ با افزودن فرد دیگر در فهرست بالا، او هم قابل انتخاب می‌شود.</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">پیوست‌های این دستور کار</label>
                      <AttachmentList
                        attachments={proposalAgendaAttachments}
                        canUpload
                        onAddFiles={(files) => setProposalAgendaAttachments((prev) => [...prev, ...files])}
                        onDelete={(id) => setProposalAgendaAttachments((prev) => prev.filter((a) => a.id !== id))}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add new agenda row (FIRST) */}
            <div className="p-3.5 bg-teal-50/60 border border-teal-200/80 rounded-2xl space-y-3">
              <div className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-teal-700" />
                <span>افزودن بند دستور جلسه جدید:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">عنوان موضوع دستور جلسه</label>
                  <input
                    type="text"
                    placeholder="مثال: بررسی طرح توسعه شبکه و امنیت زیرساخت"
                    value={newAgendaTitle}
                    onChange={(e) => setNewAgendaTitle(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ارائه‌دهندهٔ پیش‌فرض</label>
                  <select
                    value={newAgendaPresenterId}
                    onChange={(e) => {
                      const presenterId = e.target.value;
                      setNewAgendaPresenterId(presenterId);
                      // ارائه‌دهنده همیشه یکی از افراد مرتبط همان موضوع است.
                      setNewAgendaRelatedUserIds((currentIds) => presenterId && !currentIds.includes(presenterId)
                        ? [...currentIds, presenterId]
                        : currentIds);
                    }}
                    className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
                  >
                    <option value="">انتخاب ارائه‌دهنده از فهرست کاربران...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.title})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3 grid grid-cols-2 gap-1.5">
                  <PersianTimePicker label="از ساعت" value={newAgendaStartTime} onChange={setNewAgendaStartTime} />
                  <PersianTimePicker label="تا ساعت" value={newAgendaEndTime} onChange={setNewAgendaEndTime} />
                </div>
              </div>

              <div className="p-3 bg-white/80 border border-teal-100 rounded-xl">
                <SearchableUserMultiSelect
                  users={availableUsers}
                  selectedIds={newAgendaRelatedUserIds}
                  onChange={(ids) => {
                    setNewAgendaRelatedUserIds(ids);
                    // اولین فرد مرتبط، بدون نیاز به انتخاب دوباره، ارائه‌دهندهٔ
                    // پیش‌فرض می‌شود. کاربر همچنان می‌تواند او را تغییر دهد.
                    setNewAgendaPresenterId((currentId) => ids.includes(currentId) ? currentId : (ids[0] || ''));
                  }}
                  label="افراد مرتبط با این موضوع"
                />
                <p className="mt-2 text-[10px] text-slate-500">اولین فرد انتخاب‌شده به‌صورت پیش‌فرض ارائه‌دهنده است؛ افراد بیشتری را می‌توانید اضافه کنید و سپس ارائه‌دهنده را از همین فهرست تغییر دهید.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">پیوست‌های این دستور کار</label>
                <AttachmentList
                  attachments={newAgendaAttachments}
                  canUpload
                  onAddFiles={(files) => setNewAgendaAttachments((prev) => [...prev, ...files])}
                  onDelete={(id) => setNewAgendaAttachments((prev) => prev.filter((a) => a.id !== id))}
                />
              </div>

              <button
                type="button"
                onClick={handleAddAgenda}
                className="w-full py-2 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن بند به دستور کار جلسه</span>
              </button>
            </div>

            {/* List of Agendas (SECOND) */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-600">فهرست بندهای ثبت‌شده ({agendas.length} بند):</div>
              {agendas.map((ag) => (
                <div
                  key={ag.id}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs hover:border-teal-300 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-teal-800 text-white font-bold flex items-center justify-center text-xs shrink-0">
                      {ag.rowNumber}
                    </span>
                    <div>
                      <div className="font-bold text-slate-800">{ag.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ارائه‌دهنده: <strong className="text-teal-900">{ag.presenterName || ag.presenter}</strong> ({formatAgendaTimeRange(ag)})
                      </div>
                      {ag.relatedUsers && ag.relatedUsers.length > 0 && (
                        <div className="text-[10px] text-blue-700 mt-1">افراد مرتبط: {ag.relatedUsers.map((user) => user.fullName).join('، ')}</div>
                      )}
                      {ag.attachments && ag.attachments.length > 0 && (
                        <div className="text-[10px] text-teal-700 mt-1">پیوست‌ها ({ag.attachments.length}): {ag.attachments.map((a) => a.fileName).join('، ')}</div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAgenda(ag.id)}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                    title="حذف بند دستور جلسه"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          )}

          {activeStep === 3 && (
            <div id="mf-workflow" tabIndex={-1} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-gradient-to-l from-indigo-50 to-white border border-indigo-100 p-3">
                <div>
                  <h4 className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5"><GitBranch className="w-4 h-4" />گردش کار اختصاصی این جلسه</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">قالب پیشنهادی بر اساس نوع جلسه انتخاب شده؛ برای همین جلسه هر بخش را آزادانه تغییر دهید.</p>
                </div>
                <select
                  aria-label="قالب گردش کار"
                  value={workflow.templateId || ''}
                  onChange={(event) => {
                    const template = getWorkflowTemplates().find((item) => item.id === event.target.value);
                    if (template) { setWorkflow(workflowFromTemplate(template)); setWorkflowTouched(true); }
                  }}
                  className="text-[11px] p-2 bg-white border border-indigo-200 rounded-xl font-bold text-indigo-900"
                >
                  {getWorkflowTemplates().map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </div>
              <MeetingWorkflowEditor
                users={availableUsers}
                value={workflow}
                onChange={(next) => { setWorkflow(next); setWorkflowTouched(true); }}
                defaultSignatureDescription={`سه امضای ترتیبی سراسری: ${['RESOLUTION_STEP_1', 'RESOLUTION_STEP_2', 'RESOLUTION_STEP_3'].map((stage) => describeAssignment(getStageAssignment(stage as 'RESOLUTION_STEP_1'), availableUsers)).join(' ← ')}`}
                defaultNoticeDescription={`طبق تنظیم سراسری (${describeAssignment(getStageAssignment('RESOLUTION_NOTICE'), availableUsers)})`}
              />
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-extrabold text-slate-900">بازبینی پیش از ثبت</h4>
              <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 sm:grid-cols-2">
                <div><span className="font-bold text-slate-800">جلسه:</span> {title}</div><div><span className="font-bold text-slate-800">زمان:</span> {dateJalali}، {startTime} تا {endTime}</div>
                <div><span className="font-bold text-slate-800">مکان:</span> {location}</div><div><span className="font-bold text-slate-800">برگزارکننده:</span> {availableUsers.find((u) => u.id === organizerId)?.fullName || '—'}</div>
                <div><span className="font-bold text-slate-800">دبیر:</span> {availableUsers.find((u) => u.id === secretaryId)?.fullName || '—'}</div><div><span className="font-bold text-slate-800">اعضا:</span> {selectedMemberIds.length} نفر</div>
              </div>
              <div className="rounded-xl bg-white p-3 text-xs text-slate-600"><span className="font-bold text-slate-800">دستور جلسه ({agendas.length} بند): </span>{agendas.length ? agendas.map((agenda) => agenda.title).join('، ') : 'هنوز بندی ثبت نشده است.'}</div>
              <div className="rounded-xl bg-white p-3 text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1"><GitBranch className="w-3.5 h-3.5" />گردش کار{workflow.templateName ? ` (${workflow.templateName})` : ''}</div>
                <div>تأیید دستورکار: {describePolicy(workflow.agendaApproval)}</div>
                <div>تأیید صورت‌جلسه: {describePolicy(workflow.minutesApproval)}</div>
                <div>امضای مصوبات: {workflow.resolutionSignature ? `${SIGNATURE_MODE_LABELS[workflow.resolutionSignature.mode]} — ${namesOf(workflow.resolutionSignature.signerUserIds).join(' ← ')}` : 'تنظیمات سراسری'}</div>
                <div>امضای ابلاغیه: {workflow.noticeSignerUserId ? namesOf([workflow.noticeSignerUserId])[0] : 'تنظیم سراسری'}</div>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">پیش‌نویس این فرم در این نسخه ذخیره نمی‌شود؛ با بستن پنجره اطلاعات واردشده از بین می‌رود.</p>
            </div>
          )}

          {/* Description */}
          {activeStep === 2 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات و یادداشت تکمیلی جلسه</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="نکات قابل توجه پیش از شروع جلسه..."
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">پیوست‌های توضیحات جلسه</label>
              <p className="text-[10px] text-slate-400 mb-2">
                این فایل‌ها به خودِ جلسه پیوست می‌شوند، نه به یک بند دستور جلسه. می‌توانید چند فایل را
                همزمان یا در چند مرحله اضافه کنید؛ فایل جدید جایگزین فایل‌های قبلی نمی‌شود.
              </p>
              <AttachmentList
                attachments={meetingAttachments}
                canUpload
                onAddFiles={(files) => setMeetingAttachments((prev) => [...prev, ...files])}
                onDelete={(id) => setMeetingAttachments((prev) => prev.filter((a) => a.id !== id))}
              />
            </div>
          </div>
          )}

          {/* Footer Submit buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => activeStep > 0 ? goToStep(activeStep - 1) : setIsCreateMeetingOpen(false)}
              className="app-btn-secondary"
            >
              {activeStep > 0 ? 'مرحله قبل' : 'انصراف'}
            </button>
            {activeStep < 4 ? <button type="button" onClick={(event) => { event.preventDefault(); goToStep(activeStep + 1); }} className="app-btn-primary">مرحله بعد</button> : <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="app-btn-primary">{isSubmitting ? 'در حال ثبت جلسه...' : 'تایید و ایجاد جلسه'}</button>}
          </div>
        </form>
      </div>
    </div>
  );
};
