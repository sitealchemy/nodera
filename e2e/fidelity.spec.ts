import { expect, test, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { mockManus, serveOriginal } from './manusMock';
import { waitForFrameResources, waitForSiteRendered } from './helpers';

/**
 * Does Nodera show the page Manus designed, or its own idea of it?
 *
 * The question is answered by rendering the same files twice — once as a plain
 * website, once through the editor's import and preview — and comparing the
 * pixels at three widths. Nothing is compared against a stored baseline: the
 * reference is generated in the same run from the same files, so there is no
 * blessed image to quietly re-bless when something regresses.
 *
 * Screenshots and diffs land in e2e-screenshots/fidelity/ either way, so a
 * failure can be looked at rather than guessed about.
 */

const SHOTS = 'e2e-screenshots/fidelity';
const PROMPT = 'Strona dla trzech domków w lesie na Dolnym Śląsku — zdjęcia, ceny, kontakt.';

/**
 * How much difference is accepted, as a share of compared pixels.
 *
 * Text antialiasing differs very slightly between a top-level document and the
 * same document inside an iframe, which is a sub-pixel effect on glyph edges.
 * 0.4% is enough room for that and nowhere near enough to hide a shifted
 * section, a dropped background or a lost font.
 */
const MAX_DIFF_RATIO = 0.004;

/** Per-channel tolerance handed to pixelmatch, not a global fudge factor. */
const PIXEL_THRESHOLD = 0.12;

const WIDTHS = [
  { label: 'desktop', px: 1440, button: 'Duże ekrany (1440 px)' },
  { label: 'tablet', px: 768, button: 'Tablet (768 px)' },
  { label: 'mobile', px: 375, button: 'Smartfon (375 px)' },
] as const;

async function fresh(page: Page) {
  await page.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem('e2e-cleared')) return;
      window.sessionStorage.setItem('e2e-cleared', '1');
      indexedDB.deleteDatabase('nodera');
      window.localStorage.removeItem('nodera_project_state_v1');
      window.localStorage.removeItem('nodera_migrated_to_projects_v1');
    } catch {
      /* private mode */
    }
  });
}

/**
 * Screenshots the fixture as an ordinary website at a given width.
 *
 * The viewport is made taller than the document on purpose: a vertical
 * scrollbar would take width away from the layout and shift everything, and
 * comparing a 1425px layout against a 1440px one proves nothing.
 */
async function shootOriginal(page: Page, width: number): Promise<Buffer> {
  const url = await serveOriginal(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: height + 40 });
  await page.waitForFunction(
    () =>
      document.readyState === 'complete' &&
      document.fonts.status === 'loaded' &&
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    undefined,
    { timeout: 30_000 },
  );
  // No scrollbar now, so the layout width is exactly the requested width.
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(width);

  // Clipped to the document, not the viewport: a full-page capture is at
  // least viewport-sized, and the extra headroom above would otherwise be
  // counted as the page being taller than it is.
  return page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width, height } });
}

/**
 * Screenshots the same page as the editor renders it, at the same width.
 *
 * No panning: the camera is left wherever "100%" put it, the window is grown
 * until the whole artboard fits inside it, and the capture is clipped to the
 * artboard's measured box. Driving the camera to a particular corner first
 * was incidental to the comparison and quietly depended on the canvas being
 * full-bleed, which it is not once the drawer rail is beside it.
 */
async function shootNodera(page: Page, width: number, button: string): Promise<Buffer> {
  await page.locator(`button[title="${button}"]`).click();

  // Give the canvas room to spare before framing, so that "fit" and then
  // "100%" leave the artboard wholly inside it. The canvas clips what hangs
  // past its edge, and a clip taken over the clipped part captures the chrome
  // behind it — which is exactly how a 24px strip of the drawer rail once got
  // compared against the page and read as a conversion fault.
  await page.setViewportSize({ width: width + 600, height: 900 });
  await page.locator('button[title="Dopasuj szerokość"]').click();
  await page.locator('button[title="Ustaw 100%"]').click();

  const frame = page.locator('iframe[title="Podgląd strony"]');
  const first = (await frame.boundingBox())!;
  await page.setViewportSize({
    width: width + 600,
    height: Math.ceil(first.y + first.height) + 80,
  });

  await waitForFrameResources(page);

  // The canvas overlays — zoom dock, command dock and selection outline — are
  // editor chrome drawn on top of the artboard. They are hidden for the
  // capture only; no assertion depends on them being absent.
  await page.evaluate(() => {
    const hide = (element: Element | null | undefined) =>
      (element as HTMLElement | undefined)?.style.setProperty('display', 'none', 'important');
    hide(document.querySelector('[data-canvas-controls]'));
    hide(document.querySelector('[data-command-dock]'));
    document.querySelectorAll('div.pointer-events-none.z-20').forEach(hide);
  });

  const box = (await frame.boundingBox())!;
  const canvas = (await page.locator('div[style*="cursor"]').first().boundingBox())!;

  // Unscaled, and not clipped by the canvas on any side.
  expect(Math.round(box.width)).toBe(width);
  expect(Math.round(box.x), 'artboard is clipped on the left').toBeGreaterThanOrEqual(
    Math.round(canvas.x),
  );
  expect(Math.round(box.y), 'artboard is clipped at the top').toBeGreaterThanOrEqual(
    Math.round(canvas.y),
  );
  expect(Math.ceil(box.x + box.width), 'artboard is clipped on the right').toBeLessThanOrEqual(
    Math.ceil(canvas.x + canvas.width),
  );
  expect(Math.ceil(box.y + box.height), 'artboard is clipped at the bottom').toBeLessThanOrEqual(
    Math.ceil(canvas.y + canvas.height),
  );

  return page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
}

interface Comparison {
  diffRatio: number;
  comparedHeight: number;
  originalHeight: number;
  noderaHeight: number;
}

/** Compares two PNGs over their common area and writes the diff image. */
function compare(name: string, original: Buffer, nodera: Buffer): Comparison {
  const left = PNG.sync.read(original);
  const right = PNG.sync.read(nodera);

  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);

  // Crop both to the common area rather than scaling either: scaling would
  // smear a real misalignment into something that looks like antialiasing.
  const crop = (source: PNG) => {
    const out = new PNG({ width, height });
    PNG.bitblt(source, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const a = crop(left);
  const b = crop(right);
  const diff = new PNG({ width, height });

  const changed = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: PIXEL_THRESHOLD,
    includeAA: false,
  });

  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(`${SHOTS}/${name}-original.png`, original);
  writeFileSync(`${SHOTS}/${name}-nodera.png`, nodera);
  writeFileSync(`${SHOTS}/${name}-diff.png`, PNG.sync.write(diff));

  return {
    diffRatio: changed / (width * height),
    comparedHeight: height,
    originalHeight: left.height,
    noderaHeight: right.height,
  };
}

test.describe('visual fidelity: Manus original vs Nodera', () => {
  for (const { label, px, button } of WIDTHS) {
    test(`matches the original at ${px}px`, async ({ page }) => {
      await mockManus(page);
      await fresh(page);

      // The original first, in the same browser, with the same fonts.
      const original = await shootOriginal(page, px);

      // Then the same files through the real import and preview.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await page.getByLabel('Opis strony').fill(PROMPT);
      await page.getByRole('button', { name: 'Stwórz stronę' }).click();
      await waitForSiteRendered(page);

      const nodera = await shootNodera(page, px, button);
      const result = compare(`${label}-${px}`, original, nodera);

      // Reported on every run, pass or fail: a number that drifts upwards is
      // worth seeing before it crosses the threshold.
      // eslint-disable-next-line no-console
      console.log(
        `  fidelity ${px}px: ${(result.diffRatio * 100).toFixed(3)}% of ` +
          `${px}×${result.comparedHeight} differ (original ${result.originalHeight}px, ` +
          `Nodera ${result.noderaHeight}px)`,
      );

      // Page height is the first thing a lossy conversion gets wrong.
      expect(
        Math.abs(result.originalHeight - result.noderaHeight),
        `page height: original ${result.originalHeight}px, Nodera ${result.noderaHeight}px`,
      ).toBeLessThanOrEqual(2);

      expect(
        result.diffRatio,
        `${(result.diffRatio * 100).toFixed(3)}% of pixels differ over ` +
          `${px}×${result.comparedHeight}; see ${SHOTS}/${label}-${px}-diff.png`,
      ).toBeLessThan(MAX_DIFF_RATIO);
    });
  }
});
