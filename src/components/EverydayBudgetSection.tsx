import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AppView,
  BudgetBucket,
  BudgetCategory,
  BudgetEntry,
  BudgetEntryInput,
  BudgetEntryStatus,
  CurrencyCode,
  ScenarioInput,
} from '../types/finance';
import {
  formatPeso,
  getLocalISODate,
  incomeToWeekly,
} from '../utils/financeMath';

interface EverydayBudgetSectionProps {
  user: User | null;
  isOnline: boolean;
  scenario: ScenarioInput;
  currency: CurrencyCode;
  budgetEntries: BudgetEntry[];
  onCreateBudgetEntry: (input: BudgetEntryInput, idempotencyKey?: string) => Promise<string>;
  onUpdateBudgetEntry: (entryId: string, input: BudgetEntryInput) => Promise<void>;
  onDeleteBudgetEntry: (entryId: string) => Promise<void>;
  onSweepToSavingsLedger: (amount: number, note: string, weekDate: string) => Promise<void>;
  onNavigate: (view: AppView) => void;
  onSignIn: () => void;
}

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  food: 'Meals & Food',
  commute: 'Commute & Fuel',
  bills: 'Bills & Load',
  groceries: 'Groceries',
  coffee: 'Coffee & Drinks',
  personal: 'Personal Care',
  other: 'Everyday Misc',
};

const QUICK_EVERYDAY_TEMPLATES: Array<{
  title: string;
  amount: number;
  bucket: BudgetBucket;
  category: BudgetCategory;
  isEssentialRoutine: boolean;
}> = [
  { title: 'Commute / Fare', amount: 70, bucket: 'needs', category: 'commute', isEssentialRoutine: true },
  { title: 'Daily Lunch / Meal', amount: 145, bucket: 'needs', category: 'food', isEssentialRoutine: true },
  { title: 'Iced Coffee / Milk Tea', amount: 155, bucket: 'wants', category: 'coffee', isEssentialRoutine: false },
  { title: 'Mobile Load / Data', amount: 99, bucket: 'needs', category: 'bills', isEssentialRoutine: false },
  { title: 'Groceries Basket', amount: 550, bucket: 'needs', category: 'groceries', isEssentialRoutine: false },
  { title: 'Snacks / Delivery Treat', amount: 185, bucket: 'wants', category: 'food', isEssentialRoutine: false },
];

type TimeWindowFilter = 'today' | 'week' | 'all';
type StatusFilter = 'all' | BudgetEntryStatus;

function makeBudgetEntryKey(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `bgt_${rand}`;
}

function getStartOfIsoWeekISO(todayISO: string): string {
  const [y, m, d] = todayISO.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay(); // 0 = Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diffToMon);
  return getLocalISODate(dt);
}

function formatGoalDays(amount: number, weeklySavings: number): string {
  const dailyPace = Math.max(1, weeklySavings) / 7;
  const days = amount / dailyPace;
  if (days < 0.2) return '< 0.2 goal days';
  if (days < 10) return `${days.toFixed(1)} goal days`;
  const weeks = days / 7;
  return `${weeks.toFixed(1)} goal wks`;
}

export function EverydayBudgetSection({
  user,
  isOnline,
  scenario,
  currency,
  budgetEntries,
  onCreateBudgetEntry,
  onUpdateBudgetEntry,
  onDeleteBudgetEntry,
  onSweepToSavingsLedger,
  onNavigate,
  onSignIn,
}: EverydayBudgetSectionProps) {
  const todayISO = getLocalISODate();
  const weekStartISO = useMemo(() => getStartOfIsoWeekISO(todayISO), [todayISO]);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(120);
  const [bucket, setBucket] = useState<BudgetBucket>('needs');
  const [category, setCategory] = useState<BudgetCategory>('food');
  const [entryDate, setEntryDate] = useState(todayISO);
  const [initialStatus, setInitialStatus] = useState<BudgetEntryStatus>('planned');
  const [isEssentialRoutine, setIsEssentialRoutine] = useState(false);

  const [timeFilter, setTimeFilter] = useState<TimeWindowFilter>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pendingIdRef = useRef<string | null>(null);
  const mutexRef = useRef(false);

  // Derive Weekly & Daily Pocket Limits straight from user's Goal & Split Plan
  const weeklyIncome = incomeToWeekly(scenario.incomeAmount, scenario.incomeCadence);
  const fallbackWeeklyTotal =
    weeklyIncome > 0
      ? weeklyIncome
      : Math.max(100, Math.round((scenario.weeklySavings * 100) / Math.max(1, scenario.savingsPercent)));
  const weeklyNeedsCap = Math.max(50, Math.round((fallbackWeeklyTotal * scenario.needsPercent) / 100));
  const weeklyWantsCap = Math.max(0, Math.round((fallbackWeeklyTotal * scenario.wantsPercent) / 100));
  const weeklyPocketCap = Math.max(100, weeklyNeedsCap + weeklyWantsCap);
  const dailyPocketCap = Math.max(20, Math.round(weeklyPocketCap / 7));

  const todaySpent = useMemo(
    () =>
      budgetEntries
        .filter((e) => e.entryDate === todayISO && e.status === 'spent')
        .reduce((sum, e) => sum + e.amount, 0),
    [budgetEntries, todayISO]
  );

  const todaySwept = useMemo(
    () =>
      budgetEntries
        .filter((e) => e.entryDate === todayISO && e.status === 'swept')
        .reduce((sum, e) => sum + e.amount, 0),
    [budgetEntries, todayISO]
  );

  const weekNeedsSpent = useMemo(
    () =>
      budgetEntries
        .filter((e) => e.entryDate >= weekStartISO && e.status === 'spent' && e.bucket === 'needs')
        .reduce((sum, e) => sum + e.amount, 0),
    [budgetEntries, weekStartISO]
  );

  const weekWantsSpent = useMemo(
    () =>
      budgetEntries
        .filter((e) => e.entryDate >= weekStartISO && e.status === 'spent' && e.bucket === 'wants')
        .reduce((sum, e) => sum + e.amount, 0),
    [budgetEntries, weekStartISO]
  );

  const weekSweptTotal = useMemo(
    () =>
      budgetEntries
        .filter((e) => e.entryDate >= weekStartISO && e.status === 'swept')
        .reduce((sum, e) => sum + e.amount, 0),
    [budgetEntries, weekStartISO]
  );

  const safeToSpendToday = dailyPocketCap - todaySpent;
  const weeklyPocketLeft = weeklyPocketCap - (weekNeedsSpent + weekWantsSpent);
  const reclaimedGoalDays = (
    weekSweptTotal / Math.max(1, scenario.weeklySavings / 7)
  ).toFixed(1);

  // Unique pinned everyday routine templates from previous entries
  const routineTemplates = useMemo(() => {
    const map = new Map<string, BudgetEntry>();
    for (const entry of budgetEntries) {
      if (entry.isEssentialRoutine) {
        const key = `${entry.title.toLowerCase()}__${entry.bucket}`;
        if (!map.has(key)) {
          map.set(key, entry);
        }
      }
    }
    return Array.from(map.values());
  }, [budgetEntries]);

  const missingTodayRoutines = useMemo(() => {
    const todayTitles = new Set(
      budgetEntries
        .filter((e) => e.entryDate === todayISO)
        .map((e) => `${e.title.toLowerCase()}__${e.bucket}`)
    );
    return routineTemplates.filter(
      (r) => !todayTitles.has(`${r.title.toLowerCase()}__${r.bucket}`)
    );
  }, [budgetEntries, routineTemplates, todayISO]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return budgetEntries.filter((entry) => {
      if (timeFilter === 'today' && entry.entryDate !== todayISO) return false;
      if (timeFilter === 'week' && entry.entryDate < weekStartISO) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (
        q &&
        !entry.title.toLowerCase().includes(q) &&
        !CATEGORY_LABELS[entry.category].toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [budgetEntries, timeFilter, statusFilter, searchQuery, todayISO, weekStartISO]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback((prev) => (prev === msg ? null : prev)), 4000);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim().slice(0, 64);
    if (!cleanTitle) {
      setErrorMsg('Enter an everyday item name (for example, Lunch or Jeepney Fare).');
      return;
    }
    if (!Number.isFinite(amount) || amount < 1) {
      setErrorMsg('Enter an amount of at least ₱1.');
      return;
    }
    if (user && !isOnline) {
      setErrorMsg('Connection lost. Reconnect to save synced budget items.');
      return;
    }
    if (mutexRef.current) return;

    mutexRef.current = true;
    setBusy(true);
    setErrorMsg(null);
    if (!pendingIdRef.current) {
      pendingIdRef.current = makeBudgetEntryKey();
    }

    try {
      await onCreateBudgetEntry(
        {
          title: cleanTitle,
          amount: Math.round(amount),
          bucket,
          category,
          status: initialStatus,
          entryDate,
          isEssentialRoutine,
        },
        pendingIdRef.current
      );
      pendingIdRef.current = null;
      setTitle('');
      showToast(
        initialStatus === 'swept'
          ? `Swept ${formatPeso(amount, false, currency)} — reclaimed ${formatGoalDays(amount, scenario.weeklySavings)}!`
          : `Added "${cleanTitle}" (${formatGoalDays(amount, scenario.weeklySavings)}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save item right now.');
    } finally {
      mutexRef.current = false;
      setBusy(false);
    }
  };

  const handleQuickTemplate = async (tpl: (typeof QUICK_EVERYDAY_TEMPLATES)[number]) => {
    if (user && !isOnline) {
      setErrorMsg('Connection lost. Reconnect to add synced items.');
      return;
    }
    setErrorMsg(null);
    try {
      await onCreateBudgetEntry({
        title: tpl.title,
        amount: tpl.amount,
        bucket: tpl.bucket,
        category: tpl.category,
        status: 'planned',
        entryDate: todayISO,
        isEssentialRoutine: tpl.isEssentialRoutine,
      });
      setTimeFilter('today');
      showToast(`Added ${tpl.title} to today's list.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not add quick item.');
    }
  };

  const handleLoadTodayRoutines = async () => {
    if (missingTodayRoutines.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await Promise.all(
        missingTodayRoutines.map((r) =>
          onCreateBudgetEntry({
            title: r.title,
            amount: r.amount,
            bucket: r.bucket,
            category: r.category,
            status: 'planned',
            entryDate: todayISO,
            isEssentialRoutine: true,
          })
        )
      );
      setTimeFilter('today');
      showToast(`Loaded ${missingTodayRoutines.length} everyday routine items for today.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load routine checklist.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetStatus = async (entry: BudgetEntry, nextStatus: BudgetEntryStatus) => {
    if (busyItemId) return;
    setBusyItemId(entry.id);
    setErrorMsg(null);
    try {
      await onUpdateBudgetEntry(entry.id, {
        title: entry.title,
        amount: entry.amount,
        bucket: entry.bucket,
        category: entry.category,
        status: nextStatus,
        entryDate: entry.entryDate,
        isEssentialRoutine: entry.isEssentialRoutine,
        scenarioId: entry.scenarioId,
      });
      if (nextStatus === 'swept') {
        showToast(
          `Skipped "${entry.title}" — ${formatGoalDays(entry.amount, scenario.weeklySavings)} reclaimed!`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update item status.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleSweepReclaimedToGoal = async (sweepAmount: number, sweepLabel: string) => {
    if (!user) {
      onSignIn();
      return;
    }
    if (!isOnline || sweepBusy || sweepAmount < 1) return;
    setSweepBusy(true);
    setErrorMsg(null);
    try {
      await onSweepToSavingsLedger(sweepAmount, sweepLabel, todayISO);
      showToast(
        `Deposited ${formatPeso(sweepAmount, false, currency)} directly into your Savings Ledger!`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not deposit swept savings.');
    } finally {
      setSweepBusy(false);
    }
  };

  const needsPctUsed = Math.min(100, Math.round((weekNeedsSpent / Math.max(1, weeklyNeedsCap)) * 100));
  const wantsPctUsed =
    weeklyWantsCap > 0
      ? Math.min(100, Math.round((weekWantsSpent / weeklyWantsCap) * 100))
      : weekWantsSpent > 0
        ? 100
        : 0;

  return (
    <section id="everyday-budget" className="py-8 sm:py-10 finsight-ambient-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-stone-200/90 dark:border-slate-800/90">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              Everyday Budget &amp; Goal-Time Pulse
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Every daily item translates into days of your active{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {scenario.title.trim() || 'Savings Goal'}
              </span>
              . Check off essentials, or skip a want and sweep the cash straight into your goal.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {missingTodayRoutines.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={handleLoadTodayRoutines}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Load Today&apos;s Routine ({missingTodayRoutines.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('goal-planner')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 hover:border-emerald-600/50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Adjust Split %
            </button>
          </div>
        </div>

        {/* 2-Column Top Deck: Pocket Allowance Gauge + Quick Add Everyday Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left (5 cols): Obsidian Forest Pocket Pulse */}
          <div className="lg:col-span-5 finsight-obsidian-card rounded-2xl p-6 text-white flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-emerald-200/80">
                  Today&apos;s Safe-to-Spend Pocket
                </span>
                <span className="text-[11px] font-mono text-emerald-300/90 tabular-nums">
                  {scenario.needsPercent}% Needs · {scenario.wantsPercent}% Wants
                </span>
              </div>

              <div>
                <div
                  className={`text-4xl font-display font-bold tracking-tight tabular-nums ${
                    safeToSpendToday < 0 ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {formatPeso(safeToSpendToday, false, currency)}
                </div>
                <p className="text-xs text-emerald-100/80 mt-1 tabular-nums">
                  {safeToSpendToday >= 0
                    ? `Remaining from ${formatPeso(dailyPocketCap, false, currency)}/day cap (${formatPeso(todaySpent, false, currency)} spent today)`
                    : `${formatPeso(Math.abs(safeToSpendToday), false, currency)} over today's ${formatPeso(dailyPocketCap, false, currency)} pace`}
                </p>
              </div>

              {/* Needs vs Wants Weekly Bars */}
              <div className="pt-4 border-t border-white/10 space-y-3.5">
                <div>
                  <div className="flex items-center justify-between text-xs tabular-nums mb-1.5">
                    <span className="text-sky-200 font-medium">Weekly Needs</span>
                    <span className="font-mono text-white/90">
                      {formatPeso(weekNeedsSpent, false, currency)} /{' '}
                      {formatPeso(weeklyNeedsCap, false, currency)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-black/35 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        weekNeedsSpent > weeklyNeedsCap ? 'bg-amber-400' : 'bg-sky-400'
                      }`}
                      style={{ width: `${needsPctUsed}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs tabular-nums mb-1.5">
                    <span className="text-amber-200 font-medium">Weekly Wants &amp; Flexible</span>
                    <span className="font-mono text-white/90">
                      {formatPeso(weekWantsSpent, false, currency)} /{' '}
                      {formatPeso(weeklyWantsCap, false, currency)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-black/35 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        weekWantsSpent > weeklyWantsCap ? 'bg-rose-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${wantsPctUsed}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Special Essence Box: Reclaimed Everyday Savings -> Goal Acceleration */}
            <div className="rounded-xl bg-black/30 border border-emerald-400/25 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Goal-Time Reclaimed This Week</span>
                  </div>
                  <div className="text-xl font-display font-bold text-white tabular-nums mt-0.5">
                    {formatPeso(weekSweptTotal, false, currency)}{' '}
                    <span className="text-xs font-sans font-normal text-emerald-200/80">
                      ({reclaimedGoalDays} goal days faster)
                    </span>
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-[11px] text-emerald-100/70">Weekly Pocket Left</div>
                  <div className="text-sm font-mono font-bold text-emerald-300">
                    {formatPeso(weeklyPocketLeft, false, currency)}
                  </div>
                </div>
              </div>

              {(weekSweptTotal > 0 || safeToSpendToday > 0) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {weekSweptTotal > 0 && (
                    <button
                      type="button"
                      disabled={sweepBusy}
                      onClick={() =>
                        handleSweepReclaimedToGoal(
                          weekSweptTotal,
                          `Swept skipped everyday spending`
                        )
                      }
                      className="finsight-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      <Coins className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {!user
                          ? `Sign In to Deposit ${formatPeso(weekSweptTotal, false, currency)}`
                          : sweepBusy
                            ? 'Depositing…'
                            : `Deposit ${formatPeso(weekSweptTotal, false, currency)} to Goal Ledger`}
                      </span>
                    </button>
                  )}
                  {todaySpent === 0 && todaySwept === 0 && safeToSpendToday > 0 && (
                    <span className="text-[11px] text-emerald-100/70">
                      Mark or skip an item on your everyday list to track today&apos;s pace.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right (7 cols): Quick-Tap Everyday Basket & Add Form */}
          <div className="lg:col-span-7 finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Quick-Tap Everyday Items
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tap any common expense to add it to today&apos;s checklist, or log your own below.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatPeso(Math.round(scenario.weeklySavings / 7), false, currency)}/day goal pace
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QUICK_EVERYDAY_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => handleQuickTemplate(tpl)}
                    className="group text-left p-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-950/50 hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/25 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {tpl.title}
                      </span>
                      <Plus
                        className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 transition-transform group-hover:scale-110"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">
                        {formatPeso(tpl.amount, false, currency)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {tpl.bucket === 'needs' ? 'Need' : 'Want'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleAddSubmit}
              className="pt-4 border-t border-stone-200 dark:border-slate-800 space-y-3.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label
                    htmlFor="budget-item-title"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Everyday Item
                  </label>
                  <input
                    id="budget-item-title"
                    type="text"
                    maxLength={64}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Breakfast, Grab, Laundry..."
                    className="w-full px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="budget-item-amount"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Amount (₱)
                  </label>
                  <input
                    id="budget-item-amount"
                    type="number"
                    min={1}
                    max={1000000}
                    value={amount > 0 ? amount : ''}
                    onChange={(e) => setAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label
                    htmlFor="budget-item-category"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="budget-item-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as BudgetCategory)}
                    className="w-full px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  >
                    {(Object.keys(CATEGORY_LABELS) as BudgetCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Needs vs Wants toggle */}
                  <div className="inline-flex p-0.5 rounded-lg bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700">
                    {(['needs', 'wants'] as BudgetBucket[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBucket(b)}
                        className={`px-3 py-1 text-xs font-medium rounded-md capitalize cursor-pointer transition-colors ${
                          bucket === b
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>

                  {/* Planned vs Spent toggle */}
                  <div className="inline-flex p-0.5 rounded-lg bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700">
                    {(
                      [
                        { id: 'planned', label: 'Checklist' },
                        { id: 'spent', label: 'Spent Now' },
                      ] as Array<{ id: BudgetEntryStatus; label: string }>
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setInitialStatus(st.id)}
                        className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                          initialStatus === st.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="date"
                    aria-label="Entry date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="px-2.5 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                  />

                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEssentialRoutine}
                      onChange={(e) => setIsEssentialRoutine(e.target.checked)}
                      className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    <span>Pin to Daily Routine</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="finsight-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{busy ? 'Saving…' : 'Add to List'}</span>
                </button>
              </div>

              {amount > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>
                    Goal-Time Equivalent:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {formatPeso(amount, false, currency)} = {formatGoalDays(amount, scenario.weeklySavings)}
                    </strong>{' '}
                    of your {scenario.title.trim() || 'Savings Goal'} pace
                  </span>
                </div>
              )}

              {feedback && (
                <div
                  role="status"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{feedback}</span>
                </div>
              )}

              {errorMsg && (
                <div role="alert" className="text-xs text-red-700 dark:text-red-400">
                  {errorMsg}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Everyday Budget List & Filters */}
        <div className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-0.5 rounded-lg bg-stone-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: 'week', label: 'This Week' },
                    { id: 'all', label: 'All Entries' },
                  ] as Array<{ id: TimeWindowFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimeFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      timeFilter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex p-0.5 rounded-lg bg-stone-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'planned', label: 'Planned' },
                    { id: 'spent', label: 'Spent' },
                    { id: 'swept', label: 'Skipped & Swept' },
                  ] as Array<{ id: StatusFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      statusFilter === tab.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full lg:w-64">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search everyday items…"
                className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No everyday items in this view yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Tap a quick everyday item above (like Commute, Lunch, or Coffee) to plan today&apos;s wallet and see what each item costs in goal days.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200/90 dark:divide-slate-800">
              {filteredEntries.map((entry) => {
                const isBusyRow = busyItemId === entry.id;
                const goalTimeStr = formatGoalDays(entry.amount, scenario.weeklySavings);

                return (
                  <div
                    key={entry.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/75 dark:hover:bg-slate-800/35 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold truncate ${
                            entry.status === 'swept'
                              ? 'line-through text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {entry.title}
                        </span>
                        {entry.isEssentialRoutine && (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            · Daily Routine
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 tabular-nums">
                        <span className="capitalize">
                          {entry.bucket === 'needs' ? 'Needs' : 'Wants'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{CATEGORY_LABELS[entry.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{entry.entryDate}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            entry.status === 'swept'
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-600 dark:text-slate-300'
                          }
                        >
                          {entry.status === 'swept'
                            ? `+${goalTimeStr} reclaimed`
                            : `= ${goalTimeStr}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mr-1">
                        {formatPeso(entry.amount, false, currency)}
                      </span>

                      {entry.status !== 'spent' && (
                        <button
                          type="button"
                          disabled={isBusyRow}
                          onClick={() => handleSetStatus(entry, 'spent')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                          <span>Mark Spent</span>
                        </button>
                      )}

                      {entry.status !== 'swept' && (
                        <button
                          type="button"
                          disabled={isBusyRow}
                          onClick={() => handleSetStatus(entry, 'swept')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                          <span>Skip &amp; Sweep</span>
                        </button>
                      )}

                      {entry.status !== 'planned' && (
                        <button
                          type="button"
                          disabled={isBusyRow}
                          onClick={() => handleSetStatus(entry, 'planned')}
                          title="Reset back to checklist"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-md cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusyRow}
                        onClick={() => onDeleteBudgetEntry(entry.id)}
                        aria-label={`Delete ${entry.title}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!user && (
            <div className="px-5 py-3 bg-stone-50 dark:bg-slate-950/60 border-t border-stone-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>
                Your everyday budget list is saved locally in this browser. Sign in with Google to sync across devices and sweep savings directly into your goal ledger.
              </span>
              <button
                type="button"
                onClick={() => onNavigate('ledger')}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                <span>Open Folders &amp; Ledger</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
