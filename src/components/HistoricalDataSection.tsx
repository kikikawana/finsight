import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import type { BenchmarkId } from '../types/finance';
import { computeHistoricalHorizons, formatPeso as baseFormatPeso, type CurrencyCode } from '../utils/financeMath';

interface HistoricalDataSectionProps {
  benchmarkId: BenchmarkId;
  weeklySavings: number;
  initialDeposit: number;
  currency?: CurrencyCode;
  onSelectBenchmark: (id: BenchmarkId) => void;
}

export function HistoricalDataSection({
  benchmarkId,
  weeklySavings,
  initialDeposit,
  currency = 'PHP',
  onSelectBenchmark,
}: HistoricalDataSectionProps) {
  const formatPeso = (amount: number, compact = false) =>
    baseFormatPeso(amount, compact, currency);
  const dataset = BENCHMARK_DATASETS[benchmarkId];

  const twentyYearSeries = useMemo(() => {
    return computeHistoricalHorizons(weeklySavings, initialDeposit, benchmarkId, false)[20]
      .yearlySeries.slice(1);
  }, [weeklySavings, initialDeposit, benchmarkId]);

  const maxAbsReturn = Math.max(
    45,
    ...dataset.annualReturns.map((r) => Math.abs(r.annualReturnPct))
  );

  return (
    <section
      id="historical-data"
      className="py-12 border-b border-slate-200/80 dark:border-slate-800/80 bg-transparent"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-400 tracking-wide mb-2">
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Verified 20-Year Historical Return Ledger (2005–2024)</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Real market returns—crash years included.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              {dataset.dataSource}. Weekly investing buys more shares during downturns like 2008 and
              2022, lowering your average cost before recoveries.
            </p>
          </div>

          <div
            role="group"
            aria-label="Historical dataset selector"
            className="inline-flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg shrink-0 self-start"
          >
            {(['sp500', 'psei', 'global60_40'] as BenchmarkId[]).map((id) => {
              const active = benchmarkId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectBenchmark(id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {BENCHMARK_DATASETS[id].shortName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Annual Return Bar Chart + Year-by-Year Ledger */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Calendar-Year Total Returns ({dataset.shortName})
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                2005 – 2024
              </span>
            </div>

            <div className="space-y-2">
              {dataset.annualReturns.map((item) => {
                const isPos = item.annualReturnPct >= 0;
                const widthPct = Math.min(
                  100,
                  (Math.abs(item.annualReturnPct) / maxAbsReturn) * 100
                );
                return (
                  <div
                    key={item.year}
                    className="grid grid-cols-12 items-center gap-2 text-xs tabular-nums"
                  >
                    <span className="col-span-2 font-mono text-slate-600 dark:text-slate-400">
                      {item.year}
                    </span>
                    <div className="col-span-7 flex items-center">
                      <div className="w-1/2 flex justify-end pr-1">
                        {!isPos && (
                          <div
                            className="h-3 rounded-l bg-rose-600 dark:bg-rose-500"
                            style={{ width: `${widthPct}%` }}
                          />
                        )}
                      </div>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 shrink-0" />
                      <div className="w-1/2 flex justify-start pl-1">
                        {isPos && (
                          <div
                            className="h-3 rounded-r bg-emerald-600 dark:bg-emerald-500"
                            style={{ width: `${widthPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <span
                      className={`col-span-3 text-right font-mono font-medium ${
                        isPos
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isPos ? '+' : ''}
                      {item.annualReturnPct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Year-by-Year Replay at {formatPeso(weeklySavings)}/week
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                20-yr actual sequence
              </span>
            </div>
            <div className="max-h-[470px] overflow-y-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Year</th>
                    <th className="py-2.5 px-4 font-medium text-right">Index Return</th>
                    <th className="py-2.5 px-4 font-medium text-right">Deposited</th>
                    <th className="py-2.5 px-4 font-medium text-right">Year-End Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {twentyYearSeries.map((pt) => {
                    const pos = pt.annualReturnPct >= 0;
                    const highlightMilestone =
                      pt.yearIndex === 5 || pt.yearIndex === 10 || pt.yearIndex === 20;
                    return (
                      <tr
                        key={pt.calendarYear}
                        className={
                          highlightMilestone
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/45'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="py-2.5 px-4 font-mono text-slate-900 dark:text-slate-100">
                          {pt.calendarYear}
                          {pt.eventNote && (
                            <span className="block text-[11px] font-sans text-slate-500 dark:text-slate-400">
                              {pt.eventNote}
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-medium ${
                            pos
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {pos ? '+' : ''}
                          {pt.annualReturnPct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                          {formatPeso(pt.totalContributed)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {formatPeso(pt.portfolioValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
