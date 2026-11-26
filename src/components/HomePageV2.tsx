import { useEffect, useRef, useState } from 'react';
import HomePage from './HomePage';
import { marketRepository } from '../repositories/MarketDataRepository';
import './HomePageV2.css';

function FinancialBars() {
  const [rows, setRows] = useState<{ year: number; months: number; value: number | null }[]>([]);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function load() {
      const manifest = await marketRepository.getManifest(signal);
      const index = await marketRepository.getMasterIndex(manifest, signal);
      const instrument = index.instruments.find(row => row.issuerId === 'ISS_AKHABER');
      if (!instrument) return;
      const detail = await marketRepository.getSymbolDetail(manifest, instrument, signal);
      if (signal.aborted) return;
      const superseded = new Set(detail?.statements.map(row => row.restatedFromRevisionId));
      setRows((detail?.statements ?? []).filter(row => !row.isFixture && !row.isSuperseded && !superseded.has(row.revisionId) && row.consolidationScope === 'standalone')
        .sort((a,b) => a.fiscalYear-b.fiscalYear).map(row => {
          const value = row.facts.find(fact => fact.code === 'REVENUE')?.value;
          return {year: row.fiscalYear, months: row.periodMonths, value: value == null ? null : Number(value)/1e9};
        }));
    }
    void load().catch(() => {});
    return () => controller.abort();
  }, []);
  const format = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
  const max = Math.max(1,...rows.map(row => row.value ?? 0));
  return <div className="fd-kinetic fd-mini">
    <span>درآمد عملیاتی اخابر</span>
    <div className="fd-mini-bars">{rows.map((row,index) => <button key={row.year} type="button"
      aria-pressed={index===selected} aria-label={format.format(row.year) + '، ' + format.format(row.months) + ' ماهه'}
      onClick={()=>setSelected(index)} onFocus={()=>setSelected(index)}>
      <i style={{transform:'scaleY('+Math.max(.01,(row.value ?? 0)/max)+')'}} className={row.months<12?'interim':''}/>
      <small>{format.format(row.year)}</small>
    </button>)}</div>
    <output aria-live="polite">{rows[selected] ? format.format(rows[selected].months)+' ماهه · '+(rows[selected].value === null ? '—' : format.format(rows[selected].value))+' میلیارد ریال' : 'در حال دریافت داده'}</output>
  </div>;
}

function MotionGraphic({index}:{index:number}) {
  const [scenario,setScenario]=useState(1);
  const paths=['M8 66 Q55 64 95 45 T165 29','M8 66 Q55 64 95 45 T165 48','M8 66 Q55 64 95 45 T165 76'];
  return <div className="fd-kinetic">
    <span>{index===5?'مسیرهای سناریو':index===4?'از گزارش به نکتهٔ کلیدی':'کاوش در داده‌های مالی'}</span>
    <svg viewBox="0 0 180 90" role="img" aria-label="نمایش شماتیک روند">
      <path d="M8 84H172" stroke="#D6E4DD" fill="none"/>
      {(index===5?paths:[paths[0]]).map((path,i)=><path key={path} className="fd-draw" pathLength="1" d={path} fill="none"
        stroke={i===scenario?'#046C4E':'#10B981'} strokeWidth={i===scenario?3:2} opacity={index===5&&i!==scenario?.35:1}/>)}
    </svg>
    {index===5&&<div className="fd-scenarios">{['رشد','پایه','افت'].map((label,i)=><button key={label} type="button" aria-pressed={i===scenario} onClick={()=>setScenario(i)}>{label}</button>)}</div>}
    <small>نمایش مفهومی</small>
  </div>;
}

export default function HomePageV2() {
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const node=host.current;
    if(!node)return;
    const motion=matchMedia('(prefers-reduced-motion: no-preference) and (pointer: fine)');
    let frame=0;
    const move=(event:PointerEvent)=>{
      if(!motion.matches)return;
      cancelAnimationFrame(frame);
      const x=(event.clientX/window.innerWidth-.5)*10;
      const y=(event.clientY/window.innerHeight-.5)*8;
      frame=requestAnimationFrame(()=>{
        node.style.setProperty('--depth-x',x+'px');
        node.style.setProperty('--depth-y',y+'px');
      });
    };
    const reset=()=>{cancelAnimationFrame(frame);node.style.setProperty('--depth-x','0px');node.style.setProperty('--depth-y','0px');};
    node.addEventListener('pointermove',move);
    node.addEventListener('pointerleave',reset);
    motion.addEventListener('change',reset);
    return()=>{cancelAnimationFrame(frame);node.removeEventListener('pointermove',move);node.removeEventListener('pointerleave',reset);motion.removeEventListener('change',reset);};
  },[]);
  return <div ref={host}><HomePage creative widget={index=>index===1?<FinancialBars/>:<MotionGraphic index={index}/>}/></div>;
}
