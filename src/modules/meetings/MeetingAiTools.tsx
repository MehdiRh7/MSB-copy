import React, { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Gavel, Mic, Square, Wand2 } from 'lucide-react';
import { Meeting, Resolution } from '../../types';
import { useApp } from '../../context/AppContext';
import { mockDepartments } from '../../mock/data';
import { AiButton, AiSourceBadge, isVoiceSupported, useAiFeature } from '../../components/ai/AiKit';
import { AGENDA_OUTCOME_OPTIONS, AgendaOutcome, AgendaOutcomeSuggestion, extractResolutions, ExtractedResolution, minutesFromTranscript, suggestAgendaOutcomes } from '../../services/ai/aiInsights';
import { meetingService } from '../../services/meetingService';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
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
 * «پیشنهاد نتیجه بندها از روی گفتار» — صرفاً کمکی. هوش مصنوعی برای هر بند
 * نتیجه‌ای پیشنهاد می‌دهد و جمله مبنا را نشان می‌دهد؛ تا دبیرخانه همان بند
 * را بررسی و «تأیید و ثبت» نکند، هیچ نتیجه‌ای در سامانه ثبت نمی‌شود. ثبت
 * از همان مسیر رسمی «ثبت نتیجه» (recordAgendaOutcome) انجام می‌شود.
 */
const AgendaOutcomeReview: React.FC<{ meeting: Meeting; result: AiResult<AgendaOutcomeSuggestion[]> }> = ({ meeting, result }) => {
  const { currentUser, showToast, triggerRefresh } = useApp();
  const [drafts, setDrafts] = useState<Record<string, { outcome: AgendaOutcome | ''; notes: string; state: 'pending' | 'saved' | 'dismissed' }>>(() =>
    Object.fromEntries(result.data.map((s) => [s.agendaItemId, { outcome: s.outcome || '', notes: s.notes, state: 'pending' as const }])));
  const [busy, setBusy] = useState<string | null>(null);
  const label = (value?: string) => AGENDA_OUTCOME_OPTIONS.find((o) => o.value === value)?.label || '—';
  const confirm = async (s: AgendaOutcomeSuggestion) => {
    const d = drafts[s.agendaItemId];
    if (!d.outcome) { showToast('ثبت نتیجه', 'ابتدا نتیجه بند را انتخاب کنید.', 'warning'); return; }
    if (!d.notes.trim()) { showToast('ثبت نتیجه', 'شرح نتیجه بررسی الزامی است.', 'warning'); return; }
    setBusy(s.agendaItemId);
    try {
      await meetingService.recordAgendaOutcome(meeting.id, s.agendaItemId, d.outcome, d.notes, currentUser);
      setDrafts((prev) => ({ ...prev, [s.agendaItemId]: { ...prev[s.agendaItemId], state: 'saved' } }));
      showToast('ثبت نتیجه', `نتیجه «${label(d.outcome)}» برای بند «${s.agendaTitle}» با تأیید شما ثبت شد.`, 'success');
      triggerRefresh();
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ثبت نتیجه انجام نشد.', 'error');
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span><b>فقط پیشنهاد است.</b> تا هر بند را بررسی و «تأیید و ثبت» نکنید، هیچ نتیجه‌ای در سامانه ثبت نمی‌شود. نتیجه و شرح را می‌توانید تغییر دهید.</span>
        <AiSourceBadge result={result} />
      </div>
      {result.data.map((s) => {
        const d = drafts[s.agendaItemId];
        const agenda = meeting.agendaItems.find((a) => a.id === s.agendaItemId);
        if (d.state === 'dismissed') return null;
        return (
          <div key={s.agendaItemId} className={`rounded-2xl border p-3 space-y-2 ${d.state === 'saved' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-900">بند {toPersianDigits(agenda?.order || '')}: {s.agendaTitle}</div>
              {agenda?.outcomeStatus && d.state !== 'saved' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">نتیجه ثبت‌شده فعلی: {label(agenda.outcomeStatus)}</span>}
              {d.state === 'saved' && <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="w-4 h-4" />با تأیید شما ثبت شد</span>}
            </div>
            {s.outcome === null && d.state !== 'saved' && <p className="text-[11px] text-slate-500">در گفتار درباره این بند تصمیم صریحی شنیده نشد؛ در صورت نیاز نتیجه را خودتان انتخاب کنید.</p>}
            {s.evidence && <p className="text-[10.5px] text-slate-500 border-r-2 border-violet-300 pr-2">مبنای پیشنهاد در گفتار: «{s.evidence.slice(0, 260)}»</p>}
            {d.state !== 'saved' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
                  <select aria-label="نتیجه بند" value={d.outcome} onChange={(e) => setDrafts((prev) => ({ ...prev, [s.agendaItemId]: { ...prev[s.agendaItemId], outcome: e.target.value as AgendaOutcome } }))} className="text-[11px] p-2 bg-white border border-slate-200 rounded-xl">
                    <option value="">انتخاب نتیجه…</option>
                    {AGENDA_OUTCOME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}{o.value === s.outcome ? ' (پیشنهاد)' : ''}</option>)}
                  </select>
                  <input aria-label="شرح نتیجه" value={d.notes} onChange={(e) => setDrafts((prev) => ({ ...prev, [s.agendaItemId]: { ...prev[s.agendaItemId], notes: e.target.value } }))} placeholder="شرح نتیجه بررسی (الزامی)" className="text-[11px] p-2 bg-white border border-slate-200 rounded-xl" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy === s.agendaItemId} onClick={() => confirm(s)} className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 px-3 py-1.5 rounded-xl"><CheckCircle2 className="w-3.5 h-3.5" />تأیید و ثبت نتیجه</button>
                  <button type="button" onClick={() => setDrafts((prev) => ({ ...prev, [s.agendaItemId]: { ...prev[s.agendaItemId], state: 'dismissed' } }))} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 border border-slate-200 bg-white px-3 py-1.5 rounded-xl"><XCircle className="w-3.5 h-3.5" />نادیده گرفتن</button>
                </div>
              </>
            )}
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
  const [busy, setBusy] = useState<'minutes' | 'extract' | 'outcomes' | null>(null);
  const [extracted, setExtracted] = useState<AiResult<ExtractedResolution[]> | null>(null);
  const [outcomes, setOutcomes] = useState<AiResult<AgendaOutcomeSuggestion[]> | null>(null);
  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const [askingMic, setAskingMic] = useState(false);
  const [minutesResult, setMinutesResult] = useState<AiResult<string> | null>(null);

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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('ضبط جلسه', 'این مرورگر یا این اتصال (بدون HTTPS) اجازه ضبط صدا نمی‌دهد. از Chrome یا Edge روی آدرس https استفاده کنید، یا متن را دستی وارد کنید.', 'warning');
      activeRef.current = false;
      return;
    }
    setAskingMic(true);
    // اگر کادر اجازه میکروفن پشت پنجره دیگری پنهان بماند، کاربر بی‌خبر نمی‌ماند.
    const slowPrompt = window.setTimeout(() => showToast('ضبط جلسه', 'منتظر اجازه میکروفن هستیم؛ از نوار آدرس مرورگر (آیکون قفل یا میکروفن) دسترسی را «Allow» کنید.', 'info'), 4000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      window.clearTimeout(slowPrompt);
      setAskingMic(false);
      const media = new MediaRecorder(stream);
      chunksRef.current = [];
      media.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      media.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setAudioUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: media.mimeType || 'audio/webm' }))); };
      media.start(1000);
      mediaRef.current = media;
    } catch (error) {
      window.clearTimeout(slowPrompt);
      setAskingMic(false);
      const name = (error as { name?: string })?.name;
      if (name === 'NotFoundError') { showToast('ضبط جلسه', 'میکروفنی به این دستگاه وصل نیست؛ می‌توانید متن را دستی وارد یا فایل متنی بارگذاری کنید.', 'warning'); activeRef.current = false; return; }
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
        rec.onerror = (event: any) => {
          if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') { activeRef.current = false; showToast('ضبط جلسه', 'تبدیل گفتار به متن اجازه داده نشد؛ صدا ضبط می‌شود ولی متن را باید دستی وارد کنید.', 'warning'); }
          else if (event?.error === 'network') { activeRef.current = false; showToast('ضبط جلسه', 'تبدیل گفتار به متن به اینترنت نیاز دارد و در دسترس نبود؛ صدا همچنان ضبط می‌شود.', 'warning'); }
        };
        recRef.current = rec;
        try { rec.start(); } catch { /* اگر از قبل در حال اجرا باشد */ }
      };
      launch();
    } else {
      showToast('ضبط جلسه', 'صدا ضبط می‌شود؛ تبدیل زنده گفتار به متن فقط در Chrome و Edge پشتیبانی می‌شود.', 'info');
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
            ? <button type="button" onClick={start} disabled={askingMic} className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-70 px-4 py-2 rounded-xl"><Mic className="w-4 h-4" />{askingMic ? 'در انتظار اجازه میکروفن…' : 'شروع ضبط'}</button>
            : <button type="button" onClick={stop} className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 px-4 py-2 rounded-xl"><Square className="w-4 h-4" />پایان ضبط</button>}
          <label className="flex items-center gap-1 text-[11px] font-bold text-violet-700 px-3 py-2 rounded-xl border border-violet-200 bg-white cursor-pointer"><FileUp className="w-3.5 h-3.5" />فایل متن<input type="file" accept=".txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTranscript(f); e.target.value = ''; }} /></label>
        </div>
      </div>
      {!isVoiceSupported() && <p className="text-[10.5px] text-amber-700 bg-amber-50 rounded-lg p-2">تبدیل زنده گفتار به متن در این مرورگر پشتیبانی نمی‌شود (Chrome یا Edge را استفاده کنید). صدا همچنان ضبط می‌شود و می‌توانید متن را وارد یا بارگذاری کنید.</p>}
      <textarea value={transcript + (interim ? ` ${interim}` : '')} onChange={(e) => setTranscript(e.target.value)} rows={transcript ? 6 : 3} placeholder="متن گفتار جلسه اینجا نوشته می‌شود؛ قابل ویرایش است..." className="w-full text-xs leading-6 p-3 bg-white border border-violet-200 rounded-2xl" />
      <div className="flex flex-wrap items-center gap-2">
        <AiButton disabled={!transcript.trim() || recording} loading={busy === 'minutes'} onClick={async () => { setBusy('minutes'); try { const res = await minutesFromTranscript(meeting, transcript, currentUser.id); setMinutesResult(res); onMinutes(res.data); showToast('صورت‌جلسه', `پیش‌نویس از گفتار جلسه تهیه شد (${res.source === 'AI' ? 'هوش مصنوعی' : 'موتور محلی'}).`, 'success'); } finally { setBusy(null); } }}>تبدیل به صورت‌جلسه</AiButton>
        {minutesResult && <AiSourceBadge result={minutesResult} />}
        <AiButton variant="soft" disabled={!transcript.trim() || recording} loading={busy === 'extract'} onClick={async () => { setBusy('extract'); try { setExtracted(await extractResolutions({ text: transcript, agendas: meeting.agendaItems.filter((a) => !a.isRemoved), users: availableUsers, departments: mockDepartments }, currentUser.id)); } finally { setBusy(null); } }}>استخراج مصوبات از گفتار</AiButton>
        <AiButton variant="soft" disabled={!transcript.trim() || recording} loading={busy === 'outcomes'} onClick={async () => { setBusy('outcomes'); try { setOutcomes(await suggestAgendaOutcomes(meeting, transcript, currentUser.id)); } finally { setBusy(null); } }}>پیشنهاد نتیجه بندها از گفتار</AiButton>
        {audioUrl && <a href={audioUrl} download={`جلسه-${meeting.meetingNumber}.webm`} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 px-3 py-1.5 rounded-xl border border-slate-200 bg-white"><Download className="w-3.5 h-3.5" />دانلود فایل صوتی</a>}
      </div>
      {outcomes && <AgendaOutcomeReview key={outcomes.data.map((o) => o.agendaItemId + o.outcome).join('|')} meeting={meeting} result={outcomes} />}
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
