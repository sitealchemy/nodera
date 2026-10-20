import React from 'react';
import { 
  NodeElement, 
  ResponsiveScope, 
  OpticalOffset, 
  ElementStyles 
} from '../../types/document';
import { 
  Sliders, 
  Move, 
  Type, 
  Trash2, 
  X, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  RotateCcw,
  Smartphone,
  Monitor
} from 'lucide-react';

interface SidebarRightProps {
  selectedElement: NodeElement | null;
  onDeselect: () => void;
  onUpdateStyles: (styles: Partial<ElementStyles>) => void;
  onUpdateContent: (content: string) => void;
  onNudge: (dx: number, dy: number) => void;
  onResetNudge: () => void;
  responsiveScope: ResponsiveScope;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  selectedElement,
  onDeselect,
  onUpdateStyles,
  onUpdateContent,
  onNudge,
  onResetNudge,
  responsiveScope
}) => {
  if (!selectedElement) {
    return (
      <aside className="w-72 bg-[#FFFEFB] border-l border-[#DED9CF] p-5 flex flex-col items-center justify-center text-center text-xs text-[#706C65] select-none">
        <Sliders className="w-8 h-8 text-[#DED9CF] mb-2" />
        <p className="font-medium text-[#292824]">Brak zaznaczonego obiektu</p>
        <p className="text-[11px] mt-1 max-w-[180px]">
          Przytrzymaj Shift na płótnie lub kliknij „Wybierz obiekt”, aby badać i precyzyjnie korygować elementy.
        </p>
      </aside>
    );
  }

  const offset = selectedElement.opticalOffset || { x: 0, y: 0 };
  const isMobileOverride = responsiveScope === 'mobile';
  const effectiveStyles = isMobileOverride && selectedElement.responsiveOverrides?.mobile
    ? { ...selectedElement.styles, ...selectedElement.responsiveOverrides.mobile }
    : selectedElement.styles;

  return (
    <aside className="w-72 bg-[#FFFEFB] border-l border-[#DED9CF] flex flex-col h-[calc(100vh-4rem-5rem)] select-none">
      
      {/* Header */}
      <div className="p-3.5 border-b border-[#DED9CF] flex items-center justify-between bg-[#F6F4EF]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-[10px] font-mono uppercase bg-[#A86645] text-white px-1.5 py-0.5 rounded font-bold">
            {selectedElement.tag}
          </span>
          <span className="text-xs font-semibold text-[#292824] truncate">
            {selectedElement.name}
          </span>
        </div>
        <button
          onClick={onDeselect}
          className="p-1 rounded hover:bg-[#DED9CF] text-[#706C65] hover:text-[#292824]"
          title="Odznacz element (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        
        {/* Scope Indicator */}
        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${
          isMobileOverride
            ? 'bg-[#A86645]/10 border-[#A86645]/30 text-[#A86645]'
            : 'bg-[#F6F4EF] border-[#DED9CF] text-[#706C65]'
        }`}>
          {isMobileOverride ? <Smartphone className="w-4 h-4 shrink-0" /> : <Monitor className="w-4 h-4 shrink-0" />}
          <div>
            <span className="font-semibold block text-[11px]">
              {isMobileOverride ? 'Edytujesz nadpisanie dla smartfona' : 'Edytujesz regułę wspólną (Desktop + Mobile)'}
            </span>
          </div>
        </div>

        {/* Text content editor */}
        {selectedElement.content !== undefined && (
          <div className="space-y-1.5">
            <label className="font-semibold text-[#292824] flex items-center gap-1">
              <Type className="w-3.5 h-3.5 text-[#A86645]" />
              <span>Treść elementu</span>
            </label>
            <textarea
              value={selectedElement.content}
              onChange={(e) => onUpdateContent(e.target.value)}
              rows={3}
              className="w-full p-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs text-[#292824] focus:outline-none focus:border-[#A86645] resize-none"
            />
          </div>
        )}

        {/* Optical Offset Tool (Sekcja 6: Korekta optyczna ±1px) */}
        <div className="p-3 bg-[#F6F4EF] border border-[#DED9CF] rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#292824] flex items-center gap-1">
              <Move className="w-3.5 h-3.5 text-[#A86645]" />
              <span>Korekta optyczna (±1 px)</span>
            </span>
            {(offset.x !== 0 || offset.y !== 0) && (
              <button
                onClick={onResetNudge}
                className="text-[10px] text-[#A86645] hover:underline flex items-center gap-0.5"
                title="Zresetuj przesunięcie do 0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
          <p className="text-[10px] text-[#706C65] leading-relaxed">
            Zmienia mikro-położenie bez rozpychania sąsiadujących elementów w układzie.
          </p>

          <div className="flex items-center justify-between pt-1">
            <div className="text-center">
              <span className="text-[10px] text-[#706C65] uppercase block font-mono">Offset X</span>
              <span className="font-mono font-bold text-xs text-[#292824]">{offset.x} px</span>
            </div>
            
            {/* Directional Pad */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => onNudge(0, -1)}
                className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded text-[#292824]"
                title="W górę (-1px)"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <div className="flex gap-1">
                <button
                  onClick={() => onNudge(-1, 0)}
                  className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded text-[#292824]"
                  title="W lewo (-1px)"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onNudge(1, 0)}
                  className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded text-[#292824]"
                  title="W prawo (+1px)"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => onNudge(0, 1)}
                className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded text-[#292824]"
                title="W dół (+1px)"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>

            <div className="text-center">
              <span className="text-[10px] text-[#706C65] uppercase block font-mono">Offset Y</span>
              <span className="font-mono font-bold text-xs text-[#292824]">{offset.y} px</span>
            </div>
          </div>
        </div>

        {/* Typography & Spacing */}
        <div className="space-y-3">
          <span className="font-semibold text-[#292824] block uppercase text-[10px] tracking-wider text-[#706C65]">
            Wymiary & Odstępy
          </span>

          {/* Font Size */}
          {effectiveStyles.fontSize && (
            <div className="flex items-center justify-between">
              <span className="text-[#706C65]">Rozmiar tekstu</span>
              <input
                type="text"
                value={effectiveStyles.fontSize}
                onChange={(e) => onUpdateStyles({ fontSize: e.target.value })}
                className="w-20 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded text-right font-mono text-xs text-[#292824]"
              />
            </div>
          )}

          {/* Padding */}
          {effectiveStyles.padding && (
            <div className="flex items-center justify-between">
              <span className="text-[#706C65]">Dopełnienie (Padding)</span>
              <input
                type="text"
                value={effectiveStyles.padding}
                onChange={(e) => onUpdateStyles({ padding: e.target.value })}
                className="w-24 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded text-right font-mono text-xs text-[#292824]"
              />
            </div>
          )}

          {/* Border Radius */}
          {effectiveStyles.borderRadius && (
            <div className="flex items-center justify-between">
              <span className="text-[#706C65]">Zaokrąglenie rogów</span>
              <input
                type="text"
                value={effectiveStyles.borderRadius}
                onChange={(e) => onUpdateStyles({ borderRadius: e.target.value })}
                className="w-20 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded text-right font-mono text-xs text-[#292824]"
              />
            </div>
          )}
        </div>

      </div>

    </aside>
  );
};
