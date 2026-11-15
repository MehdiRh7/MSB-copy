import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SignatureImageField } from '../../components/common/SignatureImageField';
import { mockDepartments } from '../../mock/data';
import { User, UserRole } from '../../types';
import { PersianDatePicker } from '../../components/common/PersianDatePicker';
import { X, UserPlus, Save, User as UserIcon, KeyRound, Building2, PenTool, Upload, Trash2 } from 'lucide-react';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
}

type UserFormTab = 'PERSONAL' | 'ACCOUNT' | 'POSITION' | 'SIGNATURE';

const TABS: { id: UserFormTab; label: string; icon: React.ElementType }[] = [
  { id: 'PERSONAL', label: 'اطلاعات شخصی', icon: UserIcon },
  { id: 'ACCOUNT', label: 'حساب کاربری', icon: KeyRound },
  { id: 'POSITION', label: 'سمت سازمانی', icon: Building2 },
  { id: 'SIGNATURE', label: 'امضای کاربر', icon: PenTool },
];

export const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, user }) => {
  const { addUser, updateUser, showToast, hasPermission } = useApp();
  // Only administration manages signature images; the tab is hidden entirely
  // for anyone else, and userService rejects the write regardless.
  const canManageSignatures = hasPermission('MANAGE_USER_SIGNATURES');
  const [activeTab, setActiveTab] = useState<UserFormTab>('PERSONAL');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDateJalali, setBirthDateJalali] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [username, setUsername] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState(mockDepartments[0].id);
  const [role, setRole] = useState<UserRole>('EXPERT_ASSIGNEE');

  const [signatureUrl, setSignatureUrl] = useState('');
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('PERSONAL');
    setFirstName(user?.firstName || user?.fullName.split(' ')[0] || '');
    setLastName(user?.lastName || user?.fullName.split(' ').slice(1).join(' ') || '');
    setBirthDateJalali(user?.birthDateJalali || '');
    setPhone(user?.phone || '');
    setEmail(user?.email || '');
    setUsername(user?.username || '');
    setIsActive(user?.isActive ?? true);
    setTitle(user?.title || '');
    setDepartmentId(user?.departmentId || mockDepartments[0].id);
    setRole(user?.role || 'EXPERT_ASSIGNEE');
    setSignatureUrl(user?.signatureUrl || '');
  }, [isOpen, user]);

  if (!isOpen) return null;

  const getPermissionsForRole = (r: UserRole): string[] => {
    switch (r) {
      case 'ADMIN':
        return [
          'VIEW_DASHBOARD',
          'VIEW_MEETINGS',
          'CREATE_MEETING',
          'EDIT_MEETING',
          'DELETE_MEETING',
          'CREATE_RESOLUTION',
          'VIEW_RESOLUTIONS',
          'EDIT_RESOLUTION',
          'VIEW_TASKS',
          'VIEW_APPROVALS',
          'APPROVE_RESOLUTION',
          'REJECT_RESOLUTION',
          'VIEW_REPORTS',
          'MANAGE_USERS',
          'CREATE_USER',
        ];
      case 'CEO':
        return [
          'VIEW_DASHBOARD',
          'VIEW_MEETINGS',
          'VIEW_RESOLUTIONS',
          'VIEW_APPROVALS',
          'APPROVE_RESOLUTION',
          'REJECT_RESOLUTION',
          'VIEW_REPORTS',
        ];
      case 'SECRETARY':
        return [
          'VIEW_DASHBOARD',
          'VIEW_MEETINGS',
          'CREATE_MEETING',
          'EDIT_MEETING',
          'CREATE_RESOLUTION',
          'VIEW_RESOLUTIONS',
          'EDIT_RESOLUTION',
          'VIEW_TASKS',
        ];
      case 'DEPT_MANAGER':
        return [
          'VIEW_DASHBOARD',
          'VIEW_MEETINGS',
          'VIEW_RESOLUTIONS',
          'VIEW_TASKS',
          'VIEW_APPROVALS',
          'APPROVE_RESOLUTION',
          'REJECT_RESOLUTION',
          'VIEW_REPORTS',
        ];
      case 'EXPERT_ASSIGNEE':
      default:
        return ['VIEW_DASHBOARD', 'VIEW_MEETINGS', 'VIEW_TASKS'];
    }
  };

  /**
   * Role defaults are a STARTING POINT for a new user, never a reset for an
   * existing one. Editing someone's profile must not silently strip
   * permissions that were granted to them individually (NOTIFY_RESOLUTION,
   * APPROVE_MEETING_CONFIRMATION, the follow-up permissions, …) — those are
   * managed in the permissions dialog and are the reason a persona works at
   * all. Changing the role only ADDS that role's baseline on top.
   */
  const resolvePermissions = (): string[] => {
    if (!user) return getPermissionsForRole(role);
    const existing = user.permissions || [];
    if (user.role === role) return existing;
    return Array.from(new Set<string>([...existing, ...getPermissionsForRole(role)]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      showToast('خطا', 'نام و نام خانوادگی الزامی است.', 'error');
      setActiveTab('PERSONAL');
      return;
    }

    const dept = mockDepartments.find((d) => d.id === departmentId) || mockDepartments[0];
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const generatedUsername = username.trim() || `user_${Date.now().toString().slice(-4)}`;

    setIsSubmitting(true);
    try {
      const userData: Omit<User, 'id'> = {
        nationalCode: user?.nationalCode || '00' + Math.floor(10000000 + Math.random() * 90000000),
        username: generatedUsername,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fullName,
        birthDateJalali: birthDateJalali || undefined,
        title: title.trim() || `کارشناس ${dept.name}`,
        email: email.trim() || `${generatedUsername}@org.gov.ir`,
        phone: phone.trim() || '0912' + Math.floor(1000000 + Math.random() * 9000000),
        internalPhone: user?.internalPhone || Math.floor(100 + Math.random() * 899).toString(),
        role,
        departmentId: dept.id,
        departmentName: dept.name,
        organizationId: 'org-1',
        organizationName: 'سازمان مرکزی فناوری و اطلاعات',
        signatureUrl: signatureUrl || undefined,
        isActive,
        permissions: resolvePermissions(),
      };

      if (user) await updateUser(user.id, userData);
      else await addUser(userData);

      onClose();
    } catch (err) {
      showToast('خطا', 'افزودن کاربر با خطا مواجه شد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-200">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{user ? 'ویرایش کاربر' : 'کاربر جدید'}</h3>
              <p className="text-[12px] text-teal-200">{user ? 'اصلاح مشخصات، سمت سازمانی و امضای کاربر' : 'تعریف مشخصات هویتی، سمت سازمانی، حساب کاربری و امضا'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100 shrink-0 overflow-x-auto">
          {TABS.filter(({ id }) => id !== 'SIGNATURE' || canManageSignatures).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'PERSONAL' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نام <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="مثال: علی"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نام خانوادگی <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="مثال: حسینی"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <PersianDatePicker label="تاریخ تولد" value={birthDateJalali} onChange={setBirthDateJalali} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره تماس همراه</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09121234567"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  dir="ltr"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">پست الکترونیکی</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@org.gov.ir"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {activeTab === 'ACCOUNT' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نام کاربری (Username)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="مثال: a_hosseini"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  dir="ltr"
                />
                <p className="text-[11px] text-slate-400 mt-1">در صورت خالی گذاشتن، به‌صورت خودکار تولید می‌شود.</p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">وضعیت حساب کاربری</span>
                  <span className="text-[12px] text-slate-500">امکان ورود و انتخاب کاربر در فرآیندهای جلسه و مصوبات</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-700"></div>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'POSITION' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">سمت سازمانی</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: کارشناس ارشد شبکه و امنیت"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اداره</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
                >
                  {mockDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نقش و سطح دسترسی</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-bold text-teal-900"
                >
                  <option value="ADMIN">مدیر ارشد سیستم (Full Admin)</option>
                  <option value="CEO">مدیرعامل / ریاست سازمان (CEO)</option>
                  <option value="SECRETARY">دبیر جلسات / مسئول دفتر (Secretary)</option>
                  <option value="DEPT_MANAGER">مدیر واحد / صحه‌گذار (Dept Manager)</option>
                  <option value="EXPERT_ASSIGNEE">کارشناس مجری مصوبه (Expert Assignee)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'SIGNATURE' && (
            /* Signature images are managed here and nowhere else — the shared
               field is the app's single signature editor, and the permission
               is re-checked in userService when the form is saved. */
            <SignatureImageField
              ownerName={user ? user.fullName : `${firstName} ${lastName}`.trim() || undefined}
              value={signatureUrl || undefined}
              onChange={(next) => setSignatureUrl(next || '')}
              canManage={canManageSignatures}
            />
          )}

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {user ? <Save className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>{isSubmitting ? 'در حال ذخیره...' : user ? 'ذخیره تغییرات' : 'ذخیره'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
