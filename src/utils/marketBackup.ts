import { readUserStorage } from './legacyStorageMigration';

interface IssuerBackup {
  notes?: unknown[];
  overrides?: Record<string, unknown>;
}

export interface MarketBackup {
  schemaVersion: '2.0';
  exportedAt: string;
  issuers: Record<string, IssuerBackup>;
}

export function createMarketBackup(issuerIds: string[]): MarketBackup {
  const issuers: MarketBackup['issuers'] = {};
  for (const id of new Set(issuerIds)) {
    const notes = readUserStorage<unknown[]>(id + '_user_notes_v2');
    const overrides = readUserStorage<Record<string, unknown>>(id + '_user_overrides_v2');
    if (notes !== undefined || overrides !== undefined) issuers[id] = { notes, overrides };
  }
  return { schemaVersion: '2.0', exportedAt: new Date().toISOString(), issuers };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function prepareMarketRestore(payload: unknown, issuerIds: string[], legacyIssuer: string) {
  if (!record(payload)) throw new Error('ساختار فایل پشتیبان نامعتبر است.');
  const entries = payload.schemaVersion === '2.0' && record(payload.issuers)
    ? Object.entries(payload.issuers)
    : payload.schemaVersion === undefined && ('interpretiveSummaries' in payload || 'fundamentalData' in payload)
      ? [[legacyIssuer, { notes: payload.interpretiveSummaries, overrides: payload.fundamentalData }]]
      : null;
  if (!entries) throw new Error('نسخه فایل پشتیبان پشتیبانی نمی‌شود.');
  const known = new Set(issuerIds);
  const writes = new Map<string, string>();
  const overrideArrays = ['annualIncomeData', 'incomeData', 'ratiosDef', 'balanceSheetData', 'cashFlowData',
    'netMarginData', 'opMarginData', 'efficiencyData', 'roeData', 'pbData'];
  for (const [id, value] of entries) {
    if (typeof id !== 'string' || !known.has(id) || !record(value)) throw new Error('شناسه ناشر در فایل پشتیبان معتبر نیست.');
    const { notes, overrides } = value;
    if (notes !== undefined) {
      if (!Array.isArray(notes) || notes.some(note => !record(note) || typeof note.period !== 'string' ||
          !Array.isArray(note.highlights) || note.highlights.some(text => typeof text !== 'string'))) {
        throw new Error('ساختار یادداشت‌ها معتبر نیست.');
      }
      writes.set(id + '_user_notes_v2', JSON.stringify(notes));
    }
    if (overrides !== undefined) {
      if (!record(overrides) || overrideArrays.some(key => !Array.isArray(overrides[key])) || !record(overrides.interimReport)) {
        throw new Error('ساختار داده بنیادی پشتیبان معتبر نیست.');
      }
      writes.set(id + '_user_overrides_v2', JSON.stringify(overrides));
    }
  }
  return writes;
}

export function restoreMarketBackup(writes: Map<string, string>, storage: Storage = localStorage) {
  const applied = new Map<string, string | null>();
  try {
    for (const [key, value] of writes) {
      const previous = storage.getItem(key);
      storage.setItem(key, value);
      applied.set(key, previous);
    }
  } catch (error) {
    for (const [key, value] of applied) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    throw error;
  }
}
