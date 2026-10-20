/**
 * Camera math for the editor canvas.
 *
 * COORDINATE SPACES
 * -----------------
 * document : CSS pixels inside the rendered page. (0,0) is the top-left of the
 *            artboard. This is what `getBoundingClientRect()` inside the
 *            (unscrolled) iframe reports, and what we store in the document.
 * screen   : CSS pixels relative to the top-left of the viewport element that
 *            hosts the canvas. NOT client coordinates — subtract the viewport
 *            rect first (see `clientToScreen`).
 *
 * TRANSFORM ORDER (the single source of truth)
 * --------------------------------------------
 *     screen = document * zoom + pan
 *
 * which is realised in CSS, on the artboard element, as:
 *
 *     transform-origin: 0 0;
 *     transform: translate(panX px, panY px) scale(zoom);
 *
 * `translate` is written before `scale` so the translation is applied in
 * unscaled screen pixels. Every conversion below is derived from that one
 * equation; nothing here is tuned with magic constants.
 */

export interface Camera {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/** Horizontal breathing room left around the artboard by `fitWidth`. */
export const FIT_MARGIN = 48;

export const IDENTITY_CAMERA: Camera = { panX: 0, panY: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  // NaN has no direction to clamp towards, so fall back to 100%. ±Infinity does
  // carry a direction and clamps to the matching bound like any other overshoot.
  if (Number.isNaN(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** document -> screen */
export function documentToScreen(point: Point, camera: Camera): Point {
  return {
    x: point.x * camera.zoom + camera.panX,
    y: point.y * camera.zoom + camera.panY,
  };
}

/** screen -> document */
export function screenToDocument(point: Point, camera: Camera): Point {
  return {
    x: (point.x - camera.panX) / camera.zoom,
    y: (point.y - camera.panY) / camera.zoom,
  };
}

/**
 * Converts a browser client coordinate (e.g. `event.clientX`) into the screen
 * space used by the camera, given the viewport element's bounding rect.
 */
export function clientToScreen(clientX: number, clientY: number, viewportRect: Rect): Point {
  return { x: clientX - viewportRect.x, y: clientY - viewportRect.y };
}

/** document rect -> screen rect */
export function documentRectToScreen(rect: Rect, camera: Camera): Rect {
  const origin = documentToScreen({ x: rect.x, y: rect.y }, camera);
  return {
    x: origin.x,
    y: origin.y,
    width: rect.width * camera.zoom,
    height: rect.height * camera.zoom,
  };
}

/**
 * Zooms to `nextZoom` while keeping the document point currently under
 * `anchorScreen` pinned to that same screen position.
 *
 * Derivation: let d be the document point under the anchor before the zoom,
 *   d = (anchor - pan) / zoom
 * we need pan' such that d maps back to the same anchor at the new zoom,
 *   anchor = d * zoom' + pan'  =>  pan' = anchor - d * zoom'
 */
export function zoomAtPoint(camera: Camera, nextZoom: number, anchorScreen: Point): Camera {
  const zoom = clampZoom(nextZoom);
  const anchorDocument = screenToDocument(anchorScreen, camera);
  return {
    zoom,
    panX: anchorScreen.x - anchorDocument.x * zoom,
    panY: anchorScreen.y - anchorDocument.y * zoom,
  };
}

/** Multiplies the current zoom by `factor`, anchored under the cursor. */
export function zoomByFactor(camera: Camera, factor: number, anchorScreen: Point): Camera {
  return zoomAtPoint(camera, camera.zoom * factor, anchorScreen);
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, panX: camera.panX + dx, panY: camera.panY + dy };
}

/**
 * Fits the artboard width into the viewport, horizontally centred, scrolled to
 * the top of the page.
 *
 * Deliberately ignores content height: a long page must not be shrunk to a
 * microscopic full-height overview, which is the first thing a user sees.
 */
export function fitWidth(
  viewport: Size,
  documentWidth: number,
  margin: number = FIT_MARGIN,
): Camera {
  if (documentWidth <= 0 || viewport.width <= 0) return { ...IDENTITY_CAMERA };
  const usable = Math.max(1, viewport.width - margin * 2);
  const zoom = clampZoom(usable / documentWidth);
  return {
    zoom,
    panX: (viewport.width - documentWidth * zoom) / 2,
    panY: margin,
  };
}

/**
 * Resets to 100% while keeping the viewport centre looking at the same document
 * point, so "100%" never teleports the user somewhere unrelated.
 */
export function resetZoom(camera: Camera, viewport: Size): Camera {
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  return zoomAtPoint(camera, 1, centre);
}

/** Centres the artboard horizontally without touching zoom or vertical pan. */
export function centreHorizontally(
  camera: Camera,
  viewport: Size,
  documentWidth: number,
): Camera {
  return { ...camera, panX: (viewport.width - documentWidth * camera.zoom) / 2 };
}

/**
 * Keeps the artboard reachable: once it has been dragged almost entirely out of
 * sight, pan is clamped so that a slice stays on screen.
 */
export function clampPan(
  camera: Camera,
  viewport: Size,
  documentSize: Size,
  keepVisible = 120,
): Camera {
  const scaledWidth = documentSize.width * camera.zoom;
  const scaledHeight = documentSize.height * camera.zoom;

  const minPanX = Math.min(viewport.width - keepVisible, viewport.width - scaledWidth);
  const maxPanX = Math.max(keepVisible - scaledWidth, 0);
  const minPanY = Math.min(viewport.height - keepVisible, viewport.height - scaledHeight);
  const maxPanY = Math.max(keepVisible - scaledHeight, 0);

  return {
    ...camera,
    panX: Math.min(Math.max(camera.panX, Math.min(minPanX, maxPanX)), Math.max(minPanX, maxPanX)),
    panY: Math.min(Math.max(camera.panY, Math.min(minPanY, maxPanY)), Math.max(minPanY, maxPanY)),
  };
}

export function camerasEqual(a: Camera, b: Camera, epsilon = 0.0001): boolean {
  return (
    Math.abs(a.panX - b.panX) < epsilon &&
    Math.abs(a.panY - b.panY) < epsilon &&
    Math.abs(a.zoom - b.zoom) < epsilon
  );
}

/**
 * Converts a wheel event's delta into pixels. Browsers report line- and
 * page-based deltas as well as pixels; treating all three as pixels makes
 * Firefox pan roughly 1/16th as fast as Chrome.
 */
export function wheelDeltaToPixels(delta: number, deltaMode: number, lineHeight = 16): number {
  if (deltaMode === 1) return delta * lineHeight; // DOM_DELTA_LINE
  if (deltaMode === 2) return delta * 400; // DOM_DELTA_PAGE
  return delta; // DOM_DELTA_PIXEL
}
