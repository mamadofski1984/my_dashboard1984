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
  return <header className="company-profile">
    {imageUrl && !failed && <div className="company-profile-art">
      <img src={imageUrl} alt="" onError={() => setFailed(true)} />
    </div>}
    <div className="company-profile-copy">
      <small>{industry}</small><h1>{ticker}</h1><p>{name}</p>
      <div className="company-profile-badges">
        <span>صورت‌های مالی شرکت اصلی</span>
        {latestPeriod && <span>آخرین گزارش: {latestPeriod}</span>}
      </div>
    </div>
  </header>;
}

export function ChartGradients() {
  return <defs>{['f59e0b','6366f1','10b981','ef4444','3b82f6','06b6d4','f43f5e'].map(color =>
    <linearGradient key={color} id={'series-' + color} x2="0" y2="1">
      <stop stopColor={'#' + color}/><stop offset="1" stopColor={'#' + color} stopOpacity=".55"/>
    </linearGradient>)}</defs>;
}
