import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import { FinSightMascot } from './FinSightMascot';
import type { ScenarioInput } from '../types/finance';
import {
  computeHistoricalHorizons,
  computeRentVsEquity,
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
  'How fast can I reach my down payment if I add ₱150/wk?',
  'Explain my 20-year rent vs. equity numbers.',
  'Why compare S&P 500 vs. PSEi for peso savings?',
  'How do I unlock the First Month of Consistency badge?',
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
      text: 'Hi! I am Piso, your FinSight AI Coach. Ask me about your weekly compounding projections, historical S&P 500 vs. PSEi returns, or how to turn your monthly rent into home equity.',
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
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);

    try {
      const horizons = computeHistoricalHorizons(
        scenario.weeklySavings,
        scenario.initialDeposit,
        scenario.benchmarkId,
        false
      );
      const rentModel = computeRentVsEquity(scenario);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historySnapshot,
          context: {
            weeklySavings: scenario.weeklySavings,
            initialDeposit: scenario.initialDeposit,
            benchmarkName: BENCHMARK_DATASETS[scenario.benchmarkId].name,
            currency,
            fiveYearBalance: horizons[5].endingBalance,
            tenYearBalance: horizons[10].endingBalance,
            twentyYearBalance: horizons[20].endingBalance,
            monthlyRent: scenario.monthlyRent,
            targetHomePrice: scenario.targetHomePrice,
            requiredDownPayment: rentModel.requiredDownPayment,
            yearsToDownPayment: rentModel.yearsToDownPayment,
            monthlyMortgagePI: rentModel.monthlyMortgagePI,
            earnedBadgesCount,
            totalBadgesCount,
          },
        }),
      });

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
          id: `m_${Date.now()}`,
          role: 'model',
          text: cleanedReply,
        },
      ]);
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
            aria-label="FinSight AI Coach"
            className="mb-3 w-[calc(100vw-2.5rem)] sm:w-[400px] h-[520px] max-h-[75vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <FinSightMascot
                    mood={loading ? 'thinking' : 'happy'}
                    className="w-8 h-8"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    Piso · FinSight AI Coach
                  </div>
                  <div className="text-[11px] text-emerald-100 truncate">
                    Live answers on your savings &amp; rent numbers
                  </div>
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
                        text: 'Chat cleared. Ask me anything about your weekly savings plan, historical returns, or home down payment timeline.',
                      },
                    ]);
                  }}
                  className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Close AI Coach"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950/60">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const displayText = isUser ? msg.text : cleanCoachReply(msg.text);
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                        <FinSightMascot mood="idle" className="w-6 h-6" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-emerald-700 text-white rounded-br-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-bl-sm'
                      }`}
                    >
                      {displayText}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-end gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                    <FinSightMascot mood="thinking" className="w-6 h-6" />
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    Piso is analyzing your scenario…
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
                        className="text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors cursor-pointer"
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
              className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about savings, rent, or math…"
                className="flex-1 px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="p-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button with Piso Mascot */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2.5 pl-2.5 pr-4 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer whitespace-nowrap"
      >
        {isOpen ? (
          <>
            <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
              <X className="w-4 h-4" aria-hidden="true" />
            </span>
            <span>Close Piso</span>
          </>
        ) : (
          <>
            <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
              <FinSightMascot mood="happy" className="w-6 h-6" />
            </span>
            <span>Ask Piso AI</span>
          </>
        )}
      </button>
    </div>
  );
}
