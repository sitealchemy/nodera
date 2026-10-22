import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Size,
  clampPan,
  clientToScreen,
  panBy,
  wheelDeltaToPixels,
  zoomByFactor,
} from '../lib/camera';

/**
 * Pan / zoom gesture handling for the canvas.
 *
 * Camera state lives here, outside the document, so panning and zooming can
 * never touch styles, saved content or undo history.
 */

export interface CanvasGesturesOptions {
  camera: Camera;
  setCamera: (next: Camera) => void;
  viewportRef: React.RefObject<HTMLElement | null>;
  documentSize: Size;
  /** Hand tool: pan with a plain left drag, no modifier needed. */
  handTool: boolean;
  enabled?: boolean;
}

export interface CanvasGesturesResult {
  /** True while space is held — the canvas shows a grab cursor. */
  spaceHeld: boolean;
  /** True while a pan drag is actually in progress. */
  panning: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  cursor: string;
}

/** Elements that must keep their native keyboard behaviour. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useCanvasGestures({
  camera,
  setCamera,
  viewportRef,
  documentSize,
  handTool,
  enabled = true,
}: CanvasGesturesOptions): CanvasGesturesResult {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  // Mutable mirrors so the wheel/pointer handlers always see fresh values
  // without being re-bound on every camera change.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const documentSizeRef = useRef(documentSize);
  documentSizeRef.current = documentSize;

  const panState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const viewportSize = useCallback((): Size => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, [viewportRef]);

  const applyCamera = useCallback(
    (next: Camera) => {
      setCamera(clampPan(next, viewportSize(), documentSizeRef.current));
    },
    [setCamera, viewportSize],
  );

  // --- The viewport must never scroll --------------------------------------
  // Pan is the only translation in this model: every screen/document
  // conversion, and every overlay rectangle, is computed from the camera and
  // the viewport's own box. `overflow: hidden` stops the user scrolling, but
  // the browser still scrolls the box programmatically — to reveal a focused
  // element, or for scrollIntoView — and a scrolled viewport moves the
  // artboard without moving the camera. Hit-testing then lands on whatever
  // happens to be at the stale coordinates. Pinning the offsets back to zero
  // keeps the invariant instead of threading a scroll offset through all the
  // maths.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const pin = () => {
      if (element.scrollLeft !== 0) element.scrollLeft = 0;
      if (element.scrollTop !== 0) element.scrollTop = 0;
    };
    pin();
    element.addEventListener('scroll', pin);
    return () => element.removeEventListener('scroll', pin);
  }, [viewportRef]);

  // --- Space key -----------------------------------------------------------
  // Space must type a space when the user is in a field, so text entry targets
  // are excluded before the key is treated as a modifier.
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTextEntryTarget(event.target)) return;
      if (event.repeat) return;
      setSpaceHeld(true);
      // Stop the page scrolling under us while space is a modifier.
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };

    // A key released outside the window never reports keyup, which is the
    // classic way a canvas ends up stuck in hand mode.
    const releaseAll = () => {
      setSpaceHeld(false);
      panState.current = null;
      setPanning(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
    };
  }, [enabled]);

  // --- Pointer drag --------------------------------------------------------
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled) return;
      const isMiddle = event.button === 1;
      const isPanDrag = isMiddle || ((spaceHeld || handTool) && event.button === 0);
      if (!isPanDrag) return;

      event.preventDefault();
      // Middle-click would otherwise start the browser's autoscroll widget.
      if (isMiddle) event.stopPropagation();

      const element = event.currentTarget as HTMLElement;
      element.setPointerCapture(event.pointerId);
      panState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      setPanning(true);
    },
    [enabled, handTool, spaceHeld],
  );

  // Move/up/cancel are bound to the window so a drag that leaves the viewport
  // still tracks, and so we never miss the release that ends it.
  useEffect(() => {
    if (!panning) return;

    const onMove = (event: PointerEvent) => {
      const state = panState.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      applyCamera(panBy(cameraRef.current, dx, dy));
    };

    const stop = () => {
      panState.current = null;
      setPanning(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [panning, applyCamera]);

  // --- Wheel ---------------------------------------------------------------
  // Bound natively (not via React) so it can be passive:false and call
  // preventDefault. Only the canvas consumes wheel; drawers and fields scroll
  // normally because the listener is on the viewport element alone.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !enabled) return;

    const onWheel = (event: WheelEvent) => {
      const zoomGesture = event.ctrlKey || event.metaKey;
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const anchor = clientToScreen(event.clientX, event.clientY, rect);

      if (zoomGesture) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; the
        // exponential keeps the response even across input devices.
        const dy = wheelDeltaToPixels(event.deltaY, event.deltaMode);
        applyCamera(zoomByFactor(cameraRef.current, Math.exp(-dy / 320), anchor));
      } else {
        const dx = wheelDeltaToPixels(event.deltaX, event.deltaMode);
        const dy = wheelDeltaToPixels(event.deltaY, event.deltaMode);
        applyCamera(panBy(cameraRef.current, -dx, -dy));
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [viewportRef, enabled, applyCamera]);

  const cursor = panning ? 'grabbing' : spaceHeld || handTool ? 'grab' : 'default';

  return { spaceHeld, panning, onPointerDown, cursor };
}
