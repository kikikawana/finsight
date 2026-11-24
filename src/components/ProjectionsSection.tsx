import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarRange, Clock, Coins, TrendingUp } from 'lucide-react';
import { BENCHMARK_DATASETS, BENCHMARK_LIST } from '../data/historicalIndices';
import type { BenchmarkId, ScenarioInput } from '../types/finance';
import {
  computeHistoricalHorizons,
  CURRENCY_CONFIG,
  formatPeso,
  type CurrencyCode,
} from '../utils/financeMath';
import { WealthGrowthChart } from './WealthGrowthChart';

interface ProjectionsSectionProps {
  scenario: ScenarioInput;
  currency: CurrencyCode;
  onChangeCurrency: (currency: CurrencyCode) => void;
  onChangeScenario: (patch: Partial<ScenarioInput>) => void;
}

const WEEKLY_PRESETS = [
  { amount: 50, label: '₱50/wk', hint: 'Spare baon / change' },
  { amount: 150, label: '₱150/wk', hint: 'Student coffee cut' },
  { amount: 500, label: '₱500/wk', hint: 'Side-gig allocation' },
  { amount: 1000, label: '₱1,000/wk', hint: 'Focused goal sprint' },
];

export function ProjectionsSection({
  scenario,
  currency,
  onChangeCurrency,
  onChangeScenario,
}: ProjectionsSectionProps) {
  const [adjustForInflation, setAdjustForInflation] = useState(false);

  const horizons = useMemo(
    () =>
      computeHistoricalHorizons(
        scenario.weeklySavings,
        scenario.initialDeposit,
        scenario.benchmarkId,
        adjustForInflation
      ),
    [
      scenario.weeklySavings,
      scenario.initialDeposit,
      scenario.benchmarkId,
      adjustForInflation,
    ]
  );

  const activeBenchmark = BENCHMARK_DATASETS[scenario.benchmarkId];
  const milestoneList = [horizons[1], horizons[5], horizons[10], horizons[20]];

  return (
    <section
      id="projections"
      className="py-10 sm:py-12 border-b border-slate-200/80 dark:border-slate-800/80 bg-transparent"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Workspace Header */}
        <div className="max-w-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
            Weekly Projections · 1 to 20 Years
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            Enter what you can set aside each week, from ₱50 out of a student allowance to ₱1,000+
            from a paycheck, and see how it grows across 1, 5, 10, and 20 years.
          </p>
        </div>

        {/* Main 2-Column Workspace */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Left Control Rail */}
          <div className="lg:col-span-4 finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label
                  htmlFor="weekly-savings-input"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Weekly Savings (PHP)
                </label>
                <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                  {formatPeso(scenario.weeklySavings * 52, false, currency)}/yr
                </span>
              </div>

              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="weekly-savings-input"
                  type="number"
                  min={5}
                  max={100000}
                  step={5}
                  value={scenario.weeklySavings}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChangeScenario({
                      weeklySavings: Number.isFinite(val) ? Math.max(1, val) : 1,
                    });
                  }}
                  className="w-full pl-8 pr-16 py-2.5 text-base font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 tabular-nums"
                />
                <span className="absolute right-3.5 text-xs text-slate-500 dark:text-slate-400">
                  / week
                </span>
              </div>

              <input
                type="range"
                aria-label="Weekly savings slider"
                min={10}
                max={5000}
                step={10}
                value={Math.min(5000, scenario.weeklySavings)}
                onChange={(e) =>
                  onChangeScenario({ weeklySavings: Number(e.target.value) })
                }
                className="finsight-range w-full mt-3"
              />

              <div className="grid grid-cols-2 gap-2 mt-3">
                {WEEKLY_PRESETS.map((preset) => {
                  const active = scenario.weeklySavings === preset.amount;
                  return (
                    <button
                      key={preset.amount}
                      type="button"
                      onClick={() => onChangeScenario({ weeklySavings: preset.amount })}
                      className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-500 shadow-xs'
                          : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-500/60'
                      }`}
                    >
                      <div className="font-mono font-semibold whitespace-nowrap">
                        {preset.label}
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          active ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {preset.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-baseline justify-between mb-2">
                <label
                  htmlFor="initial-deposit-input"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Starting Balance (Optional)
                </label>
                <span className="text-xs text-slate-500 dark:text-slate-400">Day 1 capital</span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="initial-deposit-input"
                  type="number"
                  min={0}
                  max={100000000}
                  step={500}
                  value={scenario.initialDeposit}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChangeScenario({
                      initialDeposit: Number.isFinite(val) ? Math.max(0, val) : 0,
                    });
                  }}
                  className="w-full pl-8 pr-4 py-2 text-sm font-mono font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 tabular-nums"
                />
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Historical Stock Index
              </div>
              <div
                role="group"
                aria-label="Select historical index"
                className="flex flex-col gap-1.5"
              >
                {BENCHMARK_LIST.map((bench) => {
                  const selected = scenario.benchmarkId === bench.id;
                  return (
                    <button
                      key={bench.id}
                      type="button"
                      onClick={() =>
                        onChangeScenario({ benchmarkId: bench.id as BenchmarkId })
                      }
                      className={`w-full px-3.5 py-2.5 text-left rounded-lg border transition-all cursor-pointer ${
                        selected
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/70 border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-emerald-100'
                          : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold whitespace-nowrap">
                          {bench.shortName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {bench.tickerLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                {activeBenchmark.description}
              </p>
            </div>

            <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Inflation-Adjusted (Real Value)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Deducts 3.5%/yr CPI purchasing power
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={adjustForInflation}
                  onClick={() => setAdjustForInflation((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    adjustForInflation
                      ? 'bg-emerald-700 dark:bg-emerald-500'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      adjustForInflation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Display Currency
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {currency === 'PHP'
                      ? 'Base PHP'
                      : `1 ${currency} = ₱${CURRENCY_CONFIG[currency].phpPerUnit}`}
                  </span>
                </div>
                <div
                  role="group"
                  aria-label="Display currency"
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  {(['PHP', 'USD', 'SGD'] as CurrencyCode[]).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => onChangeCurrency(code)}
                      className={`py-1.5 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                        currency === code
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Projections Canvas */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1, 5, 10, 20 Year Milestone Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
              {milestoneList.map((h) => {
                const isTwenty = h.years === 20;
                const isTen = h.years === 10;
                const isFive = h.years === 5;
                return (
                  <div
                    key={h.years}
                    className={`finsight-card-interactive rounded-xl p-4 ${
                      isTwenty
                        ? 'finsight-obsidian-card text-white'
                        : 'finsight-surface bg-white dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-stone-200/90 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isTwenty
                            ? 'text-amber-300'
                            : isTen
                              ? 'text-amber-700 dark:text-amber-400'
                              : isFive
                                ? 'text-sky-700 dark:text-sky-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {isTwenty ? (
                          <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : isTen ? (
                          <Coins className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : isFive ? (
                          <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{h.years}-Year</span>
                      </span>
                      <span
                        className={`font-mono text-[11px] ${
                          isTwenty ? 'text-emerald-100/75' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {h.windowLabel}
                      </span>
                    </div>

                    <div className="mt-2.5 text-xl sm:text-2xl font-display font-bold tracking-tight tabular-nums">
                      {formatPeso(h.endingBalance, false, currency)}
                    </div>

                    <div
                      className={`mt-1 text-[11px] font-mono tabular-nums ${
                        isTwenty ? 'text-emerald-300' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {h.realizedCagrPct >= 0 ? '+' : ''}
                      {h.realizedCagrPct.toFixed(1)}% / yr
                    </div>

                    <div
                      className={`mt-3 pt-3 border-t space-y-1 text-[11px] tabular-nums ${
                        isTwenty ? 'border-white/15' : 'border-stone-100 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={isTwenty ? 'text-emerald-100/70' : 'text-slate-500 dark:text-slate-400'}>
                          Deposited
                        </span>
                        <span className="font-mono font-medium">
                          {formatPeso(h.totalContributed, true, currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={isTwenty ? 'text-emerald-100/70' : 'text-slate-500 dark:text-slate-400'}>
                          Growth
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            h.totalGrowth >= 0
                              ? isTwenty
                                ? 'text-amber-300'
                                : 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-500 dark:text-red-400'
                          }`}
                        >
                          {h.totalGrowth >= 0 ? '+' : ''}
                          {formatPeso(h.totalGrowth, true, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 20-Year Historical Compounding Curve */}
            <WealthGrowthChart
              series={horizons[20].yearlySeries}
              benchmarkName={activeBenchmark.name}
              currency={currency}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
