export interface PdfColumn<T> {
  title: string;
  value: (item: T) => string | number | null | undefined;
}

const escapeHtml = (value: unknown) => String(value ?? '—')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

/**
 * سند در یک پنجره چاپ باز می‌شود (مسیر «ذخیره به‌صورت PDF» مرورگر). با
 * `wordExport` یک نوار ابزار (غیرقابل چاپ) هم اضافه می‌شود که همان سند را
 * با سربرگ، به‌صورت فایل Word راست‌به‌چپ دانلود می‌کند.
 */
/** ذخیره فایل از پنجره اصلی (مرورگر نام فایل را برای Blobهای پنجره پاپ‌آپ نادیده می‌گیرد). */
const registerSaveHelper = () => {
  (window as unknown as { __msbSaveFile?: (name: string, parts: BlobPart[], type: string) => void }).__msbSaveFile = (name, parts, type) => {
    const url = URL.createObjectURL(new Blob(parts, { type }));
    // نام فایل با حروف لاتین: برخی مرورگرها نام غیرلاتین را برای دانلود نادیده می‌گیرند.
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    const base = name.slice(0, name.length - ext.length)
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${base || `document-${new Date().toISOString().slice(0, 10)}`}${ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
};

export const exportHtmlToPdf = (title: string, bodyHtml: string, options: { wordExport?: boolean; autoPrint?: boolean; /** نام فایل Word (بدون پسوند)؛ پیش‌فرض: عنوان */ fileName?: string } = {}): boolean => {
  if (options.wordExport) registerSaveHelper();
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) return false;
  const autoPrint = options.autoPrint !== false;
  // نام فایل دانلودی: فقط حروف لاتین، رقم و خط تیره (بدون «/» و حروف فارسی).
  const fileBase = (options.fileName || title)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `document-${new Date().toISOString().slice(0, 10)}`;
  const toolbar = options.wordExport ? `
    <div class="doc-toolbar" data-file-name="${escapeHtml(fileBase)}">
      <span>${escapeHtml(title)}</span>
      <button type="button" onclick="window.print()">🖨️ چاپ / ذخیره PDF</button>
      <button type="button" onclick="downloadWord()">📄 دانلود Word</button>
    </div>` : '';
  const wordScript = options.wordExport ? `
    <script>
      function downloadWord() {
        var root = document.getElementById('doc-root').cloneNode(true);
        root.querySelectorAll('img').forEach(function (img) { img.setAttribute('src', img.src); });
        var html = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>"
          + "<head><meta charset='utf-8'><title>" + document.title + "</title>"
          + "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->"
          + "<style>@page Section1{size:21cm 29.7cm;margin:1.6cm 1.8cm} div.Section1{page:Section1} body{direction:rtl;font-family:Tahoma,Arial;font-size:11pt} table{border-collapse:collapse} td,th{border:1px solid #d9dee8;padding:5px} .lh td{border:none} .doc-footer{border-top:1px solid #ccc;font-size:9pt;color:#555;margin-top:24px;padding-top:6px} img{max-height:70px}</style>"
          + "</head><body dir='rtl' lang='fa'><div class='Section1'>" + root.innerHTML + "</div></body></html>";
        if (window.opener && window.opener.__msbSaveFile) { window.opener.__msbSaveFile(${JSON.stringify(fileBase)} + '.doc', ['\ufeff', html], 'application/msword'); return; }
        var blob = new Blob(['﻿', html], { type: 'application/msword' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ${JSON.stringify(fileBase)} + '.doc';
        document.body.appendChild(a); a.click(); a.remove();
      }
    <\/script>` : '';

  printWindow.document.write(`<!doctype html>
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <base href="${escapeHtml(window.location.origin)}/" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body { font-family: Tahoma, Arial, sans-serif; color: #172033; margin: 0; direction: rtl; }
          .doc-toolbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #0b2a5b; color: #fff; font-size: 12px; }
          .doc-toolbar span { flex: 1; font-weight: bold; }
          .doc-toolbar button { font-family: inherit; font-size: 12px; font-weight: bold; border: 0; border-radius: 8px; padding: 7px 12px; cursor: pointer; background: #fff; color: #0b2a5b; }
          @media print { .doc-toolbar { display: none; } }
        </style>
      </head>
      <body>
        ${toolbar}
        <div id="doc-root">${bodyHtml}</div>
        ${wordScript}
        ${autoPrint ? "<script>window.addEventListener('load', () => { window.print(); });<\/script>" : ''}
      </body>
    </html>`);
  printWindow.document.close();
  return true;
};

export const exportListToPdf = <T,>(title: string, items: T[], columns: PdfColumn<T>[]): boolean => {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) return false;

  const rows = items.map((item) => `
    <tr>${columns.map((column) => `<td>${escapeHtml(column.value(item))}</td>`).join('')}</tr>
  `).join('');

  printWindow.document.write(`<!doctype html>
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: Tahoma, Arial, sans-serif; color: #172033; margin: 0; direction: rtl; }
          header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #b0126b; padding-bottom: 10px; margin-bottom: 16px; }
          h1 { font-size: 18px; margin: 0; }
          .meta { color: #64748b; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { background: #541d50; color: white; padding: 9px 7px; border: 1px solid #3f163c; }
          td { padding: 8px 7px; border: 1px solid #d9dee8; vertical-align: top; }
          tr:nth-child(even) td { background: #fff6fb; }
          .empty { text-align: center; padding: 30px; color: #64748b; }
        </style>
      </head>
      <body>
        <header><h1>${escapeHtml(title)}</h1><div class="meta">تعداد: ${escapeHtml(items.length)} مورد</div></header>
        ${items.length ? `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.title)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">موردی برای خروجی وجود ندارد.</div>'}
        <script>window.addEventListener('load', () => { window.print(); });<\/script>
      </body>
    </html>`);
  printWindow.document.close();
  return true;
};
