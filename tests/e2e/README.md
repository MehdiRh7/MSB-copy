# End-to-end scenario suites

Playwright scripts that drive the running dev server and assert against the
real `localStorage` state the services write. They are the executable form of
the acceptance scenarios agreed for each change request.

```bash
npx vite --port 4179 --host 127.0.0.1     # in one shell
node tests/e2e/<suite>.cjs                # in another
```

| Suite | Covers |
|---|---|
| `resolutionNotification.cjs` | کارتابل ابلاغ، ثبت ابلاغ، رویداد Timeline و سلامت زنجیره سه امضا |
| `notificationLetters.cjs` | شماره نامه ابلاغیه خودکار/یکتا و گزارش ابلاغیه‌ها |
| `followUpCartable.cjs` | مجوزها، زمان‌بندی هفتگی/ماهانه/فصلی/سفارشی و ثبت پیگیری |
| `meetingSignaturesAndDocuments.cjs` | حذف امضای اعضا/مدعوین، امضای تصویری و تولید اسناد رسمی |
| `archive.cjs` | بایگانی شخصی/سازمانی، دسترسی پوشه، بایگانی مصوبه و خروج از بایگانی |
| `userSignatureManagement.cjs` | مدیریت تصویر امضا فقط توسط Admin و اتصال اسناد به منبع مرکزی امضا |
| `dynamicWorkflow.cjs` | گردش کار پویا (تأیید ترتیبی/همه/یک نفر، امضای موازی، امضاکننده ابلاغیه، تأیید صورت‌جلسه، قالب‌ها) و دسترسی تنظیمات هوش مصنوعی |
| `round2Features.cjs` | اعلان لحظه‌ای، هشدار پیشگیرانه، جستجوی مفهومی، تناقض، استخراج مصوبه، PDF، پیشنهاد زمان، گردش پیشنهاد، امضای رمزنگاری‌شده، داشبورد شخصی، سند رسمی و Word |
| `proposalConfirmationLoop.cjs` | تأیید نهایی دبیر جلسه و مسیر برگشت جهت اصلاح از طریق مسئول دفتر |

Each script exits non-zero if any assertion fails.
