import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, CircleHelp, ClipboardCheck, Compass, Crown, FileCheck2, GraduationCap, Info, Lightbulb, Search, Send, Settings, ShieldCheck, UserCog, Users, X } from 'lucide-react';
import { useApp, AppRoute } from '../../context/AppContext';
import { toPersianDigits } from '../../utils/formatters';
import { COMMON_ERRORS, GUIDE_TOPICS, GuideRole, GuideTopic, STATUS_GLOSSARY } from './guideContent';

type RoleId = Exclude<GuideRole, 'ALL'> | 'GENERAL';

const ROLES: { id: RoleId; label: string; icon: React.ElementType; start: string; route: AppRoute; intro: string }[] = [
  { id: 'GENERAL', label: 'آشنایی با سامانه', icon: Compass, start: 'داشبورد', route: 'dashboard', intro: 'منوها، جستجو، اعلان‌ها و خروجی‌ها' },
  { id: 'STAFF', label: 'کاربر عادی', icon: Lightbulb, start: 'مصوبات پیشنهادی', route: 'proposals', intro: 'ثبت و پیگیری پیشنهاد' },
  { id: 'OFFICE', label: 'مسئول دفتر', icon: ClipboardCheck, start: 'مصوبات پیشنهادی', route: 'proposals', intro: 'تبدیل پیشنهاد، ابلاغ و پیگیری' },
  { id: 'SECRETARY', label: 'دبیر جلسه', icon: Users, start: 'مدیریت جلسات', route: 'meetings', intro: 'جلسه، دستور جلسه و ثبت مصوبه' },
  { id: 'MANAGER', label: 'مدیر / امضاکننده', icon: Crown, start: 'داشبورد ← کارهای من', route: 'dashboard', intro: 'تصمیم، تأیید دستور جلسه و امضا' },
  { id: 'ASSIGNEE', label: 'مجری', icon: UserCog, start: 'وظایف ارجاعی من', route: 'tasks', intro: 'گزارش پیشرفت و اعلام اتمام' },
  { id: 'VERIFIER', label: 'صحه‌گذار', icon: ShieldCheck, start: 'کارتابل صحه‌گذاری', route: 'approvals', intro: 'بررسی مستندات و تأیید' },
  { id: 'ADMIN', label: 'ادمین', icon: Settings, start: 'تنظیمات', route: 'settings', intro: 'کاربران، سازمان، گردش امضا' },
];

const TONE: Record<string, string> = {
  primary: 'bg-blue-50 text-blue-700 ring-blue-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
};

const normalize = (value: string) => value.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').toLowerCase();

const roleForUser = (role: string, permissions: string[] = []): RoleId => {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'SECRETARY') return permissions.includes('NOTIFY_RESOLUTION') ? 'OFFICE' : 'SECRETARY';
  if (role === 'CEO' || role === 'DEPT_MANAGER') return 'MANAGER';
  if (role === 'AUDITOR') return 'VERIFIER';
  if (role === 'EXPERT_ASSIGNEE') return 'ASSIGNEE';
  return 'STAFF';
};

const WORKFLOW = [
  { icon: Lightbulb, title: '۱. ثبت درخواست / پیشنهاد', who: 'کاربر عادی و سایر کاربران', where: 'مصوبات پیشنهادی ← ثبت پیشنهاد', text: 'برای مطرح‌کردن یک نیاز، مسئله یا پیشنهاد در جلسه. درخواست‌کننده عنوان، شرح، دلیل و پیوست را ثبت می‌کند؛ او فقط پیشنهادهای خودش را پیگیری می‌کند.' },
  { icon: ClipboardCheck, title: '۲. بررسی و تصمیم', who: 'مدیرعامل؛ سپس مسئول دفتر و دبیر جلسه', where: 'مصوبات پیشنهادی ← کارتابل نقش مربوط', text: 'مدیرعامل پیشنهاد را تأیید، رد یا برای اصلاح برمی‌گرداند. پیشنهاد تأییدشده توسط مسئول دفتر و دبیر جلسه برای قرارگرفتن در دستور جلسه آماده می‌شود.' },
  { icon: CalendarDays, title: '۳. جلسه و دستور جلسه', who: 'مسئول دفتر یا دبیر جلسه', where: 'مدیریت جلسات / تقویم جلسات', text: 'زمان، مکان، اعضا و بندهای دستور جلسه ثبت می‌شوند. مدیرعامل دستور جلسه را تأیید می‌کند؛ سپس دبیرخانه دعوتنامه و صورت‌جلسه را مدیریت می‌کند.' },
  { icon: FileCheck2, title: '۴. ثبت مصوبه و امضا', who: 'دبیر جلسه و امضاکنندگان تعریف‌شده', where: 'جزئیات جلسه ← ثبت مصوبه / بانک مصوبات', text: 'برای هر بند مصوب، متن، مسئول اجرا، مهلت و صحه‌گذار تعیین می‌شود. سپس مصوبه در ترتیب امضای تعریف‌شده گردش می‌کند.' },
  { icon: Send, title: '۵. ابلاغ و ایجاد تکلیف', who: 'مسئول دفتر و دبیر جلسه', where: 'کارتابل ابلاغ', text: 'پس از تکمیل امضاها، مسئول دفتر ابلاغ را ثبت و دبیر آن را امضا می‌کند. فقط بعد از این مرحله، تکلیف در کارتابل مجری ساخته می‌شود.' },
  { icon: UserCog, title: '۶. اجرا و گزارش پیشرفت', who: 'مجری مصوبه', where: 'وظایف ارجاعی من', text: 'مجری اقدام‌ها، درصد پیشرفت، موانع و مستندات را ثبت می‌کند. با اعلام اتمام، پرونده برای صحه‌گذاری می‌رود.' },
  { icon: ClipboardCheck, title: '۷. پیگیری مهلت‌ها', who: 'مسئول دفتر / دبیرخانه', where: 'پیگیری', text: 'برای یادآوری، ثبت پیگیری و کنترل موعدها استفاده می‌شود. پیگیری، گزارش دوره‌ای است و جای گزارش اجرای مجری را نمی‌گیرد.' },
  { icon: ShieldCheck, title: '۸. صحه‌گذاری و خاتمه', who: 'صحه‌گذار تعیین‌شده', where: 'کارتابل صحه‌گذاری', text: 'صحه‌گذار نتیجه و مستندات را تأیید می‌کند یا با ذکر دلیل برای اصلاح به مجری برمی‌گرداند. تأیید نهایی، مصوبه را مختومه می‌کند.' },
];

const MODULES = [
  ['داشبورد', 'اقدام بعدی و کارهای شخصی شما؛ نقطه شروع روزانه.'],
  ['مصوبات پیشنهادی', 'ثبت، اصلاح و تصمیم درباره درخواست پیش از جلسه.'],
  ['مدیریت جلسات و تقویم', 'برنامه‌ریزی، دعوت، دستور جلسه و صورت‌جلسه.'],
  ['بانک مصوبات', 'جزئیات، امضا، مسئول، مهلت و وضعیت اجرای هر مصوبه.'],
  ['کارتابل‌ها', 'ابلاغ، وظایف مجری، پیگیری و صحه‌گذاری؛ هر نقش فقط کارهای خود را می‌بیند.'],
  ['بایگانی', 'نگهداری قابل جست‌وجوی پرونده‌ها؛ بایگانی حذف فیزیکی نیست.'],
];

const WorkflowOverview: React.FC = () => (
  <section className="hc-overview">
    <header><span className="hc-overview-icon"><Compass className="h-5 w-5" /></span><div><h2>از درخواست تا خاتمه؛ از کجا شروع کنم؟</h2><p>این مسیر فقط برای نقش‌های مسئول هر مرحله فعال است؛ کاربر عادی نمی‌تواند جلسه یا مصوبه ایجاد کند.</p></div></header>
    <ol className="hc-workflow">
      {WORKFLOW.map(({ icon: Icon, title, who, where, text }) => <li key={title}>
        <Icon className="h-4 w-4" /><div><b>{title}</b><p>{text}</p><small><strong>چه کسی:</strong> {who} <span>·</span> <strong>کجا:</strong> {where}</small></div>
      </li>)}
    </ol>
    <details className="hc-modules">
      <summary>اجزای سامانه در یک نگاه<ChevronDown className="h-4 w-4" /></summary>
      <ul>{MODULES.map(([name, text]) => <li key={name}><b>{name}</b><span>{text}</span></li>)}</ul>
    </details>
  </section>
);

/** جزئیات هر راهنما فقط با انتخاب کاربر باز می‌شود تا صفحه خوانا بماند. */
const TopicCard: React.FC<{ topic: GuideTopic; onGo: (route: AppRoute) => void }> = ({ topic, onGo }) => (
  <details className="hc-topic group">
    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-[#0b2a5b]">{topic.title}</h3>
        <p className="mt-0.5 text-[13px] leading-6 text-slate-600">{topic.summary}</p>
      </div>
      <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
    </summary>
    <div className="mt-4 border-t border-slate-100 pt-4">
    {topic.route && <button onClick={() => onGo(topic.route!)} className="hc-go mb-3">ورود به این بخش<ArrowLeft className="h-3.5 w-3.5" /></button>}
    {topic.steps && (
      <ol className="hc-flow">
        {topic.steps.map((step, i) => (
          <li key={i} className="hc-flow-step">
            <span className="hc-flow-num">{toPersianDigits(i + 1)}</span>
            <p>{step}</p>
            {i < topic.steps!.length - 1 && <ChevronLeft className="hc-flow-arrow" />}
          </li>
        ))}
      </ol>
    )}
    {(topic.tips?.length || topic.note || topic.menu) && (
      <footer className="mt-3 flex flex-wrap gap-2">
        {topic.menu && <span className="hc-chip"><Compass className="h-3.5 w-3.5" />{topic.menu}</span>}
        {topic.tips?.map((tip) => <span key={tip} className="hc-chip hc-chip-tip"><Info className="h-3.5 w-3.5 shrink-0" />{tip}</span>)}
        {topic.note && <span className="hc-chip hc-chip-note"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{topic.note}</span>}
      </footer>
    )}</div>
  </details>
);

export const UserGuideView: React.FC = () => {
  const { navigateTo, currentUser } = useApp();
  const myRole = roleForUser(currentUser.role, currentUser.permissions);
  const [role, setRole] = useState<RoleId>(myRole);
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const roleInfo = ROLES.find((r) => r.id === role)!;
  const RoleIcon = roleInfo.icon;

  const topics = useMemo(() => {
    if (q) return GUIDE_TOPICS.filter((t) => normalize([t.title, t.summary, ...(t.steps || []), ...(t.tips || []), t.menu || '', t.note || ''].join(' ')).includes(q));
    if (role === 'GENERAL') return GUIDE_TOPICS.filter((t) => t.roles.includes('ALL'));
    return GUIDE_TOPICS.filter((t) => t.roles.includes(role as GuideRole));
  }, [q, role]);
  // راهنما ابتدا مسیرهای پرتکرار نقش را نشان می‌دهد؛ جزئیات کامل همچنان
  // در دسترس است، اما صفحه در بدو ورود به فهرست بلند تبدیل نمی‌شود.
  const quickTopics = q ? topics : topics.slice(0, 3);
  const moreTopics = q ? [] : topics.slice(3);

  return (
    <div className="hc">
      {/* منوی نقش‌ها */}
      <aside className="hc-nav">
        <div className="hc-nav-head"><GraduationCap className="h-5 w-5" /><b>مرکز آموزش</b></div>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو در آموزش…" aria-label="جستجو در آموزش" className="hc-search" />
          {query && <button onClick={() => setQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="پاک کردن"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <ul className="hc-roles">
          {ROLES.map(({ id, label, icon: Icon, intro }) => (
            <li key={id}>
              <button onClick={() => { setRole(id); setQuery(''); }} aria-pressed={!q && role === id} className="hc-role">
                <span className="hc-role-icon"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 text-right">
                  <b className="block truncate text-[13px]">{label}{id === myRole && <span className="hc-me">نقش شما</span>}</b>
                  <small className="block truncate text-[11px] opacity-75">{intro}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 space-y-4">
        {/* سربرگ نقش */}
        {!q ? (
          <section className="hc-hero">
            <span className="hc-hero-icon"><RoleIcon className="h-7 w-7" /></span>
            <div className="min-w-0 flex-1">
              <h2>{roleInfo.label}</h2>
              <p>{role === 'GENERAL' ? 'آنچه همه کاربران باید بدانند.' : <>نقطه شروع: <b>«{roleInfo.start}»</b> · {toPersianDigits(topics.length)} آموزش</>}</p>
            </div>
            <button onClick={() => navigateTo(roleInfo.route)} className="hc-hero-btn">شروع کنید<ArrowLeft className="h-4 w-4" /></button>
          </section>
        ) : (
          <section className="hc-hero"><span className="hc-hero-icon"><Search className="h-7 w-7" /></span><div><h2>نتایج «{query}»</h2><p>{toPersianDigits(topics.length)} آموزش پیدا شد</p></div></section>
        )}

        {!q && <WorkflowOverview />}

        {topics.length === 0 ? (
          <div className="db-card db-empty"><CircleHelp className="h-8 w-8 text-slate-300" /><p>آموزشی پیدا نشد؛ واژه دیگری امتحان کنید.</p></div>
        ) : (
          <>
            {!q && <p className="hc-section-label">شروع سریع · سه کار پرتکرار این نقش</p>}
            <div className="space-y-2">{quickTopics.map((t) => <TopicCard key={t.id} topic={t} onGo={navigateTo} />)}</div>
            {moreTopics.length > 0 && (
              <details className="hc-more group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span><b>راهنمای کامل این نقش</b><small>{toPersianDigits(moreTopics.length)} موضوع تکمیلی</small></span>
                  <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{moreTopics.map((t) => <TopicCard key={t.id} topic={t} onGo={navigateTo} />)}</div>
              </details>
            )}
          </>
        )}

        {/* وضعیت‌ها و سؤالات رایج */}
        {!q && (
          <div className="grid gap-3 xl:grid-cols-2">
            <details className="hc-reference group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2"><b>معنی وضعیت‌ها</b><ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary>
              <div className="mt-3 border-t border-slate-100 pt-3">
              {STATUS_GLOSSARY.map((g) => (
                <div key={g.group} className="mb-3 last:mb-0">
                  <p className="mb-1.5 text-[12px] font-bold text-slate-500">{g.group}</p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {g.items.map((i) => <li key={i.label} title={i.meaning} className={`rounded-xl px-2.5 py-1.5 text-[12px] ring-1 ${TONE[i.tone]}`}><b className="block">{i.label}</b><span className="text-[11px] opacity-80">{i.meaning}</span></li>)}
                  </ul>
                </div>
              ))}
              </div>
            </details>
            <details className="hc-reference group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2"><b>پرسش‌های رایج</b><ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary>
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {COMMON_ERRORS.map((e) => (
                  <details key={e.problem} className="group rounded-xl bg-slate-50 px-3 py-2 open:bg-blue-50">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-bold text-slate-800">{e.problem}<ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary>
                    <p className="mt-1 text-[13px] leading-6 text-slate-600">{e.solution}</p>
                  </details>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};
