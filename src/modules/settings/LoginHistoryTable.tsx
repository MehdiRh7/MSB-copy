import React, { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { mockLoginHistory } from '../../mock/data';
import { toPersianDigits } from '../../utils/formatters';

export const LoginHistoryTable: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  const users = useMemo(() => Array.from(new Set(mockLoginHistory.map((h) => h.userName))), []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return mockLoginHistory.filter((h) => {
      const matchesUser = userFilter === 'ALL' || h.userName === userFilter;
      const matchesSearch = !term ||
        h.userName.toLowerCase().includes(term) ||
        h.ip.toLowerCase().includes(term) ||
        h.device.toLowerCase().includes(term) ||
        h.dateJalali.includes(term) ||
        h.timeString.includes(term);
      return matchesUser && matchesSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, userFilter, refreshKey]);

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-100">
      <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در کاربر، IP، دستگاه..."
              className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
          </div>
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none">
            <option value="ALL">همه کاربران</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <button onClick={() => setRefreshKey((k) => k + 1)} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>بروزرسانی</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-right text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[12px]">
              <th className="py-2.5 px-3 font-semibold">کاربر</th>
              <th className="py-2.5 px-3 font-semibold">تاریخ و زمان</th>
              <th className="py-2.5 px-3 font-semibold">IP</th>
              <th className="py-2.5 px-3 font-semibold">دستگاه</th>
              <th className="py-2.5 px-3 font-semibold">وضعیت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">موردی یافت نشد</td></tr>
            ) : filtered.map((h) => (
              <tr key={h.id}>
                <td className="py-3 px-3 font-bold text-slate-800">{h.userName}</td>
                <td className="py-3 px-3 text-slate-600">{toPersianDigits(h.dateJalali)} - {toPersianDigits(h.timeString)}</td>
                <td className="py-3 px-3 text-slate-600" dir="ltr">{h.ip}</td>
                <td className="py-3 px-3 text-slate-600">{h.device}</td>
                <td className="py-3 px-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${h.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                    {h.status === 'SUCCESS' ? 'موفق' : 'ناموفق'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
