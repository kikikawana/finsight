import type {
  MilestoneAward,
  MilestoneDefinition,
  MilestoneId,
  MilestoneProgress,
  SavingsLog,
  ScenarioInput,
} from '../types/finance';
import { formatPeso, type CurrencyCode } from '../utils/financeMath';

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    id: 'first_deposit',
    title: 'First Step Taken',
    description: 'Log your very first weekly peso deposit into your FinSight ledger.',
    category: 'Consistency',
    targetLabel: '1 deposit',
  },
  {
    id: 'first_1000_php',
    title: 'First 1,000 Pesos Saved',
    description: 'Reach ₱1,000 in total logged weekly contributions.',
    category: 'Amount',
    targetLabel: '₱1,000 saved',
  },
  {
    id: 'first_month_consistency',
    title: 'First Month of Consistency',
    description: 'Record deposits across 4 distinct calendar weeks.',
    category: 'Consistency',
    targetLabel: '4 weeks',
  },
  {
    id: 'first_10000_php',
    title: '₱10,000 Starter Fund',
    description: 'Accumulate ₱10,000 in logged weekly deposits.',
    category: 'Amount',
    targetLabel: '₱10,000 saved',
  },
  {
    id: 'quarter_year_habit',
    title: '12-Week Market Habit',
    description: 'Stay consistent for 12 distinct weeks—one full market quarter.',
    category: 'Consistency',
    targetLabel: '12 weeks',
  },
  {
    id: 'down_payment_25',
    title: '25% to Down Payment',
    description: 'Fund one-quarter of your target home down payment.',
    category: 'Housing',
    targetLabel: '25% funded',
  },
  {
    id: 'down_payment_50',
    title: 'Halfway to Keys',
    description: 'Reach 50% of the down payment needed to turn rent into equity.',
    category: 'Housing',
    targetLabel: '50% funded',
  },
  {
    id: 'down_payment_100',
    title: 'Down Payment Funded',
    description: 'Hit 100% of your target down payment goal.',
    category: 'Housing',
    targetLabel: '100% funded',
  },
];

/**
 * Computes ISO week key (YYYY-Www) from YYYY-MM-DD in a timezone-independent way.
 */
export function getIsoWeekKey(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return isoDate;
  }
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function countDistinctWeeks(logs: SavingsLog[]): number {
  const weeks = new Set<string>();
  for (const log of logs) {
    if (log.weekDate) {
      weeks.add(getIsoWeekKey(log.weekDate));
    }
  }
  return weeks.size;
}

export function evaluateMilestones(
  logs: SavingsLog[],
  scenario: ScenarioInput,
  persistedAwards: MilestoneAward[],
  currency: CurrencyCode = 'PHP'
): {
  items: MilestoneProgress[];
  newlyUnlocked: Array<{ milestoneId: MilestoneId; title: string; achievedValue: number }>;
  earnedCount: number;
} {
  const logsCount = logs.length;
  const totalLogged = logs.reduce((sum, l) => sum + l.amount, 0);
  const distinctWeeks = countDistinctWeeks(logs);
  const requiredDownPayment = Math.max(
    1,
    (scenario.targetHomePrice * scenario.downPaymentPercent) / 100
  );
  const totalWithInitial = scenario.initialDeposit + totalLogged;

  const awardMap = new Map<MilestoneId, MilestoneAward>();
  for (const award of persistedAwards) {
    awardMap.set(award.milestoneId, award);
  }

  const newlyUnlocked: Array<{
    milestoneId: MilestoneId;
    title: string;
    achievedValue: number;
  }> = [];

  const items: MilestoneProgress[] = MILESTONE_DEFINITIONS.map((def) => {
    let currentValue = 0;
    let targetValue = 1;
    let conditionMet = false;
    let progressText = '';

    switch (def.id) {
      case 'first_deposit':
        currentValue = logsCount;
        targetValue = 1;
        conditionMet = logsCount >= 1;
        progressText = `${Math.min(logsCount, 1)} / 1 deposit`;
        break;
      case 'first_1000_php':
        currentValue = totalLogged;
        targetValue = 1000;
        conditionMet = totalLogged >= 1000;
        progressText = `${formatPeso(Math.min(totalLogged, 1000), false, currency)} / ${formatPeso(1000, false, currency)}`;
        break;
      case 'first_month_consistency':
        currentValue = distinctWeeks;
        targetValue = 4;
        conditionMet = distinctWeeks >= 4;
        progressText = `${Math.min(distinctWeeks, 4)} / 4 weeks`;
        break;
      case 'first_10000_php':
        currentValue = totalLogged;
        targetValue = 10000;
        conditionMet = totalLogged >= 10000;
        progressText = `${formatPeso(Math.min(totalLogged, 10000), false, currency)} / ${formatPeso(10000, false, currency)}`;
        break;
      case 'quarter_year_habit':
        currentValue = distinctWeeks;
        targetValue = 12;
        conditionMet = distinctWeeks >= 12;
        progressText = `${Math.min(distinctWeeks, 12)} / 12 weeks`;
        break;
      case 'down_payment_25': {
        const threshold = requiredDownPayment * 0.25;
        currentValue = logsCount > 0 ? totalWithInitial : 0;
        targetValue = threshold;
        conditionMet = logsCount >= 1 && totalWithInitial >= threshold;
        progressText = `${Math.min(100, Math.round((currentValue / threshold) * 100))}% of 25% goal`;
        break;
      }
      case 'down_payment_50': {
        const threshold = requiredDownPayment * 0.5;
        currentValue = logsCount > 0 ? totalWithInitial : 0;
        targetValue = threshold;
        conditionMet = logsCount >= 1 && totalWithInitial >= threshold;
        progressText = `${Math.min(100, Math.round((currentValue / threshold) * 100))}% of 50% goal`;
        break;
      }
      case 'down_payment_100': {
        const threshold = requiredDownPayment;
        currentValue = logsCount > 0 ? totalWithInitial : 0;
        targetValue = threshold;
        conditionMet = logsCount >= 1 && totalWithInitial >= threshold;
        progressText = `${Math.min(100, Math.round((currentValue / threshold) * 100))}% funded`;
        break;
      }
    }

    const persisted = awardMap.get(def.id);
    const unlocked = Boolean(persisted) || conditionMet;
    const progressPct = unlocked
      ? 100
      : Math.min(99, Math.max(0, (currentValue / Math.max(1, targetValue)) * 100));

    if (conditionMet && !persisted) {
      newlyUnlocked.push({
        milestoneId: def.id,
        title: def.title,
        achievedValue: Math.round(currentValue),
      });
    }

    return {
      definition: def,
      unlocked,
      unlockedDate: persisted?.unlockedDate,
      currentValue,
      targetValue,
      progressPct,
      progressText,
    };
  });

  const earnedCount = items.filter((item) => item.unlocked).length;
  return { items, newlyUnlocked, earnedCount };
}
