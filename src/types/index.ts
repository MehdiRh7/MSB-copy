/**
 * Domain Models & DTO Interfaces
 * Designed for 1-to-1 mapping with ASP.NET Core (.NET 8) Web API DTOs
 */

export interface ApiResponse<T> {
  data: T;
  isSuccess: boolean;
  message?: string;
  statusCode: number;
  errors?: string[];
}

export interface ApiFilterParams {
  pageNumber?: number;
  pageIndex?: number;
  pageSize?: number;
  searchTerm?: string;
  status?: string;
  priority?: string;
  departmentId?: string;
  fromDateJalali?: string;
  toDateJalali?: string;
  sortBy?: string;
  sortDescending?: boolean;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber?: number;
  pageIndex?: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
}

export type UserRole = 
  | 'ADMIN'              // مدیر ارشد سیستم
  | 'CEO'                // مدیرعامل / ریاست سازمان
  | 'SECRETARY'          // دبیر جلسات
  | 'DEPT_MANAGER'       // مدیر واحد سازمانی / تأییدکننده
  | 'EXPERT_ASSIGNEE'    // کارشناس مسئول اجرا
  | 'AUDITOR';           // بازرس و ناظر سازمانی

export type PermissionKey =
  | 'VIEW_DASHBOARD'
  | 'VIEW_MEETINGS'
  | 'CREATE_MEETING'
  | 'EDIT_MEETING'
  | 'DELETE_MEETING'
  | 'CREATE_RESOLUTION'
  | 'VIEW_RESOLUTIONS'
  | 'EDIT_RESOLUTION'
  | 'VIEW_TASKS'
  | 'VIEW_APPROVALS'
  | 'APPROVE_RESOLUTION'
  | 'REJECT_RESOLUTION'
  | 'VIEW_REPORTS'
  | 'MANAGE_USERS'
  | 'CREATE_USER'
  | 'IMPORT_PROPOSALS_FROM_EXCEL'
  | 'VIEW_ORGANIZATION_ARCHIVE'
  | 'MANAGE_ARCHIVE_FOLDERS'
  | 'SIGN_RESOLUTION'
  // Append-only addition of new invitees/agenda items to an existing
  // meeting — deliberately separate from EDIT_MEETING, which this feature
  // does not use or imply (existing meeting data stays read-only).
  | 'APPEND_MEETING_CONTENT'
  // Final approval of a Meeting Confirmation (پس از تبدیل پیشنهاد توسط
  // مسئول دفتر) — held by «دبیر جلسه», deliberately separate from the CEO's
  // own initial-approval permission so the two review stages stay
  // independent actors.
  | 'APPROVE_MEETING_CONFIRMATION'
  // Records the official ابلاغ (notification) of a resolution whose three
  // main signatures are already complete — held by «مسئول دفتر», separate
  // from SIGN_RESOLUTION (one of the three main signers) and from
  // APPROVE_MEETING_CONFIRMATION (دبیر جلسه's own permission).
  | 'NOTIFY_RESOLUTION'
  // Viewing the notification-letter draft is intentionally independent from
  // signing it: a meeting secretary may sign an assigned notice without
  // automatically receiving access to its generated draft.
  | 'VIEW_NOTIFICATION_DRAFT'
  // «پیگیری مصوبات» — a parallel monitoring workflow that never touches
  // execution, validation, signatures or ابلاغ. Split in two levels so a
  // user can be given read-only visibility of the cartable without the
  // right to record a follow-up.
  | 'VIEW_RESOLUTION_FOLLOWUP'
  | 'MANAGE_RESOLUTION_FOLLOWUP'
  // Viewing and replacing the signature IMAGE of any user. Held by system
  // administration only: a user never manages their own signature image, so
  // this is deliberately separate from MANAGE_USERS (which covers the rest of
  // a user record) and from SIGN_RESOLUTION (the act of signing).
  | 'MANAGE_USER_SIGNATURES';

export interface User {
  id: string;
  nationalCode: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  title: string;          // سمت سازمانی
  email: string;
  phone: string;
  internalPhone?: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  organizationId: string;
  organizationName: string;
  avatarUrl?: string;
  birthDateJalali?: string;
  signatureUrl?: string;
  isActive: boolean;
  archivedAt?: string;
  permissions: string[];
}

export interface Department {
  id: string;
  name: string;
  code: string;
  managerId: string;
  managerName: string;
  parentDepartmentId?: string;
  organizationId: string;
  memberCount: number;
}

export interface Organization {
  id: string;
  name: string;
  type: 'INTERNAL' | 'SUBSIDIARY' | 'EXTERNAL_CONTRACTOR' | 'MINISTRY';
  contactPerson?: string;
  phone?: string;
}

// Pre-meeting proposed-resolution workflow: a proposer registers a topic
// and it goes directly to the CEO. An approved item then enters the office
// manager's cartable, where they
// confirm it as a "تایید جلسه" (meeting confirmation) and assign its
// presenter -> confirmed items become pickable as a ready-made agenda item
// while creating a new meeting (see CreateMeetingModal), where the office
// manager also sets its time slot -> the existing Meeting -> Resolution
// workflow takes over unchanged from there.
export type ProposalStatus =
  | 'PENDING_OFFICE_REVIEW'  // ثبت شده توسط کاربر عادی، در انتظار بررسی مسئول دفتر
  | 'PENDING_CEO_REVIEW'     // در انتظار بررسی مدیرعامل
  | 'REJECTED'               // رد شده (فقط قابل بازیابی)
  | 'APPROVED'               // تایید شده توسط مدیرعامل، در انتظار تبدیل به تایید جلسه توسط مسئول دفتر
  | 'RETURNED_FOR_REVISION'  // برگشت به پیشنهاددهنده برای اصلاح
  | 'RESUBMITTED'            // اصلاح و مجدداً برای مدیرعامل ارسال شده
  | 'NO_BOARD_REQUIRED'      // عدم نیاز به طرح در هیأت‌مدیره
  | 'CEO_ORDER_ISSUED'       // تبدیل به دستور مستقیم مدیرعامل
  // مسئول دفتر آن را به «تایید جلسه» تبدیل کرده، در انتظار تأیید نهایی دبیر
  // جلسه است (نه مدیرعامل) — تأیید اولیه مدیرعامل بالاتر (APPROVED) جدا و
  // دست‌نخورده می‌ماند.
  | 'PENDING_SECRETARY_CONFIRMATION'
  // دبیر جلسه «جهت اصلاح» زده — برمی‌گردد به کارتابل مسئول دفتر، نه مستقیم به
  // پیشنهاددهنده. مسئول دفتر پس از دیدن دلیل، خودش آن را جهت اصلاح به
  // پیشنهاددهنده برمی‌گرداند (RETURNED_FOR_REVISION).
  | 'RETURNED_BY_SECRETARY'
  | 'CONFIRMED_FOR_MEETING'  // تأیید نهایی دبیر جلسه انجام شد، آماده افزودن به یک جلسه
  | 'CONVERTED_TO_AGENDA';   // تبدیل شده به بند دستور یک جلسه مشخص

export interface WorkflowHistoryEntry {
  id: string;
  action: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  fromStatus?: string;
  toStatus: string;
  dateJalali: string;
  timeString: string;
  notes?: string;
}

export interface CeoDirectOrder {
  text: string;
  assigneeUserId: string;
  assigneeName: string;
  deadlineJalali: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  // What the assignee actually did, entered when marking the order COMPLETED.
  completionNotes?: string;
}

export interface Proposal {
  id: string;
  proposalNumber?: string;
  title: string;
  proposerName: string;
  proposerUserId?: string;
  proposerDepartmentId: string;
  proposerDepartmentName: string;
  presenterUserId?: string;
  presenterName: string;
  description: string;
  rationale?: string;
  notes?: string;
  dateJalali: string;
  attachments: Attachment[];
  status: ProposalStatus;
  managementDecisionNotes?: string;
  confirmedPresenterId?: string;
  confirmedPresenterName?: string;
  confirmedDateJalali?: string;
  confirmedTimeString?: string;
  relatedUsers?: RelatedUserRef[];
  assignedMeetingId?: string;
  assignedMeetingTitle?: string;
  ceoOrder?: CeoDirectOrder;
  history?: WorkflowHistoryEntry[];
  updatedAt?: string;
  createdAt: string;
  // Traceability only — never affects workflow.
  source?: ProposalSource;
  // «شماره نامه» پیشنهاد. هر دو مسیر ایجاد پیشنهاد (فرم دستی و Excel
  // Import) همین یک Field را پر می‌کنند — Field موازی وجود ندارد. هنگام
  // ایجاد مصوبه از روی این پیشنهاد، همین مقدار Autofill می‌شود.
  sourceLetterNumber?: string;
  sourceLetterDateJalali?: string;
  sourceLetterSubject?: string;
  /** گردش پویای پیشنهاد: تصمیم‌های دور جاری بررسی مدیرعامل/تأییدکنندگان. */
  ceoDecisions?: ApprovalDecision[];
  /** گردش پویای پیشنهاد: تصمیم‌های دور جاری تأیید نهایی (دبیر جلسه). */
  secretaryDecisions?: ApprovalDecision[];
}

/** تنظیم گردش پیشنهادها؛ نبود هر بخش = رفتار تاریخی همان مرحله. */
export interface ProposalWorkflowSettings {
  ceoReview?: ApprovalPolicy;
  secretaryConfirmation?: ApprovalPolicy;
}

export type ProposalSource = 'MANUAL' | 'EXCEL_IMPORT';

// A folder-based archive: entirely separate from the CLOSED/بایگانی proposal
// status in the CEO workflow above — a folder never changes a proposal's
// status, it only groups references to proposals for easier retrieval.
export type ArchiveScope = 'PERSONAL' | 'ORGANIZATION';

/**
 * Who may open a folder and its contents. Empty lists mean "no explicit
 * restriction" — the folder is then governed by the archive scope's own
 * permission alone, which is how every folder created before access rules
 * existed keeps behaving.
 */
export interface ArchiveFolderAccess {
  // Specific people, chosen with the existing user selector.
  userIds: string[];
  // Organizational positions (User.title), read from the real user records —
  // never a hard-coded list of positions.
  positions: string[];
}

export interface ArchiveFolder {
  id: string;
  name: string;
  description?: string;
  scope: ArchiveScope;
  // PERSONAL folders belong to one organizational unit; ORGANIZATION
  // folders are shared org-wide and carry no department owner.
  ownerDepartmentId?: string;
  access?: ArchiveFolderAccess;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

/** What an archive entry points at. Absent means PROPOSAL (legacy entries). */
export type ArchiveItemType = 'PROPOSAL' | 'RESOLUTION';

export interface ArchiveItem {
  id: string;
  // Empty for a personal archive entry, which is owned by a user rather than
  // filed into a folder.
  folderId: string;
  itemType?: ArchiveItemType;
  // Personal-archive owner. Only this user (or an admin) ever sees the entry.
  ownerUserId?: string;
  proposalId?: string;
  proposalTitle?: string;
  resolutionId?: string;
  resolutionTitle?: string;
  resolutionNumber?: string;
  movedByUserId: string;
  movedByName: string;
  movedAt: string;
}

/**
 * A resolution's archive state. Purely an archive concern: it records where
 * the resolution was filed and the working status it had beforehand, so
 * restoring puts that exact status back instead of resetting the workflow.
 */
export interface ResolutionArchiveState {
  scope: ArchiveScope;
  folderId?: string;
  folderName?: string;
  ownerUserId?: string;
  archivedByUserId: string;
  archivedByName: string;
  archivedAt: string;
  archivedDateJalali: string;
  previousExecutionStatus: ResolutionExecutionStatus;
}

export type MeetingStatus =
  | 'DRAFT'           // پیش‌نویس
  | 'AGENDA_PREPARATION'
  | 'WAITING_FOR_CEO_APPROVAL'
  | 'AGENDA_RETURNED'
  | 'READY_FOR_INVITATION'
  | 'INVITATION_SENT'
  | 'SCHEDULED'       // برنامه‌ریزی شده
  | 'IN_PROGRESS'     // در حال برگزاری
  | 'HELD'            // برگزار شده و نهایی
  | 'CANCELLED';      // لغو شده

export type MeetingType = 
  | 'BOARD_OF_DIRECTORS'    // هیئت مدیره
  | 'MANAGEMENT_COUNCIL'    // شورای مدیران
  | 'TECHNICAL_COMMITTEE'   // کمیته تخصصی و فنی
  | 'PROJECT_STEERING'      // کارگروه راهبری پروژه
  | 'CRISIS_MANAGEMENT'     // کمیته بحران و حوادث
  | 'EXTRAORDINARY';        // جلسه فوق‌العاده

export interface MeetingMember {
  userId: string;
  fullName: string;
  roleTitle: string;
  departmentName: string;
  attendanceType: 'ORGANIZER' | 'SECRETARY' | 'MEMBER' | 'GUEST';
  presenceStatus?: 'PRESENT' | 'ABSENT' | 'DELEGATED';
}

export interface AgendaItem {
  id: string;
  order: number;
  rowNumber?: number;
  title: string;
  presenter: string;
  presenterName?: string;
  // Actual time slot within the meeting's own start/end window, used to
  // validate the slot fits inside the meeting and does not overlap other
  // agenda items — see CreateMeetingModal.
  startTime?: string;
  endTime?: string;
  estimatedMinutes?: number;
  allocatedMinutes?: number;
  status?: string;
  description?: string;
  proposedResolutionDraft?: string;
  isDiscussed: boolean;
  sourceProposalId?: string;
  relatedUsers?: RelatedUserRef[];
  outcomeStatus?: 'APPROVED' | 'NOT_APPROVED' | 'NEEDS_REVISION' | 'NEEDS_MORE_REVIEW' | 'DEFERRED' | 'REFERRED' | 'CONDITIONAL' | 'CLOSED';
  outcomeNotes?: string;
  isRemoved?: boolean;
  removalReason?: string;
  // Files attached to this specific agenda item only — never the meeting's
  // own top-level attachments array (Meeting.attachments). Kept here as
  // plain Attachment metadata (no real upload backend yet) so the shape is
  // ready for a future .NET API to persist the same way.
  attachments?: Attachment[];
}

export interface MeetingGuest {
  id: string;
  fullName: string;
  roleTitle: string;
  organizationName: string;
  phone: string;
  agendaItemId?: string;
  agendaItemTitle?: string;
  requiredTime?: string;
  invitationStatus: 'NOT_SENT' | 'SENT' | 'VIEWED';
  sentAt?: string;
}

export interface MeetingInvitation {
  id: string;
  recipientType: 'MEMBER' | 'GUEST';
  recipientId: string;
  recipientName: string;
  recipientPhone?: string;
  status: 'SENT' | 'VIEWED';
  sentAt: string;
  viewedAt?: string;
  attachmentIds: string[];
}

export interface MeetingOutcomeLetter {
  id: string;
  letterNumber: string;
  meetingId: string;
  agendaItemId: string;
  proposalId?: string;
  recipientName: string;
  recipientDepartment: string;
  decision: NonNullable<AgendaItem['outcomeStatus']>;
  text: string;
  status: 'SENT';
  createdAt: string;
  createdByUserId: string;
}

export interface RelatedUserRef {
  userId: string;
  fullName: string;
  phone?: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  fileExtension: string;
  uploadDate: string; // Persian or ISO
  uploadedBy: string;
  downloadUrl: string;
}

// ——— Dynamic workflow («گردش کار پویا») ———
// هر جلسه می‌تواند سیاست تأیید/امضای مخصوص خودش را داشته باشد: چه کسانی،
// با چه منطقی (همه / یک نفر کافی / ترتیبی). نبودِ این تنظیم یعنی رفتار
// تاریخی سامانه بدون هیچ تغییر.
export type ApprovalMode =
  | 'ALL'         // همه تأییدکنندگان باید تأیید کنند (بدون ترتیب)
  | 'ANY'         // تأیید یک نفر کافی است
  | 'SEQUENTIAL'; // همه، به ترتیب تعیین‌شده

export interface ApprovalPolicy {
  approverUserIds: string[];
  mode: ApprovalMode;
}

export interface ApprovalDecision {
  userId: string;
  userName: string;
  userTitle?: string;
  decision: 'APPROVED' | 'RETURNED';
  notes?: string;
  at: string;
  dateJalali: string;
  timeString: string;
  // اگر مدیر سیستم به نمایندگی از تأییدکننده اقدام کرده باشد.
  onBehalfOfUserId?: string;
}

export type SignatureChainMode = 'SEQUENTIAL' | 'PARALLEL';

export interface SignatureChainPolicy {
  signerUserIds: string[];
  mode: SignatureChainMode;
}

export interface MeetingWorkflowConfig {
  templateId?: string;
  templateName?: string;
  /** تأیید دستورکار پیش از ارسال دعوتنامه. */
  agendaApproval: ApprovalPolicy;
  /** تأیید صورت‌جلسه پیش از نهایی‌سازی؛ خالی = مثل قبل، بدون تأیید. */
  minutesApproval?: ApprovalPolicy;
  /** زنجیره امضای مصوبات این جلسه؛ undefined = «تنظیمات گردش امضا» سراسری. */
  resolutionSignature?: SignatureChainPolicy;
  /** امضاکننده ابلاغیه مصوبات این جلسه؛ undefined = تنظیم سراسری. */
  noticeSignerUserId?: string;
}

/** قالب گردش کار قابل تعریف توسط مدیر سیستم، به تفکیک نوع جلسه. */
export interface WorkflowTemplate extends Omit<MeetingWorkflowConfig, 'templateId' | 'templateName'> {
  id: string;
  name: string;
  description?: string;
  /** مقادیر نوع جلسه همان‌طور که در فرم ایجاد جلسه انتخاب می‌شوند. */
  meetingTypes: string[];
  isDefault?: boolean;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  meetingNumber: string;        // e.g. "جلسه-۱۴۰۳-۱۴۲"
  title: string;
  type: MeetingType;
  dateJalali: string;          // e.g. "۱۴۰۳/۰۶/۱۵"
  startTime: string;           // e.g. "۰۹:۳۰"
  endTime: string;             // e.g. "۱۱:۳۰"
  location: string;            // e.g. "سالن جلسات طبقه پنجم"
  organizerId: string;
  organizerName: string;
  secretaryId: string;
  secretaryName: string;
  // افرادِ مسئول بررسی دستورکار، لزوماً عضو یا مدعو جلسه نیستند.
  // این فیلد برای جدا نگه‌داشتن «دسترسی تأیید» از «حضور در جلسه» است.
  agendaApproverUserIds?: string[];
  /** سیاست پویای تأیید و امضای همین جلسه (اختیاری؛ جلسات قدیمی ندارند). */
  workflow?: MeetingWorkflowConfig;
  /** تصمیم‌های ثبت‌شده تأییدکنندگان دستورکار در دور جاری بررسی. */
  agendaDecisions?: ApprovalDecision[];
  createdByUserId?: string;
  createdByName?: string;
  departmentId: string;
  departmentName: string;
  status: MeetingStatus;
  description?: string;
  minutesSummary?: string;     // صورتجلسه خلاصه
  members: MeetingMember[];
  agendaItems: AgendaItem[];
  guests?: MeetingGuest[];
  invitations?: MeetingInvitation[];
  agendaApprovalNotes?: string;
  // امضای دبیر جلسه روی دعوتنامه — its own signature context, recorded once
  // when the invitations go out. Attendees and guests are never asked to sign.
  invitationSignature?: DocumentSignature;
  history?: WorkflowHistoryEntry[];
  resolutionsCount: number;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

// Legacy: the per-attendee signature the collective minutes used to collect
// before completion. The workflow no longer creates or requires these — see
// boardSecretariatService — but the shape stays so minutes recorded under the
// old rules keep rendering instead of being destructively migrated away.
export interface BoardMinutesSignature {
  memberUserId: string;
  memberName: string;
  memberTitle: string;
  status: 'PENDING' | 'SIGNED';
  signedAt?: string;
  comments?: string;
}

// The contexts in which a signature is legitimately collected. Deliberately
// disjoint from Resolution.signatureWorkflow's three main signers: a دبیر
// جلسه signature here is never a fourth step in that chain.
export type DocumentSignatureContext =
  | 'MEETING_INVITATION'       // امضای دبیر جلسه روی دعوتنامه
  | 'RESOLUTION_NOTIFICATION'  // امضای دبیر جلسه روی ابلاغیه
  | 'MEETING_MINUTES';         // امضای دبیرخانه هنگام نهایی‌سازی صورت‌جلسه

/**
 * A signature outside the resolution's three-step chain. `signatureImageUrl`
 * is a SNAPSHOT of the signer's signature image at signing time, so replacing
 * a signature later never rewrites documents already signed with the old one.
 */
/** امضای رمزنگاری‌شده (ECDSA) روی چکیده محتوای سند — قابل اعتبارسنجی. */
export interface CryptoSignatureRecord {
  algorithm: string;
  contentHash: string;
  signature: string;
  publicKeyJwk: JsonWebKey;
  keyFingerprint: string;
  signedAt: string;
}

export interface DocumentSignature {
  /** امضاکننده تعیین‌شده این سند (Assigned Signer). */
  signerUserId: string;
  signerName: string;
  signerTitle: string;
  context: DocumentSignatureContext;
  signedAt: string;
  signedDateJalali: string;
  signedTimeString: string;
  signatureImageUrl: string;
  cryptoSignature?: CryptoSignatureRecord;
  // ——— Audit Trail امضای جانشینی (اختیاری؛ امضای مستقیم آنها را پر نمی‌کند) ———
  actualSignerUserId?: string;
  actualSignerName?: string;
  actualSignerTitle?: string;
  signedAsDelegate?: boolean;
  delegateForUserId?: string;
  delegateForName?: string;
}

export interface BoardMinutes {
  id: string;
  meetingId: string;
  meetingNumber: string;
  status: 'DRAFT' | 'WAITING_SIGNATURES' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'FINALIZED';
  content: string;
  copiesCount: 3;
  // Historical only — populated by minutes created before attendee signatures
  // were removed from the completion workflow. Never written by new minutes.
  signatures?: BoardMinutesSignature[];
  // The secretariat's own signature, recorded when the minutes are finalized.
  finalizedSignature?: DocumentSignature;
  /** تأییدهای صورت‌جلسه طبق سیاست پویای جلسه (در صورت تعریف). */
  approvals?: ApprovalDecision[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedByUserId: string;
  updatedByName: string;
  updatedAt: string;
  finalizedAt?: string;
  history: WorkflowHistoryEntry[];
}

export interface ResolutionNotice {
  id: string;
  noticeNumber: string;
  resolutionId: string;
  resolutionNumber: string;
  meetingId: string;
  dateJalali: string;
  recipientName: string;
  recipientDepartment: string;
  text: string;
  deadlineJalali?: string;
  attachmentIds: string[];
  status: 'SENT' | 'RECEIVED';
  sentAt: string;
  receivedAt?: string;
  createdByUserId: string;
  // Auto-generated, unique, sequential «شماره نامه ابلاغیه» — the letter
  // number of the ابلاغ document itself. Deliberately independent of
  // Resolution.resolutionNumber and of the proposal's own letterNumber;
  // issued by resolutionService only once an ابلاغ actually succeeds.
  notificationLetterNumber?: string;
  // دبیر جلسه of the originating meeting, recorded on the notice as the
  // countersigning secretary of record for this ابلاغ — a distinct
  // signature context from Resolution.signatureWorkflow's three main
  // signers, never a fourth step in that chain.
  secretaryUserId?: string;
  secretaryName?: string;
  // امضای دبیر جلسه روی ابلاغیه, with the image snapshotted at signing time.
  secretarySignature?: DocumentSignature;
}

// Resolution Approval Status at the meeting table
export type ResolutionApprovalStatus = 
  | 'NOT_APPROVED'      // تصویب نشده
  | 'APPROVED'          // مصوب
  | 'REJECTED'          // رد شده
  | 'NEEDS_REVIEW'      // نیازمند بررسی تکمیلی
  | 'CONDITIONAL_APPROVED'
  | 'REFERRED_FOR_REVIEW';

// Resolution Overall Workflow/Execution Status
export type ResolutionExecutionStatus = 
  | 'PENDING_OFFICE_SIGNATURE' // در انتظار امضای مسئول دفتر
  | 'PENDING_CEO_SIGNATURE'    // در انتظار امضای مدیرعامل
  | 'PENDING_ADMIN_SIGNATURE'  // در انتظار امضای ادمین
  | 'PENDING_SIGNATURES'       // در انتظار امضا (زنجیره امضای سفارشی جلسه)
  | 'WAITING_MINUTES_SIGNATURE' // در انتظار صورت‌جلسه تجمیعی
  | 'WAITING_NOTIFICATION'     // در انتظار ابلاغ رسمی
  // ابلاغ توسط مسئول دفتر ثبت شده (شماره نامه ابلاغیه، تاریخ/ساعت و
  // ابلاغ‌کننده ثبت شده‌اند) اما ابلاغیه هنوز توسط دبیر جلسه امضا نشده.
  // مصوبه تا پیش از آن امضا وارد اجرا نمی‌شود و Task اجرایی ساخته نمی‌شود.
  | 'PENDING_SECRETARY_NOTICE_SIGNATURE' // در انتظار امضای دبیر جلسه
  | 'NOTIFIED'                 // ابلاغ شده و آماده اجرا
  | 'NOT_STARTED'       // شروع نشده
  | 'IN_PROGRESS'       // در حال انجام
  | 'WAITING_RESPONSE'  // در انتظار پاسخ یا همکاری
  | 'NEEDS_FOLLOW_UP'   // نیازمند پیگیری دبیرخانه
  | 'DONE_BY_ASSIGNEE'  // انجام شده توسط مسئول
  | 'PENDING_APPROVAL'  // در انتظار صحه‌گذاری
  | 'APPROVED_CLOSED'   // تایید نهایی و خاتمه‌یافته
  | 'REJECTED_RETURNED' // رد شده در صحه‌گذاری و بازگشت داده شده
  | 'OVERDUE'           // عقب‌افتاده از موعد مقرر
  | 'ARCHIVED';         // بایگانی شده بدون حذف فیزیکی

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';

export interface ResolutionReferral {
  id: string;
  targetType: 'USER' | 'DEPARTMENT' | 'EXTERNAL_ORG';
  targetId: string;
  targetName: string;
  assignedRole: 'MAIN_RESPONSIBLE' | 'COOPERATOR' | 'INFORMATIONAL';
  assignedDateJalali: string;
  deadlineJalali: string;
  instructions?: string;
}

export interface VerificationStep {
  stepNumber: number;
  approverType?: 'USER' | 'DEPARTMENT' | 'ORGANIZATION';
  approverId: string;
  approverName: string;
  approverRole?: string;
  approverRoleTitle?: string;
  status: 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  actionDateJalali?: string;
  actionTime?: string;
  comments?: string;
}

export interface VerificationConfig {
  requiresVerification: boolean; // آیا نیاز به صحه‌گذاری پس از انجام دارد؟
  mode: 'SEQUENTIAL' | 'PARALLEL'; // ترتیبی یا موازی
  currentStepIndex: number;
  steps: VerificationStep[];
}

export type ResolutionSignerRole = 'OFFICE_MANAGER' | 'CEO' | 'ADMIN' | 'CUSTOM';
export type ResolutionSignatureStatus = 'WAITING_TURN' | 'PENDING' | 'SIGNED';

export interface ResolutionSignature {
  id: string;
  /** امضاکننده تعیین‌شده این مرحله (Assigned Signer) — در لحظه ایجاد مصوبه
   *  از روی «تنظیمات گردش امضا» Resolve و Snapshot می‌شود، پس تغییر بعدی
   *  تنظیمات، پرونده‌های در حال گردش را جابه‌جا نمی‌کند. */
  signerUserId: string;
  signerName: string;
  signerTitle: string;
  signerRole: ResolutionSignerRole;
  order: number;
  status: ResolutionSignatureStatus;
  signedAt?: string;
  signedDateJalali?: string;
  signedTimeString?: string;
  // Snapshot of the signer's signature image at the moment they signed, so an
  // official document keeps showing the signature it was actually signed with.
  signatureImageUrl?: string;
  /** امضای رمزنگاری‌شده واقعی روی محتوای مصوبه در لحظه امضا. */
  cryptoSignature?: CryptoSignatureRecord;
  // ——— Audit Trail امضای جانشینی (همه اختیاری؛ امضای مستقیم آنها را پر
  // نمی‌کند و رفتار قبلی دست‌نخورده می‌ماند) ———
  /** کسی که واقعاً امضا کرد. در امضای مستقیم برابر signerUserId است. */
  actualSignerUserId?: string;
  actualSignerName?: string;
  actualSignerTitle?: string;
  /** true فقط وقتی امضا به جانشینی انجام شده باشد. */
  signedAsDelegate?: boolean;
  /** کسی که جانشینی از طرف او انجام شده (همان Assigned Signer). */
  delegateForUserId?: string;
  delegateForName?: string;
}

export interface ResolutionSignatureWorkflow {
  status: 'PENDING_OFFICE_SIGNATURE' | 'PENDING_CEO_SIGNATURE' | 'PENDING_ADMIN_SIGNATURE' | 'PENDING_SIGNATURES' | 'COMPLETED';
  currentStepIndex: number;
  steps: ResolutionSignature[];
  /** ترتیبی (پیش‌فرض) یا موازی — فقط برای زنجیره‌های سفارشی جلسه. */
  mode?: SignatureChainMode;
  /** DEFAULT = سه امضای سراسری؛ MEETING = زنجیره اختصاصی جلسه. */
  source?: 'DEFAULT' | 'MEETING';
}

export interface Resolution {
  id: string;
  resolutionNumber: string;    // e.g. "مصوبه-۱۴۰۳-۹۸"
  meetingResolutionNumber?: string;
  letterNumber?: string;
  meetingId: string;
  meetingTitle: string;
  meetingNumber: string;
  agendaItemId?: string;       // شناسه بند دستور جلسه مرجع
  agendaItemTitle?: string;    // عنوان موضوع دستور جلسه مرجع
  topicTitle: string;          // عنوان موضوع
  proposerName: string;        // پیشنهاددهنده
  proposerDepartment: string;  // سازمان / واحد پیشنهاددهنده
  requestDescription: string;  // شرح درخواست
  reviewResultNotes?: string;  // نتیجه بررسی در جلسه
  approvalStatus: ResolutionApprovalStatus;
  
  // Execution details (active when approved)
  executionDescription?: string;
  mainResponsibleUserId?: string;
  mainResponsibleName?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  assignedDateJalali?: string;
  deadlineJalali?: string;
  priority: PriorityLevel;
  executionStatus: ResolutionExecutionStatus;
  
  // Multiple referrals
  referrals: ResolutionReferral[];
  
  // Verification configuration
  verificationConfig: VerificationConfig;
  signatureWorkflow?: ResolutionSignatureWorkflow;
  
  // Attachments & Logs
  attachments: Attachment[];
  completionNotes?: string;
  completionDateJalali?: string;
  executionStartDateJalali?: string;
  progressPercent?: number;
  lastAction?: string;
  obstacles?: string;
  progressReports?: ResolutionProgressReport[];
  createdAt: string;
  // ابلاغ (official notification) as its own real, independently-tracked
  // step — set only by resolutionService.notifyResolution, once, when the
  // office manager records the ابلاغ. Never implied by the three main
  // signatures completing on their own.
  //
  // مبنای زمانی، notifiedAt (ISO DateTime واقعی سیستم) است؛ تاریخ و ساعت
  // شمسی فقط برای نمایش از روی همان لحظه ثبت می‌شوند. هیچ‌کدام از کاربر
  // گرفته نمی‌شوند.
  notifiedAt?: string;
  notifiedDateJalali?: string;
  notifiedTimeString?: string;
  notifiedByUserId?: string;
  notifiedByName?: string;
  // Mirror of the issued ابلاغیه's letter number, kept on the resolution
  // purely so lists/reports can show it without joining the notices
  // collection. The ResolutionNotice record stays the source of truth.
  notificationLetterNumber?: string;
  // Set only while the resolution sits in the archive; clearing it restores
  // previousExecutionStatus. Never implies deletion — the entity is untouched.
  archive?: ResolutionArchiveState;
  // «برنامه پیگیری مصوبه» — set by the office manager when the resolution
  // is registered. Monitoring metadata only: nothing here ever changes
  // executionStatus, tasks, signatures, verification or ابلاغ.
  followUp?: ResolutionFollowUpPlan;
}

// How often a resolution should surface in the «کارتابل پیگیری».
export type ResolutionFollowUpType =
  | 'WEEKLY'      // گزارش هفتگی
  | 'MONTHLY'     // گزارش ماهانه
  | 'QUARTERLY'   // گزارش فصلی
  | 'CUSTOM';     // سفارشی — تاریخ شروع دستی

export interface ResolutionFollowUpPlan {
  enabled: boolean;
  type: ResolutionFollowUpType;
  // The date follow-up starts from; every subsequent due date is computed
  // from it (or from the last recorded follow-up) by followUpService.
  startDateJalali: string;
  nextFollowUpDateJalali?: string;
  lastFollowUpDateJalali?: string;
}

// One recorded follow-up. Kept in its own collection (not inlined on the
// Resolution) so the history is append-only and pageable, exactly like the
// notices/activity collections already are.
export interface ResolutionFollowUpRecord {
  id: string;
  resolutionId: string;
  resolutionNumber: string;
  resolutionTitle: string;
  followUpDateJalali: string;
  nextDeadlineJalali?: string;
  text: string;
  notes?: string;
  attachments: Attachment[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface ResolutionProgressReport {
  id: string;
  taskId: string;
  resolutionId: string;
  reporterUserId: string;
  reporterName: string;
  progressPercent: number;
  status: 'IN_PROGRESS' | 'WAITING_RESPONSE' | 'NEEDS_FOLLOW_UP' | 'OVERDUE';
  actionDescription: string;
  obstacles?: string;
  reportDateJalali: string;
  reportTimeString: string;
  attachments: Attachment[];
}

export interface Task {
  id: string;
  resolutionId: string;
  resolutionNumber: string;
  resolutionTitle: string;
  meetingId: string;
  meetingTitle: string;
  assignedToUserId: string;
  assignedToName: string;
  departmentId: string;
  departmentName: string;
  referralDateJalali: string;
  deadlineJalali: string;
  priority: PriorityLevel;
  status: 'NEW' | 'IN_PROGRESS' | 'WAITING_RESPONSE' | 'NEEDS_FOLLOW_UP' | 'COMPLETED' | 'PENDING_APPROVAL' | 'CLOSED' | 'RETURNED' | 'OVERDUE';
  requiresVerification: boolean;
  verificationCurrentStepTitle?: string;
  instructions: string;
  completionNotes?: string;
  completionDateJalali?: string;
  rejectionReason?: string;
  executionStartDateJalali?: string;
  progressPercent?: number;
  lastAction?: string;
  obstacles?: string;
  progressReports?: ResolutionProgressReport[];
  attachments: Attachment[];
}

export interface ApprovalCartableItem {
  id: string;
  resolutionId: string;
  resolutionNumber: string;
  resolutionTitle: string;
  meetingTitle: string;
  responsibleName: string;
  responsibleDepartment: string;
  completedDateJalali: string;
  submittedForApprovalDateJalali: string;
  stepNumber: number;
  totalSteps: number;
  stepTitle: string;
  assignedApproverId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  completionReport: string;
  attachments: Attachment[];
}

export interface ActivityLog {
  id: string;
  targetType: 'MEETING' | 'RESOLUTION' | 'TASK' | 'APPROVAL';
  targetId: string;
  action: string;
  actorName: string;
  actorRole: string;
  timestampJalali: string;
  timeString: string;
  details?: string;
  badgeColor?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal';
}

export interface AppNotification {
  id: string;
  recipientUserId: string;
  title: string;
  message: string;
  dateJalali: string;
  timeString: string;
  isRead: boolean;
  type: 'ASSIGNMENT' | 'DEADLINE' | 'FOLLOW_UP' | 'APPROVAL_REQUEST' | 'APPROVED' | 'REJECTED' | 'MEETING' | 'PERMISSION_ASSIGNED' | 'RISK_ALERT';
  targetRoute?: string;
  targetResolutionId?: string;
}

export interface DashboardKPIs {
  totalMeetings: number;
  totalResolutions: number;
  inProgressResolutions: number;
  completedClosedResolutions: number;
  pendingApprovalResolutions: number;
  overdueResolutions: number;
  myPendingTasksCount: number;
  myPendingApprovalsCount: number;
}

export interface DepartmentPerformance {
  departmentName: string;
  totalAssigned: number;
  completed: number;
  inProgress: number;
  pendingApproval: number;
  overdue: number;
  completionRatePercent: number;
}
