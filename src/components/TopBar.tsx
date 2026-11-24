import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { motion } from 'motion/react';
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
  { view: 'goal-planner', label: 'Goal Planner' },
  { view: 'ledger', label: 'Folders & Ledger' },
  { view: 'everyday-budget', label: 'Daily Budget' },
  { view: 'projections', label: 'Projections' },
  { view: 'historical-data', label: 'History' },
  { view: 'milestones', label: 'Milestones' },
  { view: 'news', label: 'News' },
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
    <header className="sticky top-0 z-30 bg-white/88 dark:bg-[#090d0b]/88 backdrop-blur-md border-b border-stone-200/85 dark:border-slate-800/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Brand mark + wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('overview');
          }}
          className="group inline-flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <FinSightLogo className="w-7 h-7 shrink-0 transition-transform duration-200 group-hover:scale-105" />
          <span>FinSight</span>
        </a>

        {/* Zone 2: Clean single-line navigation links with spring underline */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-3.5 lg:gap-5 xl:gap-6 text-xs lg:text-sm font-medium h-full"
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
                className={`relative h-full inline-flex items-center transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="topbar-active-underline"
                    transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500"
                  />
                )}
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
            className="p-2 text-slate-600 dark:text-slate-300 bg-stone-100 dark:bg-slate-800/90 hover:bg-stone-200/80 dark:hover:bg-slate-700 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer shrink-0"
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
                    className="w-7 h-7 rounded-full object-cover border border-emerald-500/40"
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-stone-100 dark:bg-slate-800 hover:bg-stone-200/80 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="finsight-btn-primary px-4 py-2 text-xs font-semibold text-white rounded-lg whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
