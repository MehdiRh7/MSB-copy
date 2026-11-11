import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Cpu, KeyRound, Loader2, PlugZap, Save, Server, ShieldCheck, Sparkles, XCircle, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  AI_FEATURES,
  AI_PROVIDERS,
  AiConnectionMode,
  AiProviderId,
  AiSettings,
  canManageAi,
  getAiSettings,
  getAiUsageLog,
  maskKey,
  saveAiSettings,
} from '../../services/ai/aiSettings';
import { callAiRaw, getAiServerStatus } from '../../services/ai/aiClient';
import { toPersianDigits } from '../../utils/formatters';

type TestState = { state: 'idle' | 'running' | 'ok' | 'fail'; message?: string };

/**
 * «تنظیمات هوش مصنوعی» — فقط مدیر سیستم. انتخاب یکی از سه ارائه‌دهنده
 * (DeepSeek / Gemini / Grok)، مدل رایگان، نوع اتصال، کلید و قابلیت‌های فعال.
 */
export const AiSettingsTab: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [settings, setSettings] = useState<AiSettings>(getAiSettings);
  const [serverKeys, setServerKeys] = useState<Record<string, boolean> | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<AiProviderId, string>>({ gemini: '', deepseek: '', grok: '' });
  const [tests, setTests] = useState<Record<AiProviderId, TestState>>({ gemini: { state: 'idle' }, deepseek: { state: 'idle' }, grok: { state: 'idle' } });
  const usage = useMemo(() => getAiUsageLog(), [tests, settings]);

  useEffect(() => { getAiServerStatus().then(setServerKeys); }, []);

  if (!canManageAi(currentUser)) {
    return <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-500 border border-slate-200">فقط مدیر سیستم می‌تواند ارائه‌دهنده هوش مصنوعی را انتخاب کند.</div>;
  }

  const updateProvider = (id: AiProviderId, patch: Partial<AiSettings['providers'][AiProviderId]>) =>
    setSettings((prev) => ({ ...prev, providers: { ...prev.providers, [id]: { ...prev.providers[id], ...patch } } }));

  const hasServerKey = (id: AiProviderId) => {
    const connection = settings.providers[id].connection;
    return Boolean(serverKeys && (connection === 'OPENROUTER' ? serverKeys.openrouter : serverKeys[id]));
  };

  const handleSave = () => {
    const next: AiSettings = {
      ...settings,
      providers: (Object.keys(settings.providers) as AiProviderId[]).reduce((acc, id) => ({
        ...acc,
        [id]: { ...settings.providers[id], ...(keyDrafts[id].trim() ? { apiKey: keyDrafts[id].trim() } : {}) },
      }), {} as AiSettings['providers']),
    };
    try {
      setSettings(saveAiSettings(next, currentUser));
      setKeyDrafts({ gemini: '', deepseek: '', grok: '' });
      showToast('هوش مصنوعی', `تنظیمات ذخیره شد؛ ارائه‌دهنده فعال: ${AI_PROVIDERS.find((p) => p.id === next.activeProvider)?.name}`, 'success');
    } catch (error) {
      showToast('خطا', error instanceof Error ? error.message : 'ذخیره انجام نشد.', 'error');
    }
  };

  const handleTest = async (id: AiProviderId) => {
    setTests((prev) => ({ ...prev, [id]: { state: 'running' } }));
    // تست با تنظیمات ذخیره‌شده انجام می‌شود؛ ابتدا تغییرات را ذخیره کنید.
    try {
      const result = await callAiRaw({ feature: 'assistant', provider: id, system: 'فقط با یک جمله کوتاه پاسخ بده.', messages: [{ role: 'user', content: 'سلام؛ اتصال برقرار است؟' }], maxTokens: 60 });
      setTests((prev) => ({ ...prev, [id]: { state: 'ok', message: `${result.model} — ${toPersianDigits(result.latencyMs)} میلی‌ثانیه: «${result.text.slice(0, 80)}»` } }));
    } catch (error) {
      setTests((prev) => ({ ...prev, [id]: { state: 'fail', message: error instanceof Error ? error.message : 'ناموفق' } }));
    }
  };

  const okCount = usage.filter((u) => u.ok).length;
  const avgLatency = okCount ? Math.round(usage.filter((u) => u.ok).reduce((s, u) => s + u.latencyMs, 0) / okCount) : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl p-5 text-white bg-gradient-to-l from-[#0b2a5b] via-[#1d4ed8] to-[#7c3aed] shadow-lg relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-3 rounded-2xl bg-white/15"><Sparkles className="w-6 h-6" /></span>
            <div>
              <h3 className="text-base font-extrabold">موتور هوش مصنوعی سامانه</h3>
              <p className="text-[11px] text-blue-100 mt-1">یکی از سه ارائه‌دهنده را انتخاب کنید؛ همه قابلیت‌های هوشمند سامانه از همین انتخاب استفاده می‌کنند.</p>
            </div>
          </div>
          <label className="flex items-center gap-2 bg-white/15 rounded-full px-4 py-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="accent-emerald-400 w-4 h-4" />
            {settings.enabled ? 'فعال' : 'غیرفعال'}
          </label>
        </div>
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-center">
          {[
            { label: 'درخواست ثبت‌شده', value: usage.length },
            { label: 'موفق', value: okCount },
            { label: 'میانگین پاسخ (ms)', value: avgLatency },
            { label: 'قابلیت فعال', value: Object.values(settings.features).filter(Boolean).length },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/10 p-2.5">
              <div className="text-lg font-extrabold">{toPersianDigits(item.value)}</div>
              <div className="text-[10px] text-blue-100">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {AI_PROVIDERS.map((provider) => {
          const config = settings.providers[provider.id];
          const active = settings.activeProvider === provider.id;
          const models = provider.models.filter((m) => m.connection === config.connection);
          const preset = provider.models.find((m) => m.model === config.model);
          const test = tests[provider.id];
          return (
            <article key={provider.id} className={`bg-white rounded-3xl border-2 p-4 space-y-3 transition ${active ? 'border-indigo-500 shadow-md shadow-indigo-100' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-extrabold text-sm" style={{ background: provider.color }}>{provider.name[0]}</span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">{provider.name}</div>
                    <div className="text-[10px] text-slate-400">{provider.vendor}</div>
                  </div>
                </div>
                <button onClick={() => setSettings({ ...settings, activeProvider: provider.id })} aria-pressed={active} className={`text-[10px] font-bold px-3 py-1.5 rounded-full border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                  {active ? <><CheckCircle2 className="w-3 h-3 inline ml-1" />ارائه‌دهنده فعال</> : 'انتخاب'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {(['DIRECT', 'OPENROUTER'] as AiConnectionMode[]).map((mode) => (
                  <button key={mode} onClick={() => { const first = provider.models.find((m) => m.connection === mode); updateProvider(provider.id, { connection: mode, ...(first ? { model: first.model } : {}) }); }} className={`text-[10px] font-bold py-1.5 rounded-xl border ${config.connection === mode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {mode === 'DIRECT' ? 'اتصال مستقیم' : 'از طریق OpenRouter'}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="block text-[10px] font-bold text-slate-600 mb-1">مدل</span>
                <select value={preset ? config.model : '__custom'} onChange={(e) => e.target.value !== '__custom' && updateProvider(provider.id, { model: e.target.value })} className="w-full text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {models.map((m) => <option key={m.model} value={m.model}>{m.label}{m.free ? ' — رایگان' : ''}</option>)}
                  <option value="__custom">مدل دلخواه…</option>
                </select>
                <input value={config.model} onChange={(e) => updateProvider(provider.id, { model: e.target.value.trim() })} dir="ltr" className="mt-1.5 w-full text-[10px] p-1.5 bg-white border border-slate-200 rounded-lg font-mono text-left" aria-label="نام دقیق مدل" />
                {preset?.note && <span className="block text-[10px] text-slate-500 mt-1">{preset.note}</span>}
                {preset && <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${preset.free ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{preset.free ? 'مدل رایگان' : 'غیررایگان'}</span>}
              </label>

              <div className="space-y-1">
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><KeyRound className="w-3 h-3" />کلید API</span>
                {hasServerKey(provider.id) ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2"><Server className="w-3.5 h-3.5" />کلید امن سمت سرور تنظیم شده است</span>
                ) : (
                  <>
                    <input type="password" value={keyDrafts[provider.id]} onChange={(e) => setKeyDrafts({ ...keyDrafts, [provider.id]: e.target.value })} placeholder={config.apiKey ? `ذخیره‌شده: ${maskKey(config.apiKey)}` : 'کلید را وارد کنید'} dir="ltr" className="w-full text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-xl text-left" />
                    {config.apiKey && <button onClick={() => updateProvider(provider.id, { apiKey: undefined })} className="text-[10px] text-rose-600 font-bold">حذف کلید ذخیره‌شده</button>}
                  </>
                )}
                <p className="text-[10px] leading-4 text-slate-400">{provider.keyHint}</p>
              </div>

              <button onClick={() => handleTest(provider.id)} disabled={test.state === 'running'} className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
                {test.state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
                تست اتصال (با تنظیمات ذخیره‌شده)
              </button>
              {test.state === 'ok' && <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded-xl p-2 flex gap-1"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{test.message}</p>}
              {test.state === 'fail' && <p className="text-[10px] text-rose-700 bg-rose-50 rounded-xl p-2 flex gap-1"><XCircle className="w-3.5 h-3.5 shrink-0" />{test.message}</p>}
            </article>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <section className="bg-white rounded-3xl border border-slate-200 p-4">
          <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 mb-3"><Zap className="w-4 h-4 text-amber-500" />قابلیت‌های هوشمند سامانه</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AI_FEATURES.map((feature) => (
              <label key={feature.id} className={`flex items-start gap-2 p-3 rounded-2xl border cursor-pointer ${settings.features[feature.id] ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200'}`}>
                <input type="checkbox" checked={settings.features[feature.id]} onChange={(e) => setSettings({ ...settings, features: { ...settings.features, [feature.id]: e.target.checked } })} className="accent-indigo-600 mt-0.5" />
                <span>
                  <span className="block text-[11px] font-extrabold text-slate-800">{feature.title}</span>
                  <span className="block text-[10px] text-slate-500 leading-4 mt-0.5">{feature.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
          <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5"><Cpu className="w-4 h-4 text-indigo-600" />رفتار پاسخ‌گویی</h4>
          <label className="block">
            <span className="flex justify-between text-[10px] font-bold text-slate-600"><span>خلاقیت پاسخ</span><span>{toPersianDigits(settings.temperature.toFixed(1))}</span></span>
            <input type="range" min={0} max={1} step={0.1} value={settings.temperature} onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })} className="w-full accent-indigo-600" />
            <span className="flex justify-between text-[9px] text-slate-400"><span>دقیق و رسمی</span><span>خلاق</span></span>
          </label>
          <label className="flex items-start gap-2 text-[11px] cursor-pointer">
            <input type="checkbox" checked={settings.localFallback} onChange={(e) => setSettings({ ...settings, localFallback: e.target.checked })} className="accent-indigo-600 mt-0.5" />
            <span><b className="text-slate-800">موتور هوشمند محلی</b><span className="block text-[10px] text-slate-500">هنگام قطعی یا نبود کلید، تحلیل قاعده‌محور خود سامانه پاسخ دهد (با برچسب مشخص).</span></span>
          </label>
          <label className="flex items-start gap-2 text-[11px] cursor-pointer">
            <input type="checkbox" checked={settings.privacyMode} onChange={(e) => setSettings({ ...settings, privacyMode: e.target.checked })} className="accent-indigo-600 mt-0.5" />
            <span><b className="text-slate-800 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />حالت حریم خصوصی</b><span className="block text-[10px] text-slate-500">شماره تماس، ایمیل و کد ملی افراد هرگز برای ارائه‌دهنده ارسال نمی‌شود.</span></span>
          </label>
          {settings.updatedAt && <p className="text-[10px] text-slate-400">آخرین تغییر: {settings.updatedBy} — {toPersianDigits(new Date(settings.updatedAt).toLocaleString('fa-IR'))}</p>}
        </section>
      </div>

      {usage.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200 p-4">
          <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 mb-2"><Activity className="w-4 h-4 text-teal-600" />آخرین درخواست‌ها</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead><tr className="text-slate-400 text-right"><th className="p-1.5">زمان</th><th className="p-1.5">قابلیت</th><th className="p-1.5">ارائه‌دهنده / مدل</th><th className="p-1.5">نتیجه</th><th className="p-1.5">زمان پاسخ</th></tr></thead>
              <tbody>
                {usage.slice(0, 8).map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="p-1.5 text-slate-500">{toPersianDigits(new Date(u.at).toLocaleTimeString('fa-IR'))}</td>
                    <td className="p-1.5 font-bold text-slate-700">{AI_FEATURES.find((f) => f.id === u.feature)?.title || u.feature}</td>
                    <td className="p-1.5 font-mono text-slate-600" dir="ltr">{u.provider} / {u.model}</td>
                    <td className="p-1.5">{u.ok ? <span className="text-emerald-700 font-bold">موفق</span> : <span className="text-rose-600 font-bold" title={u.error}>ناموفق</span>}</td>
                    <td className="p-1.5 text-slate-500">{toPersianDigits(u.latencyMs)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex justify-start sticky bottom-2 z-10">
        <button onClick={handleSave} className="flex items-center gap-1.5 text-xs font-extrabold px-6 py-3 rounded-2xl bg-indigo-700 text-white shadow-lg hover:bg-indigo-800"><Save className="w-4 h-4" />ذخیره تنظیمات هوش مصنوعی</button>
      </div>
    </div>
  );
};
