import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Undo2, 
  CheckCircle2, 
  Sliders, 
  ArrowRight,
  Info
} from 'lucide-react';
import { ResponsiveScope, WorkScope } from '../../types/document';

interface BottomBarProps {
  projectName: string;
  pageName: string;
  selectedElementName: string | null;
  responsiveScope: ResponsiveScope;
  workScope: WorkScope;
  onSubmitCommand: (prompt: string) => void;
  lastExecutionFeedback: {
    summary: string;
    steps: string[];
  } | null;
  onUndoLastAction: () => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  projectName,
  pageName,
  selectedElementName,
  responsiveScope,
  workScope,
  onSubmitCommand,
  lastExecutionFeedback,
  onUndoLastAction
}) => {
  const [promptText, setPromptText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    setIsExecuting(true);
    setTimeout(() => {
      onSubmitCommand(promptText.trim());
      setPromptText('');
      setIsExecuting(false);
    }, 200);
  };

  const samplePrompts = [
    'Wyeksponuj sekcję warsztatów na stronie głównej',
    'Zmień kolor wszystkich przycisków na kobaltowy',
    'Zmień kolor wszystkich przycisków na leśną szałwię',
    'Korekta optyczna X -1px w lewo',
    'Powiększ zaznaczony element o 20%',
    'Kontakt na koniec menu'
  ];

  return (
    <div className="bg-[#FFFEFB] border-t border-[#DED9CF] p-3 sm:p-4 z-30 select-none">
      <div className="max-w-5xl mx-auto space-y-2">
        
        {/* Context Tag over the Command Input (Sekcja 4.C) */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-[#706C65] font-mono text-[11px]">
            <span className="font-semibold text-[#292824]">{projectName}</span>
            <span>·</span>
            <span>{pageName}</span>
            <span>·</span>
            <span className="text-[#A86645] font-semibold bg-[#A86645]/10 px-1.5 py-0.5 rounded">
              {selectedElementName ? `Obiekt: ${selectedElementName}` : 'Cała strona'}
            </span>
            <span>·</span>
            <span className="bg-[#F6F4EF] px-1.5 py-0.5 rounded border border-[#DED9CF]">
              {responsiveScope === 'all' ? 'Wszystkie ekrany' : 'Małe ekrany (<768px)'}
            </span>
          </div>

          {/* Sample quick prompts */}
          <div className="hidden md:flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <span className="text-[#706C65] shrink-0">Szybkie polecenie:</span>
            {samplePrompts.slice(0, 3).map((sp, idx) => (
              <button
                key={idx}
                onClick={() => onSubmitCommand(sp)}
                className="px-2 py-0.5 rounded-lg bg-[#F6F4EF] hover:bg-[#EFECE3] text-[#292824] border border-[#DED9CF] shrink-0 transition-colors"
              >
                {sp}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute left-3.5 text-[#A86645]">
            <Sparkles className="w-4 h-4" />
          </div>

          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Wpisz polecenie, np. „Wyeksponuj warsztaty”, „Zmień kolor przycisków na kobaltowy”, „Powiększ o 20%”..."
            className="w-full pl-10 pr-24 py-2.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-xl text-xs sm:text-sm text-[#292824] placeholder-[#706C65] focus:outline-none focus:border-[#A86645] focus:bg-[#FFFEFB] transition-all"
          />

          <button
            type="submit"
            disabled={!promptText.trim() || isExecuting}
            className="absolute right-1.5 px-3 py-1.5 bg-[#A86645] hover:bg-[#935537] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shadow-sm"
          >
            <span>Wykonaj</span>
            <Send className="w-3 h-3" />
          </button>
        </form>

        {/* Execution Feedback with 1-click Undo */}
        {lastExecutionFeedback && (
          <div className="p-2.5 rounded-xl bg-[#F6F4EF] border border-[#DED9CF] flex items-center justify-between text-xs text-[#292824] animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{lastExecutionFeedback.summary}</span>
            </div>
            <button
              onClick={onUndoLastAction}
              className="flex items-center gap-1 text-[#A86645] hover:underline font-semibold text-xs ml-3 shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Cofnij tę zmianę</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
