import { ChartGuide } from './DashboardAdditions';
import { useMemo, useState } from 'react';
import type { SymbolDetailData } from '../types/marketContract';
import { mapContractDetail } from '../utils/contractViewMapper';

const metrics = [['value','درآمد عملیاتی'],['netProfit','سود خالص'],['cashFlow','جریان نقد عملیاتی']] as const;
const format = new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const fmt = (n:number|null) => n == null ? '—' : format.format(n);

export default function CompanyFinancialShowcase({detail,ticker,cardStyle}:{
  detail:SymbolDetailData|null;ticker:string;cardStyle:string;
}) {
  const [metric,setMetric]=useState<(typeof metrics)[number][0]>('value');
  const [selected,setSelected]=useState(5);
  const timeline=useMemo(()=>mapContractDetail(detail,'standalone').financialTimeline,[detail]);
  const values=timeline.map(row=>row[metric]).filter((v):v is number=>v!==null);
  const hi=Math.max(1,...values),lo=Math.min(0,...values);
  const level=(v:number)=>100*(v-lo)/(hi-lo);
  const latest=timeline.filter(row=>row.value !== null || row.netProfit !== null || row.cashFlow !== null).at(-1);
  const point=timeline[selected];
  if(!latest)return <p className={`p-4 border rounded-xl ${cardStyle}`}>داده مالی تأییدشده برای نمایش روند موجود نیست.</p>;
  return <section className="space-y-4" aria-label={'نمای مالی '+ticker}>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[['درآمد عملیاتی',latest.value],['سود خالص',latest.netProfit],['جریان نقد عملیاتی',latest.cashFlow]].map(([label,value])=>
        <div key={String(label)} className={`rounded-2xl border p-5 ${cardStyle}`}>
          <small>{label} · {latest.label}</small><strong className="block text-2xl my-2">{fmt(value as number|null)}</strong><small>میلیارد تومان</small>
        </div>)}
    </div>
    <div className={`rounded-2xl border p-5 ${cardStyle}`}>
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-lg">روند مالی شرکت اصلی · {ticker}</h2><small>میلیارد تومان · ستون کهربایی گزارش میاندوره‌ای است</small></div>
        <div className="flex flex-wrap gap-2">{metrics.map(([key,title])=><button type="button" key={key} onClick={()=>setMetric(key)}
          aria-pressed={metric===key} className={`rounded-lg border px-3 py-2 text-xs ${metric===key?'bg-emerald-600 text-white':'border-current/20'}`}>{title}</button>)}</div>
      </div>
      <div className="relative mt-6 mb-3 h-60 pl-16" dir="ltr">
        {[0,1,2,3,4].map(i=>{const value=lo+(hi-lo)*i/4;return <div key={i} className="absolute right-0 left-16 border-t border-current/10" style={{bottom:(22+level(value)*1.9)+'px'}}>
          <span className="absolute right-full mr-2 -translate-y-1/2 text-xs whitespace-nowrap">{fmt(value)}</span>
        </div>;})}
        <div className="grid grid-cols-6 h-full relative gap-1">
          {timeline.map((row,index)=>{const value=row[metric];return <button type="button" key={row.fiscalYear}
            onClick={()=>setSelected(index)} onFocus={()=>setSelected(index)} aria-pressed={selected===index}
            aria-label={row.label+'، '+fmt(value)+' میلیارد تومان'} className={`relative rounded-lg ${selected===index?'bg-emerald-500/10':''}`}>
            {value!==null&&<span className={`absolute rounded-t left-1/4 w-1/2 ${row.fiscalYear===1405?'bg-amber-500':'bg-emerald-500'}`}
              style={{bottom:22+level(Math.min(0,value))*1.9,height:Math.max(1,Math.abs(value)/(hi-lo)*190)}}/>}
            <span className="absolute bottom-0 inset-x-0 text-xs">{row.year}{row.fiscalYear===1405?' *':''}{value===null?' —':''}</span>
          </button>;})}
        </div>
      </div>
      <ChartGuide items={ [['#10b981','گزارش سالانه'],['#f59e0b','گزارش میاندوره‌ای']] }/>
      <p className="text-xs">{timeline.filter(row=>row.statement).map(row=>row.year+' '+row.audit).join('، ')}</p>
      <p role="status" className="text-sm border-t border-current/10 pt-3">{point.label} · <strong>{fmt(point[metric])}</strong> میلیارد تومان</p>
    </div>
    <details className={`border rounded-2xl p-5 ${cardStyle}`}><summary className="cursor-pointer">سوابق گزارش و ارقام هر دوره</summary>
      <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-right text-sm mt-3"><thead><tr><th>دوره</th><th>درآمد عملیاتی</th><th>سود خالص</th><th>جریان نقد عملیاتی</th></tr></thead>
        <tbody>{timeline.map(row=><tr key={row.fiscalYear} className="border-t border-current/10"><td className="py-3">{row.label}</td><td>{fmt(row.value)}</td><td>{fmt(row.netProfit)}</td><td>{fmt(row.cashFlow)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}
