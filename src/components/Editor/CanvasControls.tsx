import React from 'react';
import { Hand, Maximize2, Minus, MousePointer, Plus } from 'lucide-react';

/**
 * The floating canvas bar: pointer mode, hand tool, zoom and fit.
 *
 * One component for both canvases. The node editor and the HTML editor share a
 * camera model, so they must also share these controls — two copies is how
 * they drifted apart, and how one of them quietly lost half the toolbar.
 */

export interface CanvasControlsProps {
  zoom: number;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  handTool: boolean;
  onToggleHandTool: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  onFitWidth: () => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
  zoom,
  selectMode,
  onToggleSelectMode,
  handTool,
  onToggleHandTool,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onFitWidth,
}) => (
  <div
    data-canvas-controls
    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-[#FFFEFB]/95 backdrop-blur border border-[#DED9CF] rounded-xl shadow-md px-1.5 py-1 text-xs"
  >
    <button
      onClick={onToggleSelectMode}
      title="Tryb wybierania (lub przytrzymaj Shift)"
      aria-pressed={selectMode}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
        selectMode ? 'bg-[#A86645] text-white' : 'text-[#706C65] hover:bg-[#F6F4EF]'
      }`}
    >
      <MousePointer className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Wybierz</span>
    </button>
    <button
      onClick={onToggleHandTool}
      title="Narzędzie dłoni (lub przytrzymaj spację)"
      aria-pressed={handTool}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
        handTool ? 'bg-[#A86645] text-white' : 'text-[#706C65] hover:bg-[#F6F4EF]'
      }`}
    >
      <Hand className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Dłoń</span>
    </button>

    <span className="w-px h-4 bg-[#DED9CF] mx-0.5" />

    <button
      onClick={onZoomOut}
      className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF]"
      title="Pomniejsz"
    >
      <Minus className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={onResetZoom}
      className="font-mono text-[11px] w-12 text-center font-semibold text-[#292824] hover:bg-[#F6F4EF] rounded py-1"
      title="Ustaw 100%"
    >
      {Math.round(zoom * 100)}%
    </button>
    <button
      onClick={onZoomIn}
      className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF]"
      title="Powiększ"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={onFitWidth}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] font-medium"
      title="Dopasuj szerokość"
    >
      <Maximize2 className="w-3.5 h-3.5" />
      <span className="hidden md:inline">Dopasuj</span>
    </button>
  </div>
);
