import type { User } from 'firebase/auth';
import { Award, CheckCircle2, Lock, Share2 } from 'lucide-react';
import type { MilestoneProgress } from '../types/finance';
import { MilestoneBadgeSvg } from './MilestoneBadgeSvg';

interface MilestonesSectionProps {
  user: User | null;
  items: MilestoneProgress[];
  earnedCount: number;
  recentUnlocks: string[];
  onSignIn: () => void;
  onOpenShareModal?: () => void;
}

export function MilestonesSection({
  user,
  items,
  earnedCount,
  recentUnlocks,
  onSignIn,
  onOpenShareModal,
}: MilestonesSectionProps) {
  const nextMilestone = items.find((m) => !m.unlocked) ?? null;

  return (
    <section
      id="milestones"
      className="py-12 border-b border-slate-200/80 dark:border-slate-800/80 bg-transparent"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              Savings Milestones
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              Unlock badges automatically as your logged deposits pass peso thresholds,
              weekly consistency streaks, and 25%, 50%, and 100% of your active goal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onOpenShareModal && (
              <button
                type="button"
                onClick={onOpenShareModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Share Showcase Link</span>
              </button>
            )}

            {/* Summary Progress Counter */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex items-center gap-5 shrink-0">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Badges Earned</div>
                <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                  {earnedCount}{' '}
                  <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                    / {items.length}
                  </span>
                </div>
              </div>
              {nextMilestone && (
                <div className="pl-5 border-l border-slate-200 dark:border-slate-800 max-w-[220px]">
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Next Badge Up
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                    {nextMilestone.definition.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    {nextMilestone.progressText}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {recentUnlocks.length > 0 && (
          <div
            role="status"
            className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-900 dark:text-emerald-200"
          >
            <CheckCircle2
              className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <span>
              <strong>New Milestone Unlocked:</strong> {recentUnlocks.join(' · ')}
            </span>
          </div>
        )}

        {!user && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 bg-amber-50/90 dark:bg-amber-950/55 border border-amber-200 dark:border-amber-800/70 rounded-2xl">
            <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-100">
              Sign in with Google and log weekly deposits in your Savings Ledger to earn
              and permanently store these milestone badges.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In to Earn Badges
            </button>
          </div>
        )}

        {/* 8-Badge Visual Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item) => {
            const { definition, unlocked, unlockedDate, progressPct, progressText } = item;
            return (
              <div
                key={definition.id}
                className={`finsight-card-interactive rounded-2xl border p-5 flex flex-col justify-between ${
                  unlocked
                    ? 'bg-white dark:bg-slate-900 border-emerald-400 dark:border-emerald-600 shadow-xs'
                    : 'bg-white/80 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <MilestoneBadgeSvg
                      id={definition.id}
                      unlocked={unlocked}
                      className="w-14 h-14 shrink-0"
                    />
                    <div className="text-right text-[11px] font-medium">
                      <span className="text-slate-500 dark:text-slate-400">
                        {definition.category}
                      </span>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        {unlocked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Unlocked</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            <span>Locked</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3
                    className={`text-sm font-semibold ${
                      unlocked
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {definition.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {definition.description}
                  </p>
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1.5">
                    <span
                      className={
                        unlocked
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-300'
                      }
                    >
                      {progressText}
                    </span>
                    {unlocked && unlockedDate ? (
                      <span className="text-slate-400 dark:text-slate-500">{unlockedDate}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        {Math.round(progressPct)}%
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        unlocked
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : 'bg-amber-500 dark:bg-amber-400'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
