import React, { useState } from 'react';
import { X, UserPlus, ListPlus, Lock, Calendar, Clock, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { meetingService } from '../../services/meetingService';
import { Meeting, AgendaItem } from '../../types';
import { SearchableUserMultiSelect } from '../../components/common/SearchableUserMultiSelect';
import { PersianTimePicker } from '../../components/common/PersianTimePicker';
import { toPersianDigits } from '../../utils/formatters';
// همان Validation ایجاد جلسه — منطق موازی ساخته نمی‌شود.
import { getMinutesDiff, validateAgendaTimeSlot, formatAgendaTimeRange } from '../../utils/agendaTime';

interface AppendToMeetingModalProps {
  meeting: Meeting;
  onClose: () => void;
  onAppended: () => void;
}

// Append-only editor for an already-created meeting: existing title, number,
// date, time, location, invitees and agenda items are shown for reference
// only (never editable/removable here) — the only interactive parts are
// "select new invitees" and "add one new agenda item". See meetingService's
// appendToMeeting for the matching append-only persistence guarantee.
export const AppendToMeetingModal: React.FC<AppendToMeetingModalProps> = ({ meeting, onClose, onAppended }) => {
  const { currentUser, availableUsers, showToast } = useApp();

  const existingMemberIds = new Set(meeting.members.map((member) => member.userId));
  const selectableUsers = availableUsers.filter((user) => !existingMemberIds.has(user.id));

  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [newAgendaTitle, setNewAgendaTitle] = useState('');
  const [newAgendaPresenterId, setNewAgendaPresenterId] = useState('');
  const [newAgendaDescription, setNewAgendaDescription] = useState('');
  // بند جدید هم مثل ایجاد جلسه ساعت شروع/پایان می‌گیرد؛ پیش‌فرض روی شروع جلسه.
  const [newAgendaStartTime, setNewAgendaStartTime] = useState(meeting.startTime);
  const [newAgendaEndTime, setNewAgendaEndTime] = useState(meeting.endTime);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (newMemberIds.length === 0 && !newAgendaTitle.trim()) {
      setFormError('حداقل یک مدعو جدید انتخاب کنید یا عنوان یک دستور کار جدید را وارد کنید.');
      return;
    }
    setFormError(null);

    const newMembers = newMemberIds
      .map((userId) => availableUsers.find((user) => user.id === userId))
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .map((user) => ({
        userId: user.id,
        fullName: user.fullName,
        roleTitle: user.title,
        departmentName: user.departmentName,
        attendanceType: 'MEMBER' as const,
        presenceStatus: undefined,
      }));

    let newAgendaItem: AgendaItem | undefined;
    if (newAgendaTitle.trim()) {
      // بازه زمانی بند جدید باید داخل پنجره جلسه باشد و با هیچ بند فعلی
      // همپوشانی نداشته باشد — دقیقاً همان قاعده ایجاد جلسه.
      const timeError = validateAgendaTimeSlot(
        newAgendaStartTime,
        newAgendaEndTime,
        meeting.startTime,
        meeting.endTime,
        meeting.agendaItems
      );
      if (timeError) {
        setFormError(timeError);
        return;
      }

      const presenter = availableUsers.find((user) => user.id === newAgendaPresenterId);
      const presenterName = presenter ? presenter.fullName : meeting.secretaryName;
      newAgendaItem = {
        id: `ag-${Date.now()}`,
        order: meeting.agendaItems.length + 1,
        rowNumber: meeting.agendaItems.length + 1,
        title: newAgendaTitle.trim(),
        presenter: presenterName,
        presenterName,
        startTime: newAgendaStartTime,
        endTime: newAgendaEndTime,
        allocatedMinutes: getMinutesDiff(newAgendaStartTime, newAgendaEndTime),
        estimatedMinutes: getMinutesDiff(newAgendaStartTime, newAgendaEndTime),
        description: newAgendaDescription.trim() || undefined,
        isDiscussed: false,
        status: 'PENDING',
      };
    }

    setIsSubmitting(true);
    try {
      await meetingService.appendToMeeting(meeting.id, { newMembers, newAgendaItem }, currentUser);
      showToast('افزودن به جلسه', 'موارد جدید با موفقیت به جلسه اضافه شدند.', 'success');
      onAppended();
      onClose();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'افزودن موارد جدید انجام نشد.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="app-modal-header text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-800 text-teal-300">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">افزودن مدعو / دستور کار به جلسه</h3>
              <p className="text-[12px] text-teal-200">فقط برای افزودن موارد جدید — اطلاعات فعلی جلسه قابل ویرایش یا حذف نیست</p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-teal-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl flex items-start justify-between gap-2.5">
              <p className="text-xs font-bold text-rose-700 leading-relaxed">{formError}</p>
              <button type="button" onClick={() => setFormError(null)} className="text-rose-400 hover:text-rose-600 shrink-0 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Read-only: existing meeting core info */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="text-[12px] font-bold text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>اطلاعات جلسه (فقط نمایش — غیرقابل ویرایش از این مسیر)</span>
            </div>
            <p className="text-sm font-bold text-slate-800">{meeting.title}</p>
            <p className="text-[12px] text-slate-500">شماره جلسه: {meeting.meetingNumber}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600 font-bold">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{meeting.dateJalali}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{meeting.startTime} - {meeting.endTime}</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{meeting.location}</span>
            </div>
          </div>

          {/* Read-only: existing members */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700">مدعوین فعلی ({toPersianDigits(meeting.members.length)}) — فقط نمایش</p>
            <div className="flex flex-wrap gap-1.5">
              {meeting.members.map((member) => (
                <span key={member.userId} className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {member.fullName}
                </span>
              ))}
            </div>
          </div>

          {/* Interactive: add new invitees */}
          <div className="p-3.5 bg-teal-50/60 border border-teal-200/80 rounded-2xl space-y-2.5">
            <div className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-teal-700" />
              <span>افزودن مدعوین جدید:</span>
            </div>
            <p className="text-[11px] text-teal-800">افرادی که از قبل مدعو این جلسه هستند در این فهرست نمایش داده نمی‌شوند تا مدعوی تکراری ثبت نشود.</p>
            <SearchableUserMultiSelect
              users={selectableUsers}
              selectedIds={newMemberIds}
              onChange={setNewMemberIds}
              label="انتخاب مدعوین جدید"
            />
          </div>

          {/* Read-only: existing agenda items */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700">دستورکارهای فعلی ({toPersianDigits(meeting.agendaItems.length)}) — فقط نمایش</p>
            <div className="space-y-1.5">
              {meeting.agendaItems.map((agenda, index) => (
                <div key={agenda.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {toPersianDigits(index + 1)}
                  </span>
                  <span className="text-[12px] font-bold text-slate-700">{agenda.title}</span>
                  <span className="text-[11px] text-slate-500 mr-auto">{toPersianDigits(formatAgendaTimeRange(agenda))}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive: add one new agenda item */}
          <div className="p-3.5 bg-teal-50/60 border border-teal-200/80 rounded-2xl space-y-3">
            <div className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
              <ListPlus className="w-4 h-4 text-teal-700" />
              <span>افزودن دستور کار جدید:</span>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">عنوان موضوع دستور جلسه</label>
              <input
                type="text"
                placeholder="مثال: بررسی موضوع اضافه‌شده به دستورکار"
                value={newAgendaTitle}
                onChange={(e) => setNewAgendaTitle(e.target.value)}
                className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">ارائه‌دهنده (اختیاری)</label>
              <select
                value={newAgendaPresenterId}
                onChange={(e) => setNewAgendaPresenterId(e.target.value)}
                className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-medium"
              >
                <option value="">انتخاب ارائه‌دهنده از فهرست کاربران...</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName} ({u.title})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PersianTimePicker label="از ساعت" value={newAgendaStartTime} onChange={setNewAgendaStartTime} />
              <PersianTimePicker label="تا ساعت" value={newAgendaEndTime} onChange={setNewAgendaEndTime} />
            </div>
            <p className="text-[11px] text-slate-500">
              بازه زمانی باید بین ساعت شروع ({toPersianDigits(meeting.startTime)}) و پایان ({toPersianDigits(meeting.endTime)}) جلسه باشد
              و با بندهای فعلی همپوشانی نداشته باشد.
            </p>

            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1">توضیحات (اختیاری)</label>
              <textarea
                rows={2}
                value={newAgendaDescription}
                onChange={(e) => setNewAgendaDescription(e.target.value)}
                className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer">
            انصراف
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{isSubmitting ? 'در حال ثبت...' : 'افزودن به جلسه'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
