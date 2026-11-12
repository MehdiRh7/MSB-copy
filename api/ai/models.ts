import { handleAiModels, type AiConnectionMode, type AiProviderId } from '../../server/aiProxy.js';

/** فهرست زنده مدل‌های در دسترس — GET /api/ai/models?provider=gemini&connection=DIRECT */
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const query = req.query || {};
  const result = await handleAiModels(String(query.provider || '') as AiProviderId, String(query.connection || 'DIRECT') as AiConnectionMode, process.env);
  return res.status(result.ok ? 200 : (result.status || 500)).json(result);
}
