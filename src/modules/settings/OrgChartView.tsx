import React, { useState } from 'react';
import { Plus, Users2, X, Crown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mockDepartments } from '../../mock/data';
import { loadLocalValue, saveLocalValue } from '../../services/localStore';
import { toPersianDigits } from '../../utils/formatters';
import { User } from '../../types';

interface CustomPosition {
  id: string;
  name: string;
}

export const OrgChartView: React.FC = () => {
  const { availableUsers, showToast } = useApp();
  const [selectedGroup, setSelectedGroup] = useState<{ title: string; members: User[] } | null>(null);
  const [customPositions, setCustomPositions] = useState<CustomPosition[]>(() => loadLocalValue('customPositions', [] as CustomPosition[]));
  const [isAddingPosition, setIsAddingPosition] = useState(false);
  const [newPositionName, setNewPositionName] = useState('');

  const leadership = availableUsers.filter((u) => u.role === 'CEO' || u.role === 'ADMIN');

  const departmentGroups = mockDepartments.map((dept) => ({
    dept,
    members: availableUsers.filter((u) => u.departmentId === dept.id && u.role !== 'CEO' && u.role !== 'ADMIN'),
  })).filter((g) => g.members.length > 0);

  const handleAddPosition = () => {
    if (!newPositionName.trim()) {
      showToast('خطا', 'نام سمت الزامی است.', 'error');
      return;
    }
    const next = [...customPositions, { id: `pos-${Date.now()}`, name: newPositionName.trim() }];
    setCustomPositions(next);
    saveLocalValue('customPositions', next);
    setNewPositionName('');
    setIsAddingPosition(false);
    showToast('چارت سازمانی', 'سمت جدید اضافه شد.', 'success');
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 className="text-xs font-bold text-slate-800">چارت سازمانی</h3>
        <button onClick={() => setIsAddingPosition(true)} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow-xs cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
          <span>سمت جدید</span>
        </button>
      </div>

      {/* Leadership tier */}
      <div className="flex flex-wrap justify-center gap-3">
        {leadership.map((user) => (
          <button
            key={user.id}
            onClick={() => setSelectedGroup({ title: user.title, members: [user] })}
            className="flex flex-col items-center gap-1 px-5 py-3 rounded-2xl border-2 border-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer min-w-[160px]"
          >
            <Crown className="w-4 h-4 text-teal-700" />
            <span className="text-xs font-bold text-teal-900">{user.fullName}</span>
            <span className="text-[11px] text-teal-700">{user.title}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <div className="w-px h-6 bg-slate-300" />
      </div>

      {/* Department tier */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {departmentGroups.map(({ dept, members }) => (
          <button
            key={dept.id}
            onClick={() => setSelectedGroup({ title: dept.name, members })}
            className="flex flex-col gap-1.5 p-4 rounded-2xl border border-slate-200 hover:border-teal-300 hover:bg-slate-50 transition-colors cursor-pointer text-right"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">{dept.name}</span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                <Users2 className="w-3 h-3" />
                {toPersianDigits(members.length)} نفر
              </span>
            </div>
            <span className="text-[12px] text-slate-500">مدیر: {dept.managerName}</span>
          </button>
        ))}

        {customPositions.map((pos) => (
          <div key={pos.id} className="flex flex-col gap-1.5 p-4 rounded-2xl border border-dashed border-slate-300 text-right">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">{pos.name}</span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                <Users2 className="w-3 h-3" />
                {toPersianDigits(0)} نفر
              </span>
            </div>
            <span className="text-[12px] text-slate-400">سمت جدید تعریف‌شده</span>
          </div>
        ))}
      </div>

      {/* Members modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-800">{selectedGroup.title}</h3>
              <button onClick={() => setSelectedGroup(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {selectedGroup.members.map((m) => (
                <div key={m.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-xs font-bold text-slate-800">{m.fullName}</div>
                  <div className="text-[11px] text-slate-500">{m.title}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add position modal */}
      {isAddingPosition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">تعریف سمت جدید</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نام سمت</label>
              <input type="text" value={newPositionName} onChange={(e) => setNewPositionName(e.target.value)} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button onClick={() => setIsAddingPosition(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer">انصراف</button>
              <button onClick={handleAddPosition} className="px-5 py-2 text-xs font-bold bg-teal-800 hover:bg-teal-700 text-white rounded-full shadow-xs cursor-pointer">افزودن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
