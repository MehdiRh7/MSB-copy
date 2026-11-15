import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Save } from 'lucide-react';
import { User, PermissionKey } from '../../types';
import { useApp } from '../../context/AppContext';
import { PERMISSION_LABELS } from '../../utils/permissionLabels';

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

interface PermissionsModalProps {
  user: User | null;
  onClose: () => void;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({ user, onClose }) => {
  const { updateUser } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) setSelected(user.permissions || []);
  }, [user]);

  if (!user) return null;

  const togglePermission = (key: PermissionKey) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { id, ...rest } = user;
      await updateUser(id, { ...rest, permissions: selected });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">سطح دسترسی کاربر</h3>
              <p className="text-[12px] text-teal-200">{user.fullName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-2 flex-1">
          {ALL_PERMISSIONS.map((key) => (
            <label key={key} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={() => togglePermission(key)}
                className="w-4 h-4 text-teal-700 rounded-md cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-700">{PERMISSION_LABELS[key]}</span>
            </label>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer">انصراف</button>
          <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer">
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره دسترسی‌ها'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
