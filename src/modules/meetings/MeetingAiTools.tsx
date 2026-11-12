import React, { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Gavel, Mic, Square, Wand2 } from 'lucide-react';
import { Meeting, Resolution } from '../../types';
import { useApp } from '../../context/AppContext';
import { mockDepartments } from '../../mock/data';
import { AiButton, AiSourceBadge, isVoiceSupported, useAiFeature } from '../../components/ai/AiKit';
import { extractResolutions, ExtractedResolution, minutesFromTranscript } from '../../services/ai/aiInsights';
import type { AiResult } from '../../services/ai/aiClient';
import { getPriorityMeta, toPersianDigits } from '../../utils/formatters';

/** فهرست مصوبات استخراج‌شده با دکمه ثبت یک‌کلیکی (فرم پیش‌پر و قابل ویرایش). */
export const ExtractedResolutionsList: React.FC<{ meeting: Meeting; result: AiResult<ExtractedResolution[]>; existing: Resolution[]; canCreate: boolean }> = ({ meeting, result, existing, canCreate }) => {
  const { openCreateResolutionModal } = useApp();
  if (result.data.length === 0) return <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-xl p-2.5">تصمیم یا مصوبه مشخصی در متن پیدا نشد.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">{toPersianDigits(result.data.length)} مصوبه پیشنهادی از متن <AiSourceBadge result={result} /></div>
      {result.data.map((item, index) => {
        const alreadyRegistered = item.agendaItemId && existing.some((r) => r.agendaItemId === item.agendaItemId);
        const priority = getPriorityMeta(item.priority);
        return (
          <div key={`${item.topic}-${index}`} className="rounded-2xl border border-indigo-100 bg-white p-3 space-y-1.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-900">{toPersianDigits(index + 1)}. {item.topic}</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priority.bg}`}>{priority.label}</span>
            </div>
            <p className="text-[11.5px] leading-6 text-slate-700">{item.executionDescription}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-slate-500">
              <span>مسئول: {item.responsibleName || 'تشخیص داده نشد'}</span>
              <span>مهلت پیشنهادی: {toPersianDigits(item.deadlineDays)} روز</span>
              {item.agendaItemId && <span>بند: {meeting.agendaItems.find((a) => a.id === item.agendaItemId)?.title}</span>}
            </div>
            {item.evidence && <p className="text-[10px] text-slate-400 border-r-2 border-slate-200 pr-2">«{item.evidence.slice(0, 220)}»</p>}
            {canCreate && (alreadyRegistered
              ? <span className="text-[10.5px] font-bold text-emerald-700">✓ برای این بند قبلاً مصوبه ثبت شده است.</span>
              : <button type="button" onClick={() => openCreateResolutionModal({ meetingId: meeting.id, agendaItemId: item.agendaItemId, topicTitle: item.topic, prefill: { executionDescription: item.executionDescription, mainResponsibleUserId: item.responsibleUserId, priority: item.priority, deadlineDays: item.deadlineDays } })} className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-teal-800 hover:bg-teal-700 px-3 py-1.5 rounded-xl"><Gavel className="w-3.5 h-3.5" />ثبت این مصوبه</button>)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * «ضبط جلسه» — گفتار جلسه به‌صورت زنده به متن تبدیل می‌شود (تشخیص گفتار
 * فارسی مرورگر)، فایل صوتی برای بایگانی قابل دانلود است و از متن، صورت‌جلسه
 * رسمی و مصوبات پیشنهادی ساخته می‌شود.
 */
export const MeetingRecorder: React.FC<{ meeting: Meeting; resolutions: Resolution[]; canCreateResolution: boolean; onMinutes: (text: string) => void }> = ({ meeting, resolutions, canCreateResolution, onMinutes }) => {
  const { currentUser, availableUsers, showToast } = useApp();
  const enabled = useAiFeature('meetingRecorder');
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'minutes' | 'extract' | null>(null);
  const [extracted, setExtracted] = useState<AiResult<ExtractedResolution[]> | null>(null);
  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => { activeRef.current = false; recRef.current?.stop(); mediaRef.current?.stop(); }, []);

  if (!enabled) return null;

  const start = async () => {
    setSeconds(0);
    activeRef.current = true;
    // ضبط صدا برای بایگانی (در صورت اجازه میکروفن).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      chunksRef.current = [];
      media.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      media.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: media.mimeType || 'audio/webm' }))); };
      media.start(1000);
      mediaRef.current = media;
    } catch {
      showToast('ضبط جلسه', 'دسترسی به میکروفن داده نشد؛ می‌توانید متن را دستی وارد یا فایل متنی بارگذاری کنید.', 'warning');
      activeRef.current = false;
      return;
    }
    // تبدیل زنده گفتار به متن؛ در صورت قطع خودکار، دوباره شروع می‌شود.
    if (isVoiceSupported()) {
      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const launch = () => {
        const rec = new Ctor();
        rec.lang = 'fa-IR';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: any) => {
          let finalText = ''; let interimText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) finalText += `${r[0].transcript} `; else interimText += r[0].transcript;
          }
          if (finalText) setTranscript((prev) => `${prev}${finalText}`);
          setInterim(interimText);
        };
        rec.onend = () => { if (activeRef.current) launch(); };
        rec.onerror = () => undefined;
        recRef.current = rec;
        rec.start();
      };
      launch();
    }
    setRecording(true);
  };

  const stop = () => {
    activeRef.current = false;
    recRef.current?.stop();
    mediaRef.current?.stop();
    setInterim('');
    setRecording(false);
  };

  const uploadTranscript = async (file: File) => {
    const text = await file.text();
    setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <section className="no-print rounded-3xl border border-violet-200 bg-gradient-to-bl from-violet-50 via-white to-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-violet-950 flex items-center gap-1.5"><Mic className="w-4 h-4" />ضبط جلسه و صورت‌جلسه خودکار</h3>
          <p className="text-[11px] text-slate-500">گفتار جلسه زنده به متن تبدیل می‌شود؛ سپس صورت‌جلسه رسمی و مصوبات پیشنهادی ساخته می‌شود.</p>
        </div>
        <div className="flex items-center gap-2">
          {recording && <span className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />در حال ضبط {toPersianDigits(mmss)}</span>}
          {!recording
            ? <button type="button" onClick={start} className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2 rounded-xl"><Mic className="w-4 h-4" />شروع ضبط</button>
            : <button type="button" onClick={stop} className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 px-4 py-2 rounded-xl"><Square className="w-4 h-4" />پایان ضبط</button>}
          <label className="flex items-center gap-1 text-[11px] font-bold text-violet-700 px-3 py-2 rounded-xl border border-violet-200 bg-white cursor-pointer"><FileUp className="w-3.5 h-3.5" />فایل متن<input type="file" accept=".txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTranscript(f); e.target.value = ''; }} /></label>
        </div>
      </div>
      {!isVoiceSupported() && <p className="text-[10.5px] text-amber-700 bg-amber-50 rounded-lg p-2">تبدیل زنده گفتار به متن در این مرورگر پشتیبانی نمی‌شود (Chrome یا Edge را استفاده کنید). صدا همچنان ضبط می‌شود و می‌توانید متن را وارد یا بارگذاری کنید.</p>}
      <textarea value={transcript + (interim ? ` ${interim}` : '')} onChange={(e) => setTranscript(e.target.value)} rows={transcript ? 6 : 3} placeholder="متن گفتار جلسه اینجا نوشته می‌شود؛ قابل ویرایش است..." className="w-full text-xs leading-6 p-3 bg-white border border-violet-200 rounded-2xl" />
      <div className="flex flex-wrap items-center gap-2">
        <AiButton disabled={!transcript.trim() || recording} loading={busy === 'minutes'} onClick={async () => { setBusy('minutes'); try { const res = await minutesFromTranscript(meeting, transcript, currentUser.id); onMinutes(res.data); showToast('صورت‌جلسه', `پیش‌نویس از گفتار جلسه تهیه شد (${res.source === 'AI' ? 'هوش مصنوعی' : 'موتور محلی'}).`, 'success'); } finally { setBusy(null); } }}>تبدیل به صورت‌جلسه</AiButton>
        <AiButton variant="soft" disabled={!transcript.trim() || recording} loading={busy === 'extract'} onClick={async () => { setBusy('extract'); try { setExtracted(await extractResolutions({ text: transcript, agendas: meeting.agendaItems.filter((a) => !a.isRemoved), users: availableUsers, departments: mockDepartments }, currentUser.id)); } finally { setBusy(null); } }}>استخراج مصوبات از گفتار</AiButton>
        {audioUrl && <a href={audioUrl} download={`جلسه-${meeting.meetingNumber}.webm`} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 px-3 py-1.5 rounded-xl border border-slate-200 bg-white"><Download className="w-3.5 h-3.5" />دانلود فایل صوتی</a>}
      </div>
      {extracted && <ExtractedResolutionsList meeting={meeting} result={extracted} existing={resolutions} canCreate={canCreateResolution} />}
    </section>
  );
};

/** «استخراج مصوبات» از متن صورت‌جلسه نوشته‌شده. */
export const MinutesExtraction: React.FC<{ meeting: Meeting; text: string; resolutions: Resolution[]; canCreateResolution: boolean }> = ({ meeting, text, resolutions, canCreateResolution }) => {
  const { currentUser, availableUsers } = useApp();
  const enabled = useAiFeature('extraction');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResult<ExtractedResolution[]> | null>(null);
  if (!enabled || !text.trim()) return null;
  return (
    <div className="space-y-2">
      <AiButton variant="soft" loading={busy} onClick={async () => { setBusy(true); try { setResult(await extractResolutions({ text, agendas: meeting.agendaItems.filter((a) => !a.isRemoved), users: availableUsers, departments: mockDepartments }, currentUser.id)); } finally { setBusy(false); } }}><Wand2 className="w-3.5 h-3.5" />استخراج مصوبات از متن صورت‌جلسه</AiButton>
      {result && <ExtractedResolutionsList meeting={meeting} result={result} existing={resolutions} canCreate={canCreateResolution} />}
    </div>
  );
};
