import React, { useEffect, useState } from 'react';
import {
  Lightbulb, Plus, Calendar, CheckCircle2, XCircle, Inbox, FileCheck2, X, RotateCcw, ClipboardCheck, FileSpreadsheet, Download, Undo2, UploadCloud, Edit3, LayoutGrid, Table2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { proposalService } from '../../services/proposalService';
import { Proposal, ProposalStatus } from '../../types';
import { mockDepartments } from '../../mock/data';
import { toPersianDigits } from '../../utils/formatters';
import { BulkSelectionBar } from '../../components/common/BulkSelectionBar';
import { CreateProposalModal } from './CreateProposalModal';
import { ProposalAiInsight } from './ProposalAiInsight';
import { ExcelImportModal } from './ExcelImportModal';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { downloadProposalExcelTemplate, parseProposalExcelFile, ProposalImportParseResult } from '../../services/proposalExcelImportService';

type ProposalTab = 'OFFICE' | 'CEO' | 'SECRETARY_APPROVAL' | 'MINE';
type OfficeStatusFilter = 'APPROVED' | 'PENDING_SECRETARY_CONFIRMATION' | 'RETURNED_BY_SECRETARY' | 'CONFIRMED_FOR_MEETING' | 'CONVERTED_TO_AGENDA' | 'NO_BOARD_REQUIRED' | 'ALL';

const STATUS_META: Record<ProposalStatus, { label: string; bg: string }> = {
  PENDING_OFFICE_REVIEW: { label: 'در انتظار بررسی مسئول دفتر', bg: 'bg-sky-50 text-sky-700 border-sky-200' },
  PENDING_CEO_REVIEW: { label: 'در انتظار بررسی مدیرعامل', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  REJECTED: { label: 'رد شده', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  RETURNED_FOR_REVISION: { label: 'برگشت جهت اصلاح', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  RESUBMITTED: { label: 'اصلاح و ارسال مجدد', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  NO_BOARD_REQUIRED: { label: 'عدم نیاز به طرح در هیأت‌مدیره', bg: 'bg-slate-50 text-slate-700 border-slate-200' },
  CEO_ORDER_ISSUED: { label: 'دستور مدیرعامل صادر شد', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
  APPROVED: { label: 'تایید جلسات تایید نشده', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  PENDING_SECRETARY_CONFIRMATION: { label: 'در انتظار تأیید دبیر جلسه', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  RETURNED_BY_SECRETARY: { label: 'برگشت از دبیر جلسه جهت اصلاح', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  CONFIRMED_FOR_MEETING: { label: 'تایید جلسه شده', bg: 'bg-violet-50 text-violet-700 border-violet-200' },
  CONVERTED_TO_AGENDA: { label: 'تبدیل شده به بند دستور جلسه', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const DEFAULT_STATUS_META = { label: 'نامشخص', bg: 'bg-slate-50 text-slate-600 border-slate-200' };
const getStatusMeta = (status: ProposalStatus) => STATUS_META[status] || DEFAULT_STATUS_META;
const getNextAction = (status: ProposalStatus): string => ({
  PENDING_CEO_REVIEW: 'در انتظار تصمیم مدیرعامل', RESUBMITTED: 'در انتظار بررسی مجدد مدیرعامل', RETURNED_FOR_REVISION: 'اصلاح و ارسال مجدد توسط پیشنهاددهنده',
  APPROVED: 'اقدام مسئول دفتر: ارسال برای تأیید نهایی دبیر جلسه', PENDING_SECRETARY_CONFIRMATION: 'اقدام دبیر جلسه: تأیید نهایی یا بازگشت با علت',
  RETURNED_BY_SECRETARY: 'اقدام مسئول دفتر: انتقال علت برگشت به پیشنهاددهنده', CONFIRMED_FOR_MEETING: 'اقدام مسئول دفتر: افزودن به دستور جلسه',
  CONVERTED_TO_AGENDA: 'به دستور جلسه افزوده شده است', REJECTED: 'فرآیند پایان یافته', NO_BOARD_REQUIRED: 'در صورت نیاز، بازیابی توسط مسئول دفتر', CEO_ORDER_ISSUED: 'پیگیری دستور مستقیم مدیرعامل', PENDING_OFFICE_REVIEW: 'در انتظار بررسی مسئول دفتر',
}[status] || 'وضعیت اقدام مشخص نیست');

const OFFICE_FILTERS: { id: OfficeStatusFilter; label: string }[] = [
  { id: 'APPROVED', label: 'تایید جلسات تایید نشده' },
  { id: 'PENDING_SECRETARY_CONFIRMATION', label: 'در انتظار تأیید دبیر جلسه' },
  { id: 'RETURNED_BY_SECRETARY', label: 'برگشت از دبیر جلسه' },
  { id: 'CONFIRMED_FOR_MEETING', label: 'تایید جلسه شده' },
  { id: 'CONVERTED_TO_AGENDA', label: 'تبدیل شده به جلسه' },
  { id: 'NO_BOARD_REQUIRED', label: 'عدم نیاز به طرح (قابل بازیابی)' },
  { id: 'ALL', label: 'همه موارد' },
];

export const ProposalsView: React.FC = () => {
  const { currentUser, availableUsers, showToast, refreshTrigger, triggerRefresh, hasPermission } = useApp();

  const isOfficeManager = currentUser.role === 'ADMIN' || currentUser.role === 'SECRETARY';
  const isCeo = currentUser.role === 'ADMIN' || currentUser.role === 'CEO';
  const isRegularUser = !isOfficeManager && !isCeo;
  const canImportFromExcel = hasPermission('IMPORT_PROPOSALS_FROM_EXCEL');
  // Final approval of Meeting Confirmation — a دبیر جلسه permission,
  // deliberately independent of isOfficeManager/isCeo above.
  // این مرحله یک تصمیم اداری است و ربطی به امضا ندارد، پس «جانشین امضا»
  // عمداً روی آن اثری نمی‌گذارد.
  const isMeetingSecretaryApprover = hasPermission('APPROVE_MEETING_CONFIRMATION');

  // تب پیش‌فرض: اگر کاربر دبیر جلسه باشد، «دبیر جلسه» — حتی وقتی همزمان
  // مسئول دفتر هم هست. ترتیب نمایش تب‌ها نیز در visibleTabs همین است.
  const [tab, setTab] = useState<ProposalTab>(isMeetingSecretaryApprover ? 'SECRETARY_APPROVAL' : isOfficeManager ? 'OFFICE' : isCeo ? 'CEO' : 'MINE');
  // تب‌های مجاز کاربر فعلی، به همان ترتیب visibleTabs. با تعویض User از
  // Selector بالای صفحه، Component جدید Mount نمی‌شود و `tab` روی تب کاربر
  // قبلی می‌ماند؛ چون هر بلوک با `tab === X && isX` رندر می‌شد، صفحه کاملاً
  // خالی می‌شد. اینجا تب فعال از روی مجوزهای کاربر فعلی مشتق می‌شود تا در
  // همان اولین Render بعد از تعویض، تب معتبر انتخاب شود (بدون Reload).
  const allowedTabs: ProposalTab[] = [
    ...(isMeetingSecretaryApprover ? (['SECRETARY_APPROVAL'] as ProposalTab[]) : []),
    ...(isOfficeManager ? (['OFFICE'] as ProposalTab[]) : []),
    ...(isCeo ? (['CEO'] as ProposalTab[]) : []),
    ...(isRegularUser ? (['MINE'] as ProposalTab[]) : []),
  ];
  const activeTab: ProposalTab = allowedTabs.includes(tab) ? tab : (allowedTabs[0] || 'MINE');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [officeFilter, setOfficeFilter] = useState<OfficeStatusFilter>('APPROVED');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [orderAssignees, setOrderAssignees] = useState<Record<string, string>>({});
  const [orderDeadlines, setOrderDeadlines] = useState<Record<string, string>>({});
  const [orderCompletionNotes, setOrderCompletionNotes] = useState<Record<string, string>>({});
  const [ceoViewMode, setCeoViewMode] = useState<'cards' | 'grid'>('cards');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [orderFormOpen, setOrderFormOpen] = useState<Record<string, boolean>>({});
  const [revisionTitles, setRevisionTitles] = useState<Record<string, string>>({});
  const [revisionDescriptions, setRevisionDescriptions] = useState<Record<string, string>>({});
  const [revisionRationales, setRevisionRationales] = useState<Record<string, string>>({});
  const [confirmingProposal, setConfirmingProposal] = useState<Proposal | null>(null);
  // Office-manager resubmission of a RETURNED_FOR_REVISION proposal they
  // themselves submitted (always true for Excel-imported ones — the office
  // manager is recorded as the proposer for every imported row). Excel-sourced
  // proposals must be corrected by re-uploading a fixed row, not by editing
  // fields inline, so this stays a separate modal from the plain-text
  // resubmit form already used in the "MINE" tab.
  const [resubmittingProposal, setResubmittingProposal] = useState<Proposal | null>(null);
  const [resubmitExcelResult, setResubmitExcelResult] = useState<ProposalImportParseResult | null>(null);
  const [resubmitExcelError, setResubmitExcelError] = useState<string | null>(null);
  const [isResubmittingExcel, setIsResubmittingExcel] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [refreshTrigger, currentUser.id]);

  // تعویض User: انتخاب‌های گروهی و یادداشت‌های در حال تایپِ کاربر قبلی نباید
  // برای کاربر جدید باقی بماند.
  useEffect(() => {
    setSelectedIds([]);
    setDecisionNotes({});
  }, [currentUser.id]);

  // تعویض تب هم Selection را پاک می‌کند تا دو کارتابل انتخاب مشترک نداشته باشند.
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  const fetchAll = async () => {
    const res = await proposalService.getProposals({ pageSize: 200 });
    if (res.isSuccess) setProposals(res.data.items);
  };

  const handleReview = async (proposal: Proposal, decision: 'APPROVED' | 'REJECTED') => {
    await proposalService.reviewProposal(proposal.id, decision, decisionNotes[proposal.id], currentUser);
    showToast(
      decision === 'APPROVED' ? 'تایید مصوبه پیشنهادی' : 'رد مصوبه پیشنهادی',
      decision === 'APPROVED'
        ? `«${proposal.title}» تایید شد و وارد کارتابل مسئول دفتر شد.`
        : `«${proposal.title}» رد شد و اطلاع‌رسانی پیامکی شبیه‌سازی شد.`,
      decision === 'APPROVED' ? 'success' : 'warning'
    );
    setDecisionNotes((prev) => ({ ...prev, [proposal.id]: '' }));
    triggerRefresh();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // Bulk action is intentionally limited to APPROVED/REJECTED — every other
  // decision (return for revision, no-board, direct order) needs per-item
  // notes/assignee/deadline input and must still be done one at a time.
  const handleBulkReview = async (decision: 'APPROVED' | 'REJECTED') => {
    const targets = ceoQueue.filter((p) => selectedIds.includes(p.id));
    await Promise.all(targets.map((p) => proposalService.reviewProposal(p.id, decision, decisionNotes[p.id], currentUser)));
    showToast(
      decision === 'APPROVED' ? 'تایید گروهی' : 'رد گروهی',
      `${toPersianDigits(targets.length)} مصوبه پیشنهادی ${decision === 'APPROVED' ? 'تایید شد' : 'رد شد'}.`,
      decision === 'APPROVED' ? 'success' : 'warning'
    );
    setSelectedIds([]);
    triggerRefresh();
  };

  const handleOpenConfirm = (proposal: Proposal) => {
    setConfirmingProposal(proposal);
  };

  const handleCeoAlternative = async (proposal: Proposal, decision: 'RETURN' | 'NO_BOARD_REQUIRED' | 'CEO_ORDER_ISSUED') => {
    try {
      const notes = decisionNotes[proposal.id] || '';
      if (decision === 'RETURN') {
        await proposalService.returnForRevision(proposal.id, notes, currentUser);
      } else if (decision === 'CEO_ORDER_ISSUED') {
        const assignee = availableUsers.find((user) => user.id === orderAssignees[proposal.id]);
        await proposalService.decideWithoutBoard(proposal.id, decision, notes, currentUser, {
          text: notes,
          assigneeUserId: assignee?.id || '',
          assigneeName: assignee?.fullName || '',
          deadlineJalali: orderDeadlines[proposal.id] || '',
          status: 'PENDING',
        });
      } else {
        await proposalService.decideWithoutBoard(proposal.id, decision, notes, currentUser);
      }
      showToast('ثبت تصمیم مدیرعامل', 'تصمیم ثبت و در سابقه پیشنهاد نگهداری شد.', 'success');
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت تصمیم انجام نشد.', 'error');
    }
  };

  const handleResubmit = async (proposal: Proposal) => {
    try {
      await proposalService.resubmitProposal(proposal.id, {
        title: revisionTitles[proposal.id] ?? proposal.title,
        description: revisionDescriptions[proposal.id] ?? proposal.description,
        rationale: revisionRationales[proposal.id] ?? proposal.rationale,
      }, currentUser);
      showToast('ارسال مجدد', 'پیشنهاد اصلاح‌شده به کارتابل مدیرعامل ارسال شد.', 'success');
      if (resubmittingProposal?.id === proposal.id) closeResubmitModal();
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ارسال مجدد انجام نشد.', 'error');
    }
  };

  const closeResubmitModal = () => {
    setResubmittingProposal(null);
    setResubmitExcelResult(null);
    setResubmitExcelError(null);
  };

  const handleResubmitExcelFile = async (file: File) => {
    if (!resubmittingProposal) return;
    setResubmitExcelResult(null);
    setResubmitExcelError(null);
    try {
      const existingProposalsRes = await proposalService.getProposals({ pageSize: 1000 });
      const result = await parseProposalExcelFile(file, {
        departments: mockDepartments,
        users: availableUsers,
        // exclude the proposal being corrected itself, otherwise it always
        // matches its own letter number/department and is flagged as a
        // duplicate of itself.
        existingProposals: (existingProposalsRes.isSuccess ? existingProposalsRes.data.items : []).filter((item) => item.id !== resubmittingProposal.id),
      });
      setResubmitExcelResult(result);
    } catch (error) {
      setResubmitExcelError(error instanceof Error ? error.message : 'فایل قابل پردازش نیست.');
    }
  };

  const handleConfirmExcelResubmit = async () => {
    if (!resubmittingProposal || !resubmitExcelResult) return;
    const row = resubmitExcelResult.rows[0];
    if (!row || !row.isValid || !row.matchedDepartment || !row.matchedPresenter) {
      showToast('خطا', 'ردیف فایل معتبر نیست؛ خطاهای اعلام‌شده را برطرف و دوباره تلاش کنید.', 'error');
      return;
    }
    setIsResubmittingExcel(true);
    try {
      await proposalService.resubmitProposal(resubmittingProposal.id, {
        title: row.title,
        description: row.description,
        rationale: row.notes,
        presenterUserId: row.matchedPresenter.id,
        presenterName: row.matchedPresenter.fullName,
        proposerDepartmentId: row.matchedDepartment.id,
        proposerDepartmentName: row.matchedDepartment.name,
        sourceLetterNumber: row.letterNumber,
        sourceLetterDateJalali: row.letterDateJalali,
        sourceLetterSubject: row.letterSubject,
      }, currentUser);
      showToast('ارسال مجدد', 'پیشنهاد اصلاح‌شده از فایل Excel به کارتابل مدیرعامل ارسال شد.', 'success');
      closeResubmitModal();
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ارسال مجدد انجام نشد.', 'error');
    } finally {
      setIsResubmittingExcel(false);
    }
  };

  const handleOrderStatus = async (proposal: Proposal, status: 'IN_PROGRESS' | 'COMPLETED') => {
    try {
      await proposalService.updateCeoOrderStatus(proposal.id, status, currentUser, status === 'COMPLETED' ? orderCompletionNotes[proposal.id] : undefined);
      showToast('پیگیری دستور', 'وضعیت اجرای دستور مدیرعامل ثبت شد.', 'success');
      setOrderCompletionNotes((prev) => ({ ...prev, [proposal.id]: '' }));
      triggerRefresh();
    }
    catch (error) { showToast('خطا', error instanceof Error ? error.message : 'وضعیت ثبت نشد.', 'error'); }
  };

  const handleRecoverProposal = async (proposal: Proposal) => {
    try {
      await proposalService.recoverProposal(proposal.id, currentUser);
      showToast('بازیابی پیشنهاد', `«${proposal.title}» بازیابی شد و دوباره به کارتابل مدیرعامل ارسال شد.`, 'success');
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'بازیابی انجام نشد.', 'error');
    }
  };

  const handleConfirmForMeeting = async () => {
    if (!confirmingProposal) return;
    await proposalService.confirmForMeeting(confirmingProposal.id, currentUser);
    showToast('تایید جلسه', `«${confirmingProposal.title}» ثبت شد و برای تأیید نهایی به کارتابل دبیر جلسه ارسال شد.`, 'success');
    setConfirmingProposal(null);
    triggerRefresh();
  };

  // مسئول دفتر برگشت دبیر جلسه را می‌بیند و آن را جهت اصلاح به پیشنهاددهنده
  // منتقل می‌کند — تنها راه خروج از این وضعیت.
  const handleForwardSecretaryReturn = async (proposal: Proposal) => {
    const reason = decisionNotes[proposal.id]?.trim() || proposal.managementDecisionNotes?.trim();
    if (!reason) {
      showToast('خطا', 'دلیل برگشت جهت اصلاح را وارد کنید.', 'error');
      return;
    }
    try {
      await proposalService.forwardSecretaryReturnToProposer(proposal.id, reason, currentUser);
      showToast('برگشت جهت اصلاح', 'پیشنهاد به کارتابل پیشنهاددهنده برگشت داده شد.', 'info');
      setDecisionNotes((prev) => ({ ...prev, [proposal.id]: '' }));
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'برگشت جهت اصلاح انجام نشد.', 'error');
    }
  };

  // تأیید/رد گروهی کارتابل دبیر جلسه — دقیقاً همان Service Call تک‌موردی،
  // فقط روی موارد انتخاب‌شده. «برگشت جهت اصلاح» گروهی نیست چون به دلیلِ
  // جداگانه برای هر مورد نیاز دارد.
  const handleBulkSecretaryFinalize = async (decision: 'APPROVED' | 'REJECTED') => {
    const targets = secretaryQueue.filter((p) => selectedIds.includes(p.id));
    if (targets.length === 0) return;
    try {
      await Promise.all(
        targets.map((p) => proposalService.finalizeMeetingConfirmation(p.id, decision, decisionNotes[p.id], currentUser))
      );
      showToast(
        decision === 'APPROVED' ? 'تأیید نهایی گروهی' : 'رد گروهی',
        `${toPersianDigits(targets.length)} مورد ${decision === 'APPROVED' ? 'تأیید نهایی شد' : 'رد شد'}.`,
        decision === 'APPROVED' ? 'success' : 'warning'
      );
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت تصمیم گروهی انجام نشد.', 'error');
    }
    setSelectedIds([]);
    triggerRefresh();
  };

  const handleSecretaryFinalize = async (proposal: Proposal, decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION') => {
    try {
      await proposalService.finalizeMeetingConfirmation(proposal.id, decision, decisionNotes[proposal.id], currentUser);
      showToast('تأیید نهایی تایید جلسه', 'تصمیم دبیر جلسه ثبت و در سابقه پیشنهاد نگهداری شد.', 'success');
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت تصمیم انجام نشد.', 'error');
    }
  };

  const ceoQueue = proposals.filter((p) => ['PENDING_CEO_REVIEW', 'RESUBMITTED'].includes(p.status));
  // CEO_ORDER_ISSUED proposals leave ceoQueue for good once decided, so this
  // is the only place the CEO can see whether the assignee has since acted
  // on the order (ceoOrder.status), not just that the order was issued.
  const issuedOrders = proposals.filter((p) => p.status === 'CEO_ORDER_ISSUED' && p.ceoOrder);
  const CEO_ORDER_STATUS_LABEL: Record<'PENDING' | 'IN_PROGRESS' | 'COMPLETED', string> = {
    PENDING: 'در انتظار اقدام', IN_PROGRESS: 'در حال اقدام', COMPLETED: 'انجام‌شده',
  };
  const officeEligibleStatuses: ProposalStatus[] = ['APPROVED', 'PENDING_SECRETARY_CONFIRMATION', 'RETURNED_BY_SECRETARY', 'CONFIRMED_FOR_MEETING', 'CONVERTED_TO_AGENDA', 'RETURNED_FOR_REVISION', 'RESUBMITTED', 'NO_BOARD_REQUIRED', 'CEO_ORDER_ISSUED', 'REJECTED'];
  const officeItems = proposals.filter((p) => officeEligibleStatuses.includes(p.status) && (officeFilter === 'ALL' || p.status === officeFilter));
  const myProposals = proposals.filter((p) => p.proposerUserId === currentUser.id || p.ceoOrder?.assigneeUserId === currentUser.id);
  // Final Meeting Confirmation approval queue — دبیر جلسه's own cartable,
  // reusing the same list/card rendering pattern as ceoQueue below rather
  // than a separate Inbox component.
  const secretaryQueue = proposals.filter((p) => p.status === 'PENDING_SECRETARY_CONFIRMATION');

  const visibleTabs: { id: ProposalTab; label: string; description: string; count: number; icon: React.ElementType }[] = [
    ...(isMeetingSecretaryApprover ? [{ id: 'SECRETARY_APPROVAL' as ProposalTab, label: 'تأیید نهایی دبیر جلسه', description: 'موارد تأییدشده را برای ورود به دستور جلسه نهایی کنید یا با علت برگردانید.', count: secretaryQueue.length, icon: ClipboardCheck }] : []),
    ...(isOfficeManager ? [{ id: 'OFFICE' as ProposalTab, label: 'پیگیری مسئول دفتر', description: 'موارد تأییدشده، برگشتی و آماده طرح در جلسه را سازمان‌دهی کنید.', count: proposals.filter((p) => p.status === 'APPROVED' || p.status === 'RETURNED_BY_SECRETARY').length, icon: Lightbulb }] : []),
    ...(isCeo ? [{ id: 'CEO' as ProposalTab, label: 'تصمیم مدیرعامل', description: 'پیشنهادهای منتظر تصمیم را تأیید، رد یا برای اصلاح بازگردانید.', count: ceoQueue.length, icon: Inbox }] : []),
    ...(isRegularUser ? [{ id: 'MINE' as ProposalTab, label: 'پیشنهادهای من', description: 'وضعیت پیشنهادهای خود و اقدام بعدی لازم را دنبال کنید.', count: myProposals.length, icon: Lightbulb }] : []),
  ];
  const activeTabInfo = visibleTabs.find((item) => item.id === activeTab);

  return (
    <div className="space-y-5 pb-12">
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100">
        <h1 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <span>مصوبات پیشنهادی</span>
        </h1>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          ثبت پیشنهاد، بررسی مستقیم مدیرعامل و تبدیل موارد تأییدشده به تأیید جلسه توسط مسئول دفتر
        </p>

        {canImportFromExcel && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={downloadProposalExcelTemplate}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود نمونه Excel</span>
            </button>
            <button
              onClick={() => setIsExcelImportOpen(true)}
              className="flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>ورود از Excel</span>
            </button>
          </div>
        )}

        {visibleTabs.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {visibleTabs.map(({ id, label, count, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  activeTab === id ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                {count > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 rounded-full ${activeTab === id ? 'bg-white/20' : 'bg-slate-100'}`}>
                    {toPersianDigits(count)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {activeTabInfo && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600"><span className="font-bold text-slate-800">{activeTabInfo.label}: </span>{activeTabInfo.description}</div>}
      </div>

      {activeTab === 'OFFICE' && isOfficeManager && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100">
          <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
            <select
              value={officeFilter}
              onChange={(e) => setOfficeFilter(e.target.value as OfficeStatusFilter)}
              className="text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-bold text-slate-700"
            >
              {OFFICE_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت مصوبه پیشنهادی جدید</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[11px]">
                  <th className="py-2.5 px-3 font-semibold">عنوان</th>
                  <th className="py-2.5 px-3 font-semibold">ارائه‌دهنده</th>
                  <th className="py-2.5 px-3 font-semibold">تاریخ ثبت</th>
                  <th className="py-2.5 px-3 font-semibold">وضعیت</th>
                  <th className="py-2.5 px-3 font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {officeItems.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400">موردی یافت نشد</td></tr>
                ) : officeItems.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">{p.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{p.description}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">پیشنهاددهنده: {p.proposerName} — {p.proposerDepartmentName}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5"><span className="font-bold">اقدام بعدی:</span> {getNextAction(p.status)}</div>
                      {p.assignedMeetingTitle && <div className="text-[10px] text-emerald-700 mt-0.5">جلسه: {p.assignedMeetingTitle}</div>}
                      {p.source === 'EXCEL_IMPORT' && (
                        <div className="text-[10px] text-teal-700 mt-0.5">منبع ثبت: ورود از Excel{p.sourceLetterNumber ? ` — نامه ${toPersianDigits(p.sourceLetterNumber)}` : ''}</div>
                      )}
                      {p.status === 'CEO_ORDER_ISSUED' && p.ceoOrder && (
                        <div className="text-[10px] text-purple-700 mt-0.5 font-bold">
                          مسئول اجرا: {p.ceoOrder.assigneeName} — وضعیت اجرا: {CEO_ORDER_STATUS_LABEL[p.ceoOrder.status]}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{p.presenterName || p.confirmedPresenterName || '—'}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {toPersianDigits(p.dateJalali)}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusMeta(p.status).bg}`}>{getStatusMeta(p.status).label}</span>
                    </td>
                    <td className="py-3 px-3">
                      {p.status === 'APPROVED' && (
                        <button onClick={() => handleOpenConfirm(p)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-xl cursor-pointer">
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>تبدیل به تایید جلسه</span>
                        </button>
                      )}
                      {p.status === 'RETURNED_BY_SECRETARY' && (
                        <div className="space-y-1.5 min-w-[210px]">
                          {p.managementDecisionNotes && (
                            <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-1.5">
                              دلیل برگشت دبیر جلسه: {p.managementDecisionNotes}
                            </div>
                          )}
                          <input
                            type="text"
                            value={decisionNotes[p.id] ?? p.managementDecisionNotes ?? ''}
                            onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="دلیل برگشت به پیشنهاددهنده..."
                            className="w-full text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                          />
                          <button onClick={() => handleForwardSecretaryReturn(p)} className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-xl cursor-pointer">
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>جهت اصلاح به پیشنهاددهنده</span>
                          </button>
                        </div>
                      )}
                      {p.status === 'RETURNED_FOR_REVISION' && p.proposerUserId === currentUser.id && (
                        <button onClick={() => setResubmittingProposal(p)} className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-xl cursor-pointer">
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>اصلاح و ارسال مجدد</span>
                        </button>
                      )}
                      {p.status === 'NO_BOARD_REQUIRED' && (
                        <button onClick={() => handleRecoverProposal(p)} className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-xl cursor-pointer">
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>بازیابی</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'CEO' && isCeo && (
        <div className="space-y-3">
          {ceoQueue.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white rounded-2xl p-3 shadow-xs border border-slate-100">
              <div className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setCeoViewMode('cards')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${ceoViewMode === 'cards' ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-white'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>کارتی</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCeoViewMode('grid')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${ceoViewMode === 'grid' ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-white'}`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>گرید</span>
                </button>
              </div>

              <BulkSelectionBar
                totalCount={ceoQueue.length}
                selectedCount={selectedIds.length}
                onToggleAll={(selectAll) => setSelectedIds(selectAll ? ceoQueue.map((p) => p.id) : [])}
                onApprove={() => handleBulkReview('APPROVED')}
                onReject={() => handleBulkReview('REJECTED')}
                onClear={() => setSelectedIds([])}
              />
            </div>
          )}

          {ceoQueue.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs text-xs text-slate-400">
              مصوبه پیشنهادی در انتظار بررسی نیست.
            </div>
          ) : ceoViewMode === 'grid' ? (
            <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-x-auto">
              <table className="w-full min-w-[900px] text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[11px]">
                    <th className="py-2.5 px-3 font-semibold w-8"></th>
                    <th className="py-2.5 px-3 font-semibold">عنوان و توضیحات</th>
                    <th className="py-2.5 px-3 font-semibold">پیشنهاددهنده</th>
                    <th className="py-2.5 px-3 font-semibold">ارائه‌دهنده</th>
                    <th className="py-2.5 px-3 font-semibold">تاریخ ثبت</th>
                    <th className="py-2.5 px-3 font-semibold">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ceoQueue.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr className="hover:bg-slate-50/70 align-top">
                        <td className="py-3 px-3">
                          <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 text-teal-700 rounded-md cursor-pointer" />
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{p.title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{p.description}</div>
                          <div className="text-[10px] font-bold text-teal-700 mt-0.5">{p.proposalNumber}</div>
                          {p.source === 'EXCEL_IMPORT' && <div className="text-[10px] text-teal-700 mt-0.5">منبع ثبت: ورود از Excel</div>}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{p.proposerName} — {p.proposerDepartmentName}</td>
                        <td className="py-3 px-3 text-slate-600">{p.presenterName || '—'}</td>
                        <td className="py-3 px-3 text-slate-600">{toPersianDigits(p.dateJalali)}</td>
                        <td className="py-3 px-3">
                          <div className="space-y-1.5 min-w-[220px]">
                            <input
                              type="text"
                              value={decisionNotes[p.id] || ''}
                              onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="توضیحات تصمیم..."
                              className="w-full text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button onClick={() => handleReview(p, 'APPROVED')} title="تایید" className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleReview(p, 'REJECTED')} title="رد" className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleCeoAlternative(p, 'RETURN')} title="برگشت جهت اصلاح" className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleCeoAlternative(p, 'NO_BOARD_REQUIRED')} title="عدم نیاز به طرح" className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer text-[10px] font-bold px-2">عدم نیاز</button>
                              <button
                                onClick={() => setOrderFormOpen((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                                title="صدور دستور"
                                className={`p-1.5 rounded-lg border cursor-pointer ${orderFormOpen[p.id] ? 'bg-purple-700 text-white border-purple-700' : 'bg-purple-50 text-purple-700 border-purple-200'}`}
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {orderFormOpen[p.id] && (
                        <tr>
                          <td colSpan={6} className="p-3 bg-purple-50 border-t border-purple-200">
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold text-purple-800">مشخصات دستور مستقیم مدیرعامل (فقط برای «صدور دستور»)</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select value={orderAssignees[p.id] || ''} onChange={(e) => setOrderAssignees((prev) => ({ ...prev, [p.id]: e.target.value }))} className="text-xs p-2.5 bg-white border border-purple-200 rounded-xl">
                                  <option value="">مسئول دستور مدیرعامل...</option>
                                  {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} — {user.title}</option>)}
                                </select>
                                <PersianDatePicker value={orderDeadlines[p.id] || ''} onChange={(value) => setOrderDeadlines((prev) => ({ ...prev, [p.id]: value }))} placeholder="مهلت دستور مدیرعامل" />
                              </div>
                              <button onClick={() => handleCeoAlternative(p, 'CEO_ORDER_ISSUED')} className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer">ثبت دستور مدیرعامل</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : ceoQueue.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 mt-1 text-teal-700 rounded-md cursor-pointer shrink-0" />
                <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-800">{p.title}</h4>
              <div className="text-[10px] font-bold text-teal-700">{p.proposalNumber}</div>
              <p className="text-xs text-slate-600">{p.description}</p>
              {p.rationale && <p className="text-[11px] text-slate-500"><strong>ضرورت طرح:</strong> {p.rationale}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span>پیشنهاددهنده: {p.proposerName} — {p.proposerDepartmentName}</span>
                <span>ارائه‌دهنده: {p.presenterName || '—'}</span>
                <span>تاریخ ثبت: {toPersianDigits(p.dateJalali)}</span>
                {p.source === 'EXCEL_IMPORT' && (
                  <span className="text-teal-700 font-bold">
                    منبع ثبت: ورود از Excel{p.sourceLetterNumber ? ` — نامه ${toPersianDigits(p.sourceLetterNumber)}${p.sourceLetterDateJalali ? ` مورخ ${toPersianDigits(p.sourceLetterDateJalali)}` : ''}` : ''}
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-teal-100 bg-teal-50 px-2.5 py-2 text-[11px] text-teal-900"><span className="font-bold">اقدام بعدی: </span>{getNextAction(p.status)}</div>
              <ProposalAiInsight proposal={p} allProposals={proposals} actorId={currentUser.id} onUseNote={(text) => setDecisionNotes((prev) => ({ ...prev, [p.id]: text }))} />
              <input
                type="text"
                value={decisionNotes[p.id] || ''}
                onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="توضیحات تصمیم / دلیل برگشت / متن دستور مدیرعامل"
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => handleReview(p, 'APPROVED')} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تایید</span>
                </button>
                <button onClick={() => handleReview(p, 'REJECTED')} className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>رد</span>
                </button>
                <button onClick={() => handleCeoAlternative(p, 'RETURN')} className="flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold py-2 px-3 rounded-xl cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />برگشت جهت اصلاح</button>
                <button onClick={() => handleCeoAlternative(p, 'NO_BOARD_REQUIRED')} className="bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold py-2 px-3 rounded-xl cursor-pointer">عدم نیاز به طرح</button>
                <button
                  onClick={() => setOrderFormOpen((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className={`flex items-center gap-1.5 text-xs font-bold py-2 px-3 rounded-xl border cursor-pointer ${orderFormOpen[p.id] ? 'bg-purple-700 text-white border-purple-700' : 'bg-purple-50 text-purple-700 border-purple-200'}`}
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />صدور دستور
                </button>
              </div>

              {/* Assignee/deadline apply only to "صدور دستور" (a direct CEO
                  order) — kept out of the shared controls above so picking a
                  مسئول دستور here can never be confused with, or silently
                  dropped by, "برگشت جهت اصلاح" (which always returns to the
                  original proposer; see proposalService.returnForRevision /
                  resubmitProposal). */}
              {orderFormOpen[p.id] && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                  <div className="text-[10px] font-bold text-purple-800">مشخصات دستور مستقیم مدیرعامل (فقط برای «صدور دستور»)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select value={orderAssignees[p.id] || ''} onChange={(e) => setOrderAssignees((prev) => ({ ...prev, [p.id]: e.target.value }))} className="text-xs p-2.5 bg-white border border-purple-200 rounded-xl">
                      <option value="">مسئول دستور مدیرعامل...</option>
                      {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} — {user.title}</option>)}
                    </select>
                    <PersianDatePicker value={orderDeadlines[p.id] || ''} onChange={(value) => setOrderDeadlines((prev) => ({ ...prev, [p.id]: value }))} placeholder="مهلت دستور مدیرعامل" />
                  </div>
                  <button onClick={() => handleCeoAlternative(p, 'CEO_ORDER_ISSUED')} className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer">ثبت دستور مدیرعامل</button>
                </div>
              )}
                </div>
              </div>
            </div>
          ))}

          {issuedOrders.length > 0 && (
            <div className="pt-2 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-500 px-1">دستورات مستقیم صادرشده (پیگیری وضعیت اجرا)</h4>
              {issuedOrders.map((p) => (
                <div key={p.id} className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-1.5">
                  <h4 className="text-sm font-bold text-slate-800">{p.title}</h4>
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-[11px] space-y-1">
                    <div>{p.ceoOrder!.text}</div>
                    <div>مسئول اجرا: {p.ceoOrder!.assigneeName} — مهلت: {toPersianDigits(p.ceoOrder!.deadlineJalali)}</div>
                    <div className="font-bold">
                      وضعیت اجرا:{' '}
                      <span className={p.ceoOrder!.status === 'COMPLETED' ? 'text-emerald-700' : p.ceoOrder!.status === 'IN_PROGRESS' ? 'text-amber-700' : 'text-slate-600'}>
                        {CEO_ORDER_STATUS_LABEL[p.ceoOrder!.status]}
                      </span>
                    </div>
                    {p.ceoOrder!.completionNotes && <div className="p-2 bg-white/70 border border-purple-100 rounded-lg"><span className="font-bold text-purple-900">توضیحات اقدام انجام‌شده: </span>{p.ceoOrder!.completionNotes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'SECRETARY_APPROVAL' && isMeetingSecretaryApprover && (
        <div className="space-y-3">
          {secretaryQueue.length > 0 && (
            <div className="bg-white rounded-2xl px-4 py-3 shadow-xs border border-slate-100">
              <BulkSelectionBar
                totalCount={secretaryQueue.length}
                selectedCount={selectedIds.length}
                onToggleAll={(selectAll) => setSelectedIds(selectAll ? secretaryQueue.map((p) => p.id) : [])}
                onApprove={() => handleBulkSecretaryFinalize('APPROVED')}
                onReject={() => handleBulkSecretaryFinalize('REJECTED')}
                onClear={() => setSelectedIds([])}
                approveLabel="تأیید نهایی گروهی"
              />
            </div>
          )}
          {secretaryQueue.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs text-xs text-slate-400">
              موردی در انتظار تأیید نهایی نیست.
            </div>
          ) : secretaryQueue.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 mt-1 text-teal-700 rounded-md cursor-pointer shrink-0" />
                <h4 className="text-sm font-bold text-slate-800">{p.title}</h4>
              </div>
              <div className="text-[10px] font-bold text-teal-700">{p.proposalNumber}</div>
              <p className="text-xs text-slate-600">{p.description}</p>
              <p className="text-[11px] text-slate-600"><strong>اقدام بعدی:</strong> {getNextAction(p.status)}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span>پیشنهاددهنده: {p.proposerName} — {p.proposerDepartmentName}</span>
                <span>ارائه‌دهنده: {p.confirmedPresenterName || p.presenterName || '—'}</span>
                <span>تاریخ تبدیل به تایید جلسه: {toPersianDigits(p.confirmedDateJalali || '—')}</span>
              </div>
              <input
                type="text"
                value={decisionNotes[p.id] || ''}
                onChange={(e) => setDecisionNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="توضیحات تصمیم / دلیل برگشت"
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => handleSecretaryFinalize(p, 'APPROVED')} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تأیید نهایی</span>
                </button>
                <button onClick={() => handleSecretaryFinalize(p, 'REJECTED')} className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>رد</span>
                </button>
                <button onClick={() => handleSecretaryFinalize(p, 'RETURNED_FOR_REVISION')} className="flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold py-2 px-3 rounded-xl cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>برگشت جهت اصلاح</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'MINE' && isRegularUser && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت مصوبه پیشنهادی جدید</span>
            </button>
          </div>

          {myProposals.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-xs text-xs text-slate-400">
              هنوز مصوبه پیشنهادی ثبت نکرده‌اید.
            </div>
          ) : myProposals.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800">{p.title}</h4>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${getStatusMeta(p.status).bg}`}>{getStatusMeta(p.status).label}</span>
              </div>
              <p className="text-xs text-slate-600">{p.description}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span>ارائه‌دهنده: {p.presenterName || '—'}</span>
                <span>تاریخ ثبت: {toPersianDigits(p.dateJalali)}</span>
                {p.source === 'EXCEL_IMPORT' && <span className="text-teal-700 font-bold">منبع ثبت: ورود از Excel</span>}
              </div>
              {p.managementDecisionNotes && (
                <p className="text-[11px] text-slate-500">یادداشت تصمیم: {p.managementDecisionNotes}</p>
              )}
              {p.ceoOrder && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-[11px] space-y-1">
                  <div className="font-extrabold text-purple-900">دستور مستقیم مدیرعامل</div>
                  <div>{p.ceoOrder.text}</div>
                  <div>مسئول: {p.ceoOrder.assigneeName} — مهلت: {toPersianDigits(p.ceoOrder.deadlineJalali)} — وضعیت: {p.ceoOrder.status === 'PENDING' ? 'در انتظار اقدام' : p.ceoOrder.status === 'IN_PROGRESS' ? 'در حال اقدام' : 'انجام‌شده'}</div>
                  {p.ceoOrder.completionNotes && <div className="p-2 bg-white/70 border border-purple-100 rounded-lg"><span className="font-bold text-purple-900">توضیحات اقدام انجام‌شده: </span>{p.ceoOrder.completionNotes}</div>}
                  {p.ceoOrder.assigneeUserId === currentUser.id && p.ceoOrder.status !== 'COMPLETED' && (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        rows={2}
                        value={orderCompletionNotes[p.id] || ''}
                        onChange={(e) => setOrderCompletionNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="توضیح دهید چه اقدامی انجام شد (برای اعلام انجام الزامی است)..."
                        className="w-full text-[11px] p-2 bg-white border border-purple-200 rounded-lg"
                      />
                      <div className="flex gap-2">
                        {p.ceoOrder.status === 'PENDING' && <button onClick={() => handleOrderStatus(p, 'IN_PROGRESS')} className="bg-purple-700 text-white px-3 py-1.5 rounded-lg font-bold">شروع اقدام</button>}
                        <button onClick={() => handleOrderStatus(p, 'COMPLETED')} className="bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold">اعلام انجام</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {p.status === 'RETURNED_FOR_REVISION' && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-2xl space-y-2">
                  <input value={revisionTitles[p.id] ?? p.title} onChange={(e) => setRevisionTitles((prev) => ({ ...prev, [p.id]: e.target.value }))} className="w-full text-xs p-2.5 bg-white border border-orange-200 rounded-xl" />
                  <textarea rows={3} value={revisionDescriptions[p.id] ?? p.description} onChange={(e) => setRevisionDescriptions((prev) => ({ ...prev, [p.id]: e.target.value }))} className="w-full text-xs p-2.5 bg-white border border-orange-200 rounded-xl" />
                  <textarea rows={2} value={revisionRationales[p.id] ?? p.rationale ?? ''} onChange={(e) => setRevisionRationales((prev) => ({ ...prev, [p.id]: e.target.value }))} placeholder="دلایل و ضرورت" className="w-full text-xs p-2.5 bg-white border border-orange-200 rounded-xl" />
                  <button onClick={() => handleResubmit(p)} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold">ذخیره اصلاحات و ارسال مجدد</button>
                </div>
              )}
              {(p.history?.length || 0) > 0 && <details className="text-[11px] text-slate-500"><summary className="cursor-pointer font-bold">تاریخچه اقدامات ({toPersianDigits(p.history?.length || 0)})</summary><div className="mt-2 space-y-1">{p.history?.map((entry) => <div key={entry.id} className="p-2 bg-slate-50 rounded-lg">{entry.action} — {entry.actorName} — {toPersianDigits(entry.dateJalali)} {toPersianDigits(entry.timeString)}{entry.notes ? ` — ${entry.notes}` : ''}</div>)}</div></details>}
            </div>
          ))}
        </div>
      )}

      <CreateProposalModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
        onImported={triggerRefresh}
      />

      {/* Confirm-for-meeting modal: preserve the presenter selected at proposal creation */}
      {confirmingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                تبدیل به تایید جلسه
              </h3>
              <button onClick={() => setConfirmingProposal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-600">{confirmingProposal.title}</p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="text-slate-500">ارائه‌دهنده: </span>
              <strong className="text-slate-800">{confirmingProposal.presenterName || 'ثبت نشده'}</strong>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button onClick={() => setConfirmingProposal(null)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer">انصراف</button>
              <button onClick={handleConfirmForMeeting} className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs cursor-pointer">تایید</button>
            </div>
          </div>
        </div>
      )}

      {/* Office-manager resubmission of a RETURNED_FOR_REVISION proposal.
          Excel-sourced proposals require a corrected Excel row re-upload;
          manually-created ones reuse the same inline text form as the
          "MINE" tab. */}
      {resubmittingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-orange-600" />
                اصلاح و ارسال مجدد پیشنهاد
              </h3>
              <button onClick={closeResubmitModal} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-600">{resubmittingProposal.title}</p>
            {resubmittingProposal.managementDecisionNotes && (
              <p className="text-[11px] p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-orange-800">دلیل برگشت: {resubmittingProposal.managementDecisionNotes}</p>
            )}

            {resubmittingProposal.source === 'EXCEL_IMPORT' ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500">
                  این پیشنهاد از طریق Excel وارد شده است. برای اصلاح، یک فایل Excel اصلاح‌شده (با همان قالب ورود پیشنهادها، شامل یک ردیف) را دوباره بارگذاری کنید.
                </p>
                <label className="flex items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 hover:border-orange-400 rounded-xl p-4 cursor-pointer text-xs font-bold text-slate-600">
                  <UploadCloud className="w-4 h-4 text-orange-600" />
                  <span>انتخاب فایل Excel اصلاح‌شده</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) handleResubmitExcelFile(e.target.files[0]); e.target.value = ''; }}
                  />
                </label>
                {resubmitExcelError && <p className="text-[11px] text-rose-600 font-bold">{resubmitExcelError}</p>}
                {resubmitExcelResult && (
                  resubmitExcelResult.rows[0]?.isValid ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 space-y-1">
                      <div className="font-bold">ردیف معتبر است و آماده ارسال مجدد:</div>
                      <div>عنوان: {resubmitExcelResult.rows[0].title}</div>
                      <div>سازمان: {resubmitExcelResult.rows[0].matchedDepartment?.name}</div>
                      <div>ارائه‌دهنده: {resubmitExcelResult.rows[0].matchedPresenter?.fullName}</div>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700 space-y-1">
                      <div className="font-bold">ردیف دارای خطا است:</div>
                      <ul className="list-disc pr-4">
                        {(resubmitExcelResult.rows[0]?.errors || ['ردیف معتبری در فایل یافت نشد.']).map((err, idx) => <li key={idx}>{err}</li>)}
                      </ul>
                    </div>
                  )
                )}
                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button onClick={closeResubmitModal} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer">انصراف</button>
                  <button
                    onClick={handleConfirmExcelResubmit}
                    disabled={isResubmittingExcel || !resubmitExcelResult?.rows[0]?.isValid}
                    className="px-5 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-full shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ارسال مجدد
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={revisionTitles[resubmittingProposal.id] ?? resubmittingProposal.title}
                  onChange={(e) => setRevisionTitles((prev) => ({ ...prev, [resubmittingProposal.id]: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <textarea
                  rows={3}
                  value={revisionDescriptions[resubmittingProposal.id] ?? resubmittingProposal.description}
                  onChange={(e) => setRevisionDescriptions((prev) => ({ ...prev, [resubmittingProposal.id]: e.target.value }))}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <textarea
                  rows={2}
                  value={revisionRationales[resubmittingProposal.id] ?? resubmittingProposal.rationale ?? ''}
                  onChange={(e) => setRevisionRationales((prev) => ({ ...prev, [resubmittingProposal.id]: e.target.value }))}
                  placeholder="دلایل و ضرورت"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button onClick={closeResubmitModal} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer">انصراف</button>
                  <button onClick={() => handleResubmit(resubmittingProposal)} className="px-5 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-full shadow-xs cursor-pointer">ذخیره اصلاحات و ارسال مجدد</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
