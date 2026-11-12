import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { resolutionService } from '../../services/resolutionService';
import { meetingService } from '../../services/meetingService';
import { boardSecretariatService } from '../../services/boardSecretariatService';
import { Resolution, ActivityLog, Meeting, ResolutionNotice, Attachment } from '../../types';
import { 
  X, 
  FileCheck2, 
  Calendar, 
  User, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Send, 
  ShieldCheck, 
  FileText, 
  ArrowLeft,
  Paperclip,
  Check,
  RotateCcw,
  PenTool,
  FileDown
} from 'lucide-react';
import { 
  toPersianDigits, 
  getResolutionApprovalMeta, 
  getResolutionExecutionMeta, 
  getPriorityMeta,
  getVerificationStepStatusMeta,
  formatFileSize
} from '../../utils/formatters';
import { TimelineView } from '../../components/common/TimelineView';
import { ResolutionProgressTracker } from './ResolutionProgressTracker';
import { AttachmentList } from '../../components/common/AttachmentList';
import { NotifyResolutionAction } from './NotifyResolutionAction';
import { FollowUpHistory } from './FollowUpHistory';
import { nextDueDate } from '../../services/followUpService';
import { buildResolutionDocument, buildResolutionNotificationDocument, openGeneratedDocument } from '../../services/documentService';
import { SAMPLE_SIGNATURE_DATA_URL } from '../../utils/signatureImage';
import { ArchiveResolutionAction } from './ArchiveResolutionAction';
import { RecordFollowUpForm } from './RecordFollowUpForm';
import { buildAttachmentFromFile } from '../../utils/attachmentFile';
import { SignNotificationLetterAction } from './SignNotificationLetterAction';
import { resolveSigningAuthority } from '../../services/signatureDelegationService';
import { ResolutionAiInsight } from './ResolutionAiInsight';
import { SignatureVerifier } from './SignatureVerifier';

interface ResolutionDetailModalProps {
  resolutionId: string | null;
  onClose: () => void;
}

export const ResolutionDetailModal: React.FC<ResolutionDetailModalProps> = ({
  resolutionId,
  onClose,
}) => {
  const { currentUser, availableUsers, showToast, triggerRefresh, refreshTrigger, hasPermission } = useApp();

  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [notices, setNotices] = useState<ResolutionNotice[]>([]);
  // Bumped after a follow-up is recorded so the history below reloads.
  const [followUpKey, setFollowUpKey] = useState(0);

  // Complete task form state
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState<File[]>([]);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);

  // Verification approval/rejection state
  const [approverComments, setApproverComments] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  useEffect(() => {
    if (resolutionId) {
      loadResolutionData();
    }
  }, [resolutionId, refreshTrigger]);

  const loadResolutionData = async () => {
    if (!resolutionId) return;
    setLoading(true);
    try {
      const [resRes, logRes] = await Promise.all([
        resolutionService.getResolutionById(resolutionId),
        resolutionService.getResolutionActivityLogs(resolutionId),
      ]);

      if (resRes.isSuccess && resRes.data) {
        setResolution(resRes.data);
        const [meetingRes, noticeRes] = await Promise.all([meetingService.getMeetingById(resRes.data.meetingId), boardSecretariatService.getNotices(undefined, resRes.data.id)]);
        setMeeting(meetingRes.isSuccess ? meetingRes.data : null);
        setNotices(noticeRes.data);
      }
      if (logRes.isSuccess) {
        setLogs(logRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!resolutionId || !resolution) return null;

  const appMeta = getResolutionApprovalMeta(resolution.approvalStatus);
  const execMeta = getResolutionExecutionMeta(resolution.executionStatus);
  const priorityMeta = getPriorityMeta(resolution.priority);

  // Determine current active verification step
  const vSteps = resolution.verificationConfig?.steps || [];
  const currentStepIdx = resolution.verificationConfig?.currentStepIndex || 0;
  const currentStep = vSteps[currentStepIdx];

  const isAssignee = currentUser.id === resolution.mainResponsibleUserId || currentUser.role === 'ADMIN';
  const isCurrentApprover = Boolean(currentStep) && (currentUser.id === currentStep.approverId || currentUser.role === 'ADMIN');
  const signatureWorkflow = resolution.signatureWorkflow;
  // در زنجیره موازی چند امضا همزمان باز است؛ مرحله‌ای که این کاربر (یا
  // جانشینش) می‌تواند امضا کند اولویت دارد.
  const activeSignature = signatureWorkflow?.steps.find((step) => step.status === 'PENDING' && resolveSigningAuthority(step.signerUserId, currentUser.id).allowed)
    || signatureWorkflow?.steps[signatureWorkflow.currentStepIndex];
  const isParallelChain = signatureWorkflow?.mode === 'PARALLEL';
  const isCustomChain = signatureWorkflow?.source === 'MEETING';
  const pendingSignerNames = signatureWorkflow?.steps.filter((step) => step.status === 'PENDING').map((step) => step.signerName) || [];
  // Being the assigned signer for this step is necessary but no longer
  // sufficient — SIGN_RESOLUTION must also be granted (via سطح دسترسی),
  // so signing can be enabled for any role through the permission screen
  // instead of being hardcoded to a fixed set of roles.
  // امضاکننده تعیین‌شده، یا جانشین فعال او. جانشینی هیچ Permission دیگری
  // را منتقل نمی‌کند: SIGN_RESOLUTION همچنان لازم است و همین قاعده در
  // Service Layer نیز Enforce می‌شود.
  const signingAuthority = activeSignature
    ? resolveSigningAuthority(activeSignature.signerUserId, currentUser.id)
    : { allowed: false, asDelegate: false };
  // در زنجیره اختصاصی جلسه، خودِ انتخاب‌شدن به‌عنوان امضاکننده (توسط
  // سازنده جلسه / مدیر سیستم) همان مجوز امضاست؛ وگرنه کسی که مجوز عمومی
  // SIGN_RESOLUTION ندارد هرگز دکمه امضا را نمی‌دید و گردش متوقف می‌شد.
  const canSign = activeSignature?.status === 'PENDING' && signingAuthority.allowed && (hasPermission('SIGN_RESOLUTION') || isCustomChain);
  const isSigningAsDelegate = canSign && signingAuthority.asDelegate;
  const invitees = Array.from(new Map([
    ...(resolution.mainResponsibleName ? [{
      id: resolution.mainResponsibleUserId || resolution.mainResponsibleName,
      name: resolution.mainResponsibleName,
      title: availableUsers.find((user) => user.id === resolution.mainResponsibleUserId)?.title || 'مسئول اجرای مصوبه',
      department: resolution.responsibleDepartmentName || '',
    }] : []),
    ...resolution.referrals.map((referral) => {
      const user = referral.targetType === 'USER' ? availableUsers.find((item) => item.id === referral.targetId) : undefined;
      return {
        id: `${referral.targetType}-${referral.targetId}`,
        name: referral.targetName,
        title: user?.title || (referral.assignedRole === 'COOPERATOR' ? 'همکار اجرای مصوبه' : 'مدعو'),
        department: user?.departmentName || (referral.targetType === 'DEPARTMENT' ? referral.targetName : ''),
      };
    }),
  ].map((item) => [item.id, item])).values());

  // Official documents render this resolution's real data; documentService
  // enforces the same access rule that governs viewing the resolution itself.
  const openDocument = (build: () => ReturnType<typeof buildResolutionDocument>) => {
    try {
      const generated = build();
      if (!openGeneratedDocument(generated)) {
        showToast('خطا', 'پنجره نمایش سند توسط مرورگر مسدود شد.', 'error');
        return;
      }
      if (!generated.isFinal) showToast('نسخه پیش‌نویس', generated.stateLabel, 'info');
    } catch (error) {
      showToast('دسترسی غیرمجاز', error instanceof Error ? error.message : 'دریافت سند انجام نشد.', 'error');
    }
  };

  const handleResolutionDocument = () => resolution && openDocument(() => buildResolutionDocument(resolution, meeting || undefined, currentUser));
  const handleNotificationDocument = () => resolution && openDocument(() => buildResolutionNotificationDocument(resolution, notices[0], meeting || undefined, currentUser));

  const handleSignResolution = async () => {
    if (!canSign || !window.confirm('آیا از امضای این مصوبه اطمینان دارید؟')) return;
    setIsSigning(true);
    try {
      const result = await resolutionService.signResolution(resolution.id, currentUser.id);
      if (result.isSuccess) {
        showToast('امضای مصوبه', 'امضای دیجیتال شما ثبت و صورت‌جلسه به مرحله بعد ارسال شد.', 'success');
        triggerRefresh();
        await loadResolutionData();
      }
    } catch (error) {
      showToast('خطا در امضا', error instanceof Error ? error.message : 'ثبت امضا انجام نشد.', 'error');
    } finally {
      setIsSigning(false);
    }
  };

  const handleNoticeReceived = async (noticeId: string) => {
    try { await boardSecretariatService.markNoticeReceived(noticeId, currentUser); showToast('دریافت ابلاغیه', 'دریافت ابلاغیه ثبت شد.', 'success'); await loadResolutionData(); }
    catch (error) { showToast('خطا', error instanceof Error ? error.message : 'ثبت دریافت انجام نشد.', 'error'); }
  };

  const handleCompleteTask = async () => {
    if (!completionNotes) {
      showToast('خطا', 'لطفاً شرح گزارش اقدام و نتایج حاصله را وارد کنید.', 'error');
      return;
    }

    setIsSubmittingCompletion(true);
    try {
      const uploadDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/[‎‏]/g, '');
      const attachments: Attachment[] = (await Promise.all(
        completionFiles.map((file) => buildAttachmentFromFile(file, currentUser.fullName, uploadDate))
      )).map((built) => built.attachment);
      const res = await resolutionService.completeResolutionTask(resolution.id, completionNotes, attachments);
      if (res.isSuccess) {
        showToast(
          'ثبت اتمام وظیفه',
          resolution.verificationConfig?.requiresVerification
            ? 'وظیفه تکمیل و پرونده به کارتابل صحه‌گذاری ارجاع شد.'
            : 'وظیفه تکمیل و مصوبه مستقیماً خاتمه یافت.',
          'success'
        );
        setCompletionNotes('');
        setCompletionFiles([]);
        triggerRefresh();
        loadResolutionData();
      }
    } catch (e) {
      showToast('خطا', 'خطا در ثبت اتمام وظیفه', 'error');
    } finally {
      setIsSubmittingCompletion(false);
    }
  };

  const handleApproveStep = async () => {
    if (!currentStep) return;
    setIsSubmittingApproval(true);
    try {
      const res = await resolutionService.approveVerificationStep(
        resolution.id,
        currentStep.stepNumber,
        approverComments || 'تایید شد و مطابق استانداردهای مصوبه است.',
        currentUser.fullName
      );
      if (res.isSuccess) {
        showToast('تایید صحه‌گذاری', `مرحله ${currentStep.stepNumber} صحه‌گذاری با موفقیت تایید شد.`, 'success');
        triggerRefresh();
        loadResolutionData();
      }
    } catch (e) {
      showToast('خطا', 'خطا در تایید صحه‌گذاری', 'error');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleRejectStep = async () => {
    if (!currentStep) return;
    if (!approverComments) {
      showToast('خطا', 'در صورت عدم تایید، ذکر علت بازگشت الزامی است.', 'error');
      return;
    }

    setIsSubmittingApproval(true);
    try {
      const res = await resolutionService.rejectVerificationStep(
        resolution.id,
        currentStep.stepNumber,
        approverComments,
        currentUser.fullName
      );
      if (res.isSuccess) {
        showToast('عدم تایید', `مصوبه به علت "${approverComments}" به مجری بازگردانده شد.`, 'warning');
        triggerRefresh();
        loadResolutionData();
      }
    } catch (e) {
      showToast('خطا', 'خطا در رد صحه‌گذاری', 'error');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="app-modal-header resolution-detail-header text-white flex items-start justify-between">
          <div className="resolution-header-main">
            <div className="resolution-header-icon">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div className="resolution-header-copy">
              <h3>{resolution.topicTitle}</h3>
              <div className="resolution-header-meta">
                <span className="resolution-header-number">
                  {resolution.resolutionNumber}
                </span>
                <span className={`resolution-header-status ${appMeta.bg}`}>
                  {appMeta.label}
                </span>
                <span className={`resolution-header-status ${execMeta.bg}`}>
                  {execMeta.label}
                </span>
              </div>
            </div>
          </div>

          <button onClick={onClose} aria-label="بستن جزئیات مصوبه" className="resolution-header-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          <ResolutionProgressTracker resolution={resolution} />
          <ResolutionAiInsight resolution={resolution} actorId={currentUser.id} />

          {/* Formal resolution minutes and sequential signatures */}
          {signatureWorkflow && (
            <section className="rounded-3xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-300" />
                  <div>
                    <h4 className="font-extrabold text-sm">صورت‌جلسه رسمی مصوبه</h4>
                    <p className="text-[10px] text-slate-300 mt-0.5">سند امضای ترتیبی و ابلاغ جهت اجرا</p>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${execMeta.bg}`}>{execMeta.label}</span>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200"><span className="block text-[10px] text-slate-400">شماره و عنوان جلسه</span><strong className="text-slate-800">{resolution.meetingNumber}</strong><span className="block text-[10px] text-slate-500 mt-0.5">{resolution.meetingTitle}</span></div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200"><span className="block text-[10px] text-slate-400">شماره مصوبه در جلسه</span><strong className="text-slate-800">{toPersianDigits(resolution.meetingResolutionNumber || '—')}</strong></div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200"><span className="block text-[10px] text-slate-400">شماره نامه</span><strong className="text-slate-800">{toPersianDigits(resolution.letterNumber || '—')}</strong></div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200"><span className="block text-[10px] text-slate-400">تاریخ و محل جلسه</span><strong className="text-slate-800">{toPersianDigits(meeting?.dateJalali || resolution.assignedDateJalali || '—')}</strong><span className="block text-[10px] text-slate-500 mt-0.5">{meeting?.location || '—'}</span></div>
                </div>

                <div>
                  <span className="font-bold text-slate-500">موضوع:</span>
                  <h5 className="font-extrabold text-slate-900 text-sm mt-1">{resolution.topicTitle}</h5>
                </div>

                <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200">
                  <span className="font-extrabold text-teal-950 block mb-1">متن کامل مصوبه</span>
                  <p className="text-slate-700 leading-7">{resolution.executionDescription || resolution.requestDescription}</p>
                </div>

                <div>
                  <span className="font-extrabold text-slate-800 block mb-2">مدعوین و مسئولان مرتبط</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {invitees.map((invitee) => (
                      <div key={invitee.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                        <strong className="text-slate-800">{invitee.name}</strong>
                        <span className="block text-[10px] text-slate-500 mt-0.5">{invitee.title}{invitee.department ? ` — ${invitee.department}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3"><PenTool className="w-4 h-4 text-slate-700" /><span className="font-extrabold text-slate-800">{isParallelChain ? 'امضاهای دیجیتال همزمان' : 'امضاهای دیجیتال ترتیبی'}</span>{isCustomChain && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">گردش اختصاصی جلسه</span>}</div>

                  {/* Infographic: at-a-glance sequential-signature stepper.
                      Purely visual, derived from the same signatureWorkflow
                      data as the card grid below — no new state or logic. */}
                  <div className="flex items-center mb-5 px-2">
                    {signatureWorkflow.steps.map((step, idx) => {
                      const isSigned = step.status === 'SIGNED';
                      const isCurrent = step.status === 'PENDING';
                      const circleClass = isSigned
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-white border-amber-500 text-amber-600 ring-4 ring-amber-100'
                        : 'bg-white border-slate-300 text-slate-400';
                      return (
                        <React.Fragment key={step.id}>
                          <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-extrabold text-xs ${circleClass}`}>
                              {isSigned ? <Check className="w-4 h-4" /> : toPersianDigits(step.order)}
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">{step.signerRole === 'OFFICE_MANAGER' ? 'مسئول دفتر' : step.signerRole === 'CEO' ? 'مدیرعامل' : step.signerRole === 'CUSTOM' ? (step.signerTitle || step.signerName) : 'ادمین'}</span>
                          </div>
                          {idx < signatureWorkflow.steps.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1 mb-4 ${isSigned ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {signatureWorkflow.steps.map((step) => {
                      const statusLabel = step.status === 'SIGNED' ? 'امضا شده' : step.status === 'PENDING' ? 'در انتظار امضا' : 'در انتظار نوبت';
                      const statusClass = step.status === 'SIGNED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : step.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200';
                      return (
                        <div key={step.id} className={`p-4 rounded-2xl border ${step.status === 'PENDING' ? 'ring-2 ring-amber-200' : ''} ${statusClass}`}>
                          <span className="text-[10px] font-bold">امضای {toPersianDigits(step.order)}</span>
                          <strong className="block text-slate-900 mt-2">{step.signerName}</strong>
                          <span className="block text-[10px] text-slate-600 mt-0.5">{step.signerTitle}</span>
                          <span className={`inline-block mt-3 px-2 py-1 rounded-full border text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                          {/* Audit Trail: امضاکننده تعیین‌شده بالا نمایش داده می‌شود و
                              اگر امضا به جانشینی انجام شده باشد، صریحاً گفته می‌شود
                              چه کسی واقعاً امضا کرده است. */}
                          {step.status === 'SIGNED' && step.signedAsDelegate && step.actualSignerName && (
                            <span className="block text-[10px] font-bold text-indigo-700 mt-2">
                              امضا توسط: {step.actualSignerName} (به جانشینی)
                            </span>
                          )}
                          {step.status === 'SIGNED' && <span className="block text-[10px] text-slate-500 mt-2">{toPersianDigits(step.signedDateJalali || '—')}، ساعت {toPersianDigits(step.signedTimeString || '—')}</span>}
                          {/* The signer's own snapshotted signature image — always
                              resolved from the signature record, never from the
                              user currently viewing the resolution. */}
                          {step.status === 'SIGNED' && <img src={step.signatureImageUrl || SAMPLE_SIGNATURE_DATA_URL} alt={`امضای ${step.signerName}`} className="h-12 object-contain mt-2 bg-white/70 rounded-lg p-1" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <SignatureVerifier resolution={resolution} />
                {signatureWorkflow.status !== 'COMPLETED' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200">
                    <span className="text-amber-900 font-bold">
                      {isSigningAsDelegate
                        ? `امضا به جانشینی از ${activeSignature?.signerName}. امضای شما به نام خودتان و به‌عنوان جانشین ثبت می‌شود.`
                        : canSign
                          ? (isParallelChain ? 'امضای شما لازم است. سایر امضاکنندگان همزمان امضا می‌کنند.' : 'نوبت امضای شماست. پس از تأیید، سند به امضاکننده بعدی ارسال می‌شود.')
                          : `در انتظار امضای ${isParallelChain && pendingSignerNames.length ? pendingSignerNames.join('، ') : activeSignature?.signerName || 'امضاکننده بعدی'}`}
                    </span>
                    {canSign && (
                      <button type="button" onClick={handleSignResolution} disabled={isSigning} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-extrabold">
                        <PenTool className="w-4 h-4" />
                        {isSigning ? 'در حال ثبت امضا...' : isSigningAsDelegate ? 'امضا به جانشینی' : 'امضای دیجیتال مصوبه'}
                      </button>
                    )}
                  </div>
                )}
                {signatureWorkflow.status === 'COMPLETED' && resolution.executionStatus === 'WAITING_NOTIFICATION' && (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {isCustomChain ? 'همه امضاهای تعیین‌شده' : 'هر سه امضای اصلی'} تکمیل شده؛ مصوبه در انتظار ابلاغ رسمی توسط مسئول دفتر است.
                  </div>
                )}
                {/* ابلاغ ثبت شده اما ابلاغیه هنوز امضا نشده: مصوبه وارد اجرا نشده است. */}
                {resolution.executionStatus === 'PENDING_SECRETARY_NOTICE_SIGNATURE' && (
                  <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 space-y-2">
                    <div className="font-extrabold flex items-center gap-2">
                      <PenTool className="w-4 h-4" />
                      ابلاغ ثبت شد؛ ابلاغیه در انتظار امضای دبیر جلسه است و مصوبه هنوز وارد فاز اجرا نشده.
                    </div>
                    <div className="text-[11px] font-bold">
                      ابلاغ توسط {resolution.notifiedByName || '—'} در تاریخ {toPersianDigits(resolution.notifiedDateJalali || '—')}
                      {resolution.notifiedTimeString ? ` ساعت ${toPersianDigits(resolution.notifiedTimeString)}` : ''}
                      {resolution.notificationLetterNumber ? ` | شماره نامه ابلاغیه: ${toPersianDigits(resolution.notificationLetterNumber)}` : ''}
                    </div>
                    <SignNotificationLetterAction resolution={resolution} onSigned={triggerRefresh} />
                  </div>
                )}
                {signatureWorkflow.status === 'COMPLETED' && !['WAITING_NOTIFICATION', 'PENDING_SECRETARY_NOTICE_SIGNATURE'].includes(resolution.executionStatus) && (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-1">
                    <div className="font-extrabold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{isCustomChain ? 'همه امضاها' : 'هر سه امضا'} تکمیل شده و مصوبه ابلاغ و وارد فرآیند اجرا شده است.</div>
                    {resolution.notifiedByName && (
                      <div className="text-[11px] font-bold">
                        ابلاغ توسط {resolution.notifiedByName} در تاریخ {toPersianDigits(resolution.notifiedDateJalali || '—')}
                        {resolution.notifiedTimeString ? ` ساعت ${toPersianDigits(resolution.notifiedTimeString)}` : ''}
                      </div>
                    )}
                  </div>
                )}
                {resolution.executionStatus === 'WAITING_NOTIFICATION' && hasPermission('NOTIFY_RESOLUTION') && (
                  <NotifyResolutionAction resolutionId={resolution.id} resolutionNumber={resolution.resolutionNumber} onNotified={triggerRefresh} />
                )}
              </div>
            </section>
          )}
          
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">جلسه مرجع</div>
              <div className="font-extrabold text-slate-800 truncate" title={resolution.meetingTitle}>
                {resolution.meetingTitle}
              </div>
              <div className="text-[10px] text-slate-500">{resolution.meetingNumber}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">مسئول اجرا (Assignee)</div>
              <div className="font-extrabold text-slate-800">{resolution.mainResponsibleName || 'نامشخص'}</div>
              <div className="text-[10px] text-slate-500">{resolution.responsibleDepartmentName}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">مهلت اقدام (Deadline)</div>
              <div className="font-extrabold text-slate-800">{toPersianDigits(resolution.deadlineJalali || '—')}</div>
              <div className="text-[10px] text-slate-500">ابلاغ: {toPersianDigits(resolution.assignedDateJalali || '—')}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">اولویت سازمانی</div>
              <span className={`inline-block font-extrabold px-2 py-0.5 rounded-md ${priorityMeta.bg} ${priorityMeta.text}`}>
                {priorityMeta.label}
              </span>
            </div>
          </div>

          {(resolution.progressReports?.length || resolution.progressPercent !== undefined) && (
            <section className="p-5 bg-white border border-slate-200 rounded-3xl space-y-4">
              <div className="flex items-center justify-between"><h4 className="font-extrabold text-slate-900">پیگیری پیشرفت اجرای مصوبه</h4><span className="text-sm font-black text-teal-700">{toPersianDigits(resolution.progressPercent || 0)}٪</span></div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${resolution.progressPercent || 0}%` }} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]"><div className="p-3 bg-slate-50 rounded-xl"><span className="text-slate-400 block">تاریخ شروع</span><strong>{toPersianDigits(resolution.executionStartDateJalali || '—')}</strong></div><div className="p-3 bg-slate-50 rounded-xl sm:col-span-2"><span className="text-slate-400 block">آخرین اقدام</span><strong>{resolution.lastAction || '—'}</strong></div></div>
              {resolution.obstacles && <div className="p-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl"><strong>مشکلات و موانع:</strong> {resolution.obstacles}</div>}
              <div className="space-y-2"><div className="font-bold text-slate-700">گزارش‌های ثبت‌شده</div>{[...(resolution.progressReports || [])].reverse().map((report) => <div key={report.id} className="p-3 border border-slate-200 rounded-2xl bg-slate-50"><div className="flex flex-wrap justify-between gap-2"><strong className="text-slate-800">{toPersianDigits(report.progressPercent)}٪ — {report.reporterName}</strong><span className="text-slate-400">{toPersianDigits(report.reportDateJalali)}، {toPersianDigits(report.reportTimeString)}</span></div><p className="mt-1 text-slate-700">{report.actionDescription}</p>{report.obstacles && <p className="mt-1 text-orange-700">موانع: {report.obstacles}</p>}{report.attachments.length > 0 && <span className="block mt-1 text-blue-700">{toPersianDigits(report.attachments.length)} مستند پیوست</span>}</div>)}</div>
            </section>
          )}

          <section className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
            <h4 className="font-extrabold text-slate-900">پرونده و زنجیره سوابق مصوبه</h4>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold"><span className="px-3 py-1.5 bg-white border rounded-xl">پیشنهاد اولیه {meeting?.agendaItems.find((item) => item.id === resolution.agendaItemId)?.sourceProposalId ? `(${meeting.agendaItems.find((item) => item.id === resolution.agendaItemId)?.sourceProposalId})` : ''}</span><span>←</span><span className="px-3 py-1.5 bg-white border rounded-xl">دستورکار {resolution.agendaItemId || '—'}</span><span>←</span><span className="px-3 py-1.5 bg-white border rounded-xl">{resolution.meetingNumber}</span><span>←</span><span className="px-3 py-1.5 bg-white border rounded-xl">{resolution.resolutionNumber}</span><span>←</span><span className="px-3 py-1.5 bg-white border rounded-xl">{notices.length ? `${toPersianDigits(notices.length)} ابلاغیه` : 'در انتظار ابلاغ'}</span><span>←</span><span className="px-3 py-1.5 bg-white border rounded-xl">{toPersianDigits(resolution.progressPercent || 0)}٪ اجرا</span></div>
            {notices.length > 0 && <div className="space-y-2">{notices.map((notice) => <div key={notice.id} className="p-3 bg-white border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2"><div><strong className="text-blue-900">{notice.noticeNumber}</strong>{notice.notificationLetterNumber && <span className="mr-2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">شماره نامه ابلاغیه: {toPersianDigits(notice.notificationLetterNumber)}</span>}<span className="block text-[10px] text-slate-500">{notice.recipientName} — {notice.recipientDepartment} — {toPersianDigits(notice.dateJalali)}</span></div><div className="flex items-center gap-2"><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${notice.status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{notice.status === 'RECEIVED' ? 'دریافت شده' : 'ارسال شده'}</span>{notice.status === 'SENT' && (currentUser.role === 'ADMIN' || notice.recipientName === currentUser.fullName || notice.recipientDepartment === currentUser.departmentName) && <button onClick={() => handleNoticeReceived(notice.id)} className="text-[10px] bg-teal-700 text-white px-2.5 py-1.5 rounded-lg">ثبت دریافت</button>}</div></div>)}</div>}
          </section>

          {/* Texts & Instructions */}
          <div className="space-y-3">
            <div className="p-4 bg-teal-50/40 border border-teal-200/70 rounded-2xl space-y-1">
              <span className="font-extrabold text-teal-950 block">متن مصوب و شرح اقدام اجرایی:</span>
              <p className="text-slate-700 leading-relaxed text-xs">
                {resolution.executionDescription || resolution.requestDescription}
              </p>
            </div>

            {resolution.completionNotes && (
              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-emerald-900 font-extrabold">
                  <span>گزارش ثبت‌شده اتمام کار توسط مجری:</span>
                  <span className="text-[11px] font-normal">تاریخ تکمیل: {toPersianDigits(resolution.completionDateJalali || '—')}</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-xs">
                  {resolution.completionNotes}
                </p>
              </div>
            )}
          </div>

          {/* Verification Stepper (صحه‌گذاری مراحل) */}
          {resolution.verificationConfig?.requiresVerification && (
            <div className="p-5 bg-purple-50/50 border border-purple-200 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-700" />
                  <h4 className="text-xs font-extrabold text-purple-950">
                    مراحل زنجیره صحه‌گذاری (Verification Steps)
                  </h4>
                </div>
                <span className="text-[11px] font-bold text-purple-700 bg-white px-2.5 py-0.5 rounded-full border border-purple-200">
                  نحوه اجرا: {resolution.verificationConfig.mode === 'SEQUENTIAL' ? 'ترتیبی (مرحله‌به‌مرحله)' : 'موازی'}
                </span>
              </div>

              {/* Steps timeline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {vSteps.map((step, idx) => {
                  const stepMeta = getVerificationStepStatusMeta(step.status);
                  const isCurrent = resolution.executionStatus === 'PENDING_APPROVAL' && idx === currentStepIdx;

                  return (
                    <div
                      key={step.stepNumber}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCurrent
                          ? 'bg-white border-purple-500 ring-2 ring-purple-300/40 shadow-xs'
                          : step.status === 'APPROVED'
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-white/80 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-extrabold text-slate-800">
                          مرحله {toPersianDigits(step.stepNumber)}: {step.approverName}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stepMeta.bg}`}>
                          {stepMeta.label}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500">{step.approverRole}</div>

                      {step.comments && (
                        <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-700">
                          <strong>نظر صحه‌گذار:</strong> {step.comments}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Form 1: Complete task by Assignee */}
          {isAssignee && ['IN_PROGRESS', 'WAITING_RESPONSE', 'NEEDS_FOLLOW_UP', 'OVERDUE', 'REJECTED_RETURNED'].includes(resolution.executionStatus) && (
            <div className="p-5 bg-teal-50/60 border border-teal-300 rounded-3xl space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-700" />
                <h4 className="text-xs font-extrabold text-teal-950">
                  ثبت اتمام اقدام توسط مجری (شما به عنوان مسئول اجرا)
                </h4>
              </div>
              <p className="text-[11px] text-teal-800">
                گزارش اقدامات انجام شده و مستندات مربوطه را درج فرمایید تا مصوبه وارد فرآیند صحه‌گذاری شود.
              </p>

              <textarea
                rows={3}
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="شرح کامل گزارش اتمام، شماره نامه‌های صادره یا لینک‌های مرتبط..."
                className="w-full text-xs p-3 bg-white border border-teal-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs p-2.5 bg-white border border-teal-200 rounded-xl cursor-pointer w-fit">
                  <Paperclip className="w-4 h-4" />
                  <span>افزودن فایل پیوست</span>
                  <input type="file" multiple className="hidden" onChange={(e) => setCompletionFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} />
                </label>
                {completionFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {completionFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 p-2 bg-white border border-teal-200 rounded-xl text-[11px]">
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

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCompleteTask}
                  disabled={isSubmittingCompletion}
                  className="bg-teal-800 hover:bg-teal-700 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmittingCompletion ? 'در حال ارسال...' : 'ثبت اتمام کار و ارسال جهت صحه‌گذاری'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Interactive Form 2: Verification Action by Approver */}
          {isCurrentApprover && resolution.executionStatus === 'PENDING_APPROVAL' && (
            <div className="p-5 bg-purple-50/80 border border-purple-300 rounded-3xl space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-700" />
                <h4 className="text-xs font-extrabold text-purple-950">
                  اقدام صحه‌گذاری توسط شما ({currentUser.fullName})
                </h4>
              </div>
              <p className="text-[11px] text-purple-800">
                گزارش مجری را بررسی نموده و نسبت به تایید یا رد مرحله اقدام فرمایید:
              </p>

              <textarea
                rows={2}
                value={approverComments}
                onChange={(e) => setApproverComments(e.target.value)}
                placeholder="نظرات کارشناسی یا علت عدم تایید..."
                className="w-full text-xs p-3 bg-white border border-purple-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleRejectStep}
                  disabled={isSubmittingApproval}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>عدم تایید و بازگشت به مجری</span>
                </button>

                <button
                  type="button"
                  onClick={handleApproveStep}
                  disabled={isSubmittingApproval}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>تایید مرحله صحه‌گذاری</span>
                </button>
              </div>
            </div>
          )}

          {/* Follow-up (پیگیری) — a parallel monitoring track. Shown only to
              holders of the follow-up permission; recording still goes through
              the same single followUpService path the cartable uses. */}
          {resolution.followUp?.enabled && hasPermission('VIEW_RESOLUTION_FOLLOWUP') && (
            <div className="p-3.5 bg-amber-50/50 border border-amber-200/70 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-900">
                <span className="font-extrabold">برنامه پیگیری:</span>
                <span>موعد بعدی {nextDueDate(resolution.followUp) ? toPersianDigits(nextDueDate(resolution.followUp)!) : 'تعیین نشده'}</span>
                {resolution.followUp.lastFollowUpDateJalali && (
                  <span>— آخرین پیگیری {toPersianDigits(resolution.followUp.lastFollowUpDateJalali)}</span>
                )}
              </div>
              {hasPermission('MANAGE_RESOLUTION_FOLLOWUP') && (
                <RecordFollowUpForm resolutionId={resolution.id} onRecorded={() => { setFollowUpKey((previous) => previous + 1); triggerRefresh(); }} />
              )}
              <FollowUpHistory resolutionId={resolution.id} reloadKey={followUpKey} />
            </div>
          )}

          {/* Archive — filing and unfiling only; never a delete. */}
          <ArchiveResolutionAction resolution={resolution} onChanged={() => { triggerRefresh(); onClose(); }} />

          {/* Official documents — a rendering of this resolution's own data. */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800">نسخه رسمی اسناد</h4>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleResolutionDocument} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
                <FileDown className="w-3.5 h-3.5" />
                <span>مشاهده و دانلود سند مصوبه</span>
              </button>
              <button type="button" onClick={handleNotificationDocument} className="flex items-center gap-1.5 bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
                <FileDown className="w-3.5 h-3.5" />
                <span>مشاهده و دانلود نامه ابلاغیه</span>
              </button>
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800">پیوست‌ها و مستندات مصوبه</h4>
            <AttachmentList attachments={resolution.attachments} canUpload={true} />
          </div>

          {/* Activity Timeline */}
          <div className="pt-2 border-t border-slate-100">
            <TimelineView logs={logs} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>کد پیگیری سیستمی: {resolution.id}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
