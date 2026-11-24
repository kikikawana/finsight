import { useEffect, useId, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  LogIn,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { GOAL_CATEGORY_LABELS } from '../data/goalPresets';
import type {
  CurrencyCode,
  MilestoneProgress,
  ScenarioInput,
  SharedProgressReport,
  SharedProgressReportInput,
} from '../types/finance';
import { formatPeso } from '../utils/financeMath';

interface ShareReportModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  isOnline: boolean;
  scenario: ScenarioInput;
  currency: CurrencyCode;
  currentSaved: number;
  depositsCount: number;
  milestoneItems: MilestoneProgress[];
  earnedBadgesCount: number;
  userSharedReports: SharedProgressReport[];
  onSignIn: () => void;
  onCreateShareReport: (
    input: SharedProgressReportInput,
    idempotencyShareId?: string
  ) => Promise<string>;
  onUpdateShareReport: (shareId: string, input: SharedProgressReportInput) => Promise<void>;
  onDeleteShareReport: (shareId: string) => Promise<void>;
  onPreviewReport: (shareId: string) => void;
}

function makeShareIdCandidate(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 24)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 10)}`;
  const id = `rep_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
  return id.length >= 16 ? id.slice(0, 40) : id.padEnd(20, '0');
}

function formatShareUrl(shareId: string): string {
  if (typeof window === 'undefined') return `?report=${shareId}`;
  return `${window.location.origin}/?report=${encodeURIComponent(shareId)}`;
}

export function ShareReportModal({
  open,
  onClose,
  user,
  isOnline,
  scenario,
  currency,
  currentSaved,
  depositsCount,
  milestoneItems,
  earnedBadgesCount,
  userSharedReports,
  onSignIn,
  onCreateShareReport,
  onUpdateShareReport,
  onDeleteShareReport,
  onPreviewReport,
}: ShareReportModalProps) {
  const titleId = useId();
  const defaultAuthor = (user?.displayName || user?.email?.split('@')[0] || 'FinSight Saver')
    .trim()
    .slice(0, 48);

  const [authorName, setAuthorName] = useState(defaultAuthor);
  const [showExactAmounts, setShowExactAmounts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createdShareId, setCreatedShareId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pendingShareIdRef = useRef<string | null>(null);
  const mutexRef = useRef(false);

  useEffect(() => {
    if (open) {
      setAuthorName(
        (user?.displayName || user?.email?.split('@')[0] || 'FinSight Saver')
          .trim()
          .slice(0, 48)
      );
      setErrorMsg(null);
    }
  }, [open, user?.displayName, user?.email]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const isVerified = Boolean(user && user.emailVerified);
  const targetAmount = Math.max(500, scenario.goalTargetAmount);
  const pctFunded = Math.min(100, Math.round((Math.max(0, currentSaved) / targetAmount) * 100));
  const unlockedMilestoneIds = milestoneItems
    .filter((m) => m.unlocked)
    .map((m) => m.definition.id);

  const buildPayload = (): SharedProgressReportInput => ({
    authorName: authorName.trim().slice(0, 48) || 'FinSight Saver',
    goalTitle: scenario.title.trim().slice(0, 80) || 'My Savings Goal',
    goalCategory: scenario.goalCategory,
    goalTargetAmount: targetAmount,
    currentSaved: Math.max(0, Math.round(currentSaved)),
    weeklySavings: Math.max(1, Math.round(scenario.weeklySavings)),
    savingsPercent: Math.min(95, Math.max(1, Math.round(scenario.savingsPercent))),
    currency,
    benchmarkId: scenario.benchmarkId,
    earnedBadgesCount,
    totalBadgesCount: milestoneItems.length,
    unlockedMilestoneIds,
    depositsCount,
    showExactAmounts,
  });

  const handleCopyLink = async (shareId: string) => {
    const url = formatShareUrl(shareId);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const temp = document.createElement('textarea');
        temp.value = url;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      setCopiedId(shareId);
      setTimeout(() => setCopiedId((prev) => (prev === shareId ? null : prev)), 2500);
    } catch {
      setErrorMsg('Copy permission denied by browser. Please select and copy the link manually.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerified || mutexRef.current) return;
    if (!isOnline) {
      setErrorMsg('You are offline. Reconnect to generate a public share link.');
      return;
    }

    mutexRef.current = true;
    setBusy(true);
    setErrorMsg(null);
    if (!pendingShareIdRef.current) {
      pendingShareIdRef.current = makeShareIdCandidate();
    }

    try {
      const shareId = await onCreateShareReport(buildPayload(), pendingShareIdRef.current);
      pendingShareIdRef.current = null;
      setCreatedShareId(shareId);
      await handleCopyLink(shareId);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to generate share link. Please try again.'
      );
    } finally {
      mutexRef.current = false;
      setBusy(false);
    }
  };

  const handleRefresh = async (report: SharedProgressReport) => {
    if (!isVerified || refreshingId || !isOnline) return;
    setRefreshingId(report.id);
    setErrorMsg(null);
    try {
      await onUpdateShareReport(report.id, {
        ...buildPayload(),
        authorName: authorName.trim().slice(0, 48) || report.authorName,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not refresh shared snapshot.');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRevoke = async (shareId: string) => {
    if (!isVerified || deletingId || !isOnline) return;
    setDeletingId(shareId);
    setErrorMsg(null);
    try {
      await onDeleteShareReport(shareId);
      if (createdShareId === shareId) {
        setCreatedShareId(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not revoke share link.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              <Share2 className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                Share Progress Showcase Link
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Generate a read-only link for friends or family — your email, income, and private notes are never shared.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!isVerified ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Sign in with Google to generate a persistent public link
              </h3>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                Public progress showcase links are hosted securely so friends and family can open them from any device, and so only you can update or revoke them later.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="finsight-btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign In with Google</span>
              </button>
            </div>
          ) : (
            <>
              {/* Live Public Snapshot Preview */}
              <div className="finsight-obsidian-card rounded-xl p-5 text-white space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-200/80">
                  <span>
                    Public Preview · {GOAL_CATEGORY_LABELS[scenario.goalCategory]}
                  </span>
                  <span className="font-mono tabular-nums">
                    {earnedBadgesCount}/{milestoneItems.length} badges · {depositsCount}{' '}
                    {depositsCount === 1 ? 'deposit' : 'deposits'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <div className="text-xs text-emerald-100/75">
                      {authorName.trim() || 'FinSight Saver'}&apos;s Goal Progress
                    </div>
                    <div className="text-xl font-display font-bold text-white mt-0.5">
                      {scenario.title.trim() || 'My Savings Goal'}
                    </div>
                  </div>
                  <div className="sm:text-right tabular-nums">
                    <div className="text-2xl font-display font-bold text-emerald-300">
                      {pctFunded}% Funded
                    </div>
                    <div className="text-xs text-emerald-100/80 font-mono">
                      {showExactAmounts
                        ? `${formatPeso(currentSaved, false, currency)} of ${formatPeso(targetAmount, false, currency)}`
                        : 'Exact peso amounts hidden'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Controls */}
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                  <div className="sm:col-span-7">
                    <label
                      htmlFor="share-author-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Display Name on Public Card
                    </label>
                    <input
                      id="share-author-name"
                      type="text"
                      required
                      maxLength={48}
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder="e.g. Marco R."
                      className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <button
                      type="button"
                      onClick={() => setShowExactAmounts((prev) => !prev)}
                      className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-emerald-500/60 transition-colors cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {showExactAmounts ? (
                          <Eye className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                        )}
                        <span>{showExactAmounts ? 'Showing exact amounts' : 'Percentages only'}</span>
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        Toggle
                      </span>
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                    {errorMsg}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="submit"
                    disabled={busy || !isOnline}
                    className="finsight-btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white rounded-lg disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    <Link2 className="w-4 h-4" aria-hidden="true" />
                    <span>{busy ? 'Generating Link…' : 'Create Unique Share Link'}</span>
                  </button>

                  {createdShareId && (
                    <button
                      type="button"
                      onClick={() => onPreviewReport(createdShareId)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Preview Showcase</span>
                    </button>
                  )}
                </div>
              </form>

              {createdShareId && (
                <div className="p-3.5 rounded-xl bg-emerald-50/75 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    Share Link Ready
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      aria-label="Generated public progress link"
                      value={formatShareUrl(createdShareId)}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-800 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyLink(createdShareId)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedId === createdShareId ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Active Shared Links Management */}
              <div className="pt-4 border-t border-stone-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Your Active Shared Links ({userSharedReports.length})
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Revoke anytime to disable public viewing
                  </span>
                </div>

                {userSharedReports.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    No active share links yet. Create one above to showcase your progress.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 dark:divide-slate-800 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {userSharedReports.map((rep) => {
                      const repPct = Math.min(
                        100,
                        Math.round((rep.currentSaved / Math.max(500, rep.goalTargetAmount)) * 100)
                      );
                      return (
                        <div
                          key={rep.id}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-950/60"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {rep.goalTitle}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                              {rep.authorName} · {repPct}% funded · {rep.earnedBadgesCount}/
                              {rep.totalBadgesCount} badges ·{' '}
                              {rep.showExactAmounts ? 'Amounts visible' : 'Percentages only'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(rep.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 rounded-md cursor-pointer whitespace-nowrap"
                            >
                              {copiedId === rep.id ? (
                                <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                              ) : (
                                <Copy className="w-3 h-3" aria-hidden="true" />
                              )}
                              <span>{copiedId === rep.id ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewReport(rep.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3 h-3" aria-hidden="true" />
                              <span>Preview</span>
                            </button>
                            <button
                              type="button"
                              disabled={refreshingId === rep.id || !isOnline}
                              onClick={() => handleRefresh(rep)}
                              title="Sync latest goal progress and badges into this link"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-stone-100 dark:bg-slate-800 hover:bg-stone-200 dark:hover:bg-slate-700 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${refreshingId === rep.id ? 'animate-spin' : ''}`}
                                aria-hidden="true"
                              />
                              <span>Sync</span>
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === rep.id || !isOnline}
                              onClick={() => handleRevoke(rep.id)}
                              aria-label={`Revoke share link for ${rep.goalTitle}`}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md disabled:opacity-50 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
