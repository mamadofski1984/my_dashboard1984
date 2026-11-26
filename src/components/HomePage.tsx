import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ChartNoAxesCombined } from 'lucide-react';
import { marketRepository } from '../repositories/MarketDataRepository';
import type { FinancialStatement } from '../types/marketContract';
import { useHomeScenes } from './useHomeScenes';
import './HomePage.css';

const symbolLink = (id = 'AKHABER', tab = '') => '#/symbols/INS_' + id + (tab ? '?tab=' + tab : '');
const symbols = [['AKHABER', 'اخابر'], ['FOOLAD', 'فولاد'], ['BMLT', 'وبملت'], ['SHASTA', 'شستا'], ['KALA', 'کالا']];
const sections = [
  { id: 'financials', image: 'financials', tag: 'داده‌های بنیادی و مالی', title: 'درآمد و سود شرکت در چند سال چگونه تغییر کرده؟',
    description: 'صورت‌های سالانه ۱۴۰۰ تا ۱۴۰۴ را کنار آخرین گزارش میاندوره‌ای ۱۴۰۵ ببینید. ارقام شرکت اصلی جدا از اطلاعات شرکت‌های زیرمجموعه نمایش داده می‌شوند.',
    alt: 'دو تحلیلگر در حال بررسی نمودارهای مالی', cta: 'مشاهده صورت‌های مالی اخابر', href: symbolLink('AKHABER', 'fundamental') },
  { id: 'monthly-sales', image: 'monthly', tag: 'روند فروش ماهانه', title: 'فروش ماهانه چه روندی دارد؟',
    description: 'فروش ماهانه ۱۴۰۳ تا ۱۴۰۵ را مقایسه کنید، الگوی فصل‌ها را ببینید و در گزارش‌هایی که نرخ و مقدار دارند، تغییر این دو را جداگانه بررسی کنید.',
    alt: 'پژوهشگر در کنار نمایشگر روند فروش', badge: 'مقایسه ماه‌به‌ماه · ۱۴۰۳ تا ۱۴۰۵', cta: 'بررسی روند فروش ماهانه', href: symbolLink('AKHABER', 'fundamental&view=monthly') },
  { id: 'sector-ratios', image: 'sectors', tag: 'نسبت‌های مالی و ارزش‌گذاری', title: 'برای این نوع شرکت، کدام نسبت‌ها مهم‌اند؟',
    description: 'از تولیدی و بانک تا هلدینگ و کسب‌وکار کارمزدمحور، شاخص‌های مرتبط با مدل هر شرکت را بررسی کنید و مفروضات ارزش‌گذاری سهم را ببینید.',
    alt: 'کارت‌های تحلیل صنعت و تبلت روی میز روشن', badge: 'نسبت‌های متناسب با مدل کسب‌وکار', cta: 'مقایسه قالب بانک و بورس کالا', href: symbolLink('BMLT', 'fundamental') },
  { id: 'ai-insights', image: 'ai-insights', tag: 'گزارش‌های تفسیری و افشا', title: 'چطور بدون خواندن هزاران صفحه، به نکات کلیدی گزارش‌ها برسیم؟',
    description: 'خلاصه‌های تهیه‌شده با کمک هوش مصنوعی و بررسی تحلیلگران، نکات مهم گزارش‌های تفسیری و افشاهای کدال را برجسته می‌کنند. هرجا خلاصه آماده باشد، وضعیت بررسی آن مشخص است و در صورت وجود پیوند، می‌توانید به اصل گزارش بروید.',
    alt: 'تحلیلگر در حال تطبیق خلاصه با گزارش اصلی', badge: 'خلاصه گزارش‌های تفسیری و اطلاعات افشاشده شرکت', cta: 'مشاهده خلاصه گزارش‌های تفسیری', href: symbolLink('AKHABER', 'interpretive') },
  { id: 'forecast', image: 'forecast', tag: 'پیش‌بینی فروش و EPS', title: 'سناریوهای پیش‌روی فروش و سود هر سهم (EPS) چیست؟',
    description: 'عملکرد گذشته را مبنا بگیرید و اثر تغییر مفروضات فروش را بر سود هر سهم در سناریوهای مختلف بررسی کنید.',
    alt: 'مسیرهای پیش‌بینی روی نمایشگر در فضای کار روشن', badge: 'برآورد وابسته به مفروضات سناریو', cta: 'ورود به بخش پیش‌بینی فروش و EPS', href: symbolLink('AKHABER', 'forecast') },
];

function Photo({ name, alt, hero = false }: { name: string; alt: string; hero?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="fd-photo">
    {!failed && <img src={import.meta.env.BASE_URL + 'home/' + name + '.webp'} alt={alt}
      width={1264} height={848} loading={hero ? 'eager' : 'lazy'} fetchPriority={hero ? 'high' : 'auto'}
      decoding="async" onError={() => setFailed(true)} />}
    {failed && <div className="fd-photo-fallback" aria-hidden="true"><ChartNoAxesCombined size={48} /></div>}
  </div>;
}

const number = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
function amount(row: FinancialStatement, code: string) {
  const value = row.facts.find(fact => fact.code === code)?.value;
  return value == null ? '—' : number.format(Number(value) / 1e9);
}

function FinancialPreview() {
  const [rows, setRows] = useState<FinancialStatement[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      const manifest = await marketRepository.getManifest(signal);
      const index = await marketRepository.getMasterIndex(manifest, signal);
      const instrument = index.instruments.find(item => item.instrumentId === 'INS_AKHABER');
      const detail = instrument && await marketRepository.getSymbolDetail(manifest, instrument, signal);
      if (!signal.aborted) setRows((detail?.statements ?? []).filter(row =>
        row.consolidationScope === 'standalone' && !row.isFixture && !row.isSuperseded));
    }
    void load().catch(() => { if (!signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  const interim = rows?.filter(row => row.fiscalYear === 1405 && row.periodMonths < 12)
    .sort((a, b) => b.periodMonths - a.periodMonths)[0];
  return <div className="fd-glass fd-preview">
    <strong>اخابر · شرکت اصلی</strong>
    {interim && <>
      <div className="fd-audit">{number.format(interim.fiscalYear)} · {number.format(interim.periodMonths)} ماهه · {interim.isAudited === true ? 'حسابرسی‌شده' : interim.isAudited === false ? 'حسابرسی‌نشده' : 'حسابرسی نامشخص'}</div>
      <div className="fd-figures"><span>درآمد عملیاتی <b>{amount(interim, 'REVENUE')}</b></span><span>سود خالص <b>{amount(interim, 'NET_PROFIT')}</b></span></div>
      <small>میلیارد ریال</small>
    </>}
    {rows ? <ul className="fd-years" aria-label="پوشش صورت‌های مالی سالانه">
      {[1400, 1401, 1402, 1403, 1404].map(year => {
        const available = rows.some(row => row.fiscalYear === year && row.periodMonths === 12);
        return <li key={year} className={available ? '' : 'fd-audit'}>{number.format(year)} {available ? '✓' : '· در انتظار تکمیل آرشیو شرکت اصلی'}</li>;
      })}
    </ul> : <small>{failed ? 'دریافت پیش‌نمایش ناموفق بود.' : 'در حال دریافت پیش‌نمایش داده…'}</small>}
  </div>;
}

export default function HomePage({ creative = false, widget }: { creative?: boolean; widget?: (index: number) => ReactNode }) {
  const { root, active, jump } = useHomeScenes();
  useEffect(() => {
    if (location.hash.startsWith('#section-')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, []);
  return <div ref={root} dir="rtl" className={creative ? "fd-home fd-creative" : "fd-home"}>
    <header className="fd-top"><div className="fd-shell fd-nav">
      <a href="#/" className="fd-brand"><span className="fd-mark"><ChartNoAxesCombined size={22} /></span><span>فان داشبورد<small lang="en">Fundashboard</small></span></a>
      <a className="fd-edition" href={creative ? "#/" : "#/creative"}>{creative ? "نسخهٔ اصلی" : "نسخهٔ خلاقانه"} ↗</a><nav aria-label="میانبر نمادها">{symbols.map(([id, label]) => <a key={id} href={symbolLink(id)}>{label}</a>)}</nav>
      <a className="fd-button" href={symbolLink()}>ورود به داشبورد <ArrowLeft size={16} /></a>
    </div></header>
    <nav className="fd-scene-nav" aria-label="صحنه‌های صفحهٔ خانه">
      {['معرفی فان داشبورد', ...sections.map(section => section.tag)].map((label, index) =>
        <button type="button" key={label} aria-label={label} title={label}
          aria-current={active === index ? 'step' : undefined} onClick={() => jump(index, true)}>
          {new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2 }).format(index + 1)}
        </button>)}
    </nav>
    <main>
      <section data-scene tabIndex={-1} className="fd-scene fd-shell" aria-labelledby="fd-title">
        <div className="fd-hero">
        <div className="fd-hero-copy">
          <p className="fd-tag">به فان داشبورد خوش آمدید</p>
          <h1 id="fd-title">روایتِ زنده و شفاف اعداد بازار سرمایه</h1>
          <p className="fd-lead">جایی که تحلیل بنیادی دیگر در جدول‌های خشک و گزارش‌های پیچیده گم نمی‌شود؛ داده‌های اصیل کدال را با قالب اختصاصی هر صنعت، شفاف و لذت‌بخش ببینید.</p>
          <div className="fd-actions"><a className="fd-button" href={symbolLink()}>ورود به داشبورد <ArrowLeft size={18} /></a>
            <a className="fd-text-link" href="#section-financials" onClick={event => {
              event.preventDefault();
              const target = document.getElementById('section-financials');
              window.history.replaceState(null, '', '#section-financials');
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            }}>آشنایی با فان داشبورد <ArrowDown size={17} /></a></div>
        </div>
        <div className="fd-hero-stage"><Photo name="hero-brand" hero alt="میز روشن با صورت‌های مالی و نمودارهای تحلیلی" />
          {widget?.(0)}<span className="fd-glass fd-hero-badge"><span className="fd-dot" /> صورت‌های مالی کدال · شرکت اصلی</span>
        </div>
        </div>
      </section>
      <div className="fd-shell">
        {sections.map((section, index) => <section key={section.id} id={'section-' + section.id}
          data-scene tabIndex={-1} aria-labelledby={'heading-' + section.id} className="fd-scene fd-tour-scene">
          <div className={'fd-tour' + (index % 2 ? ' fd-tour-reverse' : '')}>
          <div className="fd-tour-copy"><p className="fd-tag">{section.tag}</p>
            <h2 id={'heading-' + section.id}>{section.title}</h2><p>{section.description}</p></div>
          <div className="fd-tour-stage"><Photo name={'tour-' + section.image} alt={section.alt} />
            {widget?.(index + 1)}{index === 0 ? <FinancialPreview /> : <span className="fd-glass fd-tour-badge">{section.badge}</span>}
          </div>
          <div className="fd-tour-links"><a className="fd-outline" href={section.href}>{section.cta} <ArrowLeft size={17} /></a>
            {index === 2 && <a className="fd-outline" href={symbolLink('KALA', 'fundamental')}>مشاهده قالب بورس کالا <ArrowLeft size={17} /></a>}
          </div>
          </div>
        </section>)}
        <section className="fd-upcoming" aria-labelledby="fd-next">
          <h2 id="fd-next">قابلیت‌های آینده</h2>
          <ul>{['Nowcast فروش ماهانه پیش از انتشار کدال', 'غربالگر هوشمند و مقایسه نسبت‌ها با میانه صنعت (Screener)', 'خروجی کارت تصویری آماده اشتراک‌گذاری با واترمارک'].map(item =>
            <li key={item}><span>{item}</span><small>به‌زودی</small></li>)}</ul>
        </section>
      </div>
    </main>
    <footer className="fd-shell fd-footer"><strong>فان داشبورد</strong><a className="fd-text-link" href={symbolLink()}>ورود به داشبورد <ArrowLeft size={16} /></a></footer>
  </div>;
}
