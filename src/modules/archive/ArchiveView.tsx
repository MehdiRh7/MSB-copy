import React, { useCallback, useEffect, useState } from 'react';
import { Archive, FolderPlus, Folder, Trash2, ChevronDown, ChevronUp, FilePlus2, X, Building2, User as UserIcon, Undo2, FileCheck2, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { archiveService } from '../../services/archiveService';
import { proposalService } from '../../services/proposalService';
import { ArchiveFolder, ArchiveItem, Proposal } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { ResolutionDetailModal } from '../resolutions/ResolutionDetailModal';
import { CreateArchiveFolderModal } from './CreateArchiveFolderModal';

type ArchiveTab = 'PERSONAL' | 'ORGANIZATION';

export const ArchiveView: React.FC = () => {
  const { currentUser, showToast, refreshTrigger, triggerRefresh, hasPermission } = useApp();
  const canViewOrgArchive = hasPermission('VIEW_ORGANIZATION_ARCHIVE');
  const canManageOrgFolders = hasPermission('MANAGE_ARCHIVE_FOLDERS');

  const [tab, setTab] = useState<ArchiveTab>('PERSONAL');
  const [folders, setFolders] = useState<ArchiveFolder[]>([]);
  const [folderError, setFolderError] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [personalItems, setPersonalItems] = useState<ArchiveItem[]>([]);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<Record<string, ArchiveItem[]>>({});
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [pickerFolderId, setPickerFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Opening a resolution from the archive keeps the tab/folder/filter state
  // untouched behind the modal, so closing it returns to the same place.
  const [openResolutionId, setOpenResolutionId] = useState<string | null>(null);

  const [orgFolderCount, setOrgFolderCount] = useState(0);
  const canManageFolders = tab === 'PERSONAL' || canManageOrgFolders;
  // A folder can grant access by name or position on its own, so the tab is
  // shown to anyone who really has something to open there.
  const showOrgTab = canViewOrgArchive || orgFolderCount > 0;

  const fetchFolders = useCallback(async () => {
    setFolderError('');
    try {
      const res = await archiveService.getFolders(tab, currentUser, tab === 'PERSONAL' ? currentUser.departmentId : undefined);
      if (res.isSuccess) setFolders(res.data);
    } catch (error) {
      setFolders([]);
      setFolderError(error instanceof Error ? error.message : 'دریافت پوشه‌ها انجام نشد.');
    }
  }, [tab, currentUser]);

  const fetchPersonalItems = useCallback(async () => {
    const res = await archiveService.getPersonalResolutionItems(currentUser);
    if (res.isSuccess) setPersonalItems(res.data);
  }, [currentUser]);

  const fetchProposals = useCallback(async () => {
    const res = await proposalService.getProposals({ pageSize: 1000 });
    if (res.isSuccess) setProposals(res.data.items);
  }, []);

  useEffect(() => {
    fetchFolders();
    fetchProposals();
    fetchPersonalItems();
    setExpandedFolderId(null);
  }, [fetchFolders, fetchProposals, fetchPersonalItems, refreshTrigger]);

  useEffect(() => {
    archiveService
      .getFolders('ORGANIZATION', currentUser)
      .then((response) => setOrgFolderCount(response.isSuccess ? response.data.length : 0))
      .catch(() => setOrgFolderCount(0));
  }, [currentUser, refreshTrigger]);

  const loadFolderItems = async (folderId: string) => {
    try {
      const res = await archiveService.getItems(folderId, currentUser);
      if (res.isSuccess) setFolderItems((prev) => ({ ...prev, [folderId]: res.data }));
    } catch (error) {
      showToast('دسترسی غیرمجاز', error instanceof Error ? error.message : 'محتوای پوشه در دسترس نیست.', 'error');
      setExpandedFolderId(null);
    }
  };

  const toggleFolder = (folderId: string) => {
    if (expandedFolderId === folderId) {
      setExpandedFolderId(null);
      return;
    }
    setExpandedFolderId(folderId);
    loadFolderItems(folderId);
  };

  const handleDeleteFolder = async (folder: ArchiveFolder) => {
    if (!window.confirm(`پوشه «${folder.name}» و ارجاعات داخل آن حذف شود؟ (مصوبات و پیشنهادها حذف نمی‌شوند)`)) return;
    try {
      await archiveService.deleteFolder(folder.id, currentUser);
      showToast('حذف پوشه', `پوشه «${folder.name}» حذف شد.`, 'info');
      if (expandedFolderId === folder.id) setExpandedFolderId(null);
      fetchFolders();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'حذف پوشه انجام نشد.', 'error');
    }
  };

  const handleArchiveProposal = async (folderId: string, proposal: Proposal) => {
    try {
      await archiveService.archiveProposal(folderId, proposal.id, proposal.title, currentUser);
      showToast('افزودن به بایگانی', `«${proposal.title}» به پوشه اضافه شد.`, 'success');
      loadFolderItems(folderId);
      setPickerFolderId(null);
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'افزودن به بایگانی انجام نشد.', 'error');
    }
  };

  const handleRemoveProposalItem = async (folderId: string, item: ArchiveItem) => {
    await archiveService.removeItem(item.id);
    showToast('حذف از پوشه', `«${item.proposalTitle}» از پوشه حذف شد.`, 'info');
    loadFolderItems(folderId);
  };

  /**
   * «حذف از بایگانی» — a restore, not a delete. The resolution returns to the
   * resolution list with its pre-archive status, attachments and timeline
   * intact; the entity is never removed.
   */
  const handleRestoreResolution = async (item: ArchiveItem, folderId?: string) => {
    if (!window.confirm(`مصوبه «${item.resolutionTitle}» از بایگانی خارج و به فهرست مصوبات بازگردانده شود؟`)) return;
    try {
      await archiveService.restoreResolution(item.resolutionId!, currentUser);
      showToast('خروج از بایگانی', 'مصوبه به فهرست مصوبات بازگشت. اطلاعات، پیوست‌ها و تاریخچه حفظ شده‌اند.', 'success');
      if (folderId) loadFolderItems(folderId);
      fetchPersonalItems();
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'خروج از بایگانی انجام نشد.', 'error');
    }
  };

  const matchesSearch = (value?: string) => !search.trim() || (value || '').toLowerCase().includes(search.trim().toLowerCase());
  const eligibleProposals = proposals.filter((p) => (tab === 'PERSONAL' ? p.proposerDepartmentId === currentUser.departmentId : true));
  const pickerAlreadyInFolder = new Set((pickerFolderId ? folderItems[pickerFolderId] : [])?.filter((i) => i.proposalId).map((i) => i.proposalId));
  const visiblePersonalItems = personalItems.filter((item) => matchesSearch(item.resolutionTitle) || matchesSearch(item.resolutionNumber));

  const renderResolutionRow = (item: ArchiveItem, folderId?: string) => (
    <div key={item.id} className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200/90 rounded-xl hover:border-teal-300 transition-colors">
      <button
        type="button"
        onClick={() => setOpenResolutionId(item.resolutionId!)}
        className="flex items-center gap-2.5 min-w-0 text-right flex-1 cursor-pointer"
        title="مشاهده جزئیات مصوبه"
      >
        <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700 shrink-0">
          <FileCheck2 className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-slate-800 truncate">{item.resolutionTitle}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {toPersianDigits(item.resolutionNumber || '—')} — بایگانی توسط {item.movedByName}
          </div>
        </div>
      </button>
      <button
        onClick={() => handleRestoreResolution(item, folderId)}
        className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg cursor-pointer"
        title="خروج از بایگانی و بازگشت به فهرست مصوبات"
      >
        <Undo2 className="w-3.5 h-3.5" />
        <span>حذف از بایگانی</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-5 pb-12">
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100">
        <h1 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Archive className="w-5 h-5 text-amber-500" />
          <span>بایگانی</span>
        </h1>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          بایگانی شخصی هر کاربر و بایگانی سازمانی پوشه‌محور برای مصوبات و پیشنهادها
        </p>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => setTab('PERSONAL')}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              tab === 'PERSONAL' ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>شخصی</span>
          </button>
          {showOrgTab && (
            <button
              onClick={() => setTab('ORGANIZATION')}
              className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                tab === 'ORGANIZATION' ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>سازمانی</span>
            </button>
          )}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجو در بایگانی..."
            className="text-xs p-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500 focus:outline-none flex-1 min-w-[180px]"
          />
        </div>
      </div>

      {/* ——— Personal archive: this user's own archived resolutions ——— */}
      {tab === 'PERSONAL' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-xs font-bold text-slate-800">مصوبات بایگانی‌شده شخصی من</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">این فهرست فقط برای شما قابل مشاهده است.</p>
            </div>
            <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
              {toPersianDigits(visiblePersonalItems.length)} مورد
            </span>
          </div>

          {visiblePersonalItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">هنوز مصوبه‌ای در بایگانی شخصی شما نیست.</div>
          ) : (
            <div className="space-y-1.5">{visiblePersonalItems.map((item) => renderResolutionRow(item))}</div>
          )}
        </div>
      )}

      {/* ——— Folders: organizational archive, and the department's own ——— */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h2 className="text-xs font-bold text-slate-800">
            {tab === 'ORGANIZATION' ? 'پوشه‌های بایگانی سازمانی' : 'پوشه‌های بایگانی واحد من'}
          </h2>
          {canManageFolders && (
            <button
              onClick={() => setIsNewFolderOpen(true)}
              className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>ایجاد پوشه</span>
            </button>
          )}
        </div>

        {folderError ? (
          <div className="py-10 text-center text-xs text-rose-600 flex flex-col items-center gap-2">
            <Lock className="w-6 h-6 text-rose-300" />
            <span>{folderError}</span>
          </div>
        ) : folders.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">پوشه‌ای که به آن دسترسی داشته باشید در این بخش وجود ندارد.</div>
        ) : (
          <div className="space-y-2.5">
            {folders.filter((folder) => matchesSearch(folder.name)).map((folder) => {
              const items = folderItems[folder.id] || [];
              const resolutionItems = items.filter((item) => item.itemType === 'RESOLUTION');
              const proposalItems = items.filter((item) => item.itemType !== 'RESOLUTION');
              const isExpanded = expandedFolderId === folder.id;
              const restricted = Boolean(folder.access && (folder.access.userIds.length > 0 || folder.access.positions.length > 0));
              return (
                <div key={folder.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-slate-50/70">
                    <button onClick={() => toggleFolder(folder.id)} className="flex items-center gap-2.5 cursor-pointer text-right flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                          {folder.name}
                          {restricted && <Lock className="w-3 h-3 text-slate-400" />}
                        </div>
                        {folder.description && <div className="text-[11px] text-slate-500 truncate mt-0.5">{folder.description}</div>}
                        <div className="text-[11px] text-slate-400 mt-0.5">ایجادکننده: {folder.createdByName}</div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => { setPickerFolderId(folder.id); if (!isExpanded) toggleFolder(folder.id); }}
                        className="p-1.5 rounded-lg text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                        title="افزودن پیشنهاد به این پوشه"
                      >
                        <FilePlus2 className="w-3.5 h-3.5" />
                      </button>
                      {canManageFolders && (
                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                          title="حذف پوشه"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3 space-y-2">
                      {pickerFolderId === folder.id && (
                        <div className="p-3 bg-teal-50/60 border border-teal-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold text-teal-900">انتخاب پیشنهاد برای افزودن به پوشه</span>
                            <button onClick={() => setPickerFolderId(null)} className="text-teal-700 hover:text-teal-900 cursor-pointer"><X className="w-4 h-4" /></button>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1.5">
                            {eligibleProposals.filter((p) => !pickerAlreadyInFolder.has(p.id)).length === 0 ? (
                              <div className="text-[12px] text-slate-400 py-2 text-center">پیشنهاد قابل افزودنی وجود ندارد.</div>
                            ) : eligibleProposals.filter((p) => !pickerAlreadyInFolder.has(p.id)).map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleArchiveProposal(folder.id, p)}
                                className="w-full text-right p-2 bg-white border border-slate-200 rounded-lg text-[12px] hover:border-teal-400 transition-colors cursor-pointer flex items-center justify-between gap-2"
                              >
                                <span className="truncate font-bold text-slate-700">{p.title}</span>
                                <span className="text-slate-400 shrink-0">{p.proposerDepartmentName}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {items.length === 0 ? (
                        <div className="text-[12px] text-slate-400 py-3 text-center">هنوز مصوبه‌ای در این پوشه بایگانی نشده است.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {resolutionItems.map((item) => renderResolutionRow(item, folder.id))}
                          {proposalItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200/90 rounded-xl">
                              <div className="min-w-0">
                                <div className="text-[12px] font-bold text-slate-800 truncate">{item.proposalTitle}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">پیشنهاد — افزوده‌شده توسط {item.movedByName}</div>
                              </div>
                              <button
                                onClick={() => handleRemoveProposalItem(folder.id, item)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                                title="حذف از پوشه"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isNewFolderOpen && (
        <CreateArchiveFolderModal
          scope={tab}
          onClose={() => setIsNewFolderOpen(false)}
          onCreated={fetchFolders}
        />
      )}

      {openResolutionId && (
        <ResolutionDetailModal resolutionId={openResolutionId} onClose={() => setOpenResolutionId(null)} />
      )}
    </div>
  );
};
