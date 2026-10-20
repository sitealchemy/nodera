import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Send, Sparkles, Undo2 } from 'lucide-react';
import { ResponsiveScope } from '../../types/document';

/**
 * The command field at the bottom edge.
 *
 * Collapsed it is a single small pill, so it never covers a meaningful slice of
 * the page. It expands on activation, and Escape collapses it while keeping
 * whatever has been typed — losing a half-written instruction to a stray
 * keypress is worse than leaving the field open.
 */

export interface CommandFeedback {
  summary: string;
  steps: string[];
}

export interface CommandDockProps {
  pageName: string;
  selectedElementName: string | null;
  responsiveScope: ResponsiveScope;
  onSubmitCommand: (prompt: string) => void;
  feedback: CommandFeedback | null;
  onUndoLastAction: () => void;
  onDismissFeedback: () => void;
}

const SCOPE_LABEL: Record<ResponsiveScope, string> = {
  all: 'Wszystkie ekrany',
  tablet: 'Tablety',
  mobile: 'Małe ekrany',
};

export const CommandDock: React.FC<CommandDockProps> = ({
  pageName,
  selectedElementName,
  responsiveScope,
  onSubmitCommand,
  feedback,
  onUndoLastAction,
  onDismissFeedback,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [stepsOpen, setStepsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const collapse = useCallback(() => {
    setExpanded(false);
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    onSubmitCommand(text);
    setPrompt('');
    setStepsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Collapse without clearing: the text survives.
      event.stopPropagation();
      collapse();
    }
  };

  if (!expanded) {
    return (
      <div className="absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2">
        {feedback && (
          <div className="flex items-center gap-2 bg-[#FFFEFB] border border-[#DED9CF] rounded-xl shadow-md px-3 py-2 text-[11px] max-w-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-[#292824] truncate">{feedback.summary}</span>
            <button
              onClick={onUndoLastAction}
              className="text-[#A86645] font-semibold hover:underline shrink-0 flex items-center gap-1"
            >
              <Undo2 className="w-3 h-3" />
              Cofnij
            </button>
          </div>
        )}
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 bg-[#FFFEFB] border border-[#DED9CF] rounded-xl shadow-md px-3.5 py-2.5 text-xs text-[#706C65] hover:text-[#292824] hover:border-[#A86645]/50 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#A86645]" />
          <span>Co chcesz zmienić?</span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(42rem,calc(100%-2rem))]">
      <div className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl shadow-xl p-2.5 space-y-2">
        {/* Context: what this command will act on. */}
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-mono text-[#706C65] flex-wrap">
          <span>{pageName}</span>
          <span>·</span>
          <span className="text-[#A86645] font-semibold bg-[#A86645]/10 px-1.5 py-0.5 rounded">
            {selectedElementName ? `Obiekt: ${selectedElementName}` : 'Cała strona'}
          </span>
          <span>·</span>
          <span className="bg-[#F6F4EF] px-1.5 py-0.5 rounded border border-[#DED9CF]">
            {SCOPE_LABEL[responsiveScope]}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="relative flex items-center">
          <Sparkles className="absolute left-3 w-4 h-4 text-[#A86645] pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="np. „Zmień kolor przycisków na kobaltowy”"
            className="w-full pl-9 pr-20 py-2.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-xl text-sm text-[#292824] placeholder-[#706C65] focus:outline-none focus:border-[#A86645] focus:bg-[#FFFEFB] transition-colors"
          />
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="absolute right-1.5 px-3 py-1.5 bg-[#A86645] hover:bg-[#935537] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          >
            <span>Wykonaj</span>
            <Send className="w-3 h-3" />
          </button>
        </form>

        {feedback && (
          <div className="rounded-xl bg-[#F6F4EF] border border-[#DED9CF] px-2.5 py-2 text-[11px]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[#292824] flex-1 min-w-0 truncate">{feedback.summary}</span>
              {feedback.steps.length > 0 && (
                <button
                  onClick={() => setStepsOpen((open) => !open)}
                  className="text-[#706C65] hover:text-[#292824] flex items-center gap-0.5 shrink-0"
                  title={stepsOpen ? 'Zwiń szczegóły' : 'Pokaż szczegóły'}
                >
                  <span>Szczegóły</span>
                  {stepsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={onUndoLastAction}
                className="text-[#A86645] font-semibold hover:underline shrink-0 flex items-center gap-1"
              >
                <Undo2 className="w-3 h-3" />
                Cofnij
              </button>
            </div>
            {stepsOpen && (
              <ul className="mt-2 pt-2 border-t border-[#DED9CF] space-y-1 text-[#706C65]">
                {feedback.steps.map((step, index) => (
                  <li key={index} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-[#706C65]">Escape zwija pole, nie kasuje treści.</span>
          <button
            onClick={() => {
              onDismissFeedback();
              collapse();
            }}
            className="text-[10px] text-[#706C65] hover:text-[#292824]"
          >
            Zwiń
          </button>
        </div>
      </div>
    </div>
  );
};
