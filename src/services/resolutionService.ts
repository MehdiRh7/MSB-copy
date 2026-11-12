import { getCurrentJalaliDate, getCurrentTimeString } from '../utils/date';
import {
  Resolution,
  ResolutionApprovalStatus,
  ResolutionExecutionStatus,
  PriorityLevel,
  VerificationConfig,
  ResolutionReferral,
  ActivityLog,
  ApiResponse,
  ApiFilterParams,
  PagedResult,
  User,
  ResolutionNotice,
  AppNotification,
  ResolutionFollowUpPlan,
  DocumentSignature,
  ResolutionArchiveState,
} from '../types';
import type { ResolutionProgressReport } from '../types';
import { mockResolutions, mockActivityLogs, mockTasks, mockApprovals, mockMeetings, mockNotifications } from '../mock/data';
import { apiClient } from './api/apiClient';
import { mockUsers } from '../mock/data';
import { hasOrgWideResolutionAccess, isResolutionRelatedToUser } from './userScope';
import { loadLocalCollection, saveLocalCollection } from './localStore';
import { issueNotificationLetterNumber } from './notificationLetterNumbering';
import { resolveSignatureImageUrl } from '../utils/signatureImage';
import { resolveStageSigner } from './signatureWorkflowSettingsService';
import { resolveSigningAuthority } from './signatureDelegationService';
import { canonicalNoticeContent, canonicalResolutionContent, signContent } from './digitalSignatureService';

export interface CreateResolutionDto {
  meetingId: string;
  meetingTitle: string;
  meetingNumber: string;
  agendaItemId?: string;
  agendaItemTitle?: string;
  topicTitle: string;
  proposerName: string;
  proposerDepartment: string;
  requestDescription: string;
  reviewResultNotes?: string;
  approvalStatus: ResolutionApprovalStatus;
  
  // Execution details (if approved)
  executionDescription?: string;
  mainResponsibleUserId?: string;
  mainResponsibleName?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  assignedDateJalali?: string;
  deadlineJalali?: string;
  priority?: PriorityLevel;
  referrals?: ResolutionReferral[];
  verificationConfig?: VerificationConfig;
  attachments?: Resolution['attachments'];
  letterNumber?: string;
  // «برنامه پیگیری مصوبه» chosen by the office manager while registering the
  // resolution. Monitoring metadata only — it never influences the signature,
  // ابلاغ, execution or verification workflows below.
  followUp?: ResolutionFollowUpPlan;
}

export interface IResolutionService {
  getResolutions(params?: ApiFilterParams & { approvalStatus?: string; executionStatus?: string; meetingId?: string; relatedUserId?: string; proposerDepartmentName?: string; includeArchived?: boolean }): Promise<ApiResponse<PagedResult<Resolution>>>;
  getResolutionById(id: string): Promise<ApiResponse<Resolution | null>>;
  createResolution(dto: CreateResolutionDto): Promise<ApiResponse<Resolution>>;
  updateResolution(id: string, dto: Partial<Resolution>): Promise<ApiResponse<Resolution>>;
  deleteResolution(id: string): Promise<ApiResponse<boolean>>;
  getResolutionActivityLogs(resolutionId: string): Promise<ApiResponse<ActivityLog[]>>;
  completeResolutionTask(resolutionId: string, completionNotes: string, attachments?: Resolution['attachments']): Promise<ApiResponse<Resolution>>;
  approveVerificationStep(resolutionId: string, stepNumber: number, comments: string, approverName: string): Promise<ApiResponse<Resolution>>;
  rejectVerificationStep(resolutionId: string, stepNumber: number, rejectionReason: string, approverName: string): Promise<ApiResponse<Resolution>>;
  signResolution(resolutionId: string, signerUserId: string): Promise<ApiResponse<Resolution>>;
  updateExecutionProgress(resolutionId: string, report: ResolutionProgressReport): Promise<ApiResponse<Resolution>>;
  markMeetingMinutesFinalized(meetingId: string): Promise<ApiResponse<number>>;
  appendResolutionTimelineEntry(entry: ActivityLog): void;
  // Archive state only. Never deletes the resolution, never touches the
  // signature/ابلاغ/execution/verification workflows — it records where the
  // resolution was filed and the working status to restore it to.
  setResolutionArchiveState(resolutionId: string, state: Omit<ResolutionArchiveState, 'previousExecutionStatus' | 'archivedAt' | 'archivedDateJalali'>): Promise<ApiResponse<Resolution>>;
  clearResolutionArchiveState(resolutionId: string, actorName: string): Promise<ApiResponse<Resolution>>;
  releaseMeetingResolutionsForExecution(meetingId: string): Promise<ApiResponse<number>>;
  // Records the independent ابلاغ (official notification) step for a
  // resolution whose three main signatures are already complete — the one
  // real transition that unlocks execution. Called from both the کارتابل
  // ابلاغ inbox and the resolution's own detail form; never a second,
  // parallel notification path.
  // تاریخ ابلاغ دیگر از کاربر گرفته نمی‌شود — از DateTime واقعی سیستم ثبت می‌شود.
  notifyResolution(resolutionId: string, actor: User): Promise<ApiResponse<Resolution>>;
  // امضای واقعی دبیر جلسه روی ابلاغیه؛ تنها راه ورود مصوبه به فاز اجرا.
  signNotificationLetter(resolutionId: string, actor: User): Promise<ApiResponse<Resolution>>;
  filterNoticesAwaitingSignatureBy(resolutions: Resolution[], actor: User): Promise<Resolution[]>;
}

class MockResolutionService implements IResolutionService {
  private resolutions: Resolution[] = loadLocalCollection('resolutions', mockResolutions);
  private activityLogs: ActivityLog[] = loadLocalCollection('activityLogs', mockActivityLogs);

  private persist() {
    saveLocalCollection('resolutions', this.resolutions);
    saveLocalCollection('activityLogs', this.activityLogs);
  }

  /**
   * سه امضای اصلی مصوبه — ترتیب، تعداد، وضعیت‌ها و شکل داده دقیقاً مثل قبل.
   * تنها تفاوت: امضاکننده هر مرحله به‌جای Hardcode بودن، از «تنظیمات گردش
   * امضا» Resolve می‌شود و همان‌جا روی خود مصوبه Snapshot می‌گردد؛ پس تغییر
   * بعدی تنظیمات، مصوبات در حال گردش را جابه‌جا نمی‌کند.
   * پیش‌فرض تنظیمات همان مسئول دفتر → مدیرعامل → مدیر سیستم است.
   */
  private createSignatureWorkflow(meetingId?: string): NonNullable<Resolution['signatureWorkflow']> {
    // گردش کار پویا: اگر جلسه زنجیره امضای اختصاصی دارد، همان (با ترتیب و
    // حالت ترتیبی/موازی تعیین‌شده) روی مصوبه Snapshot می‌شود.
    const meeting = meetingId ? loadLocalCollection('meetings', mockMeetings).find((item) => item.id === meetingId) : undefined;
    const chain = meeting?.workflow?.resolutionSignature;
    if (chain && chain.signerUserIds.length > 0) {
      const users = loadLocalCollection('users', mockUsers);
      const parallel = chain.mode === 'PARALLEL';
      const stamp = Date.now();
      return {
        status: 'PENDING_SIGNATURES',
        currentStepIndex: 0,
        mode: chain.mode,
        source: 'MEETING',
        steps: chain.signerUserIds.map((userId, index) => {
          const user = users.find((item) => item.id === userId);
          return {
            id: `sig-${stamp}-${index + 1}`,
            signerUserId: userId,
            signerName: user?.fullName || 'امضاکننده',
            signerTitle: user?.title || '',
            signerRole: 'CUSTOM' as const,
            order: index + 1,
            status: parallel || index === 0 ? 'PENDING' as const : 'WAITING_TURN' as const,
          };
        }),
      };
    }
    const stage1 = resolveStageSigner('RESOLUTION_STEP_1');
    const stage2 = resolveStageSigner('RESOLUTION_STEP_2');
    const stage3 = resolveStageSigner('RESOLUTION_STEP_3');
    if (!stage1 || !stage2 || !stage3) throw new Error('امضاکنندگان موردنیاز در فهرست کاربران تعریف نشده‌اند');
    return {
      status: 'PENDING_OFFICE_SIGNATURE' as const,
      currentStepIndex: 0,
      mode: 'SEQUENTIAL',
      source: 'DEFAULT',
      steps: [
        { id: `sig-${Date.now()}-1`, signerUserId: stage1.userId, signerName: stage1.name, signerTitle: stage1.title, signerRole: 'OFFICE_MANAGER' as const, order: 1 as const, status: 'PENDING' as const },
        { id: `sig-${Date.now()}-2`, signerUserId: stage2.userId, signerName: stage2.name, signerTitle: stage2.title, signerRole: 'CEO' as const, order: 2 as const, status: 'WAITING_TURN' as const },
        { id: `sig-${Date.now()}-3`, signerUserId: stage3.userId, signerName: stage3.name, signerTitle: stage3.title, signerRole: 'ADMIN' as const, order: 3 as const, status: 'WAITING_TURN' as const },
      ],
    };
  }

  private startExecution(resolution: Resolution) {
    resolution.executionStatus = 'IN_PROGRESS';
    if (!resolution.mainResponsibleUserId) return;
    const tasks = loadLocalCollection('tasks', mockTasks);
    if (tasks.some((task) => task.resolutionId === resolution.id)) return;
    tasks.unshift({
      id: `task-${Date.now()}`,
      resolutionId: resolution.id,
      resolutionNumber: resolution.resolutionNumber,
      resolutionTitle: resolution.topicTitle,
      meetingId: resolution.meetingId,
      meetingTitle: resolution.meetingTitle,
      assignedToUserId: resolution.mainResponsibleUserId,
      assignedToName: resolution.mainResponsibleName || 'مسئول اجرا',
      departmentId: resolution.responsibleDepartmentId || 'dept-1',
      departmentName: resolution.responsibleDepartmentName || 'واحد مسئول',
      referralDateJalali: resolution.assignedDateJalali || '—',
      deadlineJalali: resolution.deadlineJalali || '—',
      priority: resolution.priority,
      status: 'IN_PROGRESS',
      requiresVerification: resolution.verificationConfig.requiresVerification,
      instructions: resolution.executionDescription || resolution.requestDescription,
      attachments: resolution.attachments,
    });
    saveLocalCollection('tasks', tasks);
  }

  public async getResolutions(params?: ApiFilterParams & { approvalStatus?: string; executionStatus?: string; meetingId?: string; requiresVerification?: boolean; relatedUserId?: string; proposerDepartmentName?: string; includeArchived?: boolean }): Promise<ApiResponse<PagedResult<Resolution>>> {
    let filtered = [...this.resolutions];

    if (params?.relatedUserId) {
      const users = loadLocalCollection('users', mockUsers);
      const relatedUser = users.find((user) => user.id === params.relatedUserId);
      // دارنده مجوز مشاهده مصوبات، کل بانک مصوبات را می‌بیند؛ بقیه فقط
      // مصوباتی که شخصاً با آنها مرتبط‌اند. با اعمال این قاعده در همین‌جا،
      // فهرست، شمارنده منو، داشبورد و جستجو همگی یکسان عمل می‌کنند.
      filtered = relatedUser
        ? (hasOrgWideResolutionAccess(relatedUser)
            ? filtered
            : filtered.filter((resolution) => isResolutionRelatedToUser(resolution, relatedUser)))
        : [];
    }

    if (params?.searchTerm) {
      const term = params.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.topicTitle.toLowerCase().includes(term) ||
          r.resolutionNumber.toLowerCase().includes(term) ||
          r.meetingNumber.toLowerCase().includes(term) ||
          r.meetingTitle.toLowerCase().includes(term) ||
          (r.letterNumber && r.letterNumber.toLowerCase().includes(term)) ||
          r.proposerName.toLowerCase().includes(term) ||
          (r.mainResponsibleName && r.mainResponsibleName.toLowerCase().includes(term)) ||
          (r.responsibleDepartmentName && r.responsibleDepartmentName.toLowerCase().includes(term))
      );
    }

    if (params?.meetingId) {
      filtered = filtered.filter((r) => r.meetingId === params.meetingId);
    }

    if (params?.approvalStatus && params.approvalStatus !== 'ALL') {
      filtered = filtered.filter((r) => r.approvalStatus === params.approvalStatus);
    }

    if (params?.executionStatus && params.executionStatus !== 'ALL') {
      filtered = filtered.filter((r) => r.executionStatus === params.executionStatus);
    }

    // An archived resolution leaves the active list entirely — it must never
    // appear in both the bank of resolutions and the archive at the same time.
    // Callers that are *showing* the archive opt back in explicitly.
    if (!params?.includeArchived && params?.executionStatus !== 'ARCHIVED') {
      filtered = filtered.filter((r) => !r.archive);
    }

    if (params?.departmentId && params.departmentId !== 'ALL') {
      filtered = filtered.filter((r) => r.responsibleDepartmentId === params.departmentId);
    }

    if (params?.proposerDepartmentName && params.proposerDepartmentName !== 'ALL') {
      filtered = filtered.filter((r) => r.proposerDepartment === params.proposerDepartmentName);
    }

    const comparableDate = (value?: string) => {
      const source = value?.includes('T') ? new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date(value)).replace(/[\u200e\u200f]/g, '') : (value || '');
      return source.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/\D/g, '');
    };
    if (params?.fromDateJalali) {
      const from = comparableDate(params.fromDateJalali);
      filtered = filtered.filter((r) => comparableDate(r.assignedDateJalali || r.createdAt) >= from);
    }
    if (params?.toDateJalali) {
      const to = comparableDate(params.toDateJalali);
      filtered = filtered.filter((r) => comparableDate(r.assignedDateJalali || r.createdAt) <= to);
    }

    if (params?.requiresVerification !== undefined) {
      filtered = filtered.filter((r) => r.verificationConfig.requiresVerification === params.requiresVerification);
    }

    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pageIndex = params?.pageIndex || 1;
    const pageSize = params?.pageSize || 10;
    const totalCount = filtered.length;
    const startIndex = (pageIndex - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return apiClient.simulateNetwork<PagedResult<Resolution>>({
      items,
      totalCount,
      pageIndex,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    }, 150);
  }

  public async getResolutionById(id: string): Promise<ApiResponse<Resolution | null>> {
    const item = this.resolutions.find((r) => r.id === id) || null;
    return apiClient.simulateNetwork(item, 100);
  }

  public async createResolution(dto: CreateResolutionDto): Promise<ApiResponse<Resolution>> {
    // هر بند دستور جلسه فقط یک مصوبه می‌گیرد. UI دکمه را پنهان می‌کند، اما
    // Business Logic هم باید جلوی مصوبه دوم را بگیرد تا از مسیر دیگری
    // (State دستکاری‌شده، Double Submit، فراخوانی مستقیم Service) مصوبه
    // تکراری برای همان بند ساخته نشود.
    if (dto.agendaItemId) {
      const duplicate = this.resolutions.find(
        (resolution) => resolution.agendaItemId === dto.agendaItemId
      );
      if (duplicate) {
        throw new Error(`برای این بند دستور جلسه قبلاً مصوبه «${duplicate.resolutionNumber}» ثبت شده است و امکان ثبت مصوبه دوم وجود ندارد.`);
      }
    }

    const nextNum = this.resolutions.length + 98;
    const isApproved = dto.approvalStatus === 'APPROVED';
    const meetingResolutionNumber = this.resolutions.filter((resolution) => resolution.meetingId === dto.meetingId).length + 1;

    const newResolution: Resolution = {
      id: `res-${Date.now()}`,
      resolutionNumber: `مصوبه-۱۴۰۳-${nextNum}`,
      meetingResolutionNumber: String(meetingResolutionNumber),
      letterNumber: dto.letterNumber,
      meetingId: dto.meetingId,
      meetingTitle: dto.meetingTitle,
      meetingNumber: dto.meetingNumber,
      agendaItemId: dto.agendaItemId,
      agendaItemTitle: dto.agendaItemTitle,
      topicTitle: dto.topicTitle,
      proposerName: dto.proposerName,
      proposerDepartment: dto.proposerDepartment,
      requestDescription: dto.requestDescription,
      reviewResultNotes: dto.reviewResultNotes,
      approvalStatus: dto.approvalStatus,
      
      executionDescription: isApproved ? dto.executionDescription : '',
      mainResponsibleUserId: isApproved ? dto.mainResponsibleUserId : undefined,
      mainResponsibleName: isApproved ? dto.mainResponsibleName : undefined,
      responsibleDepartmentId: isApproved ? dto.responsibleDepartmentId : undefined,
      responsibleDepartmentName: isApproved ? dto.responsibleDepartmentName : undefined,
      assignedDateJalali: isApproved ? (dto.assignedDateJalali || getCurrentJalaliDate()) : undefined,
      deadlineJalali: isApproved ? dto.deadlineJalali : undefined,
      priority: dto.priority || 'MEDIUM',
      executionStatus: 'NOT_STARTED',
      referrals: dto.referrals || [],
      verificationConfig: dto.verificationConfig || {
        requiresVerification: false,
        mode: 'SEQUENTIAL',
        currentStepIndex: 0,
        steps: [],
      },
      signatureWorkflow: isApproved ? this.createSignatureWorkflow(dto.meetingId) : undefined,
      attachments: dto.attachments || [],
      createdAt: new Date().toISOString(),
      followUp: dto.followUp,
    };

    if (newResolution.signatureWorkflow) newResolution.executionStatus = newResolution.signatureWorkflow.status as Resolution['executionStatus'];
    this.resolutions.unshift(newResolution);

    // Add activity logs to the existing resolution timeline.
    const createdAt = Date.now();
    this.activityLogs.unshift({
      id: `log-${createdAt}`,
      targetType: 'RESOLUTION',
      targetId: newResolution.id,
      action: isApproved ? 'مصوبه تصویب شد' : 'ثبت نتیجه بررسی جلسه',
      actorName: 'دبیر شورای راهبری',
      actorRole: 'دبیرخانه جلسات',
      timestampJalali: getCurrentJalaliDate(),
      timeString: getCurrentTimeString(),
      details: isApproved ? 'نتیجه بررسی جلسه به‌عنوان مصوبه ثبت شد.' : `وضعیت بررسی: ${dto.approvalStatus}`,
      badgeColor: isApproved ? 'teal' : 'amber',
    });
    if (isApproved) {
      this.activityLogs.unshift({
        id: `log-${createdAt}-minutes`,
        targetType: 'RESOLUTION',
        targetId: newResolution.id,
        action: 'صورت‌جلسه مصوبه ایجاد شد',
        actorName: 'دبیر شورای راهبری',
        actorRole: 'دبیرخانه جلسات',
        timestampJalali: getCurrentJalaliDate(),
        timeString: getCurrentTimeString(),
        details: newResolution.signatureWorkflow?.source === 'MEETING'
          ? `صورت‌جلسه رسمی برای ${newResolution.signatureWorkflow.mode === 'PARALLEL' ? 'امضای همزمان' : 'امضای ترتیبی'} ${newResolution.signatureWorkflow.steps.map((step) => step.signerName).join('، ')} (گردش اختصاصی جلسه) ایجاد گردید.`
          : 'صورت‌جلسه رسمی برای امضای ترتیبی مسئول دفتر، مدیرعامل و ادمین ایجاد گردید.',
        badgeColor: 'blue',
      });
    }

    this.persist();

    return apiClient.simulateNetwork(newResolution, 200);
  }

  public async signResolution(resolutionId: string, signerUserId: string): Promise<ApiResponse<Resolution>> {
    const resolution = this.resolutions.find((item) => item.id === resolutionId);
    if (!resolution?.signatureWorkflow) throw new Error('صورت‌جلسه امضای مصوبه یافت نشد');
    if (resolution.signatureWorkflow.status === 'COMPLETED') throw new Error('تمام امضاهای این مصوبه قبلاً تکمیل شده است');

    const workflow = resolution.signatureWorkflow;
    const isParallel = workflow.mode === 'PARALLEL';
    // ترتیبی: فقط مرحله جاری. موازی: هر مرحله باز که این کاربر (یا جانشین
    // فعالش) امضاکننده آن است. بررسی در همین Service Layer انجام می‌شود.
    const currentStep = isParallel
      ? workflow.steps.find((step) => step.status === 'PENDING' && resolveSigningAuthority(step.signerUserId, signerUserId).allowed)
      : workflow.steps[workflow.currentStepIndex];
    const currentIndex = currentStep ? workflow.steps.indexOf(currentStep) : -1;
    if (!currentStep || currentStep.status !== 'PENDING') throw new Error(isParallel ? 'امضای در انتظاری برای این کاربر وجود ندارد' : 'مرحله فعالی برای امضا وجود ندارد');
    const authority = resolveSigningAuthority(currentStep.signerUserId, signerUserId);
    if (!authority.allowed) throw new Error('نوبت امضای این کاربر نیست');

    const users = loadLocalCollection('users', mockUsers);
    const actualSigner = users.find((user) => user.id === signerUserId);

    const now = new Date();
    currentStep.status = 'SIGNED';
    currentStep.signedAt = now.toISOString();
    currentStep.signedDateJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[\u200e\u200f]/g, '');
    currentStep.signedTimeString = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    // Audit Trail: امضاکننده تعیین‌شده (signerUserId) دست‌نخورده می‌ماند و
    // جدا از آن ثبت می‌شود که واقعاً چه کسی امضا کرده است.
    currentStep.actualSignerUserId = signerUserId;
    currentStep.actualSignerName = actualSigner?.fullName || currentStep.signerName;
    currentStep.actualSignerTitle = actualSigner?.title || currentStep.signerTitle;
    currentStep.signedAsDelegate = authority.asDelegate;
    if (authority.asDelegate) {
      currentStep.delegateForUserId = currentStep.signerUserId;
      currentStep.delegateForName = currentStep.signerName;
    }

    // Snapshot تصویر امضای کسی که واقعاً امضا کرد — در امضای مستقیم همان
    // امضاکننده تعیین‌شده است و رفتار قبلی تغییری نمی‌کند؛ در امضای جانشینی
    // سند باید امضای شخص جانشین را نشان دهد، نه شخص اصلی.
    const signerRecord = users.find((user) => user.id === signerUserId);
    currentStep.signatureImageUrl = resolveSignatureImageUrl(signerRecord?.signatureUrl);
    // امضای رمزنگاری‌شده واقعی با کلید همان کسی که امضا کرد.
    try { currentStep.cryptoSignature = await signContent(signerUserId, canonicalResolutionContent(resolution)); } catch { /* مرورگر بدون Web Crypto */ }

    this.activityLogs.unshift({
      id: `log-${Date.now()}`,
      targetType: 'RESOLUTION',
      targetId: resolution.id,
      action: authority.asDelegate
        ? `${currentStep.actualSignerTitle} صورت‌جلسه مصوبه را به جانشینی از ${currentStep.signerName} امضا کرد`
        : `${currentStep.signerTitle} صورت‌جلسه مصوبه را امضا کرد`,
      actorName: currentStep.actualSignerName,
      actorRole: currentStep.actualSignerTitle,
      timestampJalali: currentStep.signedDateJalali,
      timeString: currentStep.signedTimeString,
      details: authority.asDelegate
        ? `امضای مرحله ${currentStep.order} — امضاکننده تعیین‌شده: ${currentStep.signerName} | امضا توسط: ${currentStep.actualSignerName} (به جانشینی)`
        : `امضای دیجیتال Mock مرحله ${currentStep.order} با شناسه کاربر ${currentStep.signerUserId} ثبت شد.`,
      badgeColor: 'teal',
    });

    const remaining = workflow.steps.filter((step) => step.status !== 'SIGNED');
    const nextStep = isParallel ? remaining[0] : workflow.steps[currentIndex + 1];
    if (nextStep && workflow.source === 'MEETING') {
      // زنجیره اختصاصی جلسه: وضعیت عمومی «در انتظار امضا».
      if (!isParallel) {
        nextStep.status = 'PENDING';
        workflow.currentStepIndex = currentIndex + 1;
      } else {
        workflow.currentStepIndex = workflow.steps.indexOf(nextStep);
      }
      workflow.status = 'PENDING_SIGNATURES';
      resolution.executionStatus = 'PENDING_SIGNATURES';
    } else if (nextStep) {
      nextStep.status = 'PENDING';
      resolution.signatureWorkflow.currentStepIndex = currentIndex + 1;
      // ترتیب Sequential دست‌نخورده است؛ برچسب وضعیت از شماره مرحله مشتق
      // می‌شود تا با تغییر نقش امضاکننده توسط Admin هم درست بماند (برای
      // تنظیمات پیش‌فرض دقیقاً همان مقدار قبلی تولید می‌شود).
      resolution.signatureWorkflow.status = nextStep.order === 2 ? 'PENDING_CEO_SIGNATURE' : 'PENDING_ADMIN_SIGNATURE';
      resolution.executionStatus = resolution.signatureWorkflow.status;
    } else {
      resolution.signatureWorkflow.status = 'COMPLETED';
      // ابلاغ is now its own independent, explicitly-triggered step (see
      // notifyResolution) rather than something the old collective-minutes
      // signature chain used to gate — a resolution reaches «در انتظار
      // ابلاغ» the instant its three main signatures finish, full stop.
      resolution.executionStatus = 'WAITING_NOTIFICATION';
      this.activityLogs.unshift({
        id: `log-${Date.now()}-execution`,
        targetType: 'RESOLUTION',
        targetId: resolution.id,
        action: 'تکمیل امضاهای اصلی مصوبه و انتظار ابلاغ',
        actorName: currentStep.signerName,
        actorRole: currentStep.signerTitle,
        timestampJalali: currentStep.signedDateJalali,
        timeString: currentStep.signedTimeString,
        details: `${workflow.source === 'MEETING' ? 'همه امضاهای تعیین‌شده' : 'هر سه امضای اصلی'} مصوبه تکمیل شد؛ مصوبه در کارتابل ابلاغ مسئول دفتر منتظر است.`,
        badgeColor: 'blue',
      });
      this.notifyOfficeManagersReadyForNotification(resolution);
    }

    this.persist();
    return apiClient.simulateNetwork(resolution, 160);
  }

  /**
   * Appends one entry to the shared resolution timeline. Exposed so sibling
   * services (e.g. followUpService) record history through this service's own
   * in-memory log array instead of writing the activityLogs collection behind
   * its back, which a later persist() would silently overwrite.
   */
  public appendResolutionTimelineEntry(entry: ActivityLog): void {
    this.activityLogs.unshift(entry);
    this.persist();
  }

  /**
   * Files a resolution into the archive. The working status is preserved in
   * `previousExecutionStatus` so restoring is exact — nothing about the
   * signature, ابلاغ, execution, verification or follow-up workflows changes.
   */
  public async setResolutionArchiveState(resolutionId: string, state: Omit<ResolutionArchiveState, 'previousExecutionStatus' | 'archivedAt' | 'archivedDateJalali'>): Promise<ApiResponse<Resolution>> {
    const resolution = this.resolutions.find((item) => item.id === resolutionId);
    if (!resolution) throw new Error('مصوبه یافت نشد');
    if (resolution.archive) throw new Error('این مصوبه از قبل بایگانی شده است.');

    const now = new Date();
    const dateJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[\u200e\u200f]/g, '');
    resolution.archive = {
      ...state,
      archivedAt: now.toISOString(),
      archivedDateJalali: dateJalali,
      previousExecutionStatus: resolution.executionStatus,
    };
    resolution.executionStatus = 'ARCHIVED';

    this.activityLogs.unshift({
      id: `log-archive-${resolutionId}-${now.getTime()}`,
      targetType: 'RESOLUTION',
      targetId: resolutionId,
      action: 'بایگانی مصوبه',
      actorName: state.archivedByName,
      actorRole: state.scope === 'ORGANIZATION' ? 'بایگانی سازمانی' : 'بایگانی شخصی',
      timestampJalali: dateJalali,
      timeString: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      details: state.scope === 'ORGANIZATION'
        ? `بایگانی سازمانی — پوشه «${state.folderName || '—'}» | وضعیت پیش از بایگانی: ${resolution.archive.previousExecutionStatus}`
        : `بایگانی شخصی | وضعیت پیش از بایگانی: ${resolution.archive.previousExecutionStatus}`,
      badgeColor: 'purple',
    });
    this.persist();
    return apiClient.simulateNetwork(resolution, 120);
  }

  /**
   * Takes a resolution back out of the archive — «حذف از بایگانی». This is a
   * restore, never a delete: the entity, its attachments and its whole
   * timeline stay exactly as they are, and the pre-archive working status is
   * put back rather than reset.
   */
  public async clearResolutionArchiveState(resolutionId: string, actorName: string): Promise<ApiResponse<Resolution>> {
    const resolution = this.resolutions.find((item) => item.id === resolutionId);
    if (!resolution) throw new Error('مصوبه یافت نشد');
    if (!resolution.archive) throw new Error('این مصوبه در بایگانی نیست.');

    const now = new Date();
    const dateJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[\u200e\u200f]/g, '');
    const restoredStatus = resolution.archive.previousExecutionStatus;
    resolution.executionStatus = restoredStatus;
    delete resolution.archive;

    this.activityLogs.unshift({
      id: `log-unarchive-${resolutionId}-${now.getTime()}`,
      targetType: 'RESOLUTION',
      targetId: resolutionId,
      action: 'خروج مصوبه از بایگانی',
      actorName,
      actorRole: 'بایگانی',
      timestampJalali: dateJalali,
      timeString: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      details: `مصوبه به فهرست مصوبات بازگشت؛ وضعیت بازگردانده‌شده: ${restoredStatus}`,
      badgeColor: 'green',
    });
    this.persist();
    return apiClient.simulateNetwork(resolution, 120);
  }

  public async updateResolution(id: string, dto: Partial<Resolution>): Promise<ApiResponse<Resolution>> {
    const index = this.resolutions.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error('مصوبه یافت نشد');
    }
    this.resolutions[index] = { ...this.resolutions[index], ...dto };
    this.persist();
    return apiClient.simulateNetwork(this.resolutions[index], 150);
  }

  public async updateExecutionProgress(resolutionId: string, report: ResolutionProgressReport): Promise<ApiResponse<Resolution>> {
    const resolution = this.resolutions.find((item) => item.id === resolutionId);
    if (!resolution) throw new Error('مصوبه یافت نشد');
    if (resolution.signatureWorkflow && resolution.signatureWorkflow.status !== 'COMPLETED') throw new Error('ثبت پیشرفت پیش از تکمیل امضاهای مصوبه مجاز نیست');
    if (['APPROVED_CLOSED', 'PENDING_APPROVAL'].includes(resolution.executionStatus)) throw new Error('برای مصوبه خاتمه‌یافته یا در حال صحه‌گذاری نمی‌توان گزارش پیشرفت ثبت کرد');
    resolution.executionStartDateJalali = resolution.executionStartDateJalali || report.reportDateJalali;
    resolution.progressPercent = report.progressPercent;
    resolution.lastAction = report.actionDescription;
    resolution.obstacles = report.obstacles;
    resolution.progressReports = [...(resolution.progressReports || []), report];
    resolution.executionStatus = report.status;
    if (report.attachments.length > 0) resolution.attachments = [...resolution.attachments, ...report.attachments];
    this.activityLogs.unshift({
      id: `log-progress-${Date.now()}`,
      targetType: 'RESOLUTION',
      targetId: resolution.id,
      action: `ثبت گزارش پیشرفت ${report.progressPercent} درصدی`,
      actorName: report.reporterName,
      actorRole: 'مسئول اجرای مصوبه',
      timestampJalali: report.reportDateJalali,
      timeString: report.reportTimeString,
      details: `${report.actionDescription}${report.obstacles ? ` | موانع: ${report.obstacles}` : ''}`,
      badgeColor: report.status === 'OVERDUE' ? 'red' : report.status === 'NEEDS_FOLLOW_UP' ? 'amber' : 'blue',
    });
    this.persist();
    return apiClient.simulateNetwork(resolution, 140);
  }

  public async markMeetingMinutesFinalized(meetingId: string): Promise<ApiResponse<number>> {
    const eligible = this.resolutions.filter((item) => item.meetingId === meetingId && item.signatureWorkflow?.status === 'COMPLETED' && item.executionStatus === 'WAITING_MINUTES_SIGNATURE');
    eligible.forEach((resolution) => {
      resolution.executionStatus = 'WAITING_NOTIFICATION';
      this.activityLogs.unshift({ id: `log-minutes-${resolution.id}-${Date.now()}`, targetType: 'RESOLUTION', targetId: resolution.id, action: 'نهایی‌شدن صورت‌جلسه تجمیعی', actorName: 'دبیرخانه هیأت‌مدیره', actorRole: 'دبیرخانه', timestampJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()).replace(/[\u200e\u200f]/g, ''), timeString: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }), details: 'مصوبه آماده تهیه و ارسال ابلاغیه رسمی شد.', badgeColor: 'purple' });
    });
    this.persist();
    return apiClient.simulateNetwork(eligible.length, 100);
  }

  public async releaseMeetingResolutionsForExecution(meetingId: string): Promise<ApiResponse<number>> {
    const eligible = this.resolutions.filter((item) => item.meetingId === meetingId && item.executionStatus === 'WAITING_NOTIFICATION');
    eligible.forEach((resolution) => {
      // مسیر صدور گروهی ابلاغیه از صورت‌جلسه هم مثل مسیر تکی، مصوبه را
      // مستقیم وارد اجرا نمی‌کند: ابتدا باید دبیر جلسه ابلاغیه را امضا کند.
      resolution.executionStatus = 'PENDING_SECRETARY_NOTICE_SIGNATURE';
      this.activityLogs.unshift({ id: `log-notice-${resolution.id}-${Date.now()}`, targetType: 'RESOLUTION', targetId: resolution.id, action: 'ابلاغ رسمی مصوبه', actorName: 'دبیرخانه هیأت‌مدیره', actorRole: 'دبیرخانه', timestampJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()).replace(/[\u200e\u200f]/g, ''), timeString: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }), details: `ابلاغیه صادر شد و برای امضا به کارتابل دبیر جلسه رفت.`, badgeColor: 'teal' });
    });
    this.persist();
    return apiClient.simulateNetwork(eligible.length, 120);
  }

  // Notifies every user currently holding NOTIFY_RESOLUTION (the office
  // manager persona) that a resolution just reached «در انتظار ابلاغ» —
  // mirrors the same notifications collection AppContext/proposalService
  // already write to, so it shows up in the same bell without a new
  // notification system.
  private notifyOfficeManagersReadyForNotification(resolution: Resolution) {
    const users = loadLocalCollection('users', mockUsers);
    const recipients = users.filter((user) => user.role !== 'ADMIN' && (user.permissions || []).includes('NOTIFY_RESOLUTION'));
    if (recipients.length === 0) return;
    const now = new Date();
    const dateJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[‎‏]/g, '');
    const timeString = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const notifications = loadLocalCollection('notifications', mockNotifications);
    const newOnes: AppNotification[] = recipients.map((user) => ({
      id: `notif-notify-resolution-${Date.now()}-${user.id}`,
      recipientUserId: user.id,
      title: 'آماده ابلاغ',
      message: `مصوبه شماره «${resolution.resolutionNumber}» (${resolution.topicTitle}) آماده ابلاغ است.`,
      dateJalali,
      timeString,
      isRead: false,
      type: 'APPROVAL_REQUEST',
      targetRoute: 'notification-inbox',
    }));
    saveLocalCollection('notifications', [...newOnes, ...notifications]);
  }

  public async notifyResolution(resolutionId: string, actor: User): Promise<ApiResponse<Resolution>> {
    // Permission-gated, not role-hardcoded — any role granted
    // NOTIFY_RESOLUTION later can act here too. ADMIN keeps its usual
    // implicit-superuser access, matching every other permission check
    // across the app.
    const canNotify = actor.role === 'ADMIN' || (actor.permissions || []).includes('NOTIFY_RESOLUTION');
    if (!canNotify) throw new Error('شما مجاز به ثبت ابلاغ این مصوبه نیستید.');

    const resolution = this.resolutions.find((item) => item.id === resolutionId);
    if (!resolution) throw new Error('مصوبه یافت نشد');
    if (resolution.executionStatus !== 'WAITING_NOTIFICATION') throw new Error('این مصوبه در کارتابل ابلاغ نیست.');

    // تاریخ/ساعت/کاربر ابلاغ خودکار از DateTime واقعی سیستم ثبت می‌شوند —
    // هیچ تاریخی از کاربر گرفته نمی‌شود. مبنای ذخیره‌سازی notifiedAt
    // (ISO DateTime) است و رشته شمسی فقط برای نمایش نگهداری می‌شود.
    const now = new Date();
    const dateJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[‎‏]/g, '');
    const timeString = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    resolution.notifiedAt = now.toISOString();
    resolution.notifiedDateJalali = dateJalali;
    resolution.notifiedTimeString = timeString;
    resolution.notifiedByUserId = actor.id;
    resolution.notifiedByName = actor.fullName;
    // ابلاغ، مصوبه را وارد اجرا نمی‌کند. ابتدا باید دبیر جلسه ابلاغیه را
    // واقعاً امضا کند (signNotificationLetter).
    resolution.executionStatus = 'PENDING_SECRETARY_NOTICE_SIGNATURE';

    const meetings = loadLocalCollection('meetings', mockMeetings);
    const meeting = meetings.find((item) => item.id === resolution.meetingId);
    const notices = loadLocalCollection<ResolutionNotice[]>('resolutionNotices', []);
    // دبیر جلسه فقط به‌عنوان «امضاکننده موردانتظار» ثبت می‌شود؛ رکورد امضا
    // (secretarySignature) عمداً اینجا ساخته نمی‌شود، چون هنوز امضایی انجام
    // نشده است و PDF نباید امضای جعلی/زودهنگام نشان دهد.
    // گردش کار پویا: امضاکننده ابلاغیه ممکن است برای همین جلسه مشخص شده باشد.
    const overrideSigner = meeting?.workflow?.noticeSignerUserId
      ? loadLocalCollection('users', mockUsers).find((user) => user.id === meeting.workflow!.noticeSignerUserId)
      : undefined;
    const noticeSigner = overrideSigner
      ? { userId: overrideSigner.id, name: overrideSigner.fullName, title: overrideSigner.title }
      : resolveStageSigner('RESOLUTION_NOTICE', { meeting });
    const recipientName = resolution.mainResponsibleName || resolution.proposerName;
    const recipientDepartment = resolution.responsibleDepartmentName || resolution.proposerDepartment;
    // Reserved only now — every validation above has already passed, so an
    // abandoned or rejected ابلاغ never consumes a letter number.
    const notificationLetterNumber = issueNotificationLetterNumber();
    const notice: ResolutionNotice = {
      id: `notice-${Date.now()}`,
      noticeNumber: `ابلاغ-${now.getFullYear()}-${notices.length + 1}`,
      notificationLetterNumber,
      resolutionId: resolution.id,
      resolutionNumber: resolution.resolutionNumber,
      meetingId: resolution.meetingId,
      dateJalali,
      recipientName,
      recipientDepartment,
      text: `مصوبه «${resolution.topicTitle}» طی این سند در تاریخ ${dateJalali} ابلاغ رسمی گردید.`,
      deadlineJalali: resolution.deadlineJalali,
      attachmentIds: resolution.attachments.map((attachment) => attachment.id),
      status: 'SENT',
      sentAt: now.toISOString(),
      createdByUserId: actor.id,
      // امضاکننده ابلاغیه در همین لحظه از «تنظیمات گردش امضا» Resolve و روی
      // خود ابلاغیه Snapshot می‌شود؛ تغییر بعدی تنظیمات، ابلاغیه‌های صادرشده
      // را جابه‌جا نمی‌کند. پیش‌فرض تنظیمات همان دبیر جلسهِ جلسه است.
      secretaryUserId: noticeSigner?.userId || meeting?.secretaryId,
      secretaryName: noticeSigner?.name || meeting?.secretaryName,
      // بدون امضا صادر می‌شود؛ با امضای واقعی دبیر جلسه پر خواهد شد.
      secretarySignature: undefined,
    };
    saveLocalCollection('resolutionNotices', [notice, ...notices]);
    // Mirrored onto the resolution so lists and reports can show the letter
    // number without joining the notices collection.
    resolution.notificationLetterNumber = notificationLetterNumber;

    this.activityLogs.unshift({
      id: `log-notify-${resolution.id}-${Date.now()}`,
      targetType: 'RESOLUTION',
      targetId: resolution.id,
      action: 'مصوبه ابلاغ شد',
      actorName: actor.fullName,
      actorRole: actor.title,
      timestampJalali: dateJalali,
      timeString,
      details: `ابلاغ توسط ${actor.fullName} در تاریخ ${dateJalali} ساعت ${timeString} | شماره نامه ابلاغیه: ${notificationLetterNumber}${noticeSigner?.name || meeting?.secretaryName ? ` | در انتظار امضای: ${noticeSigner?.name || meeting?.secretaryName}` : ''}`,
      badgeColor: 'teal',
    });

    // عمداً startExecution صدا زده نمی‌شود — اجرا فقط پس از امضای دبیر جلسه.
    this.persist();
    return apiClient.simulateNetwork(resolution, 140);
  }

  /**
   * از میان مصوباتِ «در انتظار امضای دبیر جلسه»، فقط آنهایی که همین کاربر
   * دبیر جلسه‌شان است. همان قاعده‌ای که signNotificationLetter هم Enforce
   * می‌کند، تا کارتابل و مجوز اقدام از یک منبع تصمیم بگیرند.
   */
  public async filterNoticesAwaitingSignatureBy(resolutions: Resolution[], actor: User): Promise<Resolution[]> {
    if (actor.role === 'ADMIN') return resolutions;
    const notices = loadLocalCollection<ResolutionNotice[]>('resolutionNotices', []);
    const meetings = loadLocalCollection('meetings', mockMeetings);
    return resolutions.filter((resolution) => {
      const notice = notices.find((item) => item.resolutionId === resolution.id);
      const meeting = meetings.find((item) => item.id === resolution.meetingId);
      const expectedSignerId = notice?.secretaryUserId || meeting?.secretaryId;
      if (!expectedSignerId) return false;
      // امضاکننده تعیین‌شده، یا جانشین فعال او — همان قاعده‌ای که
      // signNotificationLetter هم Enforce می‌کند.
      return resolveSigningAuthority(expectedSignerId, actor.id).allowed;
    });
  }

  /**
   * امضای واقعی دبیر جلسه روی ابلاغیه — مرحله بین «ابلاغ» و «شروع اجرا».
   * تنها دبیر جلسهِ همان جلسه (یا ADMIN) مجاز است. پس از امضای موفق:
   * رکورد امضا با signerUserId/signedAt و Context ابلاغ ثبت می‌شود، تصویر
   * امضا از امضای مرکزی همان کاربر خوانده و Snapshot می‌شود، و تازه آنگاه
   * Workflow اجرای موجود شروع می‌شود.
   * این امضا مربوط به «ابلاغیه» است و امضای چهارمِ سه امضای اصلی مصوبه
   * محسوب نمی‌شود (signatureWorkflow اصلاً لمس نمی‌شود).
   */
  public async signNotificationLetter(resolutionId: string, actor: User): Promise<ApiResponse<Resolution>> {
    const resolution = this.resolutions.find((item) => item.id === resolutionId);
    if (!resolution) throw new Error('مصوبه یافت نشد');
    if (resolution.executionStatus !== 'PENDING_SECRETARY_NOTICE_SIGNATURE') {
      throw new Error('این ابلاغیه در کارتابل امضای دبیر جلسه نیست.');
    }

    const notices = loadLocalCollection<ResolutionNotice[]>('resolutionNotices', []);
    const notice = notices.find((item) => item.resolutionId === resolution.id);
    if (!notice) throw new Error('ابلاغیه این مصوبه یافت نشد.');

    const meetings = loadLocalCollection('meetings', mockMeetings);
    const meeting = meetings.find((item) => item.id === resolution.meetingId);
    // امضاکننده موردانتظار: دبیر جلسهِ همان جلسه. اگر جلسه‌ای دبیر ثبت‌شده
    // نداشته باشد، مصوبه نباید برای همیشه پشت این مرحله بماند — در آن حالت
    // مدیر سیستم می‌تواند با هویت خودش امضا کند و بن‌بست را باز کند.
    // امضاکننده تعیین‌شده این ابلاغیه در لحظه ثبت ابلاغ Snapshot شده است
    // (notice.secretaryUserId). اگر رکورد قدیمی این Snapshot را نداشته
    // باشد، به رفتار تاریخی یعنی دبیر جلسهِ همان جلسه برمی‌گردیم.
    const expectedSignerId = notice.secretaryUserId || meeting?.secretaryId;
    const isAdmin = actor.role === 'ADMIN';
    if (!expectedSignerId && !isAdmin) {
      throw new Error('امضاکننده این ابلاغیه تعیین نشده است.');
    }
    // امضاکننده تعیین‌شده، یا جانشین فعال او — Enforce در Service Layer.
    const authority = expectedSignerId
      ? resolveSigningAuthority(expectedSignerId, actor.id)
      : { allowed: false, asDelegate: false };
    if (!authority.allowed && !isAdmin) {
      throw new Error('فقط امضاکننده تعیین‌شده این ابلاغیه یا جانشین فعال او مجاز به امضا است.');
    }
    const assignedSignerId = expectedSignerId || actor.id;
    const actualSignerId = actor.id;
    const signedAsDelegate = authority.asDelegate;

    const now = new Date();
    const dateJalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[‎‏]/g, '');
    const timeString = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    // تصویر امضا از منبع مرکزی امضای همان کاربر (مدیریت‌شده توسط Admin)
    // خوانده و همین‌جا Snapshot می‌شود تا تعویض بعدی امضا، اسناد امضاشده
    // قبلی را تغییر ندهد. در امضای جانشینی، تصویر امضای شخصی که واقعاً
    // امضا کرده روی سند می‌نشیند، نه شخص اصلی.
    const users = loadLocalCollection('users', mockUsers);
    const assignedUser = users.find((user) => user.id === assignedSignerId);
    const actualUser = users.find((user) => user.id === actualSignerId);
    const assignedName = assignedUser?.fullName || notice.secretaryName || meeting?.secretaryName || 'دبیر جلسه';
    const assignedTitle = assignedUser?.title || 'دبیر جلسه';
    notice.secretarySignature = {
      signerUserId: assignedSignerId,
      signerName: assignedName,
      signerTitle: assignedTitle,
      context: 'RESOLUTION_NOTIFICATION',
      signedAt: now.toISOString(),
      signedDateJalali: dateJalali,
      signedTimeString: timeString,
      signatureImageUrl: resolveSignatureImageUrl(actualUser?.signatureUrl),
      actualSignerUserId: actualSignerId,
      actualSignerName: actualUser?.fullName || assignedName,
      actualSignerTitle: actualUser?.title || assignedTitle,
      signedAsDelegate,
      ...(signedAsDelegate ? { delegateForUserId: assignedSignerId, delegateForName: assignedName } : {}),
    };
    try { notice.secretarySignature.cryptoSignature = await signContent(actualSignerId, canonicalNoticeContent(notice)); } catch { /* مرورگر بدون Web Crypto */ }
    saveLocalCollection('resolutionNotices', notices);

    resolution.executionStatus = 'NOTIFIED';
    this.activityLogs.unshift({
      id: `log-notice-sign-${resolution.id}-${Date.now()}`,
      targetType: 'RESOLUTION',
      targetId: resolution.id,
      action: signedAsDelegate
        ? `امضای ابلاغیه به جانشینی از ${assignedName}`
        : 'امضای ابلاغیه توسط دبیر جلسه',
      actorName: notice.secretarySignature.actualSignerName || assignedName,
      actorRole: notice.secretarySignature.actualSignerTitle || assignedTitle,
      timestampJalali: dateJalali,
      timeString,
      details: signedAsDelegate
        ? `ابلاغیه ${notice.notificationLetterNumber || notice.noticeNumber} — امضاکننده تعیین‌شده: ${assignedName} | امضا توسط: ${notice.secretarySignature.actualSignerName} (به جانشینی) در تاریخ ${dateJalali} ساعت ${timeString}. مصوبه وارد فاز اجرا شد.`
        : `ابلاغیه ${notice.notificationLetterNumber || notice.noticeNumber} توسط ${notice.secretarySignature.signerName} در تاریخ ${dateJalali} ساعت ${timeString} امضا شد و مصوبه وارد فاز اجرا گردید.`,
      badgeColor: 'purple',
    });

    // تازه حالا Workflow اجرای موجود شروع می‌شود.
    this.startExecution(resolution);
    this.persist();
    return apiClient.simulateNetwork(resolution, 140);
  }

  public async deleteResolution(id: string): Promise<ApiResponse<boolean>> {
    const resolution = this.resolutions.find((item) => item.id === id);
    if (!resolution) return apiClient.simulateNetwork(false, 150);
    const previousStatus = resolution.executionStatus;
    resolution.executionStatus = 'ARCHIVED';
    this.activityLogs.unshift({ id: `log-archive-${id}-${Date.now()}`, targetType: 'RESOLUTION', targetId: id, action: 'بایگانی مصوبه بدون حذف اطلاعات', actorName: 'سامانه', actorRole: 'سیستم', timestampJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()).replace(/[\u200e\u200f]/g, ''), timeString: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }), details: `وضعیت قبلی: ${previousStatus}`, badgeColor: 'purple' });
    this.persist();
    return apiClient.simulateNetwork(true, 150);
  }

  public async getResolutionActivityLogs(resolutionId: string): Promise<ApiResponse<ActivityLog[]>> {
    const logs = this.activityLogs.filter((l) => l.targetId === resolutionId);
    return apiClient.simulateNetwork(logs, 100);
  }

  /**
   * Complete Task by Assignee
   * If verification is required -> state moves to PENDING_APPROVAL and enters Approver's cartable.
   * If NOT required -> state moves directly to APPROVED_CLOSED!
   */
  public async completeResolutionTask(resolutionId: string, completionNotes: string, attachments?: Resolution['attachments']): Promise<ApiResponse<Resolution>> {
    const resIndex = this.resolutions.findIndex((r) => r.id === resolutionId);
    if (resIndex === -1) throw new Error('مصوبه یافت نشد');

    const res = this.resolutions[resIndex];
    if (res.signatureWorkflow && res.signatureWorkflow.status !== 'COMPLETED') {
      throw new Error('تا پیش از تکمیل هر سه امضا، فرآیند اجرای مصوبه قابل شروع یا تکمیل نیست');
    }
    const requiresVerif = res.verificationConfig?.requiresVerification && res.verificationConfig.steps.length > 0;

    res.completionNotes = completionNotes;
    res.completionDateJalali = getCurrentJalaliDate();
    if (attachments && attachments.length > 0) {
      res.attachments = [...res.attachments, ...attachments];
    }

    if (requiresVerif) {
      res.executionStatus = 'PENDING_APPROVAL';
      res.verificationConfig.currentStepIndex = 0;
      
      // Update/add to mockApprovals
      const firstStep = res.verificationConfig.steps[0];
      const approvals = loadLocalCollection('approvals', mockApprovals);
      approvals.unshift({
        id: `appr-${Date.now()}`,
        resolutionId: res.id,
        resolutionNumber: res.resolutionNumber,
        resolutionTitle: res.topicTitle,
        meetingTitle: res.meetingTitle,
        responsibleName: res.mainResponsibleName || 'مسئول اجرا',
        responsibleDepartment: res.responsibleDepartmentName || 'واحد اجرایی',
        completedDateJalali: getCurrentJalaliDate(),
        submittedForApprovalDateJalali: getCurrentJalaliDate(),
        stepNumber: 1,
        totalSteps: res.verificationConfig.steps.length,
        stepTitle: `صحه‌گذاری توسط ${firstStep.approverName}`,
        assignedApproverId: firstStep.approverId,
        status: 'PENDING',
        completionReport: completionNotes,
        attachments: res.attachments,
      });
      saveLocalCollection('approvals', approvals);

      this.activityLogs.unshift({
        id: `log-${Date.now()}`,
        targetType: 'RESOLUTION',
        targetId: res.id,
        action: 'اعلام اتمام وظیفه و ارسال جهت صحه‌گذاری',
        actorName: res.mainResponsibleName || 'مسئول اجرا',
        actorRole: 'مجری مصوبه',
        timestampJalali: getCurrentJalaliDate(),
        timeString: getCurrentTimeString(),
        details: `گزارش تکمیل ثبت و به کارتابل ${firstStep.approverName} جهت صحه‌گذاری ارسال شد.`,
        badgeColor: 'purple',
      });
    } else {
      res.executionStatus = 'APPROVED_CLOSED';
      // The resolution is genuinely finished here (no verification stands
      // between it and closure) — keep progressPercent in sync with that
      // real terminal state instead of leaving it at whatever the last
      // progress report said (or undefined/0 if none was ever submitted).
      res.progressPercent = 100;
      this.activityLogs.unshift({
        id: `log-${Date.now()}`,
        targetType: 'RESOLUTION',
        targetId: res.id,
        action: 'اتمام وظیفه و خاتمه مستقیم مصوبه',
        actorName: res.mainResponsibleName || 'مسئول اجرا',
        actorRole: 'مجری مصوبه',
        timestampJalali: getCurrentJalaliDate(),
        timeString: getCurrentTimeString(),
        details: 'به دلیل عدم نیاز به صحه‌گذاری، مصوبه مستقیماً به وضعیت خاتمه یافته تغییر یافت.',
        badgeColor: 'teal',
      });
    }

    // Also update corresponding task status
    const tasks = loadLocalCollection('tasks', mockTasks);
    const task = tasks.find((t) => t.resolutionId === resolutionId);
    if (task) {
      task.status = requiresVerif ? 'PENDING_APPROVAL' : 'CLOSED';
      task.completionNotes = completionNotes;
      task.completionDateJalali = getCurrentJalaliDate();
      if (!requiresVerif) task.progressPercent = 100;
      saveLocalCollection('tasks', tasks);
    }

    this.persist();

    return apiClient.simulateNetwork(res, 200);
  }

  /**
   * Single approver approves the resolution's one verification step -> resolution closes immediately.
   */
  public async approveVerificationStep(resolutionId: string, stepNumber: number, comments: string, approverName: string): Promise<ApiResponse<Resolution>> {
    const res = this.resolutions.find((r) => r.id === resolutionId);
    if (!res) throw new Error('مصوبه یافت نشد');

    const stepIndex = res.verificationConfig.steps.findIndex((s) => s.stepNumber === stepNumber);
    if (stepIndex !== -1) {
      res.verificationConfig.steps[stepIndex].status = 'APPROVED';
      res.verificationConfig.steps[stepIndex].comments = comments;
      res.verificationConfig.steps[stepIndex].actionDateJalali = getCurrentJalaliDate();
      res.verificationConfig.steps[stepIndex].actionTime = '۱۶:۲۰';
    }

    res.executionStatus = 'APPROVED_CLOSED';
    // Final sign-off closes the resolution for real — sync progress to 100%
    // so it can never show "Completed" alongside a stale/zero percentage.
    res.progressPercent = 100;
    this.activityLogs.unshift({
      id: `log-${Date.now()}`,
      targetType: 'RESOLUTION',
      targetId: res.id,
      action: 'تایید نهایی صحه‌گذاری و مختومه شدن مصوبه',
      actorName: approverName,
      actorRole: 'تاییدکننده نهایی',
      timestampJalali: getCurrentJalaliDate(),
      timeString: getCurrentTimeString(),
      details: `با نظر: "${comments}" تایید شد و مصوبه رسماً خاتمه یافت.`,
      badgeColor: 'teal',
    });

    const approvals = loadLocalCollection('approvals', mockApprovals);
    const currentApproval = approvals.find((item) => item.resolutionId === resolutionId && item.stepNumber === stepNumber);
    if (currentApproval) currentApproval.status = 'APPROVED';
    saveLocalCollection('approvals', approvals);

    // Update task
    const tasks = loadLocalCollection('tasks', mockTasks);
    const task = tasks.find((t) => t.resolutionId === resolutionId);
    if (task) {
      task.status = 'CLOSED';
      task.progressPercent = 100;
      saveLocalCollection('tasks', tasks);
    }

    this.persist();

    return apiClient.simulateNetwork(res, 200);
  }

  /**
   * Approver rejects the verification step -> status returns to responsible user for rework
   */
  public async rejectVerificationStep(resolutionId: string, stepNumber: number, rejectionReason: string, approverName: string): Promise<ApiResponse<Resolution>> {
    const res = this.resolutions.find((r) => r.id === resolutionId);
    if (!res) throw new Error('مصوبه یافت نشد');

    const stepIndex = res.verificationConfig.steps.findIndex((s) => s.stepNumber === stepNumber);
    if (stepIndex !== -1) {
      res.verificationConfig.steps[stepIndex].status = 'REJECTED';
      res.verificationConfig.steps[stepIndex].comments = rejectionReason;
      res.verificationConfig.steps[stepIndex].actionDateJalali = getCurrentJalaliDate();
    }

    res.executionStatus = 'REJECTED_RETURNED';

    this.activityLogs.unshift({
      id: `log-${Date.now()}`,
      targetType: 'RESOLUTION',
      targetId: res.id,
      action: 'عدم تایید در صحه‌گذاری و برگشت به مجری',
      actorName: approverName,
      actorRole: 'تاییدکننده',
      timestampJalali: getCurrentJalaliDate(),
      timeString: getCurrentTimeString(),
      details: `علت بازگشت: ${rejectionReason}`,
      badgeColor: 'red',
    });

    const tasks = loadLocalCollection('tasks', mockTasks);
    const task = tasks.find((t) => t.resolutionId === resolutionId);
    if (task) {
      task.status = 'RETURNED';
      task.rejectionReason = rejectionReason;
      saveLocalCollection('tasks', tasks);
    }

    const approvals = loadLocalCollection('approvals', mockApprovals);
    const currentApproval = approvals.find((item) => item.resolutionId === resolutionId && item.stepNumber === stepNumber);
    if (currentApproval) currentApproval.status = 'REJECTED';
    saveLocalCollection('approvals', approvals);
    this.persist();

    return apiClient.simulateNetwork(res, 200);
  }
}

export const resolutionService: IResolutionService = new MockResolutionService();
