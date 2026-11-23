import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronDown,
  Compass,
  HelpCircle,
  Home,
  LogIn,
  Newspaper,
  Plus,
  ShieldCheck,
  Target,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import type { AppView, SavingsLog, ScenarioInput } from '../types/finance';
import {
  computeHistoricalHorizons,
  computeRentVsEquity,
  formatPeso,
  getLocalISODate,
  type CurrencyCode,
} from '../utils/financeMath';

interface HomeOverviewProps {
  user: User | null;
  authLoading: boolean;
  isOnline: boolean;
  scenario: ScenarioInput;
  savingsLogs: SavingsLog[];
  currency: CurrencyCode;
  earnedBadgesCount: number;
  totalBadgesCount: number;
  onChangeScenario: (patch: Partial<ScenarioInput>) => void;
  onQuickAddSavingsLog: (
    amount: number,
    note: string,
    weekDate: string,
    idempotencyKey: string
  ) => Promise<void>;
  onNavigate: (view: AppView) => void;
  onSignIn: () => void;
}

function makeQuickLogId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `qlog_${rand}`;
}

let celebratedGoalOwner: string | null = null;
const CONFETTI_COLORS = ['#10b981', '#14b8a6', '#34d399', '#f59e0b', '#fbbf24'];

type FaqCategory = 'all' | 'compounding' | 'rent-equity';

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
    id: 'weekly-compounding',
    category: 'compounding',
    categoryLabel: 'Compounding Math',
    question: 'How does weekly compounding work with actual historical stock returns?',
    answer:
      'Instead of assuming a flat, unrealistic percentage every year, FinSight replays the exact 2005–2024 calendar-year returns of the S&P 500, PSEi, or Balanced 60/40 index. Each annual return is converted into its geometric weekly rate and applied to your growing balance across all 52 weeks of that year—including crash years like 2008 and 2022.',
    formulaNote: 'Weekly Rate = (1 + Annual Return)^(1/52) - 1 · 52 contributions/year',
    targetView: 'projections',
    targetLabel: 'Test in Projections',
  },
  {
    id: 'small-pesos',
    category: 'compounding',
    categoryLabel: 'Compounding Math',
    question: 'Can setting aside only ₱50 or ₱150 a week really make a meaningful difference?',
    answer:
      'Yes, because time and weekly consistency matter more than starting big. At ₱150/week, you only deposit ₱7,800 per year out of pocket—yet over 20 years of historical index compounding, market growth typically accounts for more than two-thirds of your final balance. Lower-entry weeks during downturns also accumulate more index units before recoveries.',
    formulaNote: '5-yr (2020–24) · 10-yr (2015–24) · 20-yr (2005–24) rolling windows',
    targetView: 'historical-data',
    targetLabel: 'Inspect Year-by-Year Data',
  },
  {
    id: 'rent-to-equity-model',
    category: 'rent-equity',
    categoryLabel: 'Rent-to-Equity',
    question: 'How does FinSight calculate when my rent turns into home equity?',
    answer:
      'The model runs in two phases. First, your weekly index savings compound toward your target down payment (for example, 20% of the home price) while tracking the rent you pay along the way. Once your portfolio hits the down payment threshold, the model unlocks the home purchase, locks in a 20-year fixed-rate mortgage payment, and compares that amortizing equity against continuing to pay escalating rent with 0% ownership.',
    formulaNote: 'Monthly P&I = P × [r(1+r)^n] / [(1+r)^n - 1] · 240 monthly payments',
    targetView: 'rent-equity',
    targetLabel: 'Open Rent vs. Equity',
  },
  {
    id: 'market-drop-risk',
    category: 'rent-equity',
    categoryLabel: 'Rent-to-Equity',
    question: 'What if the stock market drops right before I need my down payment?',
    answer:
      'Equities can swing sharply over short 1–3 year windows (such as -37% in 2008 or -18.1% in 2022). That is why FinSight shows both the 5-year and 10-year rolling best/worst historical outcomes and lets you switch to the Balanced 60/40 Index Portfolio, which cushions drawdowns with 40% investment-grade bonds as you approach your purchase year.',
    formulaNote: 'Switch between S&P 500, PSEi (PHP), and Balanced 60/40 anytime',
    targetView: 'projections',
    targetLabel: 'Compare Index Risk',
  },
  {
    id: 'inflation-and-fx',
    category: 'compounding',
    categoryLabel: 'Compounding Math',
    question: 'Does the projection account for inflation and currency conversion?',
    answer:
      'Yes. Inside Projections you can toggle Inflation-Adjusted (Real Value), which deducts a 3.5%/year CPI baseline so balances reflect today’s purchasing power. You can also switch your Display Currency between PHP (₱), USD ($), and SGD (S$) while keeping your underlying saved ledger safely anchored in Philippine Pesos.',
    formulaNote: 'Real Annual Rate = (1 + Nominal Rate) / (1 + 0.035) - 1',
    targetView: 'projections',
    targetLabel: 'Toggle Real Value',
  },
  {
    id: 'milestones-and-privacy',
    category: 'rent-equity',
    categoryLabel: 'Rent-to-Equity',
    question: 'How are savings milestones earned and stored in my account?',
    answer:
      'Milestones like "First 1,000 Pesos Saved" and "First Month of Consistency" (4 distinct calendar weeks) are awarded based on actual weekly deposits you log in your Savings Ledger—not just slider experiments. When you sign in with Google, your plans, deposit logs, and unlocked badges are stored privately under your account.',
    targetView: 'milestones',
    targetLabel: 'View All 8 Badges',
  },
];

export function HomeOverview({
  user,
  authLoading,
  isOnline,
  scenario,
  savingsLogs,
  currency,
  earnedBadgesCount,
  totalBadgesCount,
  onChangeScenario,
  onQuickAddSavingsLog,
  onNavigate,
  onSignIn,
}: HomeOverviewProps) {
  const [faqFilter, setFaqFilter] = useState<FaqCategory>('all');
  const [openFaqId, setOpenFaqId] = useState<string>('weekly-compounding');

  const [quickAmount, setQuickAmount] = useState<number>(scenario.weeklySavings);
  const [quickNote, setQuickNote] = useState('');
  const [quickDate, setQuickDate] = useState(() => getLocalISODate());
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const quickMutexRef = useRef(false);
  const pendingQuickKeyRef = useRef<string | null>(null);
  const goalRingRef = useRef<HTMLDivElement | null>(null);

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

  const rentModel = useMemo(() => computeRentVsEquity(scenario), [scenario]);

  const totalLogged = useMemo(
    () => savingsLogs.reduce((sum, item) => sum + item.amount, 0),
    [savingsLogs]
  );
  const currentSavedForGoal = scenario.initialDeposit + totalLogged;
  const requiredDownPayment = rentModel.requiredDownPayment;
  const goalProgressPct = Math.min(
    100,
    requiredDownPayment > 0 ? (currentSavedForGoal / requiredDownPayment) * 100 : 0
  );
  const remainingForGoal = Math.max(0, requiredDownPayment - currentSavedForGoal);
  const isGoalReached = requiredDownPayment > 0 && goalProgressPct >= 100;

  const ringRadius = 64;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringStrokeOffset = ringCircumference * (1 - goalProgressPct / 100);

  useEffect(() => {
    if (authLoading) return;

    const ownerKey = user?.uid ?? 'guest';
    if (!isGoalReached) {
      if (celebratedGoalOwner === ownerKey) {
        celebratedGoalOwner = null;
      }
      return;
    }

    if (celebratedGoalOwner === ownerKey) return;
    celebratedGoalOwner = ownerKey;

    if (
      typeof window === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const rect = goalRingRef.current?.getBoundingClientRect();
    const origin =
      rect && rect.width > 0 && rect.height > 0
        ? {
            x: Math.min(0.95, Math.max(0.05, (rect.left + rect.width / 2) / window.innerWidth)),
            y: Math.min(0.9, Math.max(0.1, (rect.top + rect.height / 2) / window.innerHeight)),
          }
        : { x: 0.35, y: 0.55 };

    try {
      void confetti({
        particleCount: 70,
        spread: 72,
        startVelocity: 34,
        scalar: 0.95,
        colors: CONFETTI_COLORS,
        origin,
        disableForReducedMotion: true,
      });
    } catch {
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        void confetti({
          particleCount: 45,
          angle: 60,
          spread: 55,
          startVelocity: 30,
          scalar: 0.9,
          colors: CONFETTI_COLORS,
          origin,
          disableForReducedMotion: true,
        });
        void confetti({
          particleCount: 45,
          angle: 120,
          spread: 55,
          startVelocity: 30,
          scalar: 0.9,
          colors: CONFETTI_COLORS,
          origin,
          disableForReducedMotion: true,
        });
      } catch {
        // ignore headless canvas errors
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [authLoading, isGoalReached, user?.uid]);

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
      setQuickError('Connection lost—your entry is preserved. Reconnect and tap Quick Log.');
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
    icon: typeof TrendingUp;
    accentClass: string;
    topStripeClass: string;
  }> = [
    {
      view: 'projections',
      title: 'Projections',
      goal: 'Test any weekly peso amount over 5, 10, and 20 years of market history.',
      metric: `20-yr projection: ${formatPeso(horizons[20].endingBalance, true, currency)}`,
      icon: TrendingUp,
      accentClass:
        'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800',
      topStripeClass: 'from-emerald-500 to-teal-400',
    },
    {
      view: 'rent-equity',
      title: 'Rent vs. Equity',
      goal: 'See how weekly savings bridge your down payment so rent turns into equity.',
      metric:
        rentModel.yearsToDownPayment !== null
          ? `Down payment in ${rentModel.yearsToDownPayment} yrs`
          : `Target: ${formatPeso(rentModel.requiredDownPayment, true, currency)}`,
      icon: Home,
      accentClass:
        'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800',
      topStripeClass: 'from-amber-500 to-orange-400',
    },
    {
      view: 'historical-data',
      title: 'Historical Data',
      goal: 'Inspect actual 2005–2024 annual returns, including 2008 and 2022 dips.',
      metric: '20 verified market years',
      icon: BarChart3,
      accentClass:
        'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 border-sky-200 dark:border-sky-800',
      topStripeClass: 'from-sky-500 to-cyan-400',
    },
    {
      view: 'milestones',
      title: 'Milestones',
      goal: 'Earn visual badges for peso thresholds, consistency weeks, and housing goals.',
      metric: `${earnedBadgesCount} / ${totalBadgesCount} badges earned`,
      icon: Award,
      accentClass:
        'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/70 border-violet-200 dark:border-violet-800',
      topStripeClass: 'from-violet-500 to-amber-400',
    },
    {
      view: 'news',
      title: 'Market News',
      goal: 'Follow recent local Philippine and international macro, housing, and index news.',
      metric: 'PH & Global live feed',
      icon: Newspaper,
      accentClass:
        'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800',
      topStripeClass: 'from-rose-500 to-amber-400',
    },
    {
      view: 'ledger',
      title: 'Savings Ledger',
      goal: 'Save plans to your cloud account and log every weekly peso check-in.',
      metric: user ? 'Cloud sync active' : 'Sign in to save plans',
      icon: BookOpenCheck,
      accentClass:
        'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/70 border-teal-200 dark:border-teal-800',
      topStripeClass: 'from-teal-500 to-emerald-400',
    },
  ];

  return (
    <section className="relative overflow-hidden py-12 sm:py-16 finsight-ambient-bg">
      {/* Gentle drifting ambient color orbs & architectural geometric rings */}
      <div
        aria-hidden="true"
        className="finsight-orb pointer-events-none absolute -top-24 -left-20 w-[440px] h-[440px] rounded-full bg-emerald-400/20 dark:bg-emerald-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="finsight-orb-alt pointer-events-none absolute top-20 -right-24 w-[460px] h-[460px] rounded-full bg-amber-400/20 dark:bg-amber-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="finsight-orb pointer-events-none absolute bottom-10 left-1/3 w-[360px] h-[360px] rounded-full bg-sky-400/15 dark:bg-sky-500/15 blur-3xl"
      />
      <svg
        viewBox="0 0 600 600"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-[520px] h-[520px] text-emerald-900/[0.06] dark:text-emerald-400/[0.08]"
      >
        <circle cx="300" cy="300" r="240" stroke="currentColor" strokeWidth="1" />
        <circle
          cx="300"
          cy="300"
          r="180"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="6 6"
        />
        <circle cx="300" cy="300" r="120" stroke="currentColor" strokeWidth="1" />
      </svg>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        {/* Hero Split: Introduction + Sign In/Log In + Live Interactive Simulator Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 flex flex-col justify-between space-y-8"
          >
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide mb-3">
                <Compass className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Private Wealth Clarity · Built for Everyday Savers</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 text-balance leading-[1.12]">
                Small weekly pesos,{' '}
                <span className="italic text-emerald-700 dark:text-emerald-400 font-medium">
                  compounded
                </span>{' '}
                into a home of your own.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 mt-5 leading-relaxed max-w-2xl">
                Meaningful wealth rarely starts with a windfall—it grows from steady, modest
                weekly habits. FinSight reveals what setting aside even a few pesos each week
                builds across 5, 10, and 20 years of actual index history, and shows the exact
                moment your savings unlock a down payment so monthly rent becomes your own equity.
              </p>

              {/* Primary Workspace Controls */}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('projections')}
                  className="group inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 rounded-lg shadow-sm hover:shadow transition-all duration-200 cursor-pointer whitespace-nowrap"
                >
                  <span>Explore Projections</span>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('rent-equity')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 hover:border-emerald-600 dark:hover:border-emerald-500 rounded-lg shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer whitespace-nowrap"
                >
                  <span>Rent vs. Equity Model</span>
                </button>
              </div>
            </div>

            {/* Integrated Sign In / Log In Introduction Card */}
            <div className="finsight-card-interactive bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
              {authLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Checking your account session…
                </p>
              ) : user ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                      <ShieldCheck
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Welcome back, {user.displayName || user.email?.split('@')[0]}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Your scenarios, weekly deposits, and {earnedBadgesCount} earned
                        milestones are synced privately to your account.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onNavigate('ledger')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Open My Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('milestones')}
                      className="px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      View Badges
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Sign in or log in to save your plans &amp; earn milestones
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Access your private savings ledger across devices using your Google account.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Log In</span>
                    </button>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Sign In with Google</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Right Column: Live Interactive Micro-Savings Playground Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 finsight-card-interactive relative overflow-hidden bg-slate-900 dark:bg-slate-900/95 text-white border border-slate-800 dark:border-emerald-900/60 rounded-2xl p-6 sm:p-7 flex flex-col justify-between"
          >
            <div
              aria-hidden="true"
              className="finsight-orb pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-emerald-500/25 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="finsight-orb-alt pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-amber-500/20 blur-2xl"
            />

            <div className="relative space-y-5">
              <div>
                <div className="text-xs font-semibold text-emerald-400 tracking-wide">
                  Interactive Quick Preview
                </div>
                <h2 className="text-2xl font-semibold text-white mt-1">
                  Try sliding your weekly pesos live.
                </h2>
              </div>

              {/* Interactive Weekly Slider right in Hero */}
              <div className="bg-slate-800/75 border border-slate-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-300">Weekly Contribution</span>
                  <span className="text-xl font-mono font-bold text-emerald-400 tabular-nums">
                    {formatPeso(scenario.weeklySavings, false, currency)}/wk
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Hero weekly savings simulator"
                  min={20}
                  max={2500}
                  step={10}
                  value={Math.min(2500, scenario.weeklySavings)}
                  onChange={(e) =>
                    onChangeScenario({ weeklySavings: Number(e.target.value) })
                  }
                  className="finsight-range w-full"
                />
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[50, 150, 500, 1500].map((amt) => {
                    const active = scenario.weeklySavings === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => onChangeScenario({ weeklySavings: amt })}
                        className={`py-1.5 text-[11px] font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-900/70 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ₱{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live 5 / 10 / 20 Year Results */}
              <div className="grid grid-cols-3 gap-2.5 text-xs tabular-nums">
                <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-3">
                  <div className="text-slate-400">5 Years</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-sky-300 mt-1">
                    {formatPeso(horizons[5].endingBalance, true, currency)}
                  </div>
                </div>
                <div className="bg-slate-800/70 border border-slate-700/70 rounded-xl p-3">
                  <div className="text-slate-400">10 Years</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-amber-300 mt-1">
                    {formatPeso(horizons[10].endingBalance, true, currency)}
                  </div>
                </div>
                <div className="bg-emerald-950/70 border border-emerald-700/70 rounded-xl p-3">
                  <div className="text-emerald-300">20 Years</div>
                  <div className="text-sm sm:text-base font-mono font-bold text-emerald-400 mt-1">
                    {formatPeso(horizons[20].endingBalance, true, currency)}
                  </div>
                </div>
              </div>

              {/* Core 3 Goals Summary */}
              <ol className="space-y-2.5 pt-2 text-xs text-slate-300 border-t border-slate-800">
                <li className="flex items-start justify-between gap-3">
                  <span className="text-emerald-400 font-semibold shrink-0">01 · Compound</span>
                  <span className="text-right">Replays 2005–2024 index returns</span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span className="text-amber-300 font-semibold shrink-0">02 · Own Equity</span>
                  <span className="text-right tabular-nums">
                    {rentModel.yearsToDownPayment !== null
                      ? `Down payment ready in ${rentModel.yearsToDownPayment} yrs`
                      : `Target DP: ${formatPeso(rentModel.requiredDownPayment, true, currency)}`}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span className="text-sky-300 font-semibold shrink-0">03 · Milestones</span>
                  <span className="text-right tabular-nums">
                    {earnedBadgesCount} / {totalBadgesCount} badges unlocked
                  </span>
                </li>
              </ol>
            </div>
          </motion.div>
        </div>

        {/* Savings Goal Progress Ring & Quick Log Panel */}
        <div className="finsight-card-interactive relative overflow-hidden bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs">
          <span
            aria-hidden="true"
            className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400"
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Savings Goal Progress Ring */}
            <div className="lg:col-span-6 flex flex-col sm:flex-row items-center gap-6">
              <div
                ref={goalRingRef}
                className="relative w-40 h-40 shrink-0 flex items-center justify-center"
              >
                <svg
                  viewBox="0 0 160 160"
                  className="w-40 h-40 -rotate-90"
                  role="img"
                  aria-label={`Savings goal progress: ${goalProgressPct.toFixed(1)}% of target home down payment`}
                >
                  <defs>
                    <linearGradient id="finsightGoalRingGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="55%" stopColor="#14b8a6" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="80"
                    cy="80"
                    r={ringRadius}
                    fill="none"
                    strokeWidth="12"
                    className="stroke-slate-100 dark:stroke-slate-800"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={ringRadius}
                    fill="none"
                    stroke="url(#finsightGoalRingGrad)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringStrokeOffset}
                    className="transition-[stroke-dashoffset] duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {goalProgressPct >= 10
                      ? `${goalProgressPct.toFixed(0)}%`
                      : `${goalProgressPct.toFixed(1)}%`}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {goalProgressPct >= 100 ? 'Goal Reached' : 'Down Payment'}
                  </span>
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left space-y-3 min-w-0">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <Target className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>Savings Goal Progress</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    {formatPeso(currentSavedForGoal, false, currency)}{' '}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      / {formatPeso(requiredDownPayment, false, currency)}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed tabular-nums">
                    {remainingForGoal > 0
                      ? `${formatPeso(remainingForGoal, false, currency)} remaining for your ${scenario.downPaymentPercent}% down payment on a ${formatPeso(scenario.targetHomePrice, true, currency)} home.`
                      : `Congratulations—your saved deposits meet your ${scenario.downPaymentPercent}% target down payment!`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>
                    {rentModel.yearsToDownPayment !== null
                      ? `Est. ${rentModel.yearsToDownPayment} yrs at ${formatPeso(scenario.weeklySavings, false, currency)}/wk`
                      : `Target DP: ${formatPeso(requiredDownPayment, true, currency)}`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('rent-equity')}
                    className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4 cursor-pointer"
                  >
                    Adjust Home Target
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Quick Log Weekly Deposit */}
            <div className="lg:col-span-6 lg:pl-8 lg:border-l border-t lg:border-t-0 pt-6 lg:pt-0 border-slate-200/80 dark:border-slate-800 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Quick Log Deposit
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Record today&apos;s savings right from Overview to advance your ring &amp; badges.
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
                        className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-500'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
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
                    className="w-full px-3 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
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
                    className="w-full px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
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
                    placeholder="Coffee skipped"
                    className="w-full px-3 py-2 text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={quickBusy}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
        </div>

        {/* Direct Workspace Navigation Cards */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Explore the workspace
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Select a section below or from the top bar—no scrolling required
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {destinations.map((dest) => {
              const Icon = dest.icon;
              return (
                <button
                  key={dest.view}
                  type="button"
                  onClick={() => onNavigate(dest.view)}
                  className="finsight-card-interactive group relative overflow-hidden text-left bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 hover:border-emerald-600 dark:hover:border-emerald-500 rounded-xl p-5 flex flex-col justify-between cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-85 group-hover:opacity-100 transition-opacity ${dest.topStripeClass}`}
                  />
                  <div>
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-3.5 transition-transform duration-200 group-hover:scale-105 ${dest.accentClass}`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        {dest.title}
                      </h3>
                      <ArrowRight
                        className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-transform duration-200 group-hover:translate-x-1 shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                      {dest.goal}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums truncate">
                    {dest.metric}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Frequently Asked Questions Section */}
        <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide">
                <HelpCircle
                  className="w-4 h-4 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>Frequently Asked Questions</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-100 text-balance">
                How the math and equity modeling work.
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Clear answers on weekly index compounding, historical market drawdowns, and
                converting monthly rent into home ownership.
              </p>

              <div
                role="group"
                aria-label="Filter FAQ topics"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                {(
                  [
                    { id: 'all', label: 'All Topics' },
                    { id: 'compounding', label: 'Compounding Math' },
                    { id: 'rent-equity', label: 'Rent & Equity' },
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

            <div className="lg:col-span-8 divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950/60 overflow-hidden">
              {filteredFaqs.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div
                    key={item.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/60"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqId(isOpen ? '' : item.id)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 block mb-0.5">
                          {item.categoryLabel}
                        </span>
                        <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                          {item.question}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-200 ${
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
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 pt-1 space-y-3">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {item.answer}
                            </p>
                            {item.formulaNote && (
                              <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300">
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
      </div>
    </section>
  );
}
