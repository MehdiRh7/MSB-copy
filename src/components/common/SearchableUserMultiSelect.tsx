import React, { useMemo, useState } from 'react';
import { CheckCircle2, Search, X } from 'lucide-react';
import { User } from '../../types';

interface SearchableUserMultiSelectProps {
  users: User[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
  maxHeightClassName?: string;
}

export const SearchableUserMultiSelect: React.FC<SearchableUserMultiSelectProps> = ({
  users,
  selectedIds,
  onChange,
  label = 'افراد مرتبط',
  placeholder = 'جستجو بر اساس نام، سمت یا واحد سازمانی...',
  maxHeightClassName = 'max-h-40',
}) => {
  const [query, setQuery] = useState('');
  const selectedUsers = useMemo(() => users.filter((user) => selectedIds.includes(user.id)), [users, selectedIds]);
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      user.fullName.toLowerCase().includes(normalized) ||
      user.title.toLowerCase().includes(normalized) ||
      user.departmentName.toLowerCase().includes(normalized)
    );
  }, [query, users]);

  const toggle = (userId: string) => {
    onChange(selectedIds.includes(userId)
      ? selectedIds.filter((id) => id !== userId)
      : [...selectedIds, userId]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-bold text-slate-700">{label}</label>
        <span className="text-[11px] text-slate-400">{selectedIds.length} نفر</span>
      </div>
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((user) => (
            <span key={user.id} className="inline-flex items-center gap-1 bg-teal-50 text-teal-900 border border-teal-200 text-[11px] py-1 px-2 rounded-full">
              {user.fullName}
              <button type="button" onClick={() => toggle(user.id)} className="text-teal-700 hover:text-rose-600" aria-label={`حذف ${user.fullName}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="w-full text-xs p-2.5 pr-8 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 overflow-y-auto ${maxHeightClassName}`}>
        {filteredUsers.map((user) => {
          const selected = selectedIds.includes(user.id);
          return (
            <button key={user.id} type="button" onClick={() => toggle(user.id)} className={`p-2 rounded-xl border text-right flex items-center justify-between ${selected ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span><span className="block text-[12px] font-bold text-slate-800">{user.fullName}</span><span className="block text-[11px] text-slate-500">{user.title}</span></span>
              {selected && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
