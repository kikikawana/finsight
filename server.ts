import express from 'express';
import fs from 'fs';
import http from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface NewsArticlePayload {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  link: string;
  region: 'local' | 'international';
  topic: string;
}

interface NewsCacheEntry {
  fetchedAt: number;
  dayKey: string;
  updatedAt: string;
  local: NewsArticlePayload[];
  international: NewsArticlePayload[];
  partialError?: string;
}

let newsCache: NewsCacheEntry | null = null;
let inFlightNewsRefresh: Promise<NewsCacheEntry> | null = null;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const NEWS_BACKGROUND_REFRESH_MS = 6 * 60 * 60 * 1000;

function getManilaDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTagValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]) : '';
}

function classifyNewsTopic(title: string, region: 'local' | 'international'): string {
  const lower = title.toLowerCase();
  if (/housing|condo|real estate|mortgage|pag-ibig|property|rent|home/.test(lower)) {
    return 'Housing & Property';
  }
  if (/bsp|bangko sentral|fed|federal reserve|rate|yield|central bank|ecb|boj/.test(lower)) {
    return 'Rates & Central Banks';
  }
  if (/inflation|cpi|gdp|economy|economic|recession|jobs/.test(lower)) {
    return 'Inflation & Macro';
  }
  if (/peso|dollar|php|usd|forex|currency|fx/.test(lower)) {
    return 'Currency & FX';
  }
  return region === 'local' ? 'Philippine Markets' : 'Global Equities';
}

function parseGoogleNewsRss(
  xml: string,
  region: 'local' | 'international',
  maxItems = 8
): NewsArticlePayload[] {
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
  const parsed: NewsArticlePayload[] = [];
  const seenTitles = new Set<string>();

  for (let i = 0; i < itemMatches.length; i++) {
    const raw = itemMatches[i];
    let title = extractTagValue(raw, 'title');
    const link = extractTagValue(raw, 'link');
    const pubDateRaw = extractTagValue(raw, 'pubDate');
    const source = extractTagValue(raw, 'source') || (region === 'local' ? 'PH Business' : 'Global Desk');

    if (!title || !/^https?:\/\//i.test(link)) continue;

    // Strip Google News trailing " - Source Name" suffix when source matches
    const suffix = ` - ${source}`;
    if (title.endsWith(suffix) && title.length > suffix.length + 10) {
      title = title.slice(0, -suffix.length).trim();
    }

    const dedupeKey = title.toLowerCase();
    if (seenTitles.has(dedupeKey)) continue;
    seenTitles.add(dedupeKey);

    const parsedDate = pubDateRaw ? new Date(pubDateRaw) : null;
    const publishedAt =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : new Date().toISOString();

    parsed.push({
      id: `${region}_${i}_${Buffer.from(link).toString('base64url').slice(0, 12)}`,
      title,
      source,
      publishedAt,
      link,
      region,
      topic: classifyNewsTopic(title, region),
    });
  }

  parsed.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return parsed.slice(0, maxItems);
}

async function fetchRssFeed(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FinSight-NewsReader/1.0 (+https://finsight.local)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });
    if (!response.ok) {
      throw new Error(`Feed HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRegionNews(
  primaryUrl: string,
  fallbackUrl: string,
  region: 'local' | 'international'
): Promise<NewsArticlePayload[]> {
  const primaryXml = await fetchRssFeed(primaryUrl);
  const primaryItems = parseGoogleNewsRss(primaryXml, region, 8);
  if (primaryItems.length >= 6) {
    return primaryItems;
  }
  try {
    const fallbackXml = await fetchRssFeed(fallbackUrl);
    const fallbackItems = parseGoogleNewsRss(fallbackXml, region, 8);
    const merged: NewsArticlePayload[] = [];
    const seen = new Set<string>();
    for (const item of [...primaryItems, ...fallbackItems]) {
      const key = item.title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return merged.slice(0, 8);
  } catch {
    return primaryItems;
  }
}

async function refreshNewsCache(forceRefresh = false): Promise<NewsCacheEntry> {
  const todayKey = getManilaDateKey();
  if (
    !forceRefresh &&
    newsCache &&
    newsCache.dayKey === todayKey &&
    Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL_MS
  ) {
    return newsCache;
  }

  if (inFlightNewsRefresh) {
    return inFlightNewsRefresh;
  }

  inFlightNewsRefresh = (async () => {
    const localPrimaryUrl =
      'https://news.google.com/rss/search?q=(Philippines+economy+OR+PSEi+OR+Bangko+Sentral+OR+Pag-IBIG+housing+OR+Philippine+peso+inflation)+when:7d&hl=en-PH&gl=PH&ceid=PH:en';
    const localFallbackUrl =
      'https://news.google.com/rss/search?q=(Philippines+economy+OR+PSEi+OR+Bangko+Sentral+OR+Pag-IBIG+housing+OR+Philippine+peso+inflation)+when:14d&hl=en-PH&gl=PH&ceid=PH:en';

    const intlPrimaryUrl =
      'https://news.google.com/rss/search?q=(S%26P+500+OR+Federal+Reserve+OR+global+stock+market+OR+global+inflation+OR+mortgage+rates)+when:2d&hl=en-US&gl=US&ceid=US:en';
    const intlFallbackUrl =
      'https://news.google.com/rss/search?q=(S%26P+500+OR+Federal+Reserve+OR+global+stock+market+OR+global+inflation+OR+mortgage+rates)+when:7d&hl=en-US&gl=US&ceid=US:en';

    const [localRes, intlRes] = await Promise.allSettled([
      fetchRegionNews(localPrimaryUrl, localFallbackUrl, 'local'),
      fetchRegionNews(intlPrimaryUrl, intlFallbackUrl, 'international'),
    ]);

    const local = localRes.status === 'fulfilled' ? localRes.value : [];
    const international = intlRes.status === 'fulfilled' ? intlRes.value : [];

    if (local.length === 0 && international.length === 0) {
      if (newsCache) {
        return {
          ...newsCache,
          partialError: 'Showing previous headlines; live feeds are temporarily unreachable.',
        };
      }
      throw new Error('Unable to fetch recent local and international news right now.');
    }

    let partialError: string | undefined;
    if (local.length === 0) {
      partialError = 'Local Philippine news feed is temporarily unavailable.';
    } else if (international.length === 0) {
      partialError = 'International markets feed is temporarily unavailable.';
    }

    const entry: NewsCacheEntry = {
      fetchedAt: Date.now(),
      dayKey: getManilaDateKey(),
      updatedAt: new Date().toISOString(),
      local,
      international,
      partialError,
    };
    newsCache = entry;
    return entry;
  })();

  try {
    return await inFlightNewsRefresh;
  } finally {
    inFlightNewsRefresh = null;
  }
}

interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

interface ChatContextPayload {
  weeklySavings?: number;
  initialDeposit?: number;
  benchmarkName?: string;
  currency?: string;
  fiveYearBalance?: number;
  tenYearBalance?: number;
  twentyYearBalance?: number;
  monthlyRent?: number;
  targetHomePrice?: number;
  requiredDownPayment?: number;
  yearsToDownPayment?: number | null;
  monthlyMortgagePI?: number;
  earnedBadgesCount?: number;
  totalBadgesCount?: number;
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/news', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const forceRefresh = req.query.refresh === '1';
      const entry = await refreshNewsCache(forceRefresh);

      res.json({
        editionDate: entry.dayKey,
        updatedAt: entry.updatedAt,
        local: entry.local,
        international: entry.international,
        partialError: entry.partialError,
      });
    } catch (error) {
      console.error('GET /api/news error:', error);
      res.status(502).json({
        error: 'Unable to fetch recent local and international news right now. Please try refreshing.',
      });
    }
  });

  function stripMarkdownAsterisks(raw: string): string {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/^(\s*)\*\s+/gm, '$1• ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/(\d|\))\s*\*\s*(\d|\()/g, '$1 × $2')
      .replace(/\*\*\*([\s\S]*?)\*\*\*/g, '$1')
      .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
      .replace(/\*([^*\n]+?)\*/g, '$1')
      .replace(/\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractGeminiErrorInfo(error: unknown): {
    status?: number;
    apiStatus?: string;
    message: string;
  } {
    const errObj = error as { status?: number; message?: string } | null;
    const rawMsg =
      error instanceof Error
        ? error.message
        : typeof errObj?.message === 'string'
          ? errObj.message
          : 'Unable to reach AI Coach.';

    let parsedStatus = typeof errObj?.status === 'number' ? errObj.status : undefined;
    let parsedApiStatus: string | undefined;
    let parsedMessage = rawMsg;

    const jsonStart = rawMsg.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(rawMsg.slice(jsonStart)) as {
          error?: { code?: number; message?: string; status?: string };
        };
        if (parsed?.error) {
          if (typeof parsed.error.code === 'number') {
            parsedStatus ??= parsed.error.code;
          }
          if (typeof parsed.error.status === 'string') {
            parsedApiStatus = parsed.error.status;
          }
          if (typeof parsed.error.message === 'string' && parsed.error.message.trim()) {
            parsedMessage = parsed.error.message.trim();
          }
        }
      } catch {
        // Keep raw message when non-JSON
      }
    }

    return {
      status: parsedStatus,
      apiStatus: parsedApiStatus,
      message: parsedMessage,
    };
  }

  function isRetryableGeminiError(info: { status?: number; apiStatus?: string; message: string }): boolean {
    if (info.status === 429 || info.status === 500 || info.status === 502 || info.status === 503 || info.status === 504) {
      return true;
    }
    const upper = `${info.apiStatus ?? ''} ${info.message}`.toUpperCase();
    return (
      upper.includes('UNAVAILABLE') ||
      upper.includes('INTERNAL') ||
      upper.includes('RESOURCE_EXHAUSTED') ||
      upper.includes('FETCH FAILED') ||
      upper.includes('ECONNRESET') ||
      upper.includes('ETIMEDOUT')
    );
  }

  app.post('/api/chat', async (req, res) => {
    try {
      const body = req.body as {
        message?: unknown;
        history?: unknown;
        context?: ChatContextPayload;
      };

      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      if (!message || message.length > 2000) {
        res.status(400).json({ error: 'Please enter a valid message under 2,000 characters.' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({
          error: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      const rawHistory = Array.isArray(body?.history) ? body.history.slice(-10) : [];
      const historyContents = rawHistory
        .filter(
          (item): item is ChatHistoryItem =>
            typeof item === 'object' &&
            item !== null &&
            (item.role === 'user' || item.role === 'model') &&
            typeof item.text === 'string' &&
            item.text.trim().length > 0
        )
        .map((item) => ({
          role: item.role,
          parts: [{ text: item.text.slice(0, 2000) }],
        }));

      const ctx = body?.context ?? {};
      const contextSummary = [
        `Weekly Savings: ₱${ctx.weeklySavings ?? 250}/wk`,
        `Initial Deposit: ₱${ctx.initialDeposit ?? 0}`,
        `Selected Benchmark: ${ctx.benchmarkName ?? 'S&P 500 Total Return Index'}`,
        `Display Currency: ${ctx.currency ?? 'PHP'}`,
        `Projected Balances (2005-2024 historical replay): 5-yr=₱${Math.round(ctx.fiveYearBalance ?? 0)}, 10-yr=₱${Math.round(ctx.tenYearBalance ?? 0)}, 20-yr=₱${Math.round(ctx.twentyYearBalance ?? 0)}`,
        `Monthly Rent: ₱${ctx.monthlyRent ?? 12000}/mo`,
        `Target Home Price: ₱${ctx.targetHomePrice ?? 2400000}`,
        `Required Down Payment: ₱${Math.round(ctx.requiredDownPayment ?? 480000)}`,
        `Estimated Years to Down Payment: ${ctx.yearsToDownPayment !== null && ctx.yearsToDownPayment !== undefined ? `${ctx.yearsToDownPayment} years` : 'Over 20 years at current pace'}`,
        `Estimated Monthly Mortgage P&I: ₱${Math.round(ctx.monthlyMortgagePI ?? 0)}/mo`,
        `Milestones Earned: ${ctx.earnedBadgesCount ?? 0} of ${ctx.totalBadgesCount ?? 8}`,
      ].join('\n');

      const systemInstruction = `You are Piso, the FinSight AI Coach—a clear, encouraging, and mathematically grounded personal finance guide inside the FinSight web app.
Focus on:
• Helping Filipino and global peso savers understand weekly micro-investing (even ₱50–₱250/week) using FinSight's actual 2005–2024 historical returns for S&P 500 Total Return, PSEi Total Return, and Balanced 60/40.
• Explaining how saving for a down payment lets monthly rent transition into home mortgage equity.
• Explaining FinSight's milestone badges (First Step Taken, First 1,000 Pesos Saved, First Month of Consistency across 4 distinct weeks, etc.).
• Keep answers concise (2–4 short paragraphs or bullet points), reference the user's current numbers below accurately, and remind users that historical simulations are educational rather than guaranteed future returns.

Formatting rules (strict):
• Output clean plain text ONLY. NEVER use asterisks (* or **), Markdown bold/italics, Markdown headings (#), or code backticks.
• For bullet points, start lines with "• " or numbered items like "1. ".
• Use "×" instead of "*" for any multiplication formulas.

User's live FinSight workspace snapshot (base PHP values):
${contextSummary}`;

      const contents = [
        ...historyContents,
        { role: 'user' as const, parts: [{ text: message }] },
      ];

      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastError: unknown;
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          break;
        } catch (err) {
          lastError = err;
          const info = extractGeminiErrorInfo(err);
          if (attempt < maxAttempts && isRetryableGeminiError(info)) {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            continue;
          }
          throw err;
        }
      }

      if (!response) {
        throw lastError ?? new Error('No response from Gemini.');
      }

      const rawReply = (response.text ?? '').trim();
      const reply = stripMarkdownAsterisks(rawReply);
      if (!reply) {
        res.status(502).json({ error: 'Received an empty response from Gemini. Please try again.' });
        return;
      }

      res.json({ reply });
    } catch (error) {
      const info = extractGeminiErrorInfo(error);
      console.error(`Gemini /api/chat error (status=${info.status ?? 'unknown'}, apiStatus=${info.apiStatus ?? 'none'}):`, info.message);

      const upper = `${info.apiStatus ?? ''} ${info.message}`.toUpperCase();
      if (info.status === 429 || upper.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({ error: 'AI Coach rate limit reached. Please wait a moment and try again.' });
        return;
      }
      if (
        info.status === 401 ||
        info.status === 403 ||
        upper.includes('PERMISSION_DENIED') ||
        upper.includes('API_KEY_INVALID') ||
        upper.includes('API KEY NOT VALID')
      ) {
        res.status(403).json({ error: 'Check your GEMINI_API_KEY configuration in Settings > Secrets.' });
        return;
      }
      if (info.status === 404 || upper.includes('NOT_FOUND')) {
        res.status(502).json({ error: 'Configured AI model is temporarily unavailable. Please try again.' });
        return;
      }
      if (info.status === 503 || upper.includes('UNAVAILABLE')) {
        res.status(503).json({ error: 'AI Coach service is temporarily busy. Please try again in a moment.' });
        return;
      }
      res.status(502).json({ error: 'Unable to generate a response right now. Please try again.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`FinSight server listening on http://0.0.0.0:${PORT}`);
    // Warm today's news cache and keep it refreshed across daily rollovers
    void refreshNewsCache(false).catch(() => undefined);
    setInterval(() => {
      void refreshNewsCache(true).catch(() => undefined);
    }, NEWS_BACKGROUND_REFRESH_MS).unref();
  });
}

void startServer();
