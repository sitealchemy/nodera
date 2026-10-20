import { describe, expect, it } from 'vitest';
import {
  Camera,
  MAX_ZOOM,
  MIN_ZOOM,
  camerasEqual,
  centreHorizontally,
  clampPan,
  clampZoom,
  clientToScreen,
  documentRectToScreen,
  documentToScreen,
  fitWidth,
  panBy,
  resetZoom,
  screenToDocument,
  wheelDeltaToPixels,
  zoomAtPoint,
  zoomByFactor,
} from './camera';

const cam = (panX: number, panY: number, zoom: number): Camera => ({ panX, panY, zoom });

describe('documentToScreen / screenToDocument', () => {
  it('applies scale then translation', () => {
    expect(documentToScreen({ x: 100, y: 50 }, cam(20, 10, 2))).toEqual({ x: 220, y: 110 });
  });

  it('is the identity transform at zoom 1 with no pan', () => {
    expect(documentToScreen({ x: 7, y: 9 }, cam(0, 0, 1))).toEqual({ x: 7, y: 9 });
  });

  it('round-trips through both directions', () => {
    const camera = cam(-134.5, 77.25, 0.6);
    for (const point of [
      { x: 0, y: 0 },
      { x: 1440, y: 3200 },
      { x: -40, y: 12.5 },
    ]) {
      const back = screenToDocument(documentToScreen(point, camera), camera);
      expect(back.x).toBeCloseTo(point.x, 10);
      expect(back.y).toBeCloseTo(point.y, 10);
    }
  });

  it('converts client coordinates using the viewport rect', () => {
    const rect = { x: 300, y: 64, width: 1000, height: 800 };
    expect(clientToScreen(350, 164, rect)).toEqual({ x: 50, y: 100 });
  });

  it('scales rect dimensions but not stroke-space offsets', () => {
    const screenRect = documentRectToScreen({ x: 10, y: 20, width: 200, height: 40 }, cam(5, 5, 0.5));
    expect(screenRect).toEqual({ x: 10, y: 15, width: 100, height: 20 });
  });
});

describe('zoomAtPoint', () => {
  // The property the whole feature rests on: the document point under the
  // cursor must not move while zooming.
  it.each([
    ['zoom in from 100%', cam(0, 0, 1), 2, { x: 400, y: 300 }],
    ['zoom out from 100%', cam(0, 0, 1), 0.5, { x: 400, y: 300 }],
    ['zoom in from a panned, scaled camera', cam(-220, 140, 0.6), 1.35, { x: 512, y: 96 }],
    ['anchor at the viewport origin', cam(33, -77, 1.4), 0.25, { x: 0, y: 0 }],
    ['anchor off to one side', cam(-1000, -2000, 2.5), 1, { x: 1279, y: 13 }],
  ])('keeps the anchored document point fixed: %s', (_label, camera, nextZoom, anchor) => {
    const before = screenToDocument(anchor, camera);
    const next = zoomAtPoint(camera, nextZoom, anchor);
    const after = screenToDocument(anchor, next);

    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(next.zoom).toBeCloseTo(nextZoom, 9);
  });

  it('still pins the anchor when the requested zoom is clamped', () => {
    const camera = cam(10, 10, 1);
    const anchor = { x: 250, y: 150 };
    const before = screenToDocument(anchor, camera);

    const tooFar = zoomAtPoint(camera, 99, anchor);
    expect(tooFar.zoom).toBe(MAX_ZOOM);
    const after = screenToDocument(anchor, tooFar);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('is reversible: zoom in then out returns the original camera', () => {
    const camera = cam(-88, 42, 0.8);
    const anchor = { x: 613, y: 377 };
    const round = zoomByFactor(zoomByFactor(camera, 1.25, anchor), 1 / 1.25, anchor);
    expect(camerasEqual(round, camera)).toBe(true);
  });

  it('composes repeated wheel steps without drift', () => {
    const anchor = { x: 321, y: 654 };
    let camera = cam(0, 0, 1);
    const origin = screenToDocument(anchor, camera);

    for (let i = 0; i < 40; i++) camera = zoomByFactor(camera, 1.1, anchor);
    for (let i = 0; i < 40; i++) camera = zoomByFactor(camera, 1 / 1.1, anchor);

    const end = screenToDocument(anchor, camera);
    expect(end.x).toBeCloseTo(origin.x, 6);
    expect(end.y).toBeCloseTo(origin.y, 6);
  });
});

describe('clampZoom', () => {
  it('bounds the range and survives rubbish input', () => {
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(0.75)).toBe(0.75);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
  });
});

describe('fitWidth', () => {
  it('fits the document width inside the margins and centres it', () => {
    const camera = fitWidth({ width: 1240, height: 800 }, 1440);
    expect(camera.zoom).toBeCloseTo((1240 - 96) / 1440, 9);

    const left = documentToScreen({ x: 0, y: 0 }, camera);
    const right = documentToScreen({ x: 1440, y: 0 }, camera);
    expect(left.x).toBeCloseTo(48, 6);
    expect(right.x).toBeCloseTo(1240 - 48, 6);
  });

  it('shows the top of the page rather than the whole height', () => {
    // A very tall page must not be scaled down to fit vertically.
    const camera = fitWidth({ width: 1240, height: 800 }, 1440);
    expect(camera.panY).toBe(48);
    expect(camera.zoom).toBeGreaterThan(0.5);
  });

  it('does not magnify a narrow document past the zoom ceiling', () => {
    const camera = fitWidth({ width: 4000, height: 800 }, 375);
    expect(camera.zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('returns the identity camera for a degenerate viewport', () => {
    expect(fitWidth({ width: 0, height: 0 }, 1440)).toEqual({ panX: 0, panY: 0, zoom: 1 });
    expect(fitWidth({ width: 800, height: 600 }, 0)).toEqual({ panX: 0, panY: 0, zoom: 1 });
  });
});

describe('resetZoom', () => {
  it('returns to 100% keeping the viewport centre on the same document point', () => {
    const camera = cam(-300, -200, 0.35);
    const viewport = { width: 1000, height: 700 };
    const centre = { x: 500, y: 350 };
    const before = screenToDocument(centre, camera);

    const next = resetZoom(camera, viewport);
    expect(next.zoom).toBe(1);

    const after = screenToDocument(centre, next);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });
});

describe('panBy / centreHorizontally', () => {
  it('translates without touching zoom', () => {
    expect(panBy(cam(10, 20, 0.5), -5, 7)).toEqual({ panX: 5, panY: 27, zoom: 0.5 });
  });

  it('centres the scaled artboard in the viewport', () => {
    const camera = centreHorizontally(cam(0, 40, 0.5), { width: 1000, height: 600 }, 1440);
    expect(camera.panX).toBeCloseTo((1000 - 720) / 2, 9);
    expect(camera.panY).toBe(40);
    expect(camera.zoom).toBe(0.5);
  });
});

describe('clampPan', () => {
  const viewport = { width: 1000, height: 700 };
  const document = { width: 1440, height: 5000 };

  it('leaves a reasonable camera untouched', () => {
    const camera = cam(-200, -400, 1);
    expect(clampPan(camera, viewport, document)).toEqual(camera);
  });

  it('keeps a slice of the artboard on screen when dragged far away', () => {
    const far = clampPan(cam(100000, 100000, 1), viewport, document);
    const topLeft = documentToScreen({ x: 0, y: 0 }, far);
    expect(topLeft.x).toBeLessThanOrEqual(viewport.width);
    expect(topLeft.y).toBeLessThanOrEqual(viewport.height);

    const negative = clampPan(cam(-100000, -100000, 1), viewport, document);
    const bottomRight = documentToScreen({ x: document.width, y: document.height }, negative);
    expect(bottomRight.x).toBeGreaterThanOrEqual(0);
    expect(bottomRight.y).toBeGreaterThanOrEqual(0);
  });
});

describe('wheelDeltaToPixels', () => {
  it('normalises line and page deltas so Firefox does not crawl', () => {
    expect(wheelDeltaToPixels(100, 0)).toBe(100);
    expect(wheelDeltaToPixels(3, 1)).toBe(48);
    expect(wheelDeltaToPixels(1, 2)).toBe(400);
  });
});
