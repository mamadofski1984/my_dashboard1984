import type { AssetRef, CommodityChain, CommodityPartition, DataEnvelope, MacroIndicators, MacroPartition, ManifestData, MasterIndexData, MasterInstrument, SymbolDetailData } from '../types/marketContract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is DataEnvelope<Record<string, unknown>> {
  return isRecord(value) && value.schemaVersion === '1.0' && isRecord(value.data);
}

export class MarketDataRepository {
  private readonly cache = new Map<string, unknown>();

  private readonly manifestUrl: URL;
  private readonly transport: typeof fetch;

  constructor(manifestUrl: URL, transport: typeof fetch = (input, init) => fetch(input, init)) {
    this.manifestUrl = manifestUrl;
    this.transport = transport;
  }

  resolveAssetUrl(asset: AssetRef): string {
    const path = asset.path.replace(/^\/+/, '');
    if (!/^objects\/[a-z0-9_-]+\/[a-f0-9]{64}\/[A-Za-z0-9_-]+\.(json|webp|png)$/.test(path)) {
      throw new Error('مسیر فایل داده نامعتبر است');
    }
    return new URL(path, this.manifestUrl).toString();
  }

  private async read<T>(
    url: string, signal?: AbortSignal, key?: string, requiredArrays: string[] = [],
  ): Promise<T> {
    signal?.throwIfAborted();
    if (key && this.cache.has(key)) return this.cache.get(key) as T;
    const response = await this.transport(url, { signal, cache: key ? 'default' : 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    signal?.throwIfAborted();
    if (!isEnvelope(payload) || requiredArrays.some(field => !Array.isArray(payload.data[field]))) {
      throw new Error('ساختار داده با قرارداد نسخه ۱ سازگار نیست');
    }
    if (key) {
      if (this.cache.size >= 64) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, payload.data);
    }
    return payload.data as T;
  }

  async getManifest(signal?: AbortSignal): Promise<ManifestData> {
    const manifest = await this.read<ManifestData>(this.manifestUrl.href, signal, undefined, ['sourceFreshness']);
    if (typeof manifest.releaseId !== 'string' || typeof manifest.publishedAt !== 'string') throw new Error('فهرست انتشار نامعتبر است');
    for (const asset of [manifest.masterIndex, manifest.commodityChain, manifest.macroIndicators]) this.resolveAssetUrl(asset);
    return manifest;
  }

  private asset<T>(releaseId: string, scope: string, ref: AssetRef, arrays: string[], signal?: AbortSignal) {
    return this.read<T>(this.resolveAssetUrl(ref), signal, JSON.stringify([releaseId, scope, ref.sha256]), arrays);
  }

  getMasterIndex(manifest: ManifestData, signal?: AbortSignal) {
    return this.asset<MasterIndexData>(manifest.releaseId, 'master', manifest.masterIndex, ['instruments', 'sectors'], signal);
  }

  async getSymbolDetail(manifest: ManifestData, instrument: MasterInstrument, signal?: AbortSignal) {
    if (!instrument.detail) return null;
    const detail = await this.asset<SymbolDetailData>(manifest.releaseId, instrument.issuerId, instrument.detail,
      ['sources', 'statements', 'monthlySales', 'summaries'], signal);
    if (detail.issuerId !== instrument.issuerId) throw new Error('شناسه ناشر در فایل داده مطابقت ندارد');
    return detail;
  }

  getCommodityChain(manifest: ManifestData, signal?: AbortSignal) {
    return this.asset<CommodityChain>(manifest.releaseId, 'commodity', manifest.commodityChain, ['products', 'partitions'], signal);
  }

  getMacroIndicators(manifest: ManifestData, signal?: AbortSignal) {
    return this.asset<MacroIndicators>(manifest.releaseId, 'macro', manifest.macroIndicators, ['series'], signal);
  }

  getCommodityPartition(manifest: ManifestData, ref: AssetRef, signal?: AbortSignal) {
    return this.asset<CommodityPartition>(manifest.releaseId, 'trades', ref, ['offers', 'trades'], signal);
  }

  getMacroPartition(manifest: ManifestData, ref: AssetRef, signal?: AbortSignal) {
    return this.asset<MacroPartition>(manifest.releaseId, 'observations', ref, ['observations'], signal);
  }
}

export const marketRepository = new MarketDataRepository(
  new URL('data/manifest.json', new URL(import.meta.env.BASE_URL, document.baseURI)),
);
