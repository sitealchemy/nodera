import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Rect,
  clientToScreen,
  documentRectToScreen,
  fitWidth,
  resetZoom,
  screenToDocument,
  snapCamera,
  zoomByFactor,
} from '../lib/camera';
import { panToCentre } from '../lib/overlayPlacement';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
import { ElementAction } from '../lib/documentTree';
import { CanvasControls } from '../components/Editor/CanvasControls';
import { SelectionDescriptor, SelectionOverlay } from '../components/Editor/SelectionOverlay';
import { NODE_ID_ATTRIBUTE, SiteDocument } from './types';
import { RenderedSite, releaseRender, renderSite } from './renderSite';
import { parseHtml, serialise } from './ingest';

/**
 * Canvas for a site document.
 *
 * Reuses the camera maths and gesture handling the node editor already has,
 * but renders source HTML instead of a node tree. The frame is isolated and
 * pointer-inert; selection is done by hit-testing from outside, so exploring
 * the page can never move, click or submit anything in it.
 */

export const PREVIEW_WIDTHS = { desktop: 1440, tablet: 768, mobile: 375 } as const;
export type PreviewWidth = keyof typeof PREVIEW_WIDTHS;

export interface SiteCanvasProps {
  site: SiteDocument;
  width: PreviewWidth;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  handTool: boolean;
  onToggleHandTool: () => void;
  /** Describes an element for the overlay label; supplied by the editor. */
  describe: (nodeId: string) => SelectionDescriptor | null;
  /** Which edit actions the selected element offers. */
  availableActions: ElementAction[];
  activeAction: ElementAction | null;
  onChooseAction: (action: ElementAction | null) => void;
}

export const SiteCanvas: React.FC<SiteCanvasProps> = ({
  site,
  width,
  camera,
  onCameraChange,
  selectedId,
  onSelect,
  selectMode,
  onToggleSelectMode,
  handTool,
  onToggleHandTool,
  describe,
  availableActions,
  activeAction,
  onChooseAction,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const renderedRef = useRef<RenderedSite | null>(null);

  const [contentHeight, setContentHeight] = useState(1200);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);

  const documentWidth = PREVIEW_WIDTHS[width];
  const documentSize = { width: documentWidth, height: contentHeight };

  const { panning, onPointerDown, cursor } = useCanvasGestures({
    camera,
    setCamera: onCameraChange,
    viewportRef,
    documentSize,
    handTool,
  });

  // Re-render only when the document actually changes, not on every camera
  // move: rebuilding blob URLs on a pan would flicker and leak.
  const rendered = useMemo(() => {
    releaseRender(renderedRef.current);
    const next = renderSite(site, parseHtml, serialise);
    renderedRef.current = next;
    return next;
  }, [site]);

  // No unmount cleanup here, deliberately. StrictMode mounts, unmounts and
  // remounts; a cleanup keyed to mount would revoke the blob URLs of a render
  // that `useMemo` will not recompute on the remount, leaving every image and
  // font in the frame broken. The memo above already releases the previous
  // render whenever a new one supersedes it, so at most one set of URLs is
  // held, and the browser reclaims it when the document goes away.

  // Write the assembled page into the frame.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(rendered.html);
    doc.close();

    const measure = () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      const height = Math.max(body.scrollHeight, body.offsetHeight);
      if (height > 0) setContentHeight((current) => (Math.abs(current - height) > 1 ? height : current));
    };

    measure();
    // The frame's own ResizeObserver, not the parent's: observing a node from
    // another document is permitted but reports in that document's frame.
    const win = frame.contentWindow as (Window & typeof globalThis) | null;
    if (win) {
      const observer = new win.ResizeObserver(measure);
      if (frame.contentDocument?.body) observer.observe(frame.contentDocument.body);
      frame.contentDocument?.addEventListener('load', measure, true);
      frame.contentDocument?.fonts?.ready.then(measure).catch(() => {});
      return () => observer.disconnect();
    }
    return undefined;
  }, [rendered, documentWidth]);

  // Shift as a momentary selection modifier, same as the node editor.
  useEffect(() => {
    const down = (event: KeyboardEvent) => event.key === 'Shift' && setShiftHeld(true);
    const up = (event: KeyboardEvent) => event.key === 'Shift' && setShiftHeld(false);
    const release = () => setShiftHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, []);

  const selectionEnabled = (selectMode || shiftHeld) && !handTool && !panning;

  const rectForNode = useCallback((nodeId: string | null): Rect | null => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !nodeId) return null;
    const element = doc.querySelector(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(nodeId)}"]`);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const win = doc.defaultView;
    return {
      x: box.left + (win?.scrollX ?? 0),
      y: box.top + (win?.scrollY ?? 0),
      width: box.width,
      height: box.height,
    };
  }, []);

  const nodeIdAt = useCallback(
    (screenX: number, screenY: number): string | null => {
      const doc = frameRef.current?.contentDocument;
      if (!doc) return null;
      const point = screenToDocument({ x: screenX, y: screenY }, camera);
      const target = doc.elementFromPoint(point.x, point.y);
      const owner = (target as Element | null)?.closest?.(`[${NODE_ID_ATTRIBUTE}]`);
      return owner?.getAttribute(NODE_ID_ATTRIBUTE) ?? null;
    },
    [camera],
  );

  // Outlines are measured in document space, so panning and zooming need no
  // re-measurement; the overlay re-projects them on every render.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSelectedRect(rectForNode(selectedId));
    }, 120);
    setSelectedRect(rectForNode(selectedId));
    return () => window.clearInterval(id);
  }, [rectForNode, selectedId, rendered, contentHeight]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!(selectionEnabled || event.shiftKey)) {
        if (hoveredRect) setHoveredRect(null);
        if (hoveredId) setHoveredId(null);
        return;
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screen = clientToScreen(event.clientX, event.clientY, rect);
      const id = nodeIdAt(screen.x, screen.y);
      setHoveredId(id);
      setHoveredRect(rectForNode(id));
    },
    [selectionEnabled, hoveredRect, hoveredId, nodeIdAt, rectForNode],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      onPointerDown(event);
      if (event.defaultPrevented) return;
      if (!(selectionEnabled || event.shiftKey) || event.button !== 0) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screen = clientToScreen(event.clientX, event.clientY, rect);
      onSelect(nodeIdAt(screen.x, screen.y));
    },
    [onPointerDown, selectionEnabled, nodeIdAt, onSelect],
  );

  const viewportSize = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  const lastFitted = useRef<number | null>(null);
  useEffect(() => {
    if (lastFitted.current === documentWidth) return;
    const size = viewportSize();
    if (size.width === 0) return;
    lastFitted.current = documentWidth;
    onCameraChange(fitWidth(size, documentWidth));
  }, [documentWidth, viewportSize, onCameraChange]);

  /** Brings an off-screen selection back into view without changing zoom. */
  const handleRevealSelection = useCallback(() => {
    if (!selectedRect) return;
    const size = viewportSize();
    onCameraChange({ ...camera, ...panToCentre(selectedRect, size, camera.zoom) });
  }, [selectedRect, viewportSize, camera, onCameraChange]);

  // What the artboard and its overlay are both drawn with.
  const painted = snapCamera(camera);

  return (
    <div className="relative flex-1 min-h-0 w-full bg-[#ECE8DF] overflow-hidden">
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        style={{ cursor: selectionEnabled ? 'crosshair' : cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHoveredRect(null);
          setHoveredId(null);
        }}
        onAuxClick={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: documentWidth,
            transformOrigin: '0 0',
            transform: `translate(${painted.panX}px, ${painted.panY}px) scale(${painted.zoom})`,
            willChange: 'transform',
          }}
        >
          <div className="bg-white shadow-[0_2px_24px_rgba(41,40,36,0.14)] ring-1 ring-black/5">
            <iframe
              ref={frameRef}
              title="Podgląd strony"
              // Sandboxed WITHOUT allow-scripts: a generated page never
              // executes JavaScript in the editor's context. `allow-same-origin`
              // is granted on its own so the editor can write the document and
              // hit-test it; it is only dangerous combined with allow-scripts,
              // which is exactly what is withheld here.
              // The frame is also pointer-inert, so exploring the page cannot
              // click, submit or move anything in it.
              sandbox="allow-same-origin"
              style={{
                width: documentWidth,
                height: contentHeight,
                border: 'none',
                display: 'block',
                background: '#fff',
                pointerEvents: 'none',
              }}
              tabIndex={-1}
            />
          </div>
        </div>

        <SelectionOverlay
          camera={painted}
          selectedRect={selectedRect}
          hoveredRect={selectionEnabled ? hoveredRect : null}
          selected={selectedId ? describe(selectedId) : null}
          hovered={hoveredId ? describe(hoveredId) : null}
          availableActions={availableActions}
          activeAction={activeAction}
          onChooseAction={(action) => onChooseAction(action === activeAction ? null : action)}
          onClearSelection={() => {
            onChooseAction(null);
            onSelect(null);
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
        onZoomOut={() => {
          const size = viewportSize();
          onCameraChange(zoomByFactor(camera, 1 / 1.2, { x: size.width / 2, y: size.height / 2 }));
        }}
        onZoomIn={() => {
          const size = viewportSize();
          onCameraChange(zoomByFactor(camera, 1.2, { x: size.width / 2, y: size.height / 2 }));
        }}
        onResetZoom={() => onCameraChange(resetZoom(camera, viewportSize()))}
        onFitWidth={() => onCameraChange(fitWidth(viewportSize(), documentWidth))}
      />
    </div>
  );
};
