import React, { useLayoutEffect, useRef, useState } from 'react';
import { Crosshair, Move, Palette, Ruler, Type, X } from 'lucide-react';
import { Camera, Rect, documentRectToScreen } from '../../lib/camera';
import { ElementAction } from '../../lib/documentTree';
import {
  DEFAULT_INSETS,
  Insets,
  isSelectionOffscreen,
  placeNearSelection,
} from '../../lib/overlayPlacement';
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
  /** Bounding boxes in document coordinates, or null when unknown. */
  selectedRect: Rect | null;
  hoveredRect: Rect | null;
  selectedNode: NodeElement | null;
  hoveredNode: NodeElement | null;
  availableActions: ElementAction[];
  activeAction: ElementAction | null;
  onChooseAction: (action: ElementAction) => void;
  onClearSelection: () => void;
  /** Brings an off-screen selection back into view. */
  onRevealSelection: () => void;
  /** Space taken by surrounding chrome, so tools stay clear of it. */
  insets?: Insets;
}

const ACTION_META: Record<ElementAction, { label: string; icon: React.ReactNode; title: string }> = {
  text: { label: 'Tekst', icon: <Type className="w-3 h-3" />, title: 'Edytuj treść tekstu' },
  size: { label: 'Rozmiar', icon: <Ruler className="w-3 h-3" />, title: 'Zmień rozmiar i odstępy' },
  appearance: { label: 'Wygląd', icon: <Palette className="w-3 h-3" />, title: 'Zmień kolory i tło' },
  position: { label: 'Położenie', icon: <Move className="w-3 h-3" />, title: 'Korekta optyczna ±1 px (strzałki)' },
};

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
  onRevealSelection,
  insets = DEFAULT_INSETS,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null);
  const [offscreen, setOffscreen] = useState(false);

  const hoverScreen = hoveredRect ? documentRectToScreen(hoveredRect, camera) : null;
  const selectScreen = selectedRect ? documentRectToScreen(selectedRect, camera) : null;

  // Measure, then place. Layout effect so the tools never paint in the wrong
  // spot first — a visible jump on every selection would be worse than a frame
  // of delay.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !selectScreen || !selectedNode) {
      setToolbarPos(null);
      setLabelPos(null);
      setOffscreen(false);
      return;
    }

    const viewport = {
      width: container.clientWidth,
      height: container.clientHeight,
    };

    const isOff = isSelectionOffscreen(selectScreen, viewport, insets);
    setOffscreen(isOff);
    if (isOff) {
      setToolbarPos(null);
      setLabelPos(null);
      return;
    }

    const toolbar = toolbarRef.current;
    if (toolbar) {
      const { width, height } = toolbar.getBoundingClientRect();
      setToolbarPos(
        placeNearSelection({ selection: selectScreen, viewport, insets, size: { width, height } }),
      );
    }

    const label = labelRef.current;
    if (label) {
      const { width, height } = label.getBoundingClientRect();
      // The label prefers the opposite side from the toolbar so the two do not
      // stack on top of each other when space is tight.
      const placed = placeNearSelection({
        selection: {
          ...selectScreen,
          // Flip the anchor by treating the selection as zero-height at its top
          // edge, which makes "below" resolve to just under the top edge.
          height: 0,
        },
        viewport,
        insets,
        size: { width, height },
        gap: 6,
      });
      setLabelPos({ x: placed.x, y: placed.side === 'below' ? selectScreen.y - height - 6 : placed.y });
    }
  }, [
    selectScreen?.x,
    selectScreen?.y,
    selectScreen?.width,
    selectScreen?.height,
    selectedNode?.id,
    activeAction,
    availableActions.length,
    insets,
  ]);

  const showHover =
    hoverScreen && hoveredNode && (!selectedNode || hoveredNode.id !== selectedNode.id);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {showHover && (
        <div
          className="absolute border border-[#A86645]/70"
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

      {/* Outline follows the element wherever it is, even partly off-screen. */}
      {selectScreen && selectedNode && (
        <div
          className="absolute border-2 border-[#A86645]"
          style={{
            left: selectScreen.x,
            top: selectScreen.y,
            width: selectScreen.width,
            height: selectScreen.height,
          }}
        />
      )}

      {/* Label — positioned independently so it can flip with the toolbar. */}
      {selectScreen && selectedNode && !offscreen && (
        <div
          ref={labelRef}
          className="absolute flex items-center gap-1 whitespace-nowrap"
          style={{
            left: labelPos?.x ?? selectScreen.x,
            top: labelPos?.y ?? selectScreen.y - 24,
            visibility: labelPos ? 'visible' : 'hidden',
          }}
        >
          <span className="bg-[#A86645] text-white text-[10px] font-mono font-semibold px-1.5 py-[2px] rounded shadow-sm">
            {selectedNode.tag.toUpperCase()}
          </span>
          <span className="bg-[#292824] text-white text-[10px] px-1.5 py-[2px] rounded shadow-sm max-w-[220px] truncate">
            {selectedNode.name}
          </span>
        </div>
      )}

      {/* Action bar — only real actions, always reachable. */}
      {selectScreen && selectedNode && !offscreen && (
        <div
          ref={toolbarRef}
          className="absolute pointer-events-auto"
          style={{
            left: toolbarPos?.x ?? selectScreen.x,
            top: toolbarPos?.y ?? selectScreen.y + selectScreen.height + 8,
            visibility: toolbarPos ? 'visible' : 'hidden',
          }}
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
      )}

      {/* Selection is entirely out of view: offer a way back rather than
          leaving tools floating with no visible object. */}
      {selectedNode && offscreen && (
        <div
          className="absolute pointer-events-auto"
          style={{ left: insets.left, top: insets.top }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 bg-[#292824] text-white rounded-lg shadow-xl px-2 py-1.5 text-[11px]">
            <span className="opacity-80 max-w-[160px] truncate">{selectedNode.name}</span>
            <button
              onClick={onRevealSelection}
              className="px-2 py-1 rounded bg-[#A86645] hover:bg-[#935537] flex items-center gap-1 font-medium"
            >
              <Crosshair className="w-3 h-3" />
              <span>Pokaż zaznaczenie</span>
            </button>
            <button
              onClick={onClearSelection}
              title="Odznacz (Escape)"
              className="p-1 rounded hover:bg-white/15"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
