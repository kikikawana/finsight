import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  MessageSquare,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { GOAL_CATEGORY_LABELS } from '../data/goalPresets';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import type { ScenarioInput } from '../types/finance';
import {
  computeGoalSplitPlan,
  computeHistoricalHorizons,
  formatDurationMonths,
  type CurrencyCode,
} from '../utils/financeMath';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface FinSightChatProps {
  scenario: ScenarioInput;
  currency: CurrencyCode;
  earnedBadgesCount: number;
  totalBadgesCount: number;
}

const SUGGESTED_PROMPTS = [
  'How fast can I reach my goal if I raise my save % to 25%?',
  'I am a student with a ₱1,500/wk allowance. How should I split it?',
  'Should I keep my goal in a 4% digital bank or an index fund?',
  'Compare 1-year, 5-year, and 10-year growth at my weekly rate.',
];

function cleanCoachReply(raw: string): string {
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

export function FinSightChat({
  scenario,
  currency,
  earnedBadgesCount,
  totalBadgesCount,
}: FinSightChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hey! Ask me anything about your goal timeline, allowance splits, or how much faster a higher save % gets you there.',
    },
  ]);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || inFlightRef.current) return;

    inFlightRef.current = true;
    setErrorMsg(null);
    setLoading(true);
    setInput('');

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const historySnapshot = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);

    const replyId = `m_${Date.now()}`;
    let replyCreated = false;

    try {
      const horizons = computeHistoricalHorizons(
        scenario.weeklySavings,
        scenario.initialDeposit,
        scenario.benchmarkId,
        false
      );
      const plan = computeGoalSplitPlan(scenario);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          message: trimmed,
          history: historySnapshot,
          context: {
            goalTitle: scenario.title,
            goalCategoryLabel: GOAL_CATEGORY_LABELS[scenario.goalCategory],
            goalTargetAmount: scenario.goalTargetAmount,
            incomeAmount: scenario.incomeAmount,
            incomeCadence: scenario.incomeCadence,
            savingsPercent: scenario.savingsPercent,
            needsPercent: scenario.needsPercent,
            wantsPercent: scenario.wantsPercent,
            weeklySavings: scenario.weeklySavings,
            initialDeposit: scenario.initialDeposit,
            benchmarkName: BENCHMARK_DATASETS[scenario.benchmarkId].name,
            currency,
            oneYearBalance: horizons[1].endingBalance,
            fiveYearBalance: horizons[5].endingBalance,
            tenYearBalance: horizons[10].endingBalance,
            twentyYearBalance: horizons[20].endingBalance,
            timeToGoalInvested: formatDurationMonths(plan.monthsToGoalInvested),
            timeToGoalCash: formatDurationMonths(plan.monthsToGoalCash),
            earnedBadgesCount,
            totalBadgesCount,
          },
        }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (res.ok && contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedRaw = '';

        const appendDelta = (delta: string) => {
          accumulatedRaw += delta;
          const cleaned = cleanCoachReply(accumulatedRaw);
          if (!replyCreated) {
            replyCreated = true;
            setLoading(false);
            setMessages((prev) => [
              ...prev,
              { id: replyId, role: 'model', text: cleaned || delta },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === replyId ? { ...m, text: cleaned || accumulatedRaw } : m))
            );
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;
            const payload = trimmedLine.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload) as { delta?: string; error?: string };
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.delta) {
                appendDelta(parsed.delta);
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message && !(parseErr instanceof SyntaxError)) {
                throw parseErr;
              }
            }
          }
        }

        if (!replyCreated) {
          throw new Error('Unable to get a reply from FinSight Coach.');
        }
      } else {
        const rawBody = await res.text();
        let data: { reply?: string; error?: string } = {};
        if (rawBody) {
          try {
            data = JSON.parse(rawBody) as { reply?: string; error?: string };
          } catch {
            data = {};
          }
        }

        const cleanedReply = data.reply ? cleanCoachReply(data.reply) : '';
        if (!res.ok || !cleanedReply) {
          throw new Error(data.error || 'Unable to get a reply from FinSight Coach.');
        }

        setMessages((prev) => [
          ...prev,
          {
            id: replyId,
            role: 'model',
            text: cleanedReply,
          },
        ]);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Network issue reaching FinSight Coach. Please try again.'
      );
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="FinSight Help"
            className="mb-3 w-[calc(100vw-2.5rem)] sm:w-[390px] h-[500px] max-h-[75vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 finsight-obsidian-card text-white border-b border-emerald-800/50 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-display font-bold truncate text-white">
                  Piso
                </div>
                <div className="text-[11px] text-emerald-200/80 truncate">
                  Savings &amp; split Q&amp;A
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  aria-label="Clear chat history"
                  onClick={() => {
                    setErrorMsg(null);
                    setMessages([
                      {
                        id: 'welcome',
                        role: 'model',
                        text: 'Chat cleared. Ask me anything about your goal timeline, income percentage splits, or weekly savings compounding.',
                      },
                    ]);
                  }}
                  className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Close FinSight Coach"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50/90 dark:bg-slate-950/70">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const displayText = isUser ? msg.text : cleanCoachReply(msg.text);
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'finsight-btn-primary text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-stone-200 dark:border-slate-800 shadow-xs'
                      }`}
                    >
                      {displayText}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-500 dark:text-slate-400">
                    Checking your numbers…
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2 px-3 py-2.5 text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {messages.length === 1 && !loading && (
                <div className="pt-2 space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Try asking:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={scrollEndRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={handleSubmit}
              className="p-3 bg-white dark:bg-slate-900 border-t border-stone-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about goals, splits, or math…"
                className="flex-1 px-3 py-2 text-xs sm:text-sm bg-stone-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="finsight-btn-primary p-2.5 disabled:opacity-50 text-white rounded-lg cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle Obsidian Forest Helper Launcher */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="finsight-obsidian-card inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white rounded-xl hover:brightness-110 active:scale-[0.98] transition-all duration-150 cursor-pointer whitespace-nowrap"
      >
        {isOpen ? (
          <>
            <X className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
            <span>Close</span>
          </>
        ) : (
          <>
            <MessageSquare className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            <span>Ask Piso</span>
          </>
        )}
      </button>
    </div>
  );
}
