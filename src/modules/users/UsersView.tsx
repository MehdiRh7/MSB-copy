import React, { useState } from 'react';
import { Users, ShieldCheck, Mail, Phone, Search, UserPlus, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockDepartments } from '../../mock/data';
import { toPersianDigits } from '../../utils/formatters';
import { CreateUserModal } from './CreateUserModal';
import { User } from '../../types';

export const UsersView: React.FC = () => {
  const { availableUsers, hasPermission } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const canManageUsers = hasPermission('CREATE_USER') || hasPermission('MANAGE_USERS');

  const filteredUsers = availableUsers.filter((u) => {
    const matchSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.departmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchDept = deptFilter === 'ALL' || u.departmentId === deptFilter;
    return matchSearch && matchDept;
  });

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'مدیر ارشد سیستم';
      case 'CEO':
        return 'ریاست / مدیرعامل';
      case 'SECRETARY':
        return 'دبیر جلسات';
      case 'DEPT_MANAGER':
        return 'مدیر واحد / صحه‌گذار';
      case 'EXPERT_ASSIGNEE':
        return 'کارشناس مجری';
      default:
        return 'کاربر سازمانی';
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-700" />
            <span>مدیریت ساختار سازمانی، واحدها و کاربران</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            فهرست کاربران، سمت‌های سازمانی و سطوح دسترسی سامانه‌ مصوبات (تعداد: {toPersianDigits(availableUsers.length)} نفر)
          </p>
        </div>

        {canManageUsers && (
          <button
            onClick={() => setIsAddUserOpen(true)}
            className="flex items-center gap-2 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>افزودن کاربر جدید</span>
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در نام کاربر، نام کاربری، سمت سازمانی یا واحد..."
            className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
        </div>

        <div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
          >
            <option value="ALL">همه واحدهای سازمانی</option>
            {mockDepartments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((user) => (
          <div
            key={user.id}
            className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 hover:border-teal-400 hover:shadow-md transition-all space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-800 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                  {user.fullName.split(' ')[0][0]}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">{user.fullName}</h3>
                  <p className="text-[12px] text-slate-500">{user.title}</p>
                  <span className="inline-block text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md mt-1">
                    {user.departmentName}
                  </span>
                </div>
              </div>

              <div>
                {user.isActive ? (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    فعال
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    غیرفعال
                  </span>
                )}
              </div>
            </div>

            {canManageUsers && (
              <button
                type="button"
                onClick={() => setEditingUser(user)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 text-[12px] font-bold"
              >
                <Pencil className="w-3.5 h-3.5" />
                ویرایش کاربر
              </button>
            )}

            <div className="space-y-1.5 text-[12px] text-slate-600 pt-2 border-t border-slate-100">
              {user.username && (
                <div className="flex items-center justify-between text-slate-500">
                  <span>نام کاربری:</span>
                  <span className="font-mono text-slate-700 font-bold" dir="ltr">@{user.username}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span dir="ltr" className="text-right truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>شماره همراه: {toPersianDigits(user.phone || '۰۹۱۲۰۰۰۰۰۰۰')}</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>نقش سیستمی: <strong>{getRoleLabel(user.role)}</strong></span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
      />
      <CreateUserModal
        isOpen={Boolean(editingUser)}
        user={editingUser}
        onClose={() => setEditingUser(null)}
      />
    </div>
  );
};
