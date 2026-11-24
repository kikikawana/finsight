import { useEffect, useId, useRef } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2 } from 'lucide-react';
import {
  formatDurationMonths,
  formatPeso,
  formatWeeksDuration,
  type CurrencyCode,
} from '../utils/financeMath';

interface GoalProgressRingProps {
  goalTitle: string;
  categoryLabel: string;
  currentSaved: number;
  targetAmount: number;
  weeklySavings: number;
  savingsPercent: number;
  weeksCash: number;
  monthsInvested: number | null;
  targetDateLabel: string;
  currency: CurrencyCode;
  authLoading?: boolean;
  celebrationOwnerKey?: string;
  onCustomize?: () => void;
}

let celebratedGoalOwner: string | null = null;
const CONFETTI_COLORS = ['#10b981', '#14b8a6', '#34d399', '#f59e0b', '#fbbf24'];

export function GoalProgressRing({
  goalTitle,
  categoryLabel,
  currentSaved,
  targetAmount,
  weeklySavings,
  savingsPercent,
  weeksCash,
  monthsInvested,
  targetDateLabel,
  currency,
  authLoading = false,
  celebrationOwnerKey = 'guest',
  onCustomize,
}: GoalProgressRingProps) {
  const ringContainerRef = useRef<HTMLDivElement | null>(null);
  const rawUid = useId();
  const safeUid = rawUid.replace(/:/g, '');
  const gradId = `finsight-ring-grad-${safeUid}`;
  const glowId = `finsight-ring-glow-${safeUid}`;

  const safeTarget = Math.max(500, targetAmount);
  const safeSaved = Math.max(0, currentSaved);
  const progressPct = Math.min(100, (safeSaved / safeTarget) * 100);
  const remaining = Math.max(0, safeTarget - safeSaved);
  const isGoalReached = progressPct >= 100;

  const size = 180;
  const center = size / 2;
  const radius = 72;
  const strokeWidth = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressPct / 100);

  const formattedPct =
    progressPct >= 100
      ? '100%'
      : progressPct >= 10
        ? `${progressPct.toFixed(0)}%`
        : `${progressPct.toFixed(1)}%`;

  useEffect(() => {
    if (authLoading) return;

    if (!isGoalReached) {
      if (celebratedGoalOwner === celebrationOwnerKey) {
        celebratedGoalOwner = null;
      }
      return;
    }

    if (celebratedGoalOwner === celebrationOwnerKey) return;
    celebratedGoalOwner = celebrationOwnerKey;

    if (
      typeof window === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const rect = ringContainerRef.current?.getBoundingClientRect();
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
  }, [authLoading, isGoalReached, celebrationOwnerKey]);

  const cleanTitle = goalTitle.trim() || 'My Savings Goal';

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* Visual SVG Progress Ring */}
      <div
        ref={ringContainerRef}
        className="relative w-44 h-44 shrink-0 flex items-center justify-center"
      >
        <div
          aria-hidden="true"
          className="absolute inset-3 rounded-full bg-radial from-emerald-500/10 via-transparent to-transparent dark:from-emerald-400/12 pointer-events-none"
        />
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-44 h-44 -rotate-90 drop-shadow-[0_4px_12px_rgba(16,185,129,0.14)]"
          role="img"
          aria-label={`Savings goal progress: ${progressPct.toFixed(1)}% toward ${cleanTitle}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#047857" />
              <stop offset="55%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#10b981" floodOpacity="0.32" />
            </filter>
          </defs>

          {/* Background Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-stone-200/80 dark:stroke-slate-800"
          />

          {/* Subtle Inner Hairline Ring */}
          <circle
            cx={center}
            cy={center}
            r={radius - strokeWidth / 2 - 4}
            fill="none"
            strokeWidth={1}
            className="stroke-stone-200/60 dark:stroke-slate-800/80"
          />

          {/* Quarter Ticks */}
          {[0, 90, 180, 270].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const innerR = radius - strokeWidth / 2 - 2;
            const outerR = radius + strokeWidth / 2 + 2;
            return (
              <line
                key={deg}
                x1={center + innerR * Math.cos(rad)}
                y1={center + innerR * Math.sin(rad)}
                x2={center + outerR * Math.cos(rad)}
                y2={center + outerR * Math.sin(rad)}
                strokeWidth="1.5"
                className="stroke-stone-300/80 dark:stroke-slate-700/85"
              />
            );
          })}

          {/* Emerald-to-Gold Luminous Progress Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            filter={`url(#${glowId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <span className="text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50 tabular-nums leading-none">
            {formattedPct}
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            {isGoalReached && <CheckCircle2 className="w-3 h-3 text-amber-500" aria-hidden="true" />}
            <span>{isGoalReached ? 'Goal Reached' : 'of Target'}</span>
          </span>
          <span className="mt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            {isGoalReached ? 'Funded' : formatWeeksDuration(weeksCash)}
          </span>
        </div>
      </div>

      {/* Goal Details & Time-to-Goal Estimate */}
      <div className="flex-1 text-center sm:text-left space-y-3.5 min-w-0">
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[240px]">
              {cleanTitle}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{categoryLabel}</span>
          </div>

          <h2 className="text-2xl sm:text-[26px] font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatPeso(safeSaved, false, currency)}{' '}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 font-sans">
              / {formatPeso(safeTarget, false, currency)}
            </span>
          </h2>

          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 tabular-nums">
            {remaining > 0
              ? `${formatPeso(remaining, false, currency)} remaining`
              : `You reached 100% of your ${cleanTitle} target.`}
          </p>
        </div>

        {/* Hairline-Divided Time-to-Goal Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 border border-stone-200/90 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-stone-200/90 dark:divide-slate-800 text-left bg-stone-50/90 dark:bg-slate-950/60">
          <div className="px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Time-to-Goal (Cash Pace)
            </div>
            <div className="text-sm font-display font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {formatWeeksDuration(weeksCash)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              {formatPeso(weeklySavings, false, currency)}/wk ({savingsPercent}% split)
            </div>
          </div>

          <div className="px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Estimated Target Date
            </div>
            <div className="text-sm font-display font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
              {targetDateLabel}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              {monthsInvested === 0
                ? 'Target funded'
                : `With growth: ${formatDurationMonths(monthsInvested)}`}
            </div>
          </div>
        </div>

        {onCustomize && (
          <div className="flex items-center justify-center sm:justify-start">
            <button
              type="button"
              onClick={onCustomize}
              className="group inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <span>Adjust Goal, Target &amp; Split %</span>
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-150 group-hover:translate-x-0.5"
              >
                →
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
