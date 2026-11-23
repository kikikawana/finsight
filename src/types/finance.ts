export type BenchmarkId = 'sp500' | 'psei' | 'global60_40';

export interface HistoricalYearReturn {
  year: number;
  annualReturnPct: number;
  eventNote?: string;
}

export interface BenchmarkDataset {
  id: BenchmarkId;
  name: string;
  shortName: string;
  tickerLabel: string;
  description: string;
  dataSource: string;
  annualReturns: HistoricalYearReturn[];
}

export interface ScenarioInput {
  title: string;
  weeklySavings: number;
  initialDeposit: number;
  benchmarkId: BenchmarkId;
  monthlyRent: number;
  targetHomePrice: number;
  downPaymentPercent: number;
  mortgageRate: number;
  rentGrowthRate: number;
}

export interface SavedScenario extends ScenarioInput {
  id: string;
  userId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavingsLog {
  id: string;
  userId: string;
  scenarioId: string;
  amount: number;
  note: string;
  weekDate: string;
  createdAt?: unknown;
}

export interface YearlyProjectionPoint {
  yearIndex: number; // 0 to 20
  calendarYear: number;
  annualReturnPct: number;
  totalContributed: number;
  portfolioValue: number;
  marketGain: number;
  eventNote?: string;
}

export interface HorizonSummary {
  years: 5 | 10 | 20;
  windowLabel: string;
  totalContributed: number;
  endingBalance: number;
  totalGrowth: number;
  growthSharePct: number;
  realizedCagrPct: number;
  yearlySeries: YearlyProjectionPoint[];
  rollingBestEnding: number;
  rollingWorstEnding: number;
}

export interface RentVsEquityYearPoint {
  yearIndex: number; // 0 to 20
  cumulativeRentPaid: number;
  annualRentAtYear: number;
  keepRentingInvestment: number;
  ownershipDownPaymentPortfolio: number;
  homeValue: number;
  mortgageBalance: number;
  netHomeEquity: number;
  hasPurchased: boolean;
}

export interface RentVsEquitySummary {
  requiredDownPayment: number;
  monthsToDownPayment: number | null;
  yearsToDownPayment: number | null;
  rentPaidWhileSaving: number;
  loanPrincipal: number;
  monthlyMortgagePI: number;
  rentToMortgageCoveragePct: number;
  monthlyGapAfterRent: number;
  crossoverYear: number | null;
  series: RentVsEquityYearPoint[];
  at5Years: RentVsEquityYearPoint;
  at10Years: RentVsEquityYearPoint;
  at20Years: RentVsEquityYearPoint;
}

export type MilestoneId =
  | 'first_deposit'
  | 'first_1000_php'
  | 'first_month_consistency'
  | 'first_10000_php'
  | 'quarter_year_habit'
  | 'down_payment_25'
  | 'down_payment_50'
  | 'down_payment_100';

export type MilestoneCategory = 'Amount' | 'Consistency' | 'Housing';

export interface MilestoneDefinition {
  id: MilestoneId;
  title: string;
  description: string;
  category: MilestoneCategory;
  targetLabel: string;
}

export interface MilestoneAward {
  id: string;
  userId: string;
  milestoneId: MilestoneId;
  title: string;
  achievedValue: number;
  unlockedDate: string;
  createdAt?: unknown;
}

export interface MilestoneProgress {
  definition: MilestoneDefinition;
  unlocked: boolean;
  unlockedDate?: string;
  currentValue: number;
  targetValue: number;
  progressPct: number;
  progressText: string;
}

export type NewsRegion = 'local' | 'international';

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  link: string;
  region: NewsRegion;
  topic: string;
}

export interface NewsFeedResponse {
  editionDate?: string;
  updatedAt: string;
  local: NewsArticle[];
  international: NewsArticle[];
  partialError?: string;
}

export type AppView =
  | 'overview'
  | 'projections'
  | 'rent-equity'
  | 'historical-data'
  | 'milestones'
  | 'news'
  | 'ledger';
