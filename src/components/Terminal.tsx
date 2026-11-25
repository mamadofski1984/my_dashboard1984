import { useEffect, useState } from 'react';

const numbers = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 });
export const compactNumber = (value: number) => compact.format(value);

function validTheme(value: string | null) {
  return value === 'emerald' || value === 'light' ? value : 'dark';
}

export function useTerminalTheme() {
  const [theme, update] = useState(() => {
    try { return validTheme(localStorage.getItem('terminal.theme')); }
    catch { return 'dark'; }
  });
  useEffect(() => {
    try { localStorage.setItem('terminal.theme', theme); } catch { /* Storage may be disabled. */ }
  }, [theme]);
  return { theme, setTheme: (value: string) => update(validTheme(value)), darkMode: theme !== 'light' };
}

export function CompanyHeader({ ticker, name, industry, price, imageUrl }: {
  ticker: string; name: string; industry: string; price?: number | string | null; imageUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  return <header className="company-profile">
    <div><small>{industry}</small><h1>{ticker}</h1><p>{name}</p></div>
    <div><small>قیمت پایانی · ریال</small><strong dir="ltr">{price != null && price !== '' && Number.isFinite(Number(price)) ? numbers.format(Number(price)) : '—'}</strong></div>
    {imageUrl && !failed && <img src={imageUrl} alt="" onError={() => setFailed(true)} />}
  </header>;
}

export function ChartGradients() {
  return <defs>{['f59e0b','6366f1','10b981','ef4444','3b82f6','06b6d4','f43f5e'].map(color =>
    <linearGradient key={color} id={'series-' + color} x2="0" y2="1">
      <stop stopColor={'#' + color}/><stop offset="1" stopColor={'#' + color} stopOpacity=".55"/>
    </linearGradient>)}</defs>;
}
