import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  BookmarkPlus,
  Briefcase,
  Check,
  Compass,
  Folder,
  FolderPlus,
  GraduationCap,
  Laptop,
  Plane,
  Plus,
  Repeat,
  Save,
  Shield,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GOAL_CATEGORY_LABELS, SPLIT_PRESETS } from '../data/goalPresets';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import type {
  AppView,
  BudgetEntry,
  FolderColor,
  GoalCategory,
  GoalFolder,
  IncomeCadence,
  SavedScenario,
  ScenarioInput,
} from '../types/finance';
import {
  computeGoalSplitPlan,
  computeWeeklyFromPercent,
  formatDurationMonths,
  formatPeso as baseFormatPeso,
  type CurrencyCode,
} from '../utils/financeMath';

interface GoalPlannerSectionProps {
  scenario: ScenarioInput;
  currency?: CurrencyCode;
  folders: GoalFolder[];
  savedScenarios: SavedScenario[];
  activeScenarioId: string | null;
  isCloudVerified: boolean;
  isOnline: boolean;
  onChangeScenario: (patch: Partial<ScenarioInput>) => void;
  onCreateFolder: (
    name: string,
    color: FolderColor,
    idempotencyKey?: string
  ) => Promise<string>;
  onSaveNewScenario: (
    title: string,
    idempotencyKey: string,
    folderId?: string
  ) => Promise<string | null>;
  onUpdateActiveScenario: () => Promise<void>;
  onNavigate: (view: AppView) => void;
  budgetEntries?: BudgetEntry[];
}

interface PersonalEssentialItem {
  id: string;
  name: string;
  monthlyAmount: number;
  color: string;
}

const PERSONAL_ESSENTIALS_STORAGE_KEY = 'finsight-personal-essentials-v1';

const ESSENTIAL_COLOR_SWATCHES = [
  '#0284c7', // Sky
  '#0ea5e9', // Azure
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Rose
  '#f97316', // Coral
];

const ESSENTIAL_STARTER_PRESETS: Array<{ name: string; monthlyAmount: number; color: string }> = [
  { name: 'Rent / Dorm', monthlyAmount: 3500, color: '#0284c7' },
  { name: 'Food & Groceries', monthlyAmount: 4000, color: '#14b8a6' },
  { name: 'Commute & Fuel', monthlyAmount: 1500, color: '#6366f1' },
  { name: 'Bills & Wi-Fi', monthlyAmount: 1200, color: '#8b5cf6' },
  { name: 'School / Supplies', monthlyAmount: 1000, color: '#f97316' },
];

function loadPersonalEssentials(): PersonalEssentialItem[] {
  try {
    const raw = localStorage.getItem(PERSONAL_ESSENTIALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : makeClientId('ess'),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 32) : 'Essential',
        monthlyAmount:
          typeof item.monthlyAmount === 'number' && Number.isFinite(item.monthlyAmount)
            ? Math.max(50, Math.round(item.monthlyAmount))
            : 1000,
        color:
          typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color)
            ? item.color
            : '#0284c7',
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function savePersonalEssentials(items: PersonalEssentialItem[]): void {
  try {
    localStorage.setItem(PERSONAL_ESSENTIALS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

const CATEGORY_OPTIONS: Array<{
  id: GoalCategory;
  label: string;
  icon: typeof Bike;
}> = [
  { id: 'custom', label: 'Custom', icon: Compass },
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'motorcycle', label: 'Vehicle', icon: Bike },
  { id: 'emergency', label: 'Safety Net', icon: Shield },
  { id: 'gadget', label: 'Laptop/Tech', icon: Laptop },
  { id: 'business', label: 'Side Hustle', icon: Briefcase },
  { id: 'travel', label: 'Travel', icon: Plane },
];

function makeClientId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

export function GoalPlannerSection({
  scenario,
  currency = 'PHP',
  folders,
  savedScenarios,
  activeScenarioId,
  isCloudVerified,
  isOnline,
  onChangeScenario,
  onCreateFolder,
  onSaveNewScenario,
  onUpdateActiveScenario,
  onNavigate,
  budgetEntries = [],
}: GoalPlannerSectionProps) {
  const formatPeso = (amount: number, compact = false) =>
    baseFormatPeso(amount, compact, currency);

  const [compareMode, setCompareMode] = useState<'invested' | 'cash'>('invested');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(scenario.folderId ?? '');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [saveBusy, setSaveBusy] = useState<'new' | 'update' | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [personalEssentials, setPersonalEssentials] = useState<PersonalEssentialItem[]>(() =>
    loadPersonalEssentials()
  );
  const [showAddEssential, setShowAddEssential] = useState(false);
  const [newEssentialName, setNewEssentialName] = useState('');
  const [newEssentialAmount, setNewEssentialAmount] = useState<number>(1500);
  const [newEssentialCadence, setNewEssentialCadence] = useState<'monthly' | 'weekly'>('monthly');
  const [newEssentialColor, setNewEssentialColor] = useState<string>(ESSENTIAL_COLOR_SWATCHES[0]);

  useEffect(() => {
    savePersonalEssentials(personalEssentials);
  }, [personalEssentials]);

  const saveMutexRef = useRef(false);
  const pendingScenarioKeyRef = useRef<string | null>(null);
  const pendingFolderKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (scenario.folderId && folders.some((f) => f.id === scenario.folderId)) {
      setSelectedFolderId(scenario.folderId);
    } else if (!scenario.folderId) {
      setSelectedFolderId('');
    }
  }, [scenario.folderId, folders]);

  const activeSavedFile = useMemo(
    () => (activeScenarioId ? savedScenarios.find((s) => s.id === activeScenarioId) : undefined),
    [activeScenarioId, savedScenarios]
  );

  const plan = useMemo(() => computeGoalSplitPlan(scenario), [scenario]);
  const activeBenchmark = BENCHMARK_DATASETS[scenario.benchmarkId];

  const unallocatedPercent = Math.max(
    0,
    100 - (scenario.savingsPercent + scenario.needsPercent + scenario.wantsPercent)
  );

  const effectiveMonthlyPool = useMemo(() => {
    if (plan.monthlyIncome > 0) return plan.monthlyIncome;
    return Math.max(1000, Math.round((plan.monthlyFromSplit * 100) / Math.max(1, scenario.savingsPercent)));
  }, [plan.monthlyIncome, plan.monthlyFromSplit, scenario.savingsPercent]);

  const allocationSummary = useMemo(() => {
    type SliceRow = {
      id: string;
      name: string;
      percent: number;
      monthly: number;
      weekly: number;
      color: string;
      isPersonalEssential: boolean;
    };

    const rows: SliceRow[] = [
      {
        id: 'goal-savings',
        name: 'Goal Savings',
        percent: scenario.savingsPercent,
        monthly: Math.round(plan.monthlyFromSplit),
        weekly: scenario.weeklySavings,
        color: '#059669',
        isPersonalEssential: false,
      },
    ];

    if (personalEssentials.length === 0) {
      rows.push(
        {
          id: 'needs-default',
          name: 'Needs & Essentials',
          percent: scenario.needsPercent,
          monthly: Math.round(plan.monthlyNeedsAmount),
          weekly: Math.round((plan.monthlyNeedsAmount * 12) / 52),
          color: '#0284c7',
          isPersonalEssential: false,
        },
        {
          id: 'wants-default',
          name: 'Wants & Flexible',
          percent: scenario.wantsPercent,
          monthly: Math.round(plan.monthlyWantsAmount),
          weekly: Math.round((plan.monthlyWantsAmount * 12) / 52),
          color: '#d97706',
          isPersonalEssential: false,
        }
      );
      if (unallocatedPercent > 0) {
        rows.push({
          id: 'buffer-default',
          name: 'Unallocated Buffer',
          percent: unallocatedPercent,
          monthly: Math.round(plan.monthlyUnallocatedAmount),
          weekly: Math.round((plan.monthlyUnallocatedAmount * 12) / 52),
          color: '#94a3b8',
          isPersonalEssential: false,
        });
      }
      return { rows, overAllocatedPct: 0, overAllocatedMonthly: 0 };
    }

    let sumEssentialsMonthly = 0;
    let sumEssentialsPct = 0;
    for (const ess of personalEssentials) {
      const pct = Math.round((ess.monthlyAmount / effectiveMonthlyPool) * 1000) / 10;
      sumEssentialsMonthly += ess.monthlyAmount;
      sumEssentialsPct += pct;
      rows.push({
        id: ess.id,
        name: ess.name,
        percent: pct,
        monthly: ess.monthlyAmount,
        weekly: Math.round((ess.monthlyAmount * 12) / 52),
        color: ess.color,
        isPersonalEssential: true,
      });
    }

    const remainingNeedsPct = Math.max(
      0,
      Math.round((scenario.needsPercent - sumEssentialsPct) * 10) / 10
    );
    if (remainingNeedsPct > 0.2) {
      const remainingNeedsMonthly = Math.max(
        0,
        Math.round(plan.monthlyNeedsAmount - sumEssentialsMonthly)
      );
      rows.push({
        id: 'other-needs',
        name: 'Other Unassigned Needs',
        percent: remainingNeedsPct,
        monthly: remainingNeedsMonthly,
        weekly: Math.round((remainingNeedsMonthly * 12) / 52),
        color: '#38bdf8',
        isPersonalEssential: false,
      });
    }

    const totalClaimedBeforeWants = scenario.savingsPercent + sumEssentialsPct + remainingNeedsPct;
    const availableForWants = Math.max(0, 100 - totalClaimedBeforeWants);
    const wantsPct = Math.round(Math.min(scenario.wantsPercent, availableForWants) * 10) / 10;
    if (wantsPct > 0.2) {
      const wantsMonthly = Math.round((effectiveMonthlyPool * wantsPct) / 100);
      rows.push({
        id: 'wants-flex',
        name: 'Wants & Flexible',
        percent: wantsPct,
        monthly: wantsMonthly,
        weekly: Math.round((wantsMonthly * 12) / 52),
        color: '#d97706',
        isPersonalEssential: false,
      });
    }

    const totalUsedPct = totalClaimedBeforeWants + wantsPct;
    const bufferPct = Math.max(0, Math.round((100 - totalUsedPct) * 10) / 10);
    if (bufferPct > 0.2) {
      const bufferMonthly = Math.round((effectiveMonthlyPool * bufferPct) / 100);
      rows.push({
        id: 'buffer-rem',
        name: 'Unallocated Buffer',
        percent: bufferPct,
        monthly: bufferMonthly,
        weekly: Math.round((bufferMonthly * 12) / 52),
        color: '#94a3b8',
        isPersonalEssential: false,
      });
    }

    const overAllocatedPct = Math.max(
      0,
      Math.round((scenario.savingsPercent + sumEssentialsPct - 100) * 10) / 10
    );
    const overAllocatedMonthly = Math.max(
      0,
      Math.round(plan.monthlyFromSplit + sumEssentialsMonthly - effectiveMonthlyPool)
    );

    return { rows, overAllocatedPct, overAllocatedMonthly };
  }, [
    personalEssentials,
    effectiveMonthlyPool,
    scenario.savingsPercent,
    scenario.needsPercent,
    scenario.wantsPercent,
    scenario.weeklySavings,
    plan.monthlyFromSplit,
    plan.monthlyNeedsAmount,
    plan.monthlyWantsAmount,
    plan.monthlyUnallocatedAmount,
    unallocatedPercent,
  ]);

  const allocationData = allocationSummary.rows;

  const routineImportCandidates = useMemo(() => {
    const seen = new Set(personalEssentials.map((e) => e.name.toLowerCase()));
    const map = new Map<string, { name: string; monthlyAmount: number }>();
    for (const entry of budgetEntries) {
      if (entry.isEssentialRoutine && entry.bucket === 'needs') {
        const lower = entry.title.trim().toLowerCase();
        if (!seen.has(lower) && !map.has(lower)) {
          map.set(lower, {
            name: entry.title.trim().slice(0, 32),
            monthlyAmount: Math.max(50, Math.round(entry.amount * 22)),
          });
        }
      }
    }
    return Array.from(map.values());
  }, [budgetEntries, personalEssentials]);

  const handleAddPersonalEssential = (
    rawName: string,
    rawAmount: number,
    cadence: 'monthly' | 'weekly',
    color: string
  ) => {
    const cleanName = rawName.trim().slice(0, 32);
    if (!cleanName || !Number.isFinite(rawAmount) || rawAmount < 1) return;
    const monthlyAmount =
      cadence === 'weekly' ? Math.max(50, Math.round((rawAmount * 52) / 12)) : Math.max(50, Math.round(rawAmount));
    setPersonalEssentials((prev) => [
      ...prev.slice(0, 11),
      {
        id: makeClientId('ess'),
        name: cleanName,
        monthlyAmount,
        color,
      },
    ]);
  };

  const handleUpdatePersonalEssentialAmount = (id: string, nextMonthly: number) => {
    const safe = Number.isFinite(nextMonthly) ? Math.max(0, Math.round(nextMonthly)) : 0;
    setPersonalEssentials((prev) =>
      prev.map((item) => (item.id === id ? { ...item, monthlyAmount: safe } : item))
    );
  };

  const handleRemovePersonalEssential = (id: string) => {
    setPersonalEssentials((prev) => prev.filter((item) => item.id !== id));
  };

  const handleImportRoutineEssentials = () => {
    if (routineImportCandidates.length === 0) return;
    setPersonalEssentials((prev) => {
      const additions = routineImportCandidates.map((c, idx) => ({
        id: makeClientId('ess'),
        name: c.name,
        monthlyAmount: c.monthlyAmount,
        color: ESSENTIAL_COLOR_SWATCHES[(prev.length + idx) % ESSENTIAL_COLOR_SWATCHES.length],
      }));
      return [...prev, ...additions].slice(0, 12);
    });
  };

  const handleUpdateSavingsPercent = (nextSavePct: number) => {
    const clampedSave = Math.min(90, Math.max(1, Math.round(nextSavePct)));
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

  const handleUpdateNeedsPercent = (nextNeedsRaw: number) => {
    const maxNeeds = Math.max(0, 100 - scenario.savingsPercent);
    const nextNeeds = Math.min(maxNeeds, Math.max(0, Math.round(nextNeedsRaw)));
    const nextWants = Math.max(0, maxNeeds - nextNeeds);
    onChangeScenario({
      needsPercent: nextNeeds,
      wantsPercent: nextWants,
    });
  };

  const handleUpdateIncome = (nextAmount: number, nextCadence: IncomeCadence) => {
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

  const applySplitPreset = (needsPercent: number, wantsPercent: number, savingsPercent: number) => {
    const nextWeekly =
      scenario.incomeAmount > 0
        ? computeWeeklyFromPercent(scenario.incomeAmount, scenario.incomeCadence, savingsPercent)
        : scenario.weeklySavings;
    onChangeScenario({
      needsPercent,
      wantsPercent,
      savingsPercent,
      weeklySavings: nextWeekly,
    });
  };

  const barData = useMemo(
    () =>
      plan.takeRateComparisons.map((item) => {
        const months =
          compareMode === 'invested' ? item.monthsToGoalInvested : item.monthsToGoalCash;
        return {
          ...item,
          displayMonths: months ?? 120,
          exactLabel: formatDurationMonths(months),
        };
      }),
    [plan.takeRateComparisons, compareMode]
  );

  const resolveTargetFolderId = async (): Promise<string | undefined> => {
    if (creatingFolder) {
      const cleanFolder = newFolderName.trim().slice(0, 48);
      if (!cleanFolder) {
        throw new Error('Enter a folder name or switch back to an existing folder.');
      }
      if (!pendingFolderKeyRef.current) {
        pendingFolderKeyRef.current = makeClientId('fld');
      }
      const createdId = await onCreateFolder(cleanFolder, 'emerald', pendingFolderKeyRef.current);
      pendingFolderKeyRef.current = null;
      setSelectedFolderId(createdId);
      setNewFolderName('');
      setCreatingFolder(false);
      return createdId;
    }
    return selectedFolderId && folders.some((f) => f.id === selectedFolderId)
      ? selectedFolderId
      : undefined;
  };

  const handleSaveNewToVault = async () => {
    if (isCloudVerified && !isOnline) {
      setSaveError('You appear to be offline. Reconnect to save to your cloud Folders & Ledger.');
      return;
    }
    if (saveMutexRef.current) return;
    saveMutexRef.current = true;
    setSaveBusy('new');
    setSaveError(null);
    setSaveNotice(null);

    if (!pendingScenarioKeyRef.current) {
      pendingScenarioKeyRef.current = makeClientId('scen');
    }

    try {
      const targetFolderId = await resolveTargetFolderId();
      const titleToSave = scenario.title.trim() || 'My Savings Goal';
      await onSaveNewScenario(titleToSave, pendingScenarioKeyRef.current, targetFolderId);
      pendingScenarioKeyRef.current = null;
      const folderLabel = targetFolderId
        ? folders.find((f) => f.id === targetFolderId)?.name ?? 'selected folder'
        : 'Folders & Ledger';
      setSaveNotice(`Saved "${titleToSave}" to ${folderLabel}.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save goal right now.');
    } finally {
      saveMutexRef.current = false;
      setSaveBusy(null);
    }
  };

  const handleUpdateExistingInVault = async () => {
    if (!activeScenarioId || saveMutexRef.current) return;
    if (isCloudVerified && !isOnline) {
      setSaveError('You appear to be offline. Reconnect to update this cloud file.');
      return;
    }
    saveMutexRef.current = true;
    setSaveBusy('update');
    setSaveError(null);
    setSaveNotice(null);

    try {
      if (creatingFolder) {
        const targetFolderId = await resolveTargetFolderId();
        onChangeScenario({ folderId: targetFolderId });
      }
      await onUpdateActiveScenario();
      setSaveNotice(
        `Updated "${scenario.title.trim() || 'My Savings Goal'}" in Folders & Ledger.`
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to update saved goal.');
    } finally {
      saveMutexRef.current = false;
      setSaveBusy(null);
    }
  };

  return (
    <section
      id="goal-planner"
      className="py-10 sm:py-12 bg-transparent border-b border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              Goal &amp; Income Split Planner
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Enter whatever you are saving for, set your weekly allowance or monthly income, and
              adjust your split to see how long it takes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveNewToVault}
              disabled={saveBusy !== null}
              className="finsight-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white rounded-lg disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
              <span>{saveBusy === 'new' ? 'Saving…' : 'Save to Folders & Ledger'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ledger')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 hover:border-emerald-600/60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Folder className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span>Open Folders</span>
            </button>
          </div>
        </div>

        {/* Unified 4-Column Hairline Summary Strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="finsight-surface grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-stone-200/90 dark:divide-slate-800 overflow-hidden"
        >
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {GOAL_CATEGORY_LABELS[scenario.goalCategory]}
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {formatPeso(scenario.goalTargetAmount)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {scenario.title}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Taking {scenario.savingsPercent}% to Save
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
              {formatPeso(scenario.weeklySavings)}/wk
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {formatPeso(plan.monthlyFromSplit)}/mo set aside
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Goal Ready In
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {formatDurationMonths(plan.monthsToGoalInvested)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Pure cash: {formatDurationMonths(plan.monthsToGoalCash)}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              1-Year Fund Value
            </div>
            <div className="text-xl font-display font-bold tracking-tight text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
              {formatPeso(plan.oneYearInvestedBalance)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Pure cash after 1 yr: {formatPeso(plan.oneYearCashBalance)}
            </div>
          </div>
        </motion.div>

        {/* Main 2-Column Workspace */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Left Parameter Controls */}
          <div className="lg:col-span-4 finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div>
              <label
                htmlFor="goal-title-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Goal Name
              </label>
              <input
                id="goal-title-input"
                type="text"
                maxLength={80}
                value={scenario.title}
                onChange={(e) => onChangeScenario({ title: e.target.value })}
                placeholder="Type your goal (e.g. Motorcycle, Tuition, Laptop)"
                className="w-full px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
              />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {CATEGORY_OPTIONS.map((cat) => {
                  const Icon = cat.icon;
                  const active = scenario.goalCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onChangeScenario({ goalCategory: cat.id })}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-600 dark:border-emerald-500'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <Icon className="w-3 h-3" aria-hidden="true" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-baseline justify-between mb-1.5">
                <label
                  htmlFor="goal-target-amount"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Target Goal Cost
                </label>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatPeso(scenario.goalTargetAmount, true)}
                </span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="goal-target-amount"
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
                  className="w-full pl-8 pr-4 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Enter any target cost from ₱500 upwards.
              </p>
            </div>

            {/* Income / Student Allowance + Cadence */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="income-amount-input"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Income / Allowance
                </label>
                <div
                  role="group"
                  aria-label="Income cadence"
                  className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  {(['weekly', 'monthly'] as IncomeCadence[]).map((cadence) => (
                    <button
                      key={cadence}
                      type="button"
                      onClick={() => handleUpdateIncome(scenario.incomeAmount, cadence)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md capitalize transition-colors cursor-pointer ${
                        scenario.incomeCadence === cadence
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {cadence}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="income-amount-input"
                  type="number"
                  min={0}
                  max={100000000}
                  step={100}
                  value={scenario.incomeAmount}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    handleUpdateIncome(Number.isFinite(val) ? Math.max(0, val) : 0, scenario.incomeCadence);
                  }}
                  className="w-full pl-8 pr-20 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                />
                <span className="absolute right-3.5 text-xs text-slate-500 dark:text-slate-400">
                  / {scenario.incomeCadence === 'weekly' ? 'wk' : 'mo'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {scenario.incomeCadence === 'weekly'
                  ? `Student/weekly mode · ≈ ${formatPeso(plan.monthlyIncome)}/mo`
                  : `Monthly pay mode · ≈ ${formatPeso(plan.weeklyIncome)}/wk`}
              </p>
            </div>

            {/* Percentage Split Controls */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Percentage Split
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  Total: {scenario.savingsPercent + scenario.needsPercent + scenario.wantsPercent}%
                </span>
              </div>

              {/* Save % Direct Input + Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                  <label
                    htmlFor="planner-save-pct-input"
                    className="font-semibold text-emerald-700 dark:text-emerald-400"
                  >
                    Goal Savings %
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatPeso(scenario.weeklySavings)}/wk
                    </span>
                    <div className="relative flex items-center w-16">
                      <input
                        id="planner-save-pct-input"
                        type="number"
                        min={1}
                        max={95}
                        step={1}
                        value={scenario.savingsPercent}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (Number.isFinite(val)) handleUpdateSavingsPercent(val);
                        }}
                        className="w-full pl-2 pr-5 py-1 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-emerald-600 tabular-nums"
                      />
                      <span className="absolute right-1.5 text-[11px] font-mono text-slate-400">%</span>
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  aria-label="Percentage to save for goal"
                  min={1}
                  max={75}
                  step={1}
                  value={Math.min(75, scenario.savingsPercent)}
                  onChange={(e) => handleUpdateSavingsPercent(Number(e.target.value))}
                  className="finsight-range w-full"
                />
              </div>

              {/* Needs % Direct Input + Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                  <label
                    htmlFor="planner-needs-pct-input"
                    className="font-medium text-sky-700 dark:text-sky-400"
                  >
                    Needs &amp; Essentials %
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatPeso(plan.monthlyNeedsAmount)}/mo
                    </span>
                    <div className="relative flex items-center w-16">
                      <input
                        id="planner-needs-pct-input"
                        type="number"
                        min={0}
                        max={Math.max(0, 100 - scenario.savingsPercent)}
                        step={1}
                        value={scenario.needsPercent}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (Number.isFinite(val)) handleUpdateNeedsPercent(val);
                        }}
                        className="w-full pl-2 pr-5 py-1 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-emerald-600 tabular-nums"
                      />
                      <span className="absolute right-1.5 text-[11px] font-mono text-slate-400">%</span>
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  aria-label="Needs and essentials percentage"
                  min={0}
                  max={Math.max(0, 100 - scenario.savingsPercent)}
                  step={1}
                  value={scenario.needsPercent}
                  onChange={(e) => handleUpdateNeedsPercent(Number(e.target.value))}
                  className="finsight-range w-full"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1 text-slate-600 dark:text-slate-300 tabular-nums">
                <span>Wants &amp; Flexible Remainder</span>
                <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">
                  {scenario.wantsPercent}% ({formatPeso(plan.monthlyWantsAmount)}/mo)
                </span>
              </div>

              <div className="pt-2">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                  Optional quick-fill splits:
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SPLIT_PRESETS.map((preset) => {
                    const active =
                      scenario.needsPercent === preset.needsPercent &&
                      scenario.wantsPercent === preset.wantsPercent &&
                      scenario.savingsPercent === preset.savingsPercent;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          applySplitPreset(
                            preset.needsPercent,
                            preset.wantsPercent,
                            preset.savingsPercent
                          )
                        }
                        className={`px-2.5 py-2 text-left rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-emerald-100'
                            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-500/60'
                        }`}
                      >
                        <div className="text-[11px] font-semibold truncate">{preset.label}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {preset.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Starting Saved Balance */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-baseline justify-between mb-1.5">
                <label
                  htmlFor="planner-initial-deposit"
                  className="text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  Already Saved Toward Goal
                </label>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {Math.min(100, Math.round((scenario.initialDeposit / Math.max(1, scenario.goalTargetAmount)) * 100))}% done
                </span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-mono font-semibold text-slate-500 dark:text-slate-400">
                  ₱
                </span>
                <input
                  id="planner-initial-deposit"
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
                  className="w-full pl-8 pr-4 py-2 text-sm font-mono font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                />
              </div>
            </div>

            {/* Save Goal to Folders & Ledger */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Save to Folders &amp; Ledger
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingFolder((prev) => !prev);
                    setSaveError(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-2 cursor-pointer"
                >
                  <FolderPlus className="w-3 h-3" aria-hidden="true" />
                  <span>{creatingFolder ? 'Pick Existing' : 'New Folder'}</span>
                </button>
              </div>

              {creatingFolder ? (
                <div>
                  <label
                    htmlFor="planner-new-folder-name"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    New Folder Name
                  </label>
                  <input
                    id="planner-new-folder-name"
                    type="text"
                    maxLength={48}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Vehicles, Tuition, Gadgets"
                    className="w-full px-3 py-2 text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="planner-folder-select"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Destination Folder
                  </label>
                  <select
                    id="planner-folder-select"
                    value={selectedFolderId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedFolderId(nextId);
                      onChangeScenario({ folderId: nextId || undefined });
                    }}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">Unfiled (Folders &amp; Ledger)</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        Folder: {folder.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSaveNewToVault}
                  disabled={saveBusy !== null}
                  className="finsight-btn-primary w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{saveBusy === 'new' ? 'Saving Plan…' : 'Save Goal File'}</span>
                </button>

                {activeSavedFile && (
                  <button
                    type="button"
                    onClick={handleUpdateExistingInVault}
                    disabled={saveBusy !== null}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {saveBusy === 'update'
                        ? 'Updating File…'
                        : `Update "${activeSavedFile.title}"`}
                    </span>
                  </button>
                )}
              </div>

              {saveNotice && (
                <div
                  role="status"
                  className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-200 space-y-1.5"
                >
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{saveNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('ledger')}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline underline-offset-2 cursor-pointer"
                  >
                    <span>View in Folders &amp; Ledger</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              )}

              {saveError && (
                <div
                  role="alert"
                  className="flex items-start gap-1.5 p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{saveError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Graphs Canvas */}
          <div className="lg:col-span-8 space-y-6">
            {/* Graph 1: Allocation Percentage Split Donut + Customizable Personal Essentials */}
            <div className="finsight-surface finsight-card-interactive bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Your Income &amp; Allowance Percentage Split
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Add your own personal essentials to customize slices inside the circle chart.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formatPeso(effectiveMonthlyPool)}/mo pool
                  </span>
                  {routineImportCandidates.length > 0 && (
                    <button
                      type="button"
                      onClick={handleImportRoutineEssentials}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 cursor-pointer whitespace-nowrap"
                    >
                      <Repeat className="w-3 h-3" aria-hidden="true" />
                      <span>Import Daily Routines ({routineImportCandidates.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAddEssential((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{showAddEssential ? 'Close Editor' : 'Add Personal Essential'}</span>
                  </button>
                </div>
              </div>

              {allocationSummary.overAllocatedPct > 0 && (
                <div
                  role="status"
                  className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Your personal essentials plus savings exceed 100% of your monthly pool by{' '}
                    <strong className="tabular-nums">
                      {allocationSummary.overAllocatedPct}% ({formatPeso(allocationSummary.overAllocatedMonthly)}/mo)
                    </strong>
                    . Adjust an amount or lower your savings % to rebalance.
                  </span>
                </div>
              )}

              {/* Customizable Personal Essentials Drawer */}
              {showAddEssential && (
                <div className="p-4 rounded-xl bg-stone-50/90 dark:bg-slate-950/65 border border-stone-200 dark:border-slate-800 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Quick-Add Common Essentials
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {personalEssentials.length} / 12 custom slices
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {ESSENTIAL_STARTER_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() =>
                          handleAddPersonalEssential(
                            preset.name,
                            preset.monthlyAmount,
                            'monthly',
                            preset.color
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 hover:border-emerald-500 rounded-md transition-colors cursor-pointer"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: preset.color }}
                          aria-hidden="true"
                        />
                        <span>{preset.name}</span>
                        <span className="font-mono text-slate-400 dark:text-slate-500">
                          {formatPeso(preset.monthlyAmount, true)}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-2 border-t border-stone-200/80 dark:border-slate-800">
                    <div className="sm:col-span-4">
                      <label
                        htmlFor="essential-name-input"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Personal Essential Name
                      </label>
                      <input
                        id="essential-name-input"
                        type="text"
                        maxLength={32}
                        value={newEssentialName}
                        onChange={(e) => setNewEssentialName(e.target.value)}
                        placeholder="e.g. Dorm Rent, Medicine..."
                        className="w-full px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="essential-amount-input"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Cost (₱)
                      </label>
                      <input
                        id="essential-amount-input"
                        type="number"
                        min={1}
                        max={10000000}
                        value={newEssentialAmount > 0 ? newEssentialAmount : ''}
                        onChange={(e) =>
                          setNewEssentialAmount(e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="essential-cadence-select"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Cadence
                      </label>
                      <select
                        id="essential-cadence-select"
                        value={newEssentialCadence}
                        onChange={(e) =>
                          setNewEssentialCadence(e.target.value as 'monthly' | 'weekly')
                        }
                        className="w-full px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
                      >
                        <option value="monthly">/ month</option>
                        <option value="weekly">/ week</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1" role="radiogroup" aria-label="Slice color">
                        {ESSENTIAL_COLOR_SWATCHES.slice(0, 5).map((sw) => (
                          <button
                            key={sw}
                            type="button"
                            onClick={() => setNewEssentialColor(sw)}
                            aria-label={`Select color ${sw}`}
                            className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                              newEssentialColor === sw
                                ? 'scale-110 ring-2 ring-offset-1 ring-slate-900 dark:ring-white'
                                : 'opacity-75 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: sw }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!newEssentialName.trim() || newEssentialAmount < 1}
                        onClick={() => {
                          handleAddPersonalEssential(
                            newEssentialName,
                            newEssentialAmount,
                            newEssentialCadence,
                            newEssentialColor
                          );
                          setNewEssentialName('');
                        }}
                        className="finsight-btn-primary px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-5 relative h-[220px] min-w-0">
                  <ResponsiveContainer width="100%" height={220} minWidth={0}>
                    <PieChart>
                      <Pie
                        data={allocationData}
                        dataKey="percent"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {allocationData.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value}%`, String(name)]}
                        contentStyle={{
                          borderRadius: '12px',
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Save Goal
                    </span>
                    <span className="text-xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {scenario.savingsPercent}%
                    </span>
                    {personalEssentials.length > 0 && (
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {personalEssentials.length}{' '}
                        {personalEssentials.length === 1 ? 'essential' : 'essentials'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-7 space-y-2.5">
                  {allocationData.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0 tabular-nums"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: row.color }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {row.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {formatPeso(row.weekly)}/wk
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        {row.isPersonalEssential ? (
                          <div className="flex items-center gap-1.5">
                            <div className="text-right">
                              <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                                {row.percent}%
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              max={10000000}
                              aria-label={`Monthly amount for ${row.name}`}
                              value={row.monthly}
                              onChange={(e) =>
                                handleUpdatePersonalEssentialAmount(row.id, Number(e.target.value))
                              }
                              className="w-24 px-2 py-1 text-right text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-md tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemovePersonalEssential(row.id)}
                              aria-label={`Remove ${row.name}`}
                              className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                              {row.percent}%
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {formatPeso(row.monthly)}/mo
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Graph 2: Goal Progress Timeline (Cash vs Digital Bank vs Index) */}
            <div className="finsight-surface finsight-card-interactive bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Goal Timeline: Cash vs. Digital Bank vs. Index Growth
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tracks {formatPeso(scenario.weeklySavings)}/wk toward your {formatPeso(scenario.goalTargetAmount)} target ({activeBenchmark.shortName})
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-emerald-600" aria-hidden="true" />
                    <span>Index ({activeBenchmark.shortName})</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-sky-500" aria-hidden="true" />
                    <span>Digital Bank (4%)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-slate-400" aria-hidden="true" />
                    <span>Cash Only</span>
                  </span>
                </div>
              </div>

              <div className="w-full h-[260px] min-w-0">
                <ResponsiveContainer width="100%" height={260} minWidth={0}>
                  <AreaChart data={plan.series} margin={{ top: 10, right: 16, left: 0, bottom: 2 }}>
                    <defs>
                      <linearGradient id="goalInvestGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.35} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={62}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => formatPeso(Number(val), true)}
                    />
                    <Tooltip
                      formatter={(val, name) => [formatPeso(Number(val)), String(name)]}
                      contentStyle={{
                        borderRadius: '12px',
                        fontSize: '12px',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                    <ReferenceLine
                      y={scenario.goalTargetAmount}
                      stroke="#d97706"
                      strokeDasharray="5 4"
                      label={{
                        value: `Goal ${formatPeso(scenario.goalTargetAmount, true)}`,
                        position: 'insideTopRight',
                        fill: '#d97706',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="investedBalance"
                      name={`${activeBenchmark.shortName} Fund`}
                      stroke="#059669"
                      strokeWidth={2.5}
                      fill="url(#goalInvestGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="digitalBankBalance"
                      name="4% Digital Bank"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fill="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="cashSaved"
                      name="Cash Saved (0%)"
                      stroke="#64748b"
                      strokeWidth={1.75}
                      strokeDasharray="4 4"
                      fill="none"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Graph 3: Percentage Take-Rate Impact Comparison Bar Chart */}
            <div className="finsight-surface finsight-card-interactive bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    What Percentage Should You Take? (Months to Goal)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Compare how taking 10% vs. 20% vs. 30% of your income speeds up hitting {formatPeso(scenario.goalTargetAmount)}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Timeline comparison basis"
                  className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start"
                >
                  <button
                    type="button"
                    onClick={() => setCompareMode('invested')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      compareMode === 'invested'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Index Growth
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode('cash')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      compareMode === 'cash'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Pure Cash
                  </button>
                </div>
              </div>

              <div className="w-full h-[210px] min-w-0">
                <ResponsiveContainer width="100%" height={210} minWidth={0}>
                  <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.35} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      width={46}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(m) => `${m}m`}
                    />
                    <Tooltip
                      formatter={(val, _name, item) => [
                        `${item?.payload?.exactLabel ?? `${val} months`} (${formatPeso(item?.payload?.weeklyAmount ?? 0)}/wk)`,
                        'Time to Goal',
                      ]}
                      contentStyle={{
                        borderRadius: '12px',
                        fontSize: '12px',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                    <Bar dataKey="displayMonths" radius={[6, 6, 0, 0]}>
                      {barData.map((entry) => (
                        <Cell
                          key={entry.percent}
                          fill={entry.isCurrent ? '#059669' : '#94a3b8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Take-Rate</th>
                      <th className="py-1.5 px-3 font-medium text-right">Weekly</th>
                      <th className="py-1.5 px-3 font-medium text-right">Monthly</th>
                      <th className="py-1.5 px-3 font-medium text-right">Cash Timeline</th>
                      <th className="py-1.5 pl-3 font-medium text-right">Invested Timeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {plan.takeRateComparisons.map((row) => (
                      <tr
                        key={row.percent}
                        onClick={() => handleUpdateSavingsPercent(row.percent)}
                        className={`cursor-pointer transition-colors ${
                          row.isCurrent
                            ? 'bg-emerald-50/75 dark:bg-emerald-950/45 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-2 pr-3 font-mono text-slate-900 dark:text-slate-100">
                          {row.label} {row.isCurrent ? '· Active' : ''}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatPeso(row.weeklyAmount)}/wk
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatPeso(row.monthlyAmount)}/mo
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatDurationMonths(row.monthsToGoalCash)}
                        </td>
                        <td className="py-2 pl-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                          {formatDurationMonths(row.monthsToGoalInvested)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
