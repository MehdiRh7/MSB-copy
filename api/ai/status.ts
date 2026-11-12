import { aiServerStatus } from '../../server/aiProxy.js';

export default function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, serverKeys: aiServerStatus(process.env) });
}
