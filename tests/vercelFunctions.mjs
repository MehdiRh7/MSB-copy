/**
 * شبیه‌سازی اجرای توابع Vercel: هر فایل جداگانه به ESM کامپایل و با Node
 * بارگذاری می‌شود (همان رفتار @vercel/node). خطاهایی مثل import بدون پسوند
 * «.js» که فقط روی Vercel باعث خطای ۵۰۰ می‌شوند، اینجا پیدا می‌شوند.
 *   node tests/vercelFunctions.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const out = mkdtempSync(path.join(tmpdir(), 'vercel-sim-'));
writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
const files = [...readdirSync('api/assist').map((f) => `api/assist/${f}`), 'server/aiProxy.ts', 'server/aiConfig.ts'];
for (const file of files) {
  await build({ entryPoints: [file], outfile: path.join(out, file.replace(/\.ts$/, '.js')), format: 'esm', platform: 'node', bundle: false, logLevel: 'error' });
}
let failed = 0;
const res = () => ({ code: 0, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
for (const file of readdirSync('api/assist')) {
  try {
    const mod = await import(path.join(out, 'api/assist', file.replace(/\.ts$/, '.js')));
    const r = res();
    await mod.default({ method: file.startsWith('status') ? 'GET' : 'POST', body: {} }, r);
    const ok = r.code > 0 && r.code < 500 && r.body && typeof r.body.ok === 'boolean';
    console.log(`[${ok ? 'PASS' : 'FAIL'}] api/assist/${file} → ${r.code}`);
    if (!ok) failed++;
  } catch (error) {
    console.log(`[FAIL] api/assist/${file} → ${error.code || ''} ${error.message.split('\n')[0]}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
