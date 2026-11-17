import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Search, 
  Filter, 
  Plus, 
  FileText, 
  MapPin, 
  Clock, 
  Users, 
  ChevronLeft, 
  FileDown, 
  CheckCircle2, 
  MoreVertical,
  Layers
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { meetingService } from '../../services/meetingService';
import { Meeting, MeetingStatus } from '../../types';
import { toPersianDigits, getMeetingTypeLabel, getMeetingStatusMeta } from '../../utils/formatters';
import { mockDepartments } from '../../mock/data';
import { hasOrgWideMeetingAccess } from '../../services/userScope';
import { ListViewActions, ListViewMode } from '../../components/common/ListViewActions';
import { exportListToPdf } from '../../utils/pdfExport';

export const MeetingListView: React.FC = () => {
  const { navigateTo, setIsCreateMeetingOpen, showToast, refreshTrigger, currentUser, hasPermission } = useApp();
  
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [allMeetingsCount, setAllMeetingsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ListViewMode>('grid');

  useEffect(() => {
    fetchMeetings();
  }, [searchTerm, statusFilter, departmentFilter, refreshTrigger, currentUser.id]);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await meetingService.getMeetings({
        searchTerm,
        status: statusFilter,
        departmentId: departmentFilter,
        participantUserId: hasOrgWideMeetingAccess(currentUser.role) ? undefined : currentUser.id,
        pageSize: 50,
      });
      if (res.isSuccess) {
        setMeetings(res.data.items);
        setTotalCount(res.data.totalCount);
      }
      const allRes = await meetingService.getMeetings({ pageSize: 1, participantUserId: hasOrgWideMeetingAccess(currentUser.role) ? undefined : currentUser.id });
      if (allRes.isSuccess) setAllMeetingsCount(allRes.data.totalCount);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportList = () => {
    const opened = exportListToPdf<Meeting>('لیست مدیریت جلسات', meetings, [
      { title: 'شماره جلسه', value: (item) => item.meetingNumber },
      { title: 'عنوان', value: (item) => item.title },
      { title: 'تاریخ', value: (item) => toPersianDigits(item.dateJalali) },
      { title: 'ساعت', value: (item) => `${toPersianDigits(item.startTime)} تا ${toPersianDigits(item.endTime)}` },
      { title: 'مکان', value: (item) => item.location },
      { title: 'تعداد مصوبات', value: (item) => toPersianDigits(item.resolutionsCount) },
      { title: 'وضعیت', value: (item) => getMeetingStatusMeta(item.status).label },
    ]);
    showToast(opened ? 'خروجی PDF' : 'خطای خروجی', opened ? 'پنجره ذخیره PDF لیست جلسات باز شد.' : 'مرورگر اجازه باز شدن پنجره PDF را نداد.', opened ? 'success' : 'error');
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span>مدیریت جلسات سازمانی</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            برنامه‌ریزی، مدیریت دستور جلسات و تنظیم صورتجلسات و مصوبات مرتبط
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ListViewActions filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} viewMode={viewMode} onViewModeChange={setViewMode} onExportPdf={handleExportList} />

          {hasPermission('CREATE_MEETING') && (
            <button
              onClick={() => setIsCreateMeetingOpen(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-full shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ایجاد جلسه جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      {filtersOpen && <div className="app-panel bg-white rounded-2xl p-4 shadow-xs border border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در عنوان، شماره یا مکان جلسه..."
            className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
        </div>

        {/* Status filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">تمام وضعیت‌ها</option>
            <option value="WAITING_FOR_CEO_APPROVAL">در انتظار تأیید دستورکار</option>
            <option value="AGENDA_RETURNED">دستورکار برگشتی</option>
            <option value="READY_FOR_INVITATION">آماده ارسال دعوتنامه</option>
            <option value="INVITATION_SENT">دعوتنامه ارسال شده</option>
            <option value="SCHEDULED">برنامه‌ریزی شده</option>
            <option value="IN_PROGRESS">در حال برگزاری</option>
            <option value="HELD">برگزار شده / خاتمه یافته</option>
            <option value="CANCELLED">لغو شده</option>
          </select>
        </div>

        {/* Department filter */}
        <div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">همه واحدهای سازمانی</option>
            {mockDepartments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>}

      <div className="flex flex-wrap gap-2">
        {[['ALL', 'همه جلسات'], ['SCHEDULED', 'برنامه‌ریزی‌شده'], ['HELD', 'برگزارشده'], ['CANCELLED', 'لغوشده']].map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 text-[12px] font-bold ${statusFilter === value ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
      </div>

      {/* Meetings List Cards */}
      {viewMode === 'cards' ? <div className="space-y-3">
        {meetings.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-xs">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">{allMeetingsCount === 0 ? 'هنوز جلسه‌ای ثبت نشده است' : 'نتیجه‌ای برای فیلتر پیدا نشد'}</h3>
            <p className="text-xs text-slate-400 mt-1">{allMeetingsCount === 0 ? (hasPermission('CREATE_MEETING') ? 'برای شروع، اولین جلسه را ایجاد کنید.' : 'پس از ثبت جلسه مرتبط با شما، آن را در اینجا می‌بینید.') : 'فیلتر یا عبارت جستجو را تغییر دهید.'}</p>
          </div>
        ) : (
          meetings.map((meeting) => {
            const statusMeta = getMeetingStatusMeta(meeting.status);
            return (
              <div
                key={meeting.id}
                onClick={() => navigateTo('meeting-details', { meetingId: meeting.id })}
                className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                      {meeting.meetingNumber}
                    </span>
                    <span className="text-[12px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                      {getMeetingTypeLabel(meeting.type)}
                    </span>
                    <span className={`inline-flex whitespace-nowrap items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`}></span>
                      <span>{statusMeta.label}</span>
                    </span>
                  </div>

                  <div className="text-xs font-bold text-blue-600 group-hover:translate-x-[-4px] transition-transform flex items-center gap-1">
                    <span>مشاهده جزئیات و صورتجلسه</span>
                    <ChevronLeft className="w-4 h-4" />
                  </div>
                </div>

                <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-2 group-hover:text-blue-900 transition-colors">
                  {meeting.title}
                </h3>

                {meeting.description && (
                  <p className="text-xs text-slate-500 line-clamp-1 mb-3">
                    {meeting.description}
                  </p>
                )}

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{toPersianDigits(meeting.dateJalali)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>{toPersianDigits(meeting.startTime)} الی {toPersianDigits(meeting.endTime)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span>{meeting.location}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>برگزارکننده: {meeting.organizerName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>{toPersianDigits(meeting.members.length)} نفر مدعو</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-bold text-blue-700 mr-auto bg-blue-50/80 px-2.5 py-0.5 rounded-full border border-blue-200/60">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>{toPersianDigits(meeting.resolutionsCount)} مصوبه ثبت شده</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div> : (
        <div className="app-panel bg-white rounded-2xl border border-slate-100 shadow-xs overflow-x-auto">
          <table className="w-full min-w-[850px] text-xs text-right">
            <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">شماره</th><th className="p-3">عنوان و نوع</th><th className="p-3">تاریخ و ساعت</th><th className="p-3">برگزارکننده</th><th className="p-3">مکان</th><th className="p-3">مصوبات</th><th className="p-3">وضعیت</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {meetings.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-slate-500">{allMeetingsCount === 0 ? 'هنوز جلسه‌ای ثبت نشده است.' : 'نتیجه‌ای برای فیلتر پیدا نشد.'}</td></tr> : meetings.map((meeting) => {
                const statusMeta = getMeetingStatusMeta(meeting.status);
                return <tr key={meeting.id} onClick={() => navigateTo('meeting-details', { meetingId: meeting.id })} className="hover:bg-slate-50 cursor-pointer transition-colors"><td className="p-3 font-bold text-blue-700">{meeting.meetingNumber}</td><td className="p-3"><div className="font-bold text-slate-800">{meeting.title}</div><div className="mt-1 text-[11px] text-slate-500">{getMeetingTypeLabel(meeting.type)}</div></td><td className="p-3 text-slate-600">{toPersianDigits(meeting.dateJalali)}، {toPersianDigits(meeting.startTime)}</td><td className="p-3 text-slate-600">{meeting.organizerName}</td><td className="p-3 text-slate-600">{meeting.location}</td><td className="p-3">{toPersianDigits(meeting.resolutionsCount)}</td><td className="p-3"><span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full border font-bold ${statusMeta.bg}`}>{statusMeta.label}</span></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
