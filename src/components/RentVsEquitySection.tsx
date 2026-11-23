import { useMemo, useState } from 'react';
import { Home, KeyRound, Scale, TrendingDown } from 'lucide-react';
import type { ScenarioInput } from '../types/finance';
import { computeRentVsEquity, formatPeso as baseFormatPeso, type CurrencyCode } from '../utils/financeMath';

interface RentVsEquitySectionProps {
  scenario: ScenarioInput;
  currency?: CurrencyCode;
  onChangeScenario: (patch: Partial<ScenarioInput>) => void;
}

export function RentVsEquitySection({
  scenario,
  currency = 'PHP',
  onChangeScenario,
}: RentVsEquitySectionProps) {
  const formatPeso = (amount: number, compact = false) =>
    baseFormatPeso(amount, compact, currency);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const model = useMemo(() => computeRentVsEquity(scenario), [scenario]);

  const width = 760;
  const height = 280;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 38;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = Math.max(
    100000,
    ...model.series.map((p) => Math.max(p.cumulativeRentPaid, p.netHomeEquity))
  );
  const niceMax = maxVal * 1.12;

  const xForYear = (yr: number) => padLeft + (yr / 20) * innerW;
  const yForValue = (val: number) =>
    padTop + innerH - (Math.max(0, val) / niceMax) * innerH;

  const rentPath = model.series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForYear(p.yearIndex).toFixed(1)} ${yForValue(p.cumulativeRentPaid).toFixed(1)}`)
    .join(' ');

  const equityPath = model.series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForYear(p.yearIndex).toFixed(1)} ${yForValue(p.netHomeEquity).toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: niceMax * t,
    y: yForValue(niceMax * t),
  }));

  const activePoint =
    hoveredYear !== null
      ? model.series[hoveredYear] ?? model.at20Years
      : model.at20Years;

  const purchaseYearMarker =
    model.yearsToDownPayment !== null && model.yearsToDownPayment <= 20
      ? model.yearsToDownPayment
      : null;

  return (
    <section
      id="rent-equity"
      className="py-12 bg-transparent border-b border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide mb-2">
            <Home className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>Rent-to-Equity Reality Check</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
            Your monthly rent can pay your own mortgage once you clear the down payment.
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
            Rent builds 0% ownership equity. Saving {formatPeso(scenario.weeklySavings)} every
            week bridges the down payment—so the exact peso stream going to a landlord shifts
            into building your own property net worth.
          </p>
        </div>

        {/* Plain-English Insight Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="finsight-card-interactive bg-white/95 dark:bg-slate-900/90 border border-sky-200 dark:border-sky-800/70 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-sky-800 dark:text-sky-300 font-medium">
              <span>Target Down Payment ({scenario.downPaymentPercent}%)</span>
              <Home className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1.5 tabular-nums">
              {formatPeso(model.requiredDownPayment)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              On {formatPeso(scenario.targetHomePrice)} home
            </div>
          </div>

          <div className="finsight-card-interactive bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              <span>Down Payment Reached In</span>
              <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1.5 tabular-nums">
              {model.yearsToDownPayment !== null
                ? `${model.yearsToDownPayment} yrs`
                : 'Over 20 yrs'}
            </div>
            <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1 tabular-nums">
              {model.monthsToDownPayment !== null
                ? `At ${formatPeso(scenario.weeklySavings)}/wk invested`
                : 'Try raising weekly savings'}
            </div>
          </div>

          <div className="finsight-card-interactive bg-amber-50/90 dark:bg-amber-950/55 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-amber-900 dark:text-amber-300 font-medium">
              <span>Rent vs. Monthly Mortgage</span>
              <Scale className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1.5 tabular-nums">
              {Math.min(999, Math.round(model.rentToMortgageCoveragePct))}% covered
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
              Rent {formatPeso(scenario.monthlyRent)} vs {formatPeso(model.monthlyMortgagePI)}/mo P&amp;I
            </div>
          </div>

          <div className="finsight-card-interactive bg-rose-50/90 dark:bg-rose-950/55 border border-rose-200 dark:border-rose-800/80 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-rose-800 dark:text-rose-300 font-medium">
              <span>20-Year Rent Sunk (No Home)</span>
              <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-mono font-bold text-rose-600 dark:text-rose-400 mt-1.5 tabular-nums">
              {formatPeso(model.at20Years.cumulativeRentPaid)}
            </div>
            <div className="text-xs text-rose-800/75 dark:text-rose-300/80 mt-1">
              ₱0 landlord equity returned
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Housing Parameters */}
          <div className="lg:col-span-4 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label
                  htmlFor="monthly-rent"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Current Monthly Rent
                </label>
                <span className="text-xs font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatPeso(scenario.monthlyRent * 12)}/yr
                </span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="monthly-rent"
                  type="number"
                  min={0}
                  max={500000}
                  step={500}
                  value={scenario.monthlyRent}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChangeScenario({
                      monthlyRent: Number.isFinite(val) ? Math.max(0, val) : 0,
                    });
                  }}
                  className="w-full pl-8 pr-16 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 tabular-nums"
                />
                <span className="absolute right-3.5 text-xs text-slate-500 dark:text-slate-400">
                  / mo
                </span>
              </div>
              <input
                type="range"
                aria-label="Monthly rent slider"
                min={2000}
                max={50000}
                step={500}
                value={Math.min(50000, scenario.monthlyRent)}
                onChange={(e) =>
                  onChangeScenario({ monthlyRent: Number(e.target.value) })
                }
                className="finsight-range w-full mt-2.5"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label
                  htmlFor="target-home-price"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Target Home Price
                </label>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatPeso(scenario.targetHomePrice, true)}
                </span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="target-home-price"
                  type="number"
                  min={100000}
                  max={50000000}
                  step={100000}
                  value={scenario.targetHomePrice}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChangeScenario({
                      targetHomePrice: Number.isFinite(val) ? Math.max(100000, val) : 100000,
                    });
                  }}
                  className="w-full pl-8 pr-4 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label
                  htmlFor="dp-percent"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Down Pmt %
                </label>
                <input
                  id="dp-percent"
                  type="number"
                  min={5}
                  max={50}
                  step={1}
                  value={scenario.downPaymentPercent}
                  onChange={(e) =>
                    onChangeScenario({
                      downPaymentPercent: Math.min(50, Math.max(5, Number(e.target.value) || 20)),
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-sm font-mono font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="mortgage-rate"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Loan Rate %
                </label>
                <input
                  id="mortgage-rate"
                  type="number"
                  min={1}
                  max={25}
                  step={0.25}
                  value={scenario.mortgageRate}
                  onChange={(e) =>
                    onChangeScenario({
                      mortgageRate: Math.min(25, Math.max(1, Number(e.target.value) || 6.5)),
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-sm font-mono font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="rent-growth"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Rent Hike %
                </label>
                <input
                  id="rent-growth"
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  value={scenario.rentGrowthRate}
                  onChange={(e) =>
                    onChangeScenario({
                      rentGrowthRate: Math.min(15, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-sm font-mono font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
              {model.monthlyGapAfterRent <= 0 ? (
                <p>
                  Your current{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {formatPeso(scenario.monthlyRent)}
                  </strong>{' '}
                  rent already exceeds the estimated{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {formatPeso(model.monthlyMortgagePI)}
                  </strong>{' '}
                  monthly 20-year mortgage payment—leaving{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {formatPeso(Math.abs(model.monthlyGapAfterRent))}/mo
                  </strong>{' '}
                  extra once you buy.
                </p>
              ) : (
                <p>
                  Once you clear the down payment, your{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {formatPeso(scenario.monthlyRent)}
                  </strong>{' '}
                  rent covers most of the{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {formatPeso(model.monthlyMortgagePI)}
                  </strong>{' '}
                  mortgage (a{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {formatPeso(model.monthlyGapAfterRent)}/mo
                  </strong>{' '}
                  difference—while rent keeps rising {scenario.rentGrowthRate}%/yr).
                </p>
              )}
              {model.yearsToDownPayment === null && (
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  At {formatPeso(scenario.weeklySavings)}/wk, the down payment takes over 20 years. Try
                  increasing your weekly savings above to see the purchase crossover.
                </p>
              )}
            </div>
          </div>

          {/* Right Chart + Milestone Table */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Sunk Rent vs. Ownership Equity After Down Payment
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Compares cumulative rent paid with zero ownership vs. net property equity + ongoing weekly portfolio
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
                    <span>Ownership Equity + Savings</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 bg-rose-600 dark:bg-rose-400" aria-hidden="true" />
                    <span>Cumulative Rent Sunk</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 py-3 px-4 mb-4 bg-slate-50 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs tabular-nums">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Year {activePoint.yearIndex} Status
                  </div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activePoint.hasPurchased ? 'Homeowner' : 'Saving for Down Payment'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Rent Burned (Keep Renting)</div>
                  <div className="font-mono font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                    {formatPeso(activePoint.cumulativeRentPaid)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Net Wealth (Buy Path)</div>
                  <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {formatPeso(activePoint.netHomeEquity)}
                  </div>
                </div>
              </div>

              <div className="w-full overflow-hidden">
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="w-full h-auto select-none"
                  role="img"
                  aria-label="Rent sunk versus home equity built chart"
                >
                  {yTicks.map((tick, i) => (
                    <g key={i}>
                      <line
                        x1={padLeft}
                        y1={tick.y}
                        x2={width - padRight}
                        y2={tick.y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 8}
                        y={tick.y + 4}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                      >
                        {formatPeso(tick.val, true)}
                      </text>
                    </g>
                  ))}

                  {[5, 10, 15, 20].map((yr) => (
                    <text
                      key={yr}
                      x={xForYear(yr)}
                      y={height - 10}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                    >
                      Yr {yr}
                    </text>
                  ))}

                  {/* Down payment milestone vertical marker */}
                  {purchaseYearMarker !== null && purchaseYearMarker > 0 && (
                    <g>
                      <line
                        x1={xForYear(purchaseYearMarker)}
                        y1={padTop}
                        x2={xForYear(purchaseYearMarker)}
                        y2={padTop + innerH}
                        className="stroke-slate-900 dark:stroke-amber-400"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />
                      <text
                        x={Math.min(width - 95, xForYear(purchaseYearMarker) + 6)}
                        y={padTop + 12}
                        className="fill-slate-900 dark:fill-amber-300 text-[10px] font-semibold"
                      >
                        Down Payment Hit (Yr {purchaseYearMarker})
                      </text>
                    </g>
                  )}

                  {/* Cumulative Rent Paid Line */}
                  <path
                    d={rentPath}
                    fill="none"
                    className="stroke-rose-600 dark:stroke-rose-400"
                    strokeWidth="2.25"
                    strokeDasharray="5 3"
                  />

                  {/* Net Home Equity Line */}
                  <path
                    d={equityPath}
                    fill="none"
                    className="stroke-emerald-700 dark:stroke-emerald-400"
                    strokeWidth="2.75"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {/* Interactive hover guide */}
                  {hoveredYear !== null && (
                    <g>
                      <line
                        x1={xForYear(activePoint.yearIndex)}
                        y1={padTop}
                        x2={xForYear(activePoint.yearIndex)}
                        y2={padTop + innerH}
                        className="stroke-slate-400 dark:stroke-slate-500"
                        strokeWidth="1"
                      />
                      <circle
                        cx={xForYear(activePoint.yearIndex)}
                        cy={yForValue(activePoint.netHomeEquity)}
                        r={4.5}
                        className="fill-emerald-700 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
                        strokeWidth="2"
                      />
                      <circle
                        cx={xForYear(activePoint.yearIndex)}
                        cy={yForValue(activePoint.cumulativeRentPaid)}
                        r={4.5}
                        className="fill-rose-600 dark:fill-rose-400 stroke-white dark:stroke-slate-900"
                        strokeWidth="2"
                      />
                    </g>
                  )}

                  {model.series.map((pt) => {
                    const bandW = innerW / 20;
                    return (
                      <rect
                        key={pt.yearIndex}
                        x={Math.max(padLeft, xForYear(pt.yearIndex) - bandW / 2)}
                        y={padTop}
                        width={bandW}
                        height={innerH}
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={() => setHoveredYear(pt.yearIndex)}
                        onMouseLeave={() => setHoveredYear(null)}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* 5, 10, 20 Year Comparison Table */}
            <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  5, 10 &amp; 20-Year Rent vs. Ownership Snapshot
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Includes {scenario.rentGrowthRate}%/yr rent escalation &amp; 3.5%/yr property growth
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Horizon</th>
                      <th className="py-2.5 px-4 font-medium text-right">Cumulative Rent Sunk</th>
                      <th className="py-2.5 px-4 font-medium text-right">Home Value</th>
                      <th className="py-2.5 px-4 font-medium text-right">Remaining Loan</th>
                      <th className="py-2.5 px-4 font-medium text-right">Net Equity + Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {[model.at5Years, model.at10Years, model.at20Years].map((row) => (
                      <tr key={row.yearIndex} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          Year {row.yearIndex}
                          <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                            · {row.hasPurchased ? 'Owning' : 'Saving'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-600 dark:text-rose-400 font-medium">
                          {formatPeso(row.cumulativeRentPaid)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          {row.hasPurchased ? formatPeso(row.homeValue) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                          {row.hasPurchased ? formatPeso(row.mortgageBalance) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatPeso(row.netHomeEquity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
