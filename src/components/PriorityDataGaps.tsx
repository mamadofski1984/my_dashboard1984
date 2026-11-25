import { useState } from 'react';
import type { SymbolDetailData } from '../types/marketContract';

export type Corrections = Record<string, Record<string, string>>;

const annualFields = [
  ['REVENUE', 'درآمد عملیاتی'], ['NET_PROFIT', 'سود خالص'],
  ['OPERATING_PROFIT', 'سود عملیاتی'], ['COST_OF_REVENUE', 'بهای تمام‌شده'],
  ['OPERATING_CASH_FLOW', 'جریان نقد عملیاتی'], ['TOTAL_EQUITY', 'حقوق مالکانه'],
  ['TOTAL_LIABILITIES', 'بدهی‌ها'], ['TOTAL_ASSETS', 'دارایی‌ها'],
];

function gaps(detail: SymbolDetailData) {
  return [
    ...(detail.periodCoverageNotes ?? []).map(note => ({
      key: String(note.fiscalYear), label: 'صورت مالی سالانه', reason: note.reason, fields: annualFields,
    })),
    ...(detail.missingMonthlyPeriods ?? []).map(period => ({
      key: period, label: 'فروش ماهانه', reason: 'گزارش پیدا شده، اما مبلغ فروش تأیید نشده است.',
      fields: [['REVENUE', 'فروش ماهانه']],
    })),
  ];
}

export function applyCorrections(detail: SymbolDetailData | null, corrections: Corrections) {
  if (!detail) return null;
  const statements = [...detail.statements];
  const monthlySales = [...detail.monthlySales];
  for (const { key, fields } of gaps(detail)) {
    const values = corrections[key];
    if (!values) continue;
    if (key.includes('/')) {
      if (monthlySales.some(row => row.periodJalali === key && row.revenueIrr !== null)) continue;
      monthlySales.push({ periodJalali: key, revenueIrr: values.REVENUE, sourceId: 'LOCAL', productId: null, market: 'total' });
    } else {
      const fiscalYear = Number(key);
      if (statements.some(row => row.fiscalYear === fiscalYear && row.periodMonths === 12 && row.consolidationScope === 'standalone' && !row.isSuperseded && !row.isFixture)) continue;
      statements.push({
        fiscalYear, periodMonths: 12, consolidationScope: 'standalone', sourceId: 'LOCAL',
        revisionId: 'LOCAL_' + key, isFixture: false, periodEndJalali: null,
        isAudited: null, restatedFromRevisionId: null, ratios: [],
        facts: fields.flatMap(([code]) => values[code] === undefined ? [] : [{ code, value: values[code], unit: 'IRR' }]),
      });
    }
  }
  return { ...detail, statements, monthlySales };
}

export function PriorityDataGaps({ detail, corrections, onSave, cardStyle }: {
  detail: SymbolDetailData;
  corrections: Corrections;
  onSave: (key: string, values?: Record<string, string>) => void;
  cardStyle: string;
}) {
  const [error, setError] = useState('');
  const items = gaps(detail);
  if (!items.length) return null;
  return <section className={`max-w-7xl mx-auto mt-4 p-4 rounded-xl border border-amber-500/60 ${cardStyle}`}>
    <h2 className="font-bold">اولویت رفع کسری داده</h2>
    <p className="text-sm">فایل معتبر گزارش را دریافت کنید یا ارقام را به‌صورت محلی وارد کنید.</p>
    {items.map(({ key, label, reason, fields }) => <details key={key} className="mt-2">
      <summary className="cursor-pointer">{label} {key} {corrections[key] && '— ثبت دستی محلی'}</summary>
      <p className="text-sm">{reason}</p>
      <form className="my-2 flex flex-wrap gap-2 items-end" onSubmit={event => {
        event.preventDefault();
        const values = Object.fromEntries([...new FormData(event.currentTarget)].flatMap(([code, raw]) => {
          const value = String(raw).trim().replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) % 16))
            .replace(/[,٬]/g, '').replace(/^([+-]?)0+(?=\d)/, '$1').replace(/^\+/, '');
          return value ? [[code, value]] : [];
        }));
        if (!Object.keys(values).length || Object.values(values).some(value => !/^-?\d+$/.test(value) || !Number.isFinite(Number(value)))) {
          setError('حداقل یک مبلغ صحیح به ریال وارد کنید.');
          return;
        }
        try {
          onSave(key, values);
          setError('');
        } catch {
          setError('ذخیره در مرورگر انجام نشد.');
        }
      }}>
        {fields.map(([code, title]) => <label key={code} className="text-xs grid gap-1">{title} (ریال)
          <input name={code} defaultValue={corrections[key]?.[code]} dir="ltr" className="border rounded px-2 py-1 bg-transparent" />
        </label>)}
        <button className="border rounded px-2 py-1" type="submit">ذخیره محلی</button>
        {corrections[key] && <button className="border rounded px-2 py-1" type="button" onClick={event => {
          try {
            onSave(key);
            event.currentTarget.form?.querySelectorAll('input').forEach(input => { input.value = ''; });
            setError('');
          } catch {
            setError('حذف از حافظه مرورگر انجام نشد.');
          }
        }}>حذف مقدار محلی</button>}
      </form>
    </details>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
