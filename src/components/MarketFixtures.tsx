import { useEffect, useState } from 'react';
import { marketRepository } from '../repositories/MarketDataRepository';
import type { CommodityPartition, MacroPartition, ManifestData } from '../types/marketContract';

export function MarketFixtures({ manifest }: { manifest: ManifestData }) {
  const [preview, setPreview] = useState<{ commodity: CommodityPartition | null; macro: MacroPartition | null }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      const [commodity, macro] = await Promise.all([
        marketRepository.getCommodityChain(manifest, signal),
        marketRepository.getMacroIndicators(manifest, signal),
      ]);
      const trades = commodity.isFixture ? commodity.partitions[0]?.file : undefined;
      const series = macro.isFixture ? macro.series[0]?.partitions[0]?.file : undefined;
      const [tradeData, macroData] = await Promise.all([
        trades ? marketRepository.getCommodityPartition(manifest, trades, signal) : null,
        series ? marketRepository.getMacroPartition(manifest, series, signal) : null,
      ]);
      if (!signal.aborted) setPreview({ commodity: tradeData, macro: macroData });
    }
    void load().catch(() => { if (!signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [manifest]);
  if (failed) return <p role="alert">بارگذاری پیش‌نمایش آزمایشی ناموفق بود.</p>;
  if (!preview) return <p role="status">در حال بارگذاری پیش‌نمایش…</p>;
  return <div className="space-y-4">
    {preview.commodity?.isFixture && <section className="rounded-xl border p-4">
      <h2 className="font-bold">بورس کالا · داده آزمایشی (Test Fixture)</h2>
      {preview.commodity.trades.map(trade => <p key={trade.tradeId}>
        {trade.tradeDate} · {trade.discoveredPrice?.amount ?? '—'} {trade.discoveredPrice?.currency}
        {' · '}{trade.buyerVerification === 'undisclosed' ? 'خریدار افشا نشده' : trade.buyerIssuerId ?? 'خریدار نامشخص'}
      </p>)}
    </section>}
    {preview.macro?.isFixture && <section className="rounded-xl border p-4">
      <h2 className="font-bold">اقتصاد کلان · داده آزمایشی (Test Fixture)</h2>
      {preview.macro.observations.map(row => <p key={`${row.referencePeriod}:${row.revisionNumber}`}>
        {row.referencePeriod} · نسخه {row.revisionNumber} · {row.value ?? '—'}
      </p>)}
    </section>}
  </div>;
}
