import { useEffect, useState } from 'react';


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

export function CompanyHeader({ ticker, name, industry, imageUrl, latestPeriod }: {
  ticker: string; name: string; industry: string; imageUrl?: string; latestPeriod?: string;
}) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(imageUrl && !failed);
  return <header className="company-profile">
    {hasImage ? (
      <img className="company-profile-image" src={imageUrl} alt={`تصویر معرفی ${name}`} onError={() => setFailed(true)} />
    ) : (
      <div className="company-profile-fallback">
        <small>{industry}</small>
        <h1>{ticker}</h1>
        <p>{name}</p>
      </div>
    )}
    {latestPeriod && <span className="company-profile-report">آخرین گزارش: {latestPeriod}</span>}
  </header>;
}

export function ChartGradients() {
  return <defs>{['f59e0b','6366f1','10b981','ef4444','3b82f6','06b6d4','f43f5e'].map(color =>
    <linearGradient key={color} id={'series-' + color} x2="0" y2="1">
      <stop stopColor={'#' + color}/><stop offset="1" stopColor={'#' + color} stopOpacity=".55"/>
    </linearGradient>)}</defs>;
}
