import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hand, Maximize2, MousePointer, Minus, Plus } from 'lucide-react';
import {
  Camera,
  Rect,
  clientToScreen,
  documentRectToScreen,
  fitWidth,
  resetZoom,
  screenToDocument,
  zoomByFactor,
} from '../lib/camera';
import { useCanvasGestures } from '../hooks/useCanvasGestures';
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
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const renderedRef = useRef<RenderedSite | null>(null);

  const [contentHeight, setContentHeight] = useState(1200);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);
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
        return;
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screen = clientToScreen(event.clientX, event.clientY, rect);
      setHoveredRect(rectForNode(nodeIdAt(screen.x, screen.y)));
    },
    [selectionEnabled, hoveredRect, nodeIdAt, rectForNode],
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

  const selectScreen = selectedRect ? documentRectToScreen(selectedRect, camera) : null;
  const hoverScreen = hoveredRect ? documentRectToScreen(hoveredRect, camera) : null;

  return (
    <div className="relative flex-1 min-h-0 w-full bg-[#ECE8DF] overflow-hidden">
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        style={{ cursor: selectionEnabled ? 'crosshair' : cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredRect(null)}
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
            transform: `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`,
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

        {/* Selection overlay, in screen space: constant stroke at any zoom. */}
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {hoverScreen && (!selectScreen || hoverScreen.y !== selectScreen.y) && (
            <div
              className="absolute border border-[#A86645]/70"
              style={{
                left: hoverScreen.x,
                top: hoverScreen.y,
                width: hoverScreen.width,
                height: hoverScreen.height,
              }}
            />
          )}
          {selectScreen && (
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
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-[#FFFEFB]/95 backdrop-blur border border-[#DED9CF] rounded-xl shadow-md px-1.5 py-1 text-xs">
        <button
          onClick={onToggleSelectMode}
          title="Tryb wybierania (lub przytrzymaj Shift)"
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
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            handTool ? 'bg-[#A86645] text-white' : 'text-[#706C65] hover:bg-[#F6F4EF]'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Dłoń</span>
        </button>
        <span className="w-px h-4 bg-[#DED9CF] mx-0.5" />
        <button
          onClick={() => {
            const size = viewportSize();
            onCameraChange(zoomByFactor(camera, 1 / 1.2, { x: size.width / 2, y: size.height / 2 }));
          }}
          className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF]"
          title="Pomniejsz"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onCameraChange(resetZoom(camera, viewportSize()))}
          className="font-mono text-[11px] w-12 text-center font-semibold text-[#292824] hover:bg-[#F6F4EF] rounded py-1"
          title="Ustaw 100%"
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        <button
          onClick={() => {
            const size = viewportSize();
            onCameraChange(zoomByFactor(camera, 1.2, { x: size.width / 2, y: size.height / 2 }));
          }}
          className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF]"
          title="Powiększ"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onCameraChange(fitWidth(viewportSize(), documentWidth))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] font-medium"
          title="Dopasuj szerokość"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Dopasuj</span>
        </button>
      </div>
    </div>
  );
};
