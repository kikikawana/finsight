import {
  deleteUser,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
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
  MilestoneAward,
  MilestoneId,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
} from '../types/finance';
import { getLocalISODate } from '../utils/financeMath';

const VALID_BENCHMARKS: BenchmarkId[] = ['sp500', 'psei', 'global60_40'];

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

function sanitizeScenarioPayload(input: ScenarioInput) {
  const cleanTitle = input.title.trim().slice(0, 80) || 'My Savings Plan';
  const benchmarkId: BenchmarkId = VALID_BENCHMARKS.includes(input.benchmarkId)
    ? input.benchmarkId
    : 'sp500';

  return {
    title: cleanTitle,
    weeklySavings: clamp(Math.round(input.weeklySavings), 1, 1000000),
    initialDeposit: clamp(Math.round(input.initialDeposit), 0, 100000000),
    benchmarkId,
    monthlyRent: clamp(Math.round(input.monthlyRent), 0, 10000000),
    targetHomePrice: clamp(Math.round(input.targetHomePrice), 100000, 500000000),
    downPaymentPercent: clamp(Number(input.downPaymentPercent.toFixed(2)), 5, 50),
    mortgageRate: clamp(Number(input.mortgageRate.toFixed(2)), 1, 25),
    rentGrowthRate: clamp(Number(input.rentGrowthRate.toFixed(2)), 0, 15),
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
    // Avoid PERMISSION_DENIED on unverified/hidden-email relay accounts; UI surfaces verification notice
    return;
  }

  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'FinSight Saver')
    .trim()
    .slice(0, 120);
  // Normalize email to lowercase to prevent case-mismatch issues; fallback if hidden by relay
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
  // Bounded query prevents unbounded reads at scale
  const q = query(collection(db, path), where('userId', '==', uid), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SavedScenario[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedScenario, 'id'>),
      }));
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
  // Bounded query prevents unbounded reads at scale
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
  const sanitized = sanitizeScenarioPayload(input);

  try {
    await setDoc(scenarioRef, {
      userId: uid,
      ...sanitized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
  const sanitized = sanitizeScenarioPayload(input);

  try {
    await updateDoc(scenarioRef, {
      ...sanitized,
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

export async function deleteAllUserDataAndAccount(user: User): Promise<void> {
  const uid = user.uid;
  try {
    const [logsSnap, scenariosSnap, milestonesSnap] = await Promise.all([
      getDocs(query(collection(db, 'savingsLogs'), where('userId', '==', uid), limit(450))),
      getDocs(query(collection(db, 'scenarios'), where('userId', '==', uid), limit(450))),
      getDocs(query(collection(db, 'milestones'), where('userId', '==', uid), limit(100))),
    ]);

    const batch = writeBatch(db);
    logsSnap.docs.forEach((d) => batch.delete(d.ref));
    scenariosSnap.docs.forEach((d) => batch.delete(d.ref));
    milestonesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }

  await deleteUser(user);
}
