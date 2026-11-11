import { ApiResponse, BoardMinutes, DocumentSignature, Meeting, ResolutionNotice, User, WorkflowHistoryEntry } from '../types';
import { apiClient } from './api/apiClient';
import { loadLocalCollection, saveLocalCollection } from './localStore';
import { resolutionService } from './resolutionService';
import { resolveSignatureImageUrl } from '../utils/signatureImage';
import { mockMeetings, mockUsers } from '../mock/data';
import { buildDecision, evaluateApproval, namesOf, resolveApprovalAuthority } from './workflowPolicyService';

const clock = () => { const now = new Date(); return { iso: now.toISOString(), date: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/[\u200e\u200f]/g, ''), time: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) }; };

class BoardSecretariatService {
  private minutes = () => loadLocalCollection<BoardMinutes[]>('boardMinutes', []);
  private notices = () => loadLocalCollection<ResolutionNotice[]>('resolutionNotices', []);
  private requireSecretary(actor: User) { if (!['SECRETARY', 'ADMIN'].includes(actor.role)) throw new Error('فقط دبیرخانه مجاز به انجام این عملیات است'); }
  private entry(actor: User, action: string, toStatus: string, fromStatus?: string, notes?: string): WorkflowHistoryEntry { const now = clock(); return { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, action, actorUserId: actor.id, actorName: actor.fullName, actorRole: actor.title, fromStatus, toStatus, dateJalali: now.date, timeString: now.time, notes }; }
  private audit(entry: WorkflowHistoryEntry) { const items = loadLocalCollection<WorkflowHistoryEntry[]>('governanceAudit', []); items.unshift(entry); saveLocalCollection('governanceAudit', items); }

  private minutesPolicy(meetingId: string) {
    const meeting = loadLocalCollection<Meeting[]>('meetings', mockMeetings).find((item) => item.id === meetingId);
    const policy = meeting?.workflow?.minutesApproval;
    return policy && policy.approverUserIds.length > 0 ? policy : undefined;
  }

  /** گردش کار پویا: ارسال پیش‌نویس صورت‌جلسه برای تأییدکنندگان تعیین‌شده جلسه. */
  async submitMinutesForApproval(meetingId: string, actor: User): Promise<ApiResponse<BoardMinutes>> {
    this.requireSecretary(actor);
    const policy = this.minutesPolicy(meetingId);
    if (!policy) throw new Error('برای این جلسه تأییدکننده صورت‌جلسه تعریف نشده است');
    const all = this.minutes(); const item = all.find((value) => value.meetingId === meetingId);
    if (!item) throw new Error('صورت‌جلسه یافت نشد');
    if (item.status !== 'DRAFT') throw new Error('فقط پیش‌نویس قابل ارسال برای تأیید است');
    if (!item.content.trim()) throw new Error('متن صورت‌جلسه خالی است');
    const entry = this.entry(actor, `ارسال صورت‌جلسه برای تأیید: ${namesOf(policy.approverUserIds).join('، ')}`, 'WAITING_SIGNATURES', item.status);
    item.status = 'WAITING_SIGNATURES'; item.approvals = []; item.history.push(entry);
    saveLocalCollection('boardMinutes', all); this.audit(entry);
    return apiClient.simulateNetwork(item, 80);
  }

  /** تأیید یا برگشت صورت‌جلسه توسط تأییدکنندگان (همه / یک نفر / ترتیبی). */
  async reviewMinutes(meetingId: string, decision: 'APPROVE' | 'RETURN', notes: string, actor: User): Promise<ApiResponse<BoardMinutes>> {
    const policy = this.minutesPolicy(meetingId);
    if (!policy) throw new Error('برای این جلسه تأییدکننده صورت‌جلسه تعریف نشده است');
    const all = this.minutes(); const item = all.find((value) => value.meetingId === meetingId);
    if (!item || !['WAITING_SIGNATURES', 'PARTIALLY_SIGNED'].includes(item.status)) throw new Error('صورت‌جلسه در انتظار تأیید نیست');
    if (decision === 'RETURN' && !notes.trim()) throw new Error('دلیل برگشت صورت‌جلسه الزامی است');
    const authority = resolveApprovalAuthority(policy, item.approvals || [], actor);
    if (!authority.allowed) throw new Error(authority.reason || 'شما مجاز به تأیید این صورت‌جلسه نیستید');
    const previous = item.status;
    item.approvals = [...(item.approvals || []), buildDecision(actor, decision === 'APPROVE' ? 'APPROVED' : 'RETURNED', notes, authority.approverUserId)];
    let action: string;
    if (decision === 'RETURN') { item.status = 'DRAFT'; action = 'برگشت صورت‌جلسه جهت اصلاح'; }
    else {
      const evaluation = evaluateApproval(policy, item.approvals);
      item.status = evaluation.isSatisfied ? 'SIGNED' : 'PARTIALLY_SIGNED';
      action = evaluation.isSatisfied ? 'تأیید کامل صورت‌جلسه — آماده نهایی‌سازی' : `تأیید صورت‌جلسه (${evaluation.approvedCount} از ${evaluation.requiredCount})`;
    }
    const entry = this.entry(actor, action, item.status, previous, notes.trim() || undefined);
    item.history.push(entry); saveLocalCollection('boardMinutes', all); this.audit(entry);
    return apiClient.simulateNetwork(item, 80);
  }

  async getMinutes(meetingId: string): Promise<ApiResponse<BoardMinutes | null>> { return apiClient.simulateNetwork(this.minutes().find((item) => item.meetingId === meetingId) || null, 60); }

  async createMinutes(meeting: Meeting, content: string, actor: User): Promise<ApiResponse<BoardMinutes>> {
    this.requireSecretary(actor); const all = this.minutes(); const existing = all.find((item) => item.meetingId === meeting.id); if (existing) return apiClient.simulateNetwork(existing, 50);
    const now = clock(); const entry = this.entry(actor, 'ایجاد پیش‌نویس صورت‌جلسه تجمیعی', 'DRAFT');
    const item: BoardMinutes = { id: `minutes-${Date.now()}`, meetingId: meeting.id, meetingNumber: meeting.meetingNumber, status: 'DRAFT', content: content.trim(), copiesCount: 3, createdByUserId: actor.id, createdByName: actor.fullName, createdAt: now.iso, updatedByUserId: actor.id, updatedByName: actor.fullName, updatedAt: now.iso, history: [entry] };
    all.unshift(item); saveLocalCollection('boardMinutes', all); this.audit(entry); return apiClient.simulateNetwork(item, 100);
  }

  async updateMinutes(meetingId: string, content: string, actor: User): Promise<ApiResponse<BoardMinutes>> {
    this.requireSecretary(actor); const all = this.minutes(); const item = all.find((value) => value.meetingId === meetingId); if (!item || item.status !== 'DRAFT') throw new Error('فقط پیش‌نویس قابل ویرایش است');
    const now = clock(); const entry = this.entry(actor, 'ویرایش پیش‌نویس صورت‌جلسه', 'DRAFT', item.status); item.content = content.trim(); item.updatedAt = now.iso; item.updatedByUserId = actor.id; item.updatedByName = actor.fullName; item.history.push(entry); saveLocalCollection('boardMinutes', all); this.audit(entry); return apiClient.simulateNetwork(item, 80);
  }

  // Attendee/guest signatures are no longer part of finishing a meeting:
  // the minutes go straight from DRAFT to FINALIZED, signed by the
  // secretariat alone. Members, guests and invitees are untouched — they are
  // still invited, still listed as present, and still shown on the document;
  // they are simply never asked for a signature.
  async finalizeMinutes(meetingId: string, actor: User): Promise<ApiResponse<BoardMinutes>> {
    this.requireSecretary(actor); const all = this.minutes(); const item = all.find((value) => value.meetingId === meetingId); if (!item) throw new Error('صورت‌جلسه یافت نشد'); if (item.status === 'FINALIZED') throw new Error('این صورت‌جلسه قبلاً نهایی شده است'); if (!item.content.trim()) throw new Error('متن صورت‌جلسه خالی است');
    if (this.minutesPolicy(meetingId) && item.status !== 'SIGNED') throw new Error('طبق گردش کار این جلسه، ابتدا صورت‌جلسه باید توسط تأییدکنندگان تأیید شود');
    const now = clock(); const entry = this.entry(actor, 'نهایی‌سازی صورت‌جلسه در سه نسخه', 'FINALIZED', item.status); item.status = 'FINALIZED'; item.finalizedAt = now.iso;
    // The secretariat's own signature is the only one this document needs. The
    // image is resolved from the signer's stored user record — the one central
    // signature source — rather than from the client-supplied actor object,
    // and snapshotted here so a later replacement never rewrites history.
    const signerRecord = loadLocalCollection('users', mockUsers).find((user) => user.id === actor.id);
    const signature: DocumentSignature = { signerUserId: actor.id, signerName: actor.fullName, signerTitle: actor.title, context: 'MEETING_MINUTES', signedAt: now.iso, signedDateJalali: now.date, signedTimeString: now.time, signatureImageUrl: resolveSignatureImageUrl(signerRecord?.signatureUrl) };
    item.finalizedSignature = signature; item.history.push(entry); saveLocalCollection('boardMinutes', all); this.audit(entry); await resolutionService.markMeetingMinutesFinalized(meetingId); return apiClient.simulateNetwork(item, 100);
  }

  async getNotices(meetingId?: string, resolutionId?: string): Promise<ApiResponse<ResolutionNotice[]>> { return apiClient.simulateNetwork(this.notices().filter((item) => (!meetingId || item.meetingId === meetingId) && (!resolutionId || item.resolutionId === resolutionId)), 60); }

  async issueNotices(meetingId: string, actor: User): Promise<ApiResponse<ResolutionNotice[]>> {
    this.requireSecretary(actor); const minutes = (await this.getMinutes(meetingId)).data; if (!minutes || minutes.status !== 'FINALIZED') throw new Error('ابتدا صورت‌جلسه را نهایی کنید');
    // A resolution whose 3-step signature only completed AFTER the minutes
    // were finalized never got migrated out of WAITING_MINUTES_SIGNATURE by
    // finalizeMinutes (a one-time snapshot). Re-running the same idempotent
    // migration here catches those late-completing resolutions too, instead
    // of silently issuing zero notices for them.
    await resolutionService.markMeetingMinutesFinalized(meetingId);
    const result = await resolutionService.getResolutions({ meetingId, pageSize: 200 }); const resolutions = result.data.items.filter((item) => item.executionStatus === 'WAITING_NOTIFICATION'); const all = this.notices(); const created: ResolutionNotice[] = []; const now = clock();
    resolutions.forEach((resolution) => { const recipients = new Map<string, { name: string; department: string }>(); if (resolution.mainResponsibleName) recipients.set(`main-${resolution.mainResponsibleUserId}`, { name: resolution.mainResponsibleName, department: resolution.responsibleDepartmentName || '' }); recipients.set(`proposer-${resolution.proposerDepartment}`, { name: resolution.proposerName, department: resolution.proposerDepartment }); resolution.referrals.forEach((referral) => recipients.set(`${referral.targetType}-${referral.targetId}`, { name: referral.targetName, department: referral.targetName })); recipients.forEach((recipient) => { if (all.some((notice) => notice.resolutionId === resolution.id && notice.recipientName === recipient.name)) return; created.push({ id: `notice-${Date.now()}-${created.length}`, noticeNumber: `ابلاغ-${new Date().getFullYear()}-${all.length + created.length + 1}`, resolutionId: resolution.id, resolutionNumber: resolution.resolutionNumber, meetingId, dateJalali: now.date, recipientName: recipient.name, recipientDepartment: recipient.department, text: `مصوبه «${resolution.topicTitle}» جهت اقدام و رعایت مهلت مقرر ابلاغ می‌شود.`, deadlineJalali: resolution.deadlineJalali, attachmentIds: resolution.attachments.map((attachment) => attachment.id), status: 'SENT', sentAt: now.iso, createdByUserId: actor.id }); }); });
    all.unshift(...created); saveLocalCollection('resolutionNotices', all); const entry = this.entry(actor, `صدور و ارسال ${created.length} ابلاغیه`, 'NOTIFIED', 'WAITING_NOTIFICATION'); this.audit(entry); await resolutionService.releaseMeetingResolutionsForExecution(meetingId); return apiClient.simulateNetwork(created, 120);
  }

  async markNoticeReceived(noticeId: string, actor: User): Promise<ApiResponse<ResolutionNotice>> { const all = this.notices(); const notice = all.find((item) => item.id === noticeId); if (!notice) throw new Error('ابلاغیه یافت نشد'); if (actor.role !== 'ADMIN' && notice.recipientName !== actor.fullName && notice.recipientDepartment !== actor.departmentName) throw new Error('فقط گیرنده ابلاغیه یا مدیر سیستم مجاز به ثبت دریافت است'); if (notice.status === 'RECEIVED') return apiClient.simulateNetwork(notice, 30); notice.status = 'RECEIVED'; notice.receivedAt = new Date().toISOString(); saveLocalCollection('resolutionNotices', all); this.audit(this.entry(actor, `ثبت دریافت ${notice.noticeNumber}`, 'RECEIVED', 'SENT')); return apiClient.simulateNetwork(notice, 60); }
}

export const boardSecretariatService = new BoardSecretariatService();
