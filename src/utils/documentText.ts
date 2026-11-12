/**
 * استخراج متن از پیوست‌ها (PDF، Word، متنی) کاملاً در مرورگر.
 * کتابخانه‌ها به‌صورت Lazy بارگذاری می‌شوند تا حجم صفحه اول افزایش نیابد.
 */
import { Attachment } from '../types';
import { hasDownloadableContent } from './attachmentFile';

export const READABLE_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv'];

export const isReadableAttachment = (attachment: Attachment) =>
  READABLE_EXTENSIONS.includes((attachment.fileExtension || '').toLowerCase());

const dataUrlToArrayBuffer = async (dataUrl: string): Promise<ArrayBuffer> => (await fetch(dataUrl)).arrayBuffer();

const MAX_CHARS = 60_000;

export const extractTextFromBuffer = async (buffer: ArrayBuffer, extension: string): Promise<string> => {
  const ext = extension.toLowerCase();
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      if (pages.join('\n').length > MAX_CHARS) break;
    }
    return pages.join('\n').slice(0, MAX_CHARS);
  }
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.slice(0, MAX_CHARS);
  }
  return new TextDecoder('utf-8').decode(buffer).slice(0, MAX_CHARS);
};

/** متن یک پیوست ذخیره‌شده. اگر محتوا ذخیره نشده باشد خطای قابل فهم برمی‌گرداند. */
export const extractAttachmentText = async (attachment: Attachment): Promise<string> => {
  if (!isReadableAttachment(attachment)) throw new Error('این نوع فایل قابل خواندن نیست (فقط PDF، Word و متنی).');
  if (!hasDownloadableContent(attachment)) throw new Error('محتوای این فایل در این نسخه ذخیره نشده و فقط مشخصات آن ثبت است.');
  const text = (await extractTextFromBuffer(await dataUrlToArrayBuffer(attachment.downloadUrl), attachment.fileExtension)).replace(/\s+\n/g, '\n').trim();
  if (text.length < 20) throw new Error('متن قابل استخراجی در فایل پیدا نشد (ممکن است فایل اسکن‌شده و تصویری باشد).');
  return text;
};
