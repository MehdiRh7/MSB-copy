/**
 * سرور تولید: فایل‌های ساخته‌شده (dist) + پراکسی هوش مصنوعی.
 *   npm run build && npm start
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAiMiddleware } from './aiProxy';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(dirname, '..', 'dist');
const app = express();

app.use(createAiMiddleware(process.env));
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`MSB server listening on :${port}`));
