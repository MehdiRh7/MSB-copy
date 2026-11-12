import React, { useState } from 'react';
import { BadgeCheck, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Resolution } from '../../types';
import { canonicalResolutionContent, verifySignature, VerificationResult } from '../../services/digitalSignatureService';

/** اعتبارسنجی واقعی امضاهای رمزنگاری‌شده مصوبه در برابر محتوای فعلی آن. */
export const SignatureVerifier: React.FC<{ resolution: Resolution }> = ({ resolution }) => {
  const [results, setResults] = useState<Record<string, VerificationResult> | null>(null);
  const [busy, setBusy] = useState(false);
  const signed = (resolution.signatureWorkflow?.steps || []).filter((s) => s.status === 'SIGNED' && s.cryptoSignature);
  if (signed.length === 0) return null;
  const verify = async () => {
    setBusy(true);
    const content = canonicalResolutionContent(resolution);
    const entries = await Promise.all(signed.map(async (s) => [s.id, await verifySignature(s.cryptoSignature!, content)] as const));
    setResults(Object.fromEntries(entries) as Record<string, VerificationResult>);
    setBusy(false);
  };
  const allValid = results && Object.values(results).every((r: VerificationResult) => r.valid);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-indigo-600" />امضای دیجیتال رمزنگاری‌شده ({signed[0].cryptoSignature!.algorithm})</span>
        <button type="button" onClick={verify} disabled={busy} className="flex items-center gap-1 text-[11px] font-bold text-white bg-indigo-700 hover:bg-indigo-800 px-3 py-1.5 rounded-xl disabled:opacity-60"><BadgeCheck className="w-3.5 h-3.5" />{busy ? 'در حال بررسی…' : 'اعتبارسنجی امضاها'}</button>
      </div>
      {results && (
        <div className={`rounded-xl p-2 text-[11px] font-bold flex items-center gap-1.5 ${allValid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {allValid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          {allValid ? 'همه امضاها معتبرند و متن مصوبه پس از امضا تغییر نکرده است.' : 'هشدار: حداقل یک امضا با محتوای فعلی مصوبه مطابقت ندارد.'}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {signed.map((s) => {
          const r = results?.[s.id];
          return (
            <div key={s.id} className={`rounded-xl border bg-white p-2 text-[10.5px] ${r ? (r.valid ? 'border-emerald-200' : 'border-rose-300') : 'border-slate-200'}`}>
              <div className="font-bold text-slate-800">{s.actualSignerName || s.signerName}</div>
              <div className="text-slate-500 font-mono" dir="ltr">ID {s.cryptoSignature!.keyFingerprint}</div>
              <div className="text-slate-400 font-mono truncate" dir="ltr" title={s.cryptoSignature!.contentHash}>SHA-256 {s.cryptoSignature!.contentHash.slice(0, 24)}…</div>
              {r && <div className={`mt-1 font-bold ${r.valid ? 'text-emerald-700' : 'text-rose-700'}`}>{r.valid ? '✓ ' : '✗ '}{r.reason}</div>}
            </div>
          );
        })}
      </div>
      <p className="text-[9.5px] text-slate-400">کلید امضا در این نسخه در مرورگر نگهداری می‌شود. اتصال به گواهی امضای الکترونیکی صادرشده توسط مرجع رسمی (توکن سخت‌افزاری) نیازمند سرور است.</p>
    </div>
  );
};
