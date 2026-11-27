import { readFileSync, writeFileSync } from 'node:fs';

const source = 'https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl';
const file = process.argv[2];
const raw = file ? JSON.parse(readFileSync(file, 'utf8')) :
  await fetch(source).then(response => {
    if (!response.ok) throw new Error('TGJU HTTP ' + response.status);
    return response.json();
  });
const start = '1399/01/01';
const formatter = new Intl.DateTimeFormat('en-u-ca-persian', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});
const jalali = date => {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return [parts.year, parts.month, parts.day].join('/');
};
const today = jalali(new Date());
const quotes = new Map();
for (const row of raw.data) {
  const [,,,close,,,gregorian,dateJalali] = row;
  const rateIrr = Number(close.replaceAll(',', ''));
  const date = new Date(gregorian.replaceAll('/', '-')+'T12:00:00Z');
  if (Number.isFinite(rateIrr) && rateIrr>0 && Number.isFinite(date.getTime()) && jalali(date)===dateJalali && dateJalali<=today) {
    quotes.set(dateJalali, {dateJalali,rateIrr});
  }
}
const ordered = [...quotes.values()].sort((a,b)=>a.dateJalali.localeCompare(b.dateJalali));
const observations = ordered.filter(row=>row.dateJalali>=start);
if (observations.length<1000) throw new Error('USD history is incomplete');
const previous = ordered.findLast(row=>row.dateJalali<start);
if (observations[0].dateJalali>start && previous) observations.unshift({
  dateJalali:start, rateIrr:previous.rateIrr, carriedFromJalali:previous.dateJalali,
});
const result = {source, market:'USD/IRR free market', fallbackSpotIrr:2900000, observations};
writeFileSync(new URL('../public/data/usd_history.json',import.meta.url), JSON.stringify(result)+'\n');
console.log(observations.length,observations[0],observations.at(-1));
