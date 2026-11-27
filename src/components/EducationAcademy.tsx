import { useEffect, useId, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { educationArticles, type EducationArticle } from '../data/educationArticles';
import { marketRepository } from '../repositories/MarketDataRepository';
import type { ManifestData, MasterInstrument, SymbolDetailData } from '../types/marketContract';
import { extractActiveAnnualStatements, mapContractDetail, parseDecimalSafe } from '../utils/contractViewMapper';
import { coreRatios, historicalValuation } from '../utils/dashboardRatios';
import { averageFx, inMillionsUsd, jalaliKey, type Close, type Rate } from '../utils/supplementalMarketData';
import { lessons } from './DashboardAdditions';
import './EducationAcademy.css';

const cases = {
  'current-ratio': ['Current Ratio', 'CURRENT_RATIO', 'INS_AKHABER', 'INS_NOURI'],
  'quick-ratio': ['Quick Ratio', 'QUICK_RATIO', 'INS_DABID', 'INS_KHODRO'],
  'cash-ratio': ['Cash Ratio', 'CASH_RATIO', 'INS_FOOLAD', 'INS_NOURI'],
  dso: ['DSO', 'DSO', 'INS_NOURI', 'INS_DABID'],
  roa: ['ROA', 'ROA', 'INS_FOOLAD', 'INS_DABID'],
  pe: ['P/E', 'PE', 'INS_FOOLAD', 'INS_AKHABER'],
  pb: ['P/B', 'PB', 'INS_SHASTA', 'INS_BMLT'],
  ps: ['P/S', 'PS', 'INS_KHODRO', 'INS_NOURI'],
  'usd-adjustment': ['USD-Adjusted', 'USD', 'INS_FOOLAD', 'INS_NOURI'],
} as const;
export const articleSlug = (code: string) => Object.keys(cases).find(slug => cases[slug as keyof typeof cases][1] === code) ?? code;

const categories = [...new Set(educationArticles.map(article => article.category))];
const number = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2, useGrouping: false });

function Hero({ article }: { article: EducationArticle }) {
  const id = useId();
  const order = educationArticles.indexOf(article);
  const mark = cases[article.slug][0];
  return <header className="edu-hero">
    <svg viewBox="0 0 960 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={id+'metal'} x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#fdf4d5"/><stop offset="1" stopColor="#d4a64b"/></linearGradient>
        <linearGradient id={id+'bars'} x2="1" y2="1"><stop stopColor="#8ce9c7"/><stop offset="1" stopColor="#08755b"/></linearGradient>
        <pattern id={id+'grid'} width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0H0V35" stroke="#9adcc1" strokeOpacity=".18" fill="none"/></pattern>
      </defs>
      <rect width="960" height="280" fill={`url(#${id}grid)`}/>
      <ellipse cx={180 + order * 26} cy="163" rx="247" ry="62" transform="rotate(-20 250 160)" stroke="#e9c670" strokeOpacity=".42" fill="none"/>
      <path d="M0 260L136 203 220 220 332 135 430 155 518 76 664 112 820 45 960 68" stroke="#7de5bd" strokeOpacity=".45" strokeWidth="2" fill="none"/>
      {Array.from({length:6},(_,index)=>{
        const height=31+((index*23+order*19)%103), x=72+index*52, y=233-height;
        return <g key={index}><path d={`M${x} ${y}l12 -9h31l-12 9z`} fill="#a9f0d6"/>
          <path d={`M${x+31} ${y}l12 -9v${height}l-12 9z`} fill="#045745"/>
          <rect x={x} y={y} width="31" height={height} fill={`url(#${id}bars)`}/></g>;
      })}
      {[8,6,4,2,0].map(depth=><text key={depth} x={655+depth} y={152+depth} textAnchor="middle"
        fill={depth?`#726139`:`url(#${id}metal)`} fontSize={mark.length>10?53:75} fontWeight="800">{mark}</text>)}
    </svg>
    <span className="edu-category">{article.category}</span>
  </header>;
}

function Formula({ formula }: { formula: string }) {
  return <div className="edu-formula" aria-label={formula}>
    {formula.split('  |  ').map(equation=>{
      const equals=equation.indexOf(' = '), divide=equation.indexOf(' ÷ ',equals+3);
      if(equals<0||divide<0)return <span key={equation}>{equation}</span>;
      const numerator=equation.slice(equals+3,divide);
      const denominator=equation.slice(divide+3);
      const multiplier=/^\((.+) ÷ (.+)\) × (.+)$/.exec(equation.slice(equals+3));
      const factor=multiplier?.[3];
      return <div key={equation} className="edu-equation" aria-hidden="true">
        <strong>{equation.slice(0,equals)}</strong><span>=</span>
        <span className="edu-fraction"><span>{multiplier?.[1] ?? numerator}</span>
          <span>{multiplier?.[2] ?? denominator}</span></span>
        {factor && <span>× {factor}</span>}
      </div>;
    })}
  </div>;
}

type CaseProps = {
  manifest: ManifestData; instruments: MasterInstrument[]; rates: Rate[];
  prices: Record<string,Close[]>; eps: Record<string,number>;
};
type CaseData = { instrument: MasterInstrument; detail: SymbolDetailData|null };

function ArticleChart({ article, manifest, instruments, rates, prices, eps }: CaseProps & {article:EducationArticle}) {
  const [,code,first,second]=cases[article.slug];
  const [data,setData]=useState<CaseData[]>();
  useEffect(()=>{
    const controller=new AbortController();
    const matches=[first,second].flatMap(id=>instruments.filter(row=>row.instrumentId===id));
    void Promise.all(matches.map(async instrument=>({instrument,detail:await marketRepository
      .getSymbolDetail(manifest,instrument,controller.signal).catch(()=>null)})))
      .then(results=>{if(!controller.signal.aborted)setData(results);});
    return ()=>controller.abort();
  },[first,second,instruments,manifest]);
  const points = data?.map(({instrument,detail})=>{
    const active=extractActiveAnnualStatements(detail?.statements??[]).activeAnnualStatements;
    const timeline=mapContractDetail(detail,'standalone').financialTimeline;
    return {id:instrument.instrumentId, name:instrument.tickerFa, values:new Map(timeline.map(period=>{
      const row=period.statement;
      let value:number|null=null;
      if(row?.periodMonths===12){
        if(code==='PE'||code==='PB'||code==='PS'){
          const multiples=historicalValuation(row,prices[instrument.instrumentId]??[],eps);
          value=code==='PE'?multiples.pe:code==='PB'?multiples.pb:multiples.ps;
        }else if(code==='USD'){
          const end=jalaliKey(row.periodEndJalali??'');
          value=inMillionsUsd(period.value,end?averageFx(rates,end,12):null);
        }else{
          const opening=active.find(previous=>previous.fiscalYear===row.fiscalYear-1&&previous.consolidationScope===row.consolidationScope);
          value=parseDecimalSafe(coreRatios(row,opening,detail?.sectorTemplate).find(ratio=>ratio.code===code)?.value);
        }
      }
      return [period.fiscalYear,value];
    }))};
  });
  const actual=points?.filter(item=>[...item.values.values()].some(value=>value!==null))??[];
  const illustrative=!!data && code==='USD' && actual.length===0;
  const series=illustrative ? ['رشد فروش سریع‌تر از نرخ ارز','رشد نرخ ارز سریع‌تر از فروش'].map((name,index)=>({
    id:'sample'+index,name,
    values:new Map([1399,1400,1401,1402,1403,1404].map((year,step)=>[year,100*(1.4/(index===0?1.24:1.55))**step])),
  })) : actual;
  const rows=[1399,1400,1401,1402,1403,1404].map(year=>({
    year:number.format(year),...Object.fromEntries(series.map(item=>[item.id,item.values.get(year)??null])),
  }));
  const unit=code==='DSO'?'روز':code==='ROA'?'درصد':code==='USD'?'میلیون دلار':'مرتبه';
  return <section className="edu-card">
    <h3>نمودار مطالعهٔ موردی</h3>
    {series.length ? <>
      <p>{illustrative ? 'مثال آموزشی با فروش و نرخ‌های فرضی · میلیون دلار' : 'صورت‌های مالی سالانهٔ شرکت اصلی · '+unit}</p>
      <div className="edu-chart" dir="ltr"><ResponsiveContainer>
        <LineChart data={rows} margin={{right:15}}>
          <CartesianGrid strokeDasharray="3 5" stroke="var(--edu-border)"/>
          <XAxis dataKey="year" tick={{fill:'var(--edu-muted)'}}/>
          <YAxis tick={{fill:'var(--edu-muted)'}} tickFormatter={number.format}/>
          <Tooltip formatter={(value)=>[number.format(Number(value))+' '+unit]} contentStyle={{background:'var(--edu-panel)',color:'var(--edu-ink)'}}/>
          <Legend />
          {series.map((item,index)=><Line key={item.id} name={item.name} dataKey={item.id} stroke={index===0?'#13a77d':'#cf922b'} strokeWidth={3} dot={{r:4}} isAnimationActive={false}/>)}
        </LineChart>
      </ResponsiveContainer></div>
      <p className="edu-muted">راهنمای نمودار · {illustrative ? 'هر خط یک سناریوی فرضی است.' : 'هر خط یک نماد است. سال بدون داده به شکل فاصله نمایش داده می‌شود.'}</p>
    </> : <p role="status">{!data?'در حال بارگذاری دادهٔ مطالعهٔ موردی…':code==='USD'?'برای نمودار دلاری، نرخ تاریخچهٔ ابتدا و انتهای دوره لازم است.':'دادهٔ کافی برای ترسیم مطالعهٔ موردی در دسترس نیست.'}</p>}
    <p className="edu-muted">سری تاریخی میانگین صنعت و نرخ بهرهٔ بدون ریسک در دادهٔ فعلی موجود نیست.</p>
  </section>;
}

export default function EducationAcademy({ target,onSelect,...caseProps }:CaseProps & {target:string;onSelect:(target:string)=>void}) {
  const slug=articleSlug(target);
  const selected=educationArticles.find(article=>article.slug===slug);
  const legacy=target && !selected ? lessons[target] : undefined;
  const article=selected??educationArticles[0];
  const [category,setCategory]=useState<string>(article.category);
  useEffect(()=>{setCategory(article.category);},[article.category]);
  return <main dir="rtl" className="edu-academy">
    <h2>آموزش</h2>
    <nav className="edu-nav" aria-label="دسته‌بندی آموزش">{categories.map(item=><button type="button" key={item} aria-pressed={category===item}
      onClick={()=>{setCategory(item);const first=educationArticles.find(entry=>entry.category===item);if(first)onSelect(first.slug);}}>{item}</button>)}</nav>
    <nav className="edu-nav edu-articles" aria-label="درسنامه‌ها">{educationArticles.filter(item=>item.category===category).map(item=><button
      key={item.slug} type="button" aria-current={!legacy&&article.slug===item.slug?'page':undefined} onClick={()=>onSelect(item.slug)}>{item.title.split('؛')[0]}</button>)}</nav>
    {legacy ? <article id={'ratio-'+target} tabIndex={-1} className="edu-card edu-anchor"><h3>{legacy[0]}</h3><p>{legacy[1]}</p></article>
      : <article key={article.slug} id={'ratio-'+article.slug} tabIndex={-1} className="edu-anchor">
        <Hero article={article}/><h1>{article.title}</h1>
        {article.sections.map(section=><section key={section.heading} className="edu-card">
          <h3>{section.heading}</h3>
          {section.heading==='فرمول:' ? <Formula formula={section.lines[0]}/> : section.list
            ? <ul>{section.lines.map(line=><li key={line}>{line}</li>)}</ul>
            : section.lines.map(line=><p key={line}>{line}</p>)}
        </section>)}
        <ArticleChart article={article} {...caseProps}/>
      </article>}
  </main>;
}
