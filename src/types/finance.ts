export type BenchmarkId = 'sp500' | 'psei' | 'global60_40';

export type GoalCategory =
  | 'motorcycle'
  | 'student'
  | 'emergency'
  | 'gadget'
  | 'business'
  | 'travel'
  | 'custom';

export type IncomeCadence = 'weekly' | 'monthly';

export type FolderColor = 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';

export interface GoalFolder {
  id: string;
  userId: string;
  name: string;
  color: FolderColor;
  createdAt?: unknown;
  updatedAt?: unknown;
}

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
  goalCategory: GoalCategory;
  goalTargetAmount: number;
  incomeAmount: number;
  incomeCadence: IncomeCadence;
  savingsPercent: number;
  needsPercent: number;
  wantsPercent: number;
  weeklySavings: number;
  initialDeposit: number;
  benchmarkId: BenchmarkId;
  folderId?: string;
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
  years: 1 | 5 | 10 | 20;
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

export interface GoalTimelinePoint {
  monthIndex: number;
  label: string;
  cashSaved: number;
  digitalBankBalance: number;
  investedBalance: number;
  targetGoal: number;
}

export interface TakeRateComparisonPoint {
  percent: number;
  label: string;
  weeklyAmount: number;
  monthlyAmount: number;
  monthsToGoalCash: number | null;
  monthsToGoalInvested: number | null;
  isCurrent: boolean;
}

export interface GoalSplitPlanSummary {
  weeklyIncome: number;
  monthlyIncome: number;
  weeklyFromSplit: number;
  monthlyFromSplit: number;
  monthlyNeedsAmount: number;
  monthlyWantsAmount: number;
  monthlyUnallocatedAmount: number;
  remainingToGoal: number;
  monthsToGoalCash: number | null;
  monthsToGoalDigitalBank: number | null;
  monthsToGoalInvested: number | null;
  weeksToGoalCash: number | null;
  weeksToGoalInvested: number | null;
  oneYearCashBalance: number;
  oneYearInvestedBalance: number;
  installmentTotalCost24Mo: number;
  installmentInterestSaved: number;
  series: GoalTimelinePoint[];
  takeRateComparisons: TakeRateComparisonPoint[];
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

export type MilestoneCategory = 'Amount' | 'Consistency' | 'Goal';

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

export type CurrencyCode = 'PHP' | 'USD' | 'SGD';

export interface SharedProgressReportInput {
  authorName: string;
  goalTitle: string;
  goalCategory: GoalCategory;
  goalTargetAmount: number;
  currentSaved: number;
  weeklySavings: number;
  savingsPercent: number;
  currency: CurrencyCode;
  benchmarkId: BenchmarkId;
  earnedBadgesCount: number;
  totalBadgesCount: number;
  unlockedMilestoneIds: MilestoneId[];
  depositsCount: number;
  showExactAmounts: boolean;
}

export interface SharedProgressReport extends SharedProgressReportInput {
  id: string;
  userId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type BudgetBucket = 'needs' | 'wants';

export type BudgetCategory =
  | 'food'
  | 'commute'
  | 'bills'
  | 'groceries'
  | 'coffee'
  | 'personal'
  | 'other';

export type BudgetEntryStatus = 'planned' | 'spent' | 'swept';

export interface BudgetEntryInput {
  title: string;
  amount: number;
  bucket: BudgetBucket;
  category: BudgetCategory;
  status: BudgetEntryStatus;
  entryDate: string;
  isEssentialRoutine: boolean;
  scenarioId?: string;
}

export interface BudgetEntry extends BudgetEntryInput {
  id: string;
  userId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AppView =
  | 'overview'
  | 'everyday-budget'
  | 'goal-planner'
  | 'projections'
  | 'historical-data'
  | 'milestones'
  | 'news'
  | 'ledger';
