import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  BookmarkPlus,
  BookOpenCheck,
  Check,
  Download,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SavedScenario, SavingsLog, ScenarioInput } from '../types/finance';
import {
  CURRENCY_CONFIG,
  formatPeso,
  getLocalISODate,
  type CurrencyCode,
} from '../utils/financeMath';

interface LedgerSectionProps {
  user: User | null;
  isOnline: boolean;
  currency: CurrencyCode;
  scenario: ScenarioInput;
  activeScenarioId: string | null;
  savedScenarios: SavedScenario[];
  savingsLogs: SavingsLog[];
  onSignIn: () => void;
  onSelectScenario: (saved: SavedScenario) => void;
  onSaveNewScenario: (title: string, idempotencyKey: string) => Promise<string | null>;
  onUpdateActiveScenario: () => Promise<void>;
  onDeleteScenario: (id: string) => Promise<void>;
  onAddSavingsLog: (
    amount: number,
    note: string,
    weekDate: string,
    idempotencyKey: string
  ) => Promise<void>;
  onDeleteSavingsLog: (id: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

function makeClientId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
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
      <div className="font-semibold text-slate-900 dark:text-slate-100">
        {pt.fullDate}
      </div>
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

export function LedgerSection({
  user,
  isOnline,
  currency,
  scenario,
  activeScenarioId,
  savedScenarios,
  savingsLogs,
  onSignIn,
  onSelectScenario,
  onSaveNewScenario,
  onUpdateActiveScenario,
  onDeleteScenario,
  onAddSavingsLog,
  onDeleteSavingsLog,
  onDeleteAccount,
}: LedgerSectionProps) {
  const [planTitle, setPlanTitle] = useState(scenario.title);
  const [depositAmount, setDepositAmount] = useState<number>(scenario.weeklySavings);
  const [depositNote, setDepositNote] = useState('');
  const [depositDate, setDepositDate] = useState(() => getLocalISODate());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Two-step inline delete confirmations (no window.confirm in iframes)
  const [confirmDeleteScenarioId, setConfirmDeleteScenarioId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  // Synchronous mutex prevents rapid double-taps before React state flushes
  const submitMutexRef = useRef(false);
  const pendingLogKeyRef = useRef<string | null>(null);
  const pendingScenarioKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setPlanTitle(scenario.title);
  }, [activeScenarioId, scenario.title]);

  useEffect(() => {
    setDepositAmount(scenario.weeklySavings);
  }, [scenario.weeklySavings]);

  const requiredDownPayment =
    (scenario.targetHomePrice * scenario.downPaymentPercent) / 100;
  const totalLogged = savingsLogs.reduce((sum, item) => sum + item.amount, 0);
  const totalSavedWithInitial = scenario.initialDeposit + totalLogged;
  const downPaymentProgressPct = Math.min(
    100,
    requiredDownPayment > 0 ? (totalSavedWithInitial / requiredDownPayment) * 100 : 0
  );

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

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onSignIn();
      return;
    }
    if (!isOnline) {
      setActionError('You appear to be offline. Reconnect before saving a new plan.');
      return;
    }
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction('save-new');

    if (!pendingScenarioKeyRef.current) {
      pendingScenarioKeyRef.current = makeClientId('scen');
    }

    try {
      await onSaveNewScenario(
        planTitle.trim() || 'My Savings Plan',
        pendingScenarioKeyRef.current
      );
      pendingScenarioKeyRef.current = null;
      showNotice('Saved scenario to your account.');
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not save scenario right now. Your inputs are preserved—please retry.'
      );
    } finally {
      submitMutexRef.current = false;
      setBusyAction(null);
    }
  };

  const handleUpdateCurrent = async () => {
    if (!user || !activeScenarioId || submitMutexRef.current) return;
    if (!isOnline) {
      setActionError('You are offline. Reconnect to update this plan.');
      return;
    }
    submitMutexRef.current = true;
    setActionError(null);
    setBusyAction('update-active');
    try {
      await onUpdateActiveScenario();
      showNotice('Updated saved scenario.');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to update scenario. Please try again.'
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
    if (!Number.isFinite(depositAmount) || depositAmount < 1) {
      setActionError('Enter a deposit amount of at least ₱1.');
      return;
    }
    if (!isOnline) {
      setActionError(
        'Signal lost—your deposit entry is still in the form. Reconnect and tap Log again.'
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
        depositNote.trim() || 'Weekly peso contribution',
        depositDate,
        pendingLogKeyRef.current
      );
      // Only reset note & idempotency key AFTER confirmed server write
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
    if (submitMutexRef.current) return;
    submitMutexRef.current = true;
    setBusyAction(`del-scen-${id}`);
    setActionError(null);
    try {
      await onDeleteScenario(id);
      setConfirmDeleteScenarioId(null);
      showNotice('Scenario and its linked entries were deleted.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete scenario.');
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
      'Scenario',
      'Log ID',
    ];

    const rows = savingsLogs.map((log) => {
      const converted = (log.amount / rate).toFixed(2);
      const scenarioName =
        scenarioTitleById.get(log.scenarioId) ?? scenario.title ?? 'Savings Plan';
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

  return (
    <section id="ledger" className="py-12 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide mb-2">
              <BookOpenCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>Saved Plans &amp; Weekly Check-Ins</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Save your scenarios and track every peso set aside.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              Sign in with Google to store multiple savings plans and log real weekly deposits
              toward your {formatPeso(requiredDownPayment, false, currency)} down payment target.
            </p>
          </div>

          {feedback && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{feedback}</span>
            </div>
          )}
        </div>

        {actionError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2.5 px-4 py-3 text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        {!user ? (
          <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
            <div className="max-w-xl">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Sign in to save your plans and weekly peso deposits
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                Your saved scenarios and weekly contribution history sync privately to your
                account database so you can adjust your targets or log deposits anytime.
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In with Google
            </button>
          </div>
        ) : !user.emailVerified ? (
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 text-sm text-amber-900 dark:text-amber-200">
            Your sign-in provider did not supply a verified email address (for example, a hidden
            or unverified relay). Please sign in with a verified Google account to enable private
            cloud saves.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Saved Scenarios Manager */}
              <div className="lg:col-span-5 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Saved Scenarios ({savedScenarios.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Save the current slider setup or switch between saved goals.
                  </p>
                </div>

                <form onSubmit={handleSaveNew} className="space-y-3">
                  <label
                    htmlFor="plan-title"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Plan Name
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="plan-title"
                      type="text"
                      maxLength={80}
                      value={planTitle}
                      onChange={(e) => setPlanTitle(e.target.value)}
                      placeholder="e.g. O'Connor's Condo ₱300/wk"
                      className="flex-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400"
                    />
                    <button
                      type="submit"
                      disabled={busyAction === 'save-new'}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{busyAction === 'save-new' ? 'Saving…' : 'Save as New'}</span>
                    </button>
                  </div>

                  {activeScenarioId && (
                    <button
                      type="button"
                      onClick={handleUpdateCurrent}
                      disabled={busyAction === 'update-active'}
                      className="w-full py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {busyAction === 'update-active'
                        ? 'Updating…'
                        : 'Update Selected Plan with Current Sliders'}
                    </button>
                  )}
                </form>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  {savedScenarios.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                      No saved scenarios yet. Save your current sliders above to keep them in your
                      database.
                    </p>
                  ) : (
                    savedScenarios.map((item) => {
                      const isActive = item.id === activeScenarioId;
                      const confirming = confirmDeleteScenarioId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                            isActive
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/50 border-emerald-600 dark:border-emerald-500'
                              : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectScenario(item);
                              setPlanTitle(item.title);
                              setDepositAmount(item.weeklySavings);
                            }}
                            className="flex-1 text-left cursor-pointer min-w-0"
                          >
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {item.title}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 tabular-nums">
                              {formatPeso(item.weeklySavings, false, currency)}/wk · Rent{' '}
                              {formatPeso(item.monthlyRent, false, currency)}/mo
                            </div>
                          </button>

                          {confirming ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={busyAction === `del-scen-${item.id}`}
                                onClick={() => handleConfirmDeleteScenario(item.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteScenarioId(null)}
                                className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Delete scenario ${item.title}`}
                              onClick={() => setConfirmDeleteScenarioId(item.id)}
                              className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: Weekly Deposit Tracker & Down Payment Progress */}
              <div className="lg:col-span-7 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xs">
                <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Down Payment Progress Tracker
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Starting balance + actual logged weekly deposits
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                        {formatPeso(totalSavedWithInitial, false, currency)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {' '}
                        / {formatPeso(requiredDownPayment, false, currency)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-300"
                      style={{ width: `${downPaymentProgressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
                    <span>{downPaymentProgressPct.toFixed(1)}% of down payment saved</span>
                    <span>{savingsLogs.length} weekly check-ins logged</span>
                  </div>
                </div>

                {/* Log New Weekly Deposit Form */}
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
                      Week Date (Local)
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
                      placeholder="Skipped delivery"
                      className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={busyAction === 'log-deposit'}
                      className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{busyAction === 'log-deposit' ? 'Saving…' : 'Log'}</span>
                    </button>
                  </div>
                </form>

                {/* Savings Growth Line Chart (Recharts) */}
                <div className="p-4 bg-slate-50/80 dark:bg-slate-800/45 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3 min-w-0">
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
                        <span
                          className="inline-block w-2.5 h-0.5 bg-emerald-500"
                          aria-hidden="true"
                        />
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
                    <div className="h-[180px] flex items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400 px-4">
                      Log your first weekly deposit above to chart your cumulative peso growth over
                      time.
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
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                      Logged Contributions ({savingsLogs.length}) · Total{' '}
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatPeso(totalLogged, false, currency)}
                      </span>
                    </div>
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
                      <span>Export Data (CSV)</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {savingsLogs.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No weekly deposits logged yet. Log your first peso deposit above to start
                        tracking your real progress.
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
                                <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 max-w-[220px] truncate">
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
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Account &amp; Data Control
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Permanently remove your FinSight profile, saved scenarios, and all deposit logs.
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
