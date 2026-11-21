import {
  parseCodalExcelBuffer,
  normalizePersianText,
  detectMonthFromExcel,
  PERSIAN_MONTHS
} from './excelParser';

export interface AutoSyncProgress {
  totalFound: number;
  processed: number;
  currentLabel: string;
  extractedMonths: { month: string; sales: number; confidence?: string }[];
  errors: string[];
  directLinks?: { month: string; url: string }[];
}

async function fetchWithTimeout(url: string, timeoutMs = 5500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchExcelWithCorsFallback(url: string): Promise<ArrayBuffer> {
  const cleanUrl = url.replace(/^http:\/\//i, 'https://');
  const proxies = [
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`
  ];

  for (const buildProxyUrl of proxies) {
    try {
      const res = await fetchWithTimeout(buildProxyUrl(cleanUrl), 5500);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 800) {
        return buf;
      }
    } catch {
      // ادامه به پراکسی بعدی
    }
  }
  throw new Error('مسدودیت امنیتی مرورگر (CORS) روی سرور کدال');
}

export async function autoSyncMonthlySalesFromCodal(
  codalList: any[],
  targetYearPersian: string,
  fallbackStore: any,
  onProgress?: (progress: AutoSyncProgress) => void
): Promise<{
  updatedMonthlySales: Record<string, number>;
  summaryLogs: { month: string; sales: number; confidence?: string }[];
  errors: string[];
  directLinks: { month: string; url: string }[];
}> {
  const allN30Reports = codalList.filter((item) => {
    const titleNorm = normalizePersianText(item.title || '');
    const codeNorm = normalizePersianText(item.code || '');
    const isN30 =
      codeNorm.includes('ن-30') ||
      titleNorm.includes('گزارش فعالیت ماهانه') ||
      titleNorm.includes('دوره یک ماهه');
    return isN30 && Boolean(item.link_excel);
  });

  let yearFiltered = allN30Reports.filter((item) => {
    const txt = normalizePersianText(`${item.title || ''} ${item.date_title || ''} ${item.date_publish || ''}`);
    return txt.includes(targetYearPersian);
  });

  if (yearFiltered.length === 0) {
    yearFiltered = allN30Reports.filter((item) => {
      const txt = normalizePersianText(`${item.title || ''} ${item.date_title || ''} ${item.date_publish || ''}`);
      return txt.includes('1404');
    });
  }

  const uniqueByMonth = new Map<string, any>();
  for (const rep of yearFiltered) {
    const mName =
      detectMonthFromExcel(`${rep.title || ''} ${rep.date_title || ''}`) || 'نامشخص';
    if (mName !== 'نامشخص' && !uniqueByMonth.has(mName)) {
      uniqueByMonth.set(mName, rep);
    }
  }

  const reportsToProcess = Array.from(uniqueByMonth.entries());
  const updatedMonthlySales: Record<string, number> = {};
  const summaryLogs: { month: string; sales: number; confidence?: string }[] = [];
  const errors: string[] = [];
  const directLinks = reportsToProcess.map(([m, r]) => ({ month: m, url: r.link_excel }));

  if (reportsToProcess.length === 0) {
    const errList = [
      'در لیست فعلی کدال این نماد، گزارش ماهانه (ن-۳۰) دارای لینک اکسل یافت نشد. ابتدا «همگام‌سازی کدال» را بزنید.'
    ];
    onProgress?.({
      totalFound: 0,
      processed: 0,
      currentLabel: 'گزارشی یافت نشد',
      extractedMonths: [],
      errors: errList,
      directLinks: []
    });
    return { updatedMonthlySales, summaryLogs, errors: errList, directLinks: [] };
  }

  for (let i = 0; i < reportsToProcess.length; i++) {
    const [detectedLabel, rep] = reportsToProcess[i];

    onProgress?.({
      totalFound: reportsToProcess.length,
      processed: i,
      currentLabel: `در حال دریافت گزارش ${detectedLabel} (${i + 1} از ${reportsToProcess.length})...`,
      extractedMonths: [...summaryLogs],
      errors: [...errors],
      directLinks
    });

    try {
      const buffer = await fetchExcelWithCorsFallback(rep.link_excel);
      const parsed = parseCodalExcelBuffer(
        buffer,
        `${rep.title || detectedLabel}.xls`,
        fallbackStore
      );

      const finalMonth =
        parsed.targetMonth && PERSIAN_MONTHS.includes(parsed.targetMonth)
          ? parsed.targetMonth
          : detectedLabel;

      if (parsed.monthlySales && parsed.monthlySales > 0) {
        updatedMonthlySales[finalMonth] = parsed.monthlySales;
        summaryLogs.push({
          month: finalMonth,
          sales: parsed.monthlySales,
          confidence: parsed.confidence
        });
      } else {
        errors.push(`عدد فروش در گزارش ${finalMonth} استخراج نشد.`);
      }
    } catch (err: any) {
      errors.push(`گزارش ${detectedLabel}: ${err?.message || 'خطا در دانلود'}`);
      if (i === 0 && summaryLogs.length === 0) {
        errors.push('راهکار سریع: لینک‌های اکسل آماده زیر را دانلود کنید و همزمان با دکمه «آپلود اکسل» انتخاب نمایید.');
        break;
      }
    }
  }

  onProgress?.({
    totalFound: reportsToProcess.length,
    processed: reportsToProcess.length,
    currentLabel: 'پایان عملیات.',
    extractedMonths: [...summaryLogs],
    errors: [...errors],
    directLinks
  });

  return { updatedMonthlySales, summaryLogs, errors, directLinks };
}