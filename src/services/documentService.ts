import {
  BoardMinutes,
  DocumentSignature,
  Meeting,
  Resolution,
  ResolutionNotice,
  ResolutionSignature,
  User,
} from '../types';
import { exportHtmlToPdf } from '../utils/pdfExport';
import { toPersianDigits } from '../utils/formatters';
import { SAMPLE_SIGNATURE_DATA_URL } from '../utils/signatureImage';
import { isMeetingRelatedToUser, isResolutionRelatedToUser, hasOrgWideMeetingAccess } from './userScope';
import { getOrganizationProfile } from './organizationProfile';

/**
 * Official, printable versions of the workflow's letters and documents.
 *
 * These are a *rendering* of data that already exists — no parallel entity,
 * no second approval path, no independent copy of any field. Every value
 * below is read from the real Meeting / Resolution / ResolutionNotice /
 * BoardMinutes records, and every signature image comes from the signature
 * record that the workflow itself produced (never hard-coded per template).
 */

export interface GeneratedDocument {
  /** Short label used in the preview header. */
  title: string;
  /** Download/print file name, built from the entity's real number. */
  fileName: string;
  /** Complete printable body (inserted into the shared A4 print shell). */
  html: string;
  /** False while the underlying step has not actually happened yet. */
  isFinal: boolean;
  /** Human-readable state shown as a watermark-ish banner when not final. */
  stateLabel: string;
}

const escapeHtml = (value: unknown) => String(value ?? '—')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const fa = (value: unknown) => escapeHtml(toPersianDigits(String(value ?? '—')));

const DOCUMENT_STYLES = `
  <style>
    .doc { font-family: Tahoma, Arial, sans-serif; color: #172033; font-size: 12px; line-height: 2; }
    .doc h1 { font-size: 16px; margin: 0 0 4px; }
    .doc .org { text-align: center; border-bottom: 3px solid #541d50; padding-bottom: 10px; margin-bottom: 18px; }
    .doc .org .sub { color: #64748b; font-size: 11px; }
    .doc .meta { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 16px; font-size: 11px; }
    .doc .meta b { color: #541d50; }
    .doc section { margin-bottom: 16px; }
    .doc h2 { font-size: 13px; border-bottom: 1px solid #d9dee8; padding-bottom: 5px; margin: 0 0 8px; }
    .doc table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .doc th { background: #541d50; color: #fff; padding: 7px 6px; border: 1px solid #3f163c; text-align: right; }
    .doc td { padding: 7px 6px; border: 1px solid #d9dee8; vertical-align: top; }
    .doc .body-text { white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .doc .sign-row { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 26px; }
    .doc .sign { flex: 1 1 180px; border: 1px solid #d9dee8; border-radius: 10px; padding: 10px; text-align: center; }
    .doc .sign img { height: 62px; object-fit: contain; display: block; margin: 4px auto 6px; }
    .doc .sign .who { font-weight: bold; font-size: 11px; }
    .doc .sign .role { color: #64748b; font-size: 10px; }
    .doc .sign .when { color: #64748b; font-size: 10px; margin-top: 4px; }
    .doc .sign .sample-note { color: #b45309; font-size: 9px; margin-top: 2px; }
    .doc .draft { border: 2px dashed #b45309; color: #b45309; border-radius: 10px; padding: 8px 12px; margin-bottom: 14px; font-weight: bold; font-size: 11px; }
    .doc .note { color: #64748b; font-size: 10px; }
    .doc-footer { margin-top: 28px; border-top: 1px solid #d9dee8; padding-top: 6px; font-size: 10px; color: #64748b; text-align: center; }
    @media print { .doc-footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; } }
  </style>
`;

/**
 * سربرگ رسمی نامه‌های اداری: نشان و نام سازمان، عنوان سند، و بلوک
 * «شماره / تاریخ / پیوست». از جدول استفاده می‌شود تا در Word هم درست بماند.
 */
const orgHeader = (title: string, subtitle: string, meta?: { number?: string; date?: string; attachments?: number }) => {
  const profile = getOrganizationProfile();
  const logo = profile.logoUrl ? new URL(profile.logoUrl, window.location.origin).href : '';
  return `
  <table class="lh" style="width:100%;border-collapse:collapse;margin-bottom:6px">
    <tr>
      <td style="width:22%;vertical-align:middle;text-align:right;border:none">${logo ? `<img src="${escapeHtml(logo)}" alt="نشان سازمان" style="height:64px;object-fit:contain" />` : ''}</td>
      <td style="text-align:center;vertical-align:middle;border:none">
        <div style="font-size:13px;font-weight:bold">${escapeHtml(profile.name || profile.systemTitle)}</div>
        <div style="font-size:11px;color:#64748b">${escapeHtml(profile.systemTitle)}</div>
      </td>
      <td style="width:26%;vertical-align:middle;font-size:11px;line-height:1.9;border:none">
        <div>شماره: <b>${fa(meta?.number || '—')}</b></div>
        <div>تاریخ: <b>${fa(meta?.date || '—')}</b></div>
        <div>پیوست: <b>${meta?.attachments ? `${fa(meta.attachments)} برگ` : 'ندارد'}</b></div>
      </td>
    </tr>
  </table>
  <div class="org">
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${escapeHtml(subtitle)}</div>
  </div>
`;
};

/** پاورقی رسمی (نشانی و راه‌های تماس سازمان) — در چاپ پایین هر صفحه. */
const orgFooter = () => {
  const p = getOrganizationProfile();
  const parts = [p.address && `نشانی: ${p.address}`, p.phone && `تلفن: ${p.phone}`, p.website && p.website, p.email && p.email].filter(Boolean);
  return parts.length ? `<div class="doc-footer">${escapeHtml(parts.join('  |  '))}</div>` : '';
};

const draftBanner = (isFinal: boolean, stateLabel: string) =>
  isFinal ? '' : `<div class="draft">این نسخه پیش‌نویس است: ${escapeHtml(stateLabel)}</div>`;

/** Renders one signature block from a signature record — image included. */
const signatureBlock = (
  name: string,
  role: string,
  imageUrl: string | undefined,
  when?: string,
  /** وقتی امضا به جانشینی انجام شده: نام شخصی که واقعاً امضا کرده است. */
  delegateNote?: string
) => `
  <div class="sign">
    <div class="who">${escapeHtml(name)}</div>
    <div class="role">${escapeHtml(role)}</div>
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="امضای ${escapeHtml(name)}" />` : '<div class="note" style="height:62px;line-height:62px">در انتظار امضا</div>'}
    ${delegateNote ? `<div class="note">${escapeHtml(delegateNote)}</div>` : ''}
    ${when ? `<div class="when">${fa(when)}</div>` : ''}
    ${imageUrl === SAMPLE_SIGNATURE_DATA_URL ? '<div class="sample-note">نمونه امضا — کاربر هنوز امضای خود را بارگذاری نکرده است</div>' : ''}
  </div>
`;

const documentSignatureBlock = (signature?: DocumentSignature, fallbackName?: string, fallbackRole?: string) => {
  if (!signature) return signatureBlock(fallbackName || '—', fallbackRole || 'دبیر جلسه', undefined);
  // امضای جانشینی: سند نام و تصویر امضای کسی را نشان می‌دهد که واقعاً امضا
  // کرده، و صریحاً می‌گوید به جانشینی از چه کسی بوده است.
  if (signature.signedAsDelegate && signature.actualSignerName) {
    return signatureBlock(
      signature.actualSignerName,
      signature.actualSignerTitle || signature.signerTitle,
      signature.signatureImageUrl,
      `${signature.signedDateJalali} — ${signature.signedTimeString}`,
      `به جانشینی از: ${signature.signerName}`
    );
  }
  return signatureBlock(
    signature.signerName,
    signature.signerTitle,
    signature.signatureImageUrl,
    `${signature.signedDateJalali} — ${signature.signedTimeString}`
  );
};

const resolutionSignatureBlock = (step: ResolutionSignature) => {
  const isSigned = step.status === 'SIGNED';
  const byDelegate = isSigned && step.signedAsDelegate && step.actualSignerName;
  return signatureBlock(
    byDelegate ? step.actualSignerName! : step.signerName,
    byDelegate ? (step.actualSignerTitle || step.signerTitle) : step.signerTitle,
    isSigned ? (step.signatureImageUrl || SAMPLE_SIGNATURE_DATA_URL) : undefined,
    isSigned ? `${step.signedDateJalali} — ${step.signedTimeString}` : undefined,
    byDelegate ? `به جانشینی از: ${step.signerName}` : undefined
  );
};

// ————————————————————————— Permission gates —————————————————————————
// Downloading a document is exactly as restricted as viewing the entity it
// renders; holding the file's URL is never sufficient on its own.

export const canAccessMeetingDocument = (meeting: Meeting, actor: User): boolean =>
  actor.role === 'ADMIN' || hasOrgWideMeetingAccess(actor.role) || isMeetingRelatedToUser(meeting, actor.id);

export const canAccessResolutionDocument = (resolution: Resolution, actor: User): boolean =>
  actor.role === 'ADMIN' || isResolutionRelatedToUser(resolution, actor);

const denyMeeting = () => { throw new Error('شما مجوز دریافت اسناد این جلسه را ندارید.'); };
const denyResolution = () => { throw new Error('شما مجوز دریافت اسناد این مصوبه را ندارید.'); };

// ————————————————————————— Document builders —————————————————————————

/** دعوت‌نامه رسمی جلسه. */
export const buildMeetingInvitationDocument = (meeting: Meeting, actor: User): GeneratedDocument => {
  if (!canAccessMeetingDocument(meeting, actor)) denyMeeting();
  const isFinal = Boolean(meeting.invitationSignature);
  const agenda = meeting.agendaItems.filter((item) => !item.isRemoved);
  const guests = meeting.guests || [];

  const html = `
    ${DOCUMENT_STYLES}
    <div class="doc">
      ${orgHeader('دعوت‌نامه رسمی جلسه', `${meeting.meetingNumber} — ${meeting.title}`, { number: meeting.meetingNumber, date: meeting.dateJalali, attachments: meeting.attachments.length })}
      ${draftBanner(isFinal, 'دعوت‌نامه هنوز توسط دبیر جلسه امضا و ارسال نشده است')}
      <div class="meta">
        <span><b>شماره جلسه:</b> ${fa(meeting.meetingNumber)}</span>
        <span><b>تاریخ:</b> ${fa(meeting.dateJalali)}</span>
        <span><b>ساعت:</b> ${fa(meeting.startTime)} تا ${fa(meeting.endTime)}</span>
        <span><b>مکان:</b> ${escapeHtml(meeting.location)}</span>
        <span><b>دبیر جلسه:</b> ${escapeHtml(meeting.secretaryName)}</span>
      </div>

      <section>
        <h2>موضوع</h2>
        <div class="body-text">${escapeHtml(meeting.description || meeting.title)}</div>
      </section>

      <section>
        <h2>مدعوین و اعضای جلسه</h2>
        <table>
          <thead><tr><th>ردیف</th><th>نام</th><th>سمت</th><th>نوع حضور</th></tr></thead>
          <tbody>
            ${meeting.members.map((member, index) => `<tr><td>${fa(index + 1)}</td><td>${escapeHtml(member.fullName)}</td><td>${escapeHtml(member.roleTitle)}</td><td>عضو جلسه</td></tr>`).join('')}
            ${guests.map((guest, index) => `<tr><td>${fa(meeting.members.length + index + 1)}</td><td>${escapeHtml(guest.fullName)}</td><td>${escapeHtml(guest.roleTitle)} — ${escapeHtml(guest.organizationName)}</td><td>مدعو</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="note">حضور مدعوین صرفاً جهت دعوت و اطلاع است؛ امضای مدعوین در این سند اخذ نمی‌شود.</div>
      </section>

      ${agenda.length ? `
      <section>
        <h2>دستور کار جلسه</h2>
        <table>
          <thead><tr><th>ردیف</th><th>عنوان دستور</th><th>ارائه‌دهنده</th><th>زمان</th></tr></thead>
          <tbody>
            ${agenda.map((item, index) => `<tr><td>${fa(index + 1)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.presenterName || item.presenter)}</td><td>${fa(item.startTime || '—')} تا ${fa(item.endTime || '—')}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>` : ''}

      <div class="sign-row">
        ${documentSignatureBlock(meeting.invitationSignature, meeting.secretaryName, 'دبیر جلسه')}
      </div>
    </div>
  `;

  return {
    title: 'دعوت‌نامه رسمی جلسه',
    fileName: `MeetingInvitation-${meeting.meetingNumber}.pdf`,
    html,
    isFinal,
    stateLabel: isFinal ? 'نسخه نهایی امضاشده' : 'پیش‌نویس — امضا نشده',
  };
};

/** نامه ابلاغ رسمی مصوبه. */
export const buildResolutionNotificationDocument = (
  resolution: Resolution,
  notice: ResolutionNotice | undefined,
  meeting: Meeting | undefined,
  actor: User
): GeneratedDocument => {
  if (!canAccessResolutionDocument(resolution, actor)) denyResolution();
  // نسخه نهایی فقط وقتی است که ابلاغ ثبت شده باشد **و** دبیر جلسه واقعاً
  // ابلاغیه را امضا کرده باشد. تا پیش از آن سند به‌وضوح «پیش‌نویس / در
  // انتظار امضا» است و امضای دبیر جلسه در آن نمایش داده نمی‌شود.
  const isFinal = Boolean(
    notice?.notificationLetterNumber && resolution.notifiedDateJalali && notice?.secretarySignature
  );

  const html = `
    ${DOCUMENT_STYLES}
    <div class="doc">
      ${orgHeader('نامه ابلاغ مصوبه', `${resolution.resolutionNumber} — ${resolution.topicTitle}`, { number: notice?.notificationLetterNumber || notice?.noticeNumber, date: notice?.dateJalali, attachments: resolution.attachments.length })}
      ${draftBanner(isFinal, notice?.notificationLetterNumber
        ? 'این ابلاغیه هنوز توسط دبیر جلسه امضا نشده است — پیش‌نویس'
        : 'این مصوبه هنوز ابلاغ رسمی نشده است')}
      <div class="meta">
        <span><b>شماره نامه ابلاغیه:</b> ${fa(notice?.notificationLetterNumber || '—')}</span>
        <span><b>شماره مصوبه:</b> ${fa(resolution.resolutionNumber)}</span>
        <span><b>تاریخ ابلاغ:</b> ${fa(resolution.notifiedDateJalali || '—')}</span>
        <span><b>مهلت اقدام:</b> ${fa(resolution.deadlineJalali || '—')}</span>
      </div>

      <div class="meta">
        <span><b>مخاطب:</b> ${escapeHtml(notice?.recipientName || resolution.mainResponsibleName || '—')}</span>
        <span><b>واحد:</b> ${escapeHtml(notice?.recipientDepartment || resolution.responsibleDepartmentName || '—')}</span>
        ${meeting ? `<span><b>جلسه مرجع:</b> ${escapeHtml(meeting.meetingNumber)} — ${escapeHtml(meeting.title)} (${fa(meeting.dateJalali)})</span>` : ''}
      </div>

      <section>
        <h2>موضوع</h2>
        <div class="body-text">${escapeHtml(resolution.topicTitle)}</div>
      </section>

      <section>
        <h2>متن ابلاغ</h2>
        <div class="body-text">${escapeHtml(notice?.text || resolution.executionDescription || resolution.requestDescription)}</div>
      </section>

      <div class="sign-row">
        ${documentSignatureBlock(notice?.secretarySignature, meeting?.secretaryName, 'دبیر جلسه')}
      </div>
    </div>
  `;

  return {
    title: 'نامه ابلاغ مصوبه',
    fileName: `ResolutionNotification-${notice?.notificationLetterNumber || resolution.resolutionNumber}.pdf`,
    html,
    isFinal,
    stateLabel: isFinal ? 'ابلاغ‌شده' : 'پیش‌نویس — ابلاغ نشده',
  };
};

/** سند مصوبه به همراه سه امضای اصلی. */
export const buildResolutionDocument = (resolution: Resolution, meeting: Meeting | undefined, actor: User): GeneratedDocument => {
  if (!canAccessResolutionDocument(resolution, actor)) denyResolution();
  const steps = resolution.signatureWorkflow?.steps || [];
  const isFinal = resolution.signatureWorkflow?.status === 'COMPLETED';

  const html = `
    ${DOCUMENT_STYLES}
    <div class="doc">
      ${orgHeader('سند رسمی مصوبه', `${resolution.resolutionNumber} — ${resolution.topicTitle}`, { number: resolution.resolutionNumber, date: resolution.assignedDateJalali || meeting?.dateJalali, attachments: resolution.attachments.length })}
      ${draftBanner(isFinal, 'زنجیره سه امضای اصلی مصوبه هنوز تکمیل نشده است')}
      <div class="meta">
        <span><b>شماره مصوبه:</b> ${fa(resolution.resolutionNumber)}</span>
        ${meeting ? `<span><b>جلسه:</b> ${escapeHtml(meeting.meetingNumber)} (${fa(meeting.dateJalali)})</span>` : ''}
        <span><b>پیشنهاددهنده:</b> ${escapeHtml(resolution.proposerName)} — ${escapeHtml(resolution.proposerDepartment)}</span>
        <span><b>مسئول اجرا:</b> ${escapeHtml(resolution.mainResponsibleName || '—')}</span>
        <span><b>مهلت اقدام:</b> ${fa(resolution.deadlineJalali || '—')}</span>
        ${resolution.notificationLetterNumber ? `<span><b>شماره نامه ابلاغیه:</b> ${fa(resolution.notificationLetterNumber)}</span>` : ''}
      </div>

      <section>
        <h2>شرح درخواست</h2>
        <div class="body-text">${escapeHtml(resolution.requestDescription)}</div>
      </section>

      ${resolution.executionDescription ? `
      <section>
        <h2>شرح اقدام مصوب</h2>
        <div class="body-text">${escapeHtml(resolution.executionDescription)}</div>
      </section>` : ''}

      <section>
        <h2>امضاهای اصلی مصوبه</h2>
        <div class="sign-row">
          ${steps.map(resolutionSignatureBlock).join('')}
        </div>
      </section>
    </div>
  `;

  return {
    title: 'سند رسمی مصوبه',
    fileName: `Resolution-${resolution.resolutionNumber}.pdf`,
    html,
    isFinal,
    stateLabel: isFinal ? 'نسخه نهایی با سه امضای اصلی' : 'پیش‌نویس — امضاها ناتمام',
  };
};

/** صورت‌جلسه تجمیعی. */
export const buildMeetingMinutesDocument = (
  meeting: Meeting,
  resolutions: Resolution[],
  minutes: BoardMinutes | undefined,
  actor: User
): GeneratedDocument => {
  if (!canAccessMeetingDocument(meeting, actor)) denyMeeting();
  const isFinal = minutes?.status === 'FINALIZED';
  const approved = resolutions.filter((item) => item.approvalStatus === 'APPROVED' || item.approvalStatus === 'CONDITIONAL_APPROVED');
  const guests = meeting.guests || [];

  const html = `
    ${DOCUMENT_STYLES}
    <div class="doc">
      ${orgHeader('صورت‌جلسه تجمیعی', `${meeting.meetingNumber} — ${meeting.title}`, { number: meeting.meetingNumber, date: meeting.dateJalali, attachments: meeting.attachments.length })}
      ${draftBanner(isFinal, minutes ? 'صورت‌جلسه هنوز نهایی نشده است' : 'پیش‌نویس صورت‌جلسه هنوز ایجاد نشده است')}
      <div class="meta">
        <span><b>شماره جلسه:</b> ${fa(meeting.meetingNumber)}</span>
        <span><b>تاریخ:</b> ${fa(meeting.dateJalali)}</span>
        <span><b>ساعت:</b> ${fa(meeting.startTime)} تا ${fa(meeting.endTime)}</span>
        <span><b>مکان:</b> ${escapeHtml(meeting.location)}</span>
        <span><b>رئیس جلسه:</b> ${escapeHtml(meeting.organizerName)}</span>
        <span><b>دبیر جلسه:</b> ${escapeHtml(meeting.secretaryName)}</span>
      </div>

      <section>
        <h2>حاضرین و مدعوین</h2>
        <table>
          <thead><tr><th>ردیف</th><th>نام</th><th>سمت</th><th>نوع حضور</th><th>وضعیت حضور</th></tr></thead>
          <tbody>
            ${meeting.members.map((member, index) => `<tr><td>${fa(index + 1)}</td><td>${escapeHtml(member.fullName)}</td><td>${escapeHtml(member.roleTitle)}</td><td>عضو جلسه</td><td>${member.presenceStatus === 'ABSENT' ? 'غایب' : member.presenceStatus === 'DELEGATED' ? 'نماینده' : 'حاضر'}</td></tr>`).join('')}
            ${guests.map((guest, index) => `<tr><td>${fa(meeting.members.length + index + 1)}</td><td>${escapeHtml(guest.fullName)}</td><td>${escapeHtml(guest.roleTitle)} — ${escapeHtml(guest.organizationName)}</td><td>مدعو</td><td>حاضر</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="note">مدعوین صرفاً جهت اطلاع و حضور درج می‌شوند و امضای آنان در این سند اخذ نمی‌شود.</div>
      </section>

      <section>
        <h2>دستور کارهای جلسه</h2>
        <table>
          <thead><tr><th>ردیف</th><th>عنوان</th><th>ارائه‌دهنده</th><th>نتیجه</th></tr></thead>
          <tbody>
            ${meeting.agendaItems.filter((item) => !item.isRemoved).map((item, index) => `<tr><td>${fa(index + 1)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.presenterName || item.presenter)}</td><td>${escapeHtml(item.outcomeNotes || item.outcomeStatus || '—')}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>

      ${minutes?.content ? `
      <section>
        <h2>متن صورت‌جلسه</h2>
        <div class="body-text">${escapeHtml(minutes.content)}</div>
      </section>` : ''}

      <section>
        <h2>مصوبات جلسه</h2>
        <table>
          <thead><tr><th>ردیف</th><th>شماره مصوبه</th><th>موضوع</th><th>مسئول اجرا</th><th>مهلت</th><th>وضعیت</th></tr></thead>
          <tbody>
            ${approved.length ? approved.map((item, index) => `<tr><td>${fa(index + 1)}</td><td>${fa(item.resolutionNumber)}</td><td>${escapeHtml(item.topicTitle)}</td><td>${escapeHtml(item.mainResponsibleName || '—')}</td><td>${fa(item.deadlineJalali || '—')}</td><td>${escapeHtml(item.executionStatus)}</td></tr>`).join('') : '<tr><td colspan="6">مصوبه‌ای برای این جلسه ثبت نشده است.</td></tr>'}
          </tbody>
        </table>
      </section>

      <section>
        <h2>امضای صورت‌جلسه</h2>
        <div class="sign-row">
          ${documentSignatureBlock(minutes?.finalizedSignature, meeting.secretaryName, 'دبیرخانه / دبیر جلسه')}
        </div>
      </section>
    </div>
  `;

  return {
    title: 'صورت‌جلسه تجمیعی',
    fileName: `MeetingMinutes-${meeting.meetingNumber}.pdf`,
    html,
    isFinal,
    stateLabel: isFinal ? 'نسخه نهایی‌شده' : 'پیش‌نویس — نهایی نشده',
  };
};

/**
 * Opens the generated document in the shared print window (the same helper the
 * existing reports use), which is also the download path: the browser's print
 * dialog offers "Save as PDF" under the document's own file name.
 */
export const openGeneratedDocument = (document: GeneratedDocument): boolean =>
  exportHtmlToPdf(document.fileName.replace(/\.pdf$/, ''), `${document.html}${orgFooter()}`, { wordExport: true });
