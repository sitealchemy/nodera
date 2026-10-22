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

/** The editor's own header, which sits above the canvas. */
const HEADER_HEIGHT = 48;

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
 * Camera is driven through the real controls: 100% zoom, then a deliberately
 * over-long hand drag, which the pan clamp resolves to exactly (0, 0). That is
 * how the artboard is aligned to the canvas corner without reaching into the
 * app's state.
 */
async function shootNodera(page: Page, width: number, button: string): Promise<Buffer> {
  await page.locator(`button[title="${button}"]`).click();
  await page.locator('button[title="Ustaw 100%"]').click();

  // Make the whole artboard fit, so nothing is clipped by the canvas.
  const contentHeight = await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
    return parseFloat(frame.style.height);
  });
  await page.setViewportSize({
    width: width + 160,
    height: Math.ceil(contentHeight) + HEADER_HEIGHT + 60,
  });

  await page.locator('button[title^="Narzędzie dłoni"]').click();
  const canvas = page.locator('div[style*="cursor"]').first();
  const view = (await canvas.boundingBox())!;
  await page.mouse.move(view.x + view.width - 30, view.y + view.height - 30);
  await page.mouse.down();
  await page.mouse.move(view.x - 4000, view.y - 9000, { steps: 4 });
  await page.mouse.up();

  await waitForFrameResources(page);

  // The canvas overlays — zoom dock and selection outline — are editor chrome
  // drawn on top of the artboard. They are hidden for the capture only; no
  // assertion depends on them being absent.
  await page.evaluate(() => {
    const fit = [...document.querySelectorAll('button')].find(
      (button) => button.title === 'Dopasuj szerokość',
    );
    const dock = fit?.parentElement as HTMLElement | undefined;
    if (dock) dock.style.setProperty('display', 'none', 'important');
    document
      .querySelectorAll<HTMLElement>('div.pointer-events-none.z-20')
      .forEach((overlay) => overlay.style.setProperty('display', 'none', 'important'));
  });

  const frame = page.locator('iframe[title="Podgląd strony"]');
  const box = (await frame.boundingBox())!;
  // The artboard really is at the canvas corner and unscaled.
  expect(Math.round(box.x)).toBe(Math.round(view.x));
  expect(Math.round(box.y)).toBe(Math.round(view.y));
  expect(Math.round(box.width)).toBe(width);

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
