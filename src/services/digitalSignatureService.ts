/**
 * «امضای دیجیتال رمزنگاری‌شده» — هر امضا علاوه بر تصویر، یک امضای واقعی
 * ECDSA (P-256 / SHA-256) روی چکیده محتوای سند دارد که با Web Crypto مرورگر
 * ساخته و قابل اعتبارسنجی است: اگر متن مصوبه بعد از امضا تغییر کند،
 * اعتبارسنجی آن را «نامعتبر» نشان می‌دهد.
 *
 * محدودیت این نسخه (بدون سرور): کلید خصوصی هر کاربر در همین مرورگر نگه
 * داشته می‌شود و گواهی آن توسط مرجع صدور گواهی (CA) ملی صادر نشده است.
 * اتصال به گواهی امضای الکترونیکی معتبر (توکن سخت‌افزاری / مرکز صدور
 * گواهی) نیازمند سرور است و در این ساختار، فقط تابع signContent عوض می‌شود.
 */
import { CryptoSignatureRecord, Resolution, ResolutionNotice } from '../types';
import { loadLocalValue, saveLocalValue } from './localStore';

const KEYS = 'userSigningKeys';
const ALGORITHM = 'ECDSA P-256 / SHA-256';

interface StoredKey { publicJwk: JsonWebKey; privateJwk: JsonWebKey; fingerprint: string; createdAt: string }

const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null);
export const isCryptoAvailable = () => Boolean(subtle());

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export const sha256Hex = async (text: string) => toHex(await subtle()!.digest('SHA-256', new TextEncoder().encode(text)));

const fingerprintOf = async (jwk: JsonWebKey) => {
  const hex = await sha256Hex(`${jwk.x}.${jwk.y}`);
  return hex.slice(0, 32).toUpperCase().match(/.{4}/g)!.join(':');
};

/** کلید امضای کاربر؛ اولین بار ساخته می‌شود. */
export const getOrCreateUserKey = async (userId: string): Promise<StoredKey> => {
  const all = loadLocalValue<Record<string, StoredKey>>(KEYS, {});
  if (all[userId]) return all[userId];
  const pair = await subtle()!.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicJwk = await subtle()!.exportKey('jwk', pair.publicKey);
  const privateJwk = await subtle()!.exportKey('jwk', pair.privateKey);
  const key: StoredKey = { publicJwk, privateJwk, fingerprint: await fingerprintOf(publicJwk), createdAt: new Date().toISOString() };
  saveLocalValue(KEYS, { ...all, [userId]: key });
  return key;
};

export const getUserKeyFingerprint = (userId: string): string | undefined => loadLocalValue<Record<string, StoredKey>>(KEYS, {})[userId]?.fingerprint;

/** محتوای قطعی و مرتب‌شده مصوبه — همان چیزی که امضا می‌شود. */
export const canonicalResolutionContent = (r: Resolution) => JSON.stringify({
  id: r.id,
  resolutionNumber: r.resolutionNumber,
  meetingNumber: r.meetingNumber,
  topicTitle: r.topicTitle,
  text: r.executionDescription || r.requestDescription,
  responsible: r.mainResponsibleName || '',
  department: r.responsibleDepartmentName || '',
  deadline: r.deadlineJalali || '',
  priority: r.priority,
  approvalStatus: r.approvalStatus,
});

export const canonicalNoticeContent = (n: ResolutionNotice) => JSON.stringify({
  id: n.id,
  noticeNumber: n.noticeNumber,
  letterNumber: n.notificationLetterNumber || '',
  resolutionNumber: n.resolutionNumber,
  recipient: n.recipientName,
  text: n.text,
  deadline: n.deadlineJalali || '',
});

export const signContent = async (userId: string, content: string): Promise<CryptoSignatureRecord | undefined> => {
  if (!isCryptoAvailable()) return undefined;
  const key = await getOrCreateUserKey(userId);
  const privateKey = await subtle()!.importKey('jwk', key.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await subtle()!.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(content));
  return {
    algorithm: ALGORITHM,
    contentHash: await sha256Hex(content),
    signature: toBase64(signature),
    publicKeyJwk: key.publicJwk,
    keyFingerprint: key.fingerprint,
    signedAt: new Date().toISOString(),
  };
};

export type VerificationResult = { valid: boolean; reason: string };

export const verifySignature = async (record: CryptoSignatureRecord, content: string): Promise<VerificationResult> => {
  if (!isCryptoAvailable()) return { valid: false, reason: 'مرورگر از رمزنگاری پشتیبانی نمی‌کند.' };
  try {
    const publicKey = await subtle()!.importKey('jwk', record.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await subtle()!.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromBase64(record.signature), new TextEncoder().encode(content));
    if (ok) return { valid: true, reason: 'امضا معتبر است و محتوا پس از امضا تغییر نکرده است.' };
    const hashNow = await sha256Hex(content);
    return { valid: false, reason: hashNow !== record.contentHash ? 'محتوای سند پس از امضا تغییر کرده است.' : 'امضا با کلید امضاکننده مطابقت ندارد.' };
  } catch {
    return { valid: false, reason: 'ساختار امضا نامعتبر است.' };
  }
};
