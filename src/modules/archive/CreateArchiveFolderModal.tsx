import React, { useMemo, useState } from 'react';
import { FolderPlus, X, Users, BriefcaseBusiness } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { archiveService } from '../../services/archiveService';
import { ArchiveScope } from '../../types';
import { SearchableUserMultiSelect } from '../../components/common/SearchableUserMultiSelect';

interface CreateArchiveFolderModalProps {
  scope: ArchiveScope;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateArchiveFolderModal: React.FC<CreateArchiveFolderModalProps> = ({ scope, onClose, onCreated }) => {
  const { currentUser, availableUsers, showToast } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Positions come from the real organizational data (User.title) — never a
  // hard-coded list, so a new position appears here as soon as it exists.
  const availablePositions = useMemo(
    () => Array.from(new Set<string>(availableUsers.map((user) => user.title.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fa')),
    [availableUsers]
  );

  const togglePosition = (position: string) =>
    setPositions((previous) => (previous.includes(position) ? previous.filter((item) => item !== position) : [...previous, position]));

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      await archiveService.createFolder(
        {
          name,
          description,
          scope,
          ownerDepartmentId: scope === 'PERSONAL' ? currentUser.departmentId : undefined,
          access: { userIds, positions },
        },
        currentUser
      );
      showToast('ایجاد پوشه', `پوشه «${name.trim()}» ایجاد شد.`, 'success');
      onCreated();
      onClose();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ایجاد پوشه انجام نشد.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-200">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">ایجاد پوشه</h3>
              <p className="text-[12px] text-teal-200">
                {scope === 'ORGANIZATION' ? 'پوشه جدید در بایگانی سازمانی و تعیین دسترسی آن' : 'پوشه جدید در بایگانی واحد شما'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">نام پوشه *</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: مصوبات مالی"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Users className="w-4 h-4 text-teal-700" />
              <span>تنظیم دسترسی پوشه</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-5">
              اگر هیچ شخص یا سمتی انتخاب نشود، پوشه برای همه کاربران مجاز همین بخش قابل مشاهده است. با انتخاب شخص یا سمت، دسترسی فقط به همان افراد محدود می‌شود.
            </p>

            <SearchableUserMultiSelect
              users={availableUsers}
              selectedIds={userIds}
              onChange={setUserIds}
              label="دسترسی بر اساس شخص"
              placeholder="جستجوی کاربر بر اساس نام، سمت یا واحد..."
            />

            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                <BriefcaseBusiness className="w-3.5 h-3.5 text-teal-700" />
                <span>دسترسی بر اساس سمت</span>
              </div>
              <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 p-2 bg-white border border-slate-200 rounded-xl">
                {availablePositions.map((position) => {
                  const selected = positions.includes(position);
                  return (
                    <button
                      key={position}
                      type="button"
                      onClick={() => togglePosition(position)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${
                        selected ? 'bg-teal-700 text-white border-teal-700' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {position}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer">انصراف</button>
          <button
            onClick={handleCreate}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold bg-teal-800 hover:bg-teal-700 text-white rounded-full shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'در حال ایجاد...' : 'ایجاد پوشه'}
          </button>
        </div>
      </div>
    </div>
  );
};
