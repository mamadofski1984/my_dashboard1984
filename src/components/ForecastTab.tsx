import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  Calculator, TrendingUp, Percent, RotateCcw, Sparkles, Edit3
} from 'lucide-react';

const MONTHS_LIST = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const formatNum = (num: any, decimals = 0) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

export function ForecastTab({
  activeConfig,
  liveData,
  fundStore,
  darkMode,
  cardStyle,
  subCardStyle,
  textHeading,
  textMuted,
  borderSubtle
}: any) {
  const [priceGrowthRate, setPriceGrowthRate] = useState<number>(activeConfig.key === 'nan' ? 18 : 10);
  const [volumeGrowthRate, setVolumeGrowthRate] = useState<number>(5);
  const [estimatedNetMargin, setEstimatedNetMargin] = useState<number>(
    activeConfig.interimReport?.netMargin || (activeConfig.key === 'nan' ? 14.3 : 103)
  );

  const [monthlyRows, setMonthlyRows] = useState<
    { month: string; status: 'actual' | 'unreported' | 'forecast'; baseSales: number; projectedSales: number }[]
  >([]);

  useEffect(() => {
    const defaultNetMargin = fundStore.interimReport?.netMargin || (activeConfig.key === 'nan' ? 14.3 : 103);
    setEstimatedNetMargin(defaultNetMargin);
    setPriceGrowthRate(activeConfig.key === 'nan' ? 18 : 10);

    const sourceIncome = fundStore.incomeData || [];

    // پیدا کردن آخرین ماه دارای گزارش واقعی و محاسبه میانگین فقط از ماه‌های واقعی
    let lastActualIndex = -1;
    let sumActual = 0;
    let countActual = 0;

    MONTHS_LIST.forEach((_, idx) => {
      const val = sourceIncome[idx]?.year1405;
      if (val !== null && val !== undefined && Number(val) > 0) {
        lastActualIndex = idx;
        sumActual += Number(val);
        countActual += 1;
      }
    });

    const avgActual = countActual > 0 ? sumActual / countActual : 0;

    const initialRows = MONTHS_LIST.map((mName, idx) => {
      const rawVal = sourceIncome[idx]?.year1405;
      const hasActual = rawVal !== null && rawVal !== undefined && Number(rawVal) > 0;

      if (hasActual) {
        return {
          month: mName,
          status: 'actual' as const,
          baseSales: Number(rawVal),
          projectedSales: Number(rawVal)
        };
      }

      // ماه‌های قبل از آخرین ماه گزارش‌شده که داده‌شان هنوز وارد نشده صفر می‌مانند
      if (idx < lastActualIndex) {
        return {
          month: mName,
          status: 'unreported' as const,
          baseSales: 0,
          projectedSales: 0
        };
      }

      // فقط ماه‌های آینده (بعد از آخرین ماه محقق‌شده) بر اساس میانگین ماه‌های واقعی پیش‌بینی می‌شوند
      const forecastBase = Number(avgActual.toFixed(1));
      return {
        month: mName,
        status: 'forecast' as const,
        baseSales: forecastBase,
        projectedSales: forecastBase
      };
    });

    setMonthlyRows(initialRows);
  }, [activeConfig.key, fundStore]);

  const handleApplySmartGrowth = () => {
    const multiplier = (1 + priceGrowthRate / 100) * (1 + volumeGrowthRate / 100);
    setMonthlyRows((prev) =>
      prev.map((row) =>
        row.status === 'forecast'
          ? { ...row, projectedSales: Number((row.baseSales * multiplier).toFixed(1)) }
          : row
      )
    );
  };

  const handleManualMonthChange = (idx: number, newVal: number) => {
    setMonthlyRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, projectedSales: newVal } : row))
    );
  };

  const summary = useMemo(() => {
    const realizedSales = monthlyRows
      .filter((r) => r.status === 'actual' || r.status === 'unreported')
      .reduce((sum, r) => sum + (Number(r.projectedSales) || 0), 0);

    const remainingForecastSales = monthlyRows
      .filter((r) => r.status === 'forecast')
      .reduce((sum, r) => sum + (Number(r.projectedSales) || 0), 0);

    const totalAnnualSales = realizedSales + remainingForecastSales;
    const estimatedNetProfit = totalAnnualSales * (estimatedNetMargin / 100);

    const totalShares = Number(liveData.z || 62000000000);
    const forwardEps = totalShares > 0 ? (estimatedNetProfit * 1e10) / totalShares : 0;
    const currentTtmEps = Number(liveData.eps || 0);
    const epsGrowthPercent =
      currentTtmEps > 0 ? ((forwardEps - currentTtmEps) / currentTtmEps) * 100 : 0;

    return {
      realizedSales,
      remainingForecastSales,
      totalAnnualSales,
      estimatedNetProfit,
      forwardEps,
      currentTtmEps,
      epsGrowthPercent
    };
  }, [monthlyRows, estimatedNetMargin, liveData.z, liveData.eps]);

  const gridStroke = darkMode ? '#1e293b' : '#e2e8f0';
  const axisTickColor = darkMode ? '#94a3b8' : '#64748b';

  return (
    <main className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6 space-y-6 pb-12">
      <section className={`rounded-2xl border p-6 border-t-4 border-t-amber-500 ${cardStyle}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-center">
          <div className={`p-4 rounded-xl border ${subCardStyle}`}>
            <span className={`text-xs font-semibold block mb-1 ${textMuted}`}>
              EPS فعلی (آخرین صورت مالی / TTM)
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl md:text-3xl font-bold ${textHeading}`} dir="ltr">
                {formatNum(summary.currentTtmEps, 0)}
              </span>
              <span className={`text-xs ${textMuted}`}>ریال</span>
            </div>
            <span className={`text-[11px] mt-1 block ${textMuted}`}>محقق‌شده طبق گزارش رسمی</span>
          </div>

          <div className={`p-4 rounded-xl border border-emerald-500/40 ${darkMode ? 'bg-emerald-950/20' : 'bg-emerald-50/60'}`}>
            <span className="text-xs font-bold text-emerald-400 block mb-1">
              EPS برآوردی پایان سال (Forward)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl md:text-4xl font-black text-emerald-400" dir="ltr">
                {formatNum(summary.forwardEps, 0)}
              </span>
              <span className="text-xs text-emerald-300">ریال</span>
            </div>
            <span
              className={`text-xs font-bold mt-1 inline-block ${
                summary.epsGrowthPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
              dir="ltr"
            >
              {summary.epsGrowthPercent >= 0
                ? `+${formatNum(summary.epsGrowthPercent, 1)}% رشد نسبت به TTM`
                : `${formatNum(summary.epsGrowthPercent, 1)}% تغییر نسبت به TTM`}
            </span>
          </div>

          <div className={`p-4 rounded-xl border ${subCardStyle}`}>
            <span className={`text-xs font-semibold block mb-1 ${textMuted}`}>
              کل فروش برآوردی سال ({activeConfig.ticker})
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-500" dir="ltr">
                {formatNum(summary.totalAnnualSales, 0)}
              </span>
              <span className={`text-xs ${textMuted}`}>میلیارد تومان</span>
            </div>
            <span className={`text-[11px] mt-1 block ${textMuted}`}>
              محقق‌شده: {formatNum(summary.realizedSales, 0)} | آتی: {formatNum(summary.remainingForecastSales, 0)}
            </span>
          </div>

          <div className={`p-4 rounded-xl border ${subCardStyle}`}>
            <span className={`text-xs font-semibold block mb-1 ${textMuted}`}>
              سود خالص تخمینی کل سال
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-400" dir="ltr">
                {formatNum(summary.estimatedNetProfit, 0)}
              </span>
              <span className={`text-xs ${textMuted}`}>میلیارد تومان</span>
            </div>
            <span className={`text-[11px] mt-1 block ${textMuted}`}>
              با حاشیه سود خالص {estimatedNetMargin}٪
            </span>
          </div>
        </div>
      </section>

      <section className={`rounded-2xl border p-6 ${cardStyle}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className={`text-base md:text-lg font-bold flex items-center gap-2 ${textHeading}`}>
              <Sparkles className="w-5 h-5 text-amber-500" />
              موتور برآورد هوشمند فروش و سود ({activeConfig.ticker} ({activeConfig.fullName}))
            </h2>
            <p className={`text-xs mt-1 ${textMuted}`}>
              درصد افزایش نرخ محصولات و حاشیه سود خالص را تنظیم کنید یا فروش هر ماه را در جدول پایین مستقیماً ویرایش نمایید.
            </p>
          </div>

          <button
            onClick={handleApplySmartGrowth}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>اعمال افزایش نرخ روی ماه‌های آینده</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className={`p-4 rounded-xl border ${subCardStyle}`}>
            <label className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${textMuted}`}>
              <TrendingUp className="w-4 h-4 text-amber-500" />
              درصد افزایش نرخ فروش محصولات (٪)
            </label>
            <input
              type="number"
              value={priceGrowthRate}
              onChange={(e) => setPriceGrowthRate(Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-lg border text-sm font-bold text-amber-500 focus:outline-none ${cardStyle}`}
              dir="ltr"
            />
          </div>

          <div className={`p-4 rounded-xl border ${subCardStyle}`}>
            <label className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${textMuted}`}>
              <TrendingUp className="w-4 h-4 text-blue-400" />
              درصد رشد مقدار فروش / تولید (٪)
            </label>
            <input
              type="number"
              value={volumeGrowthRate}
              onChange={(e) => setVolumeGrowthRate(Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-lg border text-sm font-bold text-blue-400 focus:outline-none ${cardStyle}`}
              dir="ltr"
            />
          </div>

          <div className={`p-4 rounded-xl border ${subCardStyle}`}>
            <label className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${textMuted}`}>
              <Percent className="w-4 h-4 text-emerald-400" />
              حاشیه سود خالص تخمینی کل سال (٪)
            </label>
            <input
              type="number"
              step="0.5"
              value={estimatedNetMargin}
              onChange={(e) => setEstimatedNetMargin(Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-lg border text-sm font-bold text-emerald-400 focus:outline-none ${cardStyle}`}
              dir="ltr"
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className={`rounded-2xl border p-5 lg:col-span-5 ${cardStyle}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold flex items-center gap-2 ${textHeading}`}>
              <Edit3 className="w-4 h-4 text-amber-500" />
              جدول فروش ماهانه (محقق‌شده و پیش‌بینی دستی)
            </h3>
            <button
              onClick={() => {
                setMonthlyRows((prev) => prev.map((r) => ({ ...r, projectedSales: r.baseSales })));
              }}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border cursor-pointer ${borderSubtle} ${textMuted}`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>بازنشانی</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[430px] overflow-y-auto">
            <table className="w-full text-xs text-right">
              <thead className={darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}>
                <tr>
                  <th className="p-2.5">ماه</th>
                  <th className="p-2.5 text-center">وضعیت</th>
                  <th className="p-2.5 text-center">فروش (میلیارد تومان)</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {monthlyRows.map((row, idx) => (
                  <tr key={row.month} className={row.status === 'forecast' ? (darkMode ? 'bg-amber-500/5' : 'bg-amber-50/50') : ''}>
                    <td className="p-2.5 font-semibold">{row.month}</td>
                    <td className="p-2.5 text-center">
                      {row.status === 'actual' && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                          محقق‌شده
                        </span>
                      )}
                      {row.status === 'unreported' && (
                        <span className="px-2 py-0.5 rounded bg-slate-500/15 text-slate-400 text-[10px] font-bold">
                          ثبت نشده
                        </span>
                      )}
                      {row.status === 'forecast' && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                          پیش‌بینی آتی
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        step="0.1"
                        value={row.projectedSales}
                        onChange={(e) => handleManualMonthChange(idx, Number(e.target.value))}
                        className={`w-28 px-2 py-1 rounded border text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                          row.status === 'actual'
                            ? `${subCardStyle} text-emerald-400`
                            : row.status === 'forecast'
                            ? `${cardStyle} text-amber-500`
                            : `${subCardStyle} text-slate-400`
                        }`}
                        dir="ltr"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`rounded-2xl border p-6 lg:col-span-7 flex flex-col justify-between ${cardStyle}`}>
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className={`text-base font-bold ${textHeading}`}>
                نمودار ترکیب فروش محقق‌شده و پیش‌بینی تا پایان سال
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500"></span>
                  <span className={textMuted}>محقق‌شده</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-500"></span>
                  <span className={textMuted}>پیش‌بینی آینده</span>
                </span>
              </div>
            </div>

            <div className="h-[360px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRows} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="month" tick={{ fill: axisTickColor, fontSize: 12 }} />
                  <YAxis tick={{ fill: axisTickColor, fontSize: 12 }} />
                  <Tooltip
                    formatter={(val: any) => [`${formatNum(val, 1)} میلیارد تومان`, 'فروش ماه']}
                    contentStyle={{
                      backgroundColor: darkMode ? '#0f172a' : '#fff',
                      borderColor: darkMode ? '#334155' : '#e2e8f0',
                      borderRadius: '0.75rem'
                    }}
                  />
                  <Bar dataKey="projectedSales" radius={[5, 5, 0, 0]} maxBarSize={38}>
                    {monthlyRows.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.status === 'actual' ? '#10b981' : entry.status === 'forecast' ? '#f59e0b' : '#475569'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`mt-4 p-3.5 rounded-xl border text-xs ${subCardStyle}`}>
            <span className="font-bold text-amber-500">نحوه محاسبه مدل: </span>
            <span className={textMuted}>
              فروش ثبت‌شده تا اینجا ({formatNum(summary.realizedSales, 0)} میلیارد تومان) + فروش پیش‌بینی‌شده ماه‌های آتی ({formatNum(summary.remainingForecastSales, 0)} میلیارد تومان) ={' '}
              <strong className={textHeading}>{formatNum(summary.totalAnnualSales, 0)} میلیارد تومان</strong> کل فروش سال، که با حاشیه سود {estimatedNetMargin}٪ به{' '}
              <strong className="text-emerald-400">EPS {formatNum(summary.forwardEps, 0)} ریالی</strong> منجر می‌شود.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}