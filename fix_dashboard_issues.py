import os
import shutil

if not os.path.exists("src/App.tsx"):
    raise FileNotFoundError("فایل src/App.tsx پیدا نشد! در پوشه اصلی my_dashboard-main اجرا کنید.")

# ۱. به‌روزرسانی کامل src/utils/offlineArchiveAdapter.ts
adapter_code = """import {
  createEmptyFundamentalStore,
  createDynamicSymbolProfile,
  type SymbolProfile
} from '../data/symbolsConfig';

const PERSIAN_MONTH_BY_NUM: Record<string, string> = {
  '01': 'فروردین',
  '02': 'اردیبهشت',
  '03': 'خرداد',
  '04': 'تیر',
  '05': 'مرداد',
  '06': 'شهریور',
  '07': 'مهر',
  '08': 'آبان',
  '09': 'آذر',
  '10': 'دی',
  '11': 'بهمن',
  '12': 'اسفند',
};

const toBilliardToman = (millionRial: number | null | undefined): number => {
  if (millionRial === null || millionRial === undefined || isNaN(Number(millionRial))) return 0;
  return Number((Number(millionRial) / 10000).toFixed(1));
};

const toPersianYear = (yr: string): string => {
  const map: Record<string, string> = {
    '1401': '۱۴۰۱',
    '1402': '۱۴۰۲',
    '1403': '۱۴۰۳',
    '1404': '۱۴۰۴',
    '1405': '۱۴۰۵',
  };
  return map[yr] || yr;
};

export function mapPythonArchiveToDashboard(archiveJson: any) {
  const ticker = String(archiveJson?.meta?.ticker || '').trim();
  const industry = String(archiveJson?.meta?.industry || 'سایر صنایع بورس').trim();
  const baseProfile: SymbolProfile = createDynamicSymbolProfile(ticker, `شرکت ${ticker}`, industry);
  const store = createEmptyFundamentalStore(`آخرین دوره (${ticker})`);

  // ۱. فروش ماهانه (۱۴۰۳، ۱۴۰۴، ۱۴۰۵) به میلیارد تومان
  const monthlySales: any[] = Array.isArray(archiveJson?.monthly_sales) ? archiveJson.monthly_sales : [];
  const salesMap: Record<string, Record<string, number>> = {};

  for (const item of monthlySales) {
    const p = String(item.period || '');
    const [yr, mm] = p.split('/');
    const mName = PERSIAN_MONTH_BY_NUM[mm];
    if (!yr || !mName) continue;
    if (!salesMap[mName]) salesMap[mName] = {};
    salesMap[mName][yr] = toBilliardToman(item.monthly_revenue);
  }

  store.incomeData = store.incomeData.map((row) => ({
    ...row,
    year1403: salesMap[row.month]?.['1403'] ?? 0,
    year1404: salesMap[row.month]?.['1404'] ?? 0,
    year1405: salesMap[row.month]?.['1405'] !== undefined ? salesMap[row.month]['1405'] : null,
  }));

  // ۲. انتخاب بهترین گزارش سالانه برای هر سال (پشتیبانی از پسوندهایی مثل _حسابرسی_شده یا _اصلاحیه)
  const finList: any[] = Array.isArray(archiveJson?.financial_statements) ? archiveJson.financial_statements : [];
  const yearsEn = ['1401', '1402', '1403', '1404', '1405'];
  const annualByYear: Record<string, any> = {};

  for (const yr of yearsEn) {
    const yearFins = finList.filter((f) => String(f.period || '').startsWith(`${yr}_`));
    if (yearFins.length === 0) continue;

    // اولویت با 12M، سپس حسابرسی‌شده، سپس آخرین دوره
    const f12m = yearFins.filter((f) => String(f.period || '').includes('_12M'));
    const pool = f12m.length > 0 ? f12m : yearFins;
    pool.sort((a, b) => {
      const audDiff = Number(Boolean(a.is_audited)) - Number(Boolean(b.is_audited));
      if (audDiff !== 0) return audDiff;
      return String(a.period || '').localeCompare(String(b.period || ''));
    });
    annualByYear[yr] = pool[pool.length - 1];
  }

  const latest1405 = [...finList]
    .filter((f) => String(f.period || '').startsWith('1405'))
    .sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')))
    .pop();

  if (latest1405) {
    const rev = toBilliardToman(latest1405.revenue);
    const op = toBilliardToman(latest1405.operating_profit);
    const net = toBilliardToman(latest1405.net_profit);
    const cost = Math.abs(toBilliardToman(latest1405.cost_of_revenue));
    store.interimReport = {
      periodLabel: `${String(latest1405.period).replace('_', ' - ')} (${ticker})`,
      revenue: rev,
      adminCost: cost,
      opProfit: op,
      opMargin: rev > 0 ? Number(((op / rev) * 100).toFixed(1)) : 0,
      otherIncome: 0,
      tax: 0,
      netProfit: net,
      netMargin: rev > 0 ? Number(((net / rev) * 100).toFixed(1)) : 0,
    };
  }

  store.annualIncomeData = yearsEn.map((yr) => {
    const f = annualByYear[yr];
    return {
      year: toPersianYear(yr),
      value: f ? toBilliardToman(f.revenue) : 0,
      netProfit: f ? toBilliardToman(f.net_profit) : 0,
      compValue: 0,
      compNetProfit: 0,
    };
  });

  store.netMarginData = yearsEn.map((yr) => {
    const f = annualByYear[yr];
    const rev = Number(f?.revenue || 0);
    const net = Number(f?.net_profit || 0);
    return {
      year: toPersianYear(yr),
      value: rev > 0 ? Number(((net / rev) * 100).toFixed(1)) : 0,
      compValue: 0,
    };
  });

  store.opMarginData = yearsEn.map((yr) => {
    const f = annualByYear[yr];
    const rev = Number(f?.revenue || 0);
    const op = Number(f?.operating_profit || 0);
    return {
      year: toPersianYear(yr),
      value: rev > 0 ? Number(((op / rev) * 100).toFixed(1)) : 0,
      compValue: 0,
    };
  });

  store.roeData = yearsEn.map((yr) => {
    const f = annualByYear[yr];
    const eq = Number(f?.total_equity || 0);
    const net = Number(f?.net_profit || 0);
    return {
      year: toPersianYear(yr),
      value: eq > 0 ? Number(((net / eq) * 100).toFixed(1)) : 0,
      compValue: 0,
    };
  });

  store.efficiencyData = yearsEn.map((yr) => {
    const f = annualByYear[yr];
    const rev = Number(f?.revenue || 0);
    const cost = Math.abs(Number(f?.cost_of_revenue || 0));
    return {
      year: toPersianYear(yr),
      value: rev > 0 ? Number(((cost / rev) * 100).toFixed(1)) : 0,
      compValue: 0,
    };
  });

  store.cashFlowData = yearsEn.map((yr) => {
    const f = annualByYear[yr];
    return {
      year: toPersianYear(yr),
      value: f ? toBilliardToman(f.operating_cash_flow) : 0,
      compValue: 0,
    };
  });

  store.balanceSheetData = ['1401', '1402', '1403', '1404'].map((yr) => {
    const f = annualByYear[yr];
    return {
      year: toPersianYear(yr),
      liabilities: f ? toBilliardToman(f.total_liabilities) : 0,
      equity: f ? toBilliardToman(f.total_equity) : 0,
      compLiab: 0,
      compEq: 0,
    };
  });

  const orderedFins = [...finList].sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')));
  const currFin = orderedFins[orderedFins.length - 1] || {};
  const prevFin = orderedFins[orderedFins.length - 2] || currFin;

  const calcRatios = (f: any) => {
    const rev = Number(f?.revenue || 0);
    const net = Number(f?.net_profit || 0);
    const assets = Number(f?.total_assets || 0);
    const liab = Number(f?.total_liabilities || 0);
    const eq = Number(f?.total_equity || 0);
    const curAssets = Number(f?.current_assets || 0);
    const inv = Number(f?.inventory || 0);
    const rec = Number(f?.receivables || 0);
    const curLiab = Number(f?.current_liabilities || 0);
    const ocf = Number(f?.operating_cash_flow || 0);
    const cost = Math.abs(Number(f?.cost_of_revenue || 0));

    return {
      roe: eq > 0 ? Number(((net / eq) * 100).toFixed(1)) : 0,
      roa: assets > 0 ? Number(((net / assets) * 100).toFixed(1)) : 0,
      efficiency: rev > 0 ? Number(((cost / rev) * 100).toFixed(1)) : 0,
      equity: assets > 0 ? Number(((eq / assets) * 100).toFixed(1)) : 0,
      quick: curLiab > 0 ? Number(((curAssets - inv) / curLiab).toFixed(2)) : 0,
      quality: net !== 0 ? Number((ocf / net).toFixed(2)) : 0,
      collection: rev > 0 ? Math.round((rec / rev) * 365) : 0,
      debt: assets > 0 ? Number(((liab / assets) * 100).toFixed(1)) : 0,
    };
  };

  const cR = calcRatios(currFin);
  const pR = calcRatios(prevFin);

  store.ratiosDef = [
    { id: 'roe', title: 'ROE (بازده حقوق مالکانه)', current: cR.roe, prev: pR.roe, comp: 0, unit: '٪', isGoodUp: true },
    { id: 'roa', title: 'ROA (بازده دارایی‌ها)', current: cR.roa, prev: pR.roa, comp: 0, unit: '٪', isGoodUp: true },
    { id: 'efficiency', title: 'بهای تمام‌شده به درآمد', current: cR.efficiency, prev: pR.efficiency, comp: 0, unit: '٪', isGoodUp: false },
    { id: 'equity', title: 'نسبت مالکانه', current: cR.equity, prev: pR.equity, comp: 0, unit: '٪', isGoodUp: true },
    { id: 'quick', title: 'نسبت آنی (Quick)', current: cR.quick, prev: pR.quick, comp: 0, unit: '', isGoodUp: true },
    { id: 'quality', title: 'کیفیت سود (OCF/NI)', current: cR.quality, prev: pR.quality, comp: 0, unit: '', isGoodUp: true },
    { id: 'collection', title: 'دوره وصول مطالبات', current: cR.collection, prev: pR.collection, comp: 0, unit: ' روز', isGoodUp: false },
    { id: 'debt', title: 'بدهی به دارایی', current: cR.debt, prev: pR.debt, comp: 0, unit: '٪', isGoodUp: false },
  ];

  const rawInterps: any[] = Array.isArray(archiveJson?.interpretive_reports) ? archiveJson.interpretive_reports : [];
  const interpretiveList = rawInterps.map((it) => {
    const rawPath = it.pdf_url ? String(it.pdf_url) : '';
    const cleanPdfUrl = rawPath.startsWith('./') ? '/' + rawPath.slice(2) : rawPath;
    return {
      period: it.period || 'دوره مالی',
      pdfUrl: cleanPdfUrl,
      publishDate: it.publish_date || '',
      highlights: [
        `عنوان سند رسمی: ${it.title || 'گزارش تفسیری مدیریت'}`,
        `تاریخ انتشار در کدال: ${it.publish_date || '-'}`,
        cleanPdfUrl
          ? 'فایل PDF اصلی دانلود شده و از دکمه قرمز بالای همین کادر قابل باز کردن است.'
          : 'فایل PDF این دوره هنوز دانلود نشده است.',
      ],
    };
  });

  const rawDisclosures: any[] = Array.isArray(archiveJson?.important_disclosures) ? archiveJson.important_disclosures : [];
  const disclosuresList = rawDisclosures.map((d, i) => ({
    id: `${ticker}_disc_${i}`,
    group: String(d.group || '').includes('الف') ? 'الف' : 'ب',
    date: d.publish_date || '',
    impact: String(d.group || '').includes('الف') ? 'بااهمیت بالا (گروه الف)' : 'اطلاع‌رسانی (گروه ب)',
    link: d.codal_url || '',
    simpleSummary: d.title || '',
    aiTranslation: `اطلاعیه رسمی ${d.group || ''} منتشرشده در تاریخ ${d.publish_date || '-'} در سامانه کدال.`,
  }));

  const codalAnnouncements = [
    ...finList.map((f) => ({
      title: f.title || `صورت مالی ${f.period}`,
      code: 'ن-۱۰',
      date_publish: f.publish_date || '',
      date_title: f.period || '',
    })),
    ...monthlySales.map((m) => ({
      title: m.title || `گزارش فعالیت ماهانه ${m.period}`,
      code: 'ن-۳۰',
      date_publish: m.publish_date || '',
      date_title: m.period || '',
    })),
  ];

  store.lastExcelFileName = `دیتابیس آفلاین کدال (${ticker}_Archive.json)`;
  store.lastExcelUploadDate = archiveJson?.meta?.generated_at?.slice(0, 10) || '';

  return {
    profile: baseProfile,
    fundStore: store,
    interpretiveList,
    disclosuresList,
    codalAnnouncements,
  };
}
"""

with open("src/utils/offlineArchiveAdapter.ts", "w", encoding="utf-8") as f:
    f.write(adapter_code)

# ۲. یکتا‌سازی لیست نمادها در src/App.tsx تا «نان» و «کالا» دوبار نمایش داده نشوند
bak_path = "src/App.tsx.bak"
src_path = "src/App.tsx"
with open(bak_path if os.path.exists(bak_path) else src_path, "r", encoding="utf-8") as f:
    app_code = f.read()

if "mapPythonArchiveToDashboard" not in app_code:
    target_import = "import { parseCodalExcelBuffer, PERSIAN_MONTHS, normalizeDigits } from './utils/excelParser';"
    new_import = target_import + "\nimport { mapPythonArchiveToDashboard } from './utils/offlineArchiveAdapter';"
    app_code = app_code.replace(target_import, new_import, 1)

    target_effect = "  }, [selectedSymbol]);\n\n  useEffect(() => { setCodalPage(1); }, [codalSearch, codalYearFilter]);"
    new_effects = """  }, [selectedSymbol]);

  useEffect(() => {
    fetch('/Dashboard_Data/index.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((indexList) => {
        if (!Array.isArray(indexList) || indexList.length === 0) return;
        setSymbolsRegistry((prev) => {
          const next: Record<string, SymbolProfile> = {};
          for (const meta of indexList) {
            const t = String(meta.ticker || '').trim();
            if (!t) continue;
            const existing = Object.values(prev).find((item) => item.ticker === t);
            next[t] = existing
              ? { ...existing, key: t, tseIndustryGroup: meta.industry || existing.tseIndustryGroup }
              : createDynamicSymbolProfile(t, `شرکت ${t}`, meta.industry || 'سایر صنایع بورس');
          }
          return Object.keys(next).length > 0 ? next : prev;
        });
        const firstTicker = String(indexList[0].ticker || '').trim();
        if (firstTicker) setSelectedSymbol(firstTicker);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tickerName = activeConfig?.ticker || selectedSymbol;
    if (!tickerName) return;

    fetch(`/Dashboard_Data/${encodeURIComponent(tickerName)}_Archive.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((rawArchive) => {
        if (!rawArchive) return;
        const mapped = mapPythonArchiveToDashboard(rawArchive);
        setFundStore(mapped.fundStore);
        setInterpretiveList(mapped.interpretiveList);
        setLiveDisclosures(mapped.disclosuresList);
        setCodalList(mapped.codalAnnouncements);
        setCodalStatus({
          type: 'success',
          text: `دیتابیس آفلاین ${tickerName} بارگذاری شد (${rawArchive.meta?.counts?.monthly_sales || 0} ماهانه | ${rawArchive.meta?.counts?.financial_statements || 0} صورت مالی | ${rawArchive.meta?.counts?.interpretive_reports || 0} PDF تفسیری)`
        });
      })
      .catch(() => {});
  }, [selectedSymbol]);

  useEffect(() => { setCodalPage(1); }, [codalSearch, codalYearFilter]);"""
    app_code = app_code.replace(target_effect, new_effects, 1)

    target_interp = """                {interpretiveList[selectedPeriodIdx] && (
                  <div className={`p-4 rounded-xl border space-y-3 ${subCardStyle}`}>"""
    new_interp = """                {interpretiveList[selectedPeriodIdx] && (
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
                    )}"""
    app_code = app_code.replace(target_interp, new_interp, 1)

with open(src_path, "w", encoding="utf-8") as f:
    f.write(app_code)

# ۳. ساخت فایل اجرای سریع ویندوز (.bat)
with open("اجرای_داشبورد.bat", "w", encoding="utf-8") as f:
    f.write("@echo off\nchcp 65001 > nul\ncd /d \"%~dp0\"\nnpm run dev\npause\n")

print("[+] اصلاحات انجام شد و فایل اجرای_داشبورد.bat ساخته شد.")