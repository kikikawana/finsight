import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import type {
  BenchmarkId,
  CurrencyCode,
  GoalSplitPlanSummary,
  GoalTimelinePoint,
  HistoricalYearReturn,
  HorizonSummary,
  IncomeCadence,
  ScenarioInput,
  TakeRateComparisonPoint,
  YearlyProjectionPoint,
} from '../types/finance';

export type { CurrencyCode };

export const DEFAULT_SCENARIO: ScenarioInput = {
  title: 'My Savings Goal',
  goalCategory: 'custom',
  goalTargetAmount: 50000,
  incomeAmount: 1500,
  incomeCadence: 'weekly',
  savingsPercent: 20,
  needsPercent: 55,
  wantsPercent: 25,
  weeklySavings: 300,
  initialDeposit: 0,
  benchmarkId: 'global60_40',
};

const ANNUAL_INFLATION_RATE = 0.035; // 3.5% CPI baseline for optional real-value view
const DIGITAL_HYSA_ANNUAL_RATE = 0.04; // 4.0% digital savings bank baseline
const TYPICAL_INSTALLMENT_EFFECTIVE_APR = 0.18; // ~18% APR typical vehicle/gadget financing

export const CURRENCY_CONFIG: Record<
  CurrencyCode,
  { symbol: string; label: string; phpPerUnit: number; locale: string }
> = {
  PHP: { symbol: '₱', label: 'PHP (₱)', phpPerUnit: 1, locale: 'en-PH' },
  USD: { symbol: '$', label: 'USD ($)', phpPerUnit: 58.5, locale: 'en-US' },
  SGD: { symbol: 'S$', label: 'SGD (S$)', phpPerUnit: 43.5, locale: 'en-SG' },
};

export function getLocalISODate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatPeso(
  amount: number,
  compact = false,
  currency: CurrencyCode = 'PHP',
  phpPerUsd = 58.5
): string {
  const safePhp = Number.isFinite(amount) ? amount : 0;
  const rate =
    currency === 'USD'
      ? phpPerUsd
      : currency === 'SGD'
        ? CURRENCY_CONFIG.SGD.phpPerUnit
        : 1;
  const converted = safePhp / Math.max(0.01, rate);
  const cfg = CURRENCY_CONFIG[currency];

  if (compact && Math.abs(converted) >= 1_000_000) {
    return `${cfg.symbol}${(converted / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(converted) >= 10_000) {
    return `${cfg.symbol}${(converted / 1_000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'PHP' ? 0 : converted < 100 ? 2 : 0,
  }).format(converted);
}

export function formatPesoExact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(safe));
}

export function incomeToWeekly(amount: number, cadence: IncomeCadence): number {
  const safe = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return cadence === 'weekly' ? safe : (safe * 12) / 52;
}

export function incomeToMonthly(amount: number, cadence: IncomeCadence): number {
  const safe = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return cadence === 'monthly' ? safe : (safe * 52) / 12;
}

export function computeWeeklyFromPercent(
  incomeAmount: number,
  incomeCadence: IncomeCadence,
  savingsPercent: number
): number {
  const weeklyIncome = incomeToWeekly(incomeAmount, incomeCadence);
  const pct = Math.min(95, Math.max(1, savingsPercent));
  return Math.max(1, Math.round((weeklyIncome * pct) / 100));
}

/**
 * Replays weekly contributions (52 weeks/yr) across an exact sequence of historical annual returns.
 */
function simulateHistoricalWindow(
  weeklySavings: number,
  initialDeposit: number,
  windowReturns: HistoricalYearReturn[],
  adjustForInflation: boolean
): {
  yearlySeries: YearlyProjectionPoint[];
  endingBalance: number;
  totalContributed: number;
  realizedCagrPct: number;
} {
  let balance = initialDeposit;
  let totalContributed = initialDeposit;
  const yearlySeries: YearlyProjectionPoint[] = [
    {
      yearIndex: 0,
      calendarYear: (windowReturns[0]?.year ?? 2005) - 1,
      annualReturnPct: 0,
      totalContributed: initialDeposit,
      portfolioValue: initialDeposit,
      marketGain: 0,
    },
  ];

  windowReturns.forEach((yr, idx) => {
    const rawAnnualRate = yr.annualReturnPct / 100;
    const effectiveAnnualRate = adjustForInflation
      ? (1 + rawAnnualRate) / (1 + ANNUAL_INFLATION_RATE) - 1
      : rawAnnualRate;

    const weeklyRate = Math.pow(1 + effectiveAnnualRate, 1 / 52) - 1;
    const weeklyContribution = adjustForInflation
      ? weeklySavings / Math.pow(1 + ANNUAL_INFLATION_RATE, idx)
      : weeklySavings;

    for (let w = 0; w < 52; w++) {
      balance = (balance + weeklyContribution) * (1 + weeklyRate);
      totalContributed += weeklyContribution;
    }

    yearlySeries.push({
      yearIndex: idx + 1,
      calendarYear: yr.year,
      annualReturnPct: yr.annualReturnPct,
      totalContributed,
      portfolioValue: balance,
      marketGain: balance - totalContributed,
      eventNote: yr.eventNote,
    });
  });

  const years = windowReturns.length || 1;
  const compoundFactor = windowReturns.reduce((acc, yr) => {
    const r = yr.annualReturnPct / 100;
    const eff = adjustForInflation ? (1 + r) / (1 + ANNUAL_INFLATION_RATE) - 1 : r;
    return acc * (1 + eff);
  }, 1);
  const realizedCagrPct = (Math.pow(Math.max(compoundFactor, 0.0001), 1 / years) - 1) * 100;

  return {
    yearlySeries,
    endingBalance: balance,
    totalContributed,
    realizedCagrPct,
  };
}

export function computeHistoricalHorizons(
  weeklySavings: number,
  initialDeposit: number,
  benchmarkId: BenchmarkId,
  adjustForInflation: boolean
): Record<1 | 5 | 10 | 20, HorizonSummary> {
  const dataset = BENCHMARK_DATASETS[benchmarkId];
  const allReturns = dataset.annualReturns; // 20 years: 2005–2024

  const buildHorizon = (years: 1 | 5 | 10 | 20): HorizonSummary => {
    const slice = allReturns.slice(allReturns.length - years);
    const sim = simulateHistoricalWindow(weeklySavings, initialDeposit, slice, adjustForInflation);

    let rollingBestEnding = sim.endingBalance;
    let rollingWorstEnding = sim.endingBalance;
    if (years < allReturns.length) {
      rollingBestEnding = -Infinity;
      rollingWorstEnding = Infinity;
      for (let start = 0; start <= allReturns.length - years; start++) {
        const sub = allReturns.slice(start, start + years);
        const subSim = simulateHistoricalWindow(
          weeklySavings,
          initialDeposit,
          sub,
          adjustForInflation
        );
        rollingBestEnding = Math.max(rollingBestEnding, subSim.endingBalance);
        rollingWorstEnding = Math.min(rollingWorstEnding, subSim.endingBalance);
      }
    }

    const totalGrowth = sim.endingBalance - sim.totalContributed;
    const growthSharePct =
      sim.endingBalance > 0 ? (totalGrowth / sim.endingBalance) * 100 : 0;

    return {
      years,
      windowLabel:
        years === 1
          ? `${slice[0].year}`
          : `${slice[0].year}–${slice[slice.length - 1].year}`,
      totalContributed: sim.totalContributed,
      endingBalance: sim.endingBalance,
      totalGrowth,
      growthSharePct,
      realizedCagrPct: sim.realizedCagrPct,
      yearlySeries: sim.yearlySeries,
      rollingBestEnding,
      rollingWorstEnding,
    };
  };

  return {
    1: buildHorizon(1),
    5: buildHorizon(5),
    10: buildHorizon(10),
    20: buildHorizon(20),
  };
}

/**
 * Simulates months to hit a goal under Cash (0%), Digital Bank (4% p.a.), and Historical Index Compounding.
 */
function simulateGoalMonths(
  weeklyContribution: number,
  initialDeposit: number,
  goalTargetAmount: number,
  benchmarkId: BenchmarkId,
  maxMonths = 120
): {
  monthsToCash: number | null;
  monthsToDigital: number | null;
  monthsToInvested: number | null;
  series: GoalTimelinePoint[];
} {
  const dataset = BENCHMARK_DATASETS[benchmarkId];
  const recentReturns = dataset.annualReturns.slice(-10); // Recent 10-yr cycle for realistic near-term planning
  const monthlyContrib = (weeklyContribution * 52) / 12;
  const monthlyDigitalRate = Math.pow(1 + DIGITAL_HYSA_ANNUAL_RATE, 1 / 12) - 1;

  let cash = initialDeposit;
  let digital = initialDeposit;
  let invested = initialDeposit;

  let monthsToCash: number | null = initialDeposit >= goalTargetAmount ? 0 : null;
  let monthsToDigital: number | null = initialDeposit >= goalTargetAmount ? 0 : null;
  let monthsToInvested: number | null = initialDeposit >= goalTargetAmount ? 0 : null;

  const series: GoalTimelinePoint[] = [
    {
      monthIndex: 0,
      label: 'Now',
      cashSaved: cash,
      digitalBankBalance: digital,
      investedBalance: invested,
      targetGoal: goalTargetAmount,
    },
  ];

  for (let m = 1; m <= maxMonths; m++) {
    const yearReturnObj = recentReturns[Math.floor((m - 1) / 12) % recentReturns.length];
    const annualPct = yearReturnObj?.annualReturnPct ?? 7.5;
    const monthlyMarketRate = Math.pow(Math.max(0.05, 1 + annualPct / 100), 1 / 12) - 1;

    cash += monthlyContrib;
    digital = (digital + monthlyContrib) * (1 + monthlyDigitalRate);
    invested = (invested + monthlyContrib) * (1 + monthlyMarketRate);

    if (monthsToCash === null && cash >= goalTargetAmount) monthsToCash = m;
    if (monthsToDigital === null && digital >= goalTargetAmount) monthsToDigital = m;
    if (monthsToInvested === null && invested >= goalTargetAmount) monthsToInvested = m;

    series.push({
      monthIndex: m,
      label: m % 12 === 0 ? `Yr ${m / 12}` : `Mo ${m}`,
      cashSaved: cash,
      digitalBankBalance: digital,
      investedBalance: invested,
      targetGoal: goalTargetAmount,
    });
  }

  return { monthsToCash, monthsToDigital, monthsToInvested, series };
}

export function formatDurationMonths(months: number | null): string {
  if (months === null) return 'Over 10 yrs';
  if (months === 0) return 'Funded today';
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'}`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${yrs} ${yrs === 1 ? 'yr' : 'yrs'}`;
  return `${yrs}y ${rem}m`;
}

export function formatWeeksDuration(weeks: number): string {
  if (weeks <= 0) return 'Goal reached';
  if (weeks < 8) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  const months = Math.round((weeks * 12) / 52);
  if (months < 12) return `${weeks} wks (~${months} mo)`;
  const yrs = Math.floor(months / 12);
  const remMo = months % 12;
  return remMo === 0
    ? `${weeks} wks (~${yrs} ${yrs === 1 ? 'yr' : 'yrs'})`
    : `${weeks} wks (~${yrs}y ${remMo}m)`;
}

export function computeRemainingGoalEta(
  currentSaved: number,
  goalTargetAmount: number,
  weeklySavings: number,
  benchmarkId: BenchmarkId
): {
  remaining: number;
  weeksCash: number;
  monthsCash: number | null;
  monthsInvested: number | null;
  targetDateLabel: string;
} {
  const safeTarget = Math.max(500, goalTargetAmount);
  const safeSaved = Math.max(0, currentSaved);
  const safeWeekly = Math.max(1, weeklySavings);
  const remaining = Math.max(0, safeTarget - safeSaved);

  if (remaining <= 0) {
    return {
      remaining: 0,
      weeksCash: 0,
      monthsCash: 0,
      monthsInvested: 0,
      targetDateLabel: 'Funded today',
    };
  }

  const weeksCash = Math.ceil(remaining / safeWeekly);
  const sim = simulateGoalMonths(safeWeekly, safeSaved, safeTarget, benchmarkId, 120);

  const estDate = new Date();
  estDate.setDate(estDate.getDate() + Math.min(weeksCash, 5200) * 7);
  const targetDateLabel =
    weeksCash > 5200
      ? '100+ yrs'
      : estDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return {
    remaining,
    weeksCash,
    monthsCash: sim.monthsToCash,
    monthsInvested: sim.monthsToInvested,
    targetDateLabel,
  };
}

/**
 * Computes full Goal & Percentage Split metrics, timeline series, and take-rate comparison bars.
 */
export function computeGoalSplitPlan(input: ScenarioInput): GoalSplitPlanSummary {
  const weeklyIncome = incomeToWeekly(input.incomeAmount, input.incomeCadence);
  const monthlyIncome = incomeToMonthly(input.incomeAmount, input.incomeCadence);

  const weeklyFromSplit =
    weeklyIncome > 0 ? Math.round((weeklyIncome * input.savingsPercent) / 100) : input.weeklySavings;
  const monthlyFromSplit = (input.weeklySavings * 52) / 12;

  const monthlyNeedsAmount = (monthlyIncome * input.needsPercent) / 100;
  const monthlyWantsAmount = (monthlyIncome * input.wantsPercent) / 100;
  const unallocatedPct = Math.max(
    0,
    100 - (input.savingsPercent + input.needsPercent + input.wantsPercent)
  );
  const monthlyUnallocatedAmount = (monthlyIncome * unallocatedPct) / 100;

  const remainingToGoal = Math.max(0, input.goalTargetAmount - input.initialDeposit);

  // Choose an intelligent chart horizon based on how fast the user reaches the goal
  const fullSim = simulateGoalMonths(
    input.weeklySavings,
    input.initialDeposit,
    input.goalTargetAmount,
    input.benchmarkId,
    120
  );

  const slowestHit = Math.max(
    fullSim.monthsToCash ?? 36,
    fullSim.monthsToInvested ?? 36
  );
  const displayMaxMonths = Math.min(
    120,
    Math.max(12, Math.ceil((slowestHit + 4) / 6) * 6)
  );
  const displaySeries = fullSim.series.slice(0, displayMaxMonths + 1);

  const oneYearPoint = fullSim.series[12] ?? fullSim.series[fullSim.series.length - 1];

  // Compare different savings take-rates against user's income (or fallback weekly scaling if income=0)
  const candidateRates = [10, 15, 20, 25, 30, 40];
  const takeRateComparisons: TakeRateComparisonPoint[] = candidateRates.map((pct) => {
    const rateWeekly =
      weeklyIncome > 0
        ? Math.max(1, Math.round((weeklyIncome * pct) / 100))
        : Math.max(1, Math.round((input.weeklySavings * pct) / Math.max(1, input.savingsPercent)));
    const sim = simulateGoalMonths(
      rateWeekly,
      input.initialDeposit,
      input.goalTargetAmount,
      input.benchmarkId,
      120
    );
    return {
      percent: pct,
      label: `${pct}%`,
      weeklyAmount: rateWeekly,
      monthlyAmount: Math.round((rateWeekly * 52) / 12),
      monthsToGoalCash: sim.monthsToCash,
      monthsToGoalInvested: sim.monthsToInvested,
      isCurrent: Math.abs(input.savingsPercent - pct) <= 2,
    };
  });

  // 24-month installment interest avoided by saving cash (useful for motorcycles, laptops, gear)
  const monthlyLoanRate = TYPICAL_INSTALLMENT_EFFECTIVE_APR / 12;
  const n = 24;
  const financedPrincipal = input.goalTargetAmount * 0.8; // assuming 20% down payment on installment
  const monthlyInstallment =
    (financedPrincipal * (monthlyLoanRate * Math.pow(1 + monthlyLoanRate, n))) /
    (Math.pow(1 + monthlyLoanRate, n) - 1);
  const installmentTotalCost24Mo = input.goalTargetAmount * 0.2 + monthlyInstallment * n;
  const installmentInterestSaved = Math.max(0, installmentTotalCost24Mo - input.goalTargetAmount);

  return {
    weeklyIncome,
    monthlyIncome,
    weeklyFromSplit,
    monthlyFromSplit,
    monthlyNeedsAmount,
    monthlyWantsAmount,
    monthlyUnallocatedAmount,
    remainingToGoal,
    monthsToGoalCash: fullSim.monthsToCash,
    monthsToGoalDigitalBank: fullSim.monthsToDigital,
    monthsToGoalInvested: fullSim.monthsToInvested,
    weeksToGoalCash:
      fullSim.monthsToCash !== null ? Math.ceil((fullSim.monthsToCash * 52) / 12) : null,
    weeksToGoalInvested:
      fullSim.monthsToInvested !== null ? Math.ceil((fullSim.monthsToInvested * 52) / 12) : null,
    oneYearCashBalance: oneYearPoint?.cashSaved ?? input.initialDeposit,
    oneYearInvestedBalance: oneYearPoint?.investedBalance ?? input.initialDeposit,
    installmentTotalCost24Mo,
    installmentInterestSaved,
    series: displaySeries,
    takeRateComparisons,
  };
}
