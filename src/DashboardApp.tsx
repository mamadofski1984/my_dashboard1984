import CompanyFinancialShowcase from './components/CompanyFinancialShowcase';
import { PriorityDataGaps, applyCorrections, type Corrections } from './components/PriorityDataGaps';
import { marketRepository } from './repositories/MarketDataRepository';
import type { ManifestData, MasterIndexData, SymbolDetailData } from './types/marketContract';
import { runIdempotentLegacyMigration, readUserStorage } from './utils/legacyStorageMigration';
import { fiscalScope, type AnnualScope, formatRatioBadge, instrumentProfile, mapContractDetail, normalizeMarketSearch, parseDecimalSafe } from './utils/contractViewMapper';
import { createMarketBackup, prepareMarketRestore, restoreMarketBackup } from './utils/marketBackup';
import { calculateRatios } from './utils/financialRatios';
import {CompanyHeader,useTerminalTheme,ChartGradients,compactNumber} from './components/Terminal';
import React, { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart
} from 'recharts';
import {
  Building2, TrendingUp, Activity, Target,
  BarChart as BarChartIcon, Percent, Layers, Calculator,
  DollarSign, RefreshCw, Download, LayoutDashboard,
  Menu, X, BookOpen, Upload, FolderUp, BellRing, Sparkles, Scale, Briefcase, Database,
  Search, Factory
} from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';
import { PERSIAN_MONTHS, normalizeDigits } from './utils/persianFormat';

const ForecastTab = lazy(() => import('./components/ForecastTab').then(module => ({ default: module.ForecastTab })));
const MarketFixtures = lazy(() => import('./components/MarketFixtures').then(module => ({ default: module.MarketFixtures })));

function selectedInstrumentFromUrl() {
  const { hash, search } = window.location;
  if (/^#\/symbols(?:\/|$)/.test(hash)) {
    return /^#\/symbols\/((?:INS|ISS)_[A-Z0-9_-]+)$/.exec(hash.split("?")[0])?.[1] ?? null;
  }
  return new URLSearchParams(search).get('instrument');
}

function instrumentUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete('instrument');
  url.hash = '/symbols/' + id + (url.hash.includes('?') ? '?' + url.hash.split('?')[1] : '');
  return url;
}

function auditLabel(isAudited: boolean | null) {
  return isAudited === true ? 'حسابرسی‌شده' : isAudited === false ? 'حسابرسی‌نشده' : 'وضعیت حسابرسی نامشخص';
}

const toPersianDigits = (str: string) => {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/\d/g, (d) => persianDigits[Number(d)]);
};

const chartNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });
const formatChartNumber = (value: number) => chartNumber.format(value);

function FinancialPeriodTick({ x = 0, y = 0, payload, fill }: {
  x?: number; y?: number; payload?: { value: string }; fill: string;
}) {
  const [year, interim] = (payload?.value ?? '').split(' (');
  const [duration, audit] = (interim ?? '').replace(/\)$/, '').split('، ');
  return <text x={x} y={y + 12} textAnchor="middle" fill={fill} fontSize={10}>
    <tspan x={x}>{year}</tspan>
    {duration && <tspan x={x} dy="13">{duration}</tspan>}
    {audit && <tspan x={x} dy="13" fontSize={8}>{audit}</tspan>}
  </text>;
}

const CustomTooltip = ({ active, payload, label, unit = '', darkMode = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={`${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'} border p-3 rounded-lg shadow-lg rtl text-right`}>
        <p className="font-bold mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm my-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{entry.name}:</span>
            </div>
            <span className="font-bold" dir="ltr">
              {typeof entry.value === 'number' ? formatChartNumber(entry.value) : entry.value ?? '—'} {typeof entry.value === 'number' && unit}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

type DashboardPage = 'overview' | 'fundamental' | 'interpretive' | 'disclosures' | 'valuation' | 'forecast' | 'fixtures';

function pageFromUrl(): DashboardPage {
  const tab = new URLSearchParams(location.hash.split('?')[1]).get('tab');
  switch (tab) {
    case 'fundamental': case 'interpretive': case 'disclosures': case 'valuation': case 'forecast': return tab;
    default: return 'overview';
  }
}

export default function DashboardApp() {
  const [release, setRelease] = useState<{ manifest: ManifestData; index: MasterIndexData }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(selectedInstrumentFromUrl);
  const [page, setPage] = useState<DashboardPage>(pageFromUrl);
  const [restoreVersion, setRestoreVersion] = useState(0);
  useEffect(runIdempotentLegacyMigration, []);
  useEffect(() => {
    const onRoute = () => {
      setSelected(selectedInstrumentFromUrl());
      setPage(pageFromUrl());
    };
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    marketRepository.getManifest(signal).then(async manifest => {
      const index = await marketRepository.getMasterIndex(manifest, signal);
      if (!signal.aborted) setRelease({ manifest, index });
    }).catch(() => { if (!signal.aborted) setError('بارگذاری فهرست داده‌ها ناموفق بود.'); });
    return () => controller.abort();
  }, [attempt]);
  const instruments = release?.index.instruments;
  const instrument = instruments?.find(item => item.instrumentId === selected || item.issuerId === selected)
    ?? instruments?.find(item => item.isPrimaryInstrument)
    ?? instruments?.[0];

  useEffect(() => {
    if (!instrument?.instrumentId) return;
    // A hash change can arrive before React commits the matching selection.
    if (selectedInstrumentFromUrl() !== selected) return;
    const id = instrument.instrumentId;
    const url = instrumentUrl(id);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
    if (id !== selected) setSelected(id);
  }, [instrument, selected]);
  const requestKey = release && instrument ? release.manifest.releaseId + ':' + instrument.instrumentId : null;
  const requestIdentity = useRef(requestKey);
  useEffect(() => { requestIdentity.current = requestKey; }, [requestKey]);
  const [result, setResult] = useState<{ key: string; detail: SymbolDetailData | null; failed: boolean }>();
  useEffect(() => {
    if (!release || !instrument || !requestKey) return;
    const controller = new AbortController();
    const commit = (detail: SymbolDetailData | null, failed: boolean) => {
      if (!controller.signal.aborted && requestIdentity.current === requestKey) setResult({ key: requestKey, detail, failed });
    };
    marketRepository.getSymbolDetail(release.manifest, instrument, controller.signal)
      .then(detail => commit(detail, false)).catch(() => commit(null, true));
    return () => controller.abort();
  }, [release, instrument, requestKey, attempt]);
  if (!release || !instrument) return <main dir="rtl" className="p-6" role={error ? 'alert' : 'status'}>
    {error || 'در حال بارگذاری فهرست نمادها…'}
    {error && <button className="mx-4 underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>تلاش دوباره</button>}
  </main>;
  const active = result?.key === requestKey ? result : undefined;
  return <Dashboard key={requestKey + ':' + new URLSearchParams(location.hash.split('?')[1]).get('view') + (active ? ':ready' : ':loading') + ':' + restoreVersion}
    release={release} selectedSymbol={instrument.instrumentId} detail={active?.detail ?? null}
    status={active?.failed ? 'بارگذاری پرونده ناشر ناموفق بود' : !active ? 'در حال بارگذاری پرونده ناشر…' : active.detail ? 'پرونده ناشر آماده است' : 'پرونده مالی موجود نیست'}
    mainPage={page} setMainPage={setPage} onRestore={() => setRestoreVersion(value => value + 1)} refresh={() => setAttempt(value => value + 1)}
    selectInstrument={id => {
      const url = instrumentUrl(id);
      if (url.href !== location.href) history.pushState(history.state, '', url);
      requestIdentity.current = release.manifest.releaseId + ':' + id;
      setSelected(id);
    }} />;
}

function Dashboard({ release, selectedSymbol, detail: publishedDetail, status, mainPage, setMainPage, refresh, selectInstrument, onRestore }: {
  release: { manifest: ManifestData; index: MasterIndexData };
  selectedSymbol: string;
  detail: SymbolDetailData | null;
  status: string;
  mainPage: DashboardPage;
  setMainPage: (page: DashboardPage) => void;
  refresh: () => void;
  onRestore: () => void;
  selectInstrument: (id: string) => void;
}) {
  const instruments = release.index.instruments;
  const sectors = release.index.sectors;
  const instrument = instruments.find(item => item.instrumentId === selectedSymbol)!;
  const profiles = instruments.map(item => instrumentProfile(item, sectors.find(sector => sector.id === item.sectorId)?.nameFa ?? '—'));
  const activeConfig = profiles.find(item => item.key === selectedSymbol)!;
  const correctionsKey = instrument.issuerId + '_priority_corrections_v1';
  const [corrections, setCorrections] = useState<Corrections>(() => readUserStorage(correctionsKey) ?? {});
  const detail = useMemo(() => applyCorrections(publishedDetail, corrections), [publishedDetail, corrections]);
  const saveCorrection = (key: string, values?: Record<string, string>) => {
    const updated = { ...corrections };
    if (values) updated[key] = values;
    else delete updated[key];
    localStorage.setItem(correctionsKey, JSON.stringify(updated));
    setCorrections(updated);
  };
  const view = useMemo(() => mapContractDetail(detail), [detail]);
  const [annualScope, setAnnualScope] = useState<AnnualScope | 'separate'>('separate');
  const publishedCharts = useMemo(() => view.coveredScopes
    .map(scope => {
      const mapped = mapContractDetail(detail, scope);
      return { scope, data: mapped.fundStore, timeline: mapped.financialTimeline };
    }), [detail, view.coveredScopes]);
  const indexOnly = instrument.coverageState === 'index_only';
  const hasPublishedMonthly = detail?.monthlySales.some(row => row.revenueIrr !== null) ?? false;
  const isHolding = detail?.sectorTemplate === 'holding';
  const scopedCharts = annualScope === 'separate' ? publishedCharts : publishedCharts.filter(chart => chart.scope === annualScope);
  const efficiencyLabel = detail?.sectorTemplate === 'banking'
    ? 'نسبت هزینه عملیاتی بانک به درآمد عملیاتی' : 'نسبت بهای تمام‌شده به درآمد';
  const snapshot = instrument.snapshot;
  const liveData = useMemo(() => ({
    pc: parseDecimalSafe(snapshot?.closePrice), mv: parseDecimalSafe(snapshot?.marketCapIrr),
    pe: parseDecimalSafe(snapshot?.peTtm), pb: parseDecimalSafe(snapshot?.pb),
    eps: null, z: null, pcp: null, pmin_1y: null, pmax_1y: null,
    m_board: instrument.venue ?? '—',
  }), [snapshot, instrument.venue]);
  const INTERPRETIVE_NOTES_KEY = instrument.issuerId + '_user_notes_v2';
  const FUNDAMENTAL_DYNAMIC_KEY = instrument.issuerId + '_user_overrides_v2';
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [selectedIndustryFilter, setSelectedIndustryFilter] = useState('همه گروه‌های صنعتی');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const {theme,setTheme,darkMode} = useTerminalTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const codalList = view.codalAnnouncements;
  const liveDisclosures = view.disclosuresList;
  const [localStatus, setCodalStatus] = useState<{ type: string; text: string }>();

  const [codalSearch, setCodalSearch] = useState<string>('');
  const [codalYearFilter, setCodalYearFilter] = useState<string>('all');
  const [codalPage, setCodalPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 15;

  const [disclosureGroupFilter, setDisclosureGroupFilter] = useState<'all' | 'الف' | 'ب'>('all');
  const [valInputs, setValInputs] = useState(activeConfig.defaultValInputs);

  const [localFundStore, setLocalFundStore] = useState<any>(() => readUserStorage(FUNDAMENTAL_DYNAMIC_KEY));
  const fundStore = localFundStore ?? view.fundStore;
  const [excelParsePreview, setExcelParsePreview] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonRestoreInputRef = useRef<HTMLInputElement | null>(null);

  const [interpretiveList, setInterpretiveList] = useState<any[]>(() => {
    const stored = readUserStorage<any[]>(INTERPRETIVE_NOTES_KEY);
    if (!Array.isArray(stored)) return view.interpretiveList;
    const matched = new Set<unknown>();
    const published = view.interpretiveList.map(report => {
      const notes = stored.find(item => item?.id ? item.id === report.id : item?.publishDate && item.publishDate === report.publishDate);
      if (!notes) return report;
      matched.add(notes);
      return { ...report, highlights: [...new Set([...report.highlights, ...(Array.isArray(notes.highlights) ? notes.highlights : [])])] };
    });
    return [...published, ...stored.filter(item => item && !matched.has(item) && Array.isArray(item.highlights))];
  });
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<number>(0);
  const [newNoteText, setNewNoteText] = useState<string>('');

  const [fx1405, setFx1405] = useState<number>(135000);
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('view') === 'monthly' ? 'monthly_income' : 'annual_income');
  const [currency] = useState('IRT');
  const [customUsdRate] = useState(65000);

  const normalizedQuery = normalizeMarketSearch(symbolSearchQuery);
  const filteredSymbolsList = profiles.filter(profile =>
    (selectedIndustryFilter === 'همه گروه‌های صنعتی' || profile.tseIndustryGroup === selectedIndustryFilter)
    && (!normalizedQuery || profile.searchKey.includes(normalizedQuery)));

  useEffect(() => { setCodalPage(1); }, [codalSearch, codalYearFilter]);

  const handleRestoreJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload: unknown = JSON.parse(await file.text());
      if (!mounted.current) return;
      const writes = prepareMarketRestore(payload, instruments.map(item => item.issuerId), instrument.issuerId);
      if (writes.size === 0) {
        setCodalStatus({ type: 'info', text: 'یادداشت یا ویرایشی در فایل پشتیبان وجود ندارد.' });
        return;
      }
      const overwrite = [...writes].some(([key, value]) => {
        const stored = localStorage.getItem(key);
        return stored !== null && stored !== value;
      });
      if (overwrite && !window.confirm('یادداشت‌ها یا ویرایش‌های موجود برای ناشران این فایل جایگزین شوند؟')) return;
      restoreMarketBackup(writes);
      onRestore();
      alert('یادداشت‌ها و ویرایش‌های فایل پشتیبان بازیابی شدند.');
    } catch (error) {
      if (mounted.current) setCodalStatus({ type: 'error', text: error instanceof Error ? error.message : 'بازیابی فایل پشتیبان ناموفق بود.' });
    }
  };

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let parseCodalExcelBuffer: typeof import('./utils/excelParser').parseCodalExcelBuffer;
    try {
      ({ parseCodalExcelBuffer } = await import('./utils/excelParser'));
    } catch {
      if (mounted.current) setCodalStatus({ type: 'error', text: 'بارگذاری ابزار خواندن اکسل ناموفق بود.' });
      return;
    }
    if (!mounted.current) return;

    if (files.length === 1) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
      if (!mounted.current) return;
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          const parsed = parseCodalExcelBuffer(buffer, file.name, fundStore);
          setExcelParsePreview(parsed);
        } catch (err) {
          console.error(err);
          alert('خطا در پردازش فایل اکسل.');
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
      return;
    }

    const batchUpdates: Record<string, number> = {};
    const processedSummary: string[] = [];

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
      if (!mounted.current) return;
        const parsed = parseCodalExcelBuffer(buffer, file.name, fundStore);
        if (parsed.reportType === 'monthly_n30' && parsed.targetMonth && parsed.monthlySales && parsed.monthlySales > 0) {
          batchUpdates[parsed.targetMonth] = parsed.monthlySales;
          processedSummary.push(`${parsed.targetMonth}: ${parsed.monthlySales}`);
        }
      } catch {
        // ignore
      }
    }

    if (Object.keys(batchUpdates).length > 0) {
      const updatedStore = {
        ...fundStore,
        lastExcelFileName: `بارگذاری گروهی (${processedSummary.length} فایل ماهانه)`,
        lastExcelUploadDate: new Date().toLocaleDateString('fa-IR'),
        incomeData: fundStore.incomeData.map((row: any) =>
          batchUpdates[row.month] !== undefined ? { ...row, year1405: batchUpdates[row.month] } : row
        )
      };
      setLocalFundStore(updatedStore);
      localStorage.setItem(FUNDAMENTAL_DYNAMIC_KEY, JSON.stringify(updatedStore));
      setCodalStatus({
        type: 'success',
        text: `پردازش گروهی انجام شد: ${processedSummary.join(' | ')} میلیارد تومان`
      });
    } else {
      alert('هیچ گزارش فعالیت ماهانه معتبری در فایل‌های انتخاب‌شده شناسایی نشد.');
    }
    e.target.value = '';
  };

  const handleApplyExcelToDashboard = () => {
    if (!excelParsePreview) return;

    if (excelParsePreview.reportType === 'monthly_n30') {
      const { targetMonth, monthlySales, fileName } = excelParsePreview;
      const updatedStore = {
        ...fundStore,
        lastExcelFileName: `${fileName} (${targetMonth})`,
        lastExcelUploadDate: new Date().toLocaleDateString('fa-IR'),
        incomeData: fundStore.incomeData.map((row: any) =>
          row.month === targetMonth ? { ...row, year1405: Number(monthlySales) } : row
        )
      };
      setLocalFundStore(updatedStore);
      localStorage.setItem(FUNDAMENTAL_DYNAMIC_KEY, JSON.stringify(updatedStore));
      setExcelParsePreview(null);
      return;
    }

    const { revenue, adminCost, opProfit, netProfit, ocf, equity, liabilities, assets, fileName } = excelParsePreview;
    const ratios = calculateRatios({
      revenue, operating_profit: opProfit, net_profit: netProfit, total_equity: equity,
      total_assets: assets, total_liabilities: liabilities, operating_cash_flow: ocf
    }, {}, activeConfig.tseIndustryGroup);
    const { opMargin: calcOpMargin, netMargin: calcNetMargin, roe: calcROE, efficiency: calcEfficiency } = ratios;

    const updatedStore = {
      ...fundStore,
      lastExcelFileName: fileName,
      lastExcelUploadDate: new Date().toLocaleDateString('fa-IR'),
      annualIncomeData: fundStore.annualIncomeData.map((r: any) => (r.year === '۱۴۰۵' ? { ...r, value: revenue, netProfit } : r)),
      opMarginData: fundStore.opMarginData.map((r: any) => (r.year === '۱۴۰۵' ? { ...r, value: calcOpMargin } : r)),
      netMarginData: fundStore.netMarginData.map((r: any) => (r.year === '۱۴۰۵' ? { ...r, value: calcNetMargin } : r)),
      roeData: fundStore.roeData.map((r: any) => (r.year === '۱۴۰۵' ? { ...r, value: calcROE } : r)),
      efficiencyData: fundStore.efficiencyData.map((r: any) => (r.year === '۱۴۰۵' ? { ...r, value: calcEfficiency } : r)),
      cashFlowData: fundStore.cashFlowData.map((r: any) => (r.year === '۱۴۰۵' ? { ...r, value: ocf } : r)),
      balanceSheetData: fundStore.balanceSheetData.map((r: any) => (r.year === '۱۴۰۴' ? { ...r, liabilities, equity } : r)),
      interimReport: { ...fundStore.interimReport, revenue, adminCost, opProfit, opMargin: calcOpMargin, netProfit, netMargin: calcNetMargin },
      ratiosDef: fundStore.ratiosDef.map((r: any) => {
        if (r.id in ratios) return { ...r, current: ratios[r.id as keyof typeof ratios] };
        return r;
      })
    };
    setLocalFundStore(updatedStore);
    localStorage.setItem(FUNDAMENTAL_DYNAMIC_KEY, JSON.stringify(updatedStore));
    setExcelParsePreview(null);
  };

  const handleResetFundamentalStore = () => {
    setLocalFundStore(undefined);
    localStorage.removeItem(FUNDAMENTAL_DYNAMIC_KEY);
    setExcelParsePreview(null);
  };

  const handleAddInterpretiveHighlight = () => {
    if (!newNoteText.trim()) return;
    const up = interpretiveList.map((it, idx) => idx === selectedPeriodIdx ? { ...it, highlights: [...it.highlights, newNoteText.trim()] } : it);
    setInterpretiveList(up);
    localStorage.setItem(INTERPRETIVE_NOTES_KEY, JSON.stringify(up));
    setNewNoteText('');
  };

  const liveMetrics = useMemo(() => {
    const marketCapToman = liveData.mv === null ? null : liveData.mv / 10 / 1e9;
    const marketCapUSD = marketCapToman === null ? null : marketCapToman * 1e3 / fx1405;
    return { marketCapToman, marketCapUSD, livePB: liveData.pb,
      registeredCapitalTomanBillion: null, registeredCapitalHemmat: null };
  }, [liveData, fx1405]);

  const valuationResults = useMemo(() => {
    const shares = Math.max(valInputs.sharesCountBillion, 0.1);
    const wacc = Math.max(valInputs.wacc / 100, 0.05);
    const ke = Math.max(valInputs.costOfEquity / 100, 0.05);
    const g = Math.min(valInputs.terminalGrowth / 100, wacc - 0.02);
    const g5 = valInputs.fcfGrowth5Y / 100;

    let pvFcff5Y = 0;
    let lastFcff = valInputs.baseFCFF;
    for (let t = 1; t <= 5; t++) {
      lastFcff = lastFcff * (1 + g5);
      pvFcff5Y += lastFcff / Math.pow(1 + wacc, t);
    }
    const terminalFcff = (lastFcff * (1 + g)) / (wacc - g);
    const enterpriseValue = pvFcff5Y + terminalFcff / Math.pow(1 + wacc, 5);
    const priceFcff = ((enterpriseValue + valInputs.netCash) * 10) / shares;

    let pvFcfe5Y = 0;
    let lastFcfe = valInputs.baseFCFE;
    for (let t = 1; t <= 5; t++) {
      lastFcfe = lastFcfe * (1 + g5);
      pvFcfe5Y += lastFcfe / Math.pow(1 + ke, t);
    }
    const gEq = Math.min(valInputs.terminalGrowth / 100, ke - 0.02);
    const terminalFcfe = (lastFcfe * (1 + gEq)) / (ke - gEq);
    const priceFcfe = ((pvFcfe5Y + terminalFcfe / Math.pow(1 + ke, 5)) * 10) / shares;

    const gDiv = Math.min(valInputs.dividendGrowth / 100, ke - 0.02);
    const priceDdm = valInputs.nextDps / Math.max(ke - gDiv, 0.02);

    const priceRelPE = valInputs.forwardEps * valInputs.targetPE;
    const priceRelPB = valInputs.bookValuePerShare * valInputs.targetPB;

    const avgIntrinsicPrice = (priceFcff + priceFcfe + priceDdm + priceRelPE + priceRelPB) / 5;
    const currentPrice = liveData.pc;
    const upsidePercent = currentPrice !== null && currentPrice > 0 ? ((avgIntrinsicPrice - currentPrice) / currentPrice) * 100 : null;

    return { priceFcff, priceFcfe, priceDdm, priceRelPE, priceRelPB, avgIntrinsicPrice, upsidePercent };
  }, [valInputs, liveData.pc]);

  const filteredCodalList = useMemo(() => {
    return codalList.filter((item) => {
      const tNorm = normalizeDigits(String(item.title || ''));
      const dTitle = normalizeDigits(String(item.date_title || ''));
      const dPub = normalizeDigits(String(item.date_publish || ''));
      if (codalYearFilter !== 'all') {
        const yEn = normalizeDigits(codalYearFilter);
        if (!dTitle.includes(yEn) && !tNorm.includes(yEn) && !dPub.startsWith(yEn)) return false;
      }
      if (codalSearch.trim()) {
        const q = normalizeDigits(codalSearch.trim()).toLowerCase();
        if (!tNorm.toLowerCase().includes(q) && !normalizeDigits(String(item.code || '')).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [codalList, codalYearFilter, codalSearch]);

  const totalCodalPages = Math.max(1, Math.ceil(filteredCodalList.length / ITEMS_PER_PAGE));
  const paginatedCodalList = filteredCodalList.slice((codalPage - 1) * ITEMS_PER_PAGE, codalPage * ITEMS_PER_PAGE);

  const filteredDisclosures = useMemo(() => {
    const base = liveDisclosures || [];
    const list = disclosureGroupFilter === 'all' ? base : base.filter((d: any) => d.group === disclosureGroupFilter);
    return [...list].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
  }, [liveDisclosures, disclosureGroupFilter]);

  const handleExportJSON = () => {
    const payload = createMarketBackup(instruments.map(item => item.issuerId));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `market-dashboard-backup-${payload.exportedAt.slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getHistoricalUsdRate = (year: string, currentRate: number) => {
    const rates: Record<string, number> = { '۱۴۰۱': 37000, '۱۴۰۲': 54000, '۱۴۰۳': 70000, '۱۴۰۴': 112000 };
    return rates[year] || currentRate;
  };

  const annualIncomeForCurrency = (rows: typeof view.financialTimeline) => rows.map(item => {
    const rate = getHistoricalUsdRate(item.year, customUsdRate);
    return {
      ...item,
      usdValue: item.value == null ? null : Number(((item.value * 1000) / rate).toFixed(1)),
      usdNetProfit: item.netProfit == null ? null : Number(((item.netProfit * 1000) / rate).toFixed(1)),
    };
  });

  const historicalRatiosTable = (data: typeof view.fundStore) => [
    { name: 'حاشیه سود خالص', data: data.netMarginData, unit: '٪' },
    { name: 'حاشیه سود عملیاتی', data: data.opMarginData, unit: '٪' },
    { name: 'بازده حقوق مالکانه (ROE)', data: data.roeData, unit: '٪' },
    { name: efficiencyLabel, data: data.efficiencyData, unit: '٪' },
    { name: 'نسبت P/B', data: data.pbData, unit: ' مرتبه' },
  ];

  const chartTabs = [
    { id: 'annual_income', label: 'فروش و سود خالص', icon: DollarSign },
    { id: 'monthly_income', label: 'درآمد ماهانه', icon: BarChartIcon },
    { id: 'income_breakdown', label: 'ساختار سود و زیان', icon: Layers },
    { id: 'cash_flow', label: 'جریان نقد عملیاتی', icon: Activity },
    { id: 'balance_sheet', label: 'ترازنامه', icon: Building2 },
    { id: 'pb_ratio', label: 'P/B', icon: Activity },
    { id: 'net_margin', label: 'حاشیه سود خالص', icon: Percent },
    { id: 'op_margin', label: 'حاشیه سود عملیاتی', icon: Percent },
    { id: 'roe', label: 'ROE', icon: TrendingUp },
    { id: 'efficiency', label: efficiencyLabel, icon: Target }
  ];

  const avg1404Monthly = useMemo(() => {
    const valid = view.fundStore.incomeData.filter((d: any) => d.year1404 > 0);
    if (valid.length === 0) return 0;
    return Number((valid.reduce((s: number, d: any) => s + d.year1404, 0) / valid.length).toFixed(1));
  }, [view.fundStore.incomeData]);

  const valUnit = currency === 'IRT' ? 'میلیارد تومان' : 'میلیون دلار';

  const formatNum = (num: any, decimals = 0) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const bgPage = darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800';
  const bgSidebar = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const bgHeader = darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200';
  const cardStyle = darkMode ? 'bg-slate-900 border-slate-800 shadow-lg shadow-black/20' : 'bg-white border-slate-200 shadow-sm';
  const subCardStyle = darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-100';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';
  const textHeading = darkMode ? 'text-slate-100' : 'text-slate-900';
  const gridStroke = darkMode ? '#1e293b' : '#e2e8f0';
  const axisTickColor = darkMode ? '#94a3b8' : '#64748b';
  const tableHeaderBg = darkMode ? 'bg-slate-800/80 text-slate-300' : 'bg-slate-100 text-slate-600';
  const tableRowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50';
  const borderSubtle = darkMode ? 'border-slate-800' : 'border-slate-200';

  return (
    <div dir="rtl" data-theme={theme} className={`min-h-screen flex transition-colors duration-200 font-sans ${bgPage}`}>
      <svg width="0" height="0" aria-hidden="true" className="absolute"><ChartGradients /></svg>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple onChange={handleExcelFileUpload} className="hidden" />
      <input ref={jsonRestoreInputRef} type="file" accept=".json" onChange={handleRestoreJSON} className="hidden" />

      {mobileMenuOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

      {/* RIGHT SIDEBAR */}
      <aside className={`fixed lg:sticky top-0 right-0 h-screen w-76 shrink-0 border-l z-50 flex flex-col justify-between transition-transform duration-200 ${bgSidebar} ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="overflow-y-auto">
          <div className={`h-20 px-5 flex items-center justify-between border-b ${borderSubtle}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className={`font-bold text-sm block truncate ${textHeading}`}>
                  {activeConfig.ticker} ({activeConfig.fullName})
                </span>
                <span className="text-[11px] text-amber-500 font-semibold block truncate">
                  {activeConfig.tseIndustryGroup}
                </span>
              </div>
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-1.5 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
          </div>

          <div className={`p-4 border-b space-y-2.5 ${borderSubtle}`}>
            <div className="flex items-center justify-between">
              <p className={`text-[11px] font-bold ${textMuted}`}>جستجوی نماد / شرکت ({instruments.length} نماد):</p>
              <Factory className="w-3.5 h-3.5 text-amber-500" />
            </div>

            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute right-3 top-2.5 ${textMuted}`} />
              <input
                type="text"
                value={symbolSearchQuery}
                onChange={(e) => setSymbolSearchQuery(e.target.value)}
                placeholder="جستجوی نماد یا شرکت (مثلاً فولاد)…"
                className={`w-full pr-8 pl-2.5 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 ${subCardStyle}`}
              />
            </div>

            <select
              value={selectedIndustryFilter}
              onChange={(e) => setSelectedIndustryFilter(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-[11px] font-medium outline-none cursor-pointer ${subCardStyle}`}
            >
              {['همه گروه‌های صنعتی', ...sectors.map(sector => sector.nameFa)].map((grp) => (
                <option key={grp} value={grp} className={darkMode ? 'bg-slate-900' : 'bg-white'}>
                  {grp === 'همه گروه‌های صنعتی' ? 'صنعت TSE: همه صنایع' : grp}
                </option>
              ))}
            </select>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
              {filteredSymbolsList.map((sym) => {
                const isSelected = sym.key === selectedSymbol;
                return (
                  <button
                    key={sym.key}
                    onClick={() => selectInstrument(sym.key)}
                    className={`w-full text-right py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex flex-col gap-0.5 ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : `${subCardStyle} ${textHeading} hover:border-amber-500/40`
                    }`}
                  >
                    <span className="truncate">
                      {sym.ticker} ({sym.fullName})
                    </span>
                    <span className={`text-[10px] font-normal truncate ${isSelected ? 'text-amber-100' : textMuted}`}>
                      {sym.tseIndustryGroup}
                    </span>
                  </button>
                );
              })}

              {filteredSymbolsList.length === 0 && <p className="text-xs">نمادی پیدا نشد.</p>}
            </div>
          </div>

          <nav className="p-4 space-y-1.5">
            {[
              { id: 'overview', label: 'معرفی شرکت و اطلاعات پایه', icon: LayoutDashboard },
              { id: 'fundamental', label: 'داده‌های بنیادی و مالی', icon: BarChartIcon },
              { id: 'interpretive', label: 'خلاصه گزارشات تفسیری', icon: BookOpen },
              { id: 'disclosures', label: 'اطلاعات افشا شده شرکت', icon: BellRing },
              { id: 'valuation', label: 'ارزش‌گذاری جامع سهم', icon: Scale },
              { id: 'forecast', label: 'پیش‌بینی فروش و EPS', icon: Calculator },
              { id: 'fixtures', label: 'پیش‌نمایش داده آزمایشی', icon: Database }
            ].map((navItem) => {
              const Icon = navItem.icon;
              const active = mainPage === navItem.id;
              return (
                <button
                  key={navItem.id}
                  onClick={() => {
                    setMainPage(navItem.id as DashboardPage);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-semibold transition-all cursor-pointer ${
                    active ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : `${textMuted} hover:bg-slate-800/40`
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{navItem.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="px-4 mt-1">
            <div className={`p-3.5 rounded-2xl border ${subCardStyle} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${textMuted}`}>قیمت پایانی:</span>
                <span className={`text-sm font-bold ${textHeading}`} dir="ltr">{formatNum(liveData.pc)} ریال</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${textMuted}`}>سرمایه ثبت‌شده:</span>
                <span className="text-xs font-bold text-purple-400">
                  {formatNum(liveMetrics.registeredCapitalTomanBillion, 0)} م.ت ({formatNum(liveMetrics.registeredCapitalHemmat, 2)} همت)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${textMuted}`}>P/E (TTM):</span>
                <span className="text-xs font-bold text-amber-500" dir="ltr">{formatNum(liveData.pe, 2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 border-t space-y-2 ${borderSubtle}`}>
          <label className="flex justify-between items-center p-3">پوسته<select className="bg-transparent" value={theme} onChange={e => setTheme(e.target.value)}><option value="dark">تیره</option><option value="light">روشن</option><option value="emerald">زمردی</option></select></label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleExportJSON} className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${borderSubtle}`}>
              <Download className="w-4 h-4 text-emerald-500" /><span>بکاپ JSON</span>
            </button>
            <button onClick={() => jsonRestoreInputRef.current?.click()} className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${borderSubtle}`}>
              <FolderUp className="w-4 h-4 text-amber-500" /><span>بازیابی JSON</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`border-b backdrop-blur sticky top-0 z-20 ${bgHeader}`}>
          <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setMobileMenuOpen(true)} className={`lg:hidden p-2 rounded-xl border ${borderSubtle}`}><Menu className="w-5 h-5" /></button>
              <div className="min-w-0">
                <h1 className={`text-base md:text-xl font-bold truncate ${textHeading}`}>
                  {activeConfig.ticker} ({activeConfig.fullName})
                </h1>
                <p className={`text-xs mt-0.5 hidden sm:block truncate ${textMuted}`}>
                  گروه صنعت TSE: <span className="text-amber-500 font-semibold">{activeConfig.tseIndustryGroup}</span> | {liveData.m_board}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer" title="انتخاب همزمان یک یا چند فایل اکسل">
                <Upload className="w-3.5 h-3.5" /><span className="hidden md:inline">آپلود اکسل (تکی/گروهی)</span>
              </button>
              <a href="#/creative" className="rounded-xl border px-3 py-2 text-xs inline-flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> صفحهٔ خانه
              </a>
              <button onClick={refresh} className="rounded-xl border px-3 py-2 text-xs">
                <RefreshCw className="inline w-4 h-4" /> بررسی نسخه داده
              </button>
            </div>
          </div>
        </header>

        {/* Status Bar */}
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-4">
          <div className={`px-4 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${cardStyle}`}>
            <div className="flex flex-wrap items-center gap-4">
              <span>• {instrument.coverageState === 'full' ? 'پوشش کامل' : instrument.coverageState === 'partial' ? 'پوشش جزئی' : 'فقط فهرست'}</span>
              <span>• {localStatus?.text ?? status}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>دلار مبنا:</span>
              <input type="number" value={fx1405} onChange={(e) => setFx1405(Number(e.target.value) || 1)} className={`w-24 px-2 py-0.5 rounded border text-xs font-bold text-amber-500 ${subCardStyle}`} dir="ltr" />
            </div>
          </div>
        </div>

        {publishedDetail && <PriorityDataGaps detail={publishedDetail} corrections={corrections}
          onSave={saveCorrection} cardStyle={cardStyle} />}

        {/* EXCEL PARSE PREVIEW BANNER */}
        {excelParsePreview && (
          <div className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-4">
            <div className={`p-5 rounded-2xl border-2 border-emerald-500/60 shadow-xl ${cardStyle}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-emerald-400">
                    {excelParsePreview.reportType === 'monthly_n30'
                      ? `استخراج گزارش فعالیت ماهانه (ن-۳۰) ${activeConfig.ticker} (${activeConfig.fullName})`
                      : `استخراج صورت مالی (ن-۱۰) ${activeConfig.ticker} (${activeConfig.fullName})`}: {excelParsePreview.fileName}
                  </h3>
                  <p className={`text-xs mt-1 ${textMuted}`}>
                    {excelParsePreview.confidenceNote || 'اعداد به میلیارد تومان استخراج شدند؛ پس از بررسی، دکمه «اعمال در داشبورد» را بزنید.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleApplyExcelToDashboard} className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">
                    اعمال در داشبورد
                  </button>
                  <button onClick={() => setExcelParsePreview(null)} className={`px-3 py-1.5 rounded-xl border text-xs cursor-pointer ${borderSubtle}`}>
                    انصراف
                  </button>
                </div>
              </div>

              {excelParsePreview.reportType === 'monthly_n30' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg text-xs">
                    <div className={`p-3 rounded-xl border ${subCardStyle}`}>
                      <label className={`block mb-1 ${textMuted}`}>ماه گزارش</label>
                      <select
                        value={excelParsePreview.targetMonth}
                        onChange={(e) => setExcelParsePreview((p: any) => ({ ...p, targetMonth: e.target.value }))}
                        className={`w-full px-2.5 py-1.5 rounded border font-bold ${cardStyle}`}
                      >
                        {PERSIAN_MONTHS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className={`p-3 rounded-xl border border-emerald-500/40 ${subCardStyle}`}>
                      <label className="block mb-1 text-emerald-400 font-bold">جمع کل فروش خالص ماه (میلیارد تومان)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={excelParsePreview.monthlySales}
                        onChange={(e) => setExcelParsePreview((p: any) => ({ ...p, monthlySales: Number(e.target.value) }))}
                        className={`w-full px-2.5 py-1.5 rounded border font-black text-emerald-400 ${cardStyle}`}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {excelParsePreview.breakdown && (
                    <div className={`p-3.5 rounded-xl border text-xs ${subCardStyle}`}>
                      <span className="font-bold text-amber-500 block mb-2">
                        جزئیات استخراج‌شده از سطرهای اکسل (راستی‌آزمایی حسابداری):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div>
                          <span className={`block text-[11px] ${textMuted}`}>فروش داخلی:</span>
                          <span className="font-bold" dir="ltr">{formatNum(excelParsePreview.breakdown.domestic, 1)}</span>
                        </div>
                        <div>
                          <span className={`block text-[11px] ${textMuted}`}>فروش صادراتی:</span>
                          <span className="font-bold" dir="ltr">{formatNum(excelParsePreview.breakdown.exportSales, 1)}</span>
                        </div>
                        <div>
                          <span className={`block text-[11px] ${textMuted}`}>درآمد خدمات:</span>
                          <span className="font-bold" dir="ltr">{formatNum(excelParsePreview.breakdown.services, 1)}</span>
                        </div>
                        <div>
                          <span className={`block text-[11px] ${textMuted}`}>برگشت از فروش (-):</span>
                          <span className="font-bold text-rose-400" dir="ltr">{formatNum(excelParsePreview.breakdown.salesReturn, 1)}</span>
                        </div>
                        <div>
                          <span className={`block text-[11px] ${textMuted}`}>تخفیفات (-):</span>
                          <span className="font-bold text-rose-400" dir="ltr">{formatNum(excelParsePreview.breakdown.discounts, 1)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    { key: 'revenue', label: 'درآمد عملیاتی' },
                    { key: 'adminCost', label: 'هزینه عمومی/اداری' },
                    { key: 'opProfit', label: 'سود عملیاتی' },
                    { key: 'netProfit', label: 'سود خالص' },
                  ].map((f) => (
                    <div key={f.key} className={`p-2.5 rounded-xl border ${subCardStyle}`}>
                      <label className={`block mb-1 ${textMuted}`}>{f.label}</label>
                      <input
                        type="number"
                        step="0.1"
                        value={excelParsePreview[f.key]}
                        onChange={(e) => setExcelParsePreview((p: any) => ({ ...p, [f.key]: Number(e.target.value) }))}
                        className={`w-full px-2 py-1 rounded border font-bold text-amber-500 ${cardStyle}`}
                        dir="ltr"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {mainPage === 'fixtures' && <div className={`p-6 ${cardStyle}`}><Suspense fallback={<p role="status">در حال بارگذاری پیش‌نمایش…</p>}><MarketFixtures key={release.manifest.releaseId} manifest={release.manifest} /></Suspense></div>}
        {mainPage === 'overview' && (
          <ErrorBoundary sectionName="معرفی شرکت و اطلاعات پایه">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <CompanyHeader key={activeConfig.ticker} ticker={activeConfig.ticker} name={activeConfig.fullName} industry={activeConfig.tseIndustryGroup} latestPeriod={view.financialTimeline.filter(row => row.value !== null || row.netProfit !== null).at(-1)?.label} imageUrl={instrument.image ? marketRepository.resolveAssetUrl(instrument.image) : undefined} />
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`rounded-2xl p-5 border relative overflow-hidden ${cardStyle}`}>
                  <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500"></div>
                  <span className={`text-xs ${textMuted}`}>قیمت پایانی سهم (ریال)</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className={`text-2xl font-bold ${textHeading}`} dir="ltr">{formatNum(liveData.pc)}</span>
                    <span className="text-xs font-bold text-emerald-400" dir="ltr">{liveData.pcp ?? "—"}</span>
                  </div>
                  <p className={`text-xs mt-2 ${textMuted}`}>بازه سال: {formatNum(liveData.pmin_1y)} - {formatNum(liveData.pmax_1y)}</p>
                </div>

                <div className={`rounded-2xl p-5 border relative overflow-hidden ${cardStyle}`}>
                  <div className="absolute top-0 right-0 w-1 h-full bg-amber-500"></div>
                  <span className={`text-xs ${textMuted}`}>ارزش بازار (Market Cap)</span>
                  <div className="mt-2">
                    <span className={`text-2xl font-bold ${textHeading}`}>{formatNum(liveMetrics.marketCapToman, 0)}</span>
                    <span className={`text-xs mr-1.5 ${textMuted}`}>میلیارد تومان</span>
                  </div>
                  <p className={`text-xs mt-2 ${textMuted}`}>معادل ${formatNum(liveMetrics.marketCapUSD, 1)}M</p>
                </div>

                <div className={`rounded-2xl p-5 border relative overflow-hidden ${cardStyle}`}>
                  <div className="absolute top-0 right-0 w-1 h-full bg-blue-500"></div>
                  <span className={`text-xs ${textMuted}`}>نسبت‌های ارزش‌گذاری</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <div><span className={`text-xs ${textMuted}`}>P/E: </span><span className="text-xl font-bold">{formatNum(liveData.pe, 2)}</span></div>
                    <div><span className={`text-xs ${textMuted}`}>P/B: </span><span className="text-xl font-bold text-blue-400">{formatNum(liveMetrics.livePB, 2)}</span></div>
                  </div>
                  <p className={`text-xs mt-2 ${textMuted}`}>EPS: {formatNum(liveData.eps)} ریال</p>
                </div>

                <div className={`rounded-2xl p-5 border relative overflow-hidden ${cardStyle}`}>
                  <div className="absolute top-0 right-0 w-1 h-full bg-purple-500"></div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${textMuted}`}>سرمایه ثبت‌شده و تعداد سهام</span>
                    <Briefcase className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                    <div>
                      <span className={`text-2xl font-bold ${textHeading}`}>{formatNum(liveMetrics.registeredCapitalTomanBillion, 0)}</span>
                      <span className={`text-xs mr-1 ${textMuted}`}>میلیارد تومان</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-400">
                      ({formatNum(liveMetrics.registeredCapitalHemmat, 2)} همت)
                    </span>
                  </div>
                  <p className={`text-xs mt-2 ${textMuted}`}>
                    تعداد سهام: {formatNum(liveData.z == null ? null : liveData.z / 1e9, 2)} میلیارد سهم (اسمی ۱۰۰ تومان)
                  </p>
                </div>
              </section>
              <CompanyFinancialShowcase detail={detail} ticker={activeConfig.ticker} cardStyle={cardStyle} />
            </main>
          </ErrorBoundary>
        )}

        {indexOnly && <p role="status" className={`mx-4 mt-4 p-4 rounded-xl border ${cardStyle}`}>
          استخراج گزارش‌های تفصیلی کدال در این نسخه انجام نشده است
        </p>}
        {localFundStore && <div role="status" className={`mx-4 mt-4 p-4 rounded-xl border flex flex-wrap items-center gap-3 ${cardStyle}`}>
          <div>
            <strong>داده بارگذاری‌شده توسط کاربر (محلی)</strong>
            <p className="text-xs">ورودی محلی برای پیش‌بینی است. نمودارها و نسبت‌های بنیادی از داده منتشرشده خوانده می‌شوند.</p>
          </div>
          <button onClick={handleResetFundamentalStore} className="rounded border px-3 py-1.5 text-xs">بازنشانی داده محلی</button>
        </div>}

        {/* TAB 2: FUNDAMENTAL */}
        {mainPage === 'fundamental' && !indexOnly && (
          <ErrorBoundary sectionName="داده‌های بنیادی و مالی">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${cardStyle}`}>
                <div>
                  <h3 className={`text-sm font-bold ${textHeading}`}>به‌روزرسانی خودکار نمودارها و نسبت‌های {activeConfig.ticker} ({activeConfig.fullName})</h3>
                  <p className={`text-xs ${textMuted}`}>{fundStore.lastExcelFileName ? `منبع فعال: ${fundStore.lastExcelFileName}` : 'فایل‌های اکسل ماهانه یا صورت مالی را همزمان انتخاب کنید.'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">انتخاب فایل‌های اکسل</button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <section className={`rounded-2xl border p-6 xl:col-span-2 ${cardStyle}`}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h2 className={`text-lg font-bold ${textHeading}`}>نمودارهای بنیادی ({activeConfig.ticker})</h2>
                    {view.statementScopes.length > 1 ? (
                      <label className="text-xs">
                        دامنه صورت مالی
                        <select className={`mx-2 p-1 rounded border ${subCardStyle}`} value={annualScope}
                          onChange={event => setAnnualScope(event.target.value as AnnualScope | 'separate')}>
                          <option value="separate">نمایش تفکیکی دامنه‌ها</option>
                          {view.statementScopes.map(scope => <option key={scope} value={scope}>{fiscalScope[scope]}</option>)}
                        </select>
                      </label>
                    ) : view.statementScopes[0] && (
                      <span className={`text-xs px-2 py-1 rounded border ${subCardStyle}`}>
                        مبنای گزارش: {view.statementScopes[0] === 'standalone' ? 'شرکت اصلی (Standalone)' : fiscalScope[view.statementScopes[0]]}
                      </span>
                    )}
                    {view.revisionHistory.length > 0 && <details className="text-xs border rounded p-2">
                      <summary className="cursor-pointer">تاریخچه اصلاحیه‌ها</summary>
                      {view.revisionHistory.map(row => <p key={row.revisionId} dir="auto">
                        {row.isFixture && 'داده آزمایشی (Test Fixture) · '}{row.periodEndJalali ?? row.fiscalYear}
                        {' · '}{row.revisionId}{row.restatedFromRevisionId && ' ← ' + row.restatedFromRevisionId}
                      </p>)}
                    </details>}
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {chartTabs.map((t) => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${activeTab === t.id ? 'bg-amber-500 text-white' : subCardStyle}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {view.latestInterim && <aside className={`p-4 mb-4 border rounded-xl ${subCardStyle}`}>
                    <h3 className="font-bold text-sm">آخرین گزارش میاندوره‌ای ۱۴۰۵</h3>
                    <p className="mt-1 text-xs">
                      {toPersianDigits(String(view.latestInterim.periodMonths))} ماهه · {fiscalScope[view.latestInterim.consolidationScope]} · {' '}
                      {auditLabel(view.latestInterim.isAudited)}
                      {view.latestInterim.periodEndJalali && ` · ${toPersianDigits(view.latestInterim.periodEndJalali)}`}
                    </p>
                    <p className="mt-2 text-xs">درآمد عملیاتی {formatNum(view.latestInterim.revenue)} · سود خالص {formatNum(view.latestInterim.netProfit)} میلیارد تومان</p>
                    {view.latestInterim.sourceUrl && <a href={view.latestInterim.sourceUrl} target="_blank" rel="noreferrer" className="text-xs underline">گزارش کدال</a>}
                  </aside>}
                  {activeTab === 'monthly_income' && <h3 className="text-sm mb-2 font-bold">{isHolding
                    ? 'گزارش فعالیت ماهانه (صورت وضعیت پرتفوی — فاقد فروش عملیاتی)' : 'درآمد ماهانه'}</h3>}
                  {activeTab === 'monthly_income' && !hasPublishedMonthly && !isHolding &&
                    <p className="text-sm">مبلغ درآمد ماهانه در این نسخه منتشر نشده است.</p>}
                  {activeTab !== 'monthly_income' && scopedCharts.length === 0 &&
                    <p className="text-sm">صورت مالی برای دامنه انتخاب‌شده ثبت نشده است.</p>}
                  {(activeTab === 'monthly_income' ? hasPublishedMonthly ? [{ scope: null, data: view.fundStore, timeline: view.financialTimeline }] : [] : scopedCharts).map(chart =>
                    <div key={chart.scope ?? 'monthly'}>
                      {chart.scope && <h3 className="text-xs font-bold pt-4">دوره‌های مالی ۱۴۰۰ تا ۱۴۰۵ · {fiscalScope[chart.scope]}</h3>}
                  <div className="h-[320px] w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      {activeTab === 'annual_income' ? (
                        <ComposedChart data={annualIncomeForCurrency(chart.timeline)}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="label" interval={0} height={54} tick={<FinancialPeriodTick fill={axisTickColor} />} />
                          <YAxis width={84} tickFormatter={formatChartNumber} tick={{ fill: axisTickColor }} label={{ value: valUnit, angle: -90, position: 'insideLeft', fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit={valUnit} darkMode={darkMode} />} />
                          <Bar dataKey={currency === 'IRT' ? 'value' : 'usdValue'} name="درآمد عملیاتی" fill="url(#series-f59e0b)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                          <Line type="monotone" dataKey={currency === 'IRT' ? 'netProfit' : 'usdNetProfit'} name="سود خالص" stroke="#10b981" strokeWidth={3} />
                        </ComposedChart>
                      ) : activeTab === 'monthly_income' ? (
                        <BarChart data={view.fundStore.incomeData}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="month" tick={{ fill: axisTickColor }} />
                          <YAxis width={84} tickFormatter={formatChartNumber} tick={{ fill: axisTickColor }} label={{ value: 'میلیارد تومان', angle: -90, position: 'insideLeft', fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="میلیارد تومان" darkMode={darkMode} />} />
                          {avg1404Monthly > 0 && <ReferenceLine y={avg1404Monthly} stroke="#10b981" strokeDasharray="5 5" />}
                          <Bar dataKey="year1403" name="۱۴۰۳" fill="url(#series-6366f1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="year1404" name="۱۴۰۴" fill="url(#series-10b981)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="year1405" name="۱۴۰۵" fill="url(#series-f59e0b)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      ) : activeTab === 'income_breakdown' ? (
                        <BarChart data={chart.timeline}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="label" interval={0} height={54} tick={<FinancialPeriodTick fill={axisTickColor} />} />
                          <YAxis width={84} tickFormatter={formatChartNumber} tick={{ fill: axisTickColor }} label={{ value: 'میلیارد تومان', angle: -90, position: 'insideLeft', fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="میلیارد تومان" darkMode={darkMode} />} />
                          <Bar dataKey="value" name="درآمد عملیاتی" fill="url(#series-f59e0b)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                          <Bar dataKey="cost" name="بهای تمام‌شده / هزینه" fill="url(#series-ef4444)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                          <Bar dataKey="opProfit" name="سود عملیاتی" fill="url(#series-3b82f6)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                          <Bar dataKey="netProfit" name="سود خالص" fill="url(#series-10b981)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                        </BarChart>
                      ) : activeTab === 'cash_flow' ? (
                        <BarChart data={chart.timeline}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="label" interval={0} height={54} tick={<FinancialPeriodTick fill={axisTickColor} />} />
                          <YAxis width={84} tickFormatter={formatChartNumber} tick={{ fill: axisTickColor }} label={{ value: 'میلیارد تومان', angle: -90, position: 'insideLeft', fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="میلیارد تومان" darkMode={darkMode} />} />
                          <ReferenceLine y={0} stroke={axisTickColor} />
                          <Bar dataKey="cashFlow" name="جریان نقد عملیاتی (OCF)" fill="url(#series-06b6d4)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                        </BarChart>
                      ) : activeTab === 'balance_sheet' ? (
                        <BarChart data={chart.timeline}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="label" interval={0} height={54} tick={<FinancialPeriodTick fill={axisTickColor} />} />
                          <YAxis width={84} tickFormatter={formatChartNumber} tick={{ fill: axisTickColor }} label={{ value: 'میلیارد تومان', angle: -90, position: 'insideLeft', fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="میلیارد تومان" darkMode={darkMode} />} />
                          <Bar dataKey="equity" name="حقوق مالکانه" fill="url(#series-10b981)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                          <Bar dataKey="liabilities" name="کل بدهی‌ها" fill="url(#series-f43f5e)" radius={[4, 4, 0, 0]} maxBarSize={38} />
                        </BarChart>
                      ) : activeTab === 'pb_ratio' ? (
                        <LineChart data={chart.data.pbData}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tickFormatter={compactNumber} tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit=" مرتبه" darkMode={darkMode} />} />
                          <Line type="monotone" dataKey="value" name="نسبت P/B" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      ) : activeTab === 'op_margin' ? (
                        <LineChart data={chart.data.opMarginData}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tickFormatter={compactNumber} tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="٪" darkMode={darkMode} />} />
                          <Line type="monotone" dataKey="value" name="حاشیه سود عملیاتی" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      ) : activeTab === 'roe' ? (
                        <LineChart data={chart.data.roeData}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tickFormatter={compactNumber} tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="٪" darkMode={darkMode} />} />
                          <Line type="monotone" dataKey="value" name="بازده حقوق مالکانه (ROE)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      ) : activeTab === 'efficiency' ? (
                        <LineChart data={chart.data.efficiencyData}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tickFormatter={compactNumber} tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="٪" darkMode={darkMode} />} />
                          <Line type="monotone" dataKey="value" name={efficiencyLabel} stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      ) : (
                        <LineChart data={chart.data.netMarginData}>
                          <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tickFormatter={compactNumber} tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="٪" darkMode={darkMode} />} />
                          <Line type="monotone" dataKey="value" name="حاشیه سود خالص" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                    </div>
                  )}
                </section>

                <section className={`rounded-2xl border p-6 ${cardStyle}`}>
                  <h2 className={`text-base font-bold mb-4 ${textHeading}`}>نسبت‌های مالی کلیدی</h2>
                  <p className="text-xs mb-3">{view.scopeLabel ?? '—'}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {view.fundStore.ratiosDef.map(r => {
                      const badge = r.status ? formatRatioBadge(r.status, r.value, r.unit, r.missingInputs) : null;
                      return (
                      <div key={r.id} className={`p-3 rounded-xl border text-center ${subCardStyle}`}>
                        <span className={`text-[11px] block mb-1 ${textMuted}`}>{r.title}</span>
                        <span className="text-base font-bold" dir="ltr">{badge ? <span className={badge.style}>{badge.label}</span> : r.current == null ? '—' : String(r.current) + r.unit}</span>
                      </div>
                    ); })}
                  </div>
                </section>
              </div>

              {(scopedCharts.length ? scopedCharts : [{ scope: null, data: view.fundStore }]).map(chart => (
              <section key={chart.scope ?? 'coverage'} className={`rounded-2xl border overflow-hidden ${cardStyle}`}>
                <div className={`p-4 border-b font-bold text-sm ${borderSubtle}`}>تاریخچه نسبت‌های مالی {chart.scope && ' · ' + fiscalScope[chart.scope]}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className={tableHeaderBg}>
                      <tr>
                        <th className="p-3">نسبت</th>
                        {view.annualYears.map(year => <th className="p-3 text-center" key={year.year}>{year.label}</th>)}
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      <tr>
                        <td className="p-3">پوشش صورت سالانه</td>
                        {view.annualYears.map(year => {
                          const statement = chart.data.annualIncomeData.find(item => item.year === year.label);
                          return <td key={year.year} className="p-3 text-center">
                            {statement ? auditLabel(statement.isAudited)
                              : year.note?.status === 'published_unextracted' ? 'منتشرشده؛ استخراج در انتظار'
                                : year.note?.status === 'no_eligible_filing_found' ? 'گزارش واجد شرایط پیدا نشد' : '—'}
                          </td>;
                        })}
                      </tr>
                      {historicalRatiosTable(chart.data).map((row, idx) => (
                        <tr key={idx} className={tableRowHover}>
                          <td className="p-3 font-medium">{row.name}</td>
                          {view.annualYears.map(year => {
                            const data = row.data.find(item => item.year === year.label);
                            return <td key={year.year} className="p-3 text-center" dir="ltr">
                              {data?.status === 'not_applicable' ? 'نامرتبط' : data?.value == null ? '—' : String(data.value) + row.unit}
                            </td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              ))}
            </main>
          </ErrorBoundary>
        )}

        {/* TAB 3: INTERPRETIVE & CODAL ARCHIVE */}
        {mainPage === 'interpretive' && (
          <ErrorBoundary sectionName="گزارشات تفسیری و آرشیو کدال">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <section className={`rounded-2xl border p-5 ${cardStyle}`}>
                <h2 className={`text-base font-bold mb-4 ${textHeading}`}>تحلیل جامع گزارشات تفسیری مدیریت و چشم‌انداز آینده ({activeConfig.ticker})</h2>
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {interpretiveList.map((item, idx) => (
                    <button key={idx} onClick={() => setSelectedPeriodIdx(idx)} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${selectedPeriodIdx === idx ? 'bg-amber-500 text-white' : subCardStyle}`}>
                      {item.period}
                    </button>
                  ))}
                </div>
                {!interpretiveList.length && <p className="text-xs">گزارش تفسیری در این نسخه ثبت نشده است.</p>}
                {interpretiveList[selectedPeriodIdx] && (
                  <div className={`p-5 rounded-xl border space-y-3.5 ${subCardStyle}`}>
                    {interpretiveList[selectedPeriodIdx].pdfUrl ? (
                      <div className="flex justify-end">
                        <a
                          href={interpretiveList[selectedPeriodIdx].pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span>باز کردن فایل PDF گزارش تفسیری مدیریت ({interpretiveList[selectedPeriodIdx].period})</span>
                        </a>
                      </div>
                    ) : <span className="text-xs">لینک منبع ثبت نشده</span>}
                    <ul className="space-y-3 text-xs md:text-sm leading-relaxed">
                      {interpretiveList[selectedPeriodIdx].highlights.map((h: string, i: number) => (
                        <li key={i} className={i === interpretiveList[selectedPeriodIdx].highlights.length - 1 ? 'p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 font-medium' : ''}>
                          {h}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 pt-2">
                      <input value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="افزودن یادداشت تحلیلی جدید..." className={`flex-1 px-3 py-2 rounded-xl border text-xs ${cardStyle}`} />
                      <button onClick={handleAddInterpretiveHighlight} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">ثبت</button>
                    </div>
                  </div>
                )}
              </section>

              <section className={`rounded-2xl border overflow-hidden ${cardStyle}`}>
                <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${borderSubtle}`}>
                  <span className="text-sm font-bold">آرشیو پالایش‌شده کدال ({toPersianDigits(String(filteredCodalList.length))} گزارش)</span>
                  <div className="flex gap-2 flex-wrap">
                    <input value={codalSearch} onChange={(e) => setCodalSearch(e.target.value)} placeholder="جستجو..." className={`px-3 py-1.5 rounded-lg border text-xs ${subCardStyle}`} />
                    {['all', '1405', '1404', '1403', '1402', '1401', '1400'].map((y) => (
                      <button key={y} onClick={() => setCodalYearFilter(y)} className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${codalYearFilter === y ? 'bg-amber-500 text-white' : subCardStyle}`}>
                        {y === 'all' ? 'همه' : toPersianDigits(y)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className={tableHeaderBg}>
                      <tr>
                        <th className="p-3">عنوان گزارش</th>
                        <th className="p-3 text-center">کد</th>
                        <th className="p-3 text-center">انتشار</th>
                        <th className="p-3 text-center">لینک‌ها</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {paginatedCodalList.map((item: any, idx: number) => (
                        <tr key={idx} className={tableRowHover}>
                          <td className="p-3">{item.title}</td>
                          <td className="p-3 text-center">{item.code}</td>
                          <td className="p-3 text-center">{item.date_publish}</td>
                          <td className="p-3 flex justify-center gap-2">
                            {item.link_excel && <a href={item.link_excel} target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 font-bold">اکسل</a>}
                            {item.link_pdf && <a href={item.link_pdf} target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-rose-600/20 text-rose-400 font-bold">PDF</a>}
                            {item.link ? <a href={item.link} target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-blue-600/20 text-blue-400 font-bold">مشاهده</a> : <span>لینک منبع ثبت نشده</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`p-3 border-t flex justify-between items-center text-xs ${borderSubtle}`}>
                  <span>صفحه {toPersianDigits(String(codalPage))} از {toPersianDigits(String(totalCodalPages))}</span>
                  <div className="flex gap-2">
                    <button disabled={codalPage === 1} onClick={() => setCodalPage((p) => p - 1)} className={`px-3 py-1 rounded border cursor-pointer disabled:opacity-40 ${borderSubtle}`}>قبلی</button>
                    <button disabled={codalPage >= totalCodalPages} onClick={() => setCodalPage((p) => p + 1)} className={`px-3 py-1 rounded border cursor-pointer disabled:opacity-40 ${borderSubtle}`}>بعدی</button>
                  </div>
                </div>
              </section>
            </main>
          </ErrorBoundary>
        )}

        {/* TAB 4: MATERIAL DISCLOSURES */}
        {mainPage === 'disclosures' && (
          <ErrorBoundary sectionName="اطلاعات افشا شده شرکت">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <section className={`rounded-2xl border p-6 ${cardStyle}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className={`text-lg font-bold flex items-center gap-2 ${textHeading}`}>
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      تفسیرگر هوشمند افشای اطلاعات بااهمیت {activeConfig.ticker} ({activeConfig.fullName}) (گروه الف و ب)
                    </h2>
                    <p className={`text-xs mt-1 ${textMuted}`}>خلاصه‌سازی متن اطلاعیه‌ها به همراه تحلیل اثرگذاری بر سهم</p>
                  </div>
                  <div className={`flex items-center p-1.5 rounded-xl border gap-1 ${subCardStyle}`}>
                    {(['all', 'الف', 'ب'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setDisclosureGroupFilter(g)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          disclosureGroupFilter === g ? 'bg-amber-500 text-white' : textMuted
                        }`}
                      >
                        {g === 'all' ? 'همه افشاها' : `گروه ${g}`}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                {filteredDisclosures.length === 0 ? (
                  <div className={`rounded-2xl border p-8 text-center text-xs ${cardStyle} ${textMuted}`}>
                    افشایی برای این انتخاب در نسخه داده ثبت نشده است.
                  </div>
                ) : (
                  filteredDisclosures.map((item: any) => (
                    <div key={item.id} className={`rounded-2xl border p-5 ${cardStyle}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${item.group === 'الف' ? 'bg-rose-500/15 text-rose-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            {item.group ? 'افشای گروه ' + item.group : 'گروه افشا نامشخص'}
                          </span>
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${subCardStyle}`}>{item.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
                            {item.impact ?? 'اطلاعات منبع'}
                          </span>
                          {item.link ? (
                            <a href={item.link} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-bold">
                              مشاهده در کدال
                            </a>
                          ) : <span className="text-xs">لینک منبع ثبت نشده</span>}
                        </div>
                      </div>
                      <div className={`p-3.5 rounded-xl border mb-3 ${subCardStyle}`}>
                        <span className="text-xs font-bold text-amber-500 block mb-1">عنوان و چکیده متن اطلاعیه رسمی:</span>
                        <p className={`text-xs md:text-sm font-semibold leading-relaxed ${textHeading}`}>{item.simpleSummary}</p>
                      </div>
                      <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-indigo-950/25 border-indigo-800/40' : 'bg-indigo-50/60 border-indigo-100'}`}>
                        <span className="text-xs font-bold text-indigo-400 block mb-1">تفسیر به زبان ساده و اثر بر سهم:</span>
                        <p className={`text-xs md:text-sm leading-relaxed ${textMuted}`}>{item.aiTranslation ?? 'خلاصه تحلیلی ثبت نشده است.'}</p>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </main>
          </ErrorBoundary>
        )}

        {/* TAB 5: VALUATION MODELS */}
        {mainPage === 'valuation' && (
          <ErrorBoundary sectionName="ارزش‌گذاری جامع سهم">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <section className={`rounded-2xl border p-6 border-t-4 border-t-emerald-500 ${cardStyle}`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  <div>
                    <span className={`text-xs font-semibold block mb-1 ${textMuted}`}>میانگین ارزش ذاتی برآوردی {activeConfig.ticker} ({activeConfig.fullName})</span>
                    <span className="text-3xl font-black text-emerald-400" dir="ltr">{formatNum(valuationResults.avgIntrinsicPrice, 0)} ریال</span>
                  </div>
                  <div>
                    <span className={`text-xs font-semibold block mb-1 ${textMuted}`}>قیمت فعلی تابلو</span>
                    <span className={`text-2xl font-bold ${textHeading}`} dir="ltr">{formatNum(liveData.pc, 0)} ریال</span>
                  </div>
                  <div className={`p-4 rounded-xl border ${subCardStyle}`}>
                    <span className={`text-xs font-semibold block mb-1 ${textMuted}`}>پتانسیل رشد / حاشیه امنیت</span>
                    <span className={`text-2xl font-black ${valuationResults.upsidePercent === null || valuationResults.upsidePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
                      {valuationResults.upsidePercent === null ? '—' : formatNum(valuationResults.upsidePercent, 1) + '٪'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { title: 'روش FCFF', price: valuationResults.priceFcff, accent: 'border-t-amber-500' },
                  { title: 'روش FCFE', price: valuationResults.priceFcfe, accent: 'border-t-emerald-500' },
                  { title: 'روش DDM (گوردون)', price: valuationResults.priceDdm, accent: 'border-t-blue-500' },
                  { title: 'نسبی P/E', price: valuationResults.priceRelPE, accent: 'border-t-purple-500' },
                  { title: 'نسبی P/B', price: valuationResults.priceRelPB, accent: 'border-t-indigo-500' }
                ].map((m, idx) => (
                  <div key={idx} className={`rounded-2xl border border-t-4 p-5 ${cardStyle} ${m.accent}`}>
                    <h3 className={`text-sm font-bold ${textHeading}`}>{m.title}</h3>
                    <div className={`text-xl font-black mt-3 ${textHeading}`} dir="ltr">{formatNum(m.price, 0)} ریال</div>
                  </div>
                ))}
              </section>

              <section className={`rounded-2xl border p-6 ${cardStyle}`}>
                <h2 className={`text-base font-bold mb-4 ${textHeading}`}>پارامترهای مدل‌های ارزش‌گذاری {activeConfig.ticker} ({activeConfig.fullName})</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={`p-4 rounded-xl border space-y-3 ${subCardStyle}`}>
                    <h3 className="text-xs font-bold text-amber-500">۱. مفروضات DCF (FCFF / FCFE)</h3>
                    {[
                      { key: 'baseFCFF', label: 'FCFF پایه (میلیارد تومان)' },
                      { key: 'baseFCFE', label: 'FCFE پایه (میلیارد تومان)' },
                      { key: 'fcfGrowth5Y', label: 'رشد ۵ ساله (٪)' },
                      { key: 'wacc', label: 'WACC (٪)' },
                      { key: 'costOfEquity', label: 'Ke (٪)' },
                      { key: 'terminalGrowth', label: 'رشد ابدی g (٪)' },
                      { key: 'netCash', label: 'خالص نقدینگی (میلیارد تومان)' },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className={`block text-[11px] mb-1 ${textMuted}`}>{f.label}</label>
                        <input type="number" value={valInputs[f.key]} onChange={(e) => setValInputs((p: any) => ({ ...p, [f.key]: Number(e.target.value) }))} className={`w-full px-3 py-1.5 rounded-lg border text-xs font-bold ${cardStyle}`} dir="ltr" />
                      </div>
                    ))}
                  </div>

                  <div className={`p-4 rounded-xl border space-y-3 ${subCardStyle}`}>
                    <h3 className="text-xs font-bold text-blue-400">۲. مفروضات DDM</h3>
                    {[
                      { key: 'nextDps', label: 'DPS آتی (ریال)' },
                      { key: 'dividendGrowth', label: 'رشد سود تقسیمی (٪)' },
                      { key: 'sharesCountBillion', label: 'تعداد سهام (میلیارد)' },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className={`block text-[11px] mb-1 ${textMuted}`}>{f.label}</label>
                        <input type="number" step="0.1" value={valInputs[f.key]} onChange={(e) => setValInputs((p: any) => ({ ...p, [f.key]: Number(e.target.value) }))} className={`w-full px-3 py-1.5 rounded-lg border text-xs font-bold ${cardStyle}`} dir="ltr" />
                      </div>
                    ))}
                  </div>

                  <div className={`p-4 rounded-xl border space-y-3 ${subCardStyle}`}>
                    <h3 className="text-xs font-bold text-purple-400">۳. مفروضات نسبی (P/E و P/B)</h3>
                    {[
                      { key: 'forwardEps', label: 'Forward EPS (ریال)' },
                      { key: 'targetPE', label: 'P/E هدف' },
                      { key: 'bookValuePerShare', label: 'ارزش دفتری BVPS (ریال)' },
                      { key: 'targetPB', label: 'P/B هدف' },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className={`block text-[11px] mb-1 ${textMuted}`}>{f.label}</label>
                        <input type="number" step="0.1" value={valInputs[f.key]} onChange={(e) => setValInputs((p: any) => ({ ...p, [f.key]: Number(e.target.value) }))} className={`w-full px-3 py-1.5 rounded-lg border text-xs font-bold ${cardStyle}`} dir="ltr" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </main>
          </ErrorBoundary>
        )}

        {/* TAB 6: SMART SALES & EPS FORECAST */}
        {mainPage === 'forecast' && (!indexOnly || localFundStore) && (
          <ErrorBoundary sectionName="پیش‌بینی فروش و EPS">
            <Suspense fallback={<p role="status">در حال بارگذاری پیش‌بینی…</p>}>
            <ForecastTab
              activeConfig={activeConfig}
              liveData={liveData}
              fundStore={fundStore}
              darkMode={darkMode}
              cardStyle={cardStyle}
              subCardStyle={subCardStyle}
              textHeading={textHeading}
              textMuted={textMuted}
              borderSubtle={borderSubtle}
            />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

