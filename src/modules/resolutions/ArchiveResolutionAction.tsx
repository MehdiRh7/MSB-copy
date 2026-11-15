import React, { useEffect, useState } from 'react';
import { Archive, Undo2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { archiveService } from '../../services/archiveService';
import { ArchiveFolder, ArchiveScope, Resolution } from '../../types';
import { toPersianDigits } from '../../utils/formatters';

interface ArchiveResolutionActionProps {
  resolution: Resolution;
  onChanged: () => void;
}

/**
 * Files a resolution into the archive, or takes it back out. Both directions
 * go through archiveService — the resolution entity is never deleted, and the
 * signature / ابلاغ / execution / verification / follow-up workflows are
 * untouched either way.
 */
export const ArchiveResolutionAction: React.FC<ArchiveResolutionActionProps> = ({ resolution, onChanged }) => {
  const { currentUser, showToast, hasPermission } = useApp();
  const canUseOrgArchive = hasPermission('VIEW_ORGANIZATION_ARCHIVE');

  const [scope, setScope] = useState<ArchiveScope>('PERSONAL');
  const [folders, setFolders] = useState<ArchiveFolder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (scope !== 'ORGANIZATION' || !canUseOrgArchive) return;
    archiveService
      .getFolders('ORGANIZATION', currentUser)
      .then((response) => { if (response.isSuccess) setFolders(response.data); })
      .catch(() => setFolders([]));
  }, [scope, canUseOrgArchive, currentUser]);

  const handleArchive = async () => {
    if (!window.confirm(`مصوبه «${resolution.topicTitle}» به بایگانی منتقل شود؟ (از فهرست مصوبات خارج می‌شود و حذف نمی‌شود)`)) return;
    setIsBusy(true);
    try {
      await archiveService.archiveResolution(resolution, scope, currentUser, scope === 'ORGANIZATION' ? folderId : undefined);
      showToast('بایگانی مصوبه', 'مصوبه بایگانی شد و از فهرست مصوبات خارج گردید.', 'success');
      onChanged();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'بایگانی مصوبه انجام نشد.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('مصوبه از بایگانی خارج و به فهرست مصوبات بازگردانده شود؟')) return;
    setIsBusy(true);
    try {
      await archiveService.restoreResolution(resolution.id, currentUser);
      showToast('خروج از بایگانی', 'مصوبه به فهرست مصوبات بازگشت؛ اطلاعات، پیوست‌ها و تاریخچه حفظ شدند.', 'success');
      onChanged();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'خروج از بایگانی انجام نشد.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  if (resolution.archive) {
    return (
      <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2.5">
        <div className="text-[12px] text-purple-950 leading-6">
          <strong className="block">این مصوبه بایگانی شده است</strong>
          {resolution.archive.scope === 'ORGANIZATION'
            ? `بایگانی سازمانی — پوشه «${resolution.archive.folderName || '—'}»`
            : 'بایگانی شخصی'}
          {' — '}
          {toPersianDigits(resolution.archive.archivedDateJalali)} توسط {resolution.archive.archivedByName}
        </div>
        <button
          type="button"
          onClick={handleRestore}
          disabled={isBusy}
          className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer disabled:opacity-50"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>{isBusy ? 'در حال انجام...' : 'حذف از بایگانی'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
      <div className="text-xs font-bold text-slate-800">انتقال به بایگانی</div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">نوع بایگانی</label>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as ArchiveScope)}
            className="text-xs p-2 bg-white border border-slate-200 rounded-xl font-bold"
          >
            <option value="PERSONAL">بایگانی شخصی</option>
            {canUseOrgArchive && <option value="ORGANIZATION">بایگانی سازمانی</option>}
          </select>
        </div>

        {scope === 'ORGANIZATION' && (
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">پوشه مقصد</label>
            <select
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
              className="text-xs p-2 bg-white border border-slate-200 rounded-xl font-bold min-w-[160px]"
            >
              <option value="">انتخاب پوشه...</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={handleArchive}
          disabled={isBusy}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer disabled:opacity-50"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{isBusy ? 'در حال انجام...' : 'بایگانی مصوبه'}</span>
        </button>
      </div>
    </div>
  );
};
