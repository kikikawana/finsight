import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Bell, BellRing, CalendarClock, Plus, X } from 'lucide-react';
import type { AppView, SavingsLog, ScenarioInput } from '../types/finance';
import { formatPeso, getLocalISODate, type CurrencyCode } from '../utils/financeMath';

interface WeeklyReminderBannerProps {
  user: User | null;
  authLoading: boolean;
  logsLoaded: boolean;
  activeView: AppView;
  savingsLogs: SavingsLog[];
  scenario: ScenarioInput;
  currency: CurrencyCode;
  onNavigate: (view: AppView) => void;
  onSignIn: () => void;
}

const DISMISS_STORAGE_PREFIX = 'finsight-weekly-reminder-dismissed-v1';
const BROWSER_NOTIF_STORAGE_PREFIX = 'finsight-weekly-browser-notif-v1';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours snooze when user dismisses
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function parseISODateAsUtcMs(isoDate: string): number | null {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function readTimestamp(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeTimestamp(key: string, ts: number): void {
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    // ignore storage restriction
  }
}

export function WeeklyReminderBanner({
  user,
  authLoading,
  logsLoaded,
  activeView,
  savingsLogs,
  scenario,
  currency,
  onNavigate,
  onSignIn,
}: WeeklyReminderBannerProps) {
  const ownerKey = user?.uid ?? 'guest';
  const dismissKey = `${DISMISS_STORAGE_PREFIX}:${ownerKey}`;
  const notifSentKey = `${BROWSER_NOTIF_STORAGE_PREFIX}:${ownerKey}`;

  const [dismissedAt, setDismissedAt] = useState<number>(() => readTimestamp(dismissKey));
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  useEffect(() => {
    setDismissedAt(readTimestamp(dismissKey));
  }, [dismissKey]);

  const status = useMemo(() => {
    const todayIso = getLocalISODate();
    const todayUtcMs = parseISODateAsUtcMs(todayIso) ?? Date.now();

    let latestLogIso: string | null = null;
    let latestLogUtcMs = -Infinity;

    for (const log of savingsLogs) {
      const ms = parseISODateAsUtcMs(log.weekDate);
      if (ms !== null && ms > latestLogUtcMs) {
        latestLogUtcMs = ms;
        latestLogIso = log.weekDate;
      }
    }

    if (latestLogIso === null) {
      return {
        needsReminder: true,
        daysSinceLastLog: null as number | null,
        latestLogIso: null as string | null,
      };
    }

    const diffDays = Math.max(0, Math.floor((todayUtcMs - latestLogUtcMs) / 86_400_000));
    return {
      needsReminder: diffDays >= 7,
      daysSinceLastLog: diffDays,
      latestLogIso,
    };
  }, [savingsLogs]);

  const isCloudVerified = Boolean(user && user.emailVerified);
  const readyToEvaluate = !authLoading && (!isCloudVerified || logsLoaded);
  const isSnoozed = dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  const shouldShowBanner = readyToEvaluate && status.needsReminder && !isSnoozed;

  const cleanGoalTitle = scenario.title.trim() || 'your savings goal';
  const weeklyFormatted = formatPeso(scenario.weeklySavings, false, currency);

  // Fire a gentle local browser notification at most once every 7 days if user already granted permission
  useEffect(() => {
    if (!shouldShowBanner) return;
    if (notifPermission !== 'granted') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const lastNotifiedAt = readTimestamp(notifSentKey);
    if (lastNotifiedAt > 0 && Date.now() - lastNotifiedAt < SEVEN_DAYS_MS) {
      return;
    }

    const bodyText =
      status.daysSinceLastLog === null
        ? `Ready for your weekly check-in? Log ${weeklyFormatted} toward ${cleanGoalTitle}.`
        : `It has been ${status.daysSinceLastLog} days since your last logged deposit. Add this week's ${weeklyFormatted} progress.`;

    try {
      new Notification('FinSight Weekly Savings Reminder', {
        body: bodyText,
        tag: `finsight-weekly-${ownerKey}`,
      });
      writeTimestamp(notifSentKey, Date.now());
    } catch {
      // Some embedded browsers/iframes block Notification constructor even after permission grant
    }
  }, [
    shouldShowBanner,
    notifPermission,
    notifSentKey,
    ownerKey,
    status.daysSinceLastLog,
    weeklyFormatted,
    cleanGoalTitle,
  ]);

  if (!shouldShowBanner) {
    return null;
  }

  const handleDismiss = () => {
    const now = Date.now();
    setDismissedAt(now);
    writeTimestamp(dismissKey, now);
  };

  const handleEnableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        try {
          new Notification('FinSight Reminders Enabled', {
            body: `We will gently remind you here if 7 days pass without a logged deposit for ${cleanGoalTitle}.`,
            tag: `finsight-weekly-enabled-${ownerKey}`,
          });
          writeTimestamp(notifSentKey, Date.now());
        } catch {
          // ignore notification constructor restriction
        }
      }
    } catch {
      // ignore permission prompt error
    }
  };

  const handleLogNow = () => {
    if (!user) {
      onSignIn();
      return;
    }
    if (activeView === 'overview') {
      const inputEl = document.getElementById('quick-log-amount');
      if (inputEl) {
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputEl.focus();
        return;
      }
    }
    onNavigate('ledger');
  };

  const headline =
    status.daysSinceLastLog === null
      ? 'Weekly Check-In Reminder'
      : `${status.daysSinceLastLog} Days Since Last Savings Entry`;

  const description = !user
    ? `Stay on pace with ${weeklyFormatted}/wk toward ${cleanGoalTitle}. Sign in to log this week's deposit and keep your progress ring up to date.`
    : status.daysSinceLastLog === null
      ? `You haven't logged a savings deposit yet. Record this week's ${weeklyFormatted} check-in toward ${cleanGoalTitle} to build your streak.`
      : `Your last deposit was logged on ${status.latestLogIso}. Add this week's ${weeklyFormatted} entry toward ${cleanGoalTitle} to keep your momentum going.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50/90 dark:bg-amber-950/35 border-b border-amber-200/90 dark:border-amber-800/60"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 border border-amber-300/70 dark:border-amber-700/70 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 sm:mt-0">
            <CalendarClock className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 text-xs">
            <span className="font-semibold text-amber-950 dark:text-amber-200 mr-1.5">
              {headline}:
            </span>
            <span className="text-amber-900/90 dark:text-amber-100/85">
              {description}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 pl-9 sm:pl-0">
          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={handleEnableBrowserAlerts}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 bg-white/85 dark:bg-slate-900/80 border border-amber-300/80 dark:border-amber-700/70 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Bell className="w-3 h-3" aria-hidden="true" />
              <span>Browser Alerts</span>
            </button>
          )}

          {notifPermission === 'granted' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              <BellRing className="w-3 h-3" aria-hidden="true" />
              <span>Alerts On</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleLogNow}
            className="finsight-btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-white rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            <span>{user ? 'Log Weekly Savings' : 'Sign In & Log'}</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss weekly reminder for today"
            title="Dismiss for today"
            className="p-1.5 text-amber-800/70 hover:text-amber-950 dark:text-amber-300/75 dark:hover:text-amber-100 rounded-md hover:bg-amber-200/50 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
