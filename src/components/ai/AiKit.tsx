import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Loader2, Mic, MicOff, Sparkles, Wand2, Minimize2, Maximize2 } from 'lucide-react';
import { AiFeatureId, getAiSettings, isAiFeatureEnabled, providerPreset } from '../../services/ai/aiSettings';
import type { AiResult } from '../../services/ai/aiClient';
import { improveText, WritingPurpose } from '../../services/ai/aiService';

/** وضعیت فعال‌بودن یک قابلیت؛ با تغییر تنظیمات توسط مدیر، بی‌درنگ به‌روز می‌شود. */
export const useAiFeature = (feature: AiFeatureId): boolean => {
  const [enabled, setEnabled] = useState(() => isAiFeatureEnabled(feature));
  useEffect(() => {
    const update = () => setEnabled(isAiFeatureEnabled(feature));
    window.addEventListener('msb-ai-settings-changed', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('msb-ai-settings-changed', update); window.removeEventListener('storage', update); };
  }, [feature]);
  return enabled;
};

export const AiButton: React.FC<{
  onClick: () => void;
  loading?: boolean;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  variant?: 'solid' | 'soft';
  disabled?: boolean;
  title?: string;
  className?: string;
}> = ({ onClick, loading, children, size = 'sm', variant = 'solid', disabled, title, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    title={title}
    className={`ai-button inline-flex items-center gap-1.5 font-bold rounded-xl transition disabled:opacity-60 ${size === 'sm' ? 'text-[11px] px-3 py-1.5' : 'text-xs px-4 py-2.5'} ${variant === 'solid' ? 'text-white bg-gradient-to-l from-violet-600 via-indigo-600 to-sky-500 shadow-sm shadow-indigo-200 hover:shadow-md' : 'text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100'} ${className}`}
  >
    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
    {children}
  </button>
);

/** نشان منبع پاسخ — شفاف: AI واقعی یا موتور محلی. */
export const AiSourceBadge: React.FC<{ result?: Pick<AiResult<unknown>, 'source' | 'provider' | 'model' | 'notice' | 'latencyMs'> | null }> = ({ result }) => {
  if (!result) return null;
  if (result.source === 'AI' && result.provider) {
    const preset = providerPreset(result.provider);
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border bg-white" style={{ color: preset.color, borderColor: `${preset.color}55` }} title={`${result.model} — ${result.latencyMs || 0} ms`}>
        <Sparkles className="w-3 h-3" />{preset.name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200" title={result.notice}>
      <Cpu className="w-3 h-3" />موتور هوشمند محلی
    </span>
  );
};

// ——— Voice input (Web Speech API) ———
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: any) => void) | null; onend: (() => void) | null; onerror: ((event: any) => void) | null;
  start: () => void; stop: () => void;
};

export const isVoiceSupported = (): boolean => typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

/** دکمه دیکته صوتی فارسی؛ متن شناسایی‌شده به انتهای مقدار فعلی اضافه می‌شود. */
export const VoiceInputButton: React.FC<{ onText: (text: string, isFinal: boolean) => void; className?: string; label?: string }> = ({ onText, className = '', label }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => () => recRef.current?.stop(), []);
  if (!isVoiceSupported()) return null;
  const toggle = () => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognitionLike = new Ctor();
    rec.lang = 'fa-IR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      onText(result[0].transcript, result.isFinal);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  return (
    <button type="button" onClick={toggle} title={listening ? 'توقف ضبط' : 'گفتن به‌جای تایپ (فارسی)'} aria-label={listening ? 'توقف ضبط صدا' : 'ورود صوتی'} className={`inline-flex items-center gap-1 rounded-xl transition ${listening ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50'} ${className}`}>
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      {label && <span className="text-[10px] font-bold">{label}</span>}
    </button>
  );
};

/**
 * نوار کمکی زیر هر فیلد متنی: رسمی‌سازی، خلاصه، تکمیل و دیکته صوتی.
 * پیش از جایگزینی، امکان «بازگردانی» متن قبلی فراهم است.
 */
export const AiTextAssist: React.FC<{
  value: string;
  onChange: (value: string) => void;
  purpose: WritingPurpose;
  actorId?: string;
  className?: string;
}> = ({ value, onChange, purpose, actorId, className = '' }) => {
  const enabled = useAiFeature('writer');
  const [busy, setBusy] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult<string> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const run = async (mode: 'formal' | 'shorter' | 'expand') => {
    if (!value.trim()) return;
    setBusy(mode);
    try {
      const res = await improveText(value, purpose, mode, actorId);
      setPrevious(value);
      onChange(res.data);
      setResult(res);
    } finally { setBusy(null); }
  };
  return (
    <div className={`flex flex-wrap items-center gap-1 mt-1 ${className}`}>
      <VoiceInputButton
        className="p-1"
        onText={(text, isFinal) => {
          if (isFinal) onChange(`${valueRef.current ? `${valueRef.current} ` : ''}${text}`);
        }}
      />
      {enabled && (
        <>
          <button type="button" disabled={!value.trim() || Boolean(busy)} onClick={() => run('formal')} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{busy === 'formal' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}رسمی‌سازی</button>
          <button type="button" disabled={!value.trim() || Boolean(busy)} onClick={() => run('shorter')} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{busy === 'shorter' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minimize2 className="w-3 h-3" />}خلاصه</button>
          <button type="button" disabled={!value.trim() || Boolean(busy)} onClick={() => run('expand')} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{busy === 'expand' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Maximize2 className="w-3 h-3" />}تکمیل</button>
          {previous !== null && <button type="button" onClick={() => { onChange(previous); setPrevious(null); setResult(null); }} className="text-[10px] font-bold px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100">بازگردانی</button>}
          <AiSourceBadge result={result} />
        </>
      )}
    </div>
  );
};

export const activeProviderName = () => providerPreset(getAiSettings().activeProvider).name;
