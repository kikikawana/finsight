import type { GoalCategory, IncomeCadence, ScenarioInput } from '../types/finance';

export interface GoalPreset {
  id: string;
  shortLabel: string;
  audienceTag: string;
  description: string;
  scenario: Omit<ScenarioInput, 'benchmarkId'>;
}

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  motorcycle: 'Vehicle',
  student: 'Student & Tuition',
  emergency: 'Emergency Safety Net',
  gadget: 'Laptop & Tech',
  business: 'Side Hustle',
  travel: 'Travel & Experience',
  custom: 'Custom Goal',
};

export interface SplitPreset {
  id: string;
  label: string;
  subtitle: string;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
}

export const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: 'balanced-50-30-20',
    label: '50 / 30 / 20 Classic',
    subtitle: '50% Needs · 30% Wants · 20% Save',
    needsPercent: 50,
    wantsPercent: 30,
    savingsPercent: 20,
  },
  {
    id: 'student-60-20-20',
    label: 'Student 60 / 20 / 20',
    subtitle: '60% Essentials · 20% Personal · 20% Save',
    needsPercent: 60,
    wantsPercent: 20,
    savingsPercent: 20,
  },
  {
    id: 'sprint-45-20-35',
    label: 'Fast Save 45 / 20 / 35',
    subtitle: '45% Needs · 20% Wants · 35% Save',
    needsPercent: 45,
    wantsPercent: 20,
    savingsPercent: 35,
  },
  {
    id: 'starter-75-15-10',
    label: 'Starter 75 / 15 / 10',
    subtitle: '75% Needs · 15% Wants · 10% Save',
    needsPercent: 75,
    wantsPercent: 15,
    savingsPercent: 10,
  },
];

export const GOAL_PRESETS: GoalPreset[] = [
  {
    id: 'student-tuition-laptop',
    shortLabel: 'Student Fund',
    audienceTag: 'Student Allowance',
    description: 'Set aside a percentage of your weekly allowance for tuition, books, or a laptop.',
    scenario: {
      title: 'Student Laptop & Tuition Fund',
      goalCategory: 'student',
      goalTargetAmount: 30000,
      incomeAmount: 1500,
      incomeCadence: 'weekly' as IncomeCadence,
      savingsPercent: 20,
      needsPercent: 60,
      wantsPercent: 20,
      weeklySavings: 300,
      initialDeposit: 0,
    },
  },
  {
    id: 'vehicle-fund',
    shortLabel: 'Vehicle',
    audienceTag: 'Personal Savings',
    description: 'Save steadily toward a motorcycle or vehicle at your own pace.',
    scenario: {
      title: 'Vehicle Savings Fund',
      goalCategory: 'motorcycle',
      goalTargetAmount: 95000,
      incomeAmount: 22000,
      incomeCadence: 'monthly' as IncomeCadence,
      savingsPercent: 20,
      needsPercent: 55,
      wantsPercent: 25,
      weeklySavings: 1015,
      initialDeposit: 0,
    },
  },
  {
    id: 'emergency-buffer',
    shortLabel: 'Safety Net',
    audienceTag: 'Everyday Saver',
    description: 'Build a personal emergency cushion one percentage split at a time.',
    scenario: {
      title: 'Emergency Safety Net',
      goalCategory: 'emergency',
      goalTargetAmount: 45000,
      incomeAmount: 20000,
      incomeCadence: 'monthly' as IncomeCadence,
      savingsPercent: 15,
      needsPercent: 60,
      wantsPercent: 25,
      weeklySavings: 692,
      initialDeposit: 0,
    },
  },
];
