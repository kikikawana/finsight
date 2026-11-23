import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { LogOut, Moon, Sun } from 'lucide-react';
import type { AppView } from '../types/finance';
import { FinSightLogo } from './FinSightLogo';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ view: AppView; label: string }> = [
  { view: 'projections', label: 'Projections' },
  { view: 'rent-equity', label: 'Rent vs. Equity' },
  { view: 'historical-data', label: 'Historical Data' },
  { view: 'milestones', label: 'Milestones' },
  { view: 'news', label: 'News' },
  { view: 'ledger', label: 'Savings Ledger' },
];

export function TopBar({
  activeView,
  onNavigate,
  theme,
  onToggleTheme,
  user,
  authLoading,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL]);

  const initialChar =
    (user?.displayName || user?.email || 'F').trim().charAt(0).toUpperCase() || 'F';

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Custom Logo + Editorial brand wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('overview');
          }}
          className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <FinSightLogo className="w-8 h-8 shrink-0" />
          <span>FinSight</span>
        </a>

        {/* Zone 2: 5 clean single-line navigation links */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-5 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.view;
            return (
              <a
                key={item.view}
                href={`#${item.view}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.view);
                }}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-400 border-emerald-700 dark:border-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 border-transparent hover:text-emerald-700 dark:hover:text-emerald-400'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Theme switch + primary account action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
            )}
          </button>

          {authLoading ? (
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Checking…
            </span>
          ) : user ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex items-center gap-2">
                {user.photoURL && !avatarFailed ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Account avatar'}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center">
                    {initialChar}
                  </div>
                )}
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[130px] truncate">
                  {user.displayName || user.email?.split('@')[0] || 'Account'}
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
