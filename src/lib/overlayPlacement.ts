import { Rect } from './camera';

/**
 * Placement of the selection label and action bar in screen space.
 *
 * The bar used to sit unconditionally below the element, so selecting a tall
 * section or anything near the bottom pushed it out of view, leaving the
 * selection with no reachable tools.
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlacementInput {
  /** Selection rect, already projected to screen space. */
  selection: Rect;
  /** Visible canvas size. */
  viewport: { width: number; height: number };
  /** Space reserved by surrounding chrome (bottom controls, command dock…). */
  insets: Insets;
  /** Measured size of the floating element. */
  size: { width: number; height: number };
  /** Gap between the selection edge and the floating element. */
  gap?: number;
}

export interface Placement {
  x: number;
  y: number;
  /** Which side of the selection it ended up on. */
  side: 'above' | 'below' | 'inside';
}

export const DEFAULT_INSETS: Insets = { top: 8, right: 8, bottom: 8, left: 8 };

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Places a floating element near the selection, preferring below, flipping
 * above when there is no room, and falling back to overlapping the selection
 * when neither side fits (a section taller than the viewport).
 *
 * The result is always clamped inside the usable area, so the tools are
 * reachable even when the selection is mostly off-screen.
 */
export function placeNearSelection({
  selection,
  viewport,
  insets,
  size,
  gap = 8,
}: PlacementInput): Placement {
  const minX = insets.left;
  const maxX = viewport.width - insets.right - size.width;
  const minY = insets.top;
  const maxY = viewport.height - insets.bottom - size.height;

  const below = selection.y + selection.height + gap;
  const above = selection.y - size.height - gap;

  let y: number;
  let side: Placement['side'];

  if (below <= maxY) {
    y = below;
    side = 'below';
  } else if (above >= minY) {
    y = above;
    side = 'above';
  } else {
    // Neither side fits: sit just inside the selection's top edge, clamped so
    // it stays on screen even when the selection starts above the viewport.
    y = clamp(Math.max(selection.y + gap, minY), minY, maxY);
    side = 'inside';
  }

  return {
    x: clamp(selection.x, minX, maxX),
    y: clamp(y, minY, maxY),
    side,
  };
}

/** True when the selection has no pixels inside the usable area. */
export function isSelectionOffscreen(
  selection: Rect,
  viewport: { width: number; height: number },
  insets: Insets = DEFAULT_INSETS,
): boolean {
  const right = selection.x + selection.width;
  const bottom = selection.y + selection.height;
  return (
    right <= insets.left ||
    bottom <= insets.top ||
    selection.x >= viewport.width - insets.right ||
    selection.y >= viewport.height - insets.bottom
  );
}

/**
 * Camera pan that brings a document-space rect to the centre of the viewport,
 * for "Pokaż zaznaczenie". Zoom is deliberately left alone — changing it would
 * be a second, unrequested change.
 */
export function panToCentre(
  documentRect: Rect,
  viewport: { width: number; height: number },
  zoom: number,
): { panX: number; panY: number } {
  const centreX = documentRect.x + documentRect.width / 2;
  const centreY = documentRect.y + documentRect.height / 2;
  return {
    panX: viewport.width / 2 - centreX * zoom,
    panY: viewport.height / 2 - centreY * zoom,
  };
}
