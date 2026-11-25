import { calculateRatios, ratioPeriods } from './financialRatios';
import {
  createEmptyFundamentalStore,
  createDynamicSymbolProfile,
  SYMBOLS_CONFIG,
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

const normalizeDigits = (str: string): string => {
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = String(str || '');
  for (let i = 0; i < 10; i++) {
    res = res.replace(new RegExp(persian[i], 'g'), String(i)).replace(new RegExp(arabic[i], 'g'), String(i));
  }
  return res;
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

/**
 * استخراج و خلاصه‌سازی هوشمند متن‌های طولانی افشای اطلاعات بدون حذف جزئیات کلیدی
 */
function summarizeRawDisclosureBody(rawObj: any): string {
  const rawBody =
    rawObj?.summary ||
    rawObj?.description ||
    rawObj?.content ||
    rawObj?.details ||
    rawObj?.text ||
    '';
  const cleaned = String(rawBody).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= 420) return cleaned;
  return `${cleaned.slice(0, 415).trim()}...`;
}

/**
 * موتور تحلیلگر و ساده‌ساز افشای اطلاعات بااهمیت (گروه الف و ب) با حفظ جزئیات متن
 */
function analyzeDisclosureItem(rawObj: any) {
  const title = String(rawObj?.title || '').trim();
  const groupRaw = String(rawObj?.group || '');
  const dateRaw = String(rawObj?.publish_date || '-');
  const isGroupA = groupRaw.includes('الف');
  const extractedBody = summarizeRawDisclosureBody(rawObj);

  const bodyAddon = extractedBody
    ? ` | چکیده متن اطلاعیه: «${extractedBody}»`
    : '';

  if (title.includes('افزایش سرمایه')) {
    return {
      impact: 'مثبت / تقویت ساختار مالی',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: شرکت فرآیند افزایش سرمایه را آغاز کرده است. این اقدام با جلوگیری از خروج نقدینگی یا اصلاح ساختار مالی، ظرفیت اجرای طرح‌های توسعه و کاهش هزینه مالی را تقویت می‌کند. در صورت انجام از محل سود انباشته یا تجدید ارزیابی، تعداد سهام سهامداران افزایش یافته و نقدشوندگی سهم بهبود می‌یابد.'
    };
  }

  if (title.includes('قرارداد') || title.includes('فروش') || title.includes('صادرات') || title.includes('مناقصه') || title.includes('مزایده')) {
    return {
      impact: 'مثبت / رشد درآمد عملیاتی',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: ثبت قرارداد جدید یا واگذاری/فروش قابل‌توجه، جریان درآمدی دوره‌های آتی را تثبیت می‌کند. اگر مبلغ قرارداد نسبت به فروش سالانه شرکت وزن بالایی داشته باشد، می‌تواند منجر به تعدیل مثبت سود هر سهم (EPS) در گزارش‌های فصلی پیش‌رو شود.'
    };
  }

  if (title.includes('تغییر نرخ') || title.includes('افزایش نرخ') || title.includes('نرخ فروش') || title.includes('قیمت‌گذاری')) {
    return {
      impact: 'بسیار مثبت / جهش حاشیه سود',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: اصلاح نرخ فروش محصولات یا خدمات، باکیفیت‌ترین محرک رشد سودآوری است؛ زیرا بدون نیاز به افزایش ظرفیت فیزیکی، مستقیماً حاشیه سود عملیاتی را افزایش داده و اثر تورم هزینه‌ها را پوشش می‌دهد.'
    };
  }

  if (title.includes('قطعی') || title.includes('محدودیت') || title.includes('توقف') || title.includes('تعمیرات') || title.includes('اورهال') || title.includes('کاهش تولید')) {
    return {
      impact: 'منفی کوتاه‌مدت / کاهش موقت تولید',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: محدودیت انرژی (برق/گاز) یا تعمیرات دوره‌ای باعث افت موقت تیراژ تولید و فروش در کوتاه‌مدت می‌شود. با این حال، در نگاه میان‌مدت، تعمیرات اساسی راندمان خطوط تولید را برای فصول بعدی حفظ می‌کند.'
    };
  }

  if (title.includes('دعوی') || title.includes('حقوقی') || title.includes('جریمه') || title.includes('مالیات') || title.includes('بدهی')) {
    return {
      impact: 'هشدار / ریسک حقوقی یا مالی',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: پرونده‌های حقوقی یا بدهی‌های مالیاتی در صورت قطعی شدن می‌توانند مستلزم ایجاد ذخیره در صورت سود و زیان باشند. مقایسه مبلغ ریالی ادعا با سرمایه ثبت‌شده و سود انباشته شرکت برای سنجش ریسک واقعی ضروری است.'
    };
  }

  if (title.includes('تغییر') && (title.includes('مدیرعامل') || title.includes('هیئت مدیره') || title.includes('اعضای'))) {
    return {
      impact: 'خنثی / تغییر مدیریتی',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: جابه‌جایی در سطوح مدیریتی در کوتاه‌مدت اثر حسابداری بر صورت‌های مالی ندارد، اما می‌تواند مسیر استراتژیک شرکت در حوزه فروش صادراتی، مدیریت هزینه و سیاست تقسیم سود مجمع را دستخوش تغییر کند.'
    };
  }

  if (title.includes('سود') || title.includes('مجمع') || title.includes('تقسیم')) {
    return {
      impact: 'مثبت / جریان نقدی سهامداران',
      simpleSummary: `${title}${bodyAddon}`,
      aiTranslation:
        'تحلیل مدیر سرمایه‌گذاری: زمان‌بندی و نحوه پرداخت سود نقدی مجمع مشخص شده است. نسبت تقسیم سود بالا (DPS) نشانه وضعیت نقدینگی سالم شرکت و اولویت دادن مدیریت به بازدهی نقدی سهامداران است.'
    };
  }

  return {
    impact: isGroupA ? 'بااهمیت بالا (گروه الف)' : 'اطلاع‌رسانی (گروه ب)',
    simpleSummary: `${title}${bodyAddon}`,
    aiTranslation: isGroupA
      ? `تحلیل مدیر سرمایه‌گذاری: این اطلاعیه در طبقه «گروه الف» در تاریخ ${dateRaw} منتشر شده است. افشاهای گروه الف مستقیماً با هسته عملیاتی، دارایی‌ها یا سودآوری شرکت در ارتباط هستند و می‌توانند در کوتاه‌مدت بر تقاضا و ارزش‌گذاری سهم اثر بگذارند.`
      : `تحلیل مدیر سرمایه‌گذاری: این اطلاعیه در طبقه «گروه ب» در تاریخ ${dateRaw} جهت شفاف‌سازی وضعیت عملیاتی، اداری یا برنامه‌های اجرایی شرکت منتشر شده است و به رصد دقیق‌تر روند فعالیت شرکت کمک می‌کند.`
  };
}

/**
 * تولید تحلیل جامع ۵ تا ۶ خطی به سبک مدیر سرمایه‌گذاری (Portfolio Manager)
 * به همراه چشم‌انداز آینده شرکت بر اساس صورت‌های مالی و متن گزارش تفسیری
 */
function buildInterpretiveHighlights(it: any, matchingFin: any, prevYearFin: any, ticker: string): string[] {
  const period = String(it.period || 'دوره مالی');
  const pubDate = String(it.publish_date || '-');
  const rawNotes = String(it.summary || it.notes || it.description || '').replace(/\s+/g, ' ').trim();

  const rev = matchingFin ? toBilliardToman(matchingFin.revenue) : 0;
  const op = matchingFin ? toBilliardToman(matchingFin.operating_profit) : 0;
  const net = matchingFin ? toBilliardToman(matchingFin.net_profit) : 0;
  const ocf = matchingFin ? toBilliardToman(matchingFin.operating_cash_flow) : 0;
  const eq = matchingFin ? toBilliardToman(matchingFin.total_equity) : 0;
  const liab = matchingFin ? toBilliardToman(matchingFin.total_liabilities) : 0;

  const prevRev = prevYearFin ? toBilliardToman(prevYearFin.revenue) : 0;
  const revGrowth = prevRev > 0 && rev > 0 ? (((rev - prevRev) / prevRev) * 100).toFixed(1) : null;

  const opMargin = rev > 0 ? Number(((op / rev) * 100).toFixed(1)) : 0;
  const netMargin = rev > 0 ? Number(((net / rev) * 100).toFixed(1)) : 0;
  const cashQuality = net > 0 && ocf !== 0 ? Number((ocf / net).toFixed(2)) : null;

  const lines: string[] = [];

  // خط ۱: جایگاه درآمدی و شتاب رشد فروش
  if (rev > 0) {
    lines.push(
      `۱. ارزیابی درآمدی و شتاب رشد (${period} - تاریخ انتشار ${pubDate}): شرکت ${ticker} در این دوره موفق به ثبت ${rev.toLocaleString('en-US')} میلیارد تومان درآمد عملیاتی شده است${
        revGrowth !== null
          ? ` که نسبت به دوره مشابه سال قبل ${Number(revGrowth) >= 0 ? `رشد ${revGrowth} درصدی` : `افت ${Math.abs(Number(revGrowth))} درصدی`} را نشان می‌دهد.`
          : ' که نشان‌دهنده تثبیت جریان فروش در سبد محصولات/خدمات اصلی شرکت است.'
      }`
    );
  } else {
    lines.push(
      `۱. چارچوب گزارش تفسیری (${period} - تاریخ انتشار ${pubDate}): گزارش تفسیری مدیریت ${ticker} تصویری جامع از عملکرد عملیاتی، انحراف از بودجه و برنامه‌های استراتژیک هیئت‌مدیره برای کنترل هزینه‌ها و توسعه سهم بازار ارائه می‌دهد.`
    );
  }

  // خط ۲: تحلیل کیفیت سودآوری و حاشیه سود
  if (rev > 0) {
    const profitabilityVerdict =
      netMargin >= 25
        ? 'قدرت قیمت‌گذاری بالا و کنترل بسیار موثر بهای تمام‌شده، شرکت را در سطح شرکت‌های با حاشیه سود ممتاز قرار داده است.'
        : netMargin >= 12
        ? 'توازن مناسبی میان رشد درآمد و کنترل هزینه‌های عملیاتی و اداری برقرار است و سودآوری شرکت از پایداری قابل قبولی برخوردار است.'
        : netMargin > 0
        ? 'فشار هزینه‌های تولید و تورم نهاده‌ها حاشیه سود خالص را فشرده کرده و سودآوری شرکت به شدت به اصلاح نرخ فروش وابسته است.'
        : 'جهش هزینه‌ها یا افت تیراژ فروش منجر به زیان‌دهی عملیاتی/خالص شده و نیازمند بازنگری جدی در ساختار هزینه است.';

    lines.push(
      `۲. کیفیت سودآوری و حاشیه سود: ثبت سود عملیاتی ${op.toLocaleString('en-US')} میلیارد تومان (حاشیه سود عملیاتی ${opMargin}٪) و سود خالص ${net.toLocaleString('en-US')} میلیارد تومان (حاشیه سود خالص ${netMargin}٪) نشان می‌دهد که ${profitabilityVerdict}`
    );
  } else {
    lines.push(
      `۲. تحلیل ساختار عملیاتی: در این گزارش، مدیریت به تشریح محرک‌های اصلی درآمد، ترکیب فروش داخلی و صادراتی و عوامل موثر بر بهای تمام‌شده پرداخته تا شفافیت تصمیم‌گیری برای سهامداران افزایش یابد.`
    );
  }

  // خط ۳: نقدینگی، ترازنامه و کیفیت سود (OCF)
  if (eq > 0 || ocf !== 0) {
    lines.push(
      `۳. وضعیت نقدینگی و سلامت ترازنامه: جریان نقد عملیاتی (OCF) دوره معادل ${ocf.toLocaleString('en-US')} میلیارد تومان گزارش شده است${
        cashQuality !== null
          ? ` (نسبت کیفیت سود OCF/NI برابر ${cashQuality} مرتبه که ${cashQuality >= 0.8 ? 'تبدیل بسیار سالم سود حسابداری به پول نقد را تایید می‌کند' : 'نشان‌دهنده قفل شدن بخشی از سود در سرمایه در گردش و مطالبات است'}).`
          : '.'
      } همچنین حقوق مالکانه ${eq.toLocaleString('en-US')} میلیارد تومان در برابر بدهی‌های ${liab.toLocaleString('en-US')} میلیارد تومانی قرار دارد.`
    );
  } else {
    lines.push(
      `۳. مدیریت سرمایه در گردش و ریسک‌های عملیاتی: کنترل دوره وصول مطالبات، مدیریت موجودی کالا و تامین مالی بهینه برای حفظ نقدینگی عملیات جاری از محورهای کلیدی مورد تاکید در گزارش تفسیری این دوره است.`
    );
  }

  // خط ۴: اگر متن خلاصه در JSON بود اضافه شود
  if (rawNotes) {
    lines.push(
      `۴. نکات اختصاصی استخراج‌شده از متن گزارش: ${rawNotes.length > 350 ? `${rawNotes.slice(0, 345)}...` : rawNotes}`
    );
  }

  // خط ۵ و ۶: جمع‌بندی و چشم‌انداز سرمایه‌گذاری آینده (نگاه مدیر سرمایه‌گذاری)
  const outlookText =
    netMargin >= 20 && (revGrowth === null || Number(revGrowth) >= 15)
      ? `چشم‌انداز سرمایه‌گذاری (مثبت / رو به رشد): با توجه به شتاب درآمدی و حاشیه سود بالا، ${ticker} از پتانسیل بالایی برای خلق ارزش، پوشش ریسک‌های تورمی و تعدیل مثبت سود در فصول آینده برخوردار است. حفظ روند فروش ماهانه و اجرای طرح‌های توسعه می‌تواند محرک اصلی رشد ارزش ذاتی سهم باشد.`
      : net > 0
      ? `چشم‌انداز سرمایه‌گذاری (متعادل / نیازمند رصد نرخ‌ها): تداوم سودآوری ${ticker} در دوره‌های آتی مشروط به حفظ تیراژ تولید، دریافت به‌موقع مجوزهای تعدیل نرخ فروش و کنترل هزینه‌های مالی است. رصد گزارش‌های فعالیت ماهانه در کدال برای تایید تداوم رشد توصیه می‌شود.`
      : `چشم‌انداز سرمایه‌گذاری (احتیاطی / دوره گذار): تا زمان بازگشت حاشیه سود عملیاتی به محدوده مثبت و بهبود جریان نقد عملیاتی، سرمایه‌گذاری در سهم نیازمند احتیاط و بررسی دقیق برنامه‌های اصلاح ساختار مدیریت در متن PDF گزارش تفسیری است.`;

  lines.push(`${rawNotes ? '۵' : '۴'}. ${outlookText}`);

  return lines;
}

export function mapPythonArchiveToDashboard(archiveJson: any) {
  const ticker = String(archiveJson?.meta?.ticker || '').trim();
  const industry = String(archiveJson?.meta?.industry || 'سایر صنایع بورس').trim();
  const existingPreset = Object.values(SYMBOLS_CONFIG).find((s) => s.ticker === ticker);
  const baseProfile: SymbolProfile = existingPreset || createDynamicSymbolProfile(ticker, `شرکت ${ticker}`, industry);
  const store = createEmptyFundamentalStore(`آخرین دوره (${ticker})`);

  // ۱. فروش ماهانه (۱۴۰۳، ۱۴۰۴، ۱۴۰۵) به میلیارد تومان
  const monthlySales: any[] = Array.isArray(archiveJson?.monthly_sales) ? archiveJson.monthly_sales : [];
  const salesMap: Record<string, Record<string, number>> = {};

  for (const item of monthlySales) {
    const p = normalizeDigits(String(item.period || ''));
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

  // ۲. انتخاب بهترین گزارش سالانه برای هر سال (پشتیبانی از 12M، 9M، 6M و ارقام فارسی/انگلیسی)
  const finList: any[] = Array.isArray(archiveJson?.financial_statements) ? archiveJson.financial_statements : [];
  const yearsEn = ['1401', '1402', '1403', '1404', '1405'];
  const annualByYear: Record<string, any> = {};

  for (const yr of yearsEn) {
    const yearFins = finList.filter((f) => normalizeDigits(String(f.period || '')).startsWith(yr));
    if (yearFins.length === 0) continue;

    const getPeriodWeight = (pRaw: string) => {
      const p = normalizeDigits(pRaw);
      if (p.includes('12M') || p.includes('12')) return 40;
      if (p.includes('9M') || p.includes('9')) return 30;
      if (p.includes('6M') || p.includes('6')) return 20;
      if (p.includes('3M') || p.includes('3')) return 10;
      return 5;
    };

    const sorted = [...yearFins].sort((a, b) => {
      const wDiff = getPeriodWeight(String(a.period || '')) - getPeriodWeight(String(b.period || ''));
      if (wDiff !== 0) return wDiff;
      const audDiff = Number(Boolean(a.is_audited)) - Number(Boolean(b.is_audited));
      if (audDiff !== 0) return audDiff;
      return normalizeDigits(String(a.period || '')).localeCompare(normalizeDigits(String(b.period || '')));
    });

    annualByYear[yr] = sorted[sorted.length - 1];
  }

  const latest1405 = [...finList]
    .filter((f) => normalizeDigits(String(f.period || '')).startsWith('1405'))
    .sort((a, b) => normalizeDigits(String(a.period || '')).localeCompare(normalizeDigits(String(b.period || ''))))
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

  const fallbackFund = existingPreset?.defaultFundamental;

  store.annualIncomeData = yearsEn.map((yr, idx) => {
    const f = annualByYear[yr];
    const pYr = toPersianYear(yr);
    const rev = f ? toBilliardToman(f.revenue) : 0;
    const net = f ? toBilliardToman(f.net_profit) : 0;
    const fb = fallbackFund?.annualIncomeData?.[idx];
    return {
      year: pYr,
      value: rev > 0 ? rev : (fb?.value || 0),
      netProfit: net !== 0 ? net : (fb?.netProfit || 0),
      compValue: 0,
      compNetProfit: 0,
    };
  });

  const periods = ratioPeriods(finList);
  const annualRatios = yearsEn.map(year => {
    const row = annualByYear[year] ?? {};
    return { year: toPersianYear(year), values: calculateRatios(row, periods.opening(row), industry) };
  });
  const series = (key: keyof ReturnType<typeof calculateRatios>) =>
    annualRatios.map(row => ({ year: row.year, value: row.values[key], compValue: null }));
  const netMarginData = series('netMargin');
  const opMarginData = series('opMargin');
  const roeData = series('roe');
  const efficiencyData = series('efficiency');

  store.cashFlowData = yearsEn.map((yr, idx) => {
    const f = annualByYear[yr];
    const ocf = f ? toBilliardToman(f.operating_cash_flow) : 0;
    const fb = fallbackFund?.cashFlowData?.[idx]?.value || 0;
    return {
      year: toPersianYear(yr),
      value: ocf !== 0 ? ocf : fb,
      compValue: 0,
    };
  });

  store.balanceSheetData = ['1401', '1402', '1403', '1404'].map((yr, idx) => {
    const f = annualByYear[yr];
    const liab = f ? toBilliardToman(f.total_liabilities) : 0;
    const eq = f ? toBilliardToman(f.total_equity) : 0;
    const fb = fallbackFund?.balanceSheetData?.[idx];
    return {
      year: toPersianYear(yr),
      liabilities: liab > 0 ? liab : (fb?.liabilities || 0),
      equity: eq > 0 ? eq : (fb?.equity || 0),
      compLiab: 0,
      compEq: 0,
    };
  });

  const cR = calculateRatios(periods.latest, periods.opening(periods.latest), industry);
  const pR = calculateRatios(periods.previous, periods.opening(periods.previous), industry);
  const ratiosDef = [
    { id: 'roe', title: 'ROE (بازده حقوق مالکانه)', current: cR.roe, prev: pR.roe, comp: null, unit: '٪', isGoodUp: true },
    { id: 'roa', title: 'ROA (بازده دارایی‌ها)', current: cR.roa, prev: pR.roa, comp: null, unit: '٪', isGoodUp: true },
    { id: 'efficiency', title: 'بهای تمام‌شده به درآمد', current: cR.efficiency, prev: pR.efficiency, comp: null, unit: '٪', isGoodUp: false },
    { id: 'equity', title: 'نسبت مالکانه', current: cR.equity, prev: pR.equity, comp: null, unit: '٪', isGoodUp: true },
    { id: 'quick', title: 'نسبت آنی (Quick)', current: cR.quick, prev: pR.quick, comp: null, unit: '', isGoodUp: true },
    { id: 'quality', title: 'کیفیت سود (OCF/NI)', current: cR.quality, prev: pR.quality, comp: null, unit: '', isGoodUp: true },
    { id: 'collection', title: 'دوره وصول مطالبات', current: cR.collection, prev: pR.collection, comp: null, unit: ' روز', isGoodUp: false },
    { id: 'debt', title: 'بدهی به دارایی', current: cR.debt, prev: pR.debt, comp: null, unit: '٪', isGoodUp: false },
  ];

  // ۳. گزارش‌های تفسیری مدیریت + تحلیل ۵-۶ خطی مدیر سرمایه‌گذاری + چشم‌انداز آینده
  const rawInterps: any[] = Array.isArray(archiveJson?.interpretive_reports) ? archiveJson.interpretive_reports : [];
  const baseUrl = (import.meta as any)?.env?.BASE_URL || './';
  const normBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const interpretiveList = rawInterps.map((it) => {
    const rawPath = it.pdf_url ? String(it.pdf_url) : '';
    const cleanPdfUrl = rawPath
      ? rawPath.startsWith('http')
        ? rawPath
        : `${normBase}${rawPath.replace(/^\.?\//, '')}`
      : '';

    const pNorm = normalizeDigits(String(it.period || ''));
    const yrStr = pNorm.slice(0, 4);
    const prevYrStr = yrStr && !isNaN(Number(yrStr)) ? String(Number(yrStr) - 1) : '';

    const matchingFin =
      finList.find((f) => normalizeDigits(String(f.period || '')) === pNorm) ||
      (yrStr ? annualByYear[yrStr] : null);
    const prevYearFin = prevYrStr ? annualByYear[prevYrStr] : null;

    return {
      period: it.period || 'دوره مالی',
      pdfUrl: cleanPdfUrl,
      publishDate: it.publish_date || '',
      highlights: buildInterpretiveHighlights(it, matchingFin, prevYearFin, ticker),
    };
  });

  // ۴. افشای اطلاعات بااهمیت + خلاصه‌سازی متن + تفسیر به زبان ساده + برچسب تاثیر
  const rawDisclosures: any[] = Array.isArray(archiveJson?.important_disclosures) ? archiveJson.important_disclosures : [];
  const disclosuresList = rawDisclosures.map((d, i) => {
    const analyzed = analyzeDisclosureItem(d);
    return {
      id: `${ticker}_disc_${i}`,
      group: String(d.group || '').includes('الف') ? 'الف' : 'ب',
      date: d.publish_date || '',
      impact: analyzed.impact,
      link: d.codal_url || '',
      simpleSummary: analyzed.simpleSummary,
      aiTranslation: analyzed.aiTranslation,
    };
  });

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
    fundStore: { ...store, netMarginData, opMarginData, roeData, efficiencyData, ratiosDef },
    interpretiveList,
    disclosuresList,
    codalAnnouncements,
  };
}
