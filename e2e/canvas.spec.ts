import { expect, test } from '@playwright/test';
import {
  canvas,
  collectPageProblems,
  documentFrame,
  nodeBox,
  openEditor,
  readCamera,
  selectedNodeName,
  selectionOutlineBox,
  shiftClickNode,
  waitForDocumentRendered,
} from './helpers';

test.describe('editor start', () => {
  test('opens with both panels closed, nothing selected, page dominant', async ({ page }) => {
    const problems = collectPageProblems(page);
    await openEditor(page);

    // No drawer and no inspector.
    await expect(page.locator('aside')).toHaveCount(0);
    // No selection outline.
    expect(await selectionOutlineBox(page)).toBeNull();
    // The command field is collapsed to its pill.
    await expect(page.getByRole('button', { name: /Co chcesz zmienić/ })).toBeVisible();

    // The canvas occupies most of the window below the header.
    const viewport = page.viewportSize()!;
    const box = await canvas(page).boundingBox();
    expect(box!.height).toBeGreaterThan(viewport.height * 0.8);
    expect(box!.width).toBeGreaterThan(viewport.width * 0.9);

    // No horizontal overflow of the interface itself.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    expect(problems.errors).toEqual([]);
    expect(problems.console).toEqual([]);
  });

  test('fits the page width and shows the top of the document', async ({ page }) => {
    await openEditor(page);
    const camera = await readCamera(page);
    // Fit, not a microscopic whole-page overview.
    expect(camera.zoom).toBeGreaterThan(0.3);
    expect(camera.zoom).toBeLessThanOrEqual(1);

    const canvasBox = (await canvas(page).boundingBox())!;
    const left = camera.x - canvasBox.x;
    expect(left).toBeGreaterThan(0);
  });
});

test.describe('camera', () => {
  test('ctrl+wheel zooms around the cursor', async ({ page }) => {
    await openEditor(page);
    const box = (await canvas(page).boundingBox())!;
    const anchorX = box.x + box.width * 0.6;
    const anchorY = box.y + box.height * 0.4;

    const documentPointUnder = async () =>
      page.evaluate(
        ([cx, cy]) => {
          const frame = document.querySelector(
            'iframe[title="Podgląd strony"]',
          ) as HTMLIFrameElement;
          const r = frame.getBoundingClientRect();
          const zoom = r.width / parseFloat(frame.style.width);
          return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
        },
        [anchorX, anchorY],
      );

    const before = await documentPointUnder();
    await page.mouse.move(anchorX, anchorY);
    for (const delta of [-240, -240, 180]) {
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, delta);
      await page.keyboard.up('Control');
    }
    const after = await documentPointUnder();

    // The document point under the cursor must not drift.
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test('wheel pans without changing zoom', async ({ page }) => {
    await openEditor(page);
    const before = await readCamera(page);
    const box = (await canvas(page).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);

    const after = await readCamera(page);
    expect(after.zoom).toBeCloseTo(before.zoom, 5);
    expect(after.y).toBeLessThan(before.y);
  });

  test('space + drag pans and releases cleanly', async ({ page }) => {
    await openEditor(page);
    const before = await readCamera(page);
    const box = (await canvas(page).boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.keyboard.down('Space');
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 120, startY - 60, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');

    const after = await readCamera(page);
    expect(after.x).toBeLessThan(before.x);
    expect(after.zoom).toBeCloseTo(before.zoom, 5);

    // The hand must not stay stuck: a plain click now selects nothing and
    // does not pan.
    const settled = await readCamera(page);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY, { steps: 4 });
    await page.mouse.up();
    const afterPlainDrag = await readCamera(page);
    expect(Math.abs(afterPlainDrag.x - settled.x)).toBeLessThan(1);
  });

  test('100% and fit-to-width behave predictably', async ({ page }) => {
    await openEditor(page);

    await page.locator('button[title="Ustaw 100%"]').click();
    expect((await readCamera(page)).zoom).toBeCloseTo(1, 2);

    await page.locator('button[title="Dopasuj szerokość"]').click();
    const fitted = await readCamera(page);
    const canvasBox = (await canvas(page).boundingBox())!;

    // Equal margins on both sides: the artboard is centred.
    const left = fitted.x - canvasBox.x;
    const frameWidth = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.getBoundingClientRect().width;
    });
    const right = canvasBox.x + canvasBox.width - (fitted.x + frameWidth);
    expect(Math.abs(left - right)).toBeLessThan(2);
  });
});

test.describe('selection', () => {
  // The property that matters: the same visible element is hit at any scale,
  // and the outline lands exactly on it.
  for (const zoomClicks of [0, 3, -4]) {
    test(`shift+click selects the right node and the outline matches it (zoom steps ${zoomClicks})`, async ({
      page,
    }) => {
      await openEditor(page);

      const zoomButton = zoomClicks >= 0 ? 'Powiększ' : 'Pomniejsz';
      for (let i = 0; i < Math.abs(zoomClicks); i++) {
        await page.locator(`button[title="${zoomButton}"]`).click();
      }
      // Pan a little so the test is not only valid at the origin.
      const box = (await canvas(page).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(40, 60);

      await shiftClickNode(page, 'materia-hero-heading');
      expect(await selectedNodeName(page)).toBe('Główny nagłówek');

      const element = await nodeBox(page, 'materia-hero-heading');
      const outline = (await selectionOutlineBox(page))!;

      expect(Math.abs(outline.x - element.x)).toBeLessThan(1.5);
      expect(Math.abs(outline.y - element.y)).toBeLessThan(1.5);
      expect(Math.abs(outline.width - element.width)).toBeLessThan(1.5);
      expect(Math.abs(outline.height - element.height)).toBeLessThan(1.5);
    });
  }

  test('outline follows the element after panning and zooming', async ({ page }) => {
    await openEditor(page);
    await shiftClickNode(page, 'materia-hero-heading');

    const box = (await canvas(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 150);
    await page.locator('button[title="Powiększ"]').click();

    const element = await nodeBox(page, 'materia-hero-heading');
    const outline = (await selectionOutlineBox(page))!;
    expect(Math.abs(outline.x - element.x)).toBeLessThan(1.5);
    expect(Math.abs(outline.y - element.y)).toBeLessThan(1.5);
  });

  test('arrow keys walk the document structure without the tree drawer', async ({ page }) => {
    await openEditor(page);
    await shiftClickNode(page, 'materia-hero-heading');
    expect(await selectedNodeName(page)).toBe('Główny nagłówek');

    await page.keyboard.press('ArrowUp');
    expect(await selectedNodeName(page)).toBe('Sekcja Główna Hero');

    await page.keyboard.press('ArrowDown');
    expect(await selectedNodeName(page)).toBe('Kicker nad nagłówkiem');

    await page.keyboard.press('ArrowRight');
    expect(await selectedNodeName(page)).toBe('Główny nagłówek');

    await page.keyboard.press('ArrowLeft');
    expect(await selectedNodeName(page)).toBe('Kicker nad nagłówkiem');

    // No drawer was opened to do any of this.
    await expect(page.locator('aside')).toHaveCount(0);
  });

  test('escape closes the action first, then the selection', async ({ page }) => {
    await openEditor(page);
    await shiftClickNode(page, 'materia-hero-heading');

    await page.locator('button[title="Edytuj treść tekstu"]').click();
    await expect(page.locator('aside textarea')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('aside textarea')).toHaveCount(0);
    expect(await selectedNodeName(page)).toBe('Główny nagłówek');

    await page.keyboard.press('Escape');
    expect(await selectionOutlineBox(page)).toBeNull();
  });
});

test.describe('exploration is safe', () => {
  test('clicking a link does not navigate and does not move anything', async ({ page }) => {
    await openEditor(page);

    const before = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return {
        url: frame.contentWindow!.location.href,
        html: frame.contentDocument!.body.innerHTML.length,
      };
    });

    const logoBox = await nodeBox(page, 'materia-logo');
    const linkBox = await nodeBox(page, 'nav-item-2');

    // Try to drag the logo and click the link, with no modifier held.
    await page.mouse.move(logoBox.x + 10, logoBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(logoBox.x + 150, logoBox.y + 90, { steps: 5 });
    await page.mouse.up();
    await page.mouse.click(linkBox.x + 5, linkBox.y + 5);

    const after = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return {
        url: frame.contentWindow!.location.href,
        html: frame.contentDocument!.body.innerHTML.length,
      };
    });

    expect(after.url).toBe(before.url);
    expect(after.html).toBe(before.html);
    expect(await selectionOutlineBox(page)).toBeNull();
  });

  test('the document frame is inert to pointer events in the editor', async ({ page }) => {
    await openEditor(page);
    const pointerEvents = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return getComputedStyle(f).pointerEvents;
    });
    expect(pointerEvents).toBe('none');
  });

  test('submitting a form inside the document does nothing', async ({ page }) => {
    await openEditor(page);
    await page.locator('button[title="Wybierz podstronę"]').click();
    await page.getByRole('button', { name: /^Kontakt/ }).click();
    await waitForDocumentRendered(page);

    const before = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.contentWindow!.location.href;
    });

    await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const form = f.contentDocument!.querySelector('form');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const after = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.contentWindow!.location.href;
    });
    expect(after).toBe(before);
  });
});

test.describe('renderer', () => {
  test('adds no wrapper elements around document nodes', async ({ page }) => {
    await openEditor(page);
    const wrappers = await documentFrame(page).locator('div.relative.group').count();
    expect(wrappers).toBe(0);
  });
});
