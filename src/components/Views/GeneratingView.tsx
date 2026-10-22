import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Send } from 'lucide-react';
import { GenerationState } from '../../projects/types';

/**
 * What the user sees while Manus works, and when it fails.
 *
 * States are named after what is actually happening. There is no percentage:
 * the API reports a phase and a short brief, not progress, and inventing a bar
 * would be a guess dressed as information.
 */

export interface GeneratingViewProps {
  projectName: string;
  prompt: string;
  state: GenerationState;
  watching: boolean;
  onBackToDashboard: () => void;
  onAnswer: (text: string) => void;
  /** Starts a new, separately billed generation. */
  onRetry: () => void;
  /** Re-runs download and conversion for the task that already finished. */
  onRetryPreparation: () => void;
  /** True when there is a finished task whose preparation can be redone. */
  canRetryPreparation: boolean;
  onStopWatching: () => void;
}

const STEPS: { key: GenerationState['status']; label: string }[] = [
  { key: 'starting', label: 'Uruchamianie zadania' },
  { key: 'generating', label: 'Generowanie strony' },
  { key: 'downloading', label: 'Pobieranie plików' },
  { key: 'importing', label: 'Przygotowanie do edycji' },
  { key: 'ready', label: 'Gotowe' },
];

const ORDER: GenerationState['status'][] = [
  'starting',
  'generating',
  'downloading',
  'importing',
  'ready',
];

export const GeneratingView: React.FC<GeneratingViewProps> = ({
  projectName,
  prompt,
  state,
  watching,
  onBackToDashboard,
  onAnswer,
  onRetry,
  onRetryPreparation,
  canRetryPreparation,
  onStopWatching,
}) => {
  const [reply, setReply] = useState('');
  const currentIndex = ORDER.indexOf(state.status);
  const isError = state.status === 'error';
  const isWaiting = state.status === 'waiting';

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#292824] font-sans flex flex-col">
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between gap-3">
        <button
          onClick={onBackToDashboard}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] text-xs font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#A86645]" />
          Projekty
        </button>
        {state.taskUrl && (
          <a
            href={state.taskUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[#706C65] hover:text-[#292824] flex items-center gap-1 underline underline-offset-4"
          >
            Zadanie w Manus <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 sm:px-10 pb-16">
        <h1 className="text-2xl font-bold tracking-tight mb-1">{projectName}</h1>
        <p className="text-sm text-[#706C65] mb-8 leading-relaxed whitespace-pre-line">{prompt}</p>

        {!isError && (
          <ol className="space-y-2.5 mb-8">
            {STEPS.map((step, index) => {
              const done = currentIndex > index || state.status === 'ready';
              const active = currentIndex === index && state.status !== 'ready';
              return (
                <li
                  key={step.key}
                  className={`flex items-center gap-2.5 text-sm ${
                    done ? 'text-[#292824]' : active ? 'text-[#A86645] font-medium' : 'text-[#706C65]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      done
                        ? 'bg-[#A86645] border-[#A86645]'
                        : active
                          ? 'border-[#A86645]'
                          : 'border-[#DED9CF]'
                    }`}
                  >
                    {active && <Loader2 className="w-2.5 h-2.5 animate-spin text-[#A86645]" />}
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>
        )}

        {state.message && !isError && (
          <p className="text-sm text-[#706C65] mb-6" aria-live="polite">
            {state.message}
          </p>
        )}

        {isWaiting && (
          <section className="p-4 rounded-2xl bg-amber-50 border border-amber-200 mb-6">
            <p className="text-sm text-amber-900 mb-3 leading-relaxed">{state.question}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!reply.trim()) return;
                onAnswer(reply.trim());
                setReply('');
              }}
              className="flex gap-2"
            >
              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                aria-label="Odpowiedź dla Manus"
                placeholder="Twoja odpowiedź…"
                className="flex-1 px-3 py-2 rounded-lg border border-amber-300 bg-[#FFFEFB] text-sm focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!reply.trim()}
                className="px-3 py-2 rounded-lg bg-[#A86645] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
              >
                Wyślij <Send className="w-3 h-3" />
              </button>
            </form>
          </section>
        )}

        {isError && (
          <section className="p-4 rounded-2xl bg-rose-50 border border-rose-200 mb-6">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-900">Nie udało się przygotować strony</p>
                <p className="text-sm text-rose-800 mt-1 leading-relaxed">{state.error}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* The free retry comes first: a download or conversion fault
                  does not need the page designed again. */}
              {canRetryPreparation && (
                <button
                  onClick={onRetryPreparation}
                  className="px-3 py-1.5 rounded-lg bg-[#A86645] text-white text-xs font-semibold"
                >
                  Przygotuj ponownie
                </button>
              )}
              <button
                onClick={onRetry}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  canRetryPreparation
                    ? 'border border-rose-300 text-rose-900'
                    : 'bg-[#A86645] text-white'
                }`}
              >
                {canRetryPreparation ? 'Generuj od nowa' : 'Spróbuj ponownie'}
              </button>
              <button
                onClick={onBackToDashboard}
                className="px-3 py-1.5 rounded-lg border border-rose-300 text-xs"
              >
                Wróć do projektów
              </button>
            </div>
            {canRetryPreparation && (
              <p className="text-[10px] text-rose-800 mt-2 leading-relaxed">
                „Przygotuj ponownie" korzysta z wyniku, który Manus już oddał, i nic nie kosztuje.
                „Generuj od nowa" uruchamia nowe, płatne zadanie.
              </p>
            )}
            {state.rawResult !== null && state.rawResult !== undefined && (
              <details className="mt-3">
                <summary className="text-[11px] text-rose-800 cursor-pointer">
                  Pokaż otrzymany wynik (do diagnozy)
                </summary>
                <pre className="mt-2 p-2 bg-[#FFFEFB] border border-rose-200 rounded-lg text-[10px] overflow-auto max-h-56 whitespace-pre-wrap">
                  {JSON.stringify(state.rawResult, null, 2)}
                </pre>
              </details>
            )}
          </section>
        )}

        {state.warnings.length > 0 && (
          <details className="mb-6">
            <summary className="text-[11px] text-[#706C65] cursor-pointer">
              Ograniczenia konwersji ({state.warnings.length})
            </summary>
            <ul className="mt-2 space-y-1 text-[11px] text-[#706C65]">
              {state.warnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </details>
        )}

        {watching && (
          <button
            onClick={onStopWatching}
            className="text-[11px] text-[#706C65] hover:text-[#292824] underline underline-offset-4"
          >
            Przestań śledzić postęp
          </button>
        )}
        {watching && (
          <p className="text-[10px] text-[#706C65] mt-1.5 leading-relaxed">
            Zatrzymanie dotyczy tylko podglądu w Noderze. Zadanie po stronie Manus działa dalej —
            możesz wrócić do projektu później.
          </p>
        )}
      </main>
    </div>
  );
};
