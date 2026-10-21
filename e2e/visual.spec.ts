import { expect, test } from '@playwright/test';
import {
  canvas,
  documentFrame,
  nodeBox,
  openEditor,
  selectionOutlineBox,
  shiftClickNode,
  waitForDocumentRendered,
} from './helpers';

/**
 * Screenshots for human review, each paired with geometry assertions.
 *
 * A screenshot on its own proves only that rendering did not crash. The
 * assertions here state what the picture is supposed to show, so a regression
 * fails the run rather than waiting for someone to notice it in an image.
 */

const SHOTS = 'e2e-screenshots';

test.describe('visual review', () => {
  test('editor at 1366x768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);
    await page.screenshot({ path: `${SHOTS}/01-editor-1366x768.png`, fullPage: false });

    // Both panels closed, nothing selected, canvas dominant.
    await expect(page.locator('aside')).toHaveCount(0);
    expect(await selectionOutlineBox(page)).toBeNull();

    const canvasBox = (await canvas(page).boundingBox())!;
    expect(canvasBox.height / 768).toBeGreaterThan(0.85);

    // The header stays compact so the page gets the room.
    const header = (await page.locator('header').first().boundingBox())!;
    expect(header.height).toBeLessThanOrEqual(56);

    // No control overlaps the command pill.
    const pill = (await page
      .getByRole('button', { name: /Co chcesz zmienić/ })
      .boundingBox())!;
    const zoomBar = (await page.locator('button[title="Dopasuj szerokość"]').boundingBox())!;
    expect(pill.x).toBeGreaterThan(zoomBar.x + zoomBar.width);
  });

  test('editor at 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openEditor(page);
    await page.screenshot({ path: `${SHOTS}/02-editor-1920x1080.png` });

    const canvasBox = (await canvas(page).boundingBox())!;
    expect(canvasBox.width / 1920).toBeGreaterThan(0.9);

    // Fit-to-width must not blow the artboard past the canvas.
    const frame = (await page.locator('iframe[title="Podgląd strony"]').boundingBox())!;
    expect(frame.width).toBeLessThanOrEqual(canvasBox.width);
  });

  test('selection near the canvas edge keeps its tools reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);

    // Select the footer, then pan it towards the bottom edge.
    await page.locator('button[title="Dopasuj szerokość"]').click();
    const canvasBox = (await canvas(page).boundingBox())!;
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.wheel(0, 1600);
    await shiftClickNode(page, 'materia-footer');

    // Pan further so the selection sits hard against the bottom.
    await page.mouse.wheel(0, -260);
    await page.screenshot({ path: `${SHOTS}/03-selection-at-edge.png` });

    const toolbar = (await page
      .locator('div.absolute.pointer-events-auto')
      .first()
      .boundingBox())!;

    // The action bar is inside the canvas and clear of the bottom controls.
    expect(toolbar.y).toBeGreaterThanOrEqual(canvasBox.y - 1);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
    const zoomBar = (await page.locator('button[title="Dopasuj szerokość"]').boundingBox())!;
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(zoomBar.y + 1);
  });

  test('selection at the top edge keeps its label on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);
    await shiftClickNode(page, 'materia-hero-heading');

    const canvasBox = (await canvas(page).boundingBox())!;
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    // Walk the selection up towards the top edge, checking the label each time.
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 60);
      const label = await page
        .locator('div.absolute.flex.items-center.gap-1')
        .first()
        .boundingBox();
      if (label) {
        expect(label.y).toBeGreaterThanOrEqual(canvasBox.y - 1);
        expect(label.y + label.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
      }
    }
    await page.screenshot({ path: `${SHOTS}/04-selection-top-edge.png` });
  });

  test('open action and expanded command field', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);
    await shiftClickNode(page, 'materia-hero-heading');
    await page.getByRole('button', { name: 'Tekst' }).click();
    await expect(page.locator('aside textarea')).toBeVisible();

    await page.getByRole('button', { name: /Co chcesz zmienić/ }).click();
    await expect(page.locator('input[placeholder^="np."]')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-action-and-command.png` });

    // The inspector and the command field must not cover each other.
    const inspector = (await page.locator('aside').boundingBox())!;
    const command = (await page.locator('input[placeholder^="np."]').boundingBox())!;
    const overlapsHorizontally =
      command.x < inspector.x + inspector.width && command.x + command.width > inspector.x;
    expect(overlapsHorizontally).toBe(false);

    // The command field leaves most of the canvas visible.
    const canvasBox = (await canvas(page).boundingBox())!;
    const dock = (await page.locator('input[placeholder^="np."]').boundingBox())!;
    expect(dock.height / canvasBox.height).toBeLessThan(0.15);
  });

  test('preview at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);
    await page.locator('button[title="Smartfon (375 px)"]').click();
    await page.locator('button[title^="Otwórz podgląd"]').click();
    await expect(page.getByRole('button', { name: /Wróć do edytora/ })).toBeVisible();
    await waitForDocumentRendered(page);

    await page.screenshot({ path: `${SHOTS}/06-preview-mobile.png` });

    // The frame really is 375px, and the mobile override is in effect.
    const state = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const d = f.contentDocument!;
      const heading = d.querySelector('[data-node-id="materia-hero-heading"]')!;
      return {
        // The frame stretches to its container, which is what fixes the width;
        // the viewport width inside is what media queries actually see.
        renderedWidth: Math.round(f.getBoundingClientRect().width),
        innerWidth: f.contentWindow!.innerWidth,
        fontSize: d.defaultView!.getComputedStyle(heading).fontSize,
      };
    });
    expect(state.renderedWidth).toBe(375);
    expect(state.innerWidth).toBe(375);
    expect(state.fontSize).toBe('36px');

    // Nothing in the document overflows the 375px viewport horizontally.
    const overflow = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const d = f.contentDocument!;
      return d.documentElement.scrollWidth > d.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test('drawer open keeps the canvas usable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);
    await page.locator('button[title="Struktura"]').click();
    await expect(page.locator('aside')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/07-drawer-open.png` });

    const canvasBox = (await canvas(page).boundingBox())!;
    // Even with a drawer open the canvas keeps the majority of the width.
    expect(canvasBox.width / 1366).toBeGreaterThan(0.6);

    // The tree is scrollable rather than clipped.
    const tree = (await page.locator('aside').boundingBox())!;
    expect(tree.y + tree.height).toBeLessThanOrEqual(768 + 1);
  });
});

test.describe('control collisions', () => {
  test('the expanded command field does not cover the canvas controls', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);

    const zoomBar = page.locator('button[title="Dopasuj szerokość"]');
    const before = (await zoomBar.boundingBox())!;

    await page.getByRole('button', { name: /Co chcesz zmienić/ }).click();
    const input = page.locator('input[placeholder^="np."]');
    await expect(input).toBeVisible();

    const dock = (await input.boundingBox())!;
    const after = (await zoomBar.boundingBox())!;

    // The controls stay where they were and stay clickable.
    expect(after.y).toBeCloseTo(before.y, 0);
    await expect(zoomBar).toBeVisible();

    // No vertical overlap between the two floating bars.
    const dockPanel = (await page.locator('input[placeholder^="np."]').locator('..').locator('..').boundingBox())!;
    expect(dockPanel.y + dockPanel.height).toBeLessThanOrEqual(after.y + 1);

    // And the controls really receive the click.
    await zoomBar.click();
    await page.screenshot({ path: `${SHOTS}/08-command-open-controls-clear.png` });
  });

  test('an action bar near the bottom edge flips above the selection', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openEditor(page);

    // Bring a section so its bottom sits low in the canvas, still visible.
    const canvasBox = (await canvas(page).boundingBox())!;
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.wheel(0, 240);
    await shiftClickNode(page, 'materia-hero-cta-primary');

    // Push the selection down until the bar can no longer sit below it.
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -40);
      const selection = await selectionOutlineBox(page);
      const bar = await page.locator('div.absolute.pointer-events-auto').first().boundingBox();
      if (!selection || !bar) continue;
      // Wherever it lands, it stays inside the canvas and clear of the controls.
      expect(bar.y).toBeGreaterThanOrEqual(canvasBox.y - 1);
      expect(bar.y + bar.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
    }
    await page.screenshot({ path: `${SHOTS}/09-action-bar-bottom-edge.png` });
  });
});
