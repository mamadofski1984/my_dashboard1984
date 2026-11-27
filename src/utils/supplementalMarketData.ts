import { useEffect, useState } from 'react';

export const DEFAULT_USD_IRR = 2_900_000;
export type Rate = { dateJalali: string; rateIrr: number; carriedFromJalali?: string };
export type Close = { dateJalali: string; closeIrr: number };
export type PriceHistory = Record<string, Close[]>;
export type Insight = {
  perspective?: string; expansion?: string; risks?: string; outlook?: string;
  analysis?: string; transactionIrr?: number | null; estimatedNetProfitEffectIrr?: number | null;
};
export type Insights = Record<string, Record<string, Insight>>;

const persianCalendar = new Intl.DateTimeFormat('en-u-ca-persian', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function jalaliKey(raw: string) {
  const normalized = raw.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
  const match = /^(1[34]\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:$|[ T])/.exec(normalized);
  if (!match) {
    if (!/^20\d{2}-\d{2}-\d{2}(?:$|T)/.test(normalized)) return '';
    const date=new Date(normalized.slice(0,10)+'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==normalized.slice(0,10)) return '';
    const parts=Object.fromEntries(persianCalendar.formatToParts(date).map(part=>[part.type,part.value]));
    return parts.year+'/'+parts.month+'/'+parts.day;
  }
  const [,year,month,day] = match;
  if (+month < 1 || +month > 12 || +day < 1 || +day > (+month <= 6 ? 31 : 30)) return '';
  return year + '/' + month.padStart(2,'0') + '/' + day.padStart(2,'0');
}

export function recentDisclosures<T extends {date:string}>(items:T[], now = new Date()) {
  const parts = Object.fromEntries(persianCalendar.formatToParts(now).map(part => [part.type,part.value]));
  const from = (+parts.year-1) + '/' + parts.month;
  const today = parts.year + '/' + parts.month + '/' + parts.day;
  return items.map(item=>({item,date:jalaliKey(item.date)}))
    .filter(row=>row.date >= from && row.date <= today)
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20).map(row=>row.item);
}

export function monthOffset(date: string, offset: number, day = '01') {
  const [year, month] = date.split('/').map(Number);
  const index = year * 12 + month - 1 + offset;
  return Math.floor(index/12) + '/' + String(index%12+1).padStart(2,'0') + '/' + day;
}

function daysInMonth(date:string) {
  const [year,month]=date.split('/').map(Number);
  if (month<=6) return 31;
  if (month<12) return 30;
  for(let day=19;day<=22;day++){
    const next=new Date(Date.UTC(year+622,2,day,12));
    const parts=Object.fromEntries(persianCalendar.formatToParts(next).map(part=>[part.type,part.value]));
    if (+parts.year===year+1 && +parts.month===1 && +parts.day===1){
      next.setUTCDate(day-1);
      return Number(persianCalendar.formatToParts(next).find(part=>part.type==='day')?.value??29);
    }
  }
  return 29;
}

export function periodStart(end:string,months:number) {
  const day=+end.slice(8);
  if (day===daysInMonth(end)) return monthOffset(end,1-months);
  const prior=monthOffset(end,-months);
  return day>=daysInMonth(prior) ? monthOffset(prior,1) : prior.slice(0,8)+String(day+1).padStart(2,'0');
}

export function monthEndFx(rates:Rate[], month:string) {
  const prefix=month.slice(0,8);
  return rates.findLast(row=>row.dateJalali.startsWith(prefix))?.rateIrr ?? null;
}

export function averageFx(rates:Rate[], end:string, months:number) {
  if (!jalaliKey(end) || !rates.length || end<rates[0].dateJalali) return null;
  const start=periodStart(end,months);
  const opening=rates.findLast(row=>row.dateJalali<=start) ?? rates.find(row=>row.dateJalali>=start && row.dateJalali<=end);
  const closing=rates.findLast(row=>row.dateJalali<=end && row.dateJalali>=start);
  return opening && closing ? (opening.rateIrr+closing.rateIrr)/2 : null;
}

export const inMillionsUsd = (tomanBillions:number|null, rate:number|null) =>
  tomanBillions === null || rate === null ? null : tomanBillions * 10_000 / rate;

function validSeries<T extends 'rateIrr'|'closeIrr'>(input:unknown,key:T) {
  if(!Array.isArray(input)) return [];
  return input.flatMap(row=>{
    const date = typeof row?.dateJalali === 'string' ? jalaliKey(row.dateJalali) : '';
    return date && typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] > 0
      ? [{dateJalali:date,[key]:row[key],...(typeof row.carriedFromJalali==='string'?{carriedFromJalali:row.carriedFromJalali}:{})} as {dateJalali:string}&Record<T,number>] : [];
  }).sort((a,b)=>a.dateJalali.localeCompare(b.dateJalali));
}

type SupplementalData = {rates:Rate[]; prices:PriceHistory; eps:Record<string,number>; insights:Insights};
const empty:SupplementalData={rates:[],prices:{},eps:{},insights:{}};

export function useSupplementalData() {
  const [data,setData]=useState(empty);
  useEffect(()=>{
    const controller=new AbortController();
    async function read(filename:string):Promise<unknown>{
      try {
        const result=await fetch(import.meta.env.BASE_URL+'data/'+filename,{signal:controller.signal});
        return result.ok ? await result.json() : null;
      } catch {return null;}
    }
    void Promise.all([read('usd_history.json'),read('tsetmc_history.json'),read('analyst_insights.json')])
      .then(([rates,prices,insights])=>{
        if(controller.signal.aborted)return;
        const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
        setData({
          rates:validSeries(record(rates).observations,'rateIrr').filter(row=>row.dateJalali>='1399/01/01'),
          prices:Object.fromEntries(Object.entries(record(record(prices).instruments)).map(([id,rows])=>[id,validSeries(rows,'closeIrr')])),
          eps:Object.fromEntries(Object.entries(record(record(prices).epsIrrByRevisionId)).filter((entry): entry is [string,number]=>typeof entry[1]==='number' && Number.isFinite(entry[1]))),
          insights:Object.fromEntries(Object.entries(record(record(insights).issuers)).map(([issuer,entries])=>
            [issuer,Object.fromEntries(Object.entries(record(entries)).map(([id,entry])=>[id,Object.fromEntries(
              Object.entries(record(entry)).filter(([key,value])=>['transactionIrr','estimatedNetProfitEffectIrr'].includes(key)
                ? value===null || (typeof value==='number' && Number.isFinite(value)) : typeof value==='string')
            )]))])),
        });
      });
    return ()=>controller.abort();
  },[]);
  return data;
}
