import { useEffect, useId, useState } from 'react';
import { ArrowLeft, Award, CalendarCheck2, CheckCircle2, Lock, Moon, Sun } from 'lucide-react';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import { GOAL_CATEGORY_LABELS } from '../data/goalPresets';
import { MILESTONE_DEFINITIONS } from '../data/milestones';
import { getSharedReport } from '../services/firestoreService';
import type { SharedProgressReport } from '../types/finance';
import { computeRemainingGoalEta, formatPeso, formatWeeksDuration } from '../utils/financeMath';
import { FinSightLogo } from './FinSightLogo';
import { MilestoneBadgeSvg } from './MilestoneBadgeSvg';

interface PublicReportPageProps {
  shareId: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onExitToApp: () => void;
}

export function PublicReportPage({
  shareId,
  theme,
  onToggleTheme,
  onExitToApp,
}: PublicReportPageProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `public-ring-grad-${uid}`;

  const [report, setReport] = useState<SharedProgressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorText(null);

    getSharedReport(shareId)
      .then((res) => {
        if (cancelled) return;
        setReport(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorText(
          err instanceof Error
            ? err.message
            : 'Unable to load this progress report right now.'
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const safeTarget = report ? Math.max(500, report.goalTargetAmount) : 50000;
  const safeSaved = report ? Math.max(0, report.currentSaved) : 0;
  const progressPct = report ? Math.min(100, (safeSaved / safeTarget) * 100) : 0;
  const isGoalReached = progressPct >= 100;

  const size = 192;
  const center = size / 2;
  const radius = 76;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressPct / 100);

  const eta = report
    ? computeRemainingGoalEta(
        safeSaved,
        safeTarget,
        report.weeklySavings,
        report.benchmarkId
      )
    : null;

  const unlockedSet = new Set(report?.unlockedMilestoneIds ?? []);

  return (
    <div className="min-h-screen flex flex-col finsight-ambient-bg text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 bg-white/88 dark:bg-[#090d0b]/88 backdrop-blur-md border-b border-stone-200/85 dark:border-slate-800/85">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={onExitToApp}
            className="inline-flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <FinSightLogo className="w-7 h-7 shrink-0" />
            <span>FinSight</span>
          </button>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-slate-600 dark:text-slate-300 bg-stone-100 dark:bg-slate-800/90 hover:bg-stone-200/80 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onExitToApp}
              className="finsight-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer whitespace-nowrap"
            >
              <span>Create Your Own Goal</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 py-10 sm:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="finsight-surface bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-2xl p-8 space-y-6 animate-pulse">
              <div className="h-5 w-40 bg-stone-200 dark:bg-slate-800 rounded" />
              <div className="h-10 w-80 bg-stone-200 dark:bg-slate-800 rounded" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="h-28 bg-stone-100 dark:bg-slate-800/60 rounded-xl" />
                <div className="h-28 bg-stone-100 dark:bg-slate-800/60 rounded-xl" />
                <div className="h-28 bg-stone-100 dark:bg-slate-800/60 rounded-xl" />
              </div>
            </div>
          ) : errorText || !report ? (
            <div className="finsight-surface max-w-xl mx-auto bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400">
                <Lock className="w-5 h-5" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                This progress link is unavailable or was revoked
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {errorText ||
                  'The owner may have deleted this shared snapshot or the link is invalid.'}
              </p>
              <button
                type="button"
                onClick={onExitToApp}
                className="finsight-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Go to FinSight</span>
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Showcase Hero Card */}
              <div className="finsight-obsidian-card rounded-2xl p-6 sm:p-8 text-white">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  {/* Progress Ring */}
                  <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
                    <svg
                      viewBox={`0 0 ${size} ${size}`}
                      className="w-48 h-48 -rotate-90"
                      role="img"
                      aria-label={`${progressPct.toFixed(1)}% of ${report.goalTitle} funded`}
                    >
                      <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="60%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#fbbf24" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        strokeWidth={strokeWidth}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke={`url(#${gradId})`}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                      <span className="text-4xl font-display font-bold tabular-nums text-white leading-none">
                        {progressPct >= 100
                          ? '100%'
                          : progressPct >= 10
                            ? `${progressPct.toFixed(0)}%`
                            : `${progressPct.toFixed(1)}%`}
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                        {isGoalReached && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                        )}
                        <span>{isGoalReached ? 'Goal Funded' : 'Goal Funded'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Showcase Summary */}
                  <div className="flex-1 text-center md:text-left space-y-4 min-w-0">
                    <div>
                      <div className="text-xs font-medium text-emerald-200/80">
                        {report.authorName}&apos;s Savings Showcase ·{' '}
                        {GOAL_CATEGORY_LABELS[report.goalCategory]} ·{' '}
                        {BENCHMARK_DATASETS[report.benchmarkId]?.shortName ?? 'Index Plan'}
                      </div>
                      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mt-1 text-balance">
                        {report.goalTitle}
                      </h1>
                      <p className="text-sm text-emerald-100/85 mt-1.5 tabular-nums">
                        {report.showExactAmounts
                          ? `${formatPeso(safeSaved, false, report.currency)} saved toward a ${formatPeso(safeTarget, false, report.currency)} target`
                          : `Saving ${report.savingsPercent}% of income · Exact amounts kept private by ${report.authorName}`}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 border border-white/15 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-white/15 bg-black/25 text-left">
                      <div className="px-4 py-3">
                        <div className="text-[11px] text-emerald-100/70">Savings Commitment</div>
                        <div className="text-base font-display font-bold text-emerald-300 tabular-nums mt-0.5">
                          {report.showExactAmounts
                            ? `${formatPeso(report.weeklySavings, false, report.currency)}/wk`
                            : `${report.savingsPercent}% split`}
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <div className="text-[11px] text-emerald-100/70">Estimated Pace</div>
                        <div className="text-base font-display font-bold text-white tabular-nums mt-0.5">
                          {eta ? formatWeeksDuration(eta.weeksCash) : 'On track'}
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <div className="text-[11px] text-emerald-100/70">Check-Ins Logged</div>
                        <div className="text-base font-display font-bold text-amber-300 tabular-nums mt-0.5 inline-flex items-center gap-1.5">
                          <CalendarCheck2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>
                            {report.depositsCount}{' '}
                            {report.depositsCount === 1 ? 'deposit' : 'deposits'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Milestone Achievements */}
              <div className="finsight-surface bg-white dark:bg-slate-900/95 border border-stone-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      Unlocked Savings Milestones
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Earned through consistent real deposits and goal thresholds.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    <Award className="w-4 h-4 text-amber-500" aria-hidden="true" />
                    <span>
                      {report.earnedBadgesCount} / {report.totalBadgesCount} badges unlocked
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {MILESTONE_DEFINITIONS.map((def) => {
                    const unlocked = unlockedSet.has(def.id);
                    return (
                      <div
                        key={def.id}
                        className={`rounded-xl border p-4 flex flex-col justify-between ${
                          unlocked
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-700/70'
                            : 'bg-stone-50/70 dark:bg-slate-950/40 border-stone-200 dark:border-slate-800 opacity-75'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <MilestoneBadgeSvg
                            id={def.id}
                            unlocked={unlocked}
                            className="w-12 h-12 shrink-0"
                          />
                          <span
                            className={`text-[11px] font-semibold ${
                              unlocked
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {unlocked ? 'Unlocked' : 'Locked'}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {def.title}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {def.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onExitToApp}
                  className="finsight-btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white rounded-xl cursor-pointer"
                >
                  <span>Start Tracking Your Own Savings Goal in FinSight</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
