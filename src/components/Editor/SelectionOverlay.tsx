import React from 'react';
import { Move, Palette, Ruler, Type, X } from 'lucide-react';
import { Camera, Rect, documentRectToScreen } from '../../lib/camera';
import { ElementAction } from '../../lib/documentTree';
import { NodeElement } from '../../types/document';

/**
 * Screen-space overlay drawing selection and hover affordances.
 *
 * Lives outside the iframe and outside the scaled artboard, so outlines never
 * affect document layout and their stroke stays 2 screen pixels at any zoom —
 * a hairline at 25% and a slab at 400% would both be unusable.
 */

export interface SelectionOverlayProps {
  camera: Camera;
  /** Bounding box in document coordinates, or null when unknown. */
  selectedRect: Rect | null;
  hoveredRect: Rect | null;
  selectedNode: NodeElement | null;
  hoveredNode: NodeElement | null;
  availableActions: ElementAction[];
  activeAction: ElementAction | null;
  onChooseAction: (action: ElementAction) => void;
  onClearSelection: () => void;
}

const ACTION_META: Record<ElementAction, { label: string; icon: React.ReactNode; title: string }> = {
  text: { label: 'Tekst', icon: <Type className="w-3 h-3" />, title: 'Edytuj treść tekstu' },
  size: { label: 'Rozmiar', icon: <Ruler className="w-3 h-3" />, title: 'Zmień rozmiar i odstępy' },
  appearance: { label: 'Wygląd', icon: <Palette className="w-3 h-3" />, title: 'Zmień kolory i tło' },
  position: { label: 'Położenie', icon: <Move className="w-3 h-3" />, title: 'Korekta optyczna ±1 px (strzałki)' },
};

/** Keeps a floating chip inside the viewport instead of letting it drift off-screen. */
function clampToViewport(value: number, size: number, limit: number): number {
  if (limit <= 0) return value;
  return Math.min(Math.max(value, 4), Math.max(4, limit - size - 4));
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  camera,
  selectedRect,
  hoveredRect,
  selectedNode,
  hoveredNode,
  availableActions,
  activeAction,
  onChooseAction,
  onClearSelection,
}) => {
  const hoverScreen = hoveredRect ? documentRectToScreen(hoveredRect, camera) : null;
  const selectScreen = selectedRect ? documentRectToScreen(selectedRect, camera) : null;

  const showHover =
    hoverScreen && hoveredNode && (!selectedNode || hoveredNode.id !== selectedNode.id);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {showHover && (
        <div
          className="absolute border border-[#A86645]/70 rounded-[1px]"
          style={{
            left: hoverScreen.x,
            top: hoverScreen.y,
            width: hoverScreen.width,
            height: hoverScreen.height,
          }}
        >
          <span className="absolute -top-[18px] left-0 bg-[#A86645]/90 text-white text-[10px] font-medium px-1.5 py-[1px] rounded whitespace-nowrap">
            {hoveredNode.name}
          </span>
        </div>
      )}

      {selectScreen && selectedNode && (
        <div
          className="absolute"
          style={{
            left: selectScreen.x,
            top: selectScreen.y,
            width: selectScreen.width,
            height: selectScreen.height,
          }}
        >
          <div className="absolute inset-0 border-2 border-[#A86645] rounded-[1px]" />

          {/* Label: tag + name, and the optical offset when it is non-zero. */}
          <div
            className="absolute left-0 flex items-center gap-1 whitespace-nowrap"
            style={{ top: -24 }}
          >
            <span className="bg-[#A86645] text-white text-[10px] font-mono font-semibold px-1.5 py-[2px] rounded shadow-sm">
              {selectedNode.tag.toUpperCase()}
            </span>
            <span className="bg-[#292824] text-white text-[10px] px-1.5 py-[2px] rounded shadow-sm max-w-[220px] truncate">
              {selectedNode.name}
            </span>
          </div>

          {/* Local action bar, below the element. Only real actions appear. */}
          <div
            className="absolute left-0 pointer-events-auto"
            style={{ top: selectScreen.height + 8 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-0.5 bg-[#292824] text-white rounded-lg shadow-xl px-1 py-1 text-[11px]">
              {availableActions.map((action) => (
                <button
                  key={action}
                  onClick={() => onChooseAction(action)}
                  title={ACTION_META[action].title}
                  className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                    activeAction === action ? 'bg-[#A86645]' : 'hover:bg-white/15'
                  }`}
                >
                  {ACTION_META[action].icon}
                  <span>{ACTION_META[action].label}</span>
                </button>
              ))}
              <span className="w-px h-4 bg-white/20 mx-0.5" />
              <button
                onClick={onClearSelection}
                title="Odznacz (Escape)"
                className="p-1 rounded hover:bg-white/15"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { clampToViewport };
