import type { MasterInstrument } from '../types/marketContract';
import { normalizeMarketSearch } from './contractViewMapper';

type Row = Record<string, unknown>;
const api = 'https://cdn.tsetmc.com/api/';
const number = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const positive = (value: unknown) => {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

export async function fetchTsetmcQuote(instrument: MasterInstrument, signal: AbortSignal) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  const get = async (path: string) => {
    const response = await fetch(api + path, { signal: deadline, cache: 'no-store' });
    if (!response.ok) throw new Error(`TSETMC HTTP ${response.status}`);
    return await response.json();
  };
  const { instrumentSearch } = await get('Instrument/GetInstrumentSearch/' + encodeURIComponent(instrument.tickerFa));
  if (!Array.isArray(instrumentSearch)) throw new Error('Invalid TSETMC search');
  const matches = (instrumentSearch as Row[]).filter(row =>
    instrument.isin ? [row.cIsin, row.instrumentID].includes(instrument.isin)
      : normalizeMarketSearch(String(row.lVal18AFC ?? '')) === normalizeMarketSearch(instrument.tickerFa));
  const codes = (rows: Row[]) => [...new Set(rows.map(row => row.insCode)
    .filter((code): code is string => typeof code === 'string' && /^[1-9]\d*$/.test(code)))];
  const exact = codes(matches);
  const active = codes(matches.filter(row => Number(row.lastDate) === 1));
  const code = exact.length === 1 ? exact[0] : active.length === 1 ? active[0] : null;
  if (!code) throw new Error('No unique TSETMC instrument');

  const optional = (path: string) => get(path).catch(() => null);
  const [closing, metadata, history] = await Promise.all([
    get(`ClosingPrice/GetClosingPriceInfo/${code}`),
    optional(`Instrument/GetInstrumentInfo/${code}`),
    optional(`ClosingPrice/GetClosingPriceDailyList/${code}/0`),
  ]);
  const close = closing.closingPriceInfo;
  const info = metadata?.instrumentInfo;
  const pc = positive(close?.pClosing);
  if (pc === null) throw new Error('Missing TSETMC closing price');
  const previous = positive(close?.priceYesterday);
  const z = positive(info?.zTitad);
  const eps = number(info?.eps?.epsValue ?? info?.eps);
  const day = String(close?.dEven ?? '');
  const cutoff = /^\d{8}$/.test(day) ? Number(day) - 10000 : Infinity;
  const recent: Row[] = Array.isArray(history?.closingPriceDaily)
    ? history.closingPriceDaily.filter((row: Row) => Number(row.dEven) > cutoff && Number(row.dEven) <= Number(day)) : [];
  const lows = recent.flatMap(row => positive(row.priceMin) ?? positive(row.pClosing) ?? []);
  const highs = recent.flatMap(row => positive(row.priceMax) ?? positive(row.pClosing) ?? []);
  return {
    pc, z, eps, day,
    mv: z === null ? null : pc * z,
    pe: eps !== null && eps > 0 ? pc / eps : null,
    pcp: previous === null ? null : (pc / previous - 1) * 100,
    pmin_1y: lows.length ? Math.min(...lows) : null,
    pmax_1y: highs.length ? Math.max(...highs) : null,
    partial: z === null || eps === null || !lows.length || !highs.length,
  };
}
