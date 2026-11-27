import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Insight, Rate } from '../utils/supplementalMarketData';

export const lessons: Record<string,[string,string]> = {
 QUICK_RATIO:['نسبت آنی','(دارایی جاری − موجودی − پیش‌پرداخت) ÷ بدهی جاری. توان پرداخت تعهدات کوتاه‌مدت با دارایی‌های نقدشونده.'],
 DSO:['دوره وصول مطالبات','میانگین مطالبات تجاری ÷ فروش نسیه خالص × روزهای دوره. در نبود فروش نسیه، درآمد عملیاتی مبنای تقریبی است.'],
 ROA:['بازده دارایی‌ها','سود خالص ÷ میانگین دارایی‌های ابتدا و انتهای دوره × ۱۰۰. دوره‌های هم‌طول را مقایسه کنید.'],
 CASH_RATIO:['نسبت نقدی','وجه نقد و معادل نقد ÷ بدهی جاری.'],
 CURRENT_RATIO:['نسبت جاری','دارایی جاری ÷ بدهی جاری.'],
 PE:['P/E','قیمت پایانی سهم ÷ سود هر سهم در همان دوره. برای سود صفر یا منفی، نسبت نمایش داده نمی‌شود.'],
 PB:['P/B','قیمت سهم ÷ ارزش دفتری هر سهم.'],
 ROE:['بازده حقوق مالکانه','سود خالص ÷ میانگین حقوق مالکانه × ۱۰۰.'],
 NET_MARGIN:['حاشیه سود خالص','سود خالص ÷ درآمد × ۱۰۰.'],
 GROSS_MARGIN:['حاشیه سود ناخالص','سود ناخالص ÷ درآمد × ۱۰۰.'],
 OPERATING_MARGIN:['حاشیه سود عملیاتی','سود عملیاتی ÷ درآمد × ۱۰۰.'],
 COST_TO_REVENUE:['نسبت بهای تمام‌شده به درآمد','قدر مطلق بهای تمام‌شده ÷ درآمد × ۱۰۰.'],
 BANK_COST_TO_INCOME:['نسبت هزینه به درآمد بانک','هزینه عملیاتی بانک ÷ درآمد عملیاتی × ۱۰۰.'],
 EQUITY_TO_ASSETS:['حقوق مالکانه به دارایی','حقوق مالکانه ÷ کل دارایی × ۱۰۰.'],
 LIABILITIES_TO_ASSETS:['بدهی به دارایی','کل بدهی ÷ کل دارایی × ۱۰۰.'],
};

export const guide = [
 ['معرفی شرکت و اطلاعات پایه','نماد را از فهرست انتخاب کنید تا مشخصات شرکت، تصویر، قیمت پایانی و ارزش بازار را ببینید.'],
 ['داده‌های بنیادی و مالی','نوع نمودار، واحد و دامنه صورت مالی را انتخاب کنید. وضعیت حسابرسی و دوره را پیش از مقایسه بررسی کنید.'],
 ['خلاصه گزارش‌های تفسیری','گزارش و منبع آن را باز کنید و یادداشت تحلیلی خود را ذخیره کنید.'],
 ['افشای اطلاعات','افشاهای اخیر را بر اساس گروه بررسی کنید و برای هر اطلاعیه یادداشت بنویسید.'],
 ['ارزش‌گذاری','مفروضات مدل را وارد کنید و حساسیت نتیجه به نرخ تنزیل و رشد را بررسی کنید.'],
 ['پیش‌بینی','فروش و سود هر سهم را در سناریوهای انتخابی بررسی کنید.'],
];

export function ChartGuide({items}:{items:readonly (readonly [string,string])[]}) {
 return <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-3 items-center"><strong>راهنمای نمودار</strong>
  {items.map(([color,label])=><span key={label} className="inline-flex gap-2 items-center"><i aria-hidden className="w-3 h-3 rounded-sm" style={{background:color}}/>{label}</span>)}
 </div>;
}

export function UsdHistoryDialog({rates,onClose}:{rates:Rate[];onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog dir="rtl" ref={ref} onClose={onClose} className="w-[min(92vw,760px)] rounded-2xl border p-5 bg-white text-slate-900 backdrop:bg-black/50">
  <div className="flex justify-between gap-3"><h2 className="font-bold text-xl">تاریخچه دلار از ۱۳۹۹/۰۱/۰۱</h2><button autoFocus onClick={()=>ref.current?.close()} className="border rounded px-3">بستن</button></div>
  {rates.length ? <><div className="h-72 mt-4" dir="ltr"><ResponsiveContainer>
   <LineChart data={rates}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="dateJalali" minTickGap={32}/><YAxis width={70}/><Tooltip formatter={(v)=>[Number(v).toLocaleString('fa-IR')+' ریال','نرخ دلار']}/><Line dataKey="rateIrr" stroke="#047857" dot={false} isAnimationActive={false}/></LineChart>
  </ResponsiveContainer></div><ChartGuide items={ [['#047857','نرخ پایانی دلار آزاد به ریال']] }/>
  <p className="text-xs mt-2">منبع: شبکه اطلاع‌رسانی طلا و ارز · آخرین مشاهده {rates.at(-1)?.dateJalali}
    {rates[0]?.carriedFromJalali && ' · مقدار آغاز بازه از آخرین نرخ پیش از تعطیلات نوروز ('+rates[0].carriedFromJalali+') آمده است.'}</p></> : <p className="my-8">داده تاریخی نرخ دلار هنوز بارگذاری نشده است.</p>}
 </dialog>;
}

export function AnalystSummary({insight}:{insight?:Insight}) {
 const fields=[['دیدگاه تحلیلی و مدیریتی',insight?.perspective],['طرح‌های توسعه و برنامه‌های آتی',insight?.expansion],['ریسک‌های کلیدی شرکت',insight?.risks],['بودجه و چشم‌انداز سودآوری',insight?.outlook]];
 return <div className="border rounded-xl p-4 my-4"><h3 className="font-bold mb-3">تحلیل هوش مصنوعی و مدیر صندوق</h3>
 <dl className="grid sm:grid-cols-2 gap-4">{fields.map(([label,value])=><div key={label}><dt className="font-bold">{label}</dt><dd>{value || 'تحلیل ساختاریافته ثبت نشده است.'}</dd></div>)}</dl></div>;
}

export function LocalNote({storageKey,label}:{storageKey:string;label:string}) {
 const [note,setNote]=useState(()=>{try{return localStorage.getItem(storageKey)??'';}catch{return '';}});
 const [status,setStatus]=useState('');
 return <div className="mt-4"><label className="block">{label}
 <textarea className="block w-full bg-transparent border rounded-lg p-2 my-2" rows={3} value={note} onChange={event=>{setNote(event.target.value);setStatus('');}}/></label>
 <button type="button" className="border rounded px-3 py-1" onClick={()=>{try{localStorage.setItem(storageKey,note);setStatus('ذخیره شد');}catch{setStatus('ذخیره در مرورگر ممکن نبود.');}}}>ذخیره یادداشت</button>
 <span role="status" className="mx-2">{status}</span></div>;
}

export function Materiality({insight,assets,profit}:{insight?:Insight;assets:number|null;profit:number|null}) {
 const transaction=insight?.transactionIrr;
 const effect=insight?.estimatedNetProfitEffectIrr;
 const assetRatio=typeof transaction==='number' && assets!==null && assets>0 ? Math.abs(transaction)/assets*100 : null;
 const profitRatio=typeof effect==='number' && profit!==null && profit!==0 ? effect/Math.abs(profit)*100 : null;
 const magnitude=Math.max(assetRatio??0,Math.abs(profitRatio??0));
 const format=(value:number|null)=>value===null?'—':value.toLocaleString('fa-IR',{maximumFractionDigits:2})+'٪';
 return <div className="mt-4 rounded-xl border p-3"><h3 className="font-bold">تحلیل اهمیت و اثر مالی افشا</h3>
 <p>{insight?.analysis || 'تحلیل ساختاریافته ثبت نشده است.'}</p>
 <p>نسبت مبلغ رویداد به کل دارایی‌ها {format(assetRatio)} · اثر بر قدر مطلق سود خالص {format(profitRatio)}</p>
 <p>اهمیت تحلیلی {assetRatio===null&&profitRatio===null?'نامشخص':magnitude>=10?'بااهمیت':magnitude>=1?'متوسط':'کم‌اهمیت'}</p>
 <small>مبنا آخرین دورهٔ سالانهٔ شرکت اصلی تا تاریخ افشاست. طبقه‌بندی با بیشترین نسبت مطلق انجام می‌شود. کمتر از ۱٪ کم‌اهمیت، ۱ تا کمتر از ۱۰٪ متوسط و از ۱۰٪ بااهمیت است.</small></div>;
}
