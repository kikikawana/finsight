import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronDown,
  FileDown,
  Folder,
  ListChecks,
  LogIn,
  Percent,
  Plus,
  Share2,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import { GOAL_CATEGORY_LABELS } from '../data/goalPresets';
import type {
  AppView,
  GoalFolder,
  IncomeCadence,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
} from '../types/finance';
import {
  computeGoalSplitPlan,
  computeHistoricalHorizons,
  computeRemainingGoalEta,
  computeWeeklyFromPercent,
  formatDurationMonths,
  formatPeso,
  getLocalISODate,
  type CurrencyCode,
} from '../utils/financeMath';
import { GoalProgressRing } from './GoalProgressRing';
import { exportGoalProgressPdf } from '../utils/pdfReport';

interface HomeOverviewProps {
  user: User | null;
  authLoading: boolean;
  isOnline: boolean;
  scenario: ScenarioInput;
  folders: GoalFolder[];
  savedScenarios: SavedScenario[];
  activeScenarioId: string | null;
  savingsLogs: SavingsLog[];
  currency: CurrencyCode;
  earnedBadgesCount: number;
  totalBadgesCount: number;
  dailyBudgetCount: number;
  onChangeScenario: (patch: Partial<ScenarioInput>) => void;
  onSelectScenario: (saved: SavedScenario) => void;
  onQuickAddSavingsLog: (
    amount: number,
    note: string,
    weekDate: string,
    idempotencyKey: string
  ) => Promise<void>;
  onNavigate: (view: AppView) => void;
  onSignIn: () => void;
  onOpenShareModal: () => void;
}

function makeQuickLogId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `qlog_${rand}`;
}

type FaqCategory = 'all' | 'compounding' | 'goals-splits';

interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, 'all'>;
  categoryLabel: string;
  question: string;
  answer: string;
  formulaNote?: string;
  targetView: AppView;
  targetLabel: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'goal-percentages',
    category: 'goals-splits',
    categoryLabel: 'Goals & Percentage Splits',
    question: 'How do percentage splits help me save for my own goal?',
    answer:
      'Instead of guessing what is left at the end of the week, you decide up front what percentage of your pay or student allowance goes to your goal (for example 15% or 25%). Inside Goal & Split Planner, you can enter your exact target and compare take-rates side by side to see how many months each percentage takes.',
    formulaNote: 'Weekly Goal Save = Income × Save % (converted to 52 weeks/year)',
    targetView: 'goal-planner',
    targetLabel: 'Open Goal & Split Planner',
  },
  {
    id: 'student-small-pesos',
    category: 'compounding',
    categoryLabel: 'Compounding Math',
    question: 'I am a student with only ₱50 to ₱300 a week. Is this useful for me?',
    answer:
      'Yes. Switch Income Cadence to Weekly to enter your allowance or baon. Even ₱150/week adds up to ₱7,800 in a single year of pure savings, and if you keep an ongoing fund invested over 5–10 years, compounding starts doing the heavy lifting.',
    formulaNote: '₱150/wk × 52 weeks = ₱7,800/yr before any bank or market yield',
    targetView: 'projections',
    targetLabel: 'Test in Projections',
  },
  {
    id: 'goal-buckets',
    category: 'goals-splits',
    categoryLabel: 'Goals & Percentage Splits',
    question: 'Can I enter any custom goal like a vehicle, laptop, tuition, or emergency fund?',
    answer:
      'Yes. Type any goal name, enter the exact amount you want to reach, set your weekly or monthly income, and choose the percentage split that fits your life. All timelines and graphs update immediately to match your numbers.',
    formulaNote: 'Every timeline chart adapts automatically to your custom target and percentage',
    targetView: 'goal-planner',
    targetLabel: 'Open Goal & Split Planner',
  },
  {
    id: 'weekly-compounding',
    category: 'compounding',
    categoryLabel: 'Compounding Math',
    question: 'How does FinSight project 1, 5, 10, and 20-year historical returns?',
    answer:
      'Instead of assuming a flat percentage every year, FinSight replays the actual 2005–2024 calendar-year returns of the S&P 500, PSEi, or Balanced 60/40 index. Each annual return is converted into its weekly rate across all 52 weeks, including down years like 2008 and 2022.',
    formulaNote: 'Weekly Rate = (1 + Annual Return)^(1/52) - 1 · 52 contributions/year',
    targetView: 'historical-data',
    targetLabel: 'Inspect Year-by-Year Data',
  },
  {
    id: 'short-term-risk',
    category: 'goals-splits',
    categoryLabel: 'Goals & Percentage Splits',
    question: 'Should I put a 6-month goal in stocks or keep it in cash / a digital bank?',
    answer:
      'For short-term goals under 2 years (like next semester’s tuition or a commuter bike), stock markets can swing sharply in the short run. Goal Planner plots Cash (0%), Digital Bank (4% p.a.), and Balanced Index growth together so you can pick the safest bucket for your timeline.',
    formulaNote: 'Compare Cash, 4% Digital Bank, and Balanced 60/40 curves side by side',
    targetView: 'goal-planner',
    targetLabel: 'View Timeline Graph',
  },
  {
    id: 'milestones-and-privacy',
    category: 'compounding',
    categoryLabel: 'Compounding Math',
    question: 'How are savings milestones earned and stored in my account?',
    answer:
      'Milestones like "First ₱1,000 Saved" and "First Month of Consistency" (4 distinct weeks) unlock based on real deposits you log in your Savings Ledger, not slider experiments. When you sign in with Google, your goals, deposit logs, and badges stay private to your account.',
    targetView: 'milestones',
    targetLabel: 'View All 8 Badges',
  },
];

export function HomeOverview({
  user,
  authLoading,
  isOnline,
  scenario,
  folders,
  savedScenarios,
  activeScenarioId,
  savingsLogs,
  currency,
  earnedBadgesCount,
  totalBadgesCount,
  dailyBudgetCount,
  onChangeScenario,
  onSelectScenario,
  onQuickAddSavingsLog,
  onNavigate,
  onSignIn,
  onOpenShareModal,
}: HomeOverviewProps) {
  const [faqFilter, setFaqFilter] = useState<FaqCategory>('all');
  const [openFaqId, setOpenFaqId] = useState<string>('goal-percentages');

  const [quickAmount, setQuickAmount] = useState<number>(scenario.weeklySavings);
  const [quickNote, setQuickNote] = useState('');
  const [quickDate, setQuickDate] = useState(() => getLocalISODate());
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const quickMutexRef = useRef(false);
  const pendingQuickKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setQuickAmount(scenario.weeklySavings);
  }, [scenario.weeklySavings]);

  const horizons = useMemo(
    () =>
      computeHistoricalHorizons(
        scenario.weeklySavings,
        scenario.initialDeposit,
        scenario.benchmarkId,
        false
      ),
    [scenario.weeklySavings, scenario.initialDeposit, scenario.benchmarkId]
  );

  const goalPlan = useMemo(() => computeGoalSplitPlan(scenario), [scenario]);

  const handleHeroSavePercent = (nextSavePct: number) => {
    const clampedSave = Math.min(95, Math.max(1, Math.round(nextSavePct)));
    const remaining = Math.max(0, 100 - clampedSave);
    const currentNonSave = scenario.needsPercent + scenario.wantsPercent;

    let nextNeeds = scenario.needsPercent;
    let nextWants = scenario.wantsPercent;
    if (currentNonSave > 0) {
      nextNeeds = Math.min(remaining, Math.round((scenario.needsPercent / currentNonSave) * remaining));
      nextWants = Math.max(0, remaining - nextNeeds);
    } else {
      nextNeeds = Math.round(remaining * 0.65);
      nextWants = Math.max(0, remaining - nextNeeds);
    }

    const nextWeekly =
      scenario.incomeAmount > 0
        ? computeWeeklyFromPercent(scenario.incomeAmount, scenario.incomeCadence, clampedSave)
        : scenario.weeklySavings;

    onChangeScenario({
      savingsPercent: clampedSave,
      needsPercent: nextNeeds,
      wantsPercent: nextWants,
      weeklySavings: nextWeekly,
    });
  };

  const handleHeroIncome = (nextAmount: number, nextCadence: IncomeCadence) => {
    const safeIncome = Math.max(0, nextAmount);
    const nextWeekly =
      safeIncome > 0
        ? computeWeeklyFromPercent(safeIncome, nextCadence, scenario.savingsPercent)
        : scenario.weeklySavings;
    onChangeScenario({
      incomeAmount: safeIncome,
      incomeCadence: nextCadence,
      weeklySavings: nextWeekly,
    });
  };

  const totalLogged = useMemo(
    () => savingsLogs.reduce((sum, item) => sum + item.amount, 0),
    [savingsLogs]
  );
  const currentSavedForGoal = scenario.initialDeposit + totalLogged;
  const targetGoalAmount = Math.max(500, scenario.goalTargetAmount);
  const remainingEta = useMemo(
    () =>
      computeRemainingGoalEta(
        currentSavedForGoal,
        targetGoalAmount,
        scenario.weeklySavings,
        scenario.benchmarkId
      ),
    [currentSavedForGoal, targetGoalAmount, scenario.weeklySavings, scenario.benchmarkId]
  );

  const handleQuickLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onSignIn();
      return;
    }
    if (!user.emailVerified) {
      setQuickError('Please sign in with a verified Google account to log deposits.');
      return;
    }
    if (!Number.isFinite(quickAmount) || quickAmount < 1) {
      setQuickError('Enter a deposit amount of at least ₱1.');
      return;
    }
    if (!isOnline) {
      setQuickError('Connection lost. Your entry is still here; reconnect and tap Quick Log.');
      return;
    }
    if (quickMutexRef.current) return;

    quickMutexRef.current = true;
    setQuickBusy(true);
    setQuickError(null);
    setQuickFeedback(null);

    if (!pendingQuickKeyRef.current) {
      pendingQuickKeyRef.current = makeQuickLogId();
    }

    try {
      await onQuickAddSavingsLog(
        quickAmount,
        quickNote.trim() || 'Quick weekly save',
        quickDate,
        pendingQuickKeyRef.current
      );
      pendingQuickKeyRef.current = null;
      setQuickNote('');
      setQuickFeedback(`Logged +${formatPeso(quickAmount, false, currency)} toward your goal.`);
      setTimeout(() => setQuickFeedback(null), 4000);
    } catch (err) {
      setQuickError(
        err instanceof Error
          ? err.message
          : 'Could not save deposit right now. Your inputs are preserved.'
      );
    } finally {
      quickMutexRef.current = false;
      setQuickBusy(false);
    }
  };

  const filteredFaqs = useMemo(
    () =>
      faqFilter === 'all'
        ? FAQ_ITEMS
        : FAQ_ITEMS.filter((item) => item.category === faqFilter),
    [faqFilter]
  );

  const destinations: Array<{
    view: AppView;
    title: string;
    goal: string;
    metric: string;
    icon: typeof Percent;
  }> = [
    {
      view: 'goal-planner',
      title: 'Goal & Split Planner',
      goal: 'Customize your target, circle split chart essentials, and live timeline graphs.',
      metric: `Ready in ${formatDurationMonths(goalPlan.monthsToGoalInvested)} at ${scenario.savingsPercent}%`,
      icon: Percent,
    },
    {
      view: 'ledger',
      title: 'Folders & Ledger',
      goal: 'Organize multiple goals into folders, export/import goal files, and log weekly deposits.',
      metric: `${savedScenarios.length} ${savedScenarios.length === 1 ? 'file' : 'files'} · ${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`,
      icon: BookOpenCheck,
    },
    {
      view: 'everyday-budget',
      title: 'Everyday Budget',
      goal: 'Track daily spending in Goal Days, check off routines, and sweep skipped wants to your goal.',
      metric: `${dailyBudgetCount} ${dailyBudgetCount === 1 ? 'item' : 'items'} tracked`,
      icon: ListChecks,
    },
    {
      view: 'projections',
      title: 'Weekly Projections',
      goal: 'Test any weekly savings rate over 1, 5, 10, and 20 years of historical market cycles.',
      metric: `10-yr: ${formatPeso(horizons[10].endingBalance, true, currency)}`,
      icon: TrendingUp,
    },
    {
      view: 'historical-data',
      title: 'Historical Market Data',
      goal: 'Inspect actual 2005–2024 annual returns, including 2008 and 2022 dips and recoveries.',
      metric: '20 verified market years',
      icon: BarChart3,
    },
    {
      view: 'milestones',
      title: 'Milestones',
      goal: 'Track earned badges for peso thresholds, weekly consistency streaks, and goal completion.',
      metric: `${earnedBadgesCount} / ${totalBadgesCount} badges unlocked`,
      icon: Award,
    },
  ];

  const cleanGoalTitle = scenario.title.trim() || 'My Savings Goal';
  const activeBenchmark = BENCHMARK_DATASETS[scenario.benchmarkId];
  const unallocatedPct = Math.max(
    0,
    100 - (scenario.savingsPercent + scenario.needsPercent + scenario.wantsPercent)
  );

  return (
    <section className="py-8 sm:py-10 finsight-ambient-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Compact Workspace Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-stone-200/90 dark:border-slate-800/90"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              Savings &amp; Goal Overview
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Set your own target, choose the percentage to take from your income or allowance, and log weekly progress.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('goal-planner')}
              className="finsight-btn-primary px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg cursor-pointer whitespace-nowrap"
            >
              Open Goal Planner
            </button>
            <button
              type="button"
              onClick={() => onNavigate('projections')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white/95 dark:bg-slate-900 border border-stone-200 dark:border-slate-700 hover:border-emerald-600/50 dark:hover:border-emerald-500/50 hover:text-emerald-800 dark:hover:text-emerald-300 rounded-lg transition-all duration-150 active:scale-[0.985] cursor-pointer whitespace-nowrap"
            >
              1–20 Yr Projections
            </button>
          </div>
        </motion.div>

        {/* Unified 4-Column Hairline Metric Strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="finsight-surface grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-stone-200/90 dark:divide-slate-800 overflow-hidden"
        >
          <div className="px-4 py-3.5 transition-colors hover:bg-stone-50/70 dark:hover:bg-slate-800/30">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
              Active Target · {GOAL_CATEGORY_LABELS[scenario.goalCategory]}
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {formatPeso(targetGoalAmount, false, currency)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {cleanGoalTitle}
            </div>
          </div>

          <div className="px-4 py-3.5 transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Weekly Set-Aside
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
              {formatPeso(scenario.weeklySavings, false, currency)}/wk
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              {scenario.savingsPercent}% of {scenario.incomeCadence} pay
            </div>
          </div>

          <div className="px-4 py-3.5 transition-colors hover:bg-stone-50/70 dark:hover:bg-slate-800/30">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Estimated Time-to-Goal
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {formatDurationMonths(goalPlan.monthsToGoalInvested)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              Cash pace: {formatDurationMonths(goalPlan.monthsToGoalCash)}
            </div>
          </div>

          <div className="px-4 py-3.5 transition-colors hover:bg-amber-50/35 dark:hover:bg-amber-950/15">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              10-Year Compounding
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-amber-700 dark:text-amber-300 mt-0.5 tabular-nums">
              {formatPeso(horizons[10].endingBalance, true, currency)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              {earnedBadgesCount} / {totalBadgesCount} milestones unlocked
            </div>
          </div>
        </motion.div>

        {/* Main 2-Column Workspace */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
        >
          {/* Left Column (7 cols): Progress Ring & Quick Deposit Log */}
          <div className="lg:col-span-7 finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div className="p-6">
              <GoalProgressRing
                goalTitle={scenario.title}
                categoryLabel={GOAL_CATEGORY_LABELS[scenario.goalCategory]}
                currentSaved={currentSavedForGoal}
                targetAmount={targetGoalAmount}
                weeklySavings={scenario.weeklySavings}
                savingsPercent={scenario.savingsPercent}
                weeksCash={remainingEta.weeksCash}
                monthsInvested={remainingEta.monthsInvested}
                targetDateLabel={remainingEta.targetDateLabel}
                currency={currency}
                authLoading={authLoading}
                celebrationOwnerKey={user?.uid ?? 'guest'}
                onCustomize={() => onNavigate('goal-planner')}
              />
            </div>

            <div className="border-t border-stone-200/90 dark:border-slate-800 p-6 bg-stone-50/75 dark:bg-slate-950/45 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Quick Log Deposit
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Record a deposit to update your progress ring and badges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('ledger')}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
                >
                  Full Ledger →
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[50, 150, 500, scenario.weeklySavings]
                  .filter((val, idx, arr) => val > 0 && arr.indexOf(val) === idx)
                  .map((presetAmt) => {
                    const active = quickAmount === presetAmt;
                    return (
                      <button
                        key={presetAmt}
                        type="button"
                        onClick={() => setQuickAmount(presetAmt)}
                        className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md border transition-all duration-150 cursor-pointer whitespace-nowrap active:scale-95 ${
                          active
                            ? 'finsight-btn-primary text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-stone-200 dark:border-slate-700 hover:border-emerald-500/60'
                        }`}
                      >
                        ₱{presetAmt.toLocaleString()}
                      </button>
                    );
                  })}
              </div>

              <form onSubmit={handleQuickLogSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-3">
                  <label
                    htmlFor="quick-log-amount"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Amount (₱)
                  </label>
                  <input
                    id="quick-log-amount"
                    type="number"
                    min={1}
                    max={1000000}
                    value={quickAmount > 0 ? quickAmount : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setQuickAmount(raw === '' ? 0 : Number(raw));
                    }}
                    className="w-full px-3 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 transition-colors tabular-nums"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="quick-log-date"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Date
                  </label>
                  <input
                    id="quick-log-date"
                    type="date"
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 transition-colors"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="quick-log-note"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Note
                  </label>
                  <input
                    id="quick-log-note"
                    type="text"
                    maxLength={160}
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder="Saved baon / side gig"
                    className="w-full px-3 py-2 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 transition-colors"
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={quickBusy}
                    className="finsight-btn-primary w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {!user
                        ? 'Sign In to Log'
                        : quickBusy
                          ? 'Saving…'
                          : 'Quick Log'}
                    </span>
                  </button>
                </div>
              </form>

              {quickFeedback && (
                <div
                  role="status"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{quickFeedback}</span>
                </div>
              )}

              {quickError && (
                <div
                  role="alert"
                  className="inline-flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{quickError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): Obsidian Forest Goal & Split Controls */}
          <div className="lg:col-span-5 finsight-obsidian-card text-white rounded-xl flex flex-col justify-between overflow-hidden">
            <div className="p-6 space-y-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold text-white">
                  Goal &amp; Split Controls
                </h2>
                <span className="text-[11px] font-mono text-emerald-300/80">
                  Live sync
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label
                    htmlFor="hero-goal-title"
                    className="block text-xs font-medium text-emerald-100/80 mb-1"
                  >
                    What are you saving for?
                  </label>
                  <input
                    id="hero-goal-title"
                    type="text"
                    maxLength={80}
                    value={scenario.title}
                    onChange={(e) => onChangeScenario({ title: e.target.value })}
                    placeholder="e.g. Motorcycle, Tuition, Laptop..."
                    className="w-full px-3 py-2 text-sm font-medium text-white bg-white/8 border border-white/15 rounded-lg focus:outline-none focus:border-emerald-400 focus:bg-white/12 transition-colors placeholder:text-slate-400"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label
                    htmlFor="hero-goal-target"
                    className="block text-xs font-medium text-emerald-100/80 mb-1"
                  >
                    Target Amount (₱)
                  </label>
                  <input
                    id="hero-goal-target"
                    type="number"
                    min={500}
                    max={500000000}
                    step={500}
                    value={scenario.goalTargetAmount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChangeScenario({
                        goalTargetAmount: Number.isFinite(val) ? Math.max(500, val) : 500,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm font-mono font-semibold text-white bg-white/8 border border-white/15 rounded-lg focus:outline-none focus:border-emerald-400 focus:bg-white/12 transition-colors tabular-nums"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-7">
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="hero-income-input"
                      className="text-xs font-medium text-emerald-100/80"
                    >
                      Income / Allowance (₱)
                    </label>
                    <div className="inline-flex rounded-md bg-black/30 border border-white/10 p-0.5">
                      {(['weekly', 'monthly'] as IncomeCadence[]).map((cad) => (
                        <button
                          key={cad}
                          type="button"
                          onClick={() => handleHeroIncome(scenario.incomeAmount, cad)}
                          className={`px-2 py-0.5 text-[10px] font-medium rounded capitalize transition-colors cursor-pointer ${
                            scenario.incomeCadence === cad
                              ? 'bg-emerald-500 text-slate-950 font-semibold shadow-xs'
                              : 'text-emerald-100/70 hover:text-white'
                          }`}
                        >
                          {cad}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    id="hero-income-input"
                    type="number"
                    min={0}
                    max={100000000}
                    step={100}
                    value={scenario.incomeAmount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      handleHeroIncome(
                        Number.isFinite(val) ? Math.max(0, val) : 0,
                        scenario.incomeCadence
                      );
                    }}
                    className="w-full px-3 py-2 text-sm font-mono font-semibold text-white bg-white/8 border border-white/15 rounded-lg focus:outline-none focus:border-emerald-400 focus:bg-white/12 transition-colors tabular-nums"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label
                    htmlFor="hero-save-percent"
                    className="block text-xs font-medium text-emerald-300 mb-1"
                  >
                    Save % to Take
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="hero-save-percent"
                      type="number"
                      min={1}
                      max={95}
                      step={1}
                      value={scenario.savingsPercent}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) handleHeroSavePercent(val);
                      }}
                      className="w-full pl-3 pr-7 py-2 text-sm font-mono font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/35 rounded-lg focus:outline-none focus:border-emerald-300 transition-colors tabular-nums"
                    />
                    <span className="absolute right-3 text-xs font-mono text-emerald-200/70">%</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-emerald-100/75">
                    Taking {scenario.savingsPercent}% puts away:
                  </span>
                  <span className="text-lg font-display font-bold tracking-tight text-emerald-300 tabular-nums">
                    {formatPeso(scenario.weeklySavings, false, currency)}/wk
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Hero percentage to save"
                  min={1}
                  max={75}
                  step={1}
                  value={Math.min(75, scenario.savingsPercent)}
                  onChange={(e) => handleHeroSavePercent(Number(e.target.value))}
                  className="finsight-range w-full"
                />

                {/* Luminous Income Split Bar */}
                <div className="pt-1 space-y-2">
                  <div
                    className="h-3 w-full rounded-full overflow-hidden flex bg-black/35 ring-1 ring-white/10 shadow-inner"
                    role="img"
                    aria-label={`Income split: ${scenario.savingsPercent}% save, ${scenario.needsPercent}% needs, ${scenario.wantsPercent}% wants`}
                  >
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 ease-out"
                      style={{ width: `${scenario.savingsPercent}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-300 ease-out"
                      style={{ width: `${scenario.needsPercent}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 ease-out"
                      style={{ width: `${scenario.wantsPercent}%` }}
                    />
                    {unallocatedPct > 0 && (
                      <div
                        className="h-full bg-slate-500/70 transition-all duration-300 ease-out"
                        style={{ width: `${unallocatedPct}%` }}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100/80 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs bg-emerald-400" aria-hidden="true" />
                      <span>Save {scenario.savingsPercent}%</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs bg-sky-400" aria-hidden="true" />
                      <span>Needs {scenario.needsPercent}%</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-xs bg-amber-300" aria-hidden="true" />
                      <span>Wants {scenario.wantsPercent}%</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Clean Hairline Footer Projections */}
            <div className="border-t border-white/10 bg-black/25 grid grid-cols-3 divide-x divide-white/10 text-xs tabular-nums">
              <div className="px-4 py-3">
                <div className="text-emerald-100/65">1 Year</div>
                <div className="text-sm font-display font-bold text-white mt-0.5">
                  {formatPeso(horizons[1].endingBalance, true, currency)}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-emerald-100/65">5 Years</div>
                <div className="text-sm font-display font-bold text-emerald-300 mt-0.5">
                  {formatPeso(horizons[5].endingBalance, true, currency)}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-emerald-100/65">10 Years</div>
                <div className="text-sm font-display font-bold text-amber-300 mt-0.5">
                  {formatPeso(horizons[10].endingBalance, true, currency)}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Live Goal Trajectory Visual Chart */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Goal Path: {cleanGoalTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Projected growth at {formatPeso(scenario.weeklySavings, false, currency)}/wk across Cash (0%), Digital Bank (4%), and {activeBenchmark.shortName}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-emerald-600" aria-hidden="true" />
                <span>{activeBenchmark.shortName}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-sky-600" aria-hidden="true" />
                <span>Digital Bank (4%)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-slate-400" aria-hidden="true" />
                <span>Cash</span>
              </span>
              <button
                type="button"
                onClick={() => onNavigate('goal-planner')}
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
              >
                Full Split Graphs →
              </button>
            </div>
          </div>

          <div className="w-full h-[225px] min-w-0">
            <ResponsiveContainer width="100%" height={225} minWidth={0}>
              <AreaChart data={goalPlan.series} margin={{ top: 8, right: 16, left: 0, bottom: 2 }}>
                <defs>
                  <linearGradient id="overviewGoalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="65%" stopColor="#059669" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.32} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  width={60}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => formatPeso(Number(val), true, currency)}
                />
                <Tooltip
                  formatter={(val, name) => [formatPeso(Number(val), false, currency), String(name)]}
                  contentStyle={{
                    borderRadius: '10px',
                    fontSize: '12px',
                    border: '1px solid #d6d3cd',
                    boxShadow: '0 8px 20px -8px rgba(15, 23, 42, 0.16)',
                  }}
                />
                <ReferenceLine
                  y={targetGoalAmount}
                  stroke="#d97706"
                  strokeDasharray="5 4"
                  label={{
                    value: `Target ${formatPeso(targetGoalAmount, true, currency)}`,
                    position: 'insideTopRight',
                    fill: '#b45309',
                    fontSize: 11,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="investedBalance"
                  name={`${activeBenchmark.shortName} Fund`}
                  stroke="#059669"
                  strokeWidth={2.5}
                  fill="url(#overviewGoalGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="digitalBankBalance"
                  name="4% Digital Bank"
                  stroke="#0284c7"
                  strokeWidth={1.75}
                  fill="none"
                />
                <Area
                  type="monotone"
                  dataKey="cashSaved"
                  name="Cash Saved (0%)"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Quiet Single-Row Vault & Account Sync Bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            {authLoading ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Checking account session…
              </span>
            ) : user ? (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Signed in as{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {user.displayName || user.email}
                </span>
                {' · '}
                {earnedBadgesCount} milestones unlocked and synced.
              </div>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Organize multiple goals in local folders or sign in with Google to sync across
                devices.
              </div>
            )}

            {savedScenarios.length > 0 && (
              <div className="inline-flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <label htmlFor="overview-quick-file-select" className="sr-only">
                  Switch saved goal file
                </label>
                <select
                  id="overview-quick-file-select"
                  value={activeScenarioId ?? ''}
                  onChange={(e) => {
                    const found = savedScenarios.find((s) => s.id === e.target.value);
                    if (found) onSelectScenario(found);
                  }}
                  className="max-w-[220px] px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  <option value="" disabled>
                    Switch saved file ({savedScenarios.length})
                  </option>
                  {savedScenarios.map((file) => {
                    const folderName = file.folderId
                      ? folders.find((f) => f.id === file.folderId)?.name
                      : undefined;
                    return (
                      <option key={file.id} value={file.id}>
                        {folderName ? `[${folderName}] ` : ''}
                        {file.title}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0 text-xs font-semibold">
            <button
              type="button"
              onClick={onOpenShareModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Share Progress Link</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportGoalProgressPdf({
                  scenario,
                  activeScenarioId,
                  folders,
                  savingsLogs,
                  currency,
                  ownerLabel:
                    user && user.emailVerified
                      ? user.displayName || user.email || 'Cloud Account'
                      : 'Local Browser Vault',
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:border-emerald-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span>Export Progress PDF</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ledger')}
              className="text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
            >
              {savedScenarios.length > 0 ? 'Open Folders & Files →' : 'Save to Folder →'}
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => onNavigate('milestones')}
                className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
              >
                View Milestones
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="finsight-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign In with Google</span>
              </button>
            )}
          </div>
        </motion.div>

        {/* Clean Hairline Workspace Directory */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Workspace Tools
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Jump to any calculator or ledger
            </span>
          </div>

          <div className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-x divide-stone-200/90 dark:divide-slate-800 overflow-hidden">
            {destinations.map((dest) => {
              const Icon = dest.icon;
              return (
                <button
                  key={dest.view}
                  type="button"
                  onClick={() => onNavigate(dest.view)}
                  className="group text-left p-5 flex flex-col justify-between hover:bg-emerald-50/45 dark:hover:bg-emerald-950/20 transition-all duration-200 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-slate-800 border border-stone-200/90 dark:border-slate-700 flex items-center justify-center text-emerald-700 dark:text-emerald-400 transition-all duration-200 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:scale-105">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <ArrowRight
                        className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-transform duration-200 group-hover:translate-x-1 shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-800 dark:group-hover:text-emerald-300 transition-colors">
                      {dest.title}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {dest.goal}
                    </p>
                  </div>
                  <div className="mt-3 text-[11px] font-mono text-emerald-700/90 dark:text-emerald-400/90 tabular-nums truncate">
                    {dest.metric}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Clean Hairline FAQ & Methodology */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-balance">
              How goal splits and compounding work
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Answers on custom goal targets, percentage splits, timeline graphs, and historical compounding.
            </p>

            <div
              role="group"
              aria-label="Filter FAQ topics"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg"
            >
              {(
                [
                  { id: 'all', label: 'All Topics' },
                  { id: 'goals-splits', label: 'Goals & Splits' },
                  { id: 'compounding', label: 'Compounding Math' },
                ] as Array<{ id: FaqCategory; label: string }>
              ).map((tab) => {
                const active = faqFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setFaqFilter(tab.id);
                      const first =
                        tab.id === 'all'
                          ? FAQ_ITEMS[0]
                          : FAQ_ITEMS.find((f) => f.category === tab.id);
                      if (first) setOpenFaqId(first.id);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-8 divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
            {filteredFaqs.map((item) => {
              const isOpen = openFaqId === item.id;
              return (
                <div
                  key={item.id}
                  className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqId(isOpen ? '' : item.id)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
                        {item.categoryLabel}
                      </span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                        {item.question}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-emerald-700 dark:text-emerald-400' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 pt-1 space-y-3">
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.answer}
                          </p>
                          {item.formulaNote && (
                            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300">
                              {item.formulaNote}
                            </div>
                          )}
                          <div>
                            <button
                              type="button"
                              onClick={() => onNavigate(item.targetView)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4 cursor-pointer"
                            >
                              <span>{item.targetLabel}</span>
                              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
