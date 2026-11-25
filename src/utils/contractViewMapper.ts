import type { FinancialStatement, MasterInstrument, SymbolDetailData, SymbolRatio } from '../types/marketContract';
import { createDynamicSymbolProfile, createEmptyFundamentalStore } from '../data/symbolsConfig';

export function parseDecimalSafe(value: string | null | undefined): number | null {
  if (value == null || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeMarketSearch(value: string): string {
  return value.replace(/[يك]/g, char => char === 'ي' ? 'ی' : 'ک')
    .replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) - (char >= '۰' ? 0x06f0 : 0x0660)))
    .replace(/\u200c/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function extractActiveAnnualStatements(statements: FinancialStatement[]) {
  const supersededIds = new Set(statements.filter(item => !item.isFixture).map(item => item.restatedFromRevisionId));
  const superseded = (item: FinancialStatement) => item.isSuperseded === true || supersededIds.has(item.revisionId);
  return {
    activeAnnualStatements: statements.filter(item => !item.isFixture && !superseded(item) && item.periodMonths === 12)
      .sort((a, b) => a.fiscalYear - b.fiscalYear),
    supersededRevisions: statements.filter(superseded),
    revisionHistory: statements.filter(item => item.isFixture || item.restatedFromRevisionId || superseded(item)),
  };
}

const ratioTitles: Record<string, string> = {
  NET_MARGIN: 'حاشیه سود خالص', GROSS_MARGIN: 'حاشیه سود ناخالص',
  EQUITY_TO_ASSETS: 'حقوق مالکانه به دارایی', LIABILITIES_TO_ASSETS: 'بدهی به دارایی',
  OPERATING_MARGIN: 'حاشیه سود عملیاتی', ROE: 'بازده حقوق مالکانه',
  COST_TO_REVENUE: 'بهای تمام‌شده به درآمد',
};

export function formatRatioBadge(status: SymbolRatio['status'], value: string | null, unit: string, missingInputs: string[] = []) {
  if (status === 'ok') return { label: value === null ? '—' : `${value}${unit === 'PCT' ? '٪' : unit === 'TIMES' ? ' مرتبه' : ' روز'}`, style: 'text-emerald-500' };
  if (status === 'not_applicable') return { label: 'نامرتبط با صنعت', style: 'opacity-70' };
  if (status === 'invalid_denominator') return { label: 'مخرج نامعتبر', style: 'text-rose-500' };
  return { label: missingInputs.length ? `ورودی موجود نیست (${missingInputs.join('، ')})` : 'ورودی موجود نیست', style: 'text-amber-500' };
}

export function instrumentProfile(instrument: MasterInstrument, sector: string) {
  const profile = createDynamicSymbolProfile(instrument.tickerFa, instrument.issuerNameFa ?? '', sector);
  return {
    ...profile, key: instrument.instrumentId, searchKey: instrument.searchKey,
    shareholders: [], pillars: [], description: '',
    defaultValInputs: { ...profile.defaultValInputs, baseFCFF: 0, baseFCFE: 0, netCash: 0, nextDps: 0, forwardEps: 0, bookValuePerShare: 0 },
  };
}

const toTomanBillions = (value: string | null | undefined) => {
  const number = parseDecimalSafe(value);
  return number === null ? null : number / 10_000_000_000;
};

const fiscalScope = { consolidated: 'تلفیقی', standalone: 'جداگانه', unknown: 'دامنه نامشخص' };

export function mapContractDetail(detail: SymbolDetailData | null) {
  const statements = detail?.statements ?? [];
  const { activeAnnualStatements, revisionHistory } = extractActiveAnnualStatements(statements);
  const sourceById = new Map(detail?.sources.map(source => [source.id, source]));
  const safeUrl = (url?: string | null) => url?.startsWith('https://') ? url : '';
  const yearLabel = (statement: FinancialStatement) => String(statement.fiscalYear).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  const money = (row: FinancialStatement, code: string) => toTomanBillions(row.facts.find(fact => fact.code === code)?.value);
  const ratio = (row: FinancialStatement, code: string) => parseDecimalSafe(row.ratios.find(item => item.code === code)?.value);
  // Use one scope for a continuous annual series and retain all revisions for inspection.
  const scope = (['consolidated', 'standalone', 'unknown'] as const).find(candidate =>
    activeAnnualStatements.some(row => row.consolidationScope === candidate));
  const annual = [...new Map(activeAnnualStatements.filter(row => row.consolidationScope === scope)
    .map(row => [row.fiscalYear, row])).values()];
  const latest = annual.at(-1);
  const series = (code: string) => annual.map(row => ({ year: yearLabel(row), value: ratio(row, code), compValue: null }));
  const monthly = new Map(detail?.monthlySales.map(row => [row.periodJalali, row.revenueIrr]));
  const empty = createEmptyFundamentalStore();
  const fundStore = {
    ...empty,
    annualIncomeData: annual.map(row => ({ year: yearLabel(row), value: money(row, 'REVENUE'),
      netProfit: money(row, 'NET_PROFIT'), cost: money(row, 'COST_OF_REVENUE'), opProfit: money(row, 'OPERATING_PROFIT'),
      compValue: null, compNetProfit: null })),
    balanceSheetData: annual.map(row => ({ year: yearLabel(row), equity: money(row, 'TOTAL_EQUITY'), liabilities: money(row, 'TOTAL_LIABILITIES') })),
    cashFlowData: annual.map(row => ({ year: yearLabel(row), value: money(row, 'OPERATING_CASH_FLOW') })),
    incomeData: empty.incomeData.map(({ month }, index) => {
      const key = String(index + 1).padStart(2, '0');
      return { month, year1403: toTomanBillions(monthly.get(`1403/${key}`)),
        year1404: toTomanBillions(monthly.get(`1404/${key}`)), year1405: toTomanBillions(monthly.get(`1405/${key}`)) };
    }),
    netMarginData: series('NET_MARGIN'), opMarginData: series('OPERATING_MARGIN'),
    roeData: series('ROE'), efficiencyData: series('COST_TO_REVENUE'), pbData: series('PB'),
    interimReport: { ...empty.interimReport, netMargin: null },
    ratiosDef: (latest?.ratios ?? []).map(item => ({
      ...item, id: item.code, title: ratioTitles[item.code] ?? item.code, current: parseDecimalSafe(item.value),
    })),
  };
  const reports = (detail?.summaries ?? []).map(item => {
    const source = sourceById.get(item.sourceId);
    return { ...item, url: safeUrl(source?.url), date: source?.archiveDate ?? '' };
  });
  return {
    fundStore, scopeLabel: scope ? fiscalScope[scope] : null, revisionHistory,
    interpretiveList: reports.filter(item => item.summaryType === 'interpretive_report').map(item => ({
      id: item.sourceId, period: item.titleFa, publishDate: item.date, pdfUrl: item.url,
      highlights: item.plainLanguageSummary ? [item.plainLanguageSummary, ...(item.investorTakeaway ? [item.investorTakeaway] : [])] : [],
    })),
    disclosuresList: reports.filter(item => item.summaryType === 'material_disclosure').map(item => ({
      id: item.sourceId, group: item.disclosureGroup === 'A' ? 'الف' : item.disclosureGroup === 'B' ? 'ب' : null,
      date: item.date, impact: item.impactTag, link: item.url, simpleSummary: item.titleFa,
      aiTranslation: item.plainLanguageSummary,
    })),
    codalAnnouncements: reports.map(item => ({
      title: item.titleFa, code: item.summaryType === 'interpretive_report' ? 'تفسیری' : 'افشا',
      date_publish: item.date, date_title: '', link: item.url,
    })),
  };
}
