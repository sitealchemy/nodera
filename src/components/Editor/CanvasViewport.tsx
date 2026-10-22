import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Hand, Maximize2, MousePointer, Minus, Plus } from 'lucide-react';
import {
  Camera,
  Rect,
  clientToScreen,
  fitWidth,
  resetZoom,
  screenToDocument,
  snapCamera,
  zoomByFactor,
} from '../../lib/camera';
import { panToCentre } from '../../lib/overlayPlacement';
import { ElementAction, actionsFor, findNode } from '../../lib/documentTree';
import { DesignTokens, NodeElement, ViewportDevice } from '../../types/document';
import { DocumentFrame } from '../../render/DocumentFrame';
import { NODE_ID_ATTRIBUTE } from '../../render/renderNode';
import { VIEWPORT_WIDTHS } from '../../render/resolveStyles';
import { useCanvasGestures } from '../../hooks/useCanvasGestures';
import { CanvasControls } from './CanvasControls';
import { SelectionOverlay } from './SelectionOverlay';

/**
 * The canvas: camera, artboard, iframe renderer and the gesture/hit-test layer.
 *
 * Hit-testing happens here rather than inside the iframe. The frame is
 * pointer-inert, and this component converts a screen coordinate to document
 * space and asks the iframe document what is there via `elementFromPoint`.
 * That gives precise selection at any zoom while making it impossible to
 * accidentally follow a link, submit a form or drag a logo.
 */

/** Value equality for rects, so unchanged geometry keeps its object identity. */
function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

export interface CanvasViewportProps {
  root: NodeElement;
  tokens: DesignTokens;
  device: ViewportDevice;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  activeAction: ElementAction | null;
  onChooseAction: (action: ElementAction | null) => void;
  /** Persistent select mode from the toolbar; Shift enables it momentarily. */
  selectMode: boolean;
  onToggleSelectMode: () => void;
  handTool: boolean;
  onToggleHandTool: () => void;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  root,
  tokens,
  device,
  camera,
  onCameraChange,
  selectedElementId,
  onSelectElement,
  activeAction,
  onChooseAction,
  selectMode,
  onToggleSelectMode,
  handTool,
  onToggleHandTool,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const [contentHeight, setContentHeight] = useState(1200);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);
  /** Bumped when the frame is (re)attached, so rects are measured again. */
  const [frameEpoch, setFrameEpoch] = useState(0);

  const documentWidth = VIEWPORT_WIDTHS[device];
  const documentSize = { width: documentWidth, height: contentHeight };

  // Stable identity: an inline arrow here would change every render, making
  // DocumentFrame re-run its ref callback, re-initialise the document and add
  // another load listener on each pan, zoom or hover.
  const handleFrameReady = useCallback((frame: HTMLIFrameElement | null) => {
    frameRef.current = frame;
    setFrameEpoch((n) => n + 1);
  }, []);

  const { panning, onPointerDown, cursor } = useCanvasGestures({
    camera,
    setCamera: onCameraChange,
    viewportRef,
    documentSize,
    handTool,
  });

  const selectionEnabled = (selectMode || shiftHeld) && !handTool && !panning;

  // --- Shift as a momentary selection modifier ----------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftHeld(false);
    };
    const release = () => setShiftHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  // --- Hit testing ---------------------------------------------------------
  /** Screen point -> the deepest document node under it. */
  const nodeIdAtScreen = useCallback(
    (screenX: number, screenY: number): string | null => {
      const doc = frameRef.current?.contentDocument;
      if (!doc) return null;
      const point = screenToDocument({ x: screenX, y: screenY }, camera);
      // The frame is never scrolled in the editor (it is sized to its content),
      // but account for it anyway so this stays correct if that changes.
      const win = doc.defaultView;
      const target = doc.elementFromPoint(
        point.x - (win?.scrollX ?? 0),
        point.y - (win?.scrollY ?? 0),
      );
      if (!target) return null;
      const owner = (target as Element).closest(`[${NODE_ID_ATTRIBUTE}]`);
      return owner?.getAttribute(NODE_ID_ATTRIBUTE) ?? null;
    },
    [camera],
  );

  /** Document-space bounding box for a node, read from the live DOM. */
  const rectForNode = useCallback((id: string | null): Rect | null => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !id) return null;
    const el = doc.querySelector(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(id)}"]`);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const win = doc.defaultView;
    return {
      x: box.left + (win?.scrollX ?? 0),
      y: box.top + (win?.scrollY ?? 0),
      width: box.width,
      height: box.height,
    };
  }, []);

  // Keep outlines in sync with content, viewport and selection changes. The
  // camera is NOT a dependency: rects are in document space, so panning and
  // zooming do not change them — the overlay re-projects them on every render.
  //
  // Both setters compare by value first. `rectForNode` builds a fresh object
  // every call, so storing it unconditionally would change state identity on
  // every pass and spin this into a permanent re-render loop.
  const syncRects = useCallback(() => {
    const nextSelected = rectForNode(selectedElementId);
    const nextHovered = rectForNode(hoveredId);
    setSelectedRect((prev) => (sameRect(prev, nextSelected) ? prev : nextSelected));
    setHoveredRect((prev) => (sameRect(prev, nextHovered) ? prev : nextHovered));
  }, [rectForNode, selectedElementId, hoveredId]);

  useEffect(() => {
    syncRects();
  }, [syncRects, root, device, contentHeight, frameEpoch]);

  // A style edit can change geometry without changing the document identity, so
  // re-measure on a timer rather than per render. 120ms is below the threshold
  // where a stale outline is noticeable and costs nothing measurable.
  useEffect(() => {
    const interval = window.setInterval(syncRects, 120);
    return () => window.clearInterval(interval);
  }, [syncRects]);

  // --- Pointer interaction -------------------------------------------------
  // Read Shift from the event as well as from tracked key state: a pointer
  // event always carries the live modifier, whereas a keydown can be missed
  // (focus elsewhere, key pressed before the window was focused).
  const selectionEnabledFor = useCallback(
    (event: React.PointerEvent) =>
      (selectMode || shiftHeld || event.shiftKey) && !handTool && !panning,
    [selectMode, shiftHeld, handTool, panning],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!selectionEnabledFor(event)) {
        if (hoveredId) setHoveredId(null);
        return;
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screen = clientToScreen(event.clientX, event.clientY, rect);
      const id = nodeIdAtScreen(screen.x, screen.y);
      if (id !== hoveredId) setHoveredId(id);
    },
    [selectionEnabledFor, hoveredId, nodeIdAtScreen],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      onPointerDown(event);
      if (event.defaultPrevented || !selectionEnabledFor(event) || event.button !== 0) return;

      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screen = clientToScreen(event.clientX, event.clientY, rect);
      const id = nodeIdAtScreen(screen.x, screen.y);

      // Clicking empty canvas clears the selection; clicking a node selects it
      // without starting any action — selection alone never moves anything.
      onSelectElement(id);
      if (!id) onChooseAction(null);
    },
    [onPointerDown, selectionEnabledFor, nodeIdAtScreen, onSelectElement, onChooseAction],
  );

  // --- Zoom controls -------------------------------------------------------
  const viewportSize = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  const handleFitWidth = useCallback(() => {
    onCameraChange(fitWidth(viewportSize(), documentWidth));
  }, [onCameraChange, viewportSize, documentWidth]);

  const handleResetZoom = useCallback(() => {
    onCameraChange(resetZoom(camera, viewportSize()));
  }, [onCameraChange, camera, viewportSize]);

  const zoomFromCentre = useCallback(
    (factor: number) => {
      const size = viewportSize();
      onCameraChange(zoomByFactor(camera, factor, { x: size.width / 2, y: size.height / 2 }));
    },
    [onCameraChange, camera, viewportSize],
  );

  // Fit to width on first mount and whenever the device width changes, so the
  // user always opens on "here is my page", not a microscopic overview.
  const lastFittedWidth = useRef<number | null>(null);
  useEffect(() => {
    if (lastFittedWidth.current === documentWidth) return;
    const size = viewportSize();
    if (size.width === 0) return;
    lastFittedWidth.current = documentWidth;
    onCameraChange(fitWidth(size, documentWidth));
  }, [documentWidth, viewportSize, onCameraChange]);

  const selectedNode = selectedElementId ? findNode(root, selectedElementId) : null;
  const hoveredNode = hoveredId ? findNode(root, hoveredId) : null;

  // What the artboard and its overlay are both drawn with.
  const painted = snapCamera(camera);

  /** Brings an off-screen selection back into view without changing zoom. */
  const handleRevealSelection = useCallback(() => {
    if (!selectedRect) return;
    const size = viewportSize();
    onCameraChange({ ...camera, ...panToCentre(selectedRect, size, camera.zoom) });
  }, [selectedRect, viewportSize, camera, onCameraChange]);

  return (
    <div className="relative flex-1 min-h-0 w-full bg-[#ECE8DF] overflow-hidden">
      {/* Gesture + hit-test surface. The iframe below is pointer-inert. */}
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        style={{ cursor: selectionEnabled ? 'crosshair' : cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredId(null)}
        // Middle-click autoscroll is opened by auxclick in some browsers.
        onAuxClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: documentWidth,
            transformOrigin: '0 0',
            // Matches `screen = document * zoom + pan` exactly — translate is
            // written first so it is applied in unscaled screen pixels.
            transform: `translate(${painted.panX}px, ${painted.panY}px) scale(${painted.zoom})`,
            willChange: 'transform',
          }}
        >
          <div className="bg-white shadow-[0_2px_24px_rgba(41,40,36,0.14)] ring-1 ring-black/5">
            <DocumentFrame
              root={root}
              tokens={tokens}
              device={device}
              height={contentHeight}
              onContentHeightChange={setContentHeight}
              onFrameReady={handleFrameReady}
            />
          </div>
        </div>

        <SelectionOverlay
          camera={painted}
          selectedRect={selectedRect}
          hoveredRect={selectionEnabled ? hoveredRect : null}
          selected={selectedNode && { id: selectedNode.id, tag: selectedNode.tag, label: selectedNode.name }}
          hovered={hoveredNode && { id: hoveredNode.id, tag: hoveredNode.tag, label: hoveredNode.name }}
          availableActions={selectedNode ? actionsFor(selectedNode) : []}
          activeAction={activeAction}
          onChooseAction={(action) => onChooseAction(action === activeAction ? null : action)}
          onClearSelection={() => {
            onChooseAction(null);
            onSelectElement(null);
          }}
          onRevealSelection={handleRevealSelection}
          // Keep tools clear of the floating zoom bar and the command dock.
          insets={{ top: 8, right: 8, bottom: 96, left: 8 }}
        />
      </div>

      <CanvasControls
        zoom={camera.zoom}
        selectMode={selectMode}
        onToggleSelectMode={onToggleSelectMode}
        handTool={handTool}
        onToggleHandTool={onToggleHandTool}
        onZoomOut={() => zoomFromCentre(1 / 1.2)}
        onZoomIn={() => zoomFromCentre(1.2)}
        onResetZoom={handleResetZoom}
        onFitWidth={handleFitWidth}
      />
    </div>
  );
};
