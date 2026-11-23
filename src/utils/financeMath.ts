import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import type {
  BenchmarkId,
  HistoricalYearReturn,
  HorizonSummary,
  RentVsEquitySummary,
  RentVsEquityYearPoint,
  ScenarioInput,
  YearlyProjectionPoint,
} from '../types/finance';

export const DEFAULT_SCENARIO: ScenarioInput = {
  title: 'Starter Condo Down Payment Plan',
  weeklySavings: 250,
  initialDeposit: 0,
  benchmarkId: 'sp500',
  monthlyRent: 12000,
  targetHomePrice: 2400000,
  downPaymentPercent: 20,
  mortgageRate: 6.5,
  rentGrowthRate: 3.0,
};

const ANNUAL_INFLATION_RATE = 0.035; // 3.5% CPI baseline for optional real-value view
const HOME_APPRECIATION_RATE = 0.035; // Conservative 3.5%/yr property appreciation
const MORTGAGE_TERM_YEARS = 20;

export type CurrencyCode = 'PHP' | 'USD' | 'SGD';

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
): Record<5 | 10 | 20, HorizonSummary> {
  const dataset = BENCHMARK_DATASETS[benchmarkId];
  const allReturns = dataset.annualReturns; // 20 years: 2005–2024

  const buildHorizon = (years: 5 | 10 | 20): HorizonSummary => {
    const slice = allReturns.slice(allReturns.length - years);
    const sim = simulateHistoricalWindow(weeklySavings, initialDeposit, slice, adjustForInflation);

    // Compute rolling best & worst historical windows across the 20-yr dataset
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
      windowLabel: `${slice[0].year}–${slice[slice.length - 1].year}`,
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
    5: buildHorizon(5),
    10: buildHorizon(10),
    20: buildHorizon(20),
  };
}

/**
 * Standard fixed-rate monthly mortgage principal & interest payment.
 */
export function calculateMonthlyMortgagePI(
  principal: number,
  annualRatePct: number,
  termYears = MORTGAGE_TERM_YEARS
): number {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

/**
 * Models how saving weekly for a down payment lets a renter convert future rent payments into home equity.
 * Uses the actual 20-year historical return sequence (2005–2024) for the investment accumulation phase.
 */
export function computeRentVsEquity(input: ScenarioInput): RentVsEquitySummary {
  const dataset = BENCHMARK_DATASETS[input.benchmarkId];
  const allReturns = dataset.annualReturns; // 20 years

  const requiredDownPayment = (input.targetHomePrice * input.downPaymentPercent) / 100;
  const loanPrincipal = Math.max(0, input.targetHomePrice - requiredDownPayment);
  const monthlyMortgagePI = calculateMonthlyMortgagePI(
    loanPrincipal,
    input.mortgageRate,
    MORTGAGE_TERM_YEARS
  );

  const rentToMortgageCoveragePct =
    monthlyMortgagePI > 0 ? (input.monthlyRent / monthlyMortgagePI) * 100 : 100;
  const monthlyGapAfterRent = monthlyMortgagePI - input.monthlyRent;

  // Monthly simulation over 20 years (240 months)
  const monthlyWeeklyContribution = (input.weeklySavings * 52) / 12;
  const monthlyRentGrowth = Math.pow(1 + input.rentGrowthRate / 100, 1 / 12) - 1;
  const monthlyHomeAppreciation = Math.pow(1 + HOME_APPRECIATION_RATE, 1 / 12) - 1;
  const monthlyMortgageRate = input.mortgageRate / 100 / 12;

  let keepRentingPortfolio = input.initialDeposit;
  let ownershipSavingsPortfolio = input.initialDeposit;
  let cumulativeRentPaid = 0;
  let currentMonthlyRent = input.monthlyRent;

  let hasPurchased = input.initialDeposit >= requiredDownPayment;
  let monthsToDownPayment: number | null = hasPurchased ? 0 : null;
  let rentPaidWhileSaving = 0;

  let currentHomeValue = input.targetHomePrice;
  let remainingMortgage = hasPurchased ? loanPrincipal : 0;
  let leftoverPortfolioAfterPurchase = hasPurchased
    ? Math.max(0, input.initialDeposit - requiredDownPayment)
    : 0;

  const series: RentVsEquityYearPoint[] = [
    {
      yearIndex: 0,
      cumulativeRentPaid: 0,
      annualRentAtYear: input.monthlyRent * 12,
      keepRentingInvestment: input.initialDeposit,
      ownershipDownPaymentPortfolio: input.initialDeposit,
      homeValue: hasPurchased ? input.targetHomePrice : 0,
      mortgageBalance: hasPurchased ? loanPrincipal : 0,
      netHomeEquity: hasPurchased
        ? requiredDownPayment + leftoverPortfolioAfterPurchase
        : input.initialDeposit,
      hasPurchased,
    },
  ];

  let crossoverYear: number | null = hasPurchased ? 0 : null;

  for (let m = 1; m <= 240; m++) {
    const yearIdx = Math.floor((m - 1) / 12);
    const annualPct = allReturns[yearIdx]?.annualReturnPct ?? 8;
    const monthlyMarketRate = Math.pow(1 + annualPct / 100, 1 / 12) - 1;

    // Path A: Keep Renting forever + investing weekly savings
    cumulativeRentPaid += currentMonthlyRent;
    keepRentingPortfolio =
      (keepRentingPortfolio + monthlyWeeklyContribution) * (1 + monthlyMarketRate);

    // Path B: Save toward down payment -> buy -> convert rent stream into mortgage + equity
    if (!hasPurchased) {
      rentPaidWhileSaving += currentMonthlyRent;
      ownershipSavingsPortfolio =
        (ownershipSavingsPortfolio + monthlyWeeklyContribution) * (1 + monthlyMarketRate);

      // Home price appreciates gently while waiting
      currentHomeValue = currentHomeValue * (1 + monthlyHomeAppreciation);
      const targetDPAtCurrentMonth =
        (currentHomeValue * input.downPaymentPercent) / 100;

      if (ownershipSavingsPortfolio >= targetDPAtCurrentMonth) {
        hasPurchased = true;
        monthsToDownPayment = m;
        remainingMortgage = currentHomeValue - targetDPAtCurrentMonth;
        leftoverPortfolioAfterPurchase = Math.max(
          0,
          ownershipSavingsPortfolio - targetDPAtCurrentMonth
        );
      }
    } else {
      // Property appreciates & mortgage amortizes using redirected rent + weekly savings if needed
      currentHomeValue = currentHomeValue * (1 + monthlyHomeAppreciation);
      const interestCharge = remainingMortgage * monthlyMortgageRate;
      const lockedMonthlyPI = calculateMonthlyMortgagePI(
        (input.targetHomePrice *
          Math.pow(1 + HOME_APPRECIATION_RATE, (monthsToDownPayment ?? 0) / 12) *
          (1 - input.downPaymentPercent / 100)),
        input.mortgageRate,
        MORTGAGE_TERM_YEARS
      );
      const principalPaid = Math.min(
        remainingMortgage,
        Math.max(0, lockedMonthlyPI - interestCharge)
      );
      remainingMortgage = Math.max(0, remainingMortgage - principalPaid);

      // Weekly savings continue compounding alongside the home equity!
      leftoverPortfolioAfterPurchase =
        (leftoverPortfolioAfterPurchase + monthlyWeeklyContribution) * (1 + monthlyMarketRate);
    }

    currentMonthlyRent = currentMonthlyRent * (1 + monthlyRentGrowth);

    if (m % 12 === 0) {
      const y = m / 12;
      const homeEquityOnly = hasPurchased ? Math.max(0, currentHomeValue - remainingMortgage) : 0;
      const netHomeEquity = hasPurchased
        ? homeEquityOnly + leftoverPortfolioAfterPurchase
        : ownershipSavingsPortfolio;

      if (crossoverYear === null && hasPurchased && homeEquityOnly >= cumulativeRentPaid) {
        crossoverYear = y;
      }

      series.push({
        yearIndex: y,
        cumulativeRentPaid,
        annualRentAtYear: currentMonthlyRent * 12,
        keepRentingInvestment: keepRentingPortfolio,
        ownershipDownPaymentPortfolio: hasPurchased
          ? leftoverPortfolioAfterPurchase
          : ownershipSavingsPortfolio,
        homeValue: hasPurchased ? currentHomeValue : 0,
        mortgageBalance: remainingMortgage,
        netHomeEquity,
        hasPurchased,
      });
    }
  }

  return {
    requiredDownPayment,
    monthsToDownPayment,
    yearsToDownPayment:
      monthsToDownPayment !== null ? Number((monthsToDownPayment / 12).toFixed(1)) : null,
    rentPaidWhileSaving,
    loanPrincipal,
    monthlyMortgagePI,
    rentToMortgageCoveragePct,
    monthlyGapAfterRent,
    crossoverYear,
    series,
    at5Years: series[5],
    at10Years: series[10],
    at20Years: series[20],
  };
}
