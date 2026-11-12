import { nextRecordNumber } from '../utils/date';
import { Proposal, ApiResponse, ApiFilterParams, PagedResult, User, AppNotification } from '../types';
import { mockProposals, mockUsers, mockNotifications } from '../mock/data';
import { apiClient } from './api/apiClient';
import { loadLocalValue, saveLocalValue, loadLocalCollection, saveLocalCollection } from './localStore';
import { toPersianDigits } from '../utils/formatters';
import { smsService } from './smsService';
import { buildDecision, evaluateApproval, getProposalWorkflowSettings, namesOf, resolveApprovalAuthority } from './workflowPolicyService';

/**
 * گردش پویای پیشنهاد: اگر برای «بررسی مدیرعامل» سیاست تعریف شده باشد،
 * فقط تأییدکنندگان همان سیاست (یا مدیر سیستم) اقدام می‌کنند؛ وگرنه رفتار
 * تاریخی (نقش مدیرعامل).
 */
const ceoAuthority = (proposal: Proposal, actor: User) => {
  const policy = getProposalWorkflowSettings().ceoReview;
  if (!policy) return { policy, allowed: ['CEO', 'ADMIN'].includes(actor.role), approverUserId: actor.id, reason: 'فقط مدیرعامل مجاز به بررسی پیشنهاد است' };
  const authority = resolveApprovalAuthority(policy, proposal.ceoDecisions || [], actor);
  return { policy, allowed: authority.allowed, approverUserId: authority.approverUserId, reason: authority.reason || 'شما جزو تأییدکنندگان این پیشنهاد نیستید' };
};

const STORAGE_KEY = 'proposals';

export interface CreateProposalDto {
  title: string;
  proposerName: string;
  proposerUserId?: string;
  proposerDepartmentId: string;
  proposerDepartmentName: string;
  presenterUserId: string;
  presenterName: string;
  description: string;
  rationale?: string;
  notes?: string;
  source?: Proposal['source'];
  sourceLetterNumber?: string;
  sourceLetterDateJalali?: string;
  sourceLetterSubject?: string;
}

const getCurrentTimeString = (): string => toPersianDigits(
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
);

const getJalaliDate = (date: Date = new Date()): string => new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date).replace(/[\u200e\u200f]/g, '');

export interface ResubmitProposalUpdates {
  title: string;
  description: string;
  rationale?: string;
  // Only supplied when resubmitting a RETURNED_FOR_REVISION proposal whose
  // source is EXCEL_IMPORT — the office manager must re-upload a corrected
  // Excel row rather than editing fields inline, and that row may also
  // correct the presenter/department/letter details below.
  presenterUserId?: string;
  presenterName?: string;
  proposerDepartmentId?: string;
  proposerDepartmentName?: string;
  sourceLetterNumber?: string;
  sourceLetterDateJalali?: string;
  sourceLetterSubject?: string;
}

export interface IProposalService {
  getProposals(params?: ApiFilterParams): Promise<ApiResponse<PagedResult<Proposal>>>;
  createProposal(dto: CreateProposalDto): Promise<ApiResponse<Proposal>>;
  reviewProposal(id: string, decision: 'APPROVED' | 'REJECTED', notes: string | undefined, actor: User): Promise<ApiResponse<Proposal>>;
  forwardToCeo(id: string): Promise<ApiResponse<Proposal>>;
  recoverProposal(id: string, actor: User): Promise<ApiResponse<Proposal>>;
  returnForRevision(id: string, reason: string, actor: User): Promise<ApiResponse<Proposal>>;
  resubmitProposal(id: string, updates: ResubmitProposalUpdates, actor: User): Promise<ApiResponse<Proposal>>;
  decideWithoutBoard(id: string, decision: 'NO_BOARD_REQUIRED' | 'CEO_ORDER_ISSUED', notes: string, actor: User, order?: Proposal['ceoOrder']): Promise<ApiResponse<Proposal>>;
  updateCeoOrderStatus(id: string, status: 'IN_PROGRESS' | 'COMPLETED', actor: User, completionNotes?: string): Promise<ApiResponse<Proposal>>;
  confirmForMeeting(id: string, actor: User): Promise<ApiResponse<Proposal>>;
  // Final approval of a Meeting Confirmation — actor is «دبیر جلسه»
  // (APPROVE_MEETING_CONFIRMATION permission), not the CEO. Reuses the same
  // three outcomes the CEO's own initial review already has (approve /
  // reject / return for revision); only the actor and recipient changed.
  finalizeMeetingConfirmation(id: string, decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION', notes: string | undefined, actor: User): Promise<ApiResponse<Proposal>>;
  // مسئول دفتر برگشت دبیر جلسه را به پیشنهاددهنده منتقل می‌کند.
  forwardSecretaryReturnToProposer(id: string, reason: string, actor: User): Promise<ApiResponse<Proposal>>;
  markConvertedToAgenda(id: string, meetingId: string, meetingTitle: string, relatedUsers?: Proposal['relatedUsers']): Promise<ApiResponse<Proposal>>;
}

class MockProposalService implements IProposalService {
  private getData = (): Proposal[] => loadLocalValue<Proposal[]>(STORAGE_KEY, mockProposals).map((proposal, index) => ({
    ...proposal,
    proposalNumber: proposal.proposalNumber || `پیشنهاد-۱۴۰۳-${toPersianDigits(index + 1)}`,
    status: proposal.status === 'PENDING_OFFICE_REVIEW' ? 'PENDING_CEO_REVIEW' : proposal.status,
    presenterUserId: proposal.presenterUserId || proposal.confirmedPresenterId || proposal.proposerUserId,
    presenterName: proposal.presenterName || proposal.confirmedPresenterName || proposal.proposerName,
    dateJalali: proposal.dateJalali || getJalaliDate(new Date(proposal.createdAt)),
    history: proposal.history || [],
    updatedAt: proposal.updatedAt || proposal.createdAt,
  }));
  private saveData = (proposals: Proposal[]) => saveLocalValue(STORAGE_KEY, proposals);

  private addHistory(proposal: Proposal, actor: User, action: string, fromStatus: string, notes?: string) {
    proposal.history = [
      ...(proposal.history || []),
      {
        id: `proposal-history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        action,
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.title,
        fromStatus,
        toStatus: proposal.status,
        dateJalali: getJalaliDate(),
        timeString: getCurrentTimeString(),
        notes,
      },
    ];
    proposal.updatedAt = new Date().toISOString();
  }

  // Notifies every user currently holding APPROVE_MEETING_CONFIRMATION (the
  // دبیر جلسه persona) that a new item landed in their final-approval
  // cartable — mirrors the same notifications collection AppContext already
  // writes PERMISSION_ASSIGNED notices to, so it shows up in the same bell
  // without a new notification system.
  private notifyMeetingSecretaries(proposal: Proposal) {
    const users = loadLocalCollection('users', mockUsers);
    const policy = getProposalWorkflowSettings().secretaryConfirmation;
    const recipients = policy
      ? users.filter((user) => policy.approverUserIds.includes(user.id))
      : users.filter((user) => user.role !== 'ADMIN' && (user.permissions || []).includes('APPROVE_MEETING_CONFIRMATION'));
    if (recipients.length === 0) return;
    const notifications = loadLocalCollection('notifications', mockNotifications);
    const newOnes: AppNotification[] = recipients.map((user) => ({
      id: `notif-secretary-confirm-${Date.now()}-${user.id}`,
      recipientUserId: user.id,
      title: 'تأیید نهایی جلسه',
      message: `یک مورد جدید («${proposal.title}») برای تأیید نهایی جلسه در کارتابل شما قرار گرفت.`,
      dateJalali: getJalaliDate(),
      timeString: getCurrentTimeString(),
      isRead: false,
      type: 'APPROVAL_REQUEST',
      targetRoute: 'proposals',
    }));
    saveLocalCollection('notifications', [...newOnes, ...notifications]);
  }

  public async getProposals(params?: ApiFilterParams): Promise<ApiResponse<PagedResult<Proposal>>> {
    let filtered = this.getData();

    if (params?.status && params.status !== 'ALL') {
      filtered = filtered.filter((p) => p.status === params.status);
    }
    if (params?.searchTerm) {
      const term = params.searchTerm.toLowerCase();
      filtered = filtered.filter((p) => p.title.toLowerCase().includes(term) || p.proposerName.toLowerCase().includes(term));
    }

    filtered = [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const pageIndex = params?.pageIndex || 1;
    const pageSize = params?.pageSize || 50;
    const totalCount = filtered.length;
    const items = filtered.slice((pageIndex - 1) * pageSize, (pageIndex - 1) * pageSize + pageSize);

    return apiClient.simulateNetwork<PagedResult<Proposal>>({
      items, totalCount, pageIndex, pageSize, totalPages: Math.ceil(totalCount / pageSize),
    }, 120);
  }

  public async createProposal(dto: CreateProposalDto): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const source = dto.source || 'MANUAL';
    const newProposal: Proposal = {
      id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      proposalNumber: nextRecordNumber('پ', proposals.map((p) => p.proposalNumber)),
      ...dto,
      source,
      dateJalali: getJalaliDate(),
      attachments: [],
      status: 'PENDING_CEO_REVIEW',
      history: [{
        id: `proposal-history-${Date.now()}`,
        action: source === 'EXCEL_IMPORT' ? 'پیشنهاد از طریق فایل Excel ثبت و برای مدیرعامل ارسال شد' : 'ثبت و ارسال پیشنهاد برای مدیرعامل',
        actorUserId: dto.proposerUserId || 'unknown',
        actorName: dto.proposerName,
        actorRole: dto.proposerDepartmentName,
        toStatus: 'PENDING_CEO_REVIEW',
        dateJalali: getJalaliDate(),
        timeString: getCurrentTimeString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    proposals.unshift(newProposal);
    this.saveData(proposals);
    return apiClient.simulateNetwork(newProposal, 150);
  }

  public async forwardToCeo(id: string): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) throw new Error('مصوبه پیشنهادی یافت نشد');
    if (proposal.status !== 'PENDING_OFFICE_REVIEW') throw new Error('فقط موارد در انتظار بررسی مسئول دفتر قابل ارسال برای مدیرعامل هستند');
    proposal.status = 'PENDING_CEO_REVIEW';
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async reviewProposal(id: string, decision: 'APPROVED' | 'REJECTED', notes: string | undefined, actor: User): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) throw new Error('مصوبه پیشنهادی یافت نشد');
    if (!['PENDING_CEO_REVIEW', 'RESUBMITTED'].includes(proposal.status)) throw new Error('فقط پیشنهادهای در انتظار مدیرعامل قابل بررسی هستند');
    const authority = ceoAuthority(proposal, actor);
    if (!authority.allowed) throw new Error(authority.reason);
    const previousStatus = proposal.status;
    if (authority.policy && decision === 'APPROVED') {
      proposal.ceoDecisions = [...(proposal.ceoDecisions || []), buildDecision(actor, 'APPROVED', notes, authority.approverUserId)];
      const evaluation = evaluateApproval(authority.policy, proposal.ceoDecisions);
      if (!evaluation.isSatisfied) {
        // تأیید ثبت شد اما سایر تأییدکنندگان باقی‌اند؛ وضعیت تغییر نمی‌کند.
        this.addHistory(proposal, actor, `تأیید پیشنهاد (${evaluation.approvedCount} از ${evaluation.requiredCount})`, previousStatus, `${notes ? `${notes} | ` : ''}در انتظار: ${namesOf(evaluation.currentTurnId ? [evaluation.currentTurnId] : evaluation.pendingIds).join('، ')}`);
        this.saveData(proposals);
        return apiClient.simulateNetwork(proposal, 120);
      }
    }
    proposal.status = decision;
    proposal.managementDecisionNotes = notes;
    this.addHistory(proposal, actor, decision === 'APPROVED' ? 'تأیید جهت طرح در هیأت‌مدیره' : 'رد پیشنهاد', previousStatus, notes);
    this.saveData(proposals);
    if (decision === 'REJECTED') await smsService.sendProposalRejection(proposal);
    return apiClient.simulateNetwork(proposal, 120);
  }

  // Recovery is intentionally limited to NO_BOARD_REQUIRED: that decision
  // means the CEO judged the proposal itself fine, just not worth a board
  // agenda item, so re-opening it for review is reasonable. A REJECTED
  // proposal was judged unfit on its merits — it must stay final and is not
  // recoverable through this or any other action.
  public async recoverProposal(id: string, actor: User): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) throw new Error('مصوبه پیشنهادی یافت نشد');
    if (proposal.status !== 'NO_BOARD_REQUIRED') throw new Error('فقط موارد «عدم نیاز به طرح در هیأت‌مدیره» قابل بازیابی هستند');
    const previousStatus = proposal.status;
    proposal.status = 'PENDING_CEO_REVIEW';
    proposal.ceoDecisions = [];
    this.addHistory(proposal, actor, 'بازیابی پیشنهاد و ارسال مجدد برای بررسی مدیرعامل', previousStatus);
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async returnForRevision(id: string, reason: string, actor: User): Promise<ApiResponse<Proposal>> {
    if (!reason.trim()) throw new Error('ثبت دلیل برگشت پیشنهاد الزامی است');
    const proposals = this.getData();
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error('پیشنهاد یافت نشد');
    const authority = ceoAuthority(proposal, actor);
    if (!authority.allowed) throw new Error(authority.policy ? authority.reason : 'فقط مدیرعامل مجاز به برگشت پیشنهاد است');
    if (!['PENDING_CEO_REVIEW', 'RESUBMITTED'].includes(proposal.status)) throw new Error('این پیشنهاد در کارتابل بررسی مدیرعامل نیست');
    const previousStatus = proposal.status;
    proposal.status = 'RETURNED_FOR_REVISION';
    proposal.managementDecisionNotes = reason.trim();
    this.addHistory(proposal, actor, 'برگشت پیشنهاد جهت اصلاح و تکمیل', previousStatus, reason.trim());
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async resubmitProposal(id: string, updates: ResubmitProposalUpdates, actor: User): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error('پیشنهاد یافت نشد');
    if (proposal.status !== 'RETURNED_FOR_REVISION' || proposal.proposerUserId !== actor.id) throw new Error('فقط پیشنهاددهنده می‌تواند پیشنهاد برگشتی را ارسال مجدد کند');
    if (!updates.title.trim() || !updates.description.trim()) throw new Error('عنوان و شرح پیشنهاد الزامی است');
    proposal.title = updates.title.trim();
    proposal.description = updates.description.trim();
    proposal.rationale = updates.rationale?.trim();
    if (updates.presenterUserId) { proposal.presenterUserId = updates.presenterUserId; proposal.presenterName = updates.presenterName; }
    if (updates.proposerDepartmentId) { proposal.proposerDepartmentId = updates.proposerDepartmentId; proposal.proposerDepartmentName = updates.proposerDepartmentName; }
    if (updates.sourceLetterNumber) proposal.sourceLetterNumber = updates.sourceLetterNumber;
    if (updates.sourceLetterDateJalali) proposal.sourceLetterDateJalali = updates.sourceLetterDateJalali;
    if (updates.sourceLetterSubject !== undefined) proposal.sourceLetterSubject = updates.sourceLetterSubject;
    proposal.status = 'RESUBMITTED';
    proposal.ceoDecisions = [];
    this.addHistory(proposal, actor, 'اصلاح و ارسال مجدد پیشنهاد', 'RETURNED_FOR_REVISION');
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async decideWithoutBoard(id: string, decision: 'NO_BOARD_REQUIRED' | 'CEO_ORDER_ISSUED', notes: string, actor: User, order?: Proposal['ceoOrder']): Promise<ApiResponse<Proposal>> {
    if (!notes.trim()) throw new Error('ثبت توضیحات تصمیم مدیرعامل الزامی است');
    const proposals = this.getData();
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error('پیشنهاد یافت نشد');
    const authority = ceoAuthority(proposal, actor);
    if (!authority.allowed) throw new Error(authority.policy ? authority.reason : 'فقط مدیرعامل مجاز به ثبت این تصمیم است');
    if (!['PENDING_CEO_REVIEW', 'RESUBMITTED'].includes(proposal.status)) throw new Error('این پیشنهاد در کارتابل بررسی مدیرعامل نیست');
    if (decision === 'CEO_ORDER_ISSUED' && (!order?.text.trim() || !order.assigneeUserId || !order.deadlineJalali)) throw new Error('متن دستور، مسئول اقدام و مهلت انجام الزامی است');
    const previousStatus = proposal.status;
    proposal.status = decision;
    proposal.managementDecisionNotes = notes.trim();
    proposal.ceoOrder = decision === 'CEO_ORDER_ISSUED' ? order : undefined;
    const labels = { NO_BOARD_REQUIRED: 'عدم نیاز به طرح در هیأت‌مدیره', CEO_ORDER_ISSUED: 'صدور دستور مستقیم مدیرعامل' };
    this.addHistory(proposal, actor, labels[decision], previousStatus, notes.trim());
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async updateCeoOrderStatus(id: string, status: 'IN_PROGRESS' | 'COMPLETED', actor: User, completionNotes?: string): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal?.ceoOrder) throw new Error('دستور مدیرعامل یافت نشد');
    if (proposal.ceoOrder.assigneeUserId !== actor.id && actor.role !== 'ADMIN') throw new Error('فقط مسئول تعیین‌شده می‌تواند وضعیت دستور را تغییر دهد');
    if (status === 'COMPLETED' && !completionNotes?.trim()) throw new Error('توضیح اقدام انجام‌شده الزامی است');
    const previousStatus = proposal.ceoOrder.status;
    proposal.ceoOrder.status = status;
    if (status === 'COMPLETED') proposal.ceoOrder.completionNotes = completionNotes!.trim();
    this.addHistory(proposal, actor, status === 'COMPLETED' ? 'اعلام انجام دستور مدیرعامل' : 'آغاز اجرای دستور مدیرعامل', previousStatus, status === 'COMPLETED' ? completionNotes!.trim() : undefined);
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async confirmForMeeting(id: string, actor: User): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) throw new Error('مصوبه پیشنهادی یافت نشد');
    if (proposal.status !== 'APPROVED') throw new Error('فقط موارد تایید شده توسط مدیرعامل قابل تبدیل به تایید جلسه هستند');
    const previousStatus = proposal.status;
    // No longer goes straight to the usable CONFIRMED_FOR_MEETING state —
    // it now waits for دبیر جلسه's own final approval below.
    proposal.status = 'PENDING_SECRETARY_CONFIRMATION';
    proposal.secretaryDecisions = [];
    proposal.confirmedPresenterId = proposal.presenterUserId;
    proposal.confirmedPresenterName = proposal.presenterName;
    proposal.confirmedDateJalali = getJalaliDate();
    proposal.confirmedTimeString = getCurrentTimeString();
    this.addHistory(proposal, actor, 'تبدیل به تایید جلسه و ارسال برای تأیید نهایی دبیر جلسه', previousStatus);
    this.saveData(proposals);
    this.notifyMeetingSecretaries(proposal);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async finalizeMeetingConfirmation(id: string, decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION', notes: string | undefined, actor: User): Promise<ApiResponse<Proposal>> {
    // Permission-gated, not role-hardcoded, so any role granted
    // APPROVE_MEETING_CONFIRMATION later can act here too — ADMIN keeps its
    // usual implicit-superuser access, matching every other permission
    // check across the app.
    if (decision === 'RETURNED_FOR_REVISION' && !notes?.trim()) throw new Error('ثبت دلیل برگشت الزامی است');
    const proposals = this.getData();
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error('پیشنهاد یافت نشد');
    if (proposal.status !== 'PENDING_SECRETARY_CONFIRMATION') throw new Error('این پیشنهاد در کارتابل تأیید نهایی دبیر جلسه نیست');
    const policy = getProposalWorkflowSettings().secretaryConfirmation;
    const previousStatus = proposal.status;
    if (policy) {
      // گردش پویا: تأییدکنندگان تعیین‌شده (همه / یک نفر / ترتیبی).
      const authority = resolveApprovalAuthority(policy, proposal.secretaryDecisions || [], actor);
      if (!authority.allowed) throw new Error(authority.reason || 'شما مجاز به تأیید نهایی تایید جلسه نیستید.');
      if (decision === 'APPROVED') {
        proposal.secretaryDecisions = [...(proposal.secretaryDecisions || []), buildDecision(actor, 'APPROVED', notes, authority.approverUserId)];
        const evaluation = evaluateApproval(policy, proposal.secretaryDecisions);
        if (!evaluation.isSatisfied) {
          this.addHistory(proposal, actor, `تأیید نهایی (${evaluation.approvedCount} از ${evaluation.requiredCount})`, previousStatus, `در انتظار: ${namesOf(evaluation.currentTurnId ? [evaluation.currentTurnId] : evaluation.pendingIds).join('، ')}`);
          this.saveData(proposals);
          return apiClient.simulateNetwork(proposal, 120);
        }
      }
    } else {
      const canFinalize = actor.role === 'ADMIN' || (actor.permissions || []).includes('APPROVE_MEETING_CONFIRMATION');
      if (!canFinalize) throw new Error('شما مجاز به تأیید نهایی تایید جلسه نیستید.');
    }
    // APPROVED must land on CONFIRMED_FOR_MEETING — the state that makes the
    // item pickable as a ready agenda item. Writing back a bare 'APPROVED'
    // put it straight back into the office manager's «تبدیل به تایید جلسه»
    // queue, so confirming it simply re-sent it to دبیر جلسه, forever.
    // RETURNED_FOR_REVISION goes to the office manager first, who decides
    // whether to pass the correction request on to the proposer.
    proposal.status = decision === 'APPROVED'
      ? 'CONFIRMED_FOR_MEETING'
      : decision === 'RETURNED_FOR_REVISION'
        ? 'RETURNED_BY_SECRETARY'
        : 'REJECTED';
    if (notes?.trim()) proposal.managementDecisionNotes = notes.trim();
    const labels = { APPROVED: 'تأیید نهایی تایید جلسه توسط دبیر جلسه', REJECTED: 'رد تایید جلسه توسط دبیر جلسه', RETURNED_FOR_REVISION: 'برگشت تایید جلسه توسط دبیر جلسه جهت اصلاح' };
    this.addHistory(proposal, actor, labels[decision], previousStatus, notes?.trim());
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  /**
   * مسئول دفتر پس از دیدن برگشت دبیر جلسه، پیشنهاد را جهت اصلاح به خود
   * پیشنهاددهنده برمی‌گرداند. تنها مسیر خروج از RETURNED_BY_SECRETARY است و
   * دقیقاً به همان حالتی می‌رسد که «اصلاح و ارسال مجدد» پیشنهاددهنده از آن
   * پشتیبانی می‌کند.
   */
  public async forwardSecretaryReturnToProposer(id: string, reason: string, actor: User): Promise<ApiResponse<Proposal>> {
    if (!['SECRETARY', 'ADMIN'].includes(actor.role)) throw new Error('فقط مسئول دفتر مجاز به برگشت این پیشنهاد به پیشنهاددهنده است');
    if (!reason.trim()) throw new Error('ثبت دلیل برگشت جهت اصلاح الزامی است');
    const proposals = this.getData();
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error('پیشنهاد یافت نشد');
    if (proposal.status !== 'RETURNED_BY_SECRETARY') throw new Error('این پیشنهاد در کارتابل برگشت از دبیر جلسه نیست');
    const previousStatus = proposal.status;
    proposal.status = 'RETURNED_FOR_REVISION';
    proposal.managementDecisionNotes = reason.trim();
    this.addHistory(proposal, actor, 'برگشت پیشنهاد به پیشنهاددهنده جهت اصلاح (پس از برگشت دبیر جلسه)', previousStatus, reason.trim());
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 120);
  }

  public async markConvertedToAgenda(id: string, meetingId: string, meetingTitle: string, relatedUsers: Proposal['relatedUsers'] = []): Promise<ApiResponse<Proposal>> {
    const proposals = this.getData();
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) throw new Error('مصوبه پیشنهادی یافت نشد');
    proposal.status = 'CONVERTED_TO_AGENDA';
    proposal.assignedMeetingId = meetingId;
    proposal.assignedMeetingTitle = meetingTitle;
    proposal.relatedUsers = relatedUsers;
    this.saveData(proposals);
    return apiClient.simulateNetwork(proposal, 100);
  }
}

export const proposalService: IProposalService = new MockProposalService();
