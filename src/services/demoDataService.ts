import { addDaysToJalaliDate, getCurrentJalaliDate } from '../utils/date';
import { loadLocalValue, saveLocalValue } from './localStore';

/**
 * داده نمایشی دمو (برچسب «نمونه») — نسخه ۳.
 *
 * - همه رکوردها شناسه «demo-» دارند و فقط در همان collectionهایی نوشته
 *   می‌شوند که سرویس‌های سامانه از آنها می‌خوانند؛ مسیر یا API موازی وجود ندارد.
 * - تاریخ‌ها نسبت به «امروز» ساخته می‌شوند تا دمو همیشه جلسه پیش‌رو، مورد
 *   معوق و مهلت نزدیک داشته باشد.
 * - بارگذاری فقط رکوردهای demo- را جایگزین می‌کند؛ داده دستی کاربر دست‌نخورده
 *   می‌ماند. بازنشانی نیز فقط همان رکوردها را حذف می‌کند.
 */
export const DEMO_DATA_VERSION = 4;
const DEMO_MARKER = 'demoDataVersion';
const DEMO_PREFIX = 'demo-';

export const DEMO_COLLECTION_KEYS = ['proposals', 'meetings', 'resolutions', 'tasks', 'approvals', 'activityLogs', 'notifications', 'resolutionNotices', 'resolutionFollowUps', 'archiveFolders', 'archiveItems'] as const;
export type DemoCollectionKey = typeof DEMO_COLLECTION_KEYS[number];

export const DEMO_COLLECTION_LABELS: Record<DemoCollectionKey, string> = {
  proposals: 'پیشنهاد',
  meetings: 'جلسه',
  resolutions: 'مصوبه',
  tasks: 'وظیفه مجری',
  approvals: 'مورد صحه‌گذاری',
  activityLogs: 'رویداد فعالیت',
  notifications: 'اعلان',
  resolutionNotices: 'ابلاغیه',
  resolutionFollowUps: 'سابقه پیگیری',
  archiveFolders: 'پوشه بایگانی',
  archiveItems: 'قلم بایگانی',
};

// رکوردهای نمایشی شکل موجودیت‌های سامانه را دارند اما عمداً سست تایپ شده‌اند
// تا ترکیب فیلدهای اختیاری مراحل مختلف گردش ساده بماند.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DemoRecord = Record<string, any>;

const isDemoRecord = (item: unknown) => Boolean(item && typeof item === 'object' && String((item as { id?: string }).id || '').startsWith(DEMO_PREFIX));

// ——— کاربران نمایشی (همان کاربران پایه سامانه؛ نام‌ها ساختگی‌اند) ———
const U = {
  admin: { id: 'user-admin', name: 'مدیر سیستم', title: 'راهبر ارشد سامانه مصوبات' },
  ceo: { id: 'user-16', name: 'مدیرعامل', title: 'مدیرعامل' },
  office: { id: 'user-17', name: 'مسئول دفتر', title: 'مسئول دفتر مدیرعامل' },
  secretary: { id: 'user-8', name: 'مهندس جواد صادقی', title: 'دبیر شورای راهبری و مدیر PMO' },
  // در دادهٔ نمایشی فقط اعضای فهرست عملیاتی حضور دارند؛ نقش‌های نمونه برای
  // نمایش مسیرهای مختلف استفاده می‌شوند، نه برای ساخت کاربر جدید.
  itManager: { id: 'user-9', name: 'مهندس سارا نیک‌نام', title: 'مدیرعامل' },
  niknam: { id: 'user-9', name: 'مهندس سارا نیک‌نام', title: 'کارشناس ارشد زیرساخت و شبکه' },
  farahani: { id: 'user-14', name: 'دکتر وحید سلیمانی', title: 'مدیر سیستم و صحه‌گذار' },
  ansari: { id: 'user-8', name: 'مهندس جواد صادقی', title: 'دبیر جلسه و مسئول دفتر' },
  auditor: { id: 'user-14', name: 'دکتر وحید سلیمانی', title: 'ناظر و بازرس ارشد سازمان' },
};
const D = {
  it: { id: 'dept-1', name: 'اداره کل فناوری اطلاعات و ارتباطات' },
  plan: { id: 'dept-2', name: 'معاونت برنامه‌ریزی و تحول سازمانی' },
  hr: { id: 'dept-3', name: 'مدیریت منابع انسانی و آموزش' },
  fin: { id: 'dept-4', name: 'اداره کل امور مالی و ذی‌حسابی' },
  pmo: { id: 'dept-7', name: 'مدیریت طرح و پشتیبانی پروژه‌ها' },
};

const createDemo = () => {
  const today = getCurrentJalaliDate();
  const d = (days: number) => addDaysToJalaliDate(today, days);
  const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

  const file = (id: string, fileName: string, days: number, by: string) => ({ id: `demo-att-${id}`, fileName, fileSizeBytes: 148000 + id.length * 9100, fileExtension: fileName.split('.').pop() || 'pdf', uploadDate: d(days), uploadedBy: by, downloadUrl: '#' });
  const hist = (id: string, action: string, actor: { id: string; name: string }, role: string, days: number, time: string, toStatus: string, notes?: string) => ({ id: `demo-ph-${id}`, action, actorUserId: actor.id, actorName: actor.name, actorRole: role, toStatus, dateJalali: d(days), timeString: time, notes });

  // ————————————————— پیشنهادها —————————————————
  const baseProposal = (id: string, n: string, title: string, proposer: { id: string; name: string }, dept: { id: string; name: string }, description: string, rationale: string, days: number) => ({
    id: `demo-proposal-${id}`, proposalNumber: `نمونه پ-۱۴۰۵-${n}`, title, proposerName: proposer.name, proposerUserId: proposer.id, proposerDepartmentId: dept.id, proposerDepartmentName: dept.name,
    presenterUserId: proposer.id, presenterName: proposer.name, description, rationale, dateJalali: d(days), attachments: [] as ReturnType<typeof file>[], createdAt: iso(days), updatedAt: iso(days), source: 'MANUAL',
    sourceLetterNumber: `۴۵/${n}/د`, sourceLetterDateJalali: d(days),
  });

  const proposals = [
    { ...baseProposal('1', '۰۱۲', 'استقرار سامانه یکپارچه پایش مصوبات در واحدهای ستادی', U.itManager, D.it, 'ایجاد پیشخوان واحد برای پیگیری مصوبات و گزارش‌گیری خودکار از وضعیت اجرا.', 'کاهش پیگیری تلفنی و شفاف‌سازی مسئولیت‌ها', -32), status: 'CONVERTED_TO_AGENDA', assignedMeetingId: 'demo-meeting-1', assignedMeetingTitle: 'شورای راهبری تحول دیجیتال — جلسه دوره‌ای', history: [hist('1a', 'ثبت پیشنهاد', U.itManager, 'DEPT_MANAGER', -32, '۰۹:۱۰', 'PENDING_CEO_REVIEW'), hist('1b', 'تأیید مدیرعامل', U.ceo, 'CEO', -29, '۱۱:۰۵', 'APPROVED'), hist('1c', 'افزوده‌شدن به دستور جلسه', U.secretary, 'SECRETARY', -24, '۱۰:۳۰', 'CONVERTED_TO_AGENDA')] },
    { ...baseProposal('2', '۰۱۴', 'بازنگری آیین‌نامه ارزیابی عملکرد کارکنان شعب', U.farahani, D.hr, 'به‌روزرسانی شاخص‌های ارزیابی متناسب با اهداف عملیاتی سال جاری.', 'هم‌راستایی ارزیابی با برنامه راهبردی', -30), status: 'CONVERTED_TO_AGENDA', assignedMeetingId: 'demo-meeting-1', assignedMeetingTitle: 'شورای راهبری تحول دیجیتال — جلسه دوره‌ای', history: [hist('2a', 'ثبت پیشنهاد', U.farahani, 'EXPERT_ASSIGNEE', -30, '۱۰:۴۰', 'PENDING_CEO_REVIEW'), hist('2b', 'افزوده‌شدن به دستور جلسه', U.secretary, 'SECRETARY', -24, '۱۰:۳۵', 'CONVERTED_TO_AGENDA')] },
    { ...baseProposal('3', '۰۱۸', 'تأمین اعتبار نوسازی تجهیزات شبکه شعب استانی', U.ansari, D.fin, 'تخصیص اعتبار مرحله اول نوسازی تجهیزات شبکه شعب پرتردد.', 'کاهش قطعی خدمات شعب', -12), status: 'CONVERTED_TO_AGENDA', assignedMeetingId: 'demo-meeting-2', assignedMeetingTitle: 'کمیته فنی زیرساخت و امنیت', history: [hist('3a', 'ثبت پیشنهاد', U.ansari, 'EXPERT_ASSIGNEE', -12, '۰۸:۵۰', 'PENDING_CEO_REVIEW'), hist('3b', 'افزوده‌شدن به دستور جلسه', U.secretary, 'SECRETARY', -8, '۱۳:۲۰', 'CONVERTED_TO_AGENDA')] },
    { ...baseProposal('4', '۰۲۱', 'راه‌اندازی میز خدمت الکترونیک برای مکاتبات داخلی', U.niknam, D.it, 'حذف گردش کاغذی مکاتبات داخلی و ثبت الکترونیک ارجاعات.', 'صرفه‌جویی زمانی و هزینه‌ای', -2), status: 'PENDING_CEO_REVIEW', history: [hist('4a', 'ثبت پیشنهاد و ارسال به مدیرعامل', U.niknam, 'EXPERT_ASSIGNEE', -2, '۱۴:۱۵', 'PENDING_CEO_REVIEW')] },
    { ...baseProposal('5', '۰۲۲', 'برگزاری دوره آموزشی امنیت اطلاعات برای کارکنان', U.itManager, D.it, 'دوره الزامی آگاهی‌رسانی امنیت اطلاعات برای کلیه کارکنان ستادی.', 'کاهش رخدادهای ناشی از خطای انسانی', -4), status: 'PENDING_CEO_REVIEW', history: [hist('5a', 'ثبت پیشنهاد و ارسال به مدیرعامل', U.itManager, 'DEPT_MANAGER', -4, '۰۹:۴۵', 'PENDING_CEO_REVIEW')] },
    { ...baseProposal('6', '۰۲۳', 'تدوین دستورالعمل نگهداشت اسناد الکترونیک', U.farahani, D.hr, 'تعیین دوره نگهداری و سطح دسترسی اسناد الکترونیک واحدها.', 'انطباق با الزامات بایگانی', -6), status: 'APPROVED', managementDecisionNotes: 'با اولویت در جلسه آتی مطرح شود.', history: [hist('6a', 'ثبت پیشنهاد', U.farahani, 'EXPERT_ASSIGNEE', -6, '۱۱:۲۰', 'PENDING_CEO_REVIEW'), hist('6b', 'تأیید مدیرعامل', U.ceo, 'CEO', -3, '۱۲:۰۰', 'APPROVED', 'با اولویت در جلسه آتی مطرح شود.')] },
    { ...baseProposal('7', '۰۲۴', 'یکپارچه‌سازی گزارش‌های مالی ماهانه واحدها', U.ansari, D.fin, 'قالب واحد گزارش مالی ماهانه برای همه واحدهای ستادی.', 'مقایسه‌پذیری گزارش‌ها', -5), status: 'PENDING_SECRETARY_CONFIRMATION', confirmedPresenterId: U.ansari.id, confirmedPresenterName: U.ansari.name, history: [hist('7a', 'ثبت پیشنهاد', U.ansari, 'EXPERT_ASSIGNEE', -5, '۰۸:۳۰', 'PENDING_CEO_REVIEW'), hist('7b', 'تأیید مدیرعامل', U.ceo, 'CEO', -3, '۱۱:۴۰', 'APPROVED'), hist('7c', 'تبدیل به تایید جلسه', U.office, 'SECRETARY', -1, '۰۹:۰۰', 'PENDING_SECRETARY_CONFIRMATION')] },
    { ...baseProposal('8', '۰۲۰', 'خرید لایسنس نرم‌افزار مدیریت پروژه', U.niknam, D.it, 'تأمین لایسنس سالانه برای تیم‌های پروژه.', 'هماهنگی برنامه زمان‌بندی پروژه‌ها', -9), status: 'RETURNED_FOR_REVISION', managementDecisionNotes: 'برآورد هزینه و مقایسه با گزینه‌های داخلی پیوست شود.', history: [hist('8a', 'ثبت پیشنهاد', U.niknam, 'EXPERT_ASSIGNEE', -9, '۱۰:۰۰', 'PENDING_CEO_REVIEW'), hist('8b', 'بازگشت جهت اصلاح', U.ceo, 'CEO', -7, '۱۲:۳۰', 'RETURNED_FOR_REVISION', 'برآورد هزینه و مقایسه با گزینه‌های داخلی پیوست شود.')] },
  ];

  // ————————————————— جلسات —————————————————
  const member = (u: { id: string; name: string; title: string }, dept: string, type: 'ORGANIZER' | 'SECRETARY' | 'MEMBER', presence?: 'PRESENT' | 'ABSENT') => ({ userId: u.id, fullName: u.name, roleTitle: u.title, departmentName: dept, attendanceType: type, ...(presence ? { presenceStatus: presence } : {}) });
  const agenda = (id: string, order: number, title: string, presenter: string, start: string, end: string, minutes: number, proposalId: string | undefined, discussed: boolean, outcome?: string) => ({ id: `demo-agenda-${id}`, order, rowNumber: order, title, presenter, presenterName: presenter, startTime: start, endTime: end, estimatedMinutes: minutes, allocatedMinutes: minutes, isDiscussed: discussed, status: discussed ? 'DISCUSSED' : 'PENDING', ...(proposalId ? { sourceProposalId: proposalId } : {}), ...(outcome ? { outcomeStatus: outcome } : {}), attachments: [] });
  const coreMembers = (presence?: 'PRESENT') => [member(U.ceo, D.plan.name, 'ORGANIZER', presence), member(U.secretary, D.pmo.name, 'SECRETARY', presence), member(U.itManager, D.it.name, 'MEMBER', presence), member(U.office, D.plan.name, 'MEMBER', presence)];
  const mHist = (id: string, action: string, days: number, time: string) => ({ id: `demo-mh-${id}`, action, actorUserId: U.secretary.id, actorName: U.secretary.name, actorRole: 'SECRETARY', toStatus: '', dateJalali: d(days), timeString: time });

  const meetings = [
    { id: 'demo-meeting-1', meetingNumber: 'نمونه ج-۱۴۰۵-۰۳۱', title: 'شورای راهبری تحول دیجیتال — جلسه دوره‌ای', type: 'PROJECT_STEERING', dateJalali: d(-21), startTime: '۰۹:۰۰', endTime: '۱۱:۰۰', location: 'سالن جلسات ساختمان مرکزی، طبقه ششم', organizerId: U.ceo.id, organizerName: U.ceo.name, secretaryId: U.secretary.id, secretaryName: U.secretary.name, departmentId: D.plan.id, departmentName: D.plan.name, status: 'HELD', description: 'بررسی طرح‌های تحول دیجیتال و آیین‌نامه‌های منابع انسانی.', minutesSummary: 'سه بند دستور جلسه بررسی و مصوبات مربوط ثبت شد.', members: coreMembers('PRESENT'), agendaItems: [agenda('1', 1, proposals[0].title, U.itManager.name, '۰۹:۰۰', '۰۹:۴۰', 40, 'demo-proposal-1', true, 'APPROVED'), agenda('2', 2, proposals[1].title, U.farahani.name, '۰۹:۴۰', '۱۰:۲۰', 40, 'demo-proposal-2', true, 'APPROVED'), agenda('3', 3, 'گزارش پیشرفت پروژه بانکداری باز', U.itManager.name, '۱۰:۲۰', '۱۱:۰۰', 40, undefined, true, 'APPROVED')], invitations: [], history: [mHist('1a', 'ارسال دعوتنامه', -25, '۱۰:۰۰'), mHist('1b', 'پایان جلسه و ثبت نتایج', -21, '۱۱:۱۰')], resolutionsCount: 3, attachments: [file('m1', 'صورتجلسه-شورای-راهبری.pdf', -21, U.secretary.name)], createdAt: iso(-27), updatedAt: iso(-21) },
    { id: 'demo-meeting-2', meetingNumber: 'نمونه ج-۱۴۰۵-۰۳۴', title: 'کمیته فنی زیرساخت و امنیت', type: 'TECHNICAL_COMMITTEE', dateJalali: d(-6), startTime: '۱۰:۰۰', endTime: '۱۲:۰۰', location: 'اتاق کنفرانس فناوری اطلاعات', organizerId: U.itManager.id, organizerName: U.itManager.name, secretaryId: U.secretary.id, secretaryName: U.secretary.name, departmentId: D.it.id, departmentName: D.it.name, status: 'HELD', description: 'بررسی نوسازی تجهیزات و سیاست‌های امنیت اطلاعات.', minutesSummary: 'سه مصوبه ثبت و برای امضا ارسال شد.', members: [...coreMembers('PRESENT'), member(U.ansari, D.fin.name, 'MEMBER', 'PRESENT')], agendaItems: [agenda('4', 1, proposals[2].title, U.ansari.name, '۱۰:۰۰', '۱۰:۴۰', 40, 'demo-proposal-3', true, 'APPROVED'), agenda('5', 2, 'سیاست پشتیبان‌گیری از داده‌های حیاتی', U.niknam.name, '۱۰:۴۰', '۱۱:۲۰', 40, undefined, true, 'APPROVED'), agenda('6', 3, 'تمدید قرارداد پشتیبانی مرکز داده', U.itManager.name, '۱۱:۲۰', '۱۲:۰۰', 40, undefined, true, 'APPROVED')], invitations: [], history: [mHist('2a', 'ارسال دعوتنامه', -9, '۱۴:۰۰'), mHist('2b', 'پایان جلسه و ثبت نتایج', -6, '۱۲:۱۰')], resolutionsCount: 3, attachments: [], createdAt: iso(-11), updatedAt: iso(-6) },
    { id: 'demo-meeting-3', meetingNumber: 'نمونه ج-۱۴۰۵-۰۳۶', title: 'شورای مدیران — بررسی عملکرد سه‌ماهه', type: 'MANAGEMENT_COUNCIL', dateJalali: d(2), startTime: '۰۹:۳۰', endTime: '۱۱:۳۰', location: 'سالن جلسات ساختمان مرکزی، طبقه ششم', organizerId: U.ceo.id, organizerName: U.ceo.name, secretaryId: U.secretary.id, secretaryName: U.secretary.name, departmentId: D.plan.id, departmentName: D.plan.name, status: 'INVITATION_SENT', description: 'مرور شاخص‌های عملکرد واحدها و مصوبات معوق.', members: [...coreMembers(), member(U.ansari, D.fin.name, 'MEMBER'), member(U.farahani, D.hr.name, 'MEMBER')], agendaItems: [agenda('7', 1, 'گزارش عملکرد سه‌ماهه واحدهای ستادی', U.itManager.name, '۰۹:۳۰', '۱۰:۱۵', 45, undefined, false), agenda('8', 2, 'بررسی مصوبات معوق و تعیین تکلیف', U.office.name, '۱۰:۱۵', '۱۱:۰۰', 45, undefined, false), agenda('9', 3, proposals[5].title, U.farahani.name, '۱۱:۰۰', '۱۱:۳۰', 30, undefined, false)], invitations: [], history: [mHist('3a', 'ارسال دعوتنامه', -1, '۱۵:۳۰')], resolutionsCount: 0, attachments: [file('m3', 'دستور-جلسه-شورای-مدیران.pdf', -1, U.secretary.name)], createdAt: iso(-4), updatedAt: iso(-1) },
    { id: 'demo-meeting-4', meetingNumber: 'نمونه ج-۱۴۰۵-۰۳۷', title: 'کمیته منابع انسانی و آموزش', type: 'TECHNICAL_COMMITTEE', dateJalali: d(9), startTime: '۱۳:۰۰', endTime: '۱۴:۳۰', location: 'اتاق جلسات معاونت برنامه‌ریزی', organizerId: U.itManager.id, organizerName: U.itManager.name, secretaryId: U.secretary.id, secretaryName: U.secretary.name, departmentId: D.hr.id, departmentName: D.hr.name, status: 'WAITING_FOR_CEO_APPROVAL', description: 'برنامه آموزشی نیمه دوم سال.', members: [...coreMembers(), member(U.farahani, D.hr.name, 'MEMBER')], agendaItems: [agenda('10', 1, 'برنامه آموزش نیمه دوم سال', U.farahani.name, '۱۳:۰۰', '۱۳:۴۵', 45, undefined, false), agenda('11', 2, 'ارزیابی دوره‌های برگزارشده', U.farahani.name, '۱۳:۴۵', '۱۴:۳۰', 45, undefined, false)], invitations: [], history: [mHist('4a', 'ارسال دستور جلسه برای تأیید مدیرعامل', -1, '۰۹:۲۰')], resolutionsCount: 0, attachments: [], createdAt: iso(-2), updatedAt: iso(-1) },
    { id: 'demo-meeting-5', meetingNumber: 'نمونه ج-۱۴۰۵-۰۲۴', title: 'کمیته منابع انسانی — برنامه آموزش سالانه', type: 'TECHNICAL_COMMITTEE', dateJalali: d(-48), startTime: '۱۰:۰۰', endTime: '۱۱:۳۰', location: 'اتاق جلسات معاونت برنامه‌ریزی', organizerId: U.itManager.id, organizerName: U.itManager.name, secretaryId: U.secretary.id, secretaryName: U.secretary.name, departmentId: D.hr.id, departmentName: D.hr.name, status: 'HELD', description: 'تصویب برنامه آموزش سالانه کارکنان.', minutesSummary: 'دو مصوبه ثبت و اجرا شد.', members: [...coreMembers('PRESENT'), member(U.farahani, D.hr.name, 'MEMBER', 'PRESENT')], agendaItems: [agenda('12', 1, 'برنامه آموزش سالانه کارکنان', U.farahani.name, '۱۰:۰۰', '۱۰:۴۵', 45, undefined, true, 'APPROVED'), agenda('13', 2, 'نظام پیشنهادها و ایده‌های کارکنان', U.farahani.name, '۱۰:۴۵', '۱۱:۳۰', 45, undefined, true, 'APPROVED')], invitations: [], history: [mHist('5a', 'پایان جلسه و ثبت نتایج', -48, '۱۱:۴۰')], resolutionsCount: 2, attachments: [], createdAt: iso(-55), updatedAt: iso(-48) },
    { id: 'demo-meeting-6', meetingNumber: 'نمونه ج-۱۴۰۵-۰۱۸', title: 'شورای مدیران — بودجه و منابع', type: 'MANAGEMENT_COUNCIL', dateJalali: d(-78), startTime: '۰۹:۰۰', endTime: '۱۱:۰۰', location: 'سالن جلسات ساختمان مرکزی، طبقه ششم', organizerId: U.ceo.id, organizerName: U.ceo.name, secretaryId: U.secretary.id, secretaryName: U.secretary.name, departmentId: D.plan.id, departmentName: D.plan.name, status: 'HELD', description: 'بررسی بودجه جاری و تخصیص منابع.', minutesSummary: 'مصوبات بودجه ثبت و ابلاغ شد.', members: [...coreMembers('PRESENT'), member(U.ansari, D.fin.name, 'MEMBER', 'PRESENT')], agendaItems: [agenda('14', 1, 'بازنگری سقف هزینه‌های جاری واحدها', U.ansari.name, '۰۹:۰۰', '۱۰:۰۰', 60, undefined, true, 'APPROVED'), agenda('15', 2, 'استانداردسازی گزارش‌های مالی شعب', U.ansari.name, '۱۰:۰۰', '۱۱:۰۰', 60, undefined, true, 'APPROVED')], invitations: [], history: [mHist('6a', 'پایان جلسه و ثبت نتایج', -78, '۱۱:۱۰')], resolutionsCount: 2, attachments: [], createdAt: iso(-85), updatedAt: iso(-78) },
  ];

  // ————————————————— مصوبات —————————————————
  const signed = (order: 1 | 2 | 3, u: { id: string; name: string; title: string }, role: 'OFFICE_MANAGER' | 'CEO' | 'ADMIN', days: number, time: string, rid: string) => ({ id: `demo-sig-${rid}-${order}`, signerUserId: u.id, signerName: u.name, signerTitle: u.title, signerRole: role, order, status: 'SIGNED', signedAt: iso(days), signedDateJalali: d(days), signedTimeString: time, actualSignerUserId: u.id, actualSignerName: u.name, actualSignerTitle: u.title });
  const pendingSig = (order: 1 | 2 | 3, u: { id: string; name: string; title: string }, role: 'OFFICE_MANAGER' | 'CEO' | 'ADMIN', status: 'PENDING' | 'WAITING_TURN', rid: string) => ({ id: `demo-sig-${rid}-${order}`, signerUserId: u.id, signerName: u.name, signerTitle: u.title, signerRole: role, order, status });
  const completeSignatures = (rid: string, days: number) => ({ status: 'COMPLETED', currentStepIndex: 3, steps: [signed(1, U.office, 'OFFICE_MANAGER', days, '۰۹:۱۰', rid), signed(2, U.ceo, 'CEO', days, '۱۱:۳۰', rid), signed(3, U.admin, 'ADMIN', days, '۱۴:۰۵', rid)] });
  const noVerification = { requiresVerification: false, mode: 'SEQUENTIAL', currentStepIndex: 0, steps: [] as unknown[] };
  const auditorVerification = (status: 'NOT_STARTED' | 'PENDING' | 'APPROVED') => ({ requiresVerification: true, mode: 'SEQUENTIAL', currentStepIndex: 0, steps: [{ stepNumber: 1, approverType: 'USER', approverId: U.auditor.id, approverName: U.auditor.name, approverRoleTitle: U.auditor.title, status, ...(status === 'APPROVED' ? { actionDateJalali: d(-10), actionTime: '۱۰:۲۰', comments: 'مستندات کامل است.' } : {}) }] });
  const referral = (rid: string, u: { id: string; name: string }, days: number, deadline: number, instructions: string) => [{ id: `demo-ref-${rid}`, targetType: 'USER', targetId: u.id, targetName: u.name, assignedRole: 'MAIN_RESPONSIBLE', assignedDateJalali: d(days), deadlineJalali: d(deadline), instructions }];
  const notified = (days: number, n: string) => ({ notifiedAt: iso(days), notifiedDateJalali: d(days), notifiedTimeString: '۱۰:۰۰', notifiedByUserId: U.office.id, notifiedByName: U.office.name, notificationLetterNumber: `ابلاغ/۱۴۰۵/${n}` });
  const report = (id: string, rid: string, taskId: string, u: { id: string; name: string }, percent: number, status: string, action: string, days: number, obstacles?: string) => ({ id: `demo-progress-${id}`, taskId, resolutionId: rid, reporterUserId: u.id, reporterName: u.name, progressPercent: percent, status, actionDescription: action, ...(obstacles ? { obstacles } : {}), reportDateJalali: d(days), reportTimeString: '۱۴:۳۰', attachments: [] });

  const r1Reports = [report('1a', 'demo-resolution-1', 'demo-task-1', U.niknam, 35, 'IN_PROGRESS', 'نیازسنجی واحدها و طراحی پیشخوان انجام شد.', -12), report('1b', 'demo-resolution-1', 'demo-task-1', U.niknam, 65, 'IN_PROGRESS', 'نسخه آزمایشی در دو واحد ستادی مستقر و بازخوردها جمع‌آوری شد.', -3)];
  const r2Reports = [report('2a', 'demo-resolution-2', 'demo-task-2', U.ansari, 40, 'WAITING_RESPONSE', 'درخواست تأمین اعتبار به معاونت مالی ارسال شد.', -8, 'در انتظار پاسخ معاونت مالی درباره سقف اعتبار')];
  const r3Reports = [report('3a', 'demo-resolution-3', 'demo-task-3', U.farahani, 100, 'IN_PROGRESS', 'پیش‌نویس آیین‌نامه بازنگری‌شده تهیه و به صحه‌گذار ارسال شد.', -2)];

  const resolutionBase = (id: string, num: string, meeting: typeof meetings[number], agendaId: string, topic: string, proposer: string, proposerDept: string, request: string) => ({ id: `demo-resolution-${id}`, resolutionNumber: `نمونه م-۱۴۰۵-${num}`, meetingId: meeting.id, meetingTitle: meeting.title, meetingNumber: meeting.meetingNumber, agendaItemId: `demo-agenda-${agendaId}`, agendaItemTitle: meeting.agendaItems.find((item) => item.id === `demo-agenda-${agendaId}`)?.title, topicTitle: topic, proposerName: proposer, proposerDepartment: proposerDept, requestDescription: request, reviewResultNotes: 'پس از بحث و بررسی به تصویب رسید.', approvalStatus: 'APPROVED', attachments: [] as ReturnType<typeof file>[] });

  const resolutions: DemoRecord[] = [
    { ...resolutionBase('1', '۱۰۲', meetings[0], '1', 'استقرار سامانه پایش مصوبات در واحدهای ستادی', U.itManager.name, D.it.name, 'پیشخوان پایش مصوبات در واحدهای ستادی مستقر و گزارش ماهانه ارائه شود.'), meetingResolutionNumber: '۱', letterNumber: '۴۵/۰۱۲/د', executionDescription: 'استقرار مرحله‌ای در واحدهای ستادی و آموزش کاربران کلیدی.', mainResponsibleUserId: U.niknam.id, mainResponsibleName: U.niknam.name, responsibleDepartmentId: D.it.id, responsibleDepartmentName: D.it.name, assignedDateJalali: d(-18), deadlineJalali: d(14), priority: 'HIGH', executionStatus: 'IN_PROGRESS', referrals: referral('1', U.niknam, -18, 14, 'گزارش پیشرفت را هر دو هفته ثبت کنید.'), verificationConfig: auditorVerification('NOT_STARTED'), signatureWorkflow: completeSignatures('1', -20), progressPercent: 65, lastAction: r1Reports[1].actionDescription, progressReports: r1Reports, createdAt: iso(-21), ...notified(-18, '۰۴۱'), followUp: { enabled: true, type: 'WEEKLY', startDateJalali: d(-18), nextFollowUpDateJalali: d(1), lastFollowUpDateJalali: d(-6) }, attachments: [file('r1', 'طرح-استقرار-پیشخوان.pdf', -18, U.niknam.name)] },
    { ...resolutionBase('2', '۱۰۶', meetings[1], '4', 'تأمین اعتبار نوسازی تجهیزات شبکه شعب', U.ansari.name, D.fin.name, 'اعتبار مرحله اول نوسازی تجهیزات شبکه شعب پرتردد تأمین شود.'), meetingResolutionNumber: '۱', letterNumber: '۴۵/۰۱۸/د', executionDescription: 'تهیه برآورد، اخذ مصوبه مالی و ابلاغ اعتبار به واحد فناوری.', mainResponsibleUserId: U.ansari.id, mainResponsibleName: U.ansari.name, responsibleDepartmentId: D.fin.id, responsibleDepartmentName: D.fin.name, assignedDateJalali: d(-15), deadlineJalali: d(-4), priority: 'URGENT', executionStatus: 'OVERDUE', referrals: referral('2', U.ansari, -15, -4, 'نتیجه تأمین اعتبار را تا مهلت اعلام کنید.'), verificationConfig: noVerification, signatureWorkflow: completeSignatures('2', -16), progressPercent: 40, lastAction: r2Reports[0].actionDescription, obstacles: r2Reports[0].obstacles, progressReports: r2Reports, createdAt: iso(-6), ...notified(-15, '۰۴۳'), followUp: { enabled: true, type: 'WEEKLY', startDateJalali: d(-15), nextFollowUpDateJalali: d(-1) } },
    { ...resolutionBase('3', '۱۰۳', meetings[0], '2', 'بازنگری آیین‌نامه ارزیابی عملکرد کارکنان شعب', U.farahani.name, D.hr.name, 'آیین‌نامه ارزیابی عملکرد با شاخص‌های جدید بازنگری شود.'), meetingResolutionNumber: '۲', executionDescription: 'تهیه پیش‌نویس، اخذ نظر واحدها و ارائه نسخه نهایی.', mainResponsibleUserId: U.farahani.id, mainResponsibleName: U.farahani.name, responsibleDepartmentId: D.hr.id, responsibleDepartmentName: D.hr.name, assignedDateJalali: d(-18), deadlineJalali: d(5), priority: 'MEDIUM', executionStatus: 'PENDING_APPROVAL', referrals: referral('3', U.farahani, -18, 5, 'پس از تهیه پیش‌نویس، برای صحه‌گذاری ارسال کنید.'), verificationConfig: auditorVerification('PENDING'), signatureWorkflow: completeSignatures('3', -20), progressPercent: 100, lastAction: r3Reports[0].actionDescription, progressReports: r3Reports, completionNotes: 'پیش‌نویس نهایی آیین‌نامه با نظر واحدها تهیه شد و پیوست است.', completionDateJalali: d(-2), createdAt: iso(-21), ...notified(-18, '۰۴۲'), attachments: [file('r3', 'پیش‌نویس-آیین‌نامه-ارزیابی.docx', -2, U.farahani.name)] },
    { ...resolutionBase('4', '۱۰۴', meetings[0], '3', 'تهیه نقشه راه بانکداری باز', U.itManager.name, D.it.name, 'نقشه راه سه‌ساله بانکداری باز تهیه و ارائه شود.'), meetingResolutionNumber: '۳', executionDescription: 'تدوین نقشه راه و ارائه در شورای راهبری.', mainResponsibleUserId: U.niknam.id, mainResponsibleName: U.niknam.name, responsibleDepartmentId: D.it.id, responsibleDepartmentName: D.it.name, assignedDateJalali: d(-18), deadlineJalali: d(-8), priority: 'MEDIUM', executionStatus: 'APPROVED_CLOSED', referrals: referral('4', U.niknam, -18, -8, 'نقشه راه را در قالب مصوب ارائه کنید.'), verificationConfig: auditorVerification('APPROVED'), signatureWorkflow: completeSignatures('4', -20), progressPercent: 100, lastAction: 'نقشه راه ارائه و صحه‌گذاری شد.', completionNotes: 'نقشه راه ارائه و در شورا تأیید شد.', completionDateJalali: d(-11), createdAt: iso(-21), ...notified(-18, '۰۴۰') },
    { ...resolutionBase('5', '۱۰۷', meetings[1], '5', 'سیاست پشتیبان‌گیری از داده‌های حیاتی', U.niknam.name, D.it.name, 'سیاست پشتیبان‌گیری روزانه و آزمون بازیابی فصلی ابلاغ شود.'), meetingResolutionNumber: '۲', executionDescription: 'تدوین دستورالعمل و اجرای آزمون بازیابی.', mainResponsibleUserId: U.niknam.id, mainResponsibleName: U.niknam.name, responsibleDepartmentId: D.it.id, responsibleDepartmentName: D.it.name, assignedDateJalali: d(-5), deadlineJalali: d(25), priority: 'HIGH', executionStatus: 'PENDING_CEO_SIGNATURE', referrals: [], verificationConfig: noVerification, signatureWorkflow: { status: 'PENDING_CEO_SIGNATURE', currentStepIndex: 1, steps: [signed(1, U.office, 'OFFICE_MANAGER', -5, '۱۰:۱۵', '5'), pendingSig(2, U.ceo, 'CEO', 'PENDING', '5'), pendingSig(3, U.admin, 'ADMIN', 'WAITING_TURN', '5')] }, createdAt: iso(-6) },
    { ...resolutionBase('6', '۱۰۸', meetings[1], '6', 'تمدید قرارداد پشتیبانی مرکز داده', U.itManager.name, D.it.name, 'قرارداد پشتیبانی مرکز داده برای یک سال تمدید شود.'), meetingResolutionNumber: '۳', executionDescription: 'مذاکره با پیمانکار و تنظیم الحاقیه قرارداد.', mainResponsibleUserId: U.itManager.id, mainResponsibleName: U.itManager.name, responsibleDepartmentId: D.it.id, responsibleDepartmentName: D.it.name, assignedDateJalali: d(-4), deadlineJalali: d(20), priority: 'MEDIUM', executionStatus: 'WAITING_NOTIFICATION', referrals: [], verificationConfig: noVerification, signatureWorkflow: completeSignatures('6', -4), createdAt: iso(-6) },
    { ...resolutionBase('7', '۱۰۵', meetings[0], '3', 'راه‌اندازی تیم پاسخ‌گویی به رخدادهای امنیتی', U.itManager.name, D.it.name, 'تیم پاسخ‌گویی به رخداد با شرح وظایف مشخص تشکیل شود.'), agendaItemId: undefined, meetingResolutionNumber: '۴', executionDescription: 'تعیین اعضا، شرح وظایف و فرایند گزارش رخداد.', mainResponsibleUserId: U.niknam.id, mainResponsibleName: U.niknam.name, responsibleDepartmentId: D.it.id, responsibleDepartmentName: D.it.name, assignedDateJalali: d(-3), deadlineJalali: d(30), priority: 'HIGH', executionStatus: 'PENDING_SECRETARY_NOTICE_SIGNATURE', referrals: [], verificationConfig: noVerification, signatureWorkflow: completeSignatures('7', -5), createdAt: iso(-21), ...notified(-1, '۰۴۴') },
    ...([
      ['8', '۰۸۷', 4, '12', 'اجرای برنامه آموزش سالانه کارکنان', U.farahani, D.hr, -45, -12, -14],
      ['9', '۰۸۸', 4, '13', 'راه‌اندازی نظام پیشنهادها', U.farahani, D.hr, -45, -20, -22],
      ['10', '۰۷۲', 5, '14', 'بازنگری سقف هزینه‌های جاری واحدها', U.ansari, D.fin, -75, -40, -38],
      ['11', '۰۷۳', 5, '15', 'استانداردسازی گزارش‌های مالی شعب', U.ansari, D.fin, -75, -30, -33],
    ] as const).map(([id, num, mi, ag, topic, who, dept, start, deadline, done]) => ({ ...resolutionBase(id, num, meetings[mi], ag, topic, who.name, dept.name, `${topic} طبق تصمیم جلسه انجام شود.`), meetingResolutionNumber: '۱', executionDescription: `${topic} و ارائه گزارش پایانی.`, mainResponsibleUserId: who.id, mainResponsibleName: who.name, responsibleDepartmentId: dept.id, responsibleDepartmentName: dept.name, assignedDateJalali: d(start), deadlineJalali: d(deadline), priority: 'MEDIUM', executionStatus: 'APPROVED_CLOSED', referrals: referral(id, who, start, deadline, 'پس از اجرا گزارش پایانی ثبت شود.'), verificationConfig: noVerification, signatureWorkflow: completeSignatures(id, start - 1), progressPercent: 100, lastAction: 'اجرا کامل و مصوبه مختومه شد.', completionNotes: 'اجرا طبق برنامه کامل شد.', completionDateJalali: d(done), createdAt: iso(start - 2), ...notified(start, num) })),
  ];

  // ————————————————— وظایف مجری —————————————————
  const taskFrom = (r: DemoRecord, status: string, extra: Record<string, unknown> = {}) => ({ id: `demo-task-${r.id.replace('demo-resolution-', '')}`, resolutionId: r.id, resolutionNumber: r.resolutionNumber, resolutionTitle: r.topicTitle, meetingId: r.meetingId, meetingTitle: r.meetingTitle, assignedToUserId: r.mainResponsibleUserId, assignedToName: r.mainResponsibleName, departmentId: r.responsibleDepartmentId, departmentName: r.responsibleDepartmentName, referralDateJalali: r.assignedDateJalali, deadlineJalali: r.deadlineJalali, priority: r.priority, status, requiresVerification: r.verificationConfig.requiresVerification, instructions: r.executionDescription, progressPercent: r.progressPercent, lastAction: r.lastAction, progressReports: r.progressReports || [], attachments: [], executionStartDateJalali: r.assignedDateJalali, ...extra });
  const tasks = [
    taskFrom(resolutions[0], 'IN_PROGRESS', { verificationCurrentStepTitle: 'صحه‌گذاری ناظر' }),
    taskFrom(resolutions[1], 'OVERDUE', { obstacles: resolutions[1].obstacles }),
    taskFrom(resolutions[2], 'PENDING_APPROVAL', { verificationCurrentStepTitle: 'صحه‌گذاری ناظر', completionNotes: resolutions[2].completionNotes, completionDateJalali: d(-2) }),
    taskFrom(resolutions[3], 'CLOSED', { completionNotes: resolutions[3].completionNotes, completionDateJalali: d(-11) }),
    ...resolutions.slice(7).map((r) => taskFrom(r, 'CLOSED', { completionNotes: r.completionNotes, completionDateJalali: r.completionDateJalali })),
  ];

  // ————————————————— صحه‌گذاری —————————————————
  const approvals = [
    { id: 'demo-approval-3', resolutionId: resolutions[2].id, resolutionNumber: resolutions[2].resolutionNumber, resolutionTitle: resolutions[2].topicTitle, meetingTitle: resolutions[2].meetingTitle, responsibleName: U.farahani.name, responsibleDepartment: D.hr.name, completedDateJalali: d(-2), submittedForApprovalDateJalali: d(-2), stepNumber: 1, totalSteps: 1, stepTitle: 'صحه‌گذاری ناظر', assignedApproverId: U.auditor.id, status: 'PENDING', completionReport: resolutions[2].completionNotes, attachments: resolutions[2].attachments },
    { id: 'demo-approval-4', resolutionId: resolutions[3].id, resolutionNumber: resolutions[3].resolutionNumber, resolutionTitle: resolutions[3].topicTitle, meetingTitle: resolutions[3].meetingTitle, responsibleName: U.niknam.name, responsibleDepartment: D.it.name, completedDateJalali: d(-11), submittedForApprovalDateJalali: d(-11), stepNumber: 1, totalSteps: 1, stepTitle: 'صحه‌گذاری ناظر', assignedApproverId: U.auditor.id, status: 'APPROVED', completionReport: resolutions[3].completionNotes, attachments: [] },
  ];

  // ————————————————— ابلاغیه‌ها —————————————————
  const notice = (r: DemoRecord, days: number, signedDays?: number) => ({ id: `demo-notice-${r.id.replace('demo-resolution-', '')}`, noticeNumber: r.notificationLetterNumber, resolutionId: r.id, resolutionNumber: r.resolutionNumber, meetingId: r.meetingId, dateJalali: d(days), recipientName: r.mainResponsibleName, recipientDepartment: r.responsibleDepartmentName, text: `به استناد مصوبه ${r.resolutionNumber}، اجرای «${r.topicTitle}» تا ${r.deadlineJalali} به شما ابلاغ می‌گردد.`, deadlineJalali: r.deadlineJalali, attachmentIds: [], status: 'SENT', sentAt: iso(days), createdByUserId: U.office.id, notificationLetterNumber: r.notificationLetterNumber, secretaryUserId: U.secretary.id, secretaryName: U.secretary.name, ...(signedDays !== undefined ? { secretarySignature: { signerUserId: U.secretary.id, signerName: U.secretary.name, signerTitle: U.secretary.title, context: 'RESOLUTION_NOTIFICATION', signedAt: iso(signedDays), signedDateJalali: d(signedDays), signedTimeString: '۱۱:۰۰', actualSignerUserId: U.secretary.id, actualSignerName: U.secretary.name, actualSignerTitle: U.secretary.title, signedAsDelegate: false } } : {}) });
  const resolutionNotices = [notice(resolutions[0], -18, -18), notice(resolutions[1], -15, -15), notice(resolutions[2], -18, -18), notice(resolutions[3], -18, -18), notice(resolutions[6], -1)];

  // ————————————————— فعالیت‌ها —————————————————
  const log = (id: string, type: string, targetId: string, action: string, actor: { name: string; title: string }, days: number, time: string, details: string, color: string) => ({ id: `demo-log-${id}`, targetType: type, targetId, action, actorName: actor.name, actorRole: actor.title, timestampJalali: d(days), timeString: time, details, badgeColor: color });
  const activityLogs = [
    log('1', 'RESOLUTION', 'demo-resolution-7', 'ثبت ابلاغ و ارسال برای امضای دبیر', U.office, -1, '۱۰:۰۰', 'ابلاغیه ابلاغ/۱۴۰۵/۰۴۴ صادر شد.', 'purple'),
    log('2', 'RESOLUTION', 'demo-resolution-3', 'ارسال برای صحه‌گذاری', U.farahani, -2, '۱۵:۱۰', 'گزارش اتمام و پیش‌نویس نهایی پیوست شد.', 'amber'),
    log('3', 'RESOLUTION', 'demo-resolution-1', 'ثبت گزارش پیشرفت ۶۵٪', U.niknam, -3, '۱۴:۳۰', 'استقرار آزمایشی در دو واحد ستادی.', 'blue'),
    log('4', 'RESOLUTION', 'demo-resolution-6', 'تکمیل امضاهای مصوبه', U.admin, -4, '۱۴:۰۵', 'مصوبه آماده ابلاغ است.', 'teal'),
    log('5', 'RESOLUTION', 'demo-resolution-5', 'امضای مسئول دفتر', U.office, -5, '۱۰:۱۵', 'در انتظار امضای مدیرعامل.', 'blue'),
    log('6', 'MEETING', 'demo-meeting-2', 'برگزاری جلسه و ثبت مصوبات', U.secretary, -6, '۱۲:۱۰', 'سه مصوبه ثبت شد.', 'green'),
    log('7', 'RESOLUTION', 'demo-resolution-2', 'ثبت گزارش پیشرفت ۴۰٪', U.ansari, -8, '۱۴:۳۰', 'در انتظار پاسخ معاونت مالی.', 'amber'),
    log('8', 'RESOLUTION', 'demo-resolution-4', 'صحه‌گذاری و خاتمه مصوبه', U.auditor, -10, '۱۰:۲۰', 'مستندات کامل است.', 'green'),
  ];

  // ————————————————— اعلان‌ها —————————————————
  const notif = (id: string, to: string, title: string, message: string, days: number, time: string, type: string, route: string, resolutionId?: string, isRead = false) => ({ id: `demo-notification-${id}`, recipientUserId: to, title, message, dateJalali: d(days), timeString: time, isRead, type, targetRoute: route, ...(resolutionId ? { targetResolutionId: resolutionId } : {}) });
  const notifications = [
    notif('1', U.niknam.id, 'ارجاع مصوبه', `${resolutions[0].resolutionNumber} — ${resolutions[0].topicTitle}`, -18, '۱۰:۰۵', 'ASSIGNMENT', 'tasks', resolutions[0].id, true),
    notif('2', U.auditor.id, 'درخواست صحه‌گذاری', `${resolutions[2].resolutionNumber} — ${resolutions[2].topicTitle}`, -2, '۱۵:۱۲', 'APPROVAL_REQUEST', 'approvals'),
    notif('3', U.ceo.id, 'مصوبه در انتظار امضای شما', `${resolutions[4].resolutionNumber} — ${resolutions[4].topicTitle}`, -5, '۱۰:۱۶', 'APPROVAL_REQUEST', 'resolutions', resolutions[4].id),
    notif('4', U.ceo.id, 'پیشنهاد جدید برای تصمیم', proposals[4].title, -3, '۱۰:۱۱', 'FOLLOW_UP', 'proposals'),
    notif('5', U.secretary.id, 'ابلاغیه در انتظار امضا', `${resolutions[6].resolutionNumber} — ${resolutions[6].topicTitle}`, -1, '۱۰:۰۱', 'APPROVAL_REQUEST', 'notification-inbox'),
    notif('6', U.office.id, 'مصوبه آماده ابلاغ', `${resolutions[5].resolutionNumber} — ${resolutions[5].topicTitle}`, -4, '۱۴:۰۶', 'FOLLOW_UP', 'notification-inbox'),
    notif('7', U.ansari.id, 'تأخیر در اجرای مصوبه', `${resolutions[1].resolutionNumber} — مهلت ${resolutions[1].deadlineJalali}`, -3, '۰۸:۰۰', 'DEADLINE', 'tasks', resolutions[1].id),
    notif('9', U.admin.id, 'مصوبه در انتظار امضای ادمین', 'پس از امضای مدیرعامل، مصوبه «سیاست پشتیبان‌گیری» به کارتابل شما می‌آید.', -1, '۰۹:۳۰', 'FOLLOW_UP', 'resolutions'),
    notif('10', U.office.id, 'موعد پیگیری', `پیگیری هفتگی ${resolutions[1].resolutionNumber} سررسید شده است.`, 0, '۰۸:۰۰', 'FOLLOW_UP', 'follow-up'),
    notif('11', U.ceo.id, 'تأیید دستور جلسه', `دستور جلسه «${meetings[3].title}» منتظر تأیید شماست.`, -1, '۰۹:۲۲', 'MEETING', 'meetings'),
    notif('8', U.itManager.id, 'دعوت به جلسه', `${meetings[2].title} — ${meetings[2].dateJalali} ساعت ${meetings[2].startTime}`, -1, '۱۵:۳۰', 'MEETING', 'meetings'),
  ];

  const resolutionFollowUps = [
    { id: 'demo-followup-1', resolutionId: resolutions[0].id, resolutionNumber: resolutions[0].resolutionNumber, resolutionTitle: resolutions[0].topicTitle, followUpDateJalali: d(-6), nextDeadlineJalali: d(1), text: 'پیشرفت استقرار آزمایشی از مجری استعلام شد.', attachments: [], createdByUserId: U.office.id, createdByName: U.office.name, createdAt: iso(-6) },
  ];

  const archiveFolders = [
    { id: 'demo-folder-1', name: 'مصوبات شورای راهبری ۱۴۰۵', description: 'پرونده‌های خاتمه‌یافته شورای راهبری', scope: 'ORGANIZATION', createdByUserId: U.office.id, createdByName: U.office.name, createdAt: iso(-10), access: { userIds: [], positions: [] } },
  ];

  return { proposals, meetings, resolutions, tasks, approvals, activityLogs, notifications, resolutionNotices, resolutionFollowUps, archiveFolders, archiveItems: [
    { id: 'demo-archive-1', folderId: 'demo-folder-1', itemType: 'RESOLUTION', resolutionId: resolutions[3].id, resolutionTitle: resolutions[3].topicTitle, resolutionNumber: resolutions[3].resolutionNumber, movedByUserId: U.office.id, movedByName: U.office.name, movedAt: iso(-9) },
    { id: 'demo-archive-2', folderId: 'demo-folder-1', itemType: 'PROPOSAL', proposalId: proposals[0].id, proposalTitle: proposals[0].title, movedByUserId: U.office.id, movedByName: U.office.name, movedAt: iso(-20) },
  ] as unknown[] };
};

/** شمارش رکوردهای نمایشی هر collection — برای نمایش محدوده بازنشانی. */
export const countDemoRecords = (): Record<DemoCollectionKey, number> => {
  const result = {} as Record<DemoCollectionKey, number>;
  DEMO_COLLECTION_KEYS.forEach((key) => { result[key] = loadLocalValue<unknown[]>(key, []).filter(isDemoRecord).length; });
  return result;
};

/** شمارش رکوردهای دستی (غیرنمایشی) — تا کاربر ببیند چه چیزی حفظ می‌شود. */
export const countManualRecords = (): Record<DemoCollectionKey, number> => {
  const result = {} as Record<DemoCollectionKey, number>;
  DEMO_COLLECTION_KEYS.forEach((key) => { const list = loadLocalValue<unknown[]>(key, []); result[key] = Array.isArray(list) ? list.filter((item) => !isDemoRecord(item)).length : 0; });
  return result;
};

export const loadDemoData = () => {
  const demo = createDemo() as unknown as Record<DemoCollectionKey, unknown[]>;
  DEMO_COLLECTION_KEYS.forEach((key) => {
    const current = loadLocalValue<unknown[]>(key, []);
    const manual = Array.isArray(current) ? current.filter((item) => !isDemoRecord(item)) : [];
    // رکوردهای نمایشی جلوی فهرست قرار می‌گیرند تا ترتیب «جدیدترین اول»
    // سرویس‌ها حفظ شود؛ رکوردهای دستی بدون تغییر باقی می‌مانند.
    saveLocalValue(key, [...demo[key], ...manual]);
  });
  saveLocalValue(DEMO_MARKER, { version: DEMO_DATA_VERSION, loadedAt: new Date().toISOString() });
};

export const resetDemoData = () => {
  DEMO_COLLECTION_KEYS.forEach((key) => {
    const current = loadLocalValue<unknown[]>(key, []);
    if (Array.isArray(current)) saveLocalValue(key, current.filter((item) => !isDemoRecord(item)));
  });
  saveLocalValue(DEMO_MARKER, null);
};

export const hasDemoData = () => DEMO_COLLECTION_KEYS.some((key) => loadLocalValue<unknown[]>(key, []).some?.(isDemoRecord));

export const getDemoDataInfo = (): { version: number; loadedAt: string } | null => loadLocalValue<{ version: number; loadedAt: string } | null>(DEMO_MARKER, null);
