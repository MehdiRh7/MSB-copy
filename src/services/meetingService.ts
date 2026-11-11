import { Meeting, MeetingStatus, ApiResponse, ApiFilterParams, PagedResult, User, MeetingGuest, AgendaItem, MeetingOutcomeLetter, Proposal, DocumentSignature, MeetingWorkflowConfig } from '../types';
import { mockDepartments, mockMeetings, mockResolutions, mockUsers } from '../mock/data';
import { apiClient } from './api/apiClient';
import { resolveSignatureImageUrl } from '../utils/signatureImage';
import { loadLocalCollection, loadLocalValue, saveLocalCollection, saveLocalValue } from './localStore';
import { smsService } from './smsService';
import { scopeMeetingAgendaToUser } from './userScope';
import {
  buildDecision,
  evaluateApproval,
  getAgendaApprovalPolicy,
  getTemplateForMeetingType,
  meetingWorkflowParticipantIds,
  namesOf,
  resolveApprovalAuthority,
  workflowFromTemplate,
} from './workflowPolicyService';

/** آیا کاربر جزو تأییدکنندگان دستورکار این جلسه است؟ */
const isAgendaApprover = (meeting: Meeting, actor: User) => getAgendaApprovalPolicy(meeting).approverUserIds.includes(actor.id);

export interface CreateMeetingDto {
  title: string;
  type: Meeting['type'];
  dateJalali: string;
  startTime: string;
  endTime: string;
  location: string;
  organizerId: string;
  secretaryId: string;
  createdByUserId: string;
  createdByName: string;
  departmentId: string;
  description?: string;
  members: Meeting['members'];
  agendaItems: Meeting['agendaItems'];
  attachments: Meeting['attachments'];
  /** گردش کار اختصاصی این جلسه؛ نبود آن = قالب متناسب با نوع جلسه. */
  workflow?: MeetingWorkflowConfig;
}

export interface AppendToMeetingDto {
  // Built by the caller the same way CreateMeetingModal already builds
  // Meeting['members'] — this service only appends, it never resolves user
  // records itself.
  newMembers?: Meeting['members'];
  newAgendaItem?: AgendaItem;
}

export interface IMeetingService {
  getMeetings(params?: ApiFilterParams & { participantUserId?: string }): Promise<ApiResponse<PagedResult<Meeting>>>;
  getMeetingById(id: string, actor?: User): Promise<ApiResponse<Meeting | null>>;
  createMeeting(dto: CreateMeetingDto): Promise<ApiResponse<Meeting>>;
  updateMeeting(id: string, dto: Partial<Meeting>): Promise<ApiResponse<Meeting>>;
  deleteMeeting(id: string): Promise<ApiResponse<boolean>>;
  updateMeetingStatus(id: string, status: MeetingStatus): Promise<ApiResponse<Meeting>>;
  reorderAgenda(id: string, agendaItemIds: string[], actor: User): Promise<ApiResponse<Meeting>>;
  removeAgendaItem(id: string, agendaItemId: string, reason: string, actor: User): Promise<ApiResponse<Meeting>>;
  reviewAgenda(id: string, decision: 'APPROVE' | 'RETURN', notes: string, actor: User): Promise<ApiResponse<Meeting>>;
  submitAgenda(id: string, actor: User): Promise<ApiResponse<Meeting>>;
  endMeeting(id: string, actor: User): Promise<ApiResponse<Meeting>>;
  addGuest(id: string, guest: Omit<MeetingGuest, 'id' | 'invitationStatus'>, actor: User): Promise<ApiResponse<Meeting>>;
  sendInvitations(id: string, actor: User): Promise<ApiResponse<Meeting>>;
  markInvitationViewed(id: string, recipientId: string, actor: User): Promise<ApiResponse<Meeting>>;
  recordAgendaOutcome(id: string, agendaItemId: string, outcomeStatus: NonNullable<AgendaItem['outcomeStatus']>, notes: string, actor: User): Promise<ApiResponse<Meeting>>;
  getOutcomeLetters(meetingId: string): Promise<ApiResponse<MeetingOutcomeLetter[]>>;
  // Append-only: adds new invitees (existing platform users) and/or a new
  // agenda item to an already-created meeting, without touching anything
  // that already exists on it (see AppendToMeetingModal).
  appendToMeeting(id: string, additions: AppendToMeetingDto, actor: User): Promise<ApiResponse<Meeting>>;
}

class MockMeetingService implements IMeetingService {
  private getMeetingsData = () => {
    const meetings = loadLocalCollection('meetings', mockMeetings);
    // رکوردهای پیش از افزوده‌شدن «تأییدکنندهٔ دستورکار» نیز باید برای
    // مدیرعامل قابل مشاهده بمانند. این مهاجرت محلی فقط این نسبت دسترسی را
    // اضافه می‌کند و اعضا، دستورکار و تاریخچهٔ جلسه را تغییر نمی‌دهد.
    const ceoIds = loadLocalCollection('users', mockUsers)
      .filter((user) => user.role === 'CEO' && user.isActive)
      .map((user) => user.id);
    let changed = false;
    meetings.forEach((meeting) => {
      // نسخه‌های قدیمی فیلدِ سازنده نداشتند. نخستین رویداد ایجاد/ارسال
      // دستورکار نزدیک‌ترین دادهٔ قابل اتکا برای حفظ دسترسی همان کاربر است.
      if (!meeting.createdByUserId) {
        const creatorEvent = (meeting.history || []).find((entry) =>
          entry.action.includes('تهیه دستورکار') || entry.action.includes('ایجاد جلسه')
        );
        if (creatorEvent?.actorUserId) {
          meeting.createdByUserId = creatorEvent.actorUserId;
          meeting.createdByName = creatorEvent.actorName;
          changed = true;
        }
      }
      if (meeting.status === 'WAITING_FOR_CEO_APPROVAL' && !Array.isArray(meeting.agendaApproverUserIds)) {
        meeting.agendaApproverUserIds = ceoIds;
        changed = true;
      }
    });
    if (changed) saveLocalCollection('meetings', meetings);
    return meetings;
  };
  private saveMeetingsData = (meetings: Meeting[]) => saveLocalCollection('meetings', meetings);

  private addHistory(meeting: Meeting, actor: User, action: string, fromStatus: string, notes?: string) {
    const now = new Date();
    meeting.history = [...(meeting.history || []), {
      id: `meeting-history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.title,
      fromStatus,
      toStatus: meeting.status,
      dateJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[\u200e\u200f]/g, ''),
      timeString: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      notes,
    }];
    meeting.updatedAt = now.toISOString();
  }

  public async getMeetings(params?: ApiFilterParams & { participantUserId?: string }): Promise<ApiResponse<PagedResult<Meeting>>> {
    let filtered = this.getMeetingsData();
    const resolutions = loadLocalCollection('resolutions', mockResolutions);

    if (params?.participantUserId) {
      const scopedUser = loadLocalCollection('users', mockUsers).find((user) => user.id === params.participantUserId);
      // مسئول دفتر مدیرعامل، صاحب فرایند زمان‌بندی/ابلاغ است. او فقط جلسه‌های
      // فعال و برگزارشده را می‌بیند تا هم جلسه‌ای را که برای گردش مدیرعامل
      // آماده شده پیگیری کند و هم پس از برگزاری، مصوبات آن را ثبت نماید.
      // جلسهٔ لغوشده و آرشیو نامرتبط همچنان خارج از Scope او می‌ماند.
      const canCoordinateActiveMeetings = Boolean(scopedUser?.permissions?.includes('NOTIFY_RESOLUTION'));
      const activeCoordinationStatuses: MeetingStatus[] = [
        'AGENDA_PREPARATION', 'WAITING_FOR_CEO_APPROVAL', 'AGENDA_RETURNED',
        'READY_FOR_INVITATION', 'INVITATION_SENT', 'SCHEDULED', 'IN_PROGRESS', 'HELD',
      ];
      filtered = filtered.filter((meeting) =>
        meeting.organizerId === params.participantUserId ||
        meeting.secretaryId === params.participantUserId ||
        meeting.createdByUserId === params.participantUserId ||
        meeting.agendaApproverUserIds?.includes(params.participantUserId) ||
        meeting.members.some((member) => member.userId === params.participantUserId) ||
        meetingWorkflowParticipantIds(meeting).includes(params.participantUserId!) ||
        (canCoordinateActiveMeetings && activeCoordinationStatuses.includes(meeting.status))
      );
    }

    if (params?.searchTerm) {
      const term = params.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(term) ||
          m.meetingNumber.toLowerCase().includes(term) ||
          m.location.toLowerCase().includes(term) ||
          m.organizerName.toLowerCase().includes(term)
      );
    }

    if (params?.status && params.status !== 'ALL') {
      filtered = filtered.filter((m) => m.status === params.status);
    }

    if (params?.departmentId && params.departmentId !== 'ALL') {
      filtered = filtered.filter((m) => m.departmentId === params.departmentId);
    }

    // Refresh resolution count dynamically from mock resolutions
    filtered.forEach((m) => {
      m.resolutionsCount = resolutions.filter((r) => r.meetingId === m.id).length;
    });

    // Sort by date descending
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const pageIndex = params?.pageIndex || 1;
    const pageSize = params?.pageSize || 10;
    const totalCount = filtered.length;
    const startIndex = (pageIndex - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return apiClient.simulateNetwork<PagedResult<Meeting>>({
      items,
      totalCount,
      pageIndex,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    }, 150);
  }

  public async getMeetingById(id: string, actor?: User): Promise<ApiResponse<Meeting | null>> {
    const meeting = this.getMeetingsData().find((m) => m.id === id) || null;
    if (meeting) {
      const resolutions = loadLocalCollection('resolutions', mockResolutions);
      meeting.resolutionsCount = resolutions.filter((r) => r.meetingId === meeting.id).length;
    }
    // فیلتر «تایید جلسه»ها بر اساس افراد مرتبط، در خودِ Data Source — نه فقط
    // پنهان‌سازی در UI. کاربر عادی حتی با دستکاری State یا فراخوانی مستقیم
    // این متد هم بند غیرمرتبط را دریافت نمی‌کند. نقش‌های مدیریتی و Scope
    // فعلی دست‌نخورده می‌مانند (canSeeAllAgendaItems).
    const scoped = meeting ? scopeMeetingAgendaToUser(meeting, actor) : null;
    return apiClient.simulateNetwork(scoped, 120);
  }

  public async createMeeting(dto: CreateMeetingDto): Promise<ApiResponse<Meeting>> {
    const meetings = this.getMeetingsData();
    const nextNumber = meetings.length + 142;
    // مدیرعامل «تأییدکنندهٔ دستورکار» است، نه لزوماً عضو حاضر در جلسه.
    // بنابراین جدا از فهرست اعضا ذخیره می‌شود تا هم جلسه را ببیند و هم
    // اطلاعات حضور و دعوت‌شدگان دستکاری نشود.
    // گردش کار پویا: یا همان که سازنده جلسه انتخاب کرده، یا قالب متناسب با
    // نوع جلسه. قالب پیش‌فرض دقیقاً رفتار تاریخی است (مدیرعامل، یک نفر کافی).
    const workflow: MeetingWorkflowConfig = dto.workflow && dto.workflow.agendaApproval.approverUserIds.length > 0
      ? dto.workflow
      : workflowFromTemplate(getTemplateForMeetingType(dto.type));
    const agendaApproverUserIds = workflow.agendaApproval.approverUserIds;
    const newMeeting: Meeting = {
      id: `meet-${Date.now()}`,
      meetingNumber: `جلسه-۱۴۰۳-${nextNumber}`,
      title: dto.title,
      type: dto.type,
      dateJalali: dto.dateJalali,
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location,
      organizerId: dto.organizerId,
      organizerName: dto.members.find((m) => m.userId === dto.organizerId)?.fullName || 'برگزارکننده',
      secretaryId: dto.secretaryId,
      secretaryName: dto.members.find((m) => m.userId === dto.secretaryId)?.fullName || 'دبیر جلسه',
      createdByUserId: dto.createdByUserId,
      createdByName: dto.createdByName,
      agendaApproverUserIds,
      workflow,
      agendaDecisions: [],
      departmentId: dto.departmentId,
      departmentName: mockDepartments.find((department) => department.id === dto.departmentId)?.name || 'واحد برگزارکننده',
      status: 'WAITING_FOR_CEO_APPROVAL',
      description: dto.description || '',
      members: dto.members,
      agendaItems: dto.agendaItems || [],
      guests: [],
      invitations: [],
      resolutionsCount: 0,
      attachments: dto.attachments || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    };

    newMeeting.history = [{
      id: `meeting-history-${Date.now()}`,
      action: `تهیه دستورکار و ارسال برای تأیید ${namesOf(agendaApproverUserIds).join('، ') || 'مدیرعامل'}`,
      actorUserId: dto.createdByUserId,
      actorName: dto.createdByName,
      actorRole: 'سازندهٔ جلسه',
      toStatus: 'WAITING_FOR_CEO_APPROVAL',
      dateJalali: newMeeting.dateJalali,
      timeString: newMeeting.startTime,
    }];

    meetings.unshift(newMeeting);
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(newMeeting, 200);
  }

  public async updateMeeting(id: string, dto: Partial<Meeting>): Promise<ApiResponse<Meeting>> {
    const meetings = this.getMeetingsData();
    const index = meetings.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('جلسه یافت نشد');
    }
    meetings[index] = { ...meetings[index], ...dto, updatedAt: new Date().toISOString() };
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meetings[index], 150);
  }

  public async deleteMeeting(id: string): Promise<ApiResponse<boolean>> {
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) return apiClient.simulateNetwork(false, 150);
    const previousStatus = meeting.status;
    meeting.status = 'CANCELLED';
    meeting.history = [...(meeting.history || []), { id: `meeting-history-${Date.now()}`, action: 'بایگانی جلسه بدون حذف اطلاعات', actorUserId: 'system', actorName: 'سامانه', actorRole: 'سیستم', fromStatus: previousStatus, toStatus: 'CANCELLED', dateJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()).replace(/[\u200e\u200f]/g, ''), timeString: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) }];
    meeting.updatedAt = new Date().toISOString();
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(true, 150);
  }

  public async updateMeetingStatus(id: string, status: MeetingStatus): Promise<ApiResponse<Meeting>> {
    return this.updateMeeting(id, { status });
  }

  public async reorderAgenda(id: string, agendaItemIds: string[], actor: User): Promise<ApiResponse<Meeting>> {
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error('جلسه یافت نشد');
    if (!['CEO', 'SECRETARY', 'ADMIN'].includes(actor.role) && !isAgendaApprover(meeting, actor)) throw new Error('دسترسی تغییر ترتیب دستورکار را ندارید');
    if (!['WAITING_FOR_CEO_APPROVAL', 'AGENDA_RETURNED'].includes(meeting.status)) throw new Error('پس از تأیید دستورکار امکان تغییر ترتیب وجود ندارد');
    if (agendaItemIds.length !== meeting.agendaItems.length || new Set(agendaItemIds).size !== agendaItemIds.length) throw new Error('فهرست ترتیب دستورکار نامعتبر است');
    const byId = new Map(meeting.agendaItems.map((item) => [item.id, item]));
    meeting.agendaItems = agendaItemIds.map((itemId, index) => ({ ...byId.get(itemId)!, order: index + 1, rowNumber: index + 1 }));
    this.addHistory(meeting, actor, 'تغییر ترتیب بندهای دستورکار', meeting.status);
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 120);
  }

  public async removeAgendaItem(id: string, agendaItemId: string, reason: string, actor: User): Promise<ApiResponse<Meeting>> {
    if (!reason.trim()) throw new Error('دلیل حذف موضوع از این جلسه الزامی است');
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    const agenda = meeting?.agendaItems.find((item) => item.id === agendaItemId);
    if (!meeting || !agenda) throw new Error('جلسه یا بند دستورکار یافت نشد');
    if (!['CEO', 'ADMIN'].includes(actor.role) && !isAgendaApprover(meeting, actor)) throw new Error('فقط تأییدکننده دستورکار می‌تواند موضوع را از دستورکار خارج کند');
    if (meeting.status !== 'WAITING_FOR_CEO_APPROVAL') throw new Error('حذف موضوع فقط هنگام بررسی مدیرعامل امکان‌پذیر است');
    agenda.isRemoved = true;
    agenda.removalReason = reason.trim();
    agenda.status = 'REMOVED_BY_CEO';
    this.addHistory(meeting, actor, `خروج موضوع از دستورکار این جلسه: ${agenda.title}`, meeting.status, reason.trim());
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 120);
  }

  public async reviewAgenda(id: string, decision: 'APPROVE' | 'RETURN', notes: string, actor: User): Promise<ApiResponse<Meeting>> {
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error('جلسه یافت نشد');
    if (meeting.status !== 'WAITING_FOR_CEO_APPROVAL') throw new Error('دستورکار در انتظار تأیید نیست');
    if (decision === 'RETURN' && !notes.trim()) throw new Error('دلیل بازگشت دستورکار الزامی است');
    if (decision === 'APPROVE' && !meeting.agendaItems.some((item) => !item.isRemoved)) throw new Error('دستورکار بدون موضوع فعال قابل تأیید نیست');

    // سیاست پویای همین جلسه. جلسات قدیمی بدون تنظیم: هر مدیرعامل فعال
    // (همان قاعده تاریخی) و یک تأیید کافی است.
    const policy = getAgendaApprovalPolicy(meeting);
    const decisions = meeting.agendaDecisions || [];
    const authority = resolveApprovalAuthority(policy, decisions, actor, meeting.workflow ? undefined : (user) => user.role === 'CEO');
    if (!authority.allowed) throw new Error(authority.reason || 'شما مجاز به بررسی این دستورکار نیستید');

    const previousStatus = meeting.status;
    const record = buildDecision(actor, decision === 'APPROVE' ? 'APPROVED' : 'RETURNED', notes, authority.approverUserId);
    meeting.agendaDecisions = [...decisions, record];
    meeting.agendaApprovalNotes = notes.trim();

    if (decision === 'RETURN') {
      meeting.status = 'AGENDA_RETURNED';
      this.addHistory(meeting, actor, 'بازگشت دستورکار به دبیرخانه', previousStatus, notes.trim());
    } else {
      const evaluation = evaluateApproval(policy, meeting.agendaDecisions);
      // در حالت «یک نفر کافی» با جلسات قدیمی، تأیید مدیرعامل خارج از فهرست هم
      // مرحله را کامل می‌کند (رفتار تاریخی).
      const legacySatisfied = !meeting.workflow && authority.approverUserId === actor.id;
      if (evaluation.isSatisfied || legacySatisfied) {
        meeting.status = 'READY_FOR_INVITATION';
        this.addHistory(meeting, actor, 'تأیید نهایی دستورکار', previousStatus, notes.trim());
      } else {
        const progress = `${evaluation.approvedCount} از ${evaluation.requiredCount}`;
        const next = evaluation.currentTurnId ? namesOf([evaluation.currentTurnId])[0] : namesOf(evaluation.pendingIds).join('، ');
        this.addHistory(meeting, actor, `تأیید دستورکار (${progress})${authority.onBehalfOf ? ' به نمایندگی' : ''}`, previousStatus, `${notes.trim() ? `${notes.trim()} | ` : ''}در انتظار: ${next}`);
      }
    }
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 140);
  }

  public async submitAgenda(id: string, actor: User): Promise<ApiResponse<Meeting>> {
    if (!['SECRETARY', 'ADMIN'].includes(actor.role)) throw new Error('فقط دبیرخانه مجاز به ارسال مجدد دستورکار است');
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting || meeting.status !== 'AGENDA_RETURNED') throw new Error('فقط دستورکار برگشتی قابل ارسال مجدد است');
    meeting.status = 'WAITING_FOR_CEO_APPROVAL';
    // دور جدید بررسی: تصمیم‌های دور قبل در تاریخچه می‌مانند اما دوباره لازم‌اند.
    meeting.agendaDecisions = [];
    this.addHistory(meeting, actor, 'اصلاح و ارسال مجدد دستورکار برای تأییدکنندگان', 'AGENDA_RETURNED');
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 120);
  }

  public async endMeeting(id: string, actor: User): Promise<ApiResponse<Meeting>> {
    const isAuthorized = ['ADMIN', 'CEO', 'SECRETARY'].includes(actor.role);
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error('جلسه یافت نشد');
    if (!isAuthorized && actor.id !== meeting.secretaryId && actor.id !== meeting.organizerId) throw new Error('فقط مسئول مجاز جلسه می‌تواند آن را خاتمه دهد');
    if (meeting.status !== 'IN_PROGRESS') throw new Error('فقط جلسه در حال برگزاری قابل خاتمه است');
    // Ending the meeting only closes its own lifecycle. Resolutions created
    // from it keep running their own independent workflow (execution,
    // signatures, verification) untouched — see AppContext/ResolutionService.
    meeting.status = 'HELD';
    this.addHistory(meeting, actor, 'ثبت پایان جلسه', 'IN_PROGRESS');
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 120);
  }

  public async addGuest(id: string, guest: Omit<MeetingGuest, 'id' | 'invitationStatus'>, actor: User): Promise<ApiResponse<Meeting>> {
    if (!['SECRETARY', 'ADMIN'].includes(actor.role)) throw new Error('فقط دبیرخانه مجاز به ثبت مدعو است');
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error('جلسه یافت نشد');
    if (!guest.fullName.trim() || !guest.roleTitle.trim() || !guest.organizationName.trim() || !guest.phone.trim()) throw new Error('نام، سمت، سازمان و شماره تماس مدعو الزامی است');
    meeting.guests = [...(meeting.guests || []), { ...guest, id: `guest-${Date.now()}`, invitationStatus: 'NOT_SENT' }];
    this.addHistory(meeting, actor, `ثبت مدعو: ${guest.fullName}`, meeting.status, guest.agendaItemTitle);
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 120);
  }

  public async appendToMeeting(id: string, additions: AppendToMeetingDto, actor: User): Promise<ApiResponse<Meeting>> {
    // Deliberately gated by the Permission System (never a hardcoded role
    // check) so any role granted APPEND_MEETING_CONTENT later can use this
    // too — ADMIN keeps its usual implicit-superuser access, matching every
    // other permission check across the app.
    const canAppend = actor.role === 'ADMIN' || (actor.permissions || []).includes('APPEND_MEETING_CONTENT');
    if (!canAppend) throw new Error('شما مجاز به افزودن مدعو یا دستور کار جدید به این جلسه نیستید.');

    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error('جلسه یافت نشد');
    // Appending is only meaningful before the meeting is fully concluded —
    // no new lifecycle is introduced, this simply reuses the existing HELD
    // / CANCELLED terminal statuses already defined on Meeting.
    if (meeting.status === 'HELD' || meeting.status === 'CANCELLED') {
      throw new Error('این جلسه خاتمه یا لغو شده است و امکان افزودن مدعو یا دستور کار جدید به آن وجود ندارد.');
    }

    const existingMemberIds = new Set(meeting.members.map((member) => member.userId));
    const newMembers = (additions.newMembers || []).filter((member) => !existingMemberIds.has(member.userId));
    const newAgendaItem = additions.newAgendaItem;

    if (newMembers.length === 0 && !newAgendaItem) {
      throw new Error('هیچ مدعو یا دستور کار جدیدی برای افزودن انتخاب نشده است.');
    }

    // Append-only: existing members/agendaItems arrays are always spread
    // first and never replaced, so nothing already on the meeting can be
    // dropped by this action.
    if (newMembers.length > 0) {
      meeting.members = [...meeting.members, ...newMembers];
      this.addHistory(meeting, actor, `افزودن ${newMembers.length} مدعو جدید به جلسه`, meeting.status, newMembers.map((member) => member.fullName).join('، '));
    }
    if (newAgendaItem) {
      meeting.agendaItems = [...meeting.agendaItems, newAgendaItem];
      this.addHistory(meeting, actor, 'افزودن دستور کار جدید به جلسه', meeting.status, newAgendaItem.title);
    }

    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 150);
  }

  public async sendInvitations(id: string, actor: User): Promise<ApiResponse<Meeting>> {
    // Sending now happens automatically the instant the CEO approves the
    // agenda (see reviewAgenda callers), so the CEO must also be an
    // authorized actor here — not just SECRETARY/ADMIN as when this was a
    // separate manual secretariat action.
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error('جلسه یافت نشد');
    if (!['SECRETARY', 'ADMIN', 'CEO'].includes(actor.role) && !isAgendaApprover(meeting, actor)) throw new Error('فقط دبیرخانه یا تأییدکننده دستورکار مجاز به ارسال دعوتنامه است');
    if (meeting.status !== 'READY_FOR_INVITATION') throw new Error('دعوتنامه فقط پس از تأیید نهایی دستورکار قابل ارسال است');
    const sentAt = new Date().toISOString();
    meeting.invitations = [
      ...meeting.members.map((member) => ({ id: `inv-member-${meeting.id}-${member.userId}`, recipientType: 'MEMBER' as const, recipientId: member.userId, recipientName: member.fullName, status: 'SENT' as const, sentAt, attachmentIds: meeting.attachments.map((item) => item.id) })),
      ...(meeting.guests || []).map((guest) => ({ id: `inv-guest-${meeting.id}-${guest.id}`, recipientType: 'GUEST' as const, recipientId: guest.id, recipientName: guest.fullName, recipientPhone: guest.phone, status: 'SENT' as const, sentAt, attachmentIds: meeting.attachments.map((item) => item.id) })),
    ];
    meeting.guests = (meeting.guests || []).map((guest) => ({ ...guest, invitationStatus: 'SENT', sentAt }));
    meeting.status = 'INVITATION_SENT';
    // امضای دبیر جلسه روی دعوتنامه — recorded here, in its own signature
    // context, against the meeting's real دبیر جلسه (never whoever triggered
    // the send). Recipients are invited, never asked to sign.
    const secretary = loadLocalCollection('users', mockUsers).find((user) => user.id === meeting.secretaryId);
    const signedNow = new Date();
    const invitationSignature: DocumentSignature = {
      signerUserId: meeting.secretaryId,
      signerName: meeting.secretaryName,
      signerTitle: secretary?.title || 'دبیر جلسه',
      context: 'MEETING_INVITATION',
      signedAt: sentAt,
      signedDateJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(signedNow).replace(/[\u200e\u200f]/g, ''),
      signedTimeString: signedNow.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      signatureImageUrl: resolveSignatureImageUrl(secretary?.signatureUrl),
    };
    meeting.invitationSignature = invitationSignature;
    this.addHistory(meeting, actor, 'ارسال دعوتنامه اعضا و مدعوین', 'READY_FOR_INVITATION', `${meeting.invitations.length} دعوتنامه ارسال شد`);
    this.saveMeetingsData(meetings);
    await smsService.sendMeetingNotification(meeting);
    return apiClient.simulateNetwork(meeting, 180);
  }

  public async markInvitationViewed(id: string, recipientId: string, actor: User): Promise<ApiResponse<Meeting>> {
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    const invitation = meeting?.invitations?.find((item) => item.recipientId === recipientId);
    if (!meeting || !invitation) throw new Error('دعوتنامه یافت نشد');
    if (recipientId !== actor.id && actor.role !== 'ADMIN') throw new Error('فقط گیرنده دعوتنامه می‌تواند مشاهده آن را ثبت کند');
    invitation.status = 'VIEWED';
    invitation.viewedAt = new Date().toISOString();
    this.addHistory(meeting, actor, 'مشاهده دعوتنامه جلسه', meeting.status);
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 100);
  }

  public async recordAgendaOutcome(id: string, agendaItemId: string, outcomeStatus: NonNullable<AgendaItem['outcomeStatus']>, notes: string, actor: User): Promise<ApiResponse<Meeting>> {
    if (!['SECRETARY', 'ADMIN'].includes(actor.role)) throw new Error('فقط دبیرخانه مجاز به ثبت نتیجه جلسه است');
    if (!notes.trim()) throw new Error('شرح نتیجه بررسی الزامی است');
    const meetings = this.getMeetingsData();
    const meeting = meetings.find((item) => item.id === id);
    const agenda = meeting?.agendaItems.find((item) => item.id === agendaItemId);
    if (!meeting || !agenda) throw new Error('جلسه یا بند دستورکار یافت نشد');
    if (!['INVITATION_SENT', 'SCHEDULED', 'IN_PROGRESS', 'HELD'].includes(meeting.status)) throw new Error('ثبت نتیجه پیش از ارسال دعوتنامه و شروع جلسه مجاز نیست');
    if (agenda.isRemoved) throw new Error('برای موضوع خارج‌شده از دستورکار نمی‌توان نتیجه ثبت کرد');
    agenda.outcomeStatus = outcomeStatus;
    agenda.outcomeNotes = notes.trim();
    agenda.isDiscussed = true;
    const previousStatus = meeting.status;
    meeting.status = 'IN_PROGRESS';
    this.addHistory(meeting, actor, `ثبت نتیجه بند ${agenda.order}: ${agenda.title}`, previousStatus, notes.trim());
    if (!['APPROVED', 'CONDITIONAL'].includes(outcomeStatus)) {
      const proposals = loadLocalValue<Proposal[]>('proposals', []);
      const proposal = proposals.find((item) => item.id === agenda.sourceProposalId);
      const letters = loadLocalCollection<MeetingOutcomeLetter[]>('outcomeLetters', []);
      const existing = letters.find((item) => item.meetingId === id && item.agendaItemId === agendaItemId);
      const letter: MeetingOutcomeLetter = existing || { id: `outcome-letter-${Date.now()}`, letterNumber: `نامه-${new Date().getFullYear()}-${letters.length + 1}`, meetingId: id, agendaItemId, proposalId: agenda.sourceProposalId, recipientName: proposal?.proposerName || agenda.presenterName || agenda.presenter, recipientDepartment: proposal?.proposerDepartmentName || meeting.departmentName, decision: outcomeStatus, text: notes.trim(), status: 'SENT', createdAt: new Date().toISOString(), createdByUserId: actor.id };
      letter.decision = outcomeStatus; letter.text = notes.trim();
      if (!existing) letters.unshift(letter);
      saveLocalCollection('outcomeLetters', letters);
      if (proposal) {
        proposal.history = [...(proposal.history || []), { id: `proposal-letter-${Date.now()}`, action: `ثبت ${letter.letterNumber} نتیجه جلسه`, actorUserId: actor.id, actorName: actor.fullName, actorRole: actor.title, fromStatus: proposal.status, toStatus: proposal.status, dateJalali: new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()).replace(/[\u200e\u200f]/g, ''), timeString: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }), notes: notes.trim() }];
        proposal.updatedAt = new Date().toISOString();
        saveLocalValue('proposals', proposals);
      }
      this.addHistory(meeting, actor, `صدور ${letter.letterNumber} برای نتیجه غیرمصوب`, meeting.status, `گیرنده: ${letter.recipientName}`);
    }
    this.saveMeetingsData(meetings);
    return apiClient.simulateNetwork(meeting, 120);
  }

  public async getOutcomeLetters(meetingId: string): Promise<ApiResponse<MeetingOutcomeLetter[]>> {
    return apiClient.simulateNetwork(loadLocalCollection<MeetingOutcomeLetter[]>('outcomeLetters', []).filter((item) => item.meetingId === meetingId), 70);
  }
}

export const meetingService: IMeetingService = new MockMeetingService();
