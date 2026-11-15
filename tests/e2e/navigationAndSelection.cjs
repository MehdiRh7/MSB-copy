/**
 * پرامپت ۱ (اصلاح منوها، تب دبیر جلسه، نمایش امضا، حذف تب اعضا)
 * پرامپت ۲ (انتخاب همه، انتخاب گروهی دبیر جلسه، تعویض User بدون خالی شدن صفحه)
 */
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4183';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

// تعویض User دقیقاً مثل کاربر واقعی: بدون Reload، تا باگ خالی شدن صفحه دیده شود.
const switchUser = async (page, label) => {
  await page.locator('button:has-text("کاربر:")').first().click();
  await page.waitForTimeout(300);
  await page.locator('div.absolute button').filter({ hasText: label }).first().click();
  await page.waitForTimeout(700);
};

const openSidebar = async (page, label) => {
  await page.locator(`aside button:has-text("${label}")`).first().click();
  await page.waitForTimeout(800);
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => { pageErrors.push(String(e)); console.log('PAGEERROR:', String(e)); });
  page.on('dialog', async (d) => { await d.accept(); });

  await page.addInitScript(() => {
    window.loadUsers = async () => {
      const stored = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:users') || 'null');
      if (stored && stored.length) return stored;
      const data = await import('/src/mock/data.ts');
      return data.mockUsers;
    };
    window.actor = async (id) => (await window.loadUsers()).find((u) => u.id === id);
  });
  // این Suite یک مرورگرِ از قبل Reset‌شده را شبیه‌سازی می‌کند: Marker پیش از
  // بارگذاری هر صفحه ثبت می‌شود تا Reset یک‌باره داده‌های Seed تست را پاک نکند.
  await page.addInitScript(() => {
    localStorage.setItem('postbank-mosavabat-v1:operationalResetVersion', '1');
  });


  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // ================= پرامپت ۱ / بند ۱: انتقال اینفوگراف و راهنما =================
  const sidebarText = await page.locator('aside').first().innerText();
  check('۱ «اینفوگراف» از منوی کناری حذف شد', !sidebarText.includes('اینفوگراف'));
  check('۱ «راهنمای کاربری سامانه» از منوی کناری حذف شد', !sidebarText.includes('راهنمای کاربری'));
  check('۱ گزینه «تنظیمات» در منو هست', sidebarText.includes('تنظیمات'));

  await openSidebar(page, 'تنظیمات');
  const settingsText = await page.locator('main').first().innerText();
  check('۱ تب «اینفوگراف» داخل تنظیمات ساخته شد', settingsText.includes('اینفوگراف'));
  check('۱ تب «راهنمای کاربری» داخل تنظیمات ساخته شد', settingsText.includes('راهنمای کاربری'));
  // Permission بدون تغییر: کاربر غیرمدیر همچنان تب‌های مدیریتی را نمی‌بیند.
  check('۱ کاربر غیرمدیر تب‌های مدیریتی تنظیمات را نمی‌بیند',
    !settingsText.includes('تنظیمات عمومی') && !settingsText.includes('مدیریت کاربران'));

  await page.locator('main button').filter({ hasText: /^اینفوگراف$/ }).first().click();
  await page.waitForTimeout(700);
  const infoText = await page.locator('main').first().innerText();
  check('۱ محتوای اینفوگراف حذف نشده و نمایش داده می‌شود', infoText.includes('اینفوگراف سامانه'));

  await page.locator('main button').filter({ hasText: /^راهنمای کاربری$/ }).first().click();
  await page.waitForTimeout(700);
  const guideText = await page.locator('main').first().innerText();
  check('۱ محتوای راهنمای کاربری حذف نشده و نمایش داده می‌شود', guideText.includes('اسلاید'));

  // مدیر سیستم: تب‌های مدیریتی قبلی دست‌نخورده باقی مانده‌اند.
  await switchUser(page, 'مدیر سیستم');
  await openSidebar(page, 'تنظیمات');
  const adminSettingsText = await page.locator('main').first().innerText();
  check('۱ تب‌های مدیریتی قبلی برای مدیر سیستم حفظ شدند',
    adminSettingsText.includes('تنظیمات عمومی') && adminSettingsText.includes('مدیریت کاربران'));
  check('۱ مدیر سیستم هر چهار تب را می‌بیند',
    adminSettingsText.includes('اینفوگراف') && adminSettingsText.includes('راهنمای کاربری'));

  // ================= پرامپت ۱ / بند ۴: حذف تب «اعضا و امضاکنندگان» =================
  // Seed عملیاتی سامانه عمداً خالی است، پس این Suite جلسه خودش را می‌سازد.
  await page.evaluate(async () => {
    const users = await window.loadUsers();
    const member = users.find((u) => u.id === 'user-9') || users[1];
    const meetings = JSON.parse(localStorage.getItem('postbank-mosavabat-v1:meetings') || '[]');
    meetings.unshift({
      id: 'meet-nav', meetingNumber: 'جلسه-۱۴۰۵-۷۰۱', title: 'جلسه تست ناوبری',
      type: 'COMMISSION', dateJalali: '1405/06/25', startTime: '09:00', endTime: '12:00',
      location: 'سالن جلسات', status: 'INVITATION_SENT',
      organizerId: 'user-16', organizerName: 'مدیرعامل',
      secretaryId: 'user-8', secretaryName: 'مهندس جواد صادقی',
      departmentId: 'dept-1', departmentName: 'اداره کل فناوری اطلاعات', description: '',
      members: [{
        userId: member.id, fullName: member.fullName, roleTitle: member.title,
        organizationPosition: member.title, departmentName: member.departmentName,
        attendanceType: 'MEMBER', presenceStatus: 'PRESENT',
      }],
      agendaItems: [{
        id: 'ag-nav', order: 1, rowNumber: 1, title: 'بند تست ناوبری', presenter: member.fullName,
        presenterName: member.fullName, startTime: '09:00', endTime: '09:30',
        allocatedMinutes: 30, isDiscussed: false,
      }],
      attachments: [], history: [], resolutionsCount: 0, createdAt: new Date().toISOString(),
    });
    localStorage.setItem('postbank-mosavabat-v1:meetings', JSON.stringify(meetings));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await openSidebar(page, 'جلسات');
  await page.locator('main tr.cursor-pointer').first().click();
  await page.waitForTimeout(1200);
  const meetingText = await page.locator('main').first().innerText();
  if (meetingText.includes('دستور جلسه و مذاکرات')) {
    check('۴ تب «اعضا و امضاکنندگان» حذف شد', !meetingText.includes('اعضا و امضاکنندگان'));
    check('۴ تب «دعوتنامه‌ها و مدعوین» باقی مانده', meetingText.includes('دعوتنامه‌ها و مدعوین'));
    check('۴ تب‌های دیگر جلسه دست‌نخورده‌اند',
      meetingText.includes('مصوبات جلسه') && meetingText.includes('پیوست‌ها') && meetingText.includes('پیش‌نمایش چاپ صورتجلسه'));

    // بند ۳: امضای دبیر جلسه در فرم جلسه نمایش داده نشود، ولی در بخش چاپ بله.
    await page.locator('main button').filter({ hasText: 'دعوتنامه‌ها و مدعوین' }).first().click();
    await page.waitForTimeout(700);
    const inviteImgs = await page.locator('main img[alt*="امضا"]').count();
    check('۳ تصویر امضای دبیر جلسه در تب دعوتنامه فرم جلسه نمایش داده نمی‌شود', inviteImgs === 0, `img=${inviteImgs}`);
    const inviteText = await page.locator('main').first().innerText();
    check('۴ سمت/واحد سازمانی اعضا در تب دعوتنامه دیده می‌شود (اطلاعات تب حذف‌شده از دست نرفت)',
      /اداره|معاون|مدیر/.test(inviteText));
  } else {
    check('۴ صفحه جزئیات جلسه باز شد', false, 'جلسه‌ای برای باز کردن پیدا نشد');
  }

  // بند ۳: امضا همچنان در خروجی رسمی/PDF هست — از روی خود Document Service.
  const docHasSignature = await page.evaluate(async () => {
    const [docMod, meetMod] = await Promise.all([
      import('/src/services/documentService.ts'),
      import('/src/services/meetingService.ts'),
    ]);
    const actor = await window.actor('user-1');
    const res = await meetMod.meetingService.getMeetings({ pageSize: 50 });
    const meeting = res.data.items[0];
    if (!meeting) return 'NO_MEETING';
    meeting.invitationSignature = {
      signerUserId: 'user-8', signerName: 'مهندس جواد صادقی', signerTitle: 'دبیر جلسه',
      signatureImageUrl: 'data:image/svg+xml;base64,QQ==',
      signedDateJalali: '1405/06/20', signedTimeString: '10:00', signedAt: new Date().toISOString(),
    };
    const doc = docMod.buildMeetingInvitationDocument(meeting, actor);
    return doc.html.includes('data:image/svg+xml;base64,QQ==') ? 'HAS_SIGNATURE' : 'NO_SIGNATURE';
  });
  check('۳ امضای دبیر جلسه همچنان در سند رسمی/PDF دعوت‌نامه چاپ می‌شود', docHasSignature === 'HAS_SIGNATURE', docHasSignature);

  // ================= داده تست کارتابل‌ها =================
  await page.evaluate(() => {
    const base = {
      proposerName: 'مهندس سارا نیک‌نام', proposerUserId: 'user-9',
      proposerDepartmentId: 'dept-1', proposerDepartmentName: 'اداره کل فناوری اطلاعات',
      presenterUserId: 'user-9', presenterName: 'مهندس سارا نیک‌نام',
      description: 'شرح پیشنهاد تست انتخاب گروهی', rationale: 'دلیل تست',
      dateJalali: '1405/06/20', attachments: [], history: [], createdAt: new Date().toISOString(),
    };
    localStorage.setItem('postbank-mosavabat-v1:proposals', JSON.stringify([
      { ...base, id: 'sel-ceo-1', title: 'کارتابل مدیرعامل ۱', status: 'PENDING_CEO_REVIEW' },
      { ...base, id: 'sel-ceo-2', title: 'کارتابل مدیرعامل ۲', status: 'PENDING_CEO_REVIEW' },
      { ...base, id: 'sel-ceo-3', title: 'کارتابل مدیرعامل ۳', status: 'PENDING_CEO_REVIEW' },
      { ...base, id: 'sel-sec-1', title: 'کارتابل دبیر جلسه ۱', status: 'PENDING_SECRETARY_CONFIRMATION', confirmedPresenterName: 'مهندس سارا نیک‌نام', confirmedDateJalali: '1405/06/21' },
      { ...base, id: 'sel-sec-2', title: 'کارتابل دبیر جلسه ۲', status: 'PENDING_SECRETARY_CONFIRMATION', confirmedPresenterName: 'مهندس سارا نیک‌نام', confirmedDateJalali: '1405/06/21' },
    ]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const statusOf = async (id) => (await page.evaluate(() =>
    JSON.parse(localStorage.getItem('postbank-mosavabat-v1:proposals') || '[]'))).find((p) => p.id === id)?.status;

  // ================= پرامپت ۱ / بند ۲: ترتیب و تب پیش‌فرض دبیر جلسه =================
  await switchUser(page, 'مهندس جواد صادقی');
  await openSidebar(page, 'مصوبات پیشنهادی');
  const tabButtons = await page.locator('main button').filter({ hasText: /^(دبیر جلسه|مسئول دفتر)/ }).allInnerTexts();
  check('۲ تب «دبیر جلسه» قبل از «مسئول دفتر» است',
    tabButtons.length >= 2 && tabButtons[0].startsWith('دبیر جلسه') && tabButtons[1].startsWith('مسئول دفتر'),
    JSON.stringify(tabButtons));
  let body = await page.locator('main').first().innerText();
  check('۲ تب پیش‌فرض هنگام ورود «دبیر جلسه» است', body.includes('کارتابل دبیر جلسه ۱') && body.includes('تأیید نهایی'));

  // ================= پرامپت ۲ / بند ۲: Multiple Select کارتابل دبیر جلسه =================
  check('۲.۲ نوار «انتخاب همه» در کارتابل دبیر جلسه هست', body.includes('انتخاب همه'));
  const secAll = page.locator('main input[type="checkbox"]').first();
  await secAll.check();
  await page.waitForTimeout(400);
  body = await page.locator('main').first().innerText();
  check('۲.۲ انتخاب همه، هر دو مورد را انتخاب کرد', body.includes('۲ مورد انتخاب شده'), body.match(/\S+ مورد انتخاب شده/)?.[0]);

  // Indeterminate: برداشتن یکی از آیتم‌ها
  await page.locator('main input[type="checkbox"]').nth(1).uncheck();
  await page.waitForTimeout(400);
  const indeterminate = await page.locator('main input[type="checkbox"]').first().evaluate((el) => el.indeterminate);
  check('۲.۱/۲.۲ انتخاب جزئی → چک‌باکس در حالت Indeterminate', indeterminate === true);

  // تأیید گروهی
  await page.locator('main input[type="checkbox"]').first().check();
  await page.waitForTimeout(300);
  await page.locator('main button').filter({ hasText: 'تأیید نهایی گروهی' }).first().click();
  await page.waitForTimeout(1000);
  check('۲.۲ تأیید گروهی دبیر جلسه روی مورد اول اعمال شد', await statusOf('sel-sec-1') === 'CONFIRMED_FOR_MEETING', await statusOf('sel-sec-1'));
  check('۲.۲ تأیید گروهی دبیر جلسه روی مورد دوم اعمال شد', await statusOf('sel-sec-2') === 'CONFIRMED_FOR_MEETING', await statusOf('sel-sec-2'));

  // ================= پرامپت ۲ / بند ۱: Select All مصوبات پیشنهادی (کارتابل مدیرعامل) =================
  await switchUser(page, 'مدیرعامل');
  await openSidebar(page, 'مصوبات پیشنهادی');
  body = await page.locator('main').first().innerText();
  check('۲.۱ نوار «انتخاب همه» در مصوبات پیشنهادی هست', body.includes('انتخاب همه'));
  await page.locator('main input[type="checkbox"]').first().check();
  await page.waitForTimeout(400);
  body = await page.locator('main').first().innerText();
  check('۲.۱ انتخاب همه، هر سه مورد کارتابل مدیرعامل را انتخاب کرد', body.includes('۳ مورد انتخاب شده'), body.match(/\S+ مورد انتخاب شده/)?.[0]);

  await page.locator('main input[type="checkbox"]').first().uncheck();
  await page.waitForTimeout(400);
  body = await page.locator('main').first().innerText();
  check('۲.۱ برداشتن «انتخاب همه»، همه را از انتخاب خارج کرد', !body.includes('مورد انتخاب شده'));

  await page.locator('main input[type="checkbox"]').first().check();
  await page.waitForTimeout(300);
  await page.locator('main button').filter({ hasText: 'تایید گروهی' }).first().click();
  await page.waitForTimeout(1200);
  check('۲.۱ تایید گروهی موجود بدون تغییر کار می‌کند',
    (await statusOf('sel-ceo-1')) === 'APPROVED' && (await statusOf('sel-ceo-2')) === 'APPROVED' && (await statusOf('sel-ceo-3')) === 'APPROVED',
    `${await statusOf('sel-ceo-1')}/${await statusOf('sel-ceo-2')}/${await statusOf('sel-ceo-3')}`);

  // ================= پرامپت ۲ / بند ۳: تعویض User بدون خالی شدن صفحه =================
  const urlBefore = page.url();
  const notEmpty = async (who) => {
    const text = (await page.locator('main').first().innerText()).trim();
    return { len: text.length, text };
  };

  // مدیرعامل → مسئول دفتر (بدون Reload)
  await switchUser(page, 'مسئول دفتر');
  await page.waitForTimeout(600);
  let s1 = await notEmpty();
  check('۲.۳ مدیرعامل → مسئول دفتر: صفحه خالی نشد', s1.len > 120, `chars=${s1.len}`);
  check('۲.۳ مدیرعامل → مسئول دفتر: تب مسئول دفتر فعال شد', s1.text.includes('مسئول دفتر'));
  check('۲.۳ URL دچار Full Refresh نشد', page.url() === urlBefore, page.url());

  // مسئول دفتر → دبیر جلسه
  await switchUser(page, 'مهندس جواد صادقی');
  await page.waitForTimeout(600);
  let s2 = await notEmpty();
  check('۲.۳ مسئول دفتر → دبیر جلسه: صفحه خالی نشد', s2.len > 120, `chars=${s2.len}`);
  check('۲.۳ مسئول دفتر → دبیر جلسه: داده مطابق کاربر جدید Load شد', s2.text.includes('دبیر جلسه'));

  // دبیر جلسه → مدیرعامل (برگشت)
  await switchUser(page, 'مدیرعامل');
  await page.waitForTimeout(600);
  let s3 = await notEmpty();
  check('۲.۳ دبیر جلسه → مدیرعامل: صفحه خالی نشد', s3.len > 120, `chars=${s3.len}`);
  // هر سه پیشنهاد کارتابل مدیرعامل بالاتر تایید گروهی شدند، پس کارتابل خالی
  // است — مهم این است که پیام خالی بودن رندر شود، نه اینکه صفحه سفید بماند.
  check('۲.۳ دبیر جلسه → مدیرعامل: محتوای کارتابل مدیرعامل رندر شد',
    s3.text.includes('مصوبات پیشنهادی') && s3.text.includes('در انتظار بررسی نیست'), s3.text.slice(0, 120));

  // یک کاربر عادی هم امتحان شود (هیچ‌کدام از نقش‌های بالا)
  await switchUser(page, 'مهندس سارا نیک‌نام');
  await page.waitForTimeout(600);
  let s4 = await notEmpty();
  check('۲.۳ مدیرعامل → کاربر عادی: صفحه خالی نشد', s4.len > 120, `chars=${s4.len}`);
  check('۲.۳ کاربر عادی تب «پیشنهادها و دستورات من» را می‌بیند', s4.text.includes('پیشنهادها و دستورات من') || s4.text.includes('ثبت مصوبه پیشنهادی جدید'));

  check('Regression: هیچ Crash/Runtime Error در طول تست رخ نداد', pageErrors.length === 0, pageErrors.join(' | '));

  console.log(`\nNAV+SELECTION: ${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
