export interface AssetRef { path: string; sha256: string; bytes: number }
export interface DataEnvelope<T> { schemaVersion: '1.0'; data: T }
export interface ManifestData {
  releaseId: string;
  publishedAt: string;
  masterIndex: AssetRef;
  commodityChain: AssetRef;
  macroIndicators: AssetRef;
  sourceFreshness: { source: string; asOfUtc: string | null; status: 'archived' | 'fixture' }[];
}
export interface MasterInstrument {
  instrumentId: string;
  issuerId: string;
  isin: string | null;
  venue: 'TSE' | 'IFB' | null;
  tickerFa: string;
  issuerNameFa: string | null;
  aliasesFa: string[];
  searchKey: string;
  sectorId: string;
  isPrimaryInstrument: boolean;
  coverageState: 'full' | 'partial' | 'index_only';
  detail: AssetRef | null;
  image: AssetRef | null;
  snapshot: { closePrice: string | null; marketCapIrr: string | null; peTtm: string | null; pb: string | null; asOfUtc: string } | null;
}
export interface MasterIndexData {
  sectors: { id: string; parentId: string | null; nameFa: string }[];
  instruments: MasterInstrument[];
}
export interface SymbolRatio {
  code: string;
  value: string | null;
  unit: 'PCT' | 'TIMES' | 'DAYS';
  status: 'ok' | 'missing_input' | 'invalid_denominator' | 'not_applicable';
  formulaVersion: string;
  missingInputs: string[];
  inputStatementIds: string[];
}
export interface FinancialStatement {
  isFixture: boolean;
  revisionId: string;
  sourceId: string;
  fiscalYear: number;
  periodMonths: 3 | 6 | 9 | 12;
  periodEndJalali: string | null;
  isAudited: boolean | null;
  consolidationScope: 'standalone' | 'consolidated' | 'unknown';
  restatedFromRevisionId: string | null;
  isSuperseded?: boolean;
  facts: { code: string; value: string | null; unit: 'IRR' }[];
  ratios: SymbolRatio[];
}
export interface SymbolSummaryItem {
  sourceId: string;
  summaryType: 'interpretive_report' | 'material_disclosure';
  disclosureGroup: 'A' | 'B' | null;
  impactTag: 'positive' | 'negative_short_term' | 'warning' | 'neutral' | null;
  titleFa: string;
  plainLanguageSummary: string | null;
  investorTakeaway: string | null;
  evidenceLocators: { docId: string; page: number | null; section: string | null; quote: string | null }[];
  reviewStatus: 'auto_generated' | 'human_verified' | 'source_only';
}
export interface Source { id: string; archiveDate: string | null; url: string | null }
export interface PeriodCoverageNote {
  fiscalYear: number;
  periodMonths: 12;
  status: 'published_unextracted' | 'no_eligible_filing_found';
  reason: string;
}

export interface SymbolDetailData {
  missingMonthlyPeriods?: string[];
  periodCoverageNotes?: PeriodCoverageNote[];
  issuerId: string;
  sectorTemplate: 'manufacturing' | 'banking' | 'holding' | 'exchange_service' | 'other';
  sources: Source[];
  statements: FinancialStatement[];
  monthlySales: { periodJalali: string; sourceId: string; revenueIrr: string | null; productId: string | null; market: 'total' }[];
  summaries: SymbolSummaryItem[];
}
type IndexedPartition = { file: AssetRef };
export interface CommodityChain { isFixture: boolean; products: { id: string; nameFa: string }[]; partitions: (IndexedPartition & { venue: 'IME' | 'IRENEX'; month: string })[] }
type Quantity = { amount: string; unit: string };
type Price = { amount: string; currency: string; perUnit: string };
export interface CommodityPartition {
  isFixture: boolean;
  sources: Source[];
  offers: { offerId: string; productId: string; sourceId: string; offerVolume: Quantity | null; demandVolume: Quantity | null; basePrice: Price | null }[];
  trades: { tradeId: string; offerId: string; sourceId: string; tradeDate: string; tradedVolume: Quantity | null; discoveredPrice: Price | null; settlementPrice: Price | null;
    sellerIssuerId: string | null; buyerIssuerId: string | null; buyerVerification: 'verified_codal_ime' | 'undisclosed' | 'unresolved'; buyerEvidenceSourceIds: string[] }[];
}
export interface MacroIndicators {
  isFixture: boolean;
  series: { id: string; nameFa: string; family: 'fx' | 'interest' | 'inflation' | 'money' | 'commodity'; unit: string;
    frequency: 'daily' | 'monthly' | 'quarterly' | 'annual'; methodologyId: string; regimeId: string | null; partitions: (IndexedPartition & { year: number })[] }[];
}
export interface MacroPartition {
  isFixture: boolean;
  seriesId: string;
  sources: Source[];
  observations: { referencePeriod: string; availableAtUtc: string; revisionNumber: number; isPreliminary: boolean; value: string | null; sourceId: string }[];
}
