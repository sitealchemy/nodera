import React from 'react';
import { 
  Monitor, 
  Tablet, 
  Smartphone, 
  Undo2, 
  Redo2, 
  Share2, 
  CheckCircle2, 
  Code, 
  Sparkles, 
  Layers, 
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Compass
} from 'lucide-react';
import { ViewportDevice, ResponsiveScope, DirectionOption } from '../../types/document';

interface TopBarProps {
  projectName: string;
  directions: Record<string, DirectionOption>;
  activeDirectionId: string;
  onSelectDirection: (dirId: string) => void;
  pages: string[];
  activePageSlug: string;
  onSelectPage: (slug: string) => void;
  viewportDevice: ViewportDevice;
  onSelectViewport: (device: ViewportDevice) => void;
  responsiveScope: ResponsiveScope;
  onSelectResponsiveScope: (scope: ResponsiveScope) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProposal: () => void;
  onOpenPublishChecklist: () => void;
  onOpenCodeExport: () => void;
  onOpenDirectionsView: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  directions,
  activeDirectionId,
  onSelectDirection,
  pages,
  activePageSlug,
  onSelectPage,
  viewportDevice,
  onSelectViewport,
  responsiveScope,
  onSelectResponsiveScope,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenProposal,
  onOpenPublishChecklist,
  onOpenCodeExport,
  onOpenDirectionsView
}) => {
  const activeDirection = directions[activeDirectionId];

  return (
    <header className="h-16 bg-[#FFFEFB] border-b border-[#DED9CF] px-4 flex items-center justify-between z-30 select-none">
      
      {/* Left: Brand, Project & Direction Pill */}
      <div className="flex items-center space-x-3">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#292824] flex items-center justify-center text-white font-serif font-bold text-base shadow-sm">
            N
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-[#292824] tracking-tight">Nodera</span>
              <span className="text-[10px] text-[#706C65] font-medium">by Brainode</span>
            </div>
            <span className="text-[11px] font-semibold text-[#A86645] truncate block max-w-[130px]">
              {projectName}
            </span>
          </div>
        </div>

        <div className="w-[1px] h-6 bg-[#DED9CF] mx-1"></div>

        {/* Direction Switcher Button */}
        <button
          onClick={onOpenDirectionsView}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] rounded-xl text-xs text-[#292824] font-medium transition-colors"
          title="Przeglądaj i porównaj 3 koncepcje projektu"
        >
          <Compass className="w-3.5 h-3.5 text-[#A86645]" />
          <span>Kierunek: <strong className="font-semibold">{activeDirection?.name}</strong></span>
          <ChevronDown className="w-3.5 h-3.5 text-[#706C65]" />
        </button>

        {/* Subpages Tabs */}
        <div className="hidden lg:flex items-center bg-[#F6F4EF] p-1 rounded-xl border border-[#DED9CF] text-xs">
          {pages.map((slug) => {
            const label = 
              slug === 'start' ? 'Start' :
              slug === 'warsztaty' ? 'Warsztaty' :
              slug === 'o-pracowni' ? 'O pracowni' : 'Kontakt';

            return (
              <button
                key={slug}
                onClick={() => onSelectPage(slug)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  activePageSlug === slug
                    ? 'bg-[#FFFEFB] text-[#292824] shadow-sm font-semibold'
                    : 'text-[#706C65] hover:text-[#292824]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

      </div>

      {/* Center: Independent Viewport Width & Edit Scope Controls */}
      <div className="flex items-center space-x-3">
        
        {/* Device Viewport Width Selector */}
        <div className="flex items-center bg-[#F6F4EF] p-1 rounded-xl border border-[#DED9CF] text-xs">
          <button
            onClick={() => onSelectViewport('desktop')}
            className={`p-1.5 rounded-lg transition-all ${
              viewportDevice === 'desktop'
                ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                : 'text-[#706C65] hover:text-[#292824]'
            }`}
            title="Szerokość podglądu: Duże ekrany (1280px)"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectViewport('tablet')}
            className={`p-1.5 rounded-lg transition-all ${
              viewportDevice === 'tablet'
                ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                : 'text-[#706C65] hover:text-[#292824]'
            }`}
            title="Szerokość podglądu: Tablet (768px)"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectViewport('mobile')}
            className={`p-1.5 rounded-lg transition-all ${
              viewportDevice === 'mobile'
                ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                : 'text-[#706C65] hover:text-[#292824]'
            }`}
            title="Szerokość podglądu: Smartfon (375px)"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        {/* Independent Edit Scope (Sekcja 7: Viewport podglądu i zakres edycji są NIEZALEŻNE) */}
        <div className="hidden sm:flex items-center bg-[#F6F4EF] px-2.5 py-1.5 rounded-xl border border-[#DED9CF] text-xs">
          <span className="text-[#706C65] mr-2 text-[11px]">Zakres operacji:</span>
          <select
            value={responsiveScope}
            onChange={(e: any) => onSelectResponsiveScope(e.target.value)}
            className="bg-transparent text-xs font-semibold text-[#A86645] outline-none cursor-pointer"
          >
            <option value="all">Wszystkie ekrany (Wspólne)</option>
            <option value="mobile">Małe ekrany (&lt;768 px)</option>
            <option value="tablet">Tablety (768–1024 px)</option>
          </select>
        </div>

        {/* Undo & Redo */}
        <div className="flex items-center space-x-1 text-[#706C65]">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg hover:bg-[#F6F4EF] hover:text-[#292824] disabled:opacity-40 transition-colors"
            title="Cofnij zmianę (Cmd/Ctrl + Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg hover:bg-[#F6F4EF] hover:text-[#292824] disabled:opacity-40 transition-colors"
            title="Ponów zmianę (Cmd/Ctrl + Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Right: Proposal, Checklist, Export */}
      <div className="flex items-center space-x-2">
        
        {/* Propozycja dla klienta (Snapshot) */}
        <button
          onClick={onOpenProposal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-xs font-medium text-[#292824] transition-colors"
          title="Otwórz niezmienny snapshot propozycji dla klienta z uwagami"
        >
          <Share2 className="w-3.5 h-3.5 text-[#A86645]" />
          <span className="hidden md:inline">Propozycja</span>
        </button>

        {/* Przygotowanie do publikacji */}
        <button
          onClick={onOpenPublishChecklist}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-xs font-medium text-[#292824] transition-colors"
          title="Przegląd przed publikacją (treści, linki, formularze)"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden md:inline">Publikacja</span>
        </button>

        {/* Kod i eksport */}
        <button
          onClick={onOpenCodeExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#292824] hover:bg-[#3d3b36] text-[#FFFEFB] text-xs font-medium shadow-sm transition-colors"
          title="Zobacz semantyczny kod HTML + Tailwind i pobierz projekt"
        >
          <Code className="w-3.5 h-3.5 text-[#A86645]" />
          <span>Eksport</span>
        </button>

      </div>

    </header>
  );
};
