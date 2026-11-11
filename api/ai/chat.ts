/**
 * Vercel Function — همان پراکسی هوش مصنوعی سرور (server/aiProxy.ts).
 * کلیدها از Environment Variables پروژه در Vercel خوانده می‌شوند.
 */
import { handleAiChat, type AiProxyRequest } from '../../server/aiProxy';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  let body: AiProxyRequest = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'JSON نامعتبر' }); }
  }
  const result = await handleAiChat(body, process.env);
  return res.status(result.ok ? 200 : (result.status || 500)).json(result);
}
