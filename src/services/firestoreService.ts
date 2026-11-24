import {
  deleteUser,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type {
  BenchmarkId,
  BudgetBucket,
  BudgetCategory,
  BudgetEntry,
  BudgetEntryInput,
  BudgetEntryStatus,
  CurrencyCode,
  FolderColor,
  GoalCategory,
  GoalFolder,
  IncomeCadence,
  MilestoneAward,
  MilestoneId,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
  SharedProgressReport,
  SharedProgressReportInput,
} from '../types/finance';
import { getLocalISODate } from '../utils/financeMath';

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
const VALID_FOLDER_COLORS: FolderColor[] = ['emerald', 'amber', 'sky', 'rose', 'slate'];
const VALID_CURRENCIES: CurrencyCode[] = ['PHP', 'USD', 'SGD'];
const VALID_MILESTONE_IDS: MilestoneId[] = [
  'first_deposit',
  'first_1000_php',
  'first_month_consistency',
  'first_10000_php',
  'quarter_year_habit',
  'down_payment_25',
  'down_payment_50',
  'down_payment_100',
];
const VALID_BUDGET_BUCKETS: BudgetBucket[] = ['needs', 'wants'];
const VALID_BUDGET_CATEGORIES: BudgetCategory[] = [
  'food',
  'commute',
  'bills',
  'groceries',
  'coffee',
  'personal',
  'other',
];
const VALID_BUDGET_STATUSES: BudgetEntryStatus[] = ['planned', 'spent', 'swept'];

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

function sanitizeFolderId(rawId?: string): string | undefined {
  if (typeof rawId !== 'string') return undefined;
  const trimmed = rawId.trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(trimmed) ? trimmed : undefined;
}

function sanitizeScenarioPayload(input: ScenarioInput) {
  const cleanTitle = input.title.trim().slice(0, 80) || 'My Savings Goal';
  const benchmarkId: BenchmarkId = VALID_BENCHMARKS.includes(input.benchmarkId)
    ? input.benchmarkId
    : 'global60_40';
  const goalCategory: GoalCategory = VALID_CATEGORIES.includes(input.goalCategory)
    ? input.goalCategory
    : 'custom';
  const incomeCadence: IncomeCadence = VALID_CADENCES.includes(input.incomeCadence)
    ? input.incomeCadence
    : 'monthly';

  const savingsPercent = clamp(Math.round(input.savingsPercent), 1, 95);
  const maxRemaining = Math.max(0, 100 - savingsPercent);
  const needsPercent = clamp(Math.round(input.needsPercent), 0, maxRemaining);
  const wantsPercent = clamp(Math.round(input.wantsPercent), 0, Math.max(0, maxRemaining - needsPercent));
  const folderId = sanitizeFolderId(input.folderId);

  return {
    title: cleanTitle,
    goalCategory,
    goalTargetAmount: clamp(Math.round(input.goalTargetAmount), 500, 500000000),
    incomeAmount: clamp(Math.round(input.incomeAmount), 0, 100000000),
    incomeCadence,
    savingsPercent,
    needsPercent,
    wantsPercent,
    weeklySavings: clamp(Math.round(input.weeklySavings), 1, 1000000),
    initialDeposit: clamp(Math.round(input.initialDeposit), 0, 100000000),
    benchmarkId,
    folderId,
  };
}

/**
 * Normalizes any legacy or current Firestore scenario document safely.
 */
function normalizeLoadedScenario(id: string, raw: Record<string, unknown>): SavedScenario {
  const legacyTarget =
    typeof raw.targetHomePrice === 'number' && typeof raw.downPaymentPercent === 'number'
      ? Math.round((raw.targetHomePrice * raw.downPaymentPercent) / 100)
      : 95000;

  return {
    id,
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'My Savings Goal',
    goalCategory: VALID_CATEGORIES.includes(raw.goalCategory as GoalCategory)
      ? (raw.goalCategory as GoalCategory)
      : 'custom',
    goalTargetAmount:
      typeof raw.goalTargetAmount === 'number' && Number.isFinite(raw.goalTargetAmount)
        ? raw.goalTargetAmount
        : legacyTarget,
    incomeAmount:
      typeof raw.incomeAmount === 'number' && Number.isFinite(raw.incomeAmount)
        ? raw.incomeAmount
        : 22000,
    incomeCadence: VALID_CADENCES.includes(raw.incomeCadence as IncomeCadence)
      ? (raw.incomeCadence as IncomeCadence)
      : 'monthly',
    savingsPercent:
      typeof raw.savingsPercent === 'number' && Number.isFinite(raw.savingsPercent)
        ? raw.savingsPercent
        : 20,
    needsPercent:
      typeof raw.needsPercent === 'number' && Number.isFinite(raw.needsPercent)
        ? raw.needsPercent
        : 55,
    wantsPercent:
      typeof raw.wantsPercent === 'number' && Number.isFinite(raw.wantsPercent)
        ? raw.wantsPercent
        : 25,
    weeklySavings:
      typeof raw.weeklySavings === 'number' && Number.isFinite(raw.weeklySavings)
        ? raw.weeklySavings
        : 250,
    initialDeposit:
      typeof raw.initialDeposit === 'number' && Number.isFinite(raw.initialDeposit)
        ? raw.initialDeposit
        : 0,
    benchmarkId: VALID_BENCHMARKS.includes(raw.benchmarkId as BenchmarkId)
      ? (raw.benchmarkId as BenchmarkId)
      : 'global60_40',
    folderId: sanitizeFolderId(typeof raw.folderId === 'string' ? raw.folderId : undefined),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function mapAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  switch (code) {
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network signal lost during sign-in. Reconnect to the internet and try again.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a minute before trying again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email under a different sign-in method.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in with Google before deleting your account.';
    default:
      return error instanceof Error ? error.message : 'Unable to complete authentication.';
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function upsertUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) {
    return;
  }

  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'FinSight Saver')
    .trim()
    .slice(0, 120);
  const normalizedEmail = (user.email || `${user.uid}@private-relay.local`)
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const photoURL = user.photoURL ? user.photoURL.trim().slice(0, 500) : undefined;

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      const createPayload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        email: normalizedEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        createPayload.photoURL = photoURL;
      }
      await setDoc(userRef, createPayload);
    } else {
      const updatePayload: Record<string, unknown> = {
        displayName,
        email: normalizedEmail,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        updatePayload.photoURL = photoURL;
      }
      await updateDoc(userRef, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserScenarios(
  uid: string,
  onData: (scenarios: SavedScenario[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'scenarios';
  const q = query(collection(db, path), where('userId', '==', uid), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SavedScenario[] = snapshot.docs.map((d) =>
        normalizeLoadedScenario(d.id, d.data() as Record<string, unknown>)
      );
      list.sort((a, b) => {
        const aTime =
          a.updatedAt && typeof a.updatedAt === 'object' && 'toMillis' in a.updatedAt
            ? (a.updatedAt as { toMillis: () => number }).toMillis()
            : 0;
        const bTime =
          b.updatedAt && typeof b.updatedAt === 'object' && 'toMillis' in b.updatedAt
            ? (b.updatedAt as { toMillis: () => number }).toMillis()
            : 0;
        return bTime - aTime;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeUserSavingsLogs(
  uid: string,
  onData: (logs: SavingsLog[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'savingsLogs';
  const q = query(collection(db, path), where('userId', '==', uid), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SavingsLog[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavingsLog, 'id'>),
      }));
      list.sort((a, b) => b.weekDate.localeCompare(a.weekDate));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeUserFolders(
  uid: string,
  onData: (folders: GoalFolder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'folders';
  const q = query(collection(db, path), where('userId', '==', uid), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: GoalFolder[] = snapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: typeof raw.userId === 'string' ? raw.userId : uid,
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Saved Folder',
          color: VALID_FOLDER_COLORS.includes(raw.color as FolderColor)
            ? (raw.color as FolderColor)
            : 'emerald',
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createFolder(
  uid: string,
  name: string,
  color: FolderColor,
  idempotencyKey?: string
): Promise<string> {
  const safeId = sanitizeFolderId(idempotencyKey);
  const folderRef = safeId ? doc(db, 'folders', safeId) : doc(collection(db, 'folders'));
  const path = `folders/${folderRef.id}`;
  const safeName = name.trim().slice(0, 48) || 'My Folder';
  const safeColor: FolderColor = VALID_FOLDER_COLORS.includes(color) ? color : 'emerald';

  try {
    await setDoc(folderRef, {
      userId: uid,
      name: safeName,
      color: safeColor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return folderRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFolder(
  folderId: string,
  name: string,
  color: FolderColor
): Promise<void> {
  const path = `folders/${folderId}`;
  const folderRef = doc(db, 'folders', folderId);
  const safeName = name.trim().slice(0, 48) || 'My Folder';
  const safeColor: FolderColor = VALID_FOLDER_COLORS.includes(color) ? color : 'emerald';

  try {
    await updateDoc(folderRef, {
      name: safeName,
      color: safeColor,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFolder(uid: string, folderId: string): Promise<void> {
  const path = `folders/${folderId}`;
  try {
    const scenariosQuery = query(
      collection(db, 'scenarios'),
      where('userId', '==', uid),
      where('folderId', '==', folderId),
      limit(100)
    );
    const scenariosSnap = await getDocs(scenariosQuery);
    const batch = writeBatch(db);
    scenariosSnap.docs.forEach((d) =>
      batch.update(d.ref, {
        folderId: deleteField(),
        updatedAt: serverTimestamp(),
      })
    );
    batch.delete(doc(db, 'folders', folderId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createScenario(
  uid: string,
  input: ScenarioInput,
  idempotencyKey?: string
): Promise<string> {
  const safeId =
    idempotencyKey && /^[a-zA-Z0-9_-]{1,128}$/.test(idempotencyKey)
      ? idempotencyKey
      : undefined;
  const scenarioRef = safeId
    ? doc(db, 'scenarios', safeId)
    : doc(collection(db, 'scenarios'));
  const path = `scenarios/${scenarioRef.id}`;
  const { folderId, ...rest } = sanitizeScenarioPayload(input);

  const payload: Record<string, unknown> = {
    userId: uid,
    ...rest,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (folderId) {
    payload.folderId = folderId;
  }

  try {
    await setDoc(scenarioRef, payload);
    return scenarioRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateScenario(
  scenarioId: string,
  input: ScenarioInput
): Promise<void> {
  const path = `scenarios/${scenarioId}`;
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const { folderId, ...rest } = sanitizeScenarioPayload(input);

  const payload: Record<string, unknown> = {
    ...rest,
    folderId: folderId ?? deleteField(),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(scenarioRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function moveScenarioToFolder(
  scenarioId: string,
  folderId?: string
): Promise<void> {
  const path = `scenarios/${scenarioId}`;
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const safeFolderId = sanitizeFolderId(folderId);

  try {
    await updateDoc(scenarioRef, {
      folderId: safeFolderId ?? deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteScenario(uid: string, scenarioId: string): Promise<void> {
  const path = `scenarios/${scenarioId}`;
  try {
    const logsQuery = query(
      collection(db, 'savingsLogs'),
      where('userId', '==', uid),
      where('scenarioId', '==', scenarioId),
      limit(450)
    );
    const logsSnap = await getDocs(logsQuery);
    const batch = writeBatch(db);
    logsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'scenarios', scenarioId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createSavingsLog(
  uid: string,
  scenarioId: string,
  amount: number,
  note: string,
  weekDate: string,
  idempotencyKey?: string
): Promise<string> {
  const safeId =
    idempotencyKey && /^[a-zA-Z0-9_-]{1,128}$/.test(idempotencyKey)
      ? idempotencyKey
      : undefined;
  const logRef = safeId
    ? doc(db, 'savingsLogs', safeId)
    : doc(collection(db, 'savingsLogs'));
  const path = `savingsLogs/${logRef.id}`;
  const safeAmount = clamp(Math.round(amount), 1, 1000000);
  const safeNote = note.trim().slice(0, 160);
  const safeDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(weekDate)
    ? weekDate
    : getLocalISODate();

  try {
    await setDoc(logRef, {
      userId: uid,
      scenarioId,
      amount: safeAmount,
      note: safeNote,
      weekDate: safeDate,
      createdAt: serverTimestamp(),
    });
    return logRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteSavingsLog(logId: string): Promise<void> {
  const path = `savingsLogs/${logId}`;
  try {
    await deleteDoc(doc(db, 'savingsLogs', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserMilestones(
  uid: string,
  onData: (awards: MilestoneAward[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'milestones';
  const q = query(collection(db, path), where('userId', '==', uid), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MilestoneAward[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MilestoneAward, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function awardMilestonesBatch(
  uid: string,
  awards: Array<{ milestoneId: MilestoneId; title: string; achievedValue: number }>
): Promise<void> {
  if (awards.length === 0) return;
  const unlockedDate = getLocalISODate();
  const batch = writeBatch(db);

  for (const item of awards) {
    const docId = `${uid}_${item.milestoneId}`;
    const ref = doc(db, 'milestones', docId);
    batch.set(ref, {
      userId: uid,
      milestoneId: item.milestoneId,
      title: item.title.trim().slice(0, 80),
      achievedValue: Math.max(0, Math.min(500000000, Math.round(item.achievedValue))),
      unlockedDate,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'milestones');
  }
}

function sanitizeSharedReportPayload(input: SharedProgressReportInput) {
  const goalCategory: GoalCategory = VALID_CATEGORIES.includes(input.goalCategory)
    ? input.goalCategory
    : 'custom';
  const currency: CurrencyCode = VALID_CURRENCIES.includes(input.currency)
    ? input.currency
    : 'PHP';
  const benchmarkId: BenchmarkId = VALID_BENCHMARKS.includes(input.benchmarkId)
    ? input.benchmarkId
    : 'global60_40';

  const unlockedMilestoneIds = Array.from(
    new Set(
      (input.unlockedMilestoneIds || []).filter((id): id is MilestoneId =>
        VALID_MILESTONE_IDS.includes(id)
      )
    )
  ).slice(0, 8);

  return {
    authorName: input.authorName.trim().slice(0, 48) || 'FinSight Saver',
    goalTitle: input.goalTitle.trim().slice(0, 80) || 'My Savings Goal',
    goalCategory,
    goalTargetAmount: clamp(Math.round(input.goalTargetAmount), 500, 500000000),
    currentSaved: clamp(Math.round(input.currentSaved), 0, 500000000),
    weeklySavings: clamp(Math.round(input.weeklySavings), 1, 1000000),
    savingsPercent: clamp(Math.round(input.savingsPercent), 1, 95),
    currency,
    benchmarkId,
    earnedBadgesCount: clamp(Math.round(input.earnedBadgesCount), 0, 16),
    totalBadgesCount: clamp(Math.round(input.totalBadgesCount), 1, 16),
    unlockedMilestoneIds,
    depositsCount: clamp(Math.round(input.depositsCount), 0, 10000),
    showExactAmounts: Boolean(input.showExactAmounts),
  };
}

function makeShareReportId(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 24)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 10)}`;
  const id = `rep_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
  return id.length >= 16 ? id.slice(0, 40) : id.padEnd(20, '0');
}

export async function getSharedReport(shareId: string): Promise<SharedProgressReport | null> {
  const trimmed = shareId.trim();
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(trimmed)) {
    return null;
  }
  const path = `sharedReports/${trimmed}`;
  try {
    const snap = await getDoc(doc(db, 'sharedReports', trimmed));
    if (!snap.exists()) return null;
    const raw = snap.data() as Record<string, unknown>;
    return {
      id: snap.id,
      userId: typeof raw.userId === 'string' ? raw.userId : '',
      authorName: typeof raw.authorName === 'string' ? raw.authorName : 'FinSight Saver',
      goalTitle: typeof raw.goalTitle === 'string' ? raw.goalTitle : 'My Savings Goal',
      goalCategory: VALID_CATEGORIES.includes(raw.goalCategory as GoalCategory)
        ? (raw.goalCategory as GoalCategory)
        : 'custom',
      goalTargetAmount: typeof raw.goalTargetAmount === 'number' ? raw.goalTargetAmount : 50000,
      currentSaved: typeof raw.currentSaved === 'number' ? raw.currentSaved : 0,
      weeklySavings: typeof raw.weeklySavings === 'number' ? raw.weeklySavings : 300,
      savingsPercent: typeof raw.savingsPercent === 'number' ? raw.savingsPercent : 20,
      currency: VALID_CURRENCIES.includes(raw.currency as CurrencyCode)
        ? (raw.currency as CurrencyCode)
        : 'PHP',
      benchmarkId: VALID_BENCHMARKS.includes(raw.benchmarkId as BenchmarkId)
        ? (raw.benchmarkId as BenchmarkId)
        : 'global60_40',
      earnedBadgesCount: typeof raw.earnedBadgesCount === 'number' ? raw.earnedBadgesCount : 0,
      totalBadgesCount: typeof raw.totalBadgesCount === 'number' ? raw.totalBadgesCount : 8,
      unlockedMilestoneIds: Array.isArray(raw.unlockedMilestoneIds)
        ? raw.unlockedMilestoneIds.filter((id): id is MilestoneId =>
            VALID_MILESTONE_IDS.includes(id as MilestoneId)
          )
        : [],
      depositsCount: typeof raw.depositsCount === 'number' ? raw.depositsCount : 0,
      showExactAmounts: typeof raw.showExactAmounts === 'boolean' ? raw.showExactAmounts : true,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeUserSharedReports(
  uid: string,
  onData: (reports: SharedProgressReport[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'sharedReports';
  const q = query(collection(db, path), where('userId', '==', uid), limit(25));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SharedProgressReport[] = snapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: typeof raw.userId === 'string' ? raw.userId : uid,
          authorName: typeof raw.authorName === 'string' ? raw.authorName : 'FinSight Saver',
          goalTitle: typeof raw.goalTitle === 'string' ? raw.goalTitle : 'My Savings Goal',
          goalCategory: VALID_CATEGORIES.includes(raw.goalCategory as GoalCategory)
            ? (raw.goalCategory as GoalCategory)
            : 'custom',
          goalTargetAmount: typeof raw.goalTargetAmount === 'number' ? raw.goalTargetAmount : 50000,
          currentSaved: typeof raw.currentSaved === 'number' ? raw.currentSaved : 0,
          weeklySavings: typeof raw.weeklySavings === 'number' ? raw.weeklySavings : 300,
          savingsPercent: typeof raw.savingsPercent === 'number' ? raw.savingsPercent : 20,
          currency: VALID_CURRENCIES.includes(raw.currency as CurrencyCode)
            ? (raw.currency as CurrencyCode)
            : 'PHP',
          benchmarkId: VALID_BENCHMARKS.includes(raw.benchmarkId as BenchmarkId)
            ? (raw.benchmarkId as BenchmarkId)
            : 'global60_40',
          earnedBadgesCount: typeof raw.earnedBadgesCount === 'number' ? raw.earnedBadgesCount : 0,
          totalBadgesCount: typeof raw.totalBadgesCount === 'number' ? raw.totalBadgesCount : 8,
          unlockedMilestoneIds: Array.isArray(raw.unlockedMilestoneIds)
            ? raw.unlockedMilestoneIds.filter((id): id is MilestoneId =>
                VALID_MILESTONE_IDS.includes(id as MilestoneId)
              )
            : [],
          depositsCount: typeof raw.depositsCount === 'number' ? raw.depositsCount : 0,
          showExactAmounts: typeof raw.showExactAmounts === 'boolean' ? raw.showExactAmounts : true,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        };
      });
      list.sort((a, b) => {
        const aTime =
          a.updatedAt && typeof a.updatedAt === 'object' && 'toMillis' in a.updatedAt
            ? (a.updatedAt as { toMillis: () => number }).toMillis()
            : 0;
        const bTime =
          b.updatedAt && typeof b.updatedAt === 'object' && 'toMillis' in b.updatedAt
            ? (b.updatedAt as { toMillis: () => number }).toMillis()
            : 0;
        return bTime - aTime;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createSharedReport(
  uid: string,
  input: SharedProgressReportInput,
  idempotencyShareId?: string
): Promise<string> {
  const safeId =
    idempotencyShareId && /^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyShareId)
      ? idempotencyShareId
      : makeShareReportId();
  const ref = doc(db, 'sharedReports', safeId);
  const path = `sharedReports/${safeId}`;
  const clean = sanitizeSharedReportPayload(input);

  try {
    await setDoc(ref, {
      userId: uid,
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return safeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSharedReport(
  shareId: string,
  input: SharedProgressReportInput
): Promise<void> {
  const path = `sharedReports/${shareId}`;
  const clean = sanitizeSharedReportPayload(input);

  try {
    await updateDoc(doc(db, 'sharedReports', shareId), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSharedReport(shareId: string): Promise<void> {
  const path = `sharedReports/${shareId}`;
  try {
    await deleteDoc(doc(db, 'sharedReports', shareId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function sanitizeBudgetEntryPayload(input: BudgetEntryInput) {
  const bucket: BudgetBucket = VALID_BUDGET_BUCKETS.includes(input.bucket) ? input.bucket : 'needs';
  const category: BudgetCategory = VALID_BUDGET_CATEGORIES.includes(input.category)
    ? input.category
    : 'other';
  const status: BudgetEntryStatus = VALID_BUDGET_STATUSES.includes(input.status)
    ? input.status
    : 'planned';
  const entryDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.entryDate)
    ? input.entryDate
    : getLocalISODate();
  const scenarioId = sanitizeFolderId(input.scenarioId);

  return {
    title: input.title.trim().slice(0, 64) || 'Everyday Expense',
    amount: clamp(Math.round(input.amount), 1, 1000000),
    bucket,
    category,
    status,
    entryDate,
    isEssentialRoutine: Boolean(input.isEssentialRoutine),
    scenarioId,
  };
}

export function subscribeUserBudgetEntries(
  uid: string,
  onData: (entries: BudgetEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'budgetEntries';
  const q = query(collection(db, path), where('userId', '==', uid), limit(150));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: BudgetEntry[] = snapshot.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: typeof raw.userId === 'string' ? raw.userId : uid,
          title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Everyday Expense',
          amount: typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : 100,
          bucket: VALID_BUDGET_BUCKETS.includes(raw.bucket as BudgetBucket)
            ? (raw.bucket as BudgetBucket)
            : 'needs',
          category: VALID_BUDGET_CATEGORIES.includes(raw.category as BudgetCategory)
            ? (raw.category as BudgetCategory)
            : 'other',
          status: VALID_BUDGET_STATUSES.includes(raw.status as BudgetEntryStatus)
            ? (raw.status as BudgetEntryStatus)
            : 'planned',
          entryDate:
            typeof raw.entryDate === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw.entryDate)
              ? raw.entryDate
              : getLocalISODate(),
          isEssentialRoutine: Boolean(raw.isEssentialRoutine),
          scenarioId: sanitizeFolderId(typeof raw.scenarioId === 'string' ? raw.scenarioId : undefined),
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        };
      });
      list.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createBudgetEntry(
  uid: string,
  input: BudgetEntryInput,
  idempotencyKey?: string
): Promise<string> {
  const safeId = sanitizeFolderId(idempotencyKey);
  const ref = safeId ? doc(db, 'budgetEntries', safeId) : doc(collection(db, 'budgetEntries'));
  const path = `budgetEntries/${ref.id}`;
  const { scenarioId, ...rest } = sanitizeBudgetEntryPayload(input);

  const payload: Record<string, unknown> = {
    userId: uid,
    ...rest,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (scenarioId) {
    payload.scenarioId = scenarioId;
  }

  try {
    await setDoc(ref, payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBudgetEntry(
  entryId: string,
  input: BudgetEntryInput
): Promise<void> {
  const path = `budgetEntries/${entryId}`;
  const { scenarioId, ...rest } = sanitizeBudgetEntryPayload(input);

  try {
    await updateDoc(doc(db, 'budgetEntries', entryId), {
      ...rest,
      scenarioId: scenarioId ?? deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBudgetEntry(entryId: string): Promise<void> {
  const path = `budgetEntries/${entryId}`;
  try {
    await deleteDoc(doc(db, 'budgetEntries', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllUserDataAndAccount(user: User): Promise<void> {
  const uid = user.uid;
  try {
    const [logsSnap, scenariosSnap, foldersSnap, milestonesSnap, reportsSnap, budgetSnap] =
      await Promise.all([
        getDocs(query(collection(db, 'savingsLogs'), where('userId', '==', uid), limit(250))),
        getDocs(query(collection(db, 'scenarios'), where('userId', '==', uid), limit(250))),
        getDocs(query(collection(db, 'folders'), where('userId', '==', uid), limit(100))),
        getDocs(query(collection(db, 'milestones'), where('userId', '==', uid), limit(50))),
        getDocs(query(collection(db, 'sharedReports'), where('userId', '==', uid), limit(50))),
        getDocs(query(collection(db, 'budgetEntries'), where('userId', '==', uid), limit(250))),
      ]);

    const batch = writeBatch(db);
    logsSnap.docs.forEach((d) => batch.delete(d.ref));
    scenariosSnap.docs.forEach((d) => batch.delete(d.ref));
    foldersSnap.docs.forEach((d) => batch.delete(d.ref));
    milestonesSnap.docs.forEach((d) => batch.delete(d.ref));
    reportsSnap.docs.forEach((d) => batch.delete(d.ref));
    budgetSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }

  await deleteUser(user);
}
