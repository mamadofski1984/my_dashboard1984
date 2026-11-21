import { API_KEY, isAllowedCodalAnnouncement } from '../data/symbolsConfig';
import { normalizePersianText, detectMonthFromExcel } from './excelParser';

export interface CodalSmartSyncResult {
  announcements: any[];
  monthlyExcelLinks: { month: string; year: string; title: string; url: string }[];
  financialExcelLinks: { period: string; title: string; url: string }[];
  disclosures: any[];
  requestsUsed: number;
}

/**
 * دریافت هوشمند و کم‌مصرف گزارش‌های کدال مطابق مستندات رسمی BrsApi.ir
 * با تفکیک category=3 (ماهانه)، category=1 (صورت مالی) و category=2 (افشای بااهمیت)
 */
export async function fetchOptimizedCodalData(
  symbolL18: string,
  dateStart = '1403-01-01'
): Promise<CodalSmartSyncResult> {
  const encodedL18 = encodeURIComponent(symbolL18);
  const baseUrl = `https://Api.BrsApi.ir/Codal/Announcement.php?key=${API_KEY}&l18=${encodedL18}&audited=true&unaudited=true&only_main_company=true&date_start=${dateStart}&page=1`;

  let requestsUsed = 0;

  // اجرای همزمان ۳ دسته‌بندی اصلی مستندات کدال (مجموعاً فقط ۳ درخواست به جای ۷ درخواست قبلی)
  const [resMonthly, resFinancial, resDisclosures] = await Promise.all([
    fetch(`${baseUrl}&category=3`).then((r) => {
      requestsUsed++;
      return r.json();
    }).catch(() => null),
    fetch(`${baseUrl}&category=1`).then((r) => {
      requestsUsed++;
      return r.json();
    }).catch(() => null),
    fetch(`${baseUrl}&category=2`).then((r) => {
      requestsUsed++;
      return r.json();
    }).catch(() => null)
  ]);

  const monthlyList = Array.isArray(resMonthly?.announcement) ? resMonthly.announcement : [];
  const financialList = Array.isArray(resFinancial?.announcement) ? resFinancial.announcement : [];
  const disclosureList = Array.isArray(resDisclosures?.announcement) ? resDisclosures.announcement : [];

  // 1. استخراج لینک‌های اکسل گزارش‌های فعالیت ماهانه (category=3)
  const monthlyExcelLinks = monthlyList
    .filter((item: any) => Boolean(item.link_excel))
    .map((item: any) => {
      const fullStr = normalizePersianText(`${item.title || ''} ${item.date_title || ''}`);
      const month = detectMonthFromExcel(fullStr) || 'ماهانه';
      const yearMatch = fullStr.match(/140\d/);
      const year = yearMatch ? yearMatch[0] : '1405';
      return {
        month,
        year,
        title: item.title,
        url: item.link_excel
      };
    });

  // 2. استخراج لینک‌های اکسل صورت‌های مالی میاندوره‌ای و سالانه (category=1)
  const financialExcelLinks = financialList
    .filter((item: any) => Boolean(item.link_excel) && isAllowedCodalAnnouncement(item.title))
    .slice(0, 8)
    .map((item: any) => ({
      period: item.date_title || item.date_publish || 'دوره مالی',
      title: item.title,
      url: item.link_excel
    }));

  // 3. تبدیل اطلاعیه‌های category=2 به فرمت تب «اطلاعات افشا شده شرکت»
  const disclosures = disclosureList.slice(0, 20).map((item: any, idx: number) => {
    const title = String(item.title || '');
    const isGroupA = title.includes('گروه الف') || title.includes('(الف)');
    return {
      id: idx + 1,
      group: isGroupA ? 'الف' : 'ب',
      date: item.date_publish || item.date_title || '-',
      code: item.code || 'ن-۲۰',
      rawTitle: title,
      simpleSummary: title,
      aiTranslation: `این اطلاعیه در تاریخ ${item.date_publish || '-'} با کد ${item.code || ''} منتشر شده است. برای مشاهده متن کامل، از لینک مستقیم کدال استفاده کنید.`,
      impact: isGroupA ? 'بااهمیت (گروه الف)' : 'اطلاع‌رسانی (گروه ب)',
      impactType: isGroupA ? 'positive' : 'neutral',
      link: item.link
    };
  });

  // ترکیب کل اطلاعیه‌ها برای آرشیو کدال بدون تکرار
  const seen = new Set<string>();
  const combinedAnnouncements: any[] = [];
  for (const item of [...monthlyList, ...financialList, ...disclosureList]) {
    if (!isAllowedCodalAnnouncement(item.title)) continue;
    const uniqueKey = `${item.title}_${item.date_publish}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      combinedAnnouncements.push(item);
    }
  }

  return {
    announcements: combinedAnnouncements,
    monthlyExcelLinks,
    financialExcelLinks,
    disclosures,
    requestsUsed
  };
}