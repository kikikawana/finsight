import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FinSightChat } from './components/FinSightChat';
import { HistoricalDataSection } from './components/HistoricalDataSection';
import { HomeOverview } from './components/HomeOverview';
import { LedgerSection } from './components/LedgerSection';
import { MilestonesSection } from './components/MilestonesSection';
import { NewsSection } from './components/NewsSection';
import { ProjectionsSection } from './components/ProjectionsSection';
import { RentVsEquitySection } from './components/RentVsEquitySection';
import { TopBar } from './components/TopBar';
import { evaluateMilestones } from './data/milestones';
import { auth } from './firebase';
import {
  awardMilestonesBatch,
  createSavingsLog,
  createScenario,
  deleteAllUserDataAndAccount,
  deleteSavingsLog,
  deleteScenario,
  mapAuthError,
  signInWithGoogle,
  signOutUser,
  subscribeUserMilestones,
  subscribeUserSavingsLogs,
  subscribeUserScenarios,
  updateScenario,
  upsertUserProfile,
} from './services/firestoreService';
import type {
  AppView,
  MilestoneAward,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
} from './types/finance';
import { DEFAULT_SCENARIO, type CurrencyCode } from './utils/financeMath';

const VALID_VIEWS: AppView[] = [
  'overview',
  'projections',
  'rent-equity',
  'historical-data',
  'milestones',
  'news',
  'ledger',
];

function viewFromHash(): AppView {
  if (typeof window === 'undefined') return 'overview';
  const raw = window.location.hash.replace('#', '') as AppView;
  return VALID_VIEWS.includes(raw) ? raw : 'overview';
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
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [savingsLogs, setSavingsLogs] = useState<SavingsLog[]>([]);
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
        try {
          await upsertUserProfile(currentUser);
        } catch (err) {
          setAuthError(mapAuthError(err));
        }
      } else {
        setSavedScenarios([]);
        setSavingsLogs([]);
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

    const unsubScenarios = subscribeUserScenarios(
      user.uid,
      (list) => {
        setSavedScenarios(list);
        if (list.length > 0 && !activeScenarioIdRef.current) {
          const latest = list[0];
          setSyncedActiveScenarioId(latest.id);
          setScenario({
            title: latest.title,
            weeklySavings: latest.weeklySavings,
            initialDeposit: latest.initialDeposit,
            benchmarkId: latest.benchmarkId,
            monthlyRent: latest.monthlyRent,
            targetHomePrice: latest.targetHomePrice,
            downPaymentPercent: latest.downPaymentPercent,
            mortgageRate: latest.mortgageRate,
            rentGrowthRate: latest.rentGrowthRate,
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
      },
      (err) => {
        setAuthError(err.message);
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
      weeklySavings: saved.weeklySavings,
      initialDeposit: saved.initialDeposit,
      benchmarkId: saved.benchmarkId,
      monthlyRent: saved.monthlyRent,
      targetHomePrice: saved.targetHomePrice,
      downPaymentPercent: saved.downPaymentPercent,
      mortgageRate: saved.mortgageRate,
      rentGrowthRate: saved.rentGrowthRate,
    });
  };

  const handleSaveNewScenario = async (
    title: string,
    idempotencyKey: string
  ): Promise<string | null> => {
    if (!user) return null;
    const payload: ScenarioInput = { ...scenario, title };
    setScenario(payload);
    const id = await createScenario(user.uid, payload, idempotencyKey);
    setSyncedActiveScenarioId(id);
    return id;
  };

  const handleUpdateActiveScenario = async () => {
    if (!user || !activeScenarioId) return;
    await updateScenario(activeScenarioId, scenario);
  };

  const handleDeleteScenario = async (id: string) => {
    if (!user) return;
    await deleteScenario(user.uid, id);
    if (activeScenarioIdRef.current === id) {
      setSyncedActiveScenarioId(null);
    }
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
    { view: 'projections', label: 'Projections' },
    { view: 'rent-equity', label: 'Rent vs. Equity' },
    { view: 'historical-data', label: 'History' },
    { view: 'milestones', label: 'Milestones' },
    { view: 'news', label: 'News' },
    { view: 'ledger', label: 'Ledger' },
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
            Connection lost — projections still calculate locally, and cloud saves will resume once
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
        <div className="bg-white/85 dark:bg-slate-950/85 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800/80">
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

      <main className="flex-1">
        {activeView === 'overview' && (
          <HomeOverview
            user={user}
            authLoading={authLoading}
            isOnline={isOnline}
            scenario={scenario}
            savingsLogs={savingsLogs}
            currency={currency}
            earnedBadgesCount={milestoneState.earnedCount}
            totalBadgesCount={milestoneState.items.length}
            onChangeScenario={handleChangeScenario}
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

        {activeView === 'rent-equity' && (
          <RentVsEquitySection
            scenario={scenario}
            currency={currency}
            onChangeScenario={handleChangeScenario}
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
            savedScenarios={savedScenarios}
            savingsLogs={savingsLogs}
            onSignIn={handleSignIn}
            onSelectScenario={handleSelectSavedScenario}
            onSaveNewScenario={handleSaveNewScenario}
            onUpdateActiveScenario={handleUpdateActiveScenario}
            onDeleteScenario={handleDeleteScenario}
            onAddSavingsLog={handleAddSavingsLog}
            onDeleteSavingsLog={handleDeleteSavingsLog}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </main>

      <footer className="bg-white/80 dark:bg-slate-950/90 backdrop-blur-xs border-t border-slate-200 dark:border-slate-800 py-7">
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
              onClick={() => navigateTo('rent-equity')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              Rent vs. Equity
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
              onClick={() => navigateTo('news')}
              className="hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              News
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
      <FinSightWorkspace />
    </ErrorBoundary>
  );
}
