export type SymbolKey = string;

export const API_KEY = '';

export const EXCLUDED_CODAL_KEYWORDS = [
  'فعالیت هیئت مدیره',
  'فعالیت هیات مدیره',
  'کنترل های داخلی',
  'کنترل‌های داخلی',
  'زمانبندی پرداخت سود',
  'زمان بندی پرداخت سود'
];

export const isAllowedCodalAnnouncement = (title: string) => {
  if (!title) return false;
  return !EXCLUDED_CODAL_KEYWORDS.some((kw) => title.includes(kw));
};

// گروه‌های صنعتی رسمی بورس و فرابورس (TSE) برای دسته‌بندی ۷۰۰ نماد و تحلیل آینده صنایع
export const TSE_INDUSTRY_GROUPS = [
  'همه گروه‌های صنعتی',
  'اداره بازارهای مالی',
  'محصولات غذایی و آشامیدنی به جز قند و شکر',
  'فلزات اساسی',
  'فرآورده‌های نفتی، کک و سوخت هسته‌ای',
  'محصولات شیمیایی',
  'بانک‌ها و مؤسسات اعتباری',
  'خودرو و ساخت قطعات',
  'استخراج کانه‌های فلزی',
  'سرمایه‌گذاری‌ها',
  'مواد و محصولات دارویی',
  'سیمان، آهک و گچ'
];

export const createEmptyFundamentalStore = (periodLabel = 'دوره جاری ۱۴۰۵') => ({
  lastExcelFileName: null as string | null,
  lastExcelUploadDate: null as string | null,
  incomeData: [
    { month: 'فروردین', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'اردیبهشت', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'خرداد', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'تیر', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'مرداد', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'شهریور', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'مهر', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'آبان', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'آذر', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'دی', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'بهمن', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
    { month: 'اسفند', year1403: 0, year1404: 0, year1405: null as number | null, comp1405: null },
  ],
  annualBreakdownData: [
    { year: '۱۴۰۱', fees: 0, warehousing: 0, compFees: 0, compWarehousing: 0 },
    { year: '۱۴۰۲', fees: 0, warehousing: 0, compFees: 0, compWarehousing: 0 },
    { year: '۱۴۰۳', fees: 0, warehousing: 0, compFees: 0, compWarehousing: 0 },
    { year: '۱۴۰۴', fees: 0, warehousing: 0, compFees: 0, compWarehousing: 0 },
    { year: '۱۴۰۵', fees: 0, warehousing: 0, compFees: 0, compWarehousing: 0 },
  ],
  annualIncomeData: [
    { year: '۱۴۰۱', value: 0, netProfit: 0, compValue: 0, compNetProfit: 0 },
    { year: '۱۴۰۲', value: 0, netProfit: 0, compValue: 0, compNetProfit: 0 },
    { year: '۱۴۰۳', value: 0, netProfit: 0, compValue: 0, compNetProfit: 0 },
    { year: '۱۴۰۴', value: 0, netProfit: 0, compValue: 0, compNetProfit: 0 },
    { year: '۱۴۰۵', value: 0, netProfit: 0, compValue: 0, compNetProfit: 0 },
  ],
  pbData: [
    { year: '۱۴۰۱', value: 0, compValue: 0 },
    { year: '۱۴۰۲', value: 0, compValue: 0 },
    { year: '۱۴۰۳', value: 0, compValue: 0 },
    { year: '۱۴۰۴', value: 0, compValue: 0 },
    { year: '۱۴۰۵', value: 0, compValue: 0 },
  ],
  netMarginData: [
    { year: '۱۴۰۱', value: 0, compValue: 0 },
    { year: '۱۴۰۲', value: 0, compValue: 0 },
    { year: '۱۴۰۳', value: 0, compValue: 0 },
    { year: '۱۴۰۴', value: 0, compValue: 0 },
    { year: '۱۴۰۵', value: 0, compValue: 0 },
  ],
  opMarginData: [
    { year: '۱۴۰۱', value: 0, compValue: 0 },
    { year: '۱۴۰۲', value: 0, compValue: 0 },
    { year: '۱۴۰۳', value: 0, compValue: 0 },
    { year: '۱۴۰۴', value: 0, compValue: 0 },
    { year: '۱۴۰۵', value: 0, compValue: 0 },
  ],
  roeData: [
    { year: '۱۴۰۱', value: 0, compValue: 0 },
    { year: '۱۴۰۲', value: 0, compValue: 0 },
    { year: '۱۴۰۳', value: 0, compValue: 0 },
    { year: '۱۴۰۴', value: 0, compValue: 0 },
    { year: '۱۴۰۵', value: 0, compValue: 0 },
  ],
  efficiencyData: [
    { year: '۱۴۰۱', value: 0, compValue: 0 },
    { year: '۱۴۰۲', value: 0, compValue: 0 },
    { year: '۱۴۰۳', value: 0, compValue: 0 },
    { year: '۱۴۰۴', value: 0, compValue: 0 },
    { year: '۱۴۰۵', value: 0, compValue: 0 },
  ],
  cashFlowData: [
    { year: '۱۴۰۱', value: 0, compValue: 0 },
    { year: '۱۴۰۲', value: 0, compValue: 0 },
    { year: '۱۴۰۳', value: 0, compValue: 0 },
    { year: '۱۴۰۴', value: 0, compValue: 0 },
    { year: '۱۴۰۵', value: 0, compValue: 0 },
  ],
  balanceSheetData: [
    { year: '۱۴۰۱', liabilities: 0, equity: 0, compLiab: 0, compEq: 0 },
    { year: '۱۴۰۲', liabilities: 0, equity: 0, compLiab: 0, compEq: 0 },
    { year: '۱۴۰۳', liabilities: 0, equity: 0, compLiab: 0, compEq: 0 },
    { year: '۱۴۰۴', liabilities: 0, equity: 0, compLiab: 0, compEq: 0 },
  ],
  interimReport: {
    periodLabel,
    revenue: 0,
    adminCost: 0,
    opProfit: 0,
    opMargin: 20,
    otherIncome: 0,
    tax: 0,
    netProfit: 0,
    netMargin: 15
  },
  ratiosDef: [
    { id: 'roe', title: 'ROE (بازده حقوق مالکانه)', current: 0, prev: 0, comp: 0, unit: '٪', isGoodUp: true },
    { id: 'roa', title: 'ROA (بازده دارایی‌ها)', current: 0, prev: 0, comp: 0, unit: '٪', isGoodUp: true },
    { id: 'efficiency', title: 'نسبت کارایی', current: 0, prev: 0, comp: 0, unit: '٪', isGoodUp: false },
    { id: 'equity', title: 'نسبت مالکانه', current: 0, prev: 0, comp: 0, unit: '٪', isGoodUp: true },
    { id: 'quick', title: 'نسبت آنی', current: 0, prev: 0, comp: 0, unit: '', isGoodUp: true },
    { id: 'quality', title: 'کیفیت سود', current: 0, prev: 0, comp: 0, unit: '', isGoodUp: true },
    { id: 'collection', title: 'دوره وصول مطالبات', current: 0, prev: 0, comp: 0, unit: ' روز', isGoodUp: false },
    { id: 'debt', title: 'بدهی به دارایی', current: 0, prev: 0, comp: 0, unit: '٪', isGoodUp: false },
  ]
});

export const KALA_FUNDAMENTAL_STORE = {
  lastExcelFileName: null as string | null,
  lastExcelUploadDate: null as string | null,
  incomeData: [
    { month: 'فروردین', year1403: 112.6, year1404: 216.2, year1405: 380.7, comp1405: 250 },
    { month: 'اردیبهشت', year1403: 120.6, year1404: 252.4, year1405: 863.6, comp1405: 310 },
    { month: 'خرداد', year1403: 104.7, year1404: 170.2, year1405: 667.5, comp1405: 280 },
    { month: 'تیر', year1403: 102.7, year1404: 236.3, year1405: 604.1, comp1405: 290 },
    { month: 'مرداد', year1403: 113.8, year1404: 261.5, year1405: 695.6, comp1405: 330 },
    { month: 'شهریور', year1403: 103.3, year1404: 329.3, year1405: 956.9, comp1405: 410 },
    { month: 'مهر', year1403: 154.2, year1404: 347.9, year1405: 1000.4, comp1405: 450 },
    { month: 'آبان', year1403: 162.1, year1404: 485.6, year1405: null, comp1405: null },
    { month: 'آذر', year1403: 163.4, year1404: 552.0, year1405: null, comp1405: null },
    { month: 'دی', year1403: 178.3, year1404: 580.0, year1405: null, comp1405: null },
    { month: 'بهمن', year1403: 214.0, year1404: 580.0, year1405: null, comp1405: null },
    { month: 'اسفند', year1403: 221.4, year1404: 379.1, year1405: null, comp1405: null },
  ],
  annualBreakdownData: [
    { year: '۱۴۰۱', fees: 645, warehousing: 0, compFees: 520, compWarehousing: 0 },
    { year: '۱۴۰۲', fees: 1012, warehousing: 0, compFees: 850, compWarehousing: 0 },
    { year: '۱۴۰۳', fees: 1505, warehousing: 192, compFees: 1100, compWarehousing: 0 },
    { year: '۱۴۰۴', fees: 2981, warehousing: 1175, compFees: 2400, compWarehousing: 0 },
    { year: '۱۴۰۵', fees: 3049, warehousing: 2067, compFees: 3100, compWarehousing: 0 },
  ],
  annualIncomeData: [
    { year: '۱۴۰۱', value: 659, netProfit: 680, compValue: 750, compNetProfit: 350 },
    { year: '۱۴۰۲', value: 1055, netProfit: 1057, compValue: 1100, compNetProfit: 550 },
    { year: '۱۴۰۳', value: 1751, netProfit: 2429, compValue: 1650, compNetProfit: 850 },
    { year: '۱۴۰۴', value: 4199, netProfit: 4367, compValue: 3100, compNetProfit: 1400 },
    { year: '۱۴۰۵', value: 5168, netProfit: 6500, compValue: 4200, compNetProfit: 2100 },
  ],
  pbData: [
    { year: '۱۴۰۱', value: 84.0, compValue: 5.5 },
    { year: '۱۴۰۲', value: 23.1, compValue: 5.8 },
    { year: '۱۴۰۳', value: 9.1, compValue: 6.1 },
    { year: '۱۴۰۴', value: 6.5, compValue: 6.8 },
    { year: '۱۴۰۵', value: 7.1, compValue: 7.3 },
  ],
  netMarginData: [
    { year: '۱۴۰۱', value: 103, compValue: 46 },
    { year: '۱۴۰۲', value: 100, compValue: 50 },
    { year: '۱۴۰۳', value: 138, compValue: 51 },
    { year: '۱۴۰۴', value: 104, compValue: 45 },
    { year: '۱۴۰۵', value: 103, compValue: 50 },
  ],
  opMarginData: [
    { year: '۱۴۰۱', value: 73, compValue: 40 },
    { year: '۱۴۰۲', value: 71, compValue: 42 },
    { year: '۱۴۰۳', value: 66, compValue: 45 },
    { year: '۱۴۰۴', value: 69, compValue: 41 },
    { year: '۱۴۰۵', value: 75, compValue: 43 },
  ],
  roeData: [
    { year: '۱۴۰۱', value: 45.0, compValue: 32 },
    { year: '۱۴۰۲', value: 42.7, compValue: 35 },
    { year: '۱۴۰۳', value: 51.1, compValue: 38 },
    { year: '۱۴۰۴', value: 50.0, compValue: 31 },
    { year: '۱۴۰۵', value: 62.6, compValue: 34 },
  ],
  efficiencyData: [
    { year: '۱۴۰۱', value: 26.8, compValue: 35.0 },
    { year: '۱۴۰۲', value: 29.0, compValue: 38.0 },
    { year: '۱۴۰۳', value: 33.4, compValue: 42.0 },
    { year: '۱۴۰۴', value: 30.5, compValue: 40.0 },
    { year: '۱۴۰۵', value: 24.6, compValue: 45.0 },
  ],
  cashFlowData: [
    { year: '۱۴۰۱', value: 774, compValue: 400 },
    { year: '۱۴۰۲', value: 1139, compValue: 600 },
    { year: '۱۴۰۳', value: 1588, compValue: 1100 },
    { year: '۱۴۰۴', value: 3149, compValue: 1800 },
    { year: '۱۴۰۵', value: 3850, compValue: 2400 },
  ],
  balanceSheetData: [
    { year: '۱۴۰۱', liabilities: 568.4, equity: 1512.3, compLiab: 400, compEq: 1200 },
    { year: '۱۴۰۲', liabilities: 978.0, equity: 2476.7, compLiab: 650, compEq: 1800 },
    { year: '۱۴۰۳', liabilities: 1363.0, equity: 4757.9, compLiab: 1100, compEq: 2900 },
    { year: '۱۴۰۴', liabilities: 1814.4, equity: 8735.2, compLiab: 1600, compEq: 4500 },
  ],
  interimReport: {
    periodLabel: '۶ ماهه ۱۴۰۵ (جاری)',
    revenue: 4168.4,
    adminCost: 1023.8,
    opProfit: 3144.5,
    opMargin: 75,
    otherIncome: 1784.7,
    tax: 596.3,
    netProfit: 4295.3,
    netMargin: 103
  },
  ratiosDef: [
    { id: 'roe', title: 'ROE (بازده حقوق مالکانه)', current: 62.6, prev: 50.0, comp: 34.1, unit: '٪', isGoodUp: true },
    { id: 'roa', title: 'ROA (بازده دارایی‌ها)', current: 41.3, prev: 39.7, comp: 22.5, unit: '٪', isGoodUp: true },
    { id: 'efficiency', title: 'نسبت کارایی', current: 24.6, prev: 30.5, comp: 55.0, unit: '٪', isGoodUp: false },
    { id: 'equity', title: 'نسبت مالکانه', current: 82.7, prev: 77.7, comp: 65.4, unit: '٪', isGoodUp: true },
    { id: 'quick', title: 'نسبت آنی', current: 1.15, prev: 1.02, comp: 0.95, unit: '', isGoodUp: true },
    { id: 'quality', title: 'کیفیت سود', current: 0.87, prev: 0.80, comp: 1.05, unit: '', isGoodUp: true },
    { id: 'collection', title: 'دوره وصول مطالبات', current: 35, prev: 42, comp: 58, unit: ' روز', isGoodUp: false },
    { id: 'debt', title: 'بدهی به دارایی', current: 17.1, prev: 22.2, comp: 34.6, unit: '٪', isGoodUp: false },
  ]
};

export const NAN_FUNDAMENTAL_STORE = {
  ...createEmptyFundamentalStore('۶ ماهه ۱۴۰۵ (نماد نان)'),
  incomeData: [
    { month: 'فروردین', year1403: 0, year1404: 580, year1405: null, comp1405: null },
    { month: 'اردیبهشت', year1403: 0, year1404: 610, year1405: null, comp1405: null },
    { month: 'خرداد', year1403: 0, year1404: 640, year1405: null, comp1405: null },
    { month: 'تیر', year1403: 0, year1404: 675, year1405: null, comp1405: null },
    { month: 'مرداد', year1403: 0, year1404: 710, year1405: null, comp1405: null },
    { month: 'شهریور', year1403: 0, year1404: 745, year1405: null, comp1405: null },
    { month: 'مهر', year1403: 0, year1404: 780, year1405: 978.8, comp1405: null },
    { month: 'آبان', year1403: 0, year1404: 810, year1405: null, comp1405: null },
    { month: 'آذر', year1403: 0, year1404: 840, year1405: null, comp1405: null },
    { month: 'دی', year1403: 0, year1404: 860, year1405: null, comp1405: null },
    { month: 'بهمن', year1403: 0, year1404: 890, year1405: null, comp1405: null },
    { month: 'اسفند', year1403: 0, year1404: 920, year1405: null, comp1405: null },
  ],
  annualIncomeData: [
    { year: '۱۴۰۱', value: 2520, netProfit: 310, compValue: 2200, compNetProfit: 260 },
    { year: '۱۴۰۲', value: 3830, netProfit: 490, compValue: 3350, compNetProfit: 410 },
    { year: '۱۴۰۳', value: 5660, netProfit: 780, compValue: 5010, compNetProfit: 640 },
    { year: '۱۴۰۴', value: 9060, netProfit: 1290, compValue: 7820, compNetProfit: 1050 },
    { year: '۱۴۰۵', value: 11740, netProfit: 1680, compValue: 10210, compNetProfit: 1380 },
  ],
  netMarginData: [
    { year: '۱۴۰۱', value: 12.3, compValue: 11.8 },
    { year: '۱۴۰۲', value: 12.8, compValue: 12.2 },
    { year: '۱۴۰۳', value: 13.8, compValue: 12.8 },
    { year: '۱۴۰۴', value: 14.2, compValue: 13.4 },
    { year: '۱۴۰۵', value: 14.3, compValue: 13.5 },
  ],
  opMarginData: [
    { year: '۱۴۰۱', value: 16.5, compValue: 15.0 },
    { year: '۱۴۰۲', value: 17.2, compValue: 15.8 },
    { year: '۱۴۰۳', value: 18.1, compValue: 16.4 },
    { year: '۱۴۰۴', value: 18.8, compValue: 17.0 },
    { year: '۱۴۰۵', value: 19.0, compValue: 17.2 },
  ],
  roeData: [
    { year: '۱۴۰۱', value: 28.0, compValue: 25.0 },
    { year: '۱۴۰۲', value: 31.5, compValue: 27.5 },
    { year: '۱۴۰۳', value: 34.0, compValue: 29.0 },
    { year: '۱۴۰۴', value: 36.2, compValue: 31.0 },
    { year: '۱۴۰۵', value: 38.0, compValue: 32.5 },
  ],
  interimReport: {
    periodLabel: '۶ ماهه ۱۴۰۵ (نماد نان)',
    revenue: 5620.0,
    adminCost: 534.0,
    opProfit: 1068.0,
    opMargin: 19,
    otherIncome: 45.0,
    tax: 198.0,
    netProfit: 804.0,
    netMargin: 14.3
  },
  ratiosDef: [
    { id: 'roe', title: 'ROE (بازده حقوق مالکانه)', current: 38.0, prev: 36.2, comp: 32.5, unit: '٪', isGoodUp: true },
    { id: 'roa', title: 'ROA (بازده دارایی‌ها)', current: 21.5, prev: 20.1, comp: 18.4, unit: '٪', isGoodUp: true },
    { id: 'efficiency', title: 'نسبت کارایی', current: 9.5, prev: 9.8, comp: 11.2, unit: '٪', isGoodUp: false },
    { id: 'equity', title: 'نسبت مالکانه', current: 55.3, prev: 53.8, comp: 54.8, unit: '٪', isGoodUp: true },
    { id: 'quick', title: 'نسبت آنی', current: 1.08, prev: 1.04, comp: 0.98, unit: '', isGoodUp: true },
    { id: 'quality', title: 'کیفیت سود', current: 0.91, prev: 0.89, comp: 0.88, unit: '', isGoodUp: true },
    { id: 'collection', title: 'دوره وصول مطالبات', current: 28, prev: 31, comp: 36, unit: ' روز', isGoodUp: false },
    { id: 'debt', title: 'بدهی به دارایی', current: 44.7, prev: 46.2, comp: 45.2, unit: '٪', isGoodUp: false },
  ]
};

export interface SymbolProfile {
  key: string;
  ticker: string;
  apiL18: string;
  fullName: string;
  tseIndustryGroup: string;
  monopolyBadge: string;
  description: string;
  pillars: { title: string; desc: string; color: string }[];
  shareholders: { name: string; percent: number; color: string }[];
  defaultFundamental: any;
  defaultLive: any;
  defaultCodal: any[];
  defaultInterpretive: any[];
  defaultDisclosures: any[];
  defaultValInputs: any;
}

// تابع سازنده استاندارد برای هر یک از ۷۰۰ نماد بازار سرمایه از روی API بورس
export function createDynamicSymbolProfile(
  ticker: string,
  fullName = '',
  tseIndustryGroup = 'سایر صنایع بورس'
): SymbolProfile {
  const cleanTicker = ticker.trim();
  const displayFullName = fullName.trim() || `شرکت ${cleanTicker}`;
  return {
    key: cleanTicker,
    ticker: cleanTicker,
    apiL18: cleanTicker,
    fullName: displayFullName,
    tseIndustryGroup,
    monopolyBadge: `گروه صنعت: ${tseIndustryGroup}`,
    description: `اطلاعات بنیادی، مالی و تابلو معاملاتی «${cleanTicker} (${displayFullName})» در گروه صنعتی «${tseIndustryGroup}». برای دریافت آخرین قیمت و سهامداران دکمه «به‌روزرسانی تابلو» و برای بارگذاری صورت‌های مالی دکمه «همگام‌سازی کدال» را بزنید.`,
    pillars: [
      { title: '۱. هسته درآمدی و عملیاتی', desc: 'تحلیل ترکیب فروش داخلی، صادراتی و ارائه خدمات بر اساس گزارش‌های فعالیت ماهانه (ن-۳۰).', color: 'text-amber-500' },
      { title: '۲. ساختار ترازنامه و نقدینگی', desc: 'پایش حقوق مالکانه، اهرم بدهی و جریان نقد عملیاتی از محل صورت‌های مالی میاندوره‌ای و سالانه (ن-۱۰).', color: 'text-blue-400' },
      { title: '۳. محرک‌های سودآوری و نرخ', desc: 'بررسی افشاهای بااهمیت گروه الف و ب و حساسیت سود هر سهم (EPS) به نرخ‌های فروش.', color: 'text-emerald-400' }
    ],
    shareholders: [
      { name: 'سهامداران عمده و حقوقی', percent: 65.0, color: '#f59e0b' },
      { name: 'سهام شناور آزاد در بازار', percent: 35.0, color: '#10b981' },
    ],
    defaultFundamental: createEmptyFundamentalStore(`دوره جاری (${cleanTicker})`),
    defaultLive: {
      date_update: '-',
      time: '-',
      state: 'مجاز',
      l18: cleanTicker,
      l30: displayFullName,
      isin: '-',
      m: 'بورس / فرابورس',
      m_board: 'تابلوی معاملاتی بورس',
      cs_sub: tseIndustryGroup,
      z: 1000000000,
      mv: 0,
      ff: 35,
      eps: 0,
      pe: 0,
      g_pe: 0,
      pmin_1y: 0,
      pmax_1y: 0,
      pc: 0,
      pcp: 0,
      tvol: 0,
      tval: 0,
    },
    defaultCodal: [],
    defaultInterpretive: [
      {
        period: `گزارش‌های تفسیری (${cleanTicker})`,
        status: 'آماده تکمیل و همگام‌سازی',
        highlights: [
          'دکمه «همگام‌سازی کدال» را بزنید تا آرشیو کامل گزارش‌های شرکت دریافت شود.',
          'نکات کلیدی گزارش تفسیری مدیریت را می‌توانید در همین بخش ثبت و ذخیره کنید.'
        ],
        risksAndPlans: 'بررسی ریسک‌های عملیاتی و برنامه‌های توسعه‌ای شرکت.'
      }
    ],
    defaultDisclosures: [],
    defaultValInputs: {
      sharesCountBillion: 1,
      wacc: 33,
      costOfEquity: 36,
      terminalGrowth: 19,
      baseFCFF: 100,
      baseFCFE: 100,
      fcfGrowth5Y: 25,
      netCash: 0,
      nextDps: 100,
      dividendGrowth: 20,
      forwardEps: 150,
      targetPE: 8.5,
      bookValuePerShare: 1000,
      targetPB: 2.5,
    }
  };
}

export const SYMBOLS_CONFIG: Record<string, SymbolProfile> = {
  kala: {
    key: 'kala',
    ticker: 'کالا',
    apiL18: 'کالا',
    fullName: 'بورس کالای ایران',
    tseIndustryGroup: 'اداره بازارهای مالی',
    monopolyBadge: 'انحصار قانونی بازار کالا',
    description: 'شرکت بورس کالای ایران (سهامی عام) به عنوان تنها نهاد متولی و مجری معاملات کالایی و ابزارهای مالی مبتنی بر کالا در کشور، یکی از شفاف‌ترین مدل‌های کسب‌وکار با حاشیه سود عملیاتی بالای ۷۰٪ و بدون اهرم بدهی بانکی را در بازار سرمایه ایران داراست.',
    pillars: [
      { title: '۱. بازار فیزیکی و صادراتی', desc: 'پذیرش و معاملات محصولات صنعتی، معدنی (فولاد، مس، آلومینیوم)، پتروشیمی و کشاورزی در رینگ‌های داخلی و صادراتی.', color: 'text-amber-500' },
      { title: '۲. انبارداری و گواهی سپرده', desc: 'موتور رشد جدید شرکت؛ کسب درآمد مستمر از محل مدیریت انبارهای پذیرش‌شده، صدور گواهی سپرده کالایی و ثبت سفارش.', color: 'text-blue-400' },
      { title: '۳. ابزارهای مشتقه و مالی', desc: 'راه‌اندازی و تسویه قراردادهای آتی، اختیار معامله و صندوق‌های کالایی به همراه درآمدهای پایدار سود سپرده‌های تضمین.', color: 'text-emerald-400' }
    ],
    shareholders: [
      { name: 'شرکت‌های سرمایه‌گذاری و هلدینگ‌های مالی', percent: 26.5, color: '#f59e0b' },
      { name: 'بانک‌ها و مؤسسات اعتباری', percent: 21.0, color: '#3b82f6' },
      { name: 'شرکت‌های کارگزاری عضو بورس', percent: 18.5, color: '#10b981' },
      { name: 'صندوق‌های سرمایه‌گذاری و نهادهای مالی', percent: 16.0, color: '#8b5cf6' },
      { name: 'سایر سهامداران حقیقی و حقوقی (شناور)', percent: 18.0, color: '#64748b' },
    ],
    defaultFundamental: KALA_FUNDAMENTAL_STORE,
    defaultLive: {
      date_update: "1405-08-24",
      time: "11:08:36",
      state: "مجاز",
      l18: "کالا",
      l30: "بورس کالای ایران",
      isin: "IRO1KALA0001",
      m: "بورس",
      m_board: "بازار اول (تابلوی اصلی) بورس",
      cs_sub: "اداره بازارهای مالی",
      z: 62000000000,
      mv: 833900000000000,
      ff: 94,
      eps: 1158,
      pe: 11.61,
      g_pe: 5.89,
      pmin_1y: 6590,
      pmax_1y: 14740,
      pc: 13450,
      pcp: 2.36,
      tvol: 56406095,
      tval: 758651695540,
    },
    defaultCodal: [
      {
        title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)",
        code: "ن-۱۰",
        date_title: "۱۴۰۵/۰۶/۳۱",
        date_publish: "۱۴۰۵/۰۷/۲۸",
        link: "https://codal.ir/Reports/Decision.aspx?LetterSerial=XWBd8vpu6CSxFH2vWrw5TA%3d%3d&rt=5&let=6&ct=0&ft=-1",
        link_pdf: "https://codal.ir/DownloadFile.aspx?hs=XWBd8vpu6CSxFH2vWrw5TA%3d%3d&ft=1005&let=6",
        link_excel: "https://excel.codal.ir/service/Excel/GetAll/XWBd8vpu6CSxFH2vWrw5TA%3d%3d/0",
      }
    ],
    defaultInterpretive: [
      {
        period: '۶ ماهه نخست ۱۴۰۵',
        status: 'حسابرسی نشده (جاری)',
        highlights: [
          'جهش ۱۸۴ درصدی درآمدهای عملیاتی در ۶ ماهه نخست ۱۴۰۵ به ۴,۱۶۸.۴ میلیارد تومان نسبت به دوره مشابه سال قبل.',
          'رشد چشمگیر درآمدهای انبارداری و ثبت سفارش و رسیدن حاشیه سود عملیاتی به ۷۵٪.',
          'تحقق ۴,۲۹۵.۳ میلیارد تومان سود خالص در ۶ ماهه که تقریباً معادل کل سود خالص ۱۲ ماهه سال ۱۴۰۴ است.'
        ],
        risksAndPlans: 'تداوم رشد ارزش معاملات در رینگ صادراتی و داخلی و افزایش ظرفیت انبارهای تحت نظارت.'
      },
      {
        period: 'سال مالی ۱۴۰۴',
        status: 'حسابرسی شده (۱۲ ماهه)',
        highlights: [
          'عبور درآمدهای عملیاتی سالانه از مرز ۴,۱۹۹ میلیارد تومان (رشد ۱۴۰ درصدی نسبت به سال ۱۴۰۳).',
          'سهم درآمد انبارداری به ۱,۱۷۵ میلیارد تومان رسید (حدود ۲۸٪ از کل ترکیب درآمدی شرکت).'
        ],
        risksAndPlans: 'توسعه ابزارهای مالی مشتقه (اختیار معامله و آتی) و گواهی سپرده کالایی.'
      }
    ],
    defaultDisclosures: [
      {
        id: 1,
        group: 'الف',
        date: '۱۴۰۵/۰۷/۲۸',
        code: 'ن-۲۰',
        rawTitle: 'افشای اطلاعات بااهمیت - تغییر بیش از ۲۰ درصدی سود عملیاتی دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (گروه الف)',
        simpleSummary: 'سود عملیاتی شرکت در نیمه اول سال ۱۴۰۵ بیش از ۱۹۰ درصد نسبت به سال قبل رشد کرده است.',
        aiTranslation: 'وقتی سود عملیاتی یک شرکت بیشتر از ۲۰ درصد تغییر کند، قانون بورس شرکت را موظف به توضیح می‌کند. در اینجا علت کاملاً بنیادی و مثبت است: جهش ارزش معاملات فیزیکی و رشد درآمد انبارداری.',
        impact: 'مثبت قوی',
        impactType: 'positive'
      },
      {
        id: 2,
        group: 'ب',
        date: '۱۴۰۵/۰۳/۰۴',
        code: 'ن-۲۰',
        rawTitle: 'افشای اطلاعات بااهمیت - تغییر در مفاد اطلاعیه قبلی در خصوص نرخ کارمزد معاملات برخی کالاها (گروه ب)',
        simpleSummary: 'اصلاحیه جزئی در دستورالعمل سقف کارمزد معاملات چند ردیف کالایی ابلاغ شد.',
        aiTranslation: 'اطلاعیه‌های گروه ب اثر فوری و شدید بر قیمت سهم ندارند اما برای تحلیل‌گران مهم‌اند. این تغییر کارمزد اثر درآمدی محدودی دارد.',
        impact: 'خنثی / اثر محدود',
        impactType: 'neutral'
      }
    ],
    defaultValInputs: {
      sharesCountBillion: 62,
      wacc: 32,
      costOfEquity: 35,
      terminalGrowth: 18,
      baseFCFF: 5200,
      baseFCFE: 5400,
      fcfGrowth5Y: 26,
      netCash: 4500,
      nextDps: 950,
      dividendGrowth: 24,
      forwardEps: 1450,
      targetPE: 11.5,
      bookValuePerShare: 1650,
      targetPB: 8.5,
    }
  },
  nan: {
    key: 'nan',
    ticker: 'نان',
    apiL18: 'نان',
    fullName: 'صنایع غذایی رضوی',
    tseIndustryGroup: 'محصولات غذایی و آشامیدنی به جز قند و شکر',
    monopolyBadge: 'تولیدی / صنایع غذایی (نرخ‌محور)',
    description: 'شرکت صنایع غذایی نان قدس رضوی (نماد: نان) یکی از تولیدکنندگان مطرح انواع نان‌های صنعتی، بیسکویت، کیک و محصولات آردی در کشور است. سودآوری این شرکت به‌طور مستقیم به نرخ‌های فروش مصوب، بهای تمام‌شده آرد و روغن و ظرفیت تولید خطوط بستگی دارد.',
    pillars: [
      { title: '۱. تولید نان‌های حجیم و صنعتی', desc: 'تولید انواع نان تست، باگت و نان‌های رژیمی با شبکه توزیع مویرگی در سراسر کشور.', color: 'text-amber-500' },
      { title: '۲. محصولات کیک، بیسکویت و ویفر', desc: 'تنوع بالای محصولات شیرینی و بیسکویت با حاشیه سود بالاتر نسبت به نان‌های سنتی.', color: 'text-blue-400' },
      { title: '۳. حساسیت به افزایش نرخ فروش', desc: 'تعدیل نرخ‌های فروش محصولات در طول سال مهم‌ترین محرک جهش درآمد ماهانه و جبران تورم مواد اولیه است.', color: 'text-emerald-400' }
    ],
    shareholders: [
      { name: 'سازمان اقتصادی رضوی', percent: 51.0, color: '#f59e0b' },
      { name: 'شرکت‌های سرمایه‌گذاری و صندوق‌های بازار سرمایه', percent: 19.0, color: '#3b82f6' },
      { name: 'سهامداران حقیقی و حقوقی خرد (شناور)', percent: 30.0, color: '#10b981' },
    ],
    defaultFundamental: NAN_FUNDAMENTAL_STORE,
    defaultLive: {
      date_update: "1405-08-24",
      time: "12:30:00",
      state: "مجاز",
      l18: "نان",
      l30: "صنایع غذایی رضوی",
      isin: "IRO3GHNZ0001",
      m: "فرابورس",
      m_board: "بازار دوم فرابورس ایران",
      cs_sub: "محصولات غذایی و آشامیدنی به جز قند و شکر",
      z: 3500000000,
      mv: 24500000000000,
      ff: 30,
      eps: 680,
      pe: 10.29,
      g_pe: 11.40,
      pmin_1y: 4200,
      pmax_1y: 7850,
      pc: 7000,
      pcp: 1.45,
      tvol: 4250000,
      tval: 29750000000,
    },
    defaultCodal: [
      {
        title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۷/۳۰ (نماد نان)",
        code: "ن-۳۰",
        date_title: "۱۴۰۵/۰۷/۳۰",
        date_publish: "۱۴۰۵/۰۸/۰۵",
        link: "https://codal.ir",
        link_pdf: "",
        link_excel: "",
      }
    ],
    defaultInterpretive: [
      {
        period: 'عملکرد جاری ۱۴۰۵ (نماد نان)',
        status: 'آماده دریافت گزارش‌های کدال',
        highlights: [
          'برای دریافت آخرین صورت‌های مالی و گزارش‌های فعالیت ماهانه نماد «نان»، دکمه بنفش «همگام‌سازی کدال» در بالای صفحه را بزنید.',
          'فروش خالص مهرماه ۱۴۰۵ پس از کسر برگشت از فروش و تخفیفات معادل ۹۷۸.۸ میلیارد تومان ثبت شده است.'
        ],
        risksAndPlans: 'مدیریت بهای تمام‌شده مواد اولیه (آرد و روغن) و اخذ مجوزهای افزایش نرخ فروش محصولات.'
      }
    ],
    defaultDisclosures: [
      {
        id: 101,
        group: 'الف',
        date: '۱۴۰۵/۰۷/۱۵',
        code: 'ن-۲۰',
        rawTitle: 'افشای اطلاعات بااهمیت - تغییر بیش از ۱۰ درصدی نرخ فروش محصولات (گروه الف) - نماد نان',
        simpleSummary: 'نرخ فروش سبد محصولات نان صنعتی و بیسکویت شرکت بین ۱۵ تا ۲۲ درصد افزایش یافت.',
        aiTranslation: 'در شرکت‌های غذایی مثل «نان»، افزایش نرخ فروش مستقیماً حاشیه سود ناخالص را از فشار تورم مواد اولیه نجات می‌دهد و فروش ماهانه را در ماه‌های بعد جهش می‌دهد.',
        impact: 'مثبت قوی',
        impactType: 'positive'
      }
    ],
    defaultValInputs: {
      sharesCountBillion: 3.5,
      wacc: 33,
      costOfEquity: 36,
      terminalGrowth: 19,
      baseFCFF: 260,
      baseFCFE: 240,
      fcfGrowth5Y: 28,
      netCash: 80,
      nextDps: 450,
      dividendGrowth: 22,
      forwardEps: 820,
      targetPE: 10.5,
      bookValuePerShare: 1850,
      targetPB: 4.2,
    }
  }
};
