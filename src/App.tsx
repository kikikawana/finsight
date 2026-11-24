import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FinSightChat } from './components/FinSightChat';
import { GoalPlannerSection } from './components/GoalPlannerSection';
import { HistoricalDataSection } from './components/HistoricalDataSection';
import { HomeOverview } from './components/HomeOverview';
import { LedgerSection } from './components/LedgerSection';
import { MilestonesSection } from './components/MilestonesSection';
import { NewsSection } from './components/NewsSection';
import { ProjectionsSection } from './components/ProjectionsSection';
import { TopBar } from './components/TopBar';
import { WeeklyReminderBanner } from './components/WeeklyReminderBanner';
import { evaluateMilestones } from './data/milestones';
import { auth } from './firebase';
import {
  awardMilestonesBatch,
  createFolder,
  createSavingsLog,
  createScenario,
  deleteAllUserDataAndAccount,
  deleteFolder,
  deleteSavingsLog,
  deleteScenario,
  mapAuthError,
  moveScenarioToFolder,
  signInWithGoogle,
  signOutUser,
  subscribeUserFolders,
  subscribeUserMilestones,
  subscribeUserSavingsLogs,
  subscribeUserScenarios,
  updateFolder,
  updateScenario,
  upsertUserProfile,
} from './services/firestoreService';
import type {
  AppView,
  FolderColor,
  GoalFolder,
  MilestoneAward,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
} from './types/finance';
import { DEFAULT_SCENARIO, type CurrencyCode } from './utils/financeMath';

const VALID_VIEWS: AppView[] = [
  'overview',
  'goal-planner',
  'projections',
  'historical-data',
  'milestones',
  'news',
  'ledger',
];

const LOCAL_FOLDERS_KEY = 'finsight-local-folders-v1';
const LOCAL_FILES_KEY = 'finsight-local-files-v1';
const VALID_FOLDER_COLORS: FolderColor[] = ['emerald', 'amber', 'sky', 'rose', 'slate'];

function makeLocalId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

function loadLocalFolders(): GoalFolder[] {
  try {
    const raw = localStorage.getItem(LOCAL_FOLDERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : makeLocalId('fld'),
        userId: 'local',
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 48) : 'Saved Folder',
        color: VALID_FOLDER_COLORS.includes(item.color as FolderColor)
          ? (item.color as FolderColor)
          : 'emerald',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function saveLocalFolders(folders: GoalFolder[]): void {
  try {
    localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    // ignore storage quota restrictions
  }
}

function loadLocalScenarios(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(LOCAL_FILES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : makeLocalId('file'),
        userId: 'local',
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 80) : 'My Savings Goal',
        goalCategory:
          typeof item.goalCategory === 'string'
            ? (item.goalCategory as SavedScenario['goalCategory'])
            : 'custom',
        goalTargetAmount:
          typeof item.goalTargetAmount === 'number' && Number.isFinite(item.goalTargetAmount)
            ? Math.max(500, item.goalTargetAmount)
            : 25000,
        incomeAmount:
          typeof item.incomeAmount === 'number' && Number.isFinite(item.incomeAmount)
            ? Math.max(0, item.incomeAmount)
            : 22000,
        incomeCadence: item.incomeCadence === 'weekly' ? 'weekly' : 'monthly',
        savingsPercent:
          typeof item.savingsPercent === 'number' && Number.isFinite(item.savingsPercent)
            ? Math.min(95, Math.max(1, Math.round(item.savingsPercent)))
            : 20,
        needsPercent:
          typeof item.needsPercent === 'number' && Number.isFinite(item.needsPercent)
            ? Math.min(99, Math.max(0, Math.round(item.needsPercent)))
            : 55,
        wantsPercent:
          typeof item.wantsPercent === 'number' && Number.isFinite(item.wantsPercent)
            ? Math.min(99, Math.max(0, Math.round(item.wantsPercent)))
            : 25,
        weeklySavings:
          typeof item.weeklySavings === 'number' && Number.isFinite(item.weeklySavings)
            ? Math.max(1, Math.round(item.weeklySavings))
            : 250,
        initialDeposit:
          typeof item.initialDeposit === 'number' && Number.isFinite(item.initialDeposit)
            ? Math.max(0, Math.round(item.initialDeposit))
            : 0,
        benchmarkId:
          item.benchmarkId === 'sp500' || item.benchmarkId === 'psei'
            ? item.benchmarkId
            : 'global60_40',
        folderId: typeof item.folderId === 'string' && item.folderId ? item.folderId : undefined,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
  } catch {
    return [];
  }
}

function saveLocalScenarios(scenarios: SavedScenario[]): void {
  try {
    localStorage.setItem(LOCAL_FILES_KEY, JSON.stringify(scenarios));
  } catch {
    // ignore storage quota restrictions
  }
}

function viewFromHash(): AppView {
  if (typeof window === 'undefined') return 'overview';
  const raw = window.location.hash.replace('#', '');
  if (raw === 'rent-equity') return 'goal-planner';
  return VALID_VIEWS.includes(raw as AppView) ? (raw as AppView) : 'overview';
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  try {
    const saved = localStorage.getItem('finsight-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage restriction
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function FinSightWorkspace() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getInitialTheme());
  const [activeView, setActiveView] = useState<AppView>(() => viewFromHash());
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [currency, setCurrency] = useState<CurrencyCode>('PHP');

  const [scenario, setScenario] = useState<ScenarioInput>(DEFAULT_SCENARIO);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [folders, setFolders] = useState<GoalFolder[]>(() => loadLocalFolders());
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => loadLocalScenarios());
  const [savingsLogs, setSavingsLogs] = useState<SavingsLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [persistedAwards, setPersistedAwards] = useState<MilestoneAward[]>([]);
  const [milestonesLoaded, setMilestonesLoaded] = useState(false);
  const [recentUnlocks, setRecentUnlocks] = useState<string[]>([]);
  const awardingRef = useRef(false);
  const activeScenarioIdRef = useRef<string | null>(null);

  const setSyncedActiveScenarioId = (id: string | null) => {
    activeScenarioIdRef.current = id;
    setActiveScenarioId(id);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('finsight-theme', theme);
    } catch {
      // ignore storage restriction
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const navigateTo = (view: AppView) => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      const nextHash = view === 'overview' ? '#overview' : `#${view}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(viewFromHash());
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        setSyncedActiveScenarioId(null);
        setLogsLoaded(false);
        try {
          await upsertUserProfile(currentUser);
        } catch (err) {
          setAuthError(mapAuthError(err));
        }
      } else {
        const localFolders = loadLocalFolders();
        const localFiles = loadLocalScenarios();
        setFolders(localFolders);
        setSavedScenarios(localFiles);
        setSavingsLogs([]);
        setLogsLoaded(false);
        setPersistedAwards([]);
        setMilestonesLoaded(false);
        setRecentUnlocks([]);
        setSyncedActiveScenarioId(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified) return;

    const unsubFolders = subscribeUserFolders(
      user.uid,
      (list) => {
        setFolders(list);
      },
      (err) => {
        setAuthError(err.message);
      }
    );

    const unsubScenarios = subscribeUserScenarios(
      user.uid,
      (list) => {
        setSavedScenarios(list);
        if (list.length > 0 && !activeScenarioIdRef.current) {
          const latest = list[0];
          setSyncedActiveScenarioId(latest.id);
          setScenario({
            title: latest.title,
            goalCategory: latest.goalCategory,
            goalTargetAmount: latest.goalTargetAmount,
            incomeAmount: latest.incomeAmount,
            incomeCadence: latest.incomeCadence,
            savingsPercent: latest.savingsPercent,
            needsPercent: latest.needsPercent,
            wantsPercent: latest.wantsPercent,
            weeklySavings: latest.weeklySavings,
            initialDeposit: latest.initialDeposit,
            benchmarkId: latest.benchmarkId,
            folderId: latest.folderId,
          });
        }
      },
      (err) => {
        setAuthError(err.message);
      }
    );

    const unsubLogs = subscribeUserSavingsLogs(
      user.uid,
      (logs) => {
        setSavingsLogs(logs);
        setLogsLoaded(true);
      },
      (err) => {
        setAuthError(err.message);
        setLogsLoaded(true);
      }
    );

    const unsubMilestones = subscribeUserMilestones(
      user.uid,
      (awards) => {
        setPersistedAwards(awards);
        setMilestonesLoaded(true);
      },
      (err) => {
        setAuthError(err.message);
      }
    );

    return () => {
      unsubFolders();
      unsubScenarios();
      unsubLogs();
      unsubMilestones();
    };
  }, [user]);

  const milestoneState = useMemo(
    () => evaluateMilestones(savingsLogs, scenario, persistedAwards, currency),
    [savingsLogs, scenario, persistedAwards, currency]
  );

  useEffect(() => {
    if (
      !user ||
      !user.emailVerified ||
      !milestonesLoaded ||
      !isOnline ||
      awardingRef.current ||
      milestoneState.newlyUnlocked.length === 0
    ) {
      return;
    }

    awardingRef.current = true;
    const toAward = milestoneState.newlyUnlocked;

    awardMilestonesBatch(user.uid, toAward)
      .then(() => {
        setRecentUnlocks(toAward.map((m) => m.title));
      })
      .catch((err) => {
        console.error('Failed to persist milestone badges:', err);
      })
      .finally(() => {
        awardingRef.current = false;
      });
  }, [user, milestonesLoaded, isOnline, milestoneState.newlyUnlocked]);

  const isCloudVerified = Boolean(user && user.emailVerified);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code !== 'auth/popup-closed-by-user') {
        setAuthError(mapAuthError(err));
      }
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOutUser();
  };

  const handleChangeScenario = (patch: Partial<ScenarioInput>) => {
    setScenario((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectSavedScenario = (saved: SavedScenario) => {
    setSyncedActiveScenarioId(saved.id);
    setScenario({
      title: saved.title,
      goalCategory: saved.goalCategory,
      goalTargetAmount: saved.goalTargetAmount,
      incomeAmount: saved.incomeAmount,
      incomeCadence: saved.incomeCadence,
      savingsPercent: saved.savingsPercent,
      needsPercent: saved.needsPercent,
      wantsPercent: saved.wantsPercent,
      weeklySavings: saved.weeklySavings,
      initialDeposit: saved.initialDeposit,
      benchmarkId: saved.benchmarkId,
      folderId: saved.folderId,
    });
  };

  const handleCreateFolder = async (
    name: string,
    color: FolderColor,
    idempotencyKey?: string
  ): Promise<string> => {
    const cleanName = name.trim().slice(0, 48) || 'My Folder';
    if (isCloudVerified && user) {
      return createFolder(user.uid, cleanName, color, idempotencyKey);
    }
    const newFolder: GoalFolder = {
      id: idempotencyKey || makeLocalId('fld'),
      userId: 'local',
      name: cleanName,
      color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setFolders((prev) => {
      const next = [...prev.filter((f) => f.id !== newFolder.id), newFolder].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      saveLocalFolders(next);
      return next;
    });
    return newFolder.id;
  };

  const handleUpdateFolder = async (
    folderId: string,
    name: string,
    color: FolderColor
  ): Promise<void> => {
    const cleanName = name.trim().slice(0, 48) || 'My Folder';
    if (isCloudVerified && user) {
      await updateFolder(folderId, cleanName, color);
      return;
    }
    setFolders((prev) => {
      const next = prev
        .map((f) =>
          f.id === folderId
            ? { ...f, name: cleanName, color, updatedAt: Date.now() }
            : f
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      saveLocalFolders(next);
      return next;
    });
  };

  const handleDeleteFolder = async (folderId: string): Promise<void> => {
    if (isCloudVerified && user) {
      await deleteFolder(user.uid, folderId);
      if (scenario.folderId === folderId) {
        setScenario((prev) => ({ ...prev, folderId: undefined }));
      }
      return;
    }
    setFolders((prev) => {
      const next = prev.filter((f) => f.id !== folderId);
      saveLocalFolders(next);
      return next;
    });
    setSavedScenarios((prev) => {
      const next = prev.map((s) =>
        s.folderId === folderId ? { ...s, folderId: undefined, updatedAt: Date.now() } : s
      );
      saveLocalScenarios(next);
      return next;
    });
    if (scenario.folderId === folderId) {
      setScenario((prev) => ({ ...prev, folderId: undefined }));
    }
  };

  const handleSaveNewScenario = async (
    title: string,
    idempotencyKey: string,
    folderId?: string
  ): Promise<string | null> => {
    const resolvedFolderId =
      folderId && folders.some((f) => f.id === folderId) ? folderId : undefined;
    const payload: ScenarioInput = {
      ...scenario,
      title,
      folderId: resolvedFolderId,
    };
    setScenario(payload);

    if (isCloudVerified && user) {
      const id = await createScenario(user.uid, payload, idempotencyKey);
      setSyncedActiveScenarioId(id);
      return id;
    }

    const now = Date.now();
    const localFile: SavedScenario = {
      ...payload,
      id: idempotencyKey || makeLocalId('file'),
      userId: 'local',
      createdAt: now,
      updatedAt: now,
    };
    setSavedScenarios((prev) => {
      const next = [localFile, ...prev.filter((s) => s.id !== localFile.id)];
      saveLocalScenarios(next);
      return next;
    });
    setSyncedActiveScenarioId(localFile.id);
    return localFile.id;
  };

  const handleUpdateActiveScenario = async () => {
    if (!activeScenarioId) return;
    if (isCloudVerified && user) {
      await updateScenario(activeScenarioId, scenario);
      return;
    }
    const now = Date.now();
    setSavedScenarios((prev) => {
      const next = prev.map((s) =>
        s.id === activeScenarioId
          ? {
              ...s,
              ...scenario,
              updatedAt: now,
            }
          : s
      );
      saveLocalScenarios(next);
      return next;
    });
  };

  const handleMoveScenarioToFolder = async (
    scenarioId: string,
    folderId?: string
  ): Promise<void> => {
    const resolvedFolderId =
      folderId && folders.some((f) => f.id === folderId) ? folderId : undefined;

    if (isCloudVerified && user) {
      await moveScenarioToFolder(scenarioId, resolvedFolderId);
    } else {
      const now = Date.now();
      setSavedScenarios((prev) => {
        const next = prev.map((s) =>
          s.id === scenarioId
            ? { ...s, folderId: resolvedFolderId, updatedAt: now }
            : s
        );
        saveLocalScenarios(next);
        return next;
      });
    }

    if (activeScenarioIdRef.current === scenarioId) {
      setScenario((prev) => ({ ...prev, folderId: resolvedFolderId }));
    }
  };

  const handleDeleteScenario = async (id: string) => {
    if (isCloudVerified && user) {
      await deleteScenario(user.uid, id);
    } else {
      setSavedScenarios((prev) => {
        const next = prev.filter((s) => s.id !== id);
        saveLocalScenarios(next);
        return next;
      });
    }
    if (activeScenarioIdRef.current === id) {
      setSyncedActiveScenarioId(null);
    }
  };

  const handleImportScenarioFile = async (
    imported: ScenarioInput,
    targetFolderId?: string
  ): Promise<string> => {
    const resolvedFolderId =
      targetFolderId && folders.some((f) => f.id === targetFolderId)
        ? targetFolderId
        : imported.folderId && folders.some((f) => f.id === imported.folderId)
          ? imported.folderId
          : undefined;

    const cleanImported: ScenarioInput = {
      ...imported,
      folderId: resolvedFolderId,
    };
    setScenario(cleanImported);

    if (isCloudVerified && user) {
      const id = await createScenario(user.uid, cleanImported);
      setSyncedActiveScenarioId(id);
      return id;
    }

    const now = Date.now();
    const localFile: SavedScenario = {
      ...cleanImported,
      id: makeLocalId('file'),
      userId: 'local',
      createdAt: now,
      updatedAt: now,
    };
    setSavedScenarios((prev) => {
      const next = [localFile, ...prev];
      saveLocalScenarios(next);
      return next;
    });
    setSyncedActiveScenarioId(localFile.id);
    return localFile.id;
  };

  const handleAddSavingsLog = async (
    amount: number,
    note: string,
    weekDate: string,
    idempotencyKey: string
  ) => {
    if (!user) return;
    let targetScenarioId = activeScenarioIdRef.current;
    if (!targetScenarioId) {
      targetScenarioId = await createScenario(user.uid, scenario);
      setSyncedActiveScenarioId(targetScenarioId);
    }
    await createSavingsLog(user.uid, targetScenarioId, amount, note, weekDate, idempotencyKey);
  };

  const handleDeleteSavingsLog = async (id: string) => {
    if (!user) return;
    await deleteSavingsLog(id);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      await deleteAllUserDataAndAccount(user);
      setFolders([]);
      setSavedScenarios([]);
      setSavingsLogs([]);
      setPersistedAwards([]);
      setSyncedActiveScenarioId(null);
      setScenario(DEFAULT_SCENARIO);
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  };

  const mobileTabs: Array<{ view: AppView; label: string }> = [
    { view: 'overview', label: 'Overview' },
    { view: 'goal-planner', label: 'Goal & Split' },
    { view: 'projections', label: 'Projections' },
    { view: 'historical-data', label: 'History' },
    { view: 'milestones', label: 'Milestones' },
    { view: 'news', label: 'News' },
    { view: 'ledger', label: 'Folders & Ledger' },
  ];

  return (
    <div className="min-h-screen flex flex-col finsight-ambient-bg text-slate-900 dark:text-slate-100">
      <TopBar
        activeView={activeView}
        onNavigate={navigateTo}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {/* Non-sticky mobile tab strip so mobile users can also switch views without scrolling */}
      <div className="md:hidden bg-white/95 dark:bg-slate-950/95 border-b border-slate-200 dark:border-slate-800 px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {mobileTabs.map((tab) => {
            const active = activeView === tab.view;
            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => navigateTo(tab.view)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'bg-emerald-700 dark:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {!isOnline && (
        <div
          role="status"
          className="bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-center gap-2"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            Connection lost. Projections still calculate locally, and cloud saves will resume once
            you reconnect.
          </span>
        </div>
      )}

      {authError && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/70 border-b border-red-200 dark:border-red-800 px-4 py-2.5 text-xs text-red-700 dark:text-red-200 text-center"
        >
          {authError}
        </div>
      )}

      {activeView !== 'overview' && (
        <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigateTo('overview')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to Overview</span>
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Use the top bar to switch sections
            </span>
          </div>
        </div>
      )}

      <WeeklyReminderBanner
        user={user}
        authLoading={authLoading}
        logsLoaded={logsLoaded}
        activeView={activeView}
        savingsLogs={savingsLogs}
        scenario={scenario}
        currency={currency}
        onNavigate={navigateTo}
        onSignIn={handleSignIn}
      />

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeView === 'overview' && (
              <HomeOverview
                user={user}
                authLoading={authLoading}
                isOnline={isOnline}
                scenario={scenario}
                folders={folders}
                savedScenarios={savedScenarios}
                activeScenarioId={activeScenarioId}
                savingsLogs={savingsLogs}
                currency={currency}
                earnedBadgesCount={milestoneState.earnedCount}
                totalBadgesCount={milestoneState.items.length}
                onChangeScenario={handleChangeScenario}
                onSelectScenario={handleSelectSavedScenario}
                onQuickAddSavingsLog={handleAddSavingsLog}
                onNavigate={navigateTo}
                onSignIn={handleSignIn}
              />
            )}

            {activeView === 'projections' && (
              <ProjectionsSection
                scenario={scenario}
                currency={currency}
                onChangeCurrency={setCurrency}
                onChangeScenario={handleChangeScenario}
              />
            )}

            {activeView === 'goal-planner' && (
              <GoalPlannerSection
                scenario={scenario}
                currency={currency}
                folders={folders}
                savedScenarios={savedScenarios}
                activeScenarioId={activeScenarioId}
                isCloudVerified={isCloudVerified}
                isOnline={isOnline}
                onChangeScenario={handleChangeScenario}
                onCreateFolder={handleCreateFolder}
                onSaveNewScenario={handleSaveNewScenario}
                onUpdateActiveScenario={handleUpdateActiveScenario}
                onNavigate={navigateTo}
              />
            )}

            {activeView === 'historical-data' && (
              <HistoricalDataSection
                benchmarkId={scenario.benchmarkId}
                weeklySavings={scenario.weeklySavings}
                initialDeposit={scenario.initialDeposit}
                currency={currency}
                onSelectBenchmark={(benchmarkId) => handleChangeScenario({ benchmarkId })}
              />
            )}

            {activeView === 'milestones' && (
              <MilestonesSection
                user={user}
                items={milestoneState.items}
                earnedCount={milestoneState.earnedCount}
                recentUnlocks={recentUnlocks}
                onSignIn={handleSignIn}
              />
            )}

            {activeView === 'news' && <NewsSection isOnline={isOnline} />}

            {activeView === 'ledger' && (
              <LedgerSection
                user={user}
                isOnline={isOnline}
                currency={currency}
                scenario={scenario}
                activeScenarioId={activeScenarioId}
                folders={folders}
                savedScenarios={savedScenarios}
                savingsLogs={savingsLogs}
                onSignIn={handleSignIn}
                onSelectScenario={handleSelectSavedScenario}
                onCreateFolder={handleCreateFolder}
                onUpdateFolder={handleUpdateFolder}
                onDeleteFolder={handleDeleteFolder}
                onSaveNewScenario={handleSaveNewScenario}
                onUpdateActiveScenario={handleUpdateActiveScenario}
                onMoveScenarioToFolder={handleMoveScenarioToFolder}
                onDeleteScenario={handleDeleteScenario}
                onImportScenarioFile={handleImportScenarioFile}
                onAddSavingsLog={handleAddSavingsLog}
                onDeleteSavingsLog={handleDeleteSavingsLog}
                onDeleteAccount={handleDeleteAccount}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-7">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">FinSight</span> ·
            Historical index projections use verified 2005–2024 calendar-year returns for
            educational planning only and do not guarantee future performance.
          </div>
          <div className="flex items-center gap-5 shrink-0 pr-0 sm:pr-32">
            <button
              type="button"
              onClick={() => navigateTo('overview')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => navigateTo('projections')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              Projections
            </button>
            <button
              type="button"
              onClick={() => navigateTo('goal-planner')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              Goal &amp; Split
            </button>
            <button
              type="button"
              onClick={() => navigateTo('milestones')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              Milestones
            </button>
            <button
              type="button"
              onClick={() => navigateTo('ledger')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              Folders &amp; Ledger
            </button>
          </div>
        </div>
      </footer>

      <FinSightChat
        scenario={scenario}
        currency={currency}
        earnedBadgesCount={milestoneState.earnedCount}
        totalBadgesCount={milestoneState.items.length}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <FinSightWorkspace />
      </MotionConfig>
    </ErrorBoundary>
  );
}
