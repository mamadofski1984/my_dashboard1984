import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchOptimizedCodalData, type CodalSmartSyncResult } from './utils/brsApiFinancialService';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';
import {
  Building2, TrendingUp, Activity, Target,
  BarChart as BarChartIcon, Percent, Layers, Calculator,
  GitCompare, DollarSign, RefreshCw, Sun, Moon, Download, LayoutDashboard,
  Users, Menu, X, BookOpen, Upload, FolderUp, BellRing, Sparkles, Scale, Briefcase, Database,
  Search, Factory, PlusCircle, FileSpreadsheet
} from 'lucide-react';
import {
  API_KEY, type SymbolKey, SYMBOLS_CONFIG, TSE_INDUSTRY_GROUPS,
  createDynamicSymbolProfile, isAllowedCodalAnnouncement, type SymbolProfile
} from './data/symbolsConfig';
import { ForecastTab } from './components/ForecastTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parseCodalExcelBuffer, PERSIAN_MONTHS, normalizeDigits } from './utils/excelParser';
import { mapPythonArchiveToDashboard } from './utils/offlineArchiveAdapter';

const toPersianDigits = (str: string) => {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/\d/g, (d) => persianDigits[Number(d)]);
};

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
              {entry.value !== null ? entry.value : '-'} {entry.value !== null && unit}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function App() {
  const [symbolsRegistry, setSymbolsRegistry] = useState<Record<string, SymbolProfile>>(() => {
    try {
      const savedCustom = localStorage.getItem('custom_symbols_registry_v1');
      if (savedCustom) {
        return { ...SYMBOLS_CONFIG, ...JSON.parse(savedCustom) };
      }
    } catch {
      // ignore
    }
    return SYMBOLS_CONFIG;
  });

  const [selectedSymbol, setSelectedSymbol] = useState<SymbolKey>('kala');
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>('');
  const [selectedIndustryFilter, setSelectedIndustryFilter] = useState<string>('همه گروه‌های صنعتی');

  const activeConfig = symbolsRegistry[selectedSymbol] || SYMBOLS_CONFIG.kala;
  const TSE_API_URL = `https://Api.BrsApi.ir/Tsetmc/Symbol.php?key=${API_KEY}&l18=${encodeURIComponent(activeConfig.apiL18)}`;

  const TSE_CACHE_KEY = `${selectedSymbol}_tse_live_v11`;
  const CODAL_CACHE_KEY = `${selectedSymbol}_codal_archive_v11`;
  const INTERPRETIVE_NOTES_KEY = `${selectedSymbol}_interpretive_notes_v11`;
  const FUNDAMENTAL_DYNAMIC_KEY = `${selectedSymbol}_fundamental_data_v11`;

  const [mainPage, setMainPage] = useState<'overview' | 'fundamental' | 'interpretive' | 'disclosures' | 'valuation' | 'forecast'>('overview');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [liveData, setLiveData] = useState<any>(activeConfig.defaultLive);
  const [tseLoading, setTseLoading] = useState<boolean>(false);
  const [tseStatus, setTseStatus] = useState<{ type: string; text: string }>({
    type: 'info',
    text: `اطلاعات تابلو ${activeConfig.ticker} (${activeConfig.fullName}) آماده است`
  });

  const [codalList, setCodalList] = useState<any[]>(activeConfig.defaultCodal);
  const [liveDisclosures, setLiveDisclosures] = useState<any[]>(activeConfig.defaultDisclosures);
  const [codalLoading, setCodalLoading] = useState<boolean>(false);
  const [codalQuickLinks, setCodalQuickLinks] = useState<CodalSmartSyncResult | null>(null);
  const [codalStatus, setCodalStatus] = useState<{ type: string; text: string }>({
    type: 'info',
    text: `آرشیو کدال ${activeConfig.ticker} (${activeConfig.fullName}) بارگذاری شد`
  });

  const [codalSearch, setCodalSearch] = useState<string>('');
  const [codalYearFilter, setCodalYearFilter] = useState<string>('all');
  const [codalPage, setCodalPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 15;

  const [disclosureGroupFilter, setDisclosureGroupFilter] = useState<'all' | 'الف' | 'ب'>('all');
  const [valInputs, setValInputs] = useState(activeConfig.defaultValInputs);

  const [fundStore, setFundStore] = useState<any>(activeConfig.defaultFundamental);
  const [excelParsePreview, setExcelParsePreview] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonRestoreInputRef = useRef<HTMLInputElement | null>(null);

  const [interpretiveList, setInterpretiveList] = useState<any[]>(activeConfig.defaultInterpretive);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<number>(0);
  const [newNoteText, setNewNoteText] = useState<string>('');

  const [fx1405, setFx1405] = useState<number>(135000);
  const [activeTab, setActiveTab] = useState('annual_income');
  const [currency] = useState('IRT');
  const [customUsdRate] = useState(65000);
  const [compareStock, setCompareStock] = useState('none');

  const filteredSymbolsList = useMemo(() => {
    const all = Object.values(symbolsRegistry);
    return all.filter((sym) => {
      const matchesIndustry =
        selectedIndustryFilter === 'همه گروه‌های صنعتی' ||
        sym.tseIndustryGroup.includes(selectedIndustryFilter) ||
        selectedIndustryFilter.includes(sym.tseIndustryGroup);

      const q = symbolSearchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        sym.ticker.toLowerCase().includes(q) ||
        sym.fullName.toLowerCase().includes(q) ||
        sym.tseIndustryGroup.toLowerCase().includes(q);

      return matchesIndustry && matchesQuery;
    });
  }, [symbolsRegistry, symbolSearchQuery, selectedIndustryFilter]);

  const handleAddAndSelectCustomSymbol = async (rawTicker: string) => {
    const clean = rawTicker.trim();
    if (!clean) return;

    const existing = Object.values(symbolsRegistry).find((s) => s.ticker === clean);
    if (existing) {
      setSelectedSymbol(existing.key);
      setSymbolSearchQuery('');
      return;
    }

    const newProfile = createDynamicSymbolProfile(clean);
    const updatedRegistry = { ...symbolsRegistry, [clean]: newProfile };
    setSymbolsRegistry(updatedRegistry);

    try {
      const customOnly: Record<string, SymbolProfile> = {};
      Object.entries(updatedRegistry).forEach(([k, v]) => {
        if (!SYMBOLS_CONFIG[k]) customOnly[k] = v;
      });
      localStorage.setItem('custom_symbols_registry_v1', JSON.stringify(customOnly));
    } catch {
      // ignore
    }

    setSelectedSymbol(clean);
    setSymbolSearchQuery('');

    try {
      setTseLoading(true);
      const res = await fetch(`https://Api.BrsApi.ir/Tsetmc/Symbol.php?key=${API_KEY}&l18=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data && data.pc) {
        const industryFromTse = data.cs_sub || data.cs || 'سایر صنایع بورس';
        const fullNameFromTse = data.l30 || `شرکت ${clean}`;
        const enriched: SymbolProfile = {
          ...newProfile,
          fullName: fullNameFromTse,
          tseIndustryGroup: industryFromTse,
          monopolyBadge: `گروه صنعت: ${industryFromTse}`,
          defaultLive: data
        };
        setSymbolsRegistry((prev) => ({ ...prev, [clean]: enriched }));
        setLiveData(data);
        localStorage.setItem(`${clean}_tse_live_v11`, JSON.stringify(data));
        setTseStatus({ type: 'success', text: `نماد ${clean} (${fullNameFromTse}) از بورس بارگذاری شد (۱ درخواست API).` });
      }
    } catch {
      // ignore
    } finally {
      setTseLoading(false);
    }
  };

  useEffect(() => {
    const cfg = symbolsRegistry[selectedSymbol] || SYMBOLS_CONFIG.kala;
    setSelectedPeriodIdx(0);
    setCodalPage(1);
    setCodalSearch('');
    setCodalYearFilter('all');
    setValInputs(cfg.defaultValInputs);
    setCodalQuickLinks(null);
    setExcelParsePreview(null);
    setLiveDisclosures(cfg.defaultDisclosures);

    try {
      const cachedTse = localStorage.getItem(`${selectedSymbol}_tse_live_v11`);
      setLiveData(cachedTse ? JSON.parse(cachedTse) : cfg.defaultLive);

      const cachedCodal = localStorage.getItem(`${selectedSymbol}_codal_archive_v11`);
      if (cachedCodal) {
        const parsedCodal = JSON.parse(cachedCodal);
        setCodalList(Array.isArray(parsedCodal) && parsedCodal.length > 0 ? parsedCodal.filter((i: any) => isAllowedCodalAnnouncement(i.title)) : cfg.defaultCodal);
      } else {
        setCodalList(cfg.defaultCodal);
      }

      const cachedNotes = localStorage.getItem(`${selectedSymbol}_interpretive_notes_v11`);
      setInterpretiveList(cachedNotes ? JSON.parse(cachedNotes) : cfg.defaultInterpretive);

      const cachedFund = localStorage.getItem(`${selectedSymbol}_fundamental_data_v11`);
      setFundStore(cachedFund ? JSON.parse(cachedFund) : cfg.defaultFundamental);
    } catch {
      setLiveData(cfg.defaultLive);
      setCodalList(cfg.defaultCodal);
      setFundStore(cfg.defaultFundamental);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL || './';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const indexUrl = `${normalizedBase}Dashboard_Data/index.json`;

    fetch(indexUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((indexList) => {
        if (!Array.isArray(indexList) || indexList.length === 0) {
          setCodalStatus({ type: 'error', text: 'فایل index.json خالی است یا فرمت آرایه ندارد.' });
          return;
        }

        const loadedTickers: string[] = [];
        setSymbolsRegistry((prev) => {
          const next: Record<string, SymbolProfile> = { ...prev };
          for (const meta of indexList) {
            const t = String(meta.ticker || '').trim();
            if (!t) continue;
            loadedTickers.push(t);
            const existing = Object.values(prev).find((item) => item.ticker === t);
            next[t] = existing
              ? {
                  ...existing,
                  key: t,
                  ticker: t,
                  fullName: (meta as any).company_name || (meta as any).fullName || existing.fullName,
                  tseIndustryGroup: meta.industry || existing.tseIndustryGroup,
                }
              : createDynamicSymbolProfile(
                  t,
                  (meta as any).company_name || `شرکت ${t}`,
                  meta.industry || 'سایر صنایع بورس'
                );
          }
          return next;
        });

        setCodalStatus({
          type: 'success',
          text: `${loadedTickers.length} نماد از Dashboard_Data/index.json بارگذاری شد (${loadedTickers.join('، ')})`,
        });

        if (loadedTickers.length > 0) {
          setSelectedSymbol(loadedTickers[0]);
        }
      })
      .catch((err) => {
        setCodalStatus({
          type: 'error',
          text: `عدم دسترسی به Dashboard_Data/index.json (${err.message}) — مطمئن شوید پوشه Dashboard_Data در dist کپی شده است.`,
        });
      });
  }, []);

  useEffect(() => {
    const cfg = symbolsRegistry[selectedSymbol] || SYMBOLS_CONFIG.kala;
    const tickerName = String(cfg?.ticker || selectedSymbol || '').trim();
    if (!tickerName) return;

    const baseUrl = import.meta.env.BASE_URL || './';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const archiveUrl = `${normalizedBase}Dashboard_Data/${encodeURIComponent(tickerName)}_Archive.json`;

    fetch(archiveUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rawArchive) => {
        if (!rawArchive) return;
        const mapped = mapPythonArchiveToDashboard(rawArchive);
        if (mapped?.fundStore) setFundStore(mapped.fundStore);
        if (Array.isArray(mapped?.interpretiveList) && mapped.interpretiveList.length > 0) {
          setInterpretiveList(mapped.interpretiveList);
        }
        if (Array.isArray(mapped?.disclosuresList)) {
          setLiveDisclosures(mapped.disclosuresList);
        }
        if (Array.isArray(mapped?.codalAnnouncements)) {
          setCodalList(mapped.codalAnnouncements);
        }
        setCodalStatus({
          type: 'success',
          text: `دیتابیس آفلاین ${tickerName} بارگذاری شد (${rawArchive.meta?.counts?.monthly_sales || 0} ماهانه | ${rawArchive.meta?.counts?.financial_statements || 0} صورت مالی | ${rawArchive.meta?.counts?.interpretive_reports || 0} PDF تفسیری)`,
        });
      })
      .catch((err) => {
        setCodalStatus({
          type: 'error',
          text: `خطا در بارگذاری آرشیو ${tickerName} (${err.message})`,
        });
      });
  }, [selectedSymbol]);

  useEffect(() => { setCodalPage(1); }, [codalSearch, codalYearFilter]);

  const handleRestoreJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(String(evt.target?.result || '{}'));
        if (parsed.liveMarketData?.pc) {
          setLiveData(parsed.liveMarketData);
          localStorage.setItem(TSE_CACHE_KEY, JSON.stringify(parsed.liveMarketData));
        }
        if (Array.isArray(parsed.codalAnnouncements)) {
          const cleaned = parsed.codalAnnouncements.filter((i: any) => isAllowedCodalAnnouncement(i.title));
          setCodalList(cleaned);
          localStorage.setItem(CODAL_CACHE_KEY, JSON.stringify(cleaned));
        }
        if (Array.isArray(parsed.interpretiveSummaries)) {
          setInterpretiveList(parsed.interpretiveSummaries);
          localStorage.setItem(INTERPRETIVE_NOTES_KEY, JSON.stringify(parsed.interpretiveSummaries));
        }
        if (parsed.fundamentalData?.annualIncomeData) {
          setFundStore(parsed.fundamentalData);
          localStorage.setItem(FUNDAMENTAL_DYNAMIC_KEY, JSON.stringify(parsed.fundamentalData));
        }
        setCodalStatus({ type: 'success', text: 'فایل پشتیبان JSON بازیابی شد.' });
      } catch {
        alert('خطا در خواندن فایل JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length === 1) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
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
      setFundStore(updatedStore);
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
      setFundStore(updatedStore);
      localStorage.setItem(FUNDAMENTAL_DYNAMIC_KEY, JSON.stringify(updatedStore));
      setExcelParsePreview(null);
      return;
    }

    const { revenue, adminCost, opProfit, netProfit, ocf, equity, liabilities, assets, fileName } = excelParsePreview;
    const calcOpMargin = revenue > 0 ? Math.round((opProfit / revenue) * 100) : 75;
    const calcNetMargin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 103;
    const calcROE = equity > 0 ? Number(((netProfit / equity) * 100).toFixed(1)) : 62.6;
    const calcROA = assets > 0 ? Number(((netProfit / assets) * 100).toFixed(1)) : 41.3;
    const calcEfficiency = revenue > 0 ? Number(((adminCost / revenue) * 100).toFixed(1)) : 24.6;
    const calcEquityRatio = assets > 0 ? Number(((equity / assets) * 100).toFixed(1)) : 82.7;
    const calcDebtRatio = assets > 0 ? Number(((liabilities / assets) * 100).toFixed(1)) : 17.1;

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
        if (r.id === 'roe') return { ...r, current: calcROE };
        if (r.id === 'roa') return { ...r, current: calcROA };
        if (r.id === 'efficiency') return { ...r, current: calcEfficiency };
        if (r.id === 'equity') return { ...r, current: calcEquityRatio };
        if (r.id === 'debt') return { ...r, current: calcDebtRatio };
        return r;
      })
    };
    setFundStore(updatedStore);
    localStorage.setItem(FUNDAMENTAL_DYNAMIC_KEY, JSON.stringify(updatedStore));
    setExcelParsePreview(null);
  };

  const handleResetFundamentalStore = () => {
    setFundStore(activeConfig.defaultFundamental);
    localStorage.removeItem(FUNDAMENTAL_DYNAMIC_KEY);
    setExcelParsePreview(null);
  };

  const handleRefreshTSE = async () => {
    setTseLoading(true);
    setTseStatus({ type: 'loading', text: `در حال دریافت تابلو ${activeConfig.ticker} (${activeConfig.fullName})...` });
    try {
      const response = await fetch(TSE_API_URL);
      const data = await response.json();
      if (data && data.pc) {
        setLiveData(data);
        localStorage.setItem(TSE_CACHE_KEY, JSON.stringify(data));
        if (data.l30 || data.cs_sub) {
          setSymbolsRegistry((prev) => ({
            ...prev,
            [selectedSymbol]: {
              ...prev[selectedSymbol],
              fullName: data.l30 || prev[selectedSymbol].fullName,
              tseIndustryGroup: data.cs_sub || prev[selectedSymbol].tseIndustryGroup
            }
          }));
        }
        setTseStatus({ type: 'success', text: `تابلو ${activeConfig.ticker} (${data.l30 || activeConfig.fullName}) آپدیت شد (${data.date_update})` });
      }
    } catch (err: any) {
      setTseStatus({ type: 'error', text: `خطا: ${err.message}` });
    } finally {
      setTseLoading(false);
    }
  };

  const handleSyncCodal = async () => {
    setCodalLoading(true);
    setCodalStatus({ type: 'loading', text: `در حال دریافت هوشمند گزارش‌های کدال ${activeConfig.ticker} (${activeConfig.fullName})...` });
    try {
      const result = await fetchOptimizedCodalData(activeConfig.apiL18, '1403-01-01');
      if (result.announcements.length > 0) {
        setCodalList(result.announcements);
        localStorage.setItem(CODAL_CACHE_KEY, JSON.stringify(result.announcements));
        setCodalPage(1);
      }
      if (result.disclosures.length > 0) {
        setLiveDisclosures(result.disclosures);
      }
      setCodalQuickLinks(result);
      setCodalStatus({
        type: 'success',
        text: `${result.announcements.length} گزارش کدال و ${result.monthlyExcelLinks.length} لینک اکسل ماهانه دریافت شد (مصرف: ${result.requestsUsed} درخواست).`
      });
    } catch (err: any) {
      setCodalStatus({ type: 'error', text: `خطا: ${err.message}` });
    } finally {
      setCodalLoading(false);
    }
  };

  const handleAddInterpretiveHighlight = () => {
    if (!newNoteText.trim()) return;
    const up = interpretiveList.map((it, idx) => idx === selectedPeriodIdx ? { ...it, highlights: [...it.highlights, newNoteText.trim()] } : it);
    setInterpretiveList(up);
    localStorage.setItem(INTERPRETIVE_NOTES_KEY, JSON.stringify(up));
    setNewNoteText('');
  };

  const liveMetrics = useMemo(() => {
    const marketCapToman = (liveData.mv || 0) / 10 / 1e9;
    const marketCapUSD = (marketCapToman * 1e9) / (fx1405 || 1) / 1e6;
    const latestEquity = fundStore.balanceSheetData[fundStore.balanceSheetData.length - 1]?.equity || 1;
    const livePB = latestEquity > 0 ? marketCapToman / latestEquity : 0;
    const valueTradedToman = (liveData.tval || 0) / 10 / 1e9;

    const sharesCount = Number(liveData.z || 0);
    const registeredCapitalTomanBillion = (sharesCount * 100) / 1e9;
    const registeredCapitalHemmat = registeredCapitalTomanBillion / 1000;

    return {
      marketCapToman, marketCapUSD, livePB, valueTradedToman,
      registeredCapitalTomanBillion, registeredCapitalHemmat
    };
  }, [liveData, fx1405, fundStore]);

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
    const currentPrice = liveData.pc || 13450;
    const upsidePercent = currentPrice > 0 ? ((avgIntrinsicPrice - currentPrice) / currentPrice) * 100 : 0;

    return { priceFcff, priceFcfe, priceDdm, priceRelPE, priceRelPB, avgIntrinsicPrice, upsidePercent };
  }, [valInputs, liveData.pc]);

  const filteredCodalList = useMemo(() => {
    return codalList.filter((item) => {
      if (!isAllowedCodalAnnouncement(item.title)) return false;
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
    const payload = {
      exportedAt: new Date().toISOString(),
      symbol: `${activeConfig.ticker} (${activeConfig.fullName})`,
      tseIndustryGroup: activeConfig.tseIndustryGroup,
      liveMarketData: liveData,
      codalAnnouncements: codalList,
      interpretiveSummaries: interpretiveList,
      fundamentalData: fundStore
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSymbol.toUpperCase()}_Archive.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getHistoricalUsdRate = (year: string, currentRate: number) => {
    const rates: Record<string, number> = { '۱۴۰۱': 37000, '۱۴۰۲': 54000, '۱۴۰۳': 70000, '۱۴۰۴': 112000 };
    return rates[year] || currentRate;
  };

  const dynamicAnnualIncomeData = fundStore.annualIncomeData.map((item: any) => {
    const rate = getHistoricalUsdRate(item.year, customUsdRate);
    return {
      ...item,
      usdValue: Number(((item.value * 1000) / rate).toFixed(1)),
      usdNetProfit: Number(((item.netProfit * 1000) / rate).toFixed(1)),
      compUsdValue: Number(((item.compValue * 1000) / rate).toFixed(1)),
      compUsdNetProfit: Number(((item.compNetProfit * 1000) / rate).toFixed(1)),
    };
  });

  const historicalRatiosTable = [
    { name: 'حاشیه سود خالص', data: fundStore.netMarginData, unit: '٪' },
    { name: 'حاشیه سود عملیاتی', data: fundStore.opMarginData, unit: '٪' },
    { name: 'بازده حقوق مالکانه (ROE)', data: fundStore.roeData, unit: '٪' },
    { name: 'نسبت کارایی (هزینه به درآمد)', data: fundStore.efficiencyData, unit: '٪' },
    { name: 'نسبت P/B', data: fundStore.pbData, unit: ' مرتبه' },
  ];

  const chartTabs = [
    { id: 'annual_income', label: 'فروش و سود خالص', icon: DollarSign },
    { id: 'monthly_income', label: 'درآمد ماهانه', icon: BarChartIcon },
    { id: 'income_breakdown', label: 'درآمد تفکیکی', icon: Layers },
    { id: 'cash_flow', label: 'جریان نقد عملیاتی', icon: Activity },
    { id: 'balance_sheet', label: 'ترازنامه', icon: Building2 },
    { id: 'pb_ratio', label: 'P/B', icon: Activity },
    { id: 'net_margin', label: 'حاشیه سود خالص', icon: Percent },
    { id: 'op_margin', label: 'حاشیه سود عملیاتی', icon: Percent },
    { id: 'roe', label: 'ROE', icon: TrendingUp },
    { id: 'efficiency', label: 'نسبت کارایی', icon: Target }
  ];

  const avg1404Monthly = useMemo(() => {
    const valid = fundStore.incomeData.filter((d: any) => d.year1404 > 0);
    if (valid.length === 0) return 0;
    return Number((valid.reduce((s: number, d: any) => s + d.year1404, 0) / valid.length).toFixed(1));
  }, [fundStore.incomeData]);

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
    <div dir="rtl" className={`min-h-screen flex transition-colors duration-200 font-sans ${bgPage}`}>
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
              <p className={`text-[11px] font-bold ${textMuted}`}>جستجوی نماد / شرکت ({Object.keys(symbolsRegistry).length} نماد):</p>
              <Factory className="w-3.5 h-3.5 text-amber-500" />
            </div>

            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute right-3 top-2.5 ${textMuted}`} />
              <input
                type="text"
                value={symbolSearchQuery}
                onChange={(e) => setSymbolSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && symbolSearchQuery.trim()) {
                    handleAddAndSelectCustomSymbol(symbolSearchQuery.trim());
                  }
                }}
                placeholder="جستجو یا تایپ نماد جدید (مثلاً فولاد)..."
                className={`w-full pr-8 pl-2.5 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 ${subCardStyle}`}
              />
            </div>

            <select
              value={selectedIndustryFilter}
              onChange={(e) => setSelectedIndustryFilter(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-[11px] font-medium outline-none cursor-pointer ${subCardStyle}`}
            >
              {TSE_INDUSTRY_GROUPS.map((grp) => (
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
                    onClick={() => setSelectedSymbol(sym.key)}
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

              {symbolSearchQuery.trim() && filteredSymbolsList.length === 0 && (
                <button
                  onClick={() => handleAddAndSelectCustomSymbol(symbolSearchQuery.trim())}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>بارگذاری «{symbolSearchQuery.trim()}» از TSE</span>
                </button>
              )}
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
            ].map((navItem) => {
              const Icon = navItem.icon;
              const active = mainPage === navItem.id;
              return (
                <button
                  key={navItem.id}
                  onClick={() => { setMainPage(navItem.id as any); setMobileMenuOpen(false); }}
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
                <span className="text-xs font-bold text-amber-500" dir="ltr">{liveData.pe}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 border-t space-y-2 ${borderSubtle}`}>
          <button onClick={() => setDarkMode(!darkMode)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${subCardStyle}`}>
            <span>{darkMode ? 'حالت تاریک' : 'حالت روشن'}</span>
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
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
              {mainPage === 'fundamental' && (
                <div className={`hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${subCardStyle}`}>
                  <GitCompare className="w-4 h-4 text-indigo-500" />
                  <select className="bg-transparent text-xs font-medium outline-none cursor-pointer" value={compareStock} onChange={(e) => setCompareStock(e.target.value)}>
                    <option value="none" className={darkMode ? 'bg-slate-900' : 'bg-white'}>بدون مقایسه</option>
                    <option value="bourse" className={darkMode ? 'bg-slate-900' : 'bg-white'}>مقایسه با صنعت</option>
                  </select>
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer" title="انتخاب همزمان یک یا چند فایل اکسل">
                <Upload className="w-3.5 h-3.5" /><span className="hidden md:inline">آپلود اکسل (تکی/گروهی)</span>
              </button>
              <button onClick={handleRefreshTSE} disabled={tseLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer">
                <RefreshCw className={`w-3.5 h-3.5 ${tseLoading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">به‌روزرسانی تابلو</span>
              </button>
              <button onClick={handleSyncCodal} disabled={codalLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer">
                <Database className={`w-3.5 h-3.5 ${codalLoading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">همگام‌سازی کدال (۳ درخواست)</span>
              </button>
            </div>
          </div>
        </header>

        {/* Status Bar */}
        <div className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-4">
          <div className={`px-4 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${cardStyle}`}>
            <div className="flex flex-wrap items-center gap-4">
              <span>• {tseStatus.text}</span>
              <span>• {codalStatus.text}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>دلار مبنا:</span>
              <input type="number" value={fx1405} onChange={(e) => setFx1405(Number(e.target.value) || 1)} className={`w-24 px-2 py-0.5 rounded border text-xs font-bold text-amber-500 ${subCardStyle}`} dir="ltr" />
            </div>
          </div>
        </div>

        {/* DIRECT EXCEL LINKS PANEL FROM CODAL API (CATEGORY 3 & CATEGORY 1) */}
        {codalQuickLinks && (codalQuickLinks.monthlyExcelLinks.length > 0 || codalQuickLinks.financialExcelLinks.length > 0) && (
          <div className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-3">
            <div className={`p-4 rounded-2xl border border-purple-500/40 text-xs space-y-3 ${cardStyle}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-400 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  فایل‌های اکسل آماده دریافت‌شده از کدال برای {activeConfig.ticker} ({activeConfig.fullName}):
                </span>
                <button onClick={() => setCodalQuickLinks(null)} className="text-slate-400 hover:text-white cursor-pointer">بستن</button>
              </div>

              {codalQuickLinks.monthlyExcelLinks.length > 0 && (
                <div>
                  <span className={`block mb-1.5 font-semibold ${textMuted}`}>
                    ۱. گزارش‌های فعالیت ماهانه (category=3) — کلیک کنید تا دانلود شوند، سپس همزمان با دکمه «آپلود اکسل» انتخاب کنید:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {codalQuickLinks.monthlyExcelLinks.map((lnk, i) => (
                      <a
                        key={i}
                        href={lnk.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 font-bold"
                      >
                        اکسل {lnk.month} {toPersianDigits(lnk.year)}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {codalQuickLinks.financialExcelLinks.length > 0 && (
                <div>
                  <span className={`block mb-1.5 font-semibold ${textMuted}`}>
                    ۲. صورت‌های مالی میاندوره‌ای و سالانه (category=1):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {codalQuickLinks.financialExcelLinks.map((lnk, i) => (
                      <a
                        key={i}
                        href={lnk.url}
                        target="_blank"
                        rel="noreferrer"
                        title={lnk.title}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold"
                      >
                        صورت مالی ({lnk.period})
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
        {mainPage === 'overview' && (
          <ErrorBoundary sectionName="معرفی شرکت و اطلاعات پایه">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`rounded-2xl p-5 border relative overflow-hidden ${cardStyle}`}>
                  <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500"></div>
                  <span className={`text-xs ${textMuted}`}>قیمت پایانی سهم (ریال)</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className={`text-2xl font-bold ${textHeading}`} dir="ltr">{formatNum(liveData.pc)}</span>
                    <span className="text-xs font-bold text-emerald-400" dir="ltr">{liveData.pcp}%</span>
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
                    تعداد سهام: {formatNum((liveData.z || 0) / 1e9, 2)} میلیارد سهم (اسمی ۱۰۰ تومان)
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`rounded-2xl border p-6 lg:col-span-2 ${cardStyle}`}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h2 className={`text-base md:text-lg font-bold ${textHeading}`}>
                      معرفی و هسته کسب‌وکار {activeConfig.ticker} ({activeConfig.fullName})
                    </h2>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/15 text-amber-500">{activeConfig.monopolyBadge}</span>
                  </div>
                  <p className={`text-xs md:text-sm leading-relaxed mb-5 ${textMuted}`}>{activeConfig.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {activeConfig.pillars.map((p, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border ${subCardStyle}`}>
                        <span className={`text-xs font-bold block mb-1.5 ${p.color}`}>{p.title}</span>
                        <p className={`text-xs leading-relaxed ${textMuted}`}>{p.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`rounded-2xl border p-6 ${cardStyle}`}>
                  <h2 className={`text-base font-bold flex items-center gap-2 mb-4 ${textHeading}`}>
                    <Users className="w-5 h-5 text-blue-500" />
                    ترکیب سهامداران {activeConfig.ticker}
                  </h2>
                  <div className="h-44 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie data={activeConfig.shareholders} dataKey="percent" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3}>
                          {activeConfig.shareholders.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-2">
                    {activeConfig.shareholders.map((sh, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sh.color }}></span>
                          <span className={textMuted}>{sh.name}</span>
                        </div>
                        <span className="font-bold" dir="ltr">{sh.percent}٪</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </main>
          </ErrorBoundary>
        )}

        {/* TAB 2: FUNDAMENTAL */}
        {mainPage === 'fundamental' && (
          <ErrorBoundary sectionName="داده‌های بنیادی و مالی">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${cardStyle}`}>
                <div>
                  <h3 className={`text-sm font-bold ${textHeading}`}>به‌روزرسانی خودکار نمودارها و نسبت‌های {activeConfig.ticker} ({activeConfig.fullName})</h3>
                  <p className={`text-xs ${textMuted}`}>{fundStore.lastExcelFileName ? `منبع فعال: ${fundStore.lastExcelFileName}` : 'فایل‌های اکسل ماهانه یا صورت مالی را همزمان انتخاب کنید.'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">انتخاب فایل‌های اکسل</button>
                  {fundStore.lastExcelFileName && <button onClick={handleResetFundamentalStore} className={`px-3 py-2 rounded-xl border text-xs cursor-pointer ${borderSubtle}`}>بازنشانی</button>}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <section className={`rounded-2xl border p-6 xl:col-span-2 ${cardStyle}`}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h2 className={`text-lg font-bold ${textHeading}`}>نمودارهای بنیادی ({activeConfig.ticker})</h2>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {chartTabs.map((t) => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${activeTab === t.id ? 'bg-amber-500 text-white' : subCardStyle}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[320px] w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      {activeTab === 'annual_income' ? (
                        <ComposedChart data={dynamicAnnualIncomeData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit={valUnit} darkMode={darkMode} />} />
                          <Bar dataKey={currency === 'IRT' ? 'value' : 'usdValue'} name="درآمد عملیاتی" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={45} />
                          <Line type="monotone" dataKey={currency === 'IRT' ? 'netProfit' : 'usdNetProfit'} name="سود خالص" stroke="#10b981" strokeWidth={3} />
                        </ComposedChart>
                      ) : activeTab === 'monthly_income' ? (
                        <BarChart data={fundStore.incomeData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="month" tick={{ fill: axisTickColor }} />
                          <YAxis tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="میلیارد تومان" darkMode={darkMode} />} />
                          {avg1404Monthly > 0 && <ReferenceLine y={avg1404Monthly} stroke="#10b981" strokeDasharray="5 5" />}
                          <Bar dataKey="year1404" name="۱۴۰۴" fill="#10b981" maxBarSize={35} />
                          <Bar dataKey="year1405" name="۱۴۰۵" fill="#f59e0b" maxBarSize={35} />
                        </BarChart>
                      ) : (
                        <LineChart data={activeTab === 'roe' ? fundStore.roeData : activeTab === 'pb_ratio' ? fundStore.pbData : fundStore.netMarginData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                          <XAxis dataKey="year" tick={{ fill: axisTickColor }} />
                          <YAxis tick={{ fill: axisTickColor }} />
                          <Tooltip content={<CustomTooltip unit="٪" darkMode={darkMode} />} />
                          <Line type="monotone" dataKey="value" name="مقدار" stroke="#10b981" strokeWidth={3} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className={`rounded-2xl border p-6 ${cardStyle}`}>
                  <h2 className={`text-base font-bold mb-4 ${textHeading}`}>نسبت‌های مالی کلیدی</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {fundStore.ratiosDef.map((r: any) => (
                      <div key={r.id} className={`p-3 rounded-xl border text-center ${subCardStyle}`}>
                        <span className={`text-[11px] block mb-1 ${textMuted}`}>{r.title}</span>
                        <span className="text-base font-bold" dir="ltr">{r.current}{r.unit}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className={`rounded-2xl border overflow-hidden ${cardStyle}`}>
                <div className={`p-4 border-b font-bold text-sm ${borderSubtle}`}>تاریخچه نسبت‌های مالی</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className={tableHeaderBg}>
                      <tr>
                        <th className="p-3">نسبت</th>
                        <th className="p-3 text-center">۱۴۰۱</th>
                        <th className="p-3 text-center">۱۴۰۲</th>
                        <th className="p-3 text-center">۱۴۰۳</th>
                        <th className="p-3 text-center">۱۴۰۴</th>
                        <th className="p-3 text-center text-amber-500">۱۴۰۵</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {historicalRatiosTable.map((row, idx) => (
                        <tr key={idx} className={tableRowHover}>
                          <td className="p-3 font-medium">{row.name}</td>
                          {row.data.map((d: any, i: number) => <td key={i} className="p-3 text-center" dir="ltr">{d.value}{row.unit}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </main>
          </ErrorBoundary>
        )}

        {/* TAB 3: INTERPRETIVE & CODAL ARCHIVE */}
        {mainPage === 'interpretive' && (
          <ErrorBoundary sectionName="گزارشات تفسیری و آرشیو کدال">
            <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
              <section className={`rounded-2xl border p-5 ${cardStyle}`}>
                <h2 className={`text-base font-bold mb-4 ${textHeading}`}>خلاصه گزارشات تفسیری مدیریت ({activeConfig.ticker})</h2>
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {interpretiveList.map((item, idx) => (
                    <button key={idx} onClick={() => setSelectedPeriodIdx(idx)} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${selectedPeriodIdx === idx ? 'bg-amber-500 text-white' : subCardStyle}`}>
                      {item.period}
                    </button>
                  ))}
                </div>
                {interpretiveList[selectedPeriodIdx] && (
                  <div className={`p-4 rounded-xl border space-y-3 ${subCardStyle}`}>
                    {interpretiveList[selectedPeriodIdx].pdfUrl && (
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
                    )}
                    <ul className="space-y-2 text-xs md:text-sm">
                      {interpretiveList[selectedPeriodIdx].highlights.map((h: string, i: number) => <li key={i}>• {h}</li>)}
                    </ul>
                    <div className="flex gap-2 pt-2">
                      <input value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="افزودن نکته جدید..." className={`flex-1 px-3 py-2 rounded-xl border text-xs ${cardStyle}`} />
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
                            {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-blue-600/20 text-blue-400 font-bold">مشاهده</a>}
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
                    <p className={`text-xs mt-1 ${textMuted}`}>دریافت مستقیم از دسته‌بندی category=2 وب‌سرویس کدال</p>
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
                    برای بارگذاری افشاهای بااهمیت این نماد، دکمه بنفش «همگام‌سازی کدال» در بالای صفحه را بزنید.
                  </div>
                ) : (
                  filteredDisclosures.map((item: any) => (
                    <div key={item.id} className={`rounded-2xl border p-5 ${cardStyle}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${item.group === 'الف' ? 'bg-rose-500/15 text-rose-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            افشای گروه {item.group}
                          </span>
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${subCardStyle}`}>{item.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
                            {item.impact}
                          </span>
                          {item.link && (
                            <a href={item.link} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-bold">
                              مشاهده در کدال
                            </a>
                          )}
                        </div>
                      </div>
                      <div className={`p-3.5 rounded-xl border mb-3 ${subCardStyle}`}>
                        <span className="text-xs font-bold text-amber-500 block mb-1">عنوان اطلاعیه رسمی:</span>
                        <p className={`text-xs md:text-sm font-semibold ${textHeading}`}>{item.simpleSummary}</p>
                      </div>
                      <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-indigo-950/25 border-indigo-800/40' : 'bg-indigo-50/60 border-indigo-100'}`}>
                        <span className="text-xs font-bold text-indigo-400 block mb-1">توضیح تحلیلی:</span>
                        <p className={`text-xs md:text-sm leading-relaxed ${textMuted}`}>{item.aiTranslation}</p>
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
                    <span className={`text-2xl font-black ${valuationResults.upsidePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
                      {valuationResults.upsidePercent >= 0 ? `+${formatNum(valuationResults.upsidePercent, 1)}%` : `${formatNum(valuationResults.upsidePercent, 1)}%`}
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
        {mainPage === 'forecast' && (
          <ErrorBoundary sectionName="پیش‌بینی فروش و EPS">
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
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
