import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  BookmarkPlus,
  BookOpenCheck,
  Check,
  Download,
  FileDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LogIn,
  Pencil,
  Plus,
  Printer,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GOAL_CATEGORY_LABELS } from '../data/goalPresets';
import type {
  BenchmarkId,
  FolderColor,
  GoalCategory,
  GoalFolder,
  IncomeCadence,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
} from '../types/finance';
import {
  CURRENCY_CONFIG,
  formatPeso,
  getLocalISODate,
  type CurrencyCode,
} from '../utils/financeMath';
import { exportFolderLedgerPdf, exportGoalProgressPdf } from '../utils/pdfReport';

interface LedgerSectionProps {
  user: User | null;
  isOnline: boolean;
  currency: CurrencyCode;
  scenario: ScenarioInput;
  activeScenarioId: string | null;
  folders: GoalFolder[];
  savedScenarios: SavedScenario[];
  savingsLogs: SavingsLog[];
  onSignIn: () => void;
  onSelectScenario: (saved: SavedScenario) => void;
  onCreateFolder: (
    name: string,
    color: FolderColor,
    idempotencyKey?: string
  ) => Promise<string>;
  onUpdateFolder: (folderId: string, name: string, color: FolderColor) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onSaveNewScenario: (
    title: string,
    idempotencyKey: string,
    folderId?: string
  ) => Promise<string | null>;
  onUpdateActiveScenario: () => Promise<void>;
  onMoveScenarioToFolder: (scenarioId: string, folderId?: string) => Promise<void>;
  onDeleteScenario: (id: string) => Promise<void>;
  onImportScenarioFile: (
    imported: ScenarioInput,
    targetFolderId?: string
  ) => Promise<string>;
  onAddSavingsLog: (
    amount: number,
    note: string,
    weekDate: string,
    idempotencyKey: string
  ) => Promise<void>;
  onDeleteSavingsLog: (id: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

const FOLDER_COLOR_SWATCHES: Array<{
  id: FolderColor;
  label: string;
  dotClass: string;
  iconClass: string;
  badgeClass: string;
}> = [
  {
    id: 'emerald',
    label: 'Emerald',
    dotClass: 'bg-emerald-500',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    badgeClass:
      'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
  },
  {
    id: 'amber',
    label: 'Champagne Gold',
    dotClass: 'bg-amber-500',
    iconClass: 'text-amber-600 dark:text-amber-400',
    badgeClass:
      'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
  },
  {
    id: 'sky',
    label: 'Cobalt',
    dotClass: 'bg-sky-500',
    iconClass: 'text-sky-600 dark:text-sky-400',
    badgeClass:
      'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800/80',
  },
  {
    id: 'rose',
    label: 'Crimson',
    dotClass: 'bg-rose-500',
    iconClass: 'text-rose-600 dark:text-rose-400',
    badgeClass:
      'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/80',
  },
  {
    id: 'slate',
    label: 'Obsidian',
    dotClass: 'bg-slate-500',
    iconClass: 'text-slate-600 dark:text-slate-400',
    badgeClass:
      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
];

function getFolderColorMeta(color: FolderColor) {
  return (
    FOLDER_COLOR_SWATCHES.find((item) => item.id === color) ?? FOLDER_COLOR_SWATCHES[0]
  );
}

const VALID_BENCHMARKS: BenchmarkId[] = ['sp500', 'psei', 'global60_40'];
const VALID_CATEGORIES: GoalCategory[] = [
  'motorcycle',
  'student',
  'emergency',
  'gadget',
  'business',
  'travel',
  'custom',
];
const VALID_CADENCES: IncomeCadence[] = ['weekly', 'monthly'];

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, Math.round(val)));
}

function parseImportedGoalJson(rawText: string): ScenarioInput {
  const parsed: unknown = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File must contain a FinSight goal JSON object.');
  }

  const obj = parsed as Record<string, unknown>;
  const hasGoalData =
    typeof obj.goalTargetAmount === 'number' ||
    typeof obj.weeklySavings === 'number' ||
    typeof obj.title === 'string';

  if (!hasGoalData) {
    throw new Error('This JSON file does not look like a valid FinSight goal file.');
  }

  const savingsPercent = clampInt(obj.savingsPercent, 20, 1, 95);
  const remaining = Math.max(0, 100 - savingsPercent);
  const needsPercent = clampInt(obj.needsPercent, Math.round(remaining * 0.65), 0, remaining);
  const wantsPercent = clampInt(
    obj.wantsPercent,
    Math.max(0, remaining - needsPercent),
    0,
    Math.max(0, remaining - needsPercent)
  );

  return {
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim().slice(0, 80)
        : 'Imported Goal Plan',
    goalCategory: VALID_CATEGORIES.includes(obj.goalCategory as GoalCategory)
      ? (obj.goalCategory as GoalCategory)
      : 'custom',
    goalTargetAmount: clampInt(obj.goalTargetAmount, 25000, 500, 500000000),
    incomeAmount: clampInt(obj.incomeAmount, 22000, 0, 100000000),
    incomeCadence: VALID_CADENCES.includes(obj.incomeCadence as IncomeCadence)
      ? (obj.incomeCadence as IncomeCadence)
      : 'monthly',
    savingsPercent,
    needsPercent,
    wantsPercent,
    weeklySavings: clampInt(obj.weeklySavings, 250, 1, 1000000),
    initialDeposit: clampInt(obj.initialDeposit, 0, 0, 100000000),
    benchmarkId: VALID_BENCHMARKS.includes(obj.benchmarkId as BenchmarkId)
      ? (obj.benchmarkId as BenchmarkId)
      : 'global60_40',
    folderId: typeof obj.folderId === 'string' && obj.folderId.trim() ? obj.folderId.trim() : undefined,
  };
}

function makeClientId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

function slugifyFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'goal-plan';
}

function escapeCsvCell(value: string | number): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

interface SavingsChartPoint {
  dateLabel: string;
  fullDate: string;
  deposit: number;
  cumulativeDeposits: number;
  totalBalance: number;
}

interface SavingsTooltipPayloadItem {
  payload?: SavingsChartPoint;
}

function SavingsGrowthTooltip({
  active,
  payload,
  currency,
  hasInitialDeposit,
}: {
  active?: boolean;
  payload?: SavingsTooltipPayloadItem[];
  currency: CurrencyCode;
  hasInitialDeposit: boolean;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }
  const pt = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-xs tabular-nums space-y-1">
      <div className="font-semibold text-slate-900 dark:text-slate-100">{pt.fullDate}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500 dark:text-slate-400">Total Saved</span>
        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
          {formatPeso(pt.totalBalance, false, currency)}
        </span>
      </div>
      {hasInitialDeposit && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Logged Deposits</span>
          <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
            {formatPeso(pt.cumulativeDeposits, false, currency)}
          </span>
        </div>
      )}
      {pt.deposit > 0 && (
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400">Added This Date</span>
          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
            +{formatPeso(pt.deposit, false, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

type FolderFilter = 'all' | 'unfiled' | string;

export function LedgerSection({
  user,
  isOnline,
  currency,
  scenario,
  activeScenarioId,
  folders,
  savedScenarios,
  savingsLogs,
  onSignIn,
  onSelectScenario,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onSaveNewScenario,
  onUpdateActiveScenario,
  onMoveScenarioToFolder,
  onDeleteScenario,
  onImportScenarioFile,
  onAddSavingsLog,
  onDeleteSavingsLog,
  onDeleteAccount,
}: LedgerSectionProps) {
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<FolderFilter>('all');
  const [saveTargetFolderId, setSaveTargetFolderId] = useState<string>(scenario.folderId ?? '');
  const [planTitle, setPlanTitle] = useState(scenario.title);

  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>('emerald');

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState<FolderColor>('emerald');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState<number>(scenario.weeklySavings);
  const [depositNote, setDepositNote] = useState('');
  const [depositDate, setDepositDate] = useState(() => getLocalISODate());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmDeleteScenarioId, setConfirmDeleteScenarioId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  const submitMutexRef = useRef(false);
  const pendingLogKeyRef = useRef<string | null>(null);
  const pendingScenarioKeyRef = useRef<string | null>(null);
  const pendingFolderKeyRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const isCloudVerified = Boolean(user && user.emailVerified);

  useEffect(() => {
    setPlanTitle(scenario.title);
  }, [activeScenarioId, scenario.title]);

  useEffect(() => {
    if (scenario.folderId && folders.some((f) => f.id === scenario.folderId)) {
      setSaveTargetFolderId(scenario.folderId);
    } else if (!activeScenarioId) {
      setSaveTargetFolderId(
        selectedFolderFilter !== 'all' && selectedFolderFilter !== 'unfiled'
          ? selectedFolderFilter
          : ''
      );
    } else {
      setSaveTargetFolderId('');
    }
  }, [activeScenarioId, scenario.folderId, folders, selectedFolderFilter]);

  useEffect(() => {
    setDepositAmount(scenario.weeklySavings);
  }, [scenario.weeklySavings]);

  useEffect(() => {
    if (
      selectedFolderFilter !== 'all' &&
      selectedFolderFilter !== 'unfiled' &&
      !folders.some((f) => f.id === selectedFolderFilter)
    ) {
      setSelectedFolderFilter('all');
    }
  }, [folders, selectedFolderFilter]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unfiled = 0;
    for (const file of savedScenarios) {
      if (file.folderId && folderById.has(file.folderId)) {
        counts.set(file.folderId, (counts.get(file.folderId) ?? 0) + 1);
      } else {
        unfiled += 1;
      }
    }
    return { counts, unfiled };
  }, [savedScenarios, folderById]);

  const visibleFiles = useMemo(() => {
    if (selectedFolderFilter === 'all') return savedScenarios;
    if (selectedFolderFilter === 'unfiled') {
      return savedScenarios.filter((s) => !s.folderId || !folderById.has(s.folderId));
    }
    return savedScenarios.filter((s) => s.folderId === selectedFolderFilter);
  }, [savedScenarios, selectedFolderFilter, folderById]);

  const targetGoalAmount = Math.max(500, scenario.goalTargetAmount);
  const totalLogged = savingsLogs.reduce((sum, item) => sum + item.amount, 0);
  const totalSavedWithInitial = scenario.initialDeposit + totalLogged;
  const goalProgressPct = Math.min(100, (totalSavedWithInitial / targetGoalAmount) * 100);

  const savingsChartData = useMemo<SavingsChartPoint[]>(() => {
    if (savingsLogs.length === 0) return [];

    const byDate = new Map<string, number>();
    for (const log of savingsLogs) {
      byDate.set(log.weekDate, (byDate.get(log.weekDate) ?? 0) + log.amount);
    }

    const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    const points: SavingsChartPoint[] = [
      {
        dateLabel: 'Start',
        fullDate: 'Starting Balance',
        deposit: 0,
        cumulativeDeposits: 0,
        totalBalance: scenario.initialDeposit,
      },
    ];

    let runningDeposits = 0;
    for (const dateStr of sortedDates) {
      const dayDeposit = byDate.get(dateStr) ?? 0;
      runningDeposits += dayDeposit;
      const shortLabel = dateStr.length >= 10 ? dateStr.slice(5) : dateStr;
      points.push({
        dateLabel: shortLabel,
        fullDate: dateStr,
        deposit: dayDeposit,
        cumulativeDeposits: runningDeposits,
        totalBalance: scenario.initialDeposit + runningDeposits,
      });
    }

    return points;
  }, [savingsLogs, scenario.initialDeposit]);

  const showNotice = (msg: string) => {
    setActionError(null);
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const requireOnlineIfCloud = (offlineMsg: string): boolean => {
    if (isCloudVerified && !isOnline) {
      setActionError(offlineMsg);
      return false;
    }
    return true;
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFolderName.trim();
    if (!cleanName) {
      setActionError('Enter a folder name first.');
      return;
    }
    if (!requireOnlineIfCloud('You appear to be offline. Reconnect before creating a cloud folder.')) {
      return;
    }
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction('create-folder');

    if (!pendingFolderKeyRef.current) {
      pendingFolderKeyRef.current = makeClientId('fld');
    }

    try {
      const folderId = await onCreateFolder(cleanName, newFolderColor, pendingFolderKeyRef.current);
      pendingFolderKeyRef.current = null;
      setNewFolderName('');
      setShowNewFolderForm(false);
      setSelectedFolderFilter(folderId);
      setSaveTargetFolderId(folderId);
      showNotice(`Created folder "${cleanName}".`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to create folder right now.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleStartEditFolder = (folder: GoalFolder) => {
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
    setEditFolderColor(folder.color);
    setConfirmDeleteFolderId(null);
  };

  const handleSaveEditFolder = async (folderId: string) => {
    const cleanName = editFolderName.trim();
    if (!cleanName) {
      setActionError('Folder name cannot be empty.');
      return;
    }
    if (!requireOnlineIfCloud('Reconnect to rename a cloud folder.')) return;
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setBusyAction(`edit-folder-${folderId}`);
    setActionError(null);

    try {
      await onUpdateFolder(folderId, cleanName, editFolderColor);
      setEditingFolderId(null);
      showNotice(`Updated folder "${cleanName}".`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update folder.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleConfirmDeleteFolder = async (folderId: string) => {
    if (!requireOnlineIfCloud('Reconnect to delete a cloud folder.')) return;
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setBusyAction(`del-folder-${folderId}`);
    setActionError(null);

    try {
      await onDeleteFolder(folderId);
      setConfirmDeleteFolderId(null);
      if (selectedFolderFilter === folderId) {
        setSelectedFolderFilter('all');
      }
      showNotice('Folder deleted. Goal files inside moved to Unfiled.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete folder.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireOnlineIfCloud('You appear to be offline. Reconnect before saving to your cloud vault.')) {
      return;
    }
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction('save-new');

    if (!pendingScenarioKeyRef.current) {
      pendingScenarioKeyRef.current = makeClientId('scen');
    }

    const folderIdToSave = saveTargetFolderId || undefined;

    try {
      await onSaveNewScenario(
        planTitle.trim() || 'My Savings Goal',
        pendingScenarioKeyRef.current,
        folderIdToSave
      );
      pendingScenarioKeyRef.current = null;
      const folderLabel = folderIdToSave ? folderById.get(folderIdToSave)?.name : undefined;
      showNotice(
        folderLabel
          ? `Saved goal file inside "${folderLabel}".`
          : `Saved goal file to ${isCloudVerified ? 'Cloud Vault' : 'Local Vault'}.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not save goal file right now. Your inputs are still here; please try again.'
      );
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleUpdateCurrent = async () => {
    if (!activeScenarioId || submitMutexRef.current) return;
    if (!requireOnlineIfCloud('You are offline. Reconnect to update this cloud file.')) return;

    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction('update-active');
    try {
      await onUpdateActiveScenario();
      showNotice('Updated loaded goal file.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update file. Please try again.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleMoveFile = async (scenarioId: string, nextFolderId: string) => {
    if (!requireOnlineIfCloud('Reconnect to move files between cloud folders.')) return;
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction(`move-${scenarioId}`);
    try {
      await onMoveScenarioToFolder(scenarioId, nextFolderId || undefined);
      const destName = nextFolderId ? folderById.get(nextFolderId)?.name : 'Unfiled';
      showNotice(`Moved file to ${destName ?? 'Unfiled'}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not move goal file.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleExportGoalFile = (item: SavedScenario) => {
    const folderName = item.folderId ? folderById.get(item.folderId)?.name : undefined;
    const payload = {
      format: 'finsight-goal-v1',
      exportedAt: new Date().toISOString(),
      title: item.title,
      goalCategory: item.goalCategory,
      goalTargetAmount: item.goalTargetAmount,
      incomeAmount: item.incomeAmount,
      incomeCadence: item.incomeCadence,
      savingsPercent: item.savingsPercent,
      needsPercent: item.needsPercent,
      wantsPercent: item.wantsPercent,
      weeklySavings: item.weeklySavings,
      initialDeposit: item.initialDeposit,
      benchmarkId: item.benchmarkId,
      folderName,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finsight-${slugifyFileName(item.title)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice(`Exported "${item.title}" as .json file.`);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 256 * 1024) {
      setActionError('Goal file is too large (max 256 KB).');
      return;
    }

    if (!requireOnlineIfCloud('Reconnect to import a goal file into your cloud vault.')) return;
    if (submitMutexRef.current) return;

    submitMutexRef.current = true;
    setBusyAction('import-file');
    setActionError(null);

    try {
      const rawText = await file.text();
      const imported = parseImportedGoalJson(rawText);
      const targetFolder =
        selectedFolderFilter !== 'all' && selectedFolderFilter !== 'unfiled'
          ? selectedFolderFilter
          : saveTargetFolderId || undefined;

      await onImportScenarioFile(imported, targetFolder);
      showNotice(`Imported "${imported.title}" and loaded it into your workspace.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to read goal file. Check the JSON format.'
      );
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onSignIn();
      return;
    }
    if (!user.emailVerified) {
      setActionError('Please sign in with a verified Google account to log deposits.');
      return;
    }
    if (!Number.isFinite(depositAmount) || depositAmount < 1) {
      setActionError('Enter a deposit amount of at least ₱1.');
      return;
    }
    if (!isOnline) {
      setActionError(
        'Connection lost. Your deposit entry is still in the form; reconnect and tap Log again.'
      );
      return;
    }
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction('log-deposit');

    if (!pendingLogKeyRef.current) {
      pendingLogKeyRef.current = makeClientId('log');
    }

    try {
      await onAddSavingsLog(
        depositAmount,
        depositNote.trim() || 'Weekly savings deposit',
        depositDate,
        pendingLogKeyRef.current
      );
      pendingLogKeyRef.current = null;
      setDepositNote('');
      showNotice(`Logged ${formatPeso(depositAmount, false, currency)} to your ledger.`);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Signal lost while saving. Your entry was kept so you can retry without duplicating.'
      );
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleConfirmDeleteScenario = async (id: string) => {
    if (!requireOnlineIfCloud('Reconnect to delete a cloud goal file.')) return;
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setBusyAction(`del-scen-${id}`);
    setActionError(null);
    try {
      await onDeleteScenario(id);
      setConfirmDeleteScenarioId(null);
      showNotice('Goal file deleted.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete goal file.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleConfirmDeleteLog = async (id: string) => {
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setBusyAction(`del-log-${id}`);
    setActionError(null);
    try {
      await onDeleteSavingsLog(id);
      setConfirmDeleteLogId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete log entry.');
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setBusyAction('delete-account');
    setActionError(null);
    try {
      await onDeleteAccount();
      setConfirmDeleteAccount(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to delete account right now.'
      );
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleExportCsv = () => {
    if (savingsLogs.length === 0) return;

    const scenarioTitleById = new Map(savedScenarios.map((s) => [s.id, s.title]));
    const rate = CURRENCY_CONFIG[currency].phpPerUnit || 1;
    const headers = [
      'Date',
      'Note',
      'Amount (PHP)',
      `Converted (${currency})`,
      'Goal Plan',
      'Log ID',
    ];

    const rows = savingsLogs.map((log) => {
      const converted = (log.amount / rate).toFixed(2);
      const scenarioName =
        scenarioTitleById.get(log.scenarioId) ?? scenario.title ?? 'Savings Goal';
      return [
        escapeCsvCell(log.weekDate),
        escapeCsvCell(log.note || 'Weekly contribution'),
        log.amount.toFixed(2),
        converted,
        escapeCsvCell(scenarioName),
        escapeCsvCell(log.id),
      ].join(',');
    });

    const csvContent = `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finsight-savings-logs-${getLocalISODate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showNotice(
      `Exported ${savingsLogs.length} savings ${savingsLogs.length === 1 ? 'entry' : 'entries'} to CSV.`
    );
  };

  const activeFilterLabel =
    selectedFolderFilter === 'all'
      ? 'All Goal Files'
      : selectedFolderFilter === 'unfiled'
        ? 'Unfiled Files'
        : folderById.get(selectedFolderFilter)?.name ?? 'Folder';

  const ownerVaultLabel = isCloudVerified
    ? user?.displayName || user?.email || 'Cloud Account'
    : 'Local Browser Vault';

  const handleExportFolderPdf = () => {
    try {
      exportFolderLedgerPdf({
        folderName: activeFilterLabel,
        folderFilter: selectedFolderFilter,
        folders,
        files: visibleFiles,
        allScenarios: savedScenarios,
        savingsLogs,
        currency,
        ownerLabel: ownerVaultLabel,
      });
      showNotice(`Exported "${activeFilterLabel}" ledger report as PDF.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to generate PDF report.');
    }
  };

  const handleExportProgressPdf = () => {
    try {
      exportGoalProgressPdf({
        scenario,
        activeScenarioId,
        folders,
        savingsLogs,
        currency,
        ownerLabel: ownerVaultLabel,
      });
      showNotice(`Exported "${scenario.title.trim() || 'Goal'}" progress report as PDF.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to generate PDF report.');
    }
  };

  return (
    <section id="ledger" className="py-12 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide mb-2">
              <BookOpenCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span>
                {isCloudVerified
                  ? 'Cloud Folders, Goal Files & Deposit Ledger'
                  : 'Folders, Goal Files & Deposit Ledger'}
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Organize multiple goals in folders &amp; files.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              {isCloudVerified
                ? `Create folders for Vehicles, School, Travel, or Emergency funds, save individual goal files, export/import .json backups, and log deposits toward ${formatPeso(targetGoalAmount, false, currency)}.`
                : 'Group your savings targets into folders, save multiple goal files in your browser vault, or export/import portable .json files anytime.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {feedback && (
              <div
                role="status"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-lg"
              >
                <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{feedback}</span>
              </div>
            )}

            {!user && (
              <button
                type="button"
                onClick={onSignIn}
                className="finsight-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign In to Cloud Sync</span>
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-4 py-3 text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        {user && !user.emailVerified && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
            Your sign-in provider did not supply a verified email address. Files are saved locally
            in this browser; sign in with a verified Google account to sync folders and deposit
            check-ins to the cloud.
          </div>
        )}

        {/* Folders & Goal Files Explorer */}
        <div className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col md:flex-row">
          {/* Folder Rail */}
          <aside className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-stone-200/90 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-950/45 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Folders ({folders.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewFolderForm((prev) => !prev);
                  setEditingFolderId(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Folder</span>
              </button>
            </div>

            {showNewFolderForm && (
              <form
                onSubmit={handleCreateFolderSubmit}
                className="p-3 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-xl space-y-2.5"
              >
                <label
                  htmlFor="new-folder-name"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                >
                  Folder Name
                </label>
                <input
                  id="new-folder-name"
                  type="text"
                  maxLength={48}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Vehicles, Tuition, Japan Trip"
                  className="w-full px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5" role="group" aria-label="Folder color">
                    {FOLDER_COLOR_SWATCHES.map((swatch) => {
                      const active = newFolderColor === swatch.id;
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          title={swatch.label}
                          aria-label={swatch.label}
                          aria-pressed={active}
                          onClick={() => setNewFolderColor(swatch.id)}
                          className={`w-5 h-5 rounded-full ${swatch.dotClass} flex items-center justify-center cursor-pointer transition-transform ${
                            active
                              ? 'ring-2 ring-offset-2 ring-emerald-600 dark:ring-offset-slate-900 scale-110'
                              : 'opacity-75 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowNewFolderForm(false)}
                      className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busyAction === 'create-folder'}
                      className="finsight-btn-primary px-2.5 py-1 text-[11px] font-semibold text-white rounded-md cursor-pointer disabled:opacity-60"
                    >
                      {busyAction === 'create-folder' ? 'Adding…' : 'Create'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <nav aria-label="Goal folders" className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedFolderFilter('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedFolderFilter === 'all'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-stone-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>All Goal Files</span>
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    selectedFolderFilter === 'all'
                      ? 'text-emerald-100'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {savedScenarios.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFolderFilter('unfiled')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedFolderFilter === 'unfiled'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-stone-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Unfiled</span>
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    selectedFolderFilter === 'unfiled'
                      ? 'text-emerald-100'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {folderCounts.unfiled}
                </span>
              </button>

              {folders.length > 0 && (
                <div className="pt-2 mt-2 border-t border-stone-200/90 dark:border-slate-800 space-y-1">
                  {folders.map((folder) => {
                    const isSelected = selectedFolderFilter === folder.id;
                    const isEditing = editingFolderId === folder.id;
                    const isConfirmDelete = confirmDeleteFolderId === folder.id;
                    const colorMeta = getFolderColorMeta(folder.color);
                    const fileCount = folderCounts.counts.get(folder.id) ?? 0;

                    if (isEditing) {
                      return (
                        <div
                          key={folder.id}
                          className="p-2.5 bg-white dark:bg-slate-900 border border-emerald-500/60 rounded-lg space-y-2"
                        >
                          <input
                            type="text"
                            maxLength={48}
                            value={editFolderName}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            aria-label="Edit folder name"
                            className="w-full px-2 py-1 text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:border-emerald-600"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              {FOLDER_COLOR_SWATCHES.map((swatch) => (
                                <button
                                  key={swatch.id}
                                  type="button"
                                  aria-label={`Set folder color ${swatch.label}`}
                                  onClick={() => setEditFolderColor(swatch.id)}
                                  className={`w-4 h-4 rounded-full ${swatch.dotClass} cursor-pointer ${
                                    editFolderColor === swatch.id
                                      ? 'ring-2 ring-offset-1 ring-emerald-600 dark:ring-offset-slate-900'
                                      : 'opacity-70 hover:opacity-100'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingFolderId(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                aria-label="Cancel folder edit"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={busyAction === `edit-folder-${folder.id}`}
                                onClick={() => handleSaveEditFolder(folder.id)}
                                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={folder.id} className="space-y-1">
                        <div
                          className={`group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                            isSelected
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-stone-200/60 dark:hover:bg-slate-800'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedFolderFilter(folder.id)}
                            className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer"
                          >
                            {isSelected ? (
                              <FolderOpen className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                            ) : (
                              <Folder className={`w-3.5 h-3.5 shrink-0 ${colorMeta.iconClass}`} aria-hidden="true" />
                            )}
                            <span className="font-medium truncate">{folder.name}</span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={`font-mono text-[11px] tabular-nums px-1 ${
                                isSelected
                                  ? 'text-emerald-100'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {fileCount}
                            </span>
                            <button
                              type="button"
                              aria-label={`Rename folder ${folder.name}`}
                              onClick={() => handleStartEditFolder(folder)}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isSelected
                                  ? 'text-emerald-100/80 hover:text-white'
                                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 opacity-75 group-hover:opacity-100'
                              }`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete folder ${folder.name}`}
                              onClick={() =>
                                setConfirmDeleteFolderId(isConfirmDelete ? null : folder.id)
                              }
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isSelected
                                  ? 'text-emerald-100/80 hover:text-red-200'
                                  : 'text-slate-400 hover:text-red-600 dark:hover:text-red-400 opacity-75 group-hover:opacity-100'
                              }`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {isConfirmDelete && (
                          <div className="px-2.5 py-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/70 rounded-lg text-[11px] text-red-800 dark:text-red-200 space-y-1.5">
                            <p>Delete folder? Files inside stay safe in Unfiled.</p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyAction === `del-folder-${folder.id}`}
                                onClick={() => handleConfirmDeleteFolder(folder.id)}
                                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                              >
                                Delete Folder
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFolderId(null)}
                                className="px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </nav>

            <div className="pt-3 border-t border-stone-200/90 dark:border-slate-800 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <HardDrive className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span>
                {isCloudVerified
                  ? 'Synced to your private Google cloud vault.'
                  : 'Stored in Local Browser Vault. Export .json anytime.'}
              </span>
            </div>
          </aside>

          {/* Main Files Panel */}
          <div className="flex-1 p-5 sm:p-6 space-y-5 min-w-0">
            {/* Save Current Plan + Import Toolbar */}
            <form
              onSubmit={handleSaveNew}
              className="p-4 bg-stone-50/70 dark:bg-slate-800/45 border border-stone-200/90 dark:border-slate-800 rounded-xl space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Save Active Goal as a File
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportFileChange}
                    className="hidden"
                    aria-label="Import FinSight goal JSON file"
                  />
                  <button
                    type="button"
                    disabled={busyAction === 'import-file'}
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 hover:border-emerald-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <span>{busyAction === 'import-file' ? 'Importing…' : 'Import .json File'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-5">
                  <label
                    htmlFor="plan-title"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    File Name
                  </label>
                  <input
                    id="plan-title"
                    type="text"
                    maxLength={80}
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="e.g. Motorcycle Fund 20%"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label
                    htmlFor="save-target-folder"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Save Into Folder
                  </label>
                  <select
                    id="save-target-folder"
                    value={saveTargetFolderId}
                    onChange={(e) => setSaveTargetFolderId(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">Unfiled (Root)</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={busyAction === 'save-new'}
                    className="finsight-btn-primary w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{busyAction === 'save-new' ? 'Saving…' : 'Save New File'}</span>
                  </button>
                </div>
              </div>

              {activeScenarioId && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/80 dark:border-slate-700/70">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Currently editing:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {savedScenarios.find((s) => s.id === activeScenarioId)?.title ?? scenario.title}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleUpdateCurrent}
                    disabled={busyAction === 'update-active'}
                    className="px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {busyAction === 'update-active' ? 'Updating…' : 'Overwrite Loaded File'}
                  </button>
                </div>
              )}
            </form>

            {/* File Grid Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {activeFilterLabel}
                </h3>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  ({visibleFiles.length})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                  Click any file to load it
                </span>
                <button
                  type="button"
                  onClick={handleExportFolderPdf}
                  title="Download formatted folder ledger PDF"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:border-emerald-600 dark:hover:border-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span>Export Folder PDF</span>
                </button>
              </div>
            </div>

            {/* File Cards */}
            {visibleFiles.length === 0 ? (
              <div className="border border-dashed border-stone-300 dark:border-slate-700 rounded-xl p-8 text-center space-y-2">
                <FileText className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {savedScenarios.length === 0
                    ? 'No saved goal files yet'
                    : 'No goal files in this folder'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {savedScenarios.length === 0
                    ? 'Use "Save New File" above to store your current goal target, income cadence, and percentage split as a reusable file.'
                    : 'Pick a folder in "Save Into Folder" above or move an existing file here.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {visibleFiles.map((item) => {
                  const isActive = item.id === activeScenarioId;
                  const confirming = confirmDeleteScenarioId === item.id;
                  const assignedFolder = item.folderId ? folderById.get(item.folderId) : undefined;
                  const folderColorMeta = assignedFolder
                    ? getFolderColorMeta(assignedFolder.color)
                    : null;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition-all ${
                        isActive
                          ? 'bg-emerald-50/75 dark:bg-emerald-950/45 border-emerald-600 dark:border-emerald-500 shadow-xs'
                          : 'bg-stone-50/60 dark:bg-slate-800/50 border-stone-200 dark:border-slate-700/90 hover:border-emerald-600/50 dark:hover:border-emerald-500/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectScenario(item);
                          setPlanTitle(item.title);
                          setDepositAmount(item.weeklySavings);
                        }}
                        className="text-left w-full cursor-pointer space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText
                              className={`w-4 h-4 shrink-0 ${
                                isActive
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                              aria-hidden="true"
                            />
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {item.title}
                            </span>
                          </div>
                          {isActive && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/70 rounded shrink-0">
                              Loaded
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                          <span>{GOAL_CATEGORY_LABELS[item.goalCategory]}</span>
                          <span>·</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {formatPeso(item.goalTargetAmount, true, currency)}
                          </span>
                          <span>·</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {item.savingsPercent}% ({formatPeso(item.weeklySavings, false, currency)}/wk)
                          </span>
                        </div>

                        {assignedFolder && folderColorMeta && (
                          <div>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded border max-w-full ${folderColorMeta.badgeClass}`}
                            >
                              <Folder className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{assignedFolder.name}</span>
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Card Action Row */}
                      <div className="pt-2.5 border-t border-stone-200/80 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <label htmlFor={`move-file-${item.id}`} className="sr-only">
                            Move {item.title} to folder
                          </label>
                          <select
                            id={`move-file-${item.id}`}
                            value={assignedFolder ? assignedFolder.id : ''}
                            disabled={busyAction === `move-${item.id}`}
                            onChange={(e) => handleMoveFile(item.id, e.target.value)}
                            className="max-w-[165px] px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-emerald-600"
                          >
                            <option value="">Folder: Unfiled</option>
                            {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                Folder: {folder.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleExportGoalFile(item)}
                            title="Download portable .json file"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 hover:border-emerald-600 rounded-md transition-colors cursor-pointer"
                          >
                            <FileDown className="w-3 h-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                            <span>.json</span>
                          </button>

                          {confirming ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busyAction === `del-scen-${item.id}`}
                                onClick={() => handleConfirmDeleteScenario(item.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteScenarioId(null)}
                                className="px-1.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Delete goal ${item.title}`}
                              onClick={() => setConfirmDeleteScenarioId(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Deposit Tracker & Cloud Ledger Section */}
        {!user ? (
          <div className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="max-w-xl">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Sign in with Google to track Deposit Check-Ins &amp; Cloud Sync
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Your folders and goal files above work right away locally. Signing in syncs every
                folder, file, weekly deposit check-in, and milestone badge privately across devices.
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="finsight-btn-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In with Google
            </button>
          </div>
        ) : !user.emailVerified ? null : (
          <div className="space-y-6">
            <div className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200/90 dark:border-slate-800 rounded-xl p-6 space-y-6">
              <div className="pb-5 border-b border-stone-200/90 dark:border-slate-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {scenario.title} — Deposit Ledger
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Starting balance + actual logged deposits
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatPeso(totalSavedWithInitial, false, currency)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {' '}
                      / {formatPeso(targetGoalAmount, false, currency)}
                    </span>
                  </div>
                </div>

                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                    style={{ width: `${goalProgressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
                  <span>{goalProgressPct.toFixed(1)}% of goal funded</span>
                  <span>{savingsLogs.length} check-ins logged</span>
                </div>
              </div>

              {/* Log New Deposit Form */}
              <form
                onSubmit={handleLogSubmit}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
              >
                <div className="sm:col-span-3">
                  <label
                    htmlFor="log-amount"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Amount (₱)
                  </label>
                  <input
                    id="log-amount"
                    type="number"
                    min={1}
                    max={1000000}
                    value={depositAmount > 0 ? depositAmount : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDepositAmount(raw === '' ? 0 : Number(raw));
                    }}
                    className="w-full px-3 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg tabular-nums"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="log-date"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Date (Local)
                  </label>
                  <input
                    id="log-date"
                    type="date"
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label
                    htmlFor="log-note"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Note (Optional)
                  </label>
                  <input
                    id="log-note"
                    type="text"
                    maxLength={160}
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    placeholder="Saved baon / freelance"
                    className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={busyAction === 'log-deposit'}
                    className="finsight-btn-primary w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{busyAction === 'log-deposit' ? 'Saving…' : 'Log'}</span>
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Savings Growth Line Chart (Recharts) */}
                <div className="lg:col-span-6 p-4 bg-slate-50/80 dark:bg-slate-800/45 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Savings Growth Over Time
                      </h4>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-0.5 bg-emerald-500" aria-hidden="true" />
                        <span>Total Saved</span>
                      </span>
                      {scenario.initialDeposit > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block w-2.5 h-0.5 bg-amber-500 border-t border-dashed border-amber-500"
                            aria-hidden="true"
                          />
                          <span>Logged Deposits</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {savingsChartData.length === 0 ? (
                    <div className="h-[195px] flex items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400 px-4">
                      Log your first deposit above to chart your cumulative growth toward your goal.
                    </div>
                  ) : (
                    <div className="w-full h-[210px] min-w-0">
                      <ResponsiveContainer width="100%" height={210} minWidth={0}>
                        <LineChart
                          data={savingsChartData}
                          margin={{ top: 8, right: 14, left: 0, bottom: 2 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="currentColor"
                            className="text-slate-200 dark:text-slate-700/70"
                          />
                          <XAxis
                            dataKey="dateLabel"
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            className="text-slate-500 dark:text-slate-400"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            width={58}
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            className="text-slate-500 dark:text-slate-400"
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => formatPeso(Number(val), true, currency)}
                          />
                          <Tooltip
                            content={
                              <SavingsGrowthTooltip
                                currency={currency}
                                hasInitialDeposit={scenario.initialDeposit > 0}
                              />
                            }
                          />
                          <ReferenceLine
                            y={targetGoalAmount}
                            stroke="#d97706"
                            strokeDasharray="4 4"
                            ifOverflow="extendDomain"
                          />
                          {scenario.initialDeposit > 0 && (
                            <Line
                              type="monotone"
                              dataKey="cumulativeDeposits"
                              name="Logged Deposits"
                              stroke="#f59e0b"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              dot={false}
                              activeDot={{ r: 4, fill: '#f59e0b' }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="totalBalance"
                            name="Total Saved"
                            stroke="#10b981"
                            strokeWidth={2.75}
                            dot={{ r: 3.5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 1.5 }}
                            activeDot={{ r: 5.5, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Logged Contributions Toolbar & Table */}
                <div className="lg:col-span-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                      Logged Contributions ({savingsLogs.length}) · Total{' '}
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatPeso(totalLogged, false, currency)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportProgressPdf}
                        title="Download formatted progress report PDF"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-emerald-600 dark:hover:border-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>Progress PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportCsv}
                        disabled={savingsLogs.length === 0}
                        title={
                          savingsLogs.length === 0
                            ? 'Log at least one deposit to export CSV'
                            : 'Download your savings logs as CSV'
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-emerald-600 dark:hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {savingsLogs.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No deposits logged yet. Log your first deposit above to start tracking your
                        progress toward your goal.
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs tabular-nums">
                          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                            <tr>
                              <th className="py-2.5 px-4 font-medium">Date</th>
                              <th className="py-2.5 px-4 font-medium">Note</th>
                              <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                              <th className="py-2.5 px-3 font-medium text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {savingsLogs.map((log) => {
                              const confirming = confirmDeleteLogId === log.id;
                              return (
                                <tr
                                  key={log.id}
                                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                                >
                                  <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {log.weekDate}
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 max-w-[200px] truncate">
                                    {log.note || 'Weekly contribution'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                    +{formatPeso(log.amount, false, currency)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    {confirming ? (
                                      <span className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={busyAction === `del-log-${log.id}`}
                                          onClick={() => handleConfirmDeleteLog(log.id)}
                                          className="px-2 py-0.5 text-[11px] font-semibold text-white bg-red-600 rounded cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteLogId(null)}
                                          className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        aria-label={`Delete deposit on ${log.weekDate}`}
                                        onClick={() => setConfirmDeleteLogId(log.id)}
                                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Account & Data Deletion Controls */}
            <div className="finsight-surface border border-stone-200/90 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900/95 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Account &amp; Data Control
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Permanently remove your FinSight profile, folders, saved goal files, and all
                  deposit logs.
                </p>
              </div>
              {confirmDeleteAccount ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyAction === 'delete-account'}
                    onClick={handleConfirmDeleteAccount}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {busyAction === 'delete-account'
                      ? 'Deleting Account…'
                      : 'Yes, Delete Everything'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAccount(false)}
                    className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount(true)}
                  className="px-4 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/70 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Delete My Account &amp; Data
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
