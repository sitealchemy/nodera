import React, { useState, useEffect, useRef } from 'react';
import { 
  NodeElement, 
  ViewportDevice, 
  ResponsiveScope, 
  WorkScope,
  DesignTokens
} from '../../types/document';
import { 
  MousePointer, 
  Move, 
  Type, 
  Maximize2, 
  Eye, 
  Layers, 
  Sliders, 
  ChevronUp, 
  ChevronDown, 
  ArrowLeft, 
  ArrowRight,
  Focus,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';

interface CanvasProps {
  rootElement: NodeElement;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  viewportDevice: ViewportDevice;
  responsiveScope: ResponsiveScope;
  workScope: WorkScope;
  tokens: DesignTokens;
  xrayMode: boolean;
  focusMode: boolean;
  onNudgeElement: (id: string, dx: number, dy: number) => void;
  onUpdateElementContent?: (id: string, newContent: string) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  rootElement,
  selectedElementId,
  onSelectElement,
  viewportDevice,
  responsiveScope,
  workScope,
  tokens,
  xrayMode,
  focusMode,
  onNudgeElement,
  onUpdateElementContent
}) => {
  const [zoom, setZoom] = useState(1);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<'none' | 'text' | 'optical' | 'size' | 'order'>('none');
  const [editingContent, setEditingContent] = useState<string>('');

  const canvasRef = useRef<HTMLDivElement>(null);

  // Shift key toggles temporary selection mode safely without affecting text typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Shift') {
        setIsShiftDown(true);
      } else if (e.key === 'Escape') {
        if (activeAction !== 'none') {
          setActiveAction('none');
        } else if (selectedElementId) {
          onSelectElement(null);
        }
      } else if (selectedElementId && activeAction === 'optical') {
        // Arrow keys nudge ±1px
        if (e.key === 'ArrowLeft') { e.preventDefault(); onNudgeElement(selectedElementId, -1, 0); }
        if (e.key === 'ArrowRight') { e.preventDefault(); onNudgeElement(selectedElementId, 1, 0); }
        if (e.key === 'ArrowUp') { e.preventDefault(); onNudgeElement(selectedElementId, 0, -1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); onNudgeElement(selectedElementId, 0, 1); }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedElementId, activeAction, onNudgeElement, onSelectElement]);

  const effectiveSelectionEnabled = isSelectMode || isShiftDown;

  // Viewport container widths
  const containerWidth = 
    viewportDevice === 'mobile' ? '375px' :
    viewportDevice === 'tablet' ? '768px' : '100%';

  // Recursive Node Renderer
  const renderNode = (node: NodeElement): React.ReactNode => {
    const isSelected = selectedElementId === node.id;
    const isHovered = hoveredElementId === node.id && effectiveSelectionEnabled;
    const isFocused = focusMode && isSelected;
    const isDimmed = focusMode && !isSelected && selectedElementId !== null;

    // Resolve responsive styles
    const baseStyles = { ...node.styles };
    if (viewportDevice === 'mobile' && node.responsiveOverrides?.mobile) {
      Object.assign(baseStyles, node.responsiveOverrides.mobile);
    } else if (viewportDevice === 'tablet' && node.responsiveOverrides?.tablet) {
      Object.assign(baseStyles, node.responsiveOverrides.tablet);
    }

    // Apply optical offset
    const offsetTransform = node.opticalOffset && (node.opticalOffset.x !== 0 || node.opticalOffset.y !== 0)
      ? `translate(${node.opticalOffset.x}px, ${node.opticalOffset.y}px)`
      : undefined;

    const Tag = node.tag as any;

    const handleClick = (e: React.MouseEvent) => {
      if (effectiveSelectionEnabled) {
        e.stopPropagation();
        onSelectElement(node.id);
        if (node.content) setEditingContent(node.content);
      }
    };

    const handleMouseEnter = (e: React.MouseEvent) => {
      if (effectiveSelectionEnabled) {
        e.stopPropagation();
        setHoveredElementId(node.id);
      }
    };

    const handleMouseLeave = () => {
      if (hoveredElementId === node.id) {
        setHoveredElementId(null);
      }
    };

    // Construct inline CSS
    const combinedStyle: React.CSSProperties = {
      ...baseStyles,
      transform: offsetTransform,
      transition: 'box-shadow 0.15s ease, opacity 0.2s ease',
      cursor: effectiveSelectionEnabled ? 'crosshair' : 'default',
      position: node.opticalOffset ? 'relative' : ((baseStyles.position as any) || 'relative'),
      opacity: isDimmed ? 0.35 : (baseStyles.opacity ?? 1),
    } as React.CSSProperties;

    // Render children or text content
    const childrenContent = node.children && node.children.length > 0
      ? node.children.map(c => renderNode(c))
      : node.content;

    return (
      <div
        key={node.id}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`relative group ${
          xrayMode ? 'outline-1 outline-dashed outline-indigo-400/40' : ''
        }`}
      >
        {/* Precise Selection Outline & Badge */}
        {isSelected && (
          <div className="absolute inset-0 border-2 border-[#A86645] pointer-events-none z-30 shadow-sm">
            {/* Tag Badge */}
            <div className="absolute -top-6 left-0 bg-[#A86645] text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-md whitespace-nowrap">
              <span>{node.tag.toUpperCase()}</span>
              <span className="opacity-75">· {node.name}</span>
              {node.opticalOffset && (node.opticalOffset.x !== 0 || node.opticalOffset.y !== 0) && (
                <span className="bg-black/30 px-1 rounded text-[9px]">
                  Δ {node.opticalOffset.x > 0 ? `+${node.opticalOffset.x}` : node.opticalOffset.x}px, {node.opticalOffset.y > 0 ? `+${node.opticalOffset.y}` : node.opticalOffset.y}px
                </span>
              )}
            </div>

            {/* Quick Action Toolbar over selected element */}
            <div className="absolute -bottom-9 left-0 bg-[#292824] text-white rounded-lg shadow-xl px-1.5 py-1 flex items-center gap-1 z-40 pointer-events-auto text-[11px]">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveAction(activeAction === 'text' ? 'none' : 'text'); }}
                className={`px-2 py-0.5 rounded flex items-center gap-1 ${activeAction === 'text' ? 'bg-[#A86645]' : 'hover:bg-white/10'}`}
                title="Edytuj treść tekstu"
              >
                <Type className="w-3 h-3" />
                <span>Tekst</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveAction(activeAction === 'optical' ? 'none' : 'optical'); }}
                className={`px-2 py-0.5 rounded flex items-center gap-1 ${activeAction === 'optical' ? 'bg-[#A86645]' : 'hover:bg-white/10'}`}
                title="Korekta optyczna ±1px (Użyj strzałek na klawiaturze)"
              >
                <Move className="w-3 h-3" />
                <span>Optyka ±1px</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onNudgeElement(node.id, -1, 0); }}
                className="p-1 hover:bg-white/10 rounded"
                title="Przesuń o 1px w lewo"
              >
                <ArrowLeft className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onNudgeElement(node.id, 1, 0); }}
                className="p-1 hover:bg-white/10 rounded"
                title="Przesuń o 1px w prawo"
              >
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Hover Highlight when selection is active */}
        {!isSelected && isHovered && (
          <div className="absolute inset-0 border border-indigo-400/80 pointer-events-none z-20">
            <span className="absolute -top-5 left-0 bg-indigo-600 text-white text-[9px] font-mono px-1 rounded">
              {node.name}
            </span>
          </div>
        )}

        {/* Actual element */}
        {node.tag === 'img' ? (
          <img
            src={node.src}
            alt={node.alt || node.name}
            style={combinedStyle}
            className="select-none pointer-events-none"
          />
        ) : (
          <Tag style={combinedStyle}>
            {childrenContent}
          </Tag>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex-1 bg-[#ECE8DF] overflow-hidden flex flex-col">
      
      {/* Top Floating Controls inside Canvas */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#FFFEFB]/90 backdrop-blur-sm border border-[#DED9CF] p-1.5 rounded-xl shadow-md text-xs">
        
        {/* Safe Select Toggle */}
        <button
          onClick={() => setIsSelectMode(!isSelectMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            effectiveSelectionEnabled
              ? 'bg-[#A86645] text-white shadow-sm'
              : 'text-[#706C65] hover:text-[#292824] hover:bg-[#F6F4EF]'
          }`}
          title="Przytrzymaj Shift lub włącz ten przycisk, aby bezpiecznie zaznaczać elementy"
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Wybierz obiekt</span>
          <span className="text-[10px] opacity-75 font-mono ml-0.5">(Shift)</span>
        </button>

        <div className="w-[1px] h-4 bg-[#DED9CF]"></div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 text-[#706C65]">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            className="p-1 rounded hover:bg-[#F6F4EF] hover:text-[#292824]"
            title="Pomniejsz"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] w-9 text-center font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(1.6, zoom + 0.1))}
            className="p-1 rounded hover:bg-[#F6F4EF] hover:text-[#292824]"
            title="Powiększ"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1 rounded hover:bg-[#F6F4EF] hover:text-[#292824]"
            title="Resetuj zoom (100%)"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

      </div>

      {/* Floating Status Guide (Safe exploration helper) */}
      <div className="absolute top-4 right-4 z-20 hidden md:flex items-center gap-2 bg-[#FFFEFB]/80 backdrop-blur-sm border border-[#DED9CF] px-3 py-1.5 rounded-xl shadow-sm text-[11px] text-[#706C65]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#A86645]"></span>
        <span>
          {effectiveSelectionEnabled 
            ? 'Tryb zaznaczania aktywny — kliknij element' 
            : 'Tryb eksploracji (bezpieczne przewijanie)'}
        </span>
      </div>

      {/* Workspace Scroll Area */}
      <div 
        ref={canvasRef}
        className="flex-1 overflow-auto p-8 flex justify-center items-start"
      >
        <div
          style={{
            width: containerWidth,
            maxWidth: '1280px',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'width 0.25s ease, transform 0.15s ease'
          }}
          className="bg-[#FFFEFB] border border-[#DED9CF] rounded-xl shadow-2xl overflow-hidden min-h-[800px]"
        >
          {renderNode(rootElement)}
        </div>
      </div>

    </div>
  );
};
