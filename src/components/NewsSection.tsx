import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Globe2,
  MapPin,
  Newspaper,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { NewsArticle, NewsFeedResponse } from '../types/finance';
import { getLocalISODate } from '../utils/financeMath';

interface NewsSectionProps {
  isOnline: boolean;
}

type RegionFilter = 'all' | 'local' | 'international';

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Recent';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function NewsArticleCard({ article }: { article: NewsArticle }) {
  const isLocal = article.region === 'local';
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="finsight-card-interactive group block bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 dark:hover:border-emerald-500 rounded-xl p-4 sm:p-5 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium mb-2">
        <span
          className={
            isLocal
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-sky-700 dark:text-sky-400'
          }
        >
          {article.topic}
        </span>
        <span className="font-mono text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
          {formatRelativeTime(article.publishedAt)}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors leading-snug line-clamp-3">
        {article.title}
      </h3>

      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-600 dark:text-slate-300 truncate">
          {article.source}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
          <span>Read</span>
          <ExternalLink
            className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </a>
  );
}

const NEWS_CACHE_KEY = 'finsight-market-news-v1';
const NEWS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedNewsPayload {
  cachedAt: number;
  dayKey: string;
  data: NewsFeedResponse;
}

function readCachedNews(): { fresh: CachedNewsPayload | null; stale: CachedNewsPayload | null } {
  if (typeof window === 'undefined') {
    return { fresh: null, stale: null };
  }
  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return { fresh: null, stale: null };
    const parsed = JSON.parse(raw) as Partial<CachedNewsPayload>;
    if (
      !parsed ||
      typeof parsed.cachedAt !== 'number' ||
      typeof parsed.dayKey !== 'string' ||
      !parsed.data ||
      !Array.isArray(parsed.data.local) ||
      !Array.isArray(parsed.data.international)
    ) {
      return { fresh: null, stale: null };
    }

    const entry = parsed as CachedNewsPayload;
    const within24Hours = Date.now() - entry.cachedAt < NEWS_CACHE_TTL_MS;
    const isSameDay = entry.dayKey === getLocalISODate();
    if (within24Hours && isSameDay) {
      return { fresh: entry, stale: entry };
    }
    return { fresh: null, stale: entry };
  } catch {
    return { fresh: null, stale: null };
  }
}

function writeCachedNews(data: NewsFeedResponse): { cachedAt: number; dayKey: string } {
  const cachedAt = Date.now();
  const dayKey = getLocalISODate();
  if (typeof window !== 'undefined') {
    try {
      const payload: CachedNewsPayload = { cachedAt, dayKey, data };
      window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota or private-mode restrictions
    }
  }
  return { cachedAt, dayKey };
}

export function NewsSection({ isOnline }: NewsSectionProps) {
  const initialCache = useMemo(() => readCachedNews().fresh, []);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feed, setFeed] = useState<NewsFeedResponse | null>(() => initialCache?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => !initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastFetchedDayRef = useRef<string>(initialCache?.dayKey ?? getLocalISODate());
  const lastFetchedMsRef = useRef<number>(initialCache?.cachedAt ?? 0);

  const loadNews = useCallback(async (forceRefresh = false) => {
    const { fresh, stale } = readCachedNews();

    if (!forceRefresh && fresh) {
      setFeed(fresh.data);
      setErrorMsg(null);
      setLoading(false);
      lastFetchedDayRef.current = fresh.dayKey;
      lastFetchedMsRef.current = fresh.cachedAt;
      return;
    }

    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    try {
      const res = await fetch(forceRefresh ? '/api/news?refresh=1' : '/api/news', {
        cache: 'no-store',
      });
      const data = (await res.json()) as NewsFeedResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load recent news headlines.');
      }
      const { cachedAt, dayKey } = writeCachedNews(data);
      setFeed(data);
      lastFetchedDayRef.current = dayKey;
      lastFetchedMsRef.current = cachedAt;
    } catch (err) {
      if (stale) {
        setFeed(stale.data);
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not reach the market news feed right now.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadNews(false);
  }, [loadNews]);

  // Auto-update headlines whenever a new calendar day starts or the 24-hour cache expires
  useEffect(() => {
    const checkDailyFreshness = () => {
      if (!isOnline) return;
      const currentDay = getLocalISODate();
      const expired24h = Date.now() - lastFetchedMsRef.current >= NEWS_CACHE_TTL_MS;
      if (currentDay !== lastFetchedDayRef.current || expired24h) {
        void loadNews(true);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkDailyFreshness();
      }
    };

    const timer = window.setInterval(checkDailyFreshness, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkDailyFreshness);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkDailyFreshness);
    };
  }, [isOnline, loadNews]);

  useEffect(() => {
    if (isOnline && errorMsg) {
      void loadNews(true);
    }
  }, [isOnline, errorMsg, loadNews]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredLocal = useMemo(() => {
    const items = feed?.local ?? [];
    if (!normalizedQuery) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.source.toLowerCase().includes(normalizedQuery) ||
        item.topic.toLowerCase().includes(normalizedQuery)
    );
  }, [feed?.local, normalizedQuery]);

  const filteredInternational = useMemo(() => {
    const items = feed?.international ?? [];
    if (!normalizedQuery) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.source.toLowerCase().includes(normalizedQuery) ||
        item.topic.toLowerCase().includes(normalizedQuery)
    );
  }, [feed?.international, normalizedQuery]);

  return (
    <section
      id="news"
      className="py-12 border-b border-slate-200/80 dark:border-slate-800/80 bg-transparent"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Editorial Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide mb-2">
              <Newspaper className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>Local &amp; International Market Pulse</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              Recent financial news shaping your savings and purchasing power.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              Follow Philippine market news like BSP rate decisions, PSEi moves, and inflation
              alongside S&amp;P 500, Federal Reserve, and digital bank rate updates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {feed?.updatedAt && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {feed.editionDate ? `${feed.editionDate} · ` : ''}
                Updated{' '}
                {new Date(feed.updatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadNews(true)}
              disabled={refreshing || !isOnline}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-600 dark:hover:border-emerald-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{refreshing ? 'Refreshing…' : 'Refresh Feed'}</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Filter news region"
            className="inline-flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg self-start"
          >
            {(
              [
                { id: 'all', label: 'All News' },
                { id: 'local', label: 'Local (Philippines)' },
                { id: 'international', label: 'International' },
              ] as Array<{ id: RegionFilter; label: string }>
            ).map((tab) => {
              const active = regionFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRegionFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter headlines (BSP, S&P 500, inflation…)"
              aria-label="Filter news headlines"
              className="w-full pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400"
            />
          </div>
        </div>

        {feed?.partialError && (
          <div
            role="status"
            className="flex items-center gap-2 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{feed.partialError}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadNews(true)}
              className="px-3 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer self-start sm:self-auto"
            >
              Try Again
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[0, 1].map((col) => (
              <div key={col} className="space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-32 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={
              regionFilter === 'all'
                ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 items-start'
                : 'space-y-4'
            }
          >
            {/* Local (Philippines) Column */}
            {(regionFilter === 'all' || regionFilter === 'local') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                      <MapPin
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Local News · Philippines
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        PSEi, BSP rates, peso inflation &amp; personal finance
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {filteredLocal.length} stories
                  </span>
                </div>

                {filteredLocal.length === 0 ? (
                  <div className="bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No local Philippine headlines match your filter.
                  </div>
                ) : (
                  <div
                    className={
                      regionFilter === 'local'
                        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                        : 'space-y-3'
                    }
                  >
                    {filteredLocal.map((article) => (
                      <NewsArticleCard key={article.id} article={article} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* International Column */}
            {(regionFilter === 'all' || regionFilter === 'international') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800 flex items-center justify-center">
                      <Globe2
                        className="w-4 h-4 text-sky-700 dark:text-sky-400"
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        International News · Global Markets
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        S&amp;P 500, Federal Reserve, global inflation &amp; rates
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {filteredInternational.length} stories
                  </span>
                </div>

                {filteredInternational.length === 0 ? (
                  <div className="bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    No international headlines match your filter.
                  </div>
                ) : (
                  <div
                    className={
                      regionFilter === 'international'
                        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                        : 'space-y-3'
                    }
                  >
                    {filteredInternational.map((article) => (
                      <NewsArticleCard key={article.id} article={article} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
