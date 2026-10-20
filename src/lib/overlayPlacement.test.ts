import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSETS,
  isSelectionOffscreen,
  panToCentre,
  placeNearSelection,
} from './overlayPlacement';

const viewport = { width: 1000, height: 700 };
const insets = { top: 8, right: 8, bottom: 96, left: 8 }; // room for the zoom bar
const size = { width: 260, height: 32 };

describe('placeNearSelection', () => {
  it('prefers just below the selection', () => {
    const placed = placeNearSelection({
      selection: { x: 100, y: 100, width: 300, height: 60 },
      viewport,
      insets,
      size,
    });
    expect(placed.side).toBe('below');
    expect(placed.y).toBe(168); // 100 + 60 + 8
    expect(placed.x).toBe(100);
  });

  // The regression: the bar was always below, so a selection near the bottom
  // pushed its own tools out of view and left it with nothing to click.
  it('flips above when there is no room below', () => {
    const placed = placeNearSelection({
      selection: { x: 100, y: 540, width: 300, height: 60 },
      viewport,
      insets,
      size,
    });
    expect(placed.side).toBe('above');
    expect(placed.y).toBe(500); // 540 - 32 - 8
  });

  it('stays inside the viewport for a section taller than the screen', () => {
    const placed = placeNearSelection({
      selection: { x: 0, y: -400, width: 1000, height: 2000 },
      viewport,
      insets,
      size,
    });
    expect(placed.side).toBe('inside');
    expect(placed.y).toBeGreaterThanOrEqual(insets.top);
    expect(placed.y + size.height).toBeLessThanOrEqual(viewport.height - insets.bottom);
  });

  it('clamps horizontally at both edges', () => {
    const offLeft = placeNearSelection({
      selection: { x: -500, y: 100, width: 100, height: 40 },
      viewport,
      insets,
      size,
    });
    expect(offLeft.x).toBe(insets.left);

    const offRight = placeNearSelection({
      selection: { x: 1400, y: 100, width: 100, height: 40 },
      viewport,
      insets,
      size,
    });
    expect(offRight.x).toBe(viewport.width - insets.right - size.width);
  });

  it('never overlaps the reserved bottom area', () => {
    for (const y of [0, 200, 400, 600, 650, 690]) {
      const placed = placeNearSelection({
        selection: { x: 50, y, width: 200, height: 80 },
        viewport,
        insets,
        size,
      });
      expect(placed.y + size.height).toBeLessThanOrEqual(viewport.height - insets.bottom);
      expect(placed.y).toBeGreaterThanOrEqual(insets.top);
    }
  });

  it('copes with a floating element wider than the viewport', () => {
    const placed = placeNearSelection({
      selection: { x: 10, y: 10, width: 100, height: 20 },
      viewport: { width: 200, height: 300 },
      insets: DEFAULT_INSETS,
      size: { width: 400, height: 32 },
    });
    expect(Number.isFinite(placed.x)).toBe(true);
    expect(placed.x).toBe(DEFAULT_INSETS.left);
  });
});

describe('isSelectionOffscreen', () => {
  it('is false while any part is visible', () => {
    expect(isSelectionOffscreen({ x: -50, y: -50, width: 100, height: 100 }, viewport)).toBe(false);
    expect(isSelectionOffscreen({ x: 500, y: 300, width: 10, height: 10 }, viewport)).toBe(false);
  });

  it('is true once it is entirely past an edge', () => {
    expect(isSelectionOffscreen({ x: -300, y: 100, width: 100, height: 50 }, viewport)).toBe(true);
    expect(isSelectionOffscreen({ x: 100, y: -300, width: 100, height: 50 }, viewport)).toBe(true);
    expect(isSelectionOffscreen({ x: 1200, y: 100, width: 100, height: 50 }, viewport)).toBe(true);
    expect(isSelectionOffscreen({ x: 100, y: 900, width: 100, height: 50 }, viewport)).toBe(true);
  });
});

describe('panToCentre', () => {
  it('centres the rect without changing zoom', () => {
    const rect = { x: 200, y: 400, width: 100, height: 50 };
    const zoom = 0.5;
    const { panX, panY } = panToCentre(rect, viewport, zoom);

    const screenCentreX = (rect.x + rect.width / 2) * zoom + panX;
    const screenCentreY = (rect.y + rect.height / 2) * zoom + panY;
    expect(screenCentreX).toBeCloseTo(viewport.width / 2, 9);
    expect(screenCentreY).toBeCloseTo(viewport.height / 2, 9);
  });
});
