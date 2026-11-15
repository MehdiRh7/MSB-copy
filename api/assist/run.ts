/**
 * Vercel Function — درگاه موتور پیشنهاددهنده (server/aiProxy.ts).
 * ارائه‌دهنده و مدل در server/aiConfig.ts ثابت‌اند؛ کلیدها از Environment Variables پروژه در Vercel.
 */
import { handlePublicAssist, type PublicAssistRequest } from '../../server/aiProxy.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  let body: PublicAssistRequest = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'JSON نامعتبر' }); }
  }
  const result = await handlePublicAssist(body, process.env);
  return res.status(result.ok ? 200 : (result.status || 500)).json(result);
}
