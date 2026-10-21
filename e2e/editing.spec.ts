import { expect, test } from '@playwright/test';
import {
  collectPageProblems,
  documentFrame,
  findStoredNode,
  openEditor,
  readCamera,
  readProject,
  runCommand,
  selectedNodeName,
  setScope,
  setViewport,
  shiftClickNode,
  waitForDocumentRendered,
} from './helpers';

const HEADING = 'materia-hero-heading';

/** The heading as the document frame currently renders it. */
function headingText(page: import('@playwright/test').Page) {
  return documentFrame(page).locator(`[data-node-id="${HEADING}"]`);
}

test.describe('editing and history', () => {
  test('one edit is undone by exactly one undo, and redone by one redo', async ({ page }) => {
    await openEditor(page);
    const original = (await headingText(page).textContent())!.trim();

    await shiftClickNode(page, HEADING);
    await page.locator('button[title="Edytuj treść tekstu"]').click();

    const textarea = page.locator('aside textarea');
    await textarea.fill('Zupełnie nowy nagłówek');
    await expect(headingText(page)).toHaveText('Zupełnie nowy nagłówek');

    const undo = page.locator('button[title^="Cofnij"]');
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(headingText(page)).toHaveText(original);
    // Exactly one entry existed, so undo is now spent.
    await expect(undo).toBeDisabled();

    const redo = page.locator('button[title^="Ponów"]');
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(headingText(page)).toHaveText('Zupełnie nowy nagłówek');
  });

  test('camera movement creates no history entries', async ({ page }) => {
    await openEditor(page);
    const undo = page.locator('button[title^="Cofnij"]');
    await expect(undo).toBeDisabled();

    const canvasBox = (await page.locator('div[style*="cursor"]').first().boundingBox())!;
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    for (const delta of [200, -120, 300]) await page.mouse.wheel(0, delta);
    await page.locator('button[title="Powiększ"]').click();
    await page.locator('button[title="Dopasuj szerokość"]').click();

    await expect(undo).toBeDisabled();
  });

  test('switching pages does not create history entries', async ({ page }) => {
    await openEditor(page);
    const undo = page.locator('button[title^="Cofnij"]');

    await page.locator('button[title="Wybierz podstronę"]').click();
    await page.getByRole('button', { name: /^Kontakt/ }).click();
    await waitForDocumentRendered(page);
    await page.locator('button[title="Wybierz podstronę"]').click();
    await page.getByRole('button', { name: /^Strona główna/ }).click();
    await waitForDocumentRendered(page);

    await expect(undo).toBeDisabled();
  });

  test('typing in a field keeps native keyboard behaviour', async ({ page }) => {
    await openEditor(page);
    await shiftClickNode(page, HEADING);
    await page.locator('button[title="Edytuj treść tekstu"]').click();

    const textarea = page.locator('aside textarea');
    await textarea.fill('abc');
    await textarea.press('End');
    // Space must type a space, not arm the hand tool.
    await textarea.press('Space');
    await textarea.press('d');
    await expect(textarea).toHaveValue('abc d');

    // Arrow keys move the caret rather than walking the document tree.
    const nameBefore = await selectedNodeName(page);
    await textarea.press('ArrowUp');
    await textarea.press('ArrowLeft');
    expect(await selectedNodeName(page)).toBe(nameBefore);

    // The camera did not move while typing.
    const camera = await readCamera(page);
    await textarea.press('Space');
    expect((await readCamera(page)).zoom).toBeCloseTo(camera.zoom, 5);
  });

  test('editor shortcuts do not reach through an open modal', async ({ page }) => {
    await openEditor(page);
    await shiftClickNode(page, HEADING);
    await page.locator('button[title="Edytuj treść tekstu"]').click();
    await page.locator('aside textarea').fill('Tekst przed modalem');
    await expect(headingText(page)).toHaveText('Tekst przed modalem');

    await page.locator('button[title="Więcej"]').click();
    await page.getByRole('button', { name: /Kod i eksport/ }).click();
    await expect(page.locator('pre')).toBeVisible();

    const before = (await readProject(page)).directions.materia.pages.start;
    const serialised = JSON.stringify(before);

    // Undo and arrow keys must not touch the document behind the modal.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    const after = (await readProject(page)).directions.materia.pages.start;
    expect(JSON.stringify(after)).toBe(serialised);
  });
});

test.describe('scope independence', () => {
  test('viewport width and edit scope are independent', async ({ page }) => {
    await openEditor(page);

    // Looking at mobile while editing the shared rule.
    await setViewport(page, 'Smartfon (375 px)');
    await expect(page.locator('button[title^="Zakres edycji"]')).toContainText('Wszystkie ekrany');

    const frameWidth = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.style.width;
    });
    expect(frameWidth).toBe('375px');

    // Changing the scope must not change the preview width.
    await setScope(page, 'Tablety');
    const stillMobile = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.style.width;
    });
    expect(stillMobile).toBe('375px');

    // Zoom must not change the breakpoint either.
    await page.locator('button[title="Powiększ"]').click();
    const afterZoom = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.style.width;
    });
    expect(afterZoom).toBe('375px');
  });

  test('a tablet-scope edit writes an override, leaving the shared style alone', async ({
    page,
  }) => {
    await openEditor(page);
    await setScope(page, 'Tablety');
    await shiftClickNode(page, HEADING);
    await page.locator('button[title="Zmień rozmiar i odstępy"]').click();

    const fontField = page.locator('aside input[type="text"]').first();
    await fontField.fill('31px');
    await expect(fontField).toHaveValue('31px');

    await expect
      .poll(async () => {
        const project = await readProject(page);
        const node = findStoredNode(project.directions.materia.pages.start.root, HEADING);
        return node?.responsiveOverrides?.tablet?.fontSize;
      })
      .toBe('31px');

    const project = await readProject(page);
    const node = findStoredNode(project.directions.materia.pages.start.root, HEADING);
    expect(node.styles.fontSize).toBe('56px');
  });

  test('a structural command refuses in a local scope and changes nothing', async ({ page }) => {
    await openEditor(page);
    await setScope(page, 'Małe ekrany');

    const before = JSON.stringify(await readProject(page));
    await runCommand(page, 'kontakt na koniec menu');

    await expect(page.getByText(/wspólna dla wszystkich ekranów/)).toBeVisible();
    await expect(page.getByText(/Przełącz zakres/)).toBeVisible();

    // Nothing applied, no history, and the typed text survives for correction.
    expect(JSON.stringify(await readProject(page))).toBe(before);
    await expect(page.locator('button[title^="Cofnij"]')).toBeDisabled();
    await expect(page.locator('input[placeholder^="np."]')).toHaveValue(
      'kontakt na koniec menu',
    );
  });

  test('an unsupported command shows no success and creates no history', async ({ page }) => {
    await openEditor(page);
    const before = JSON.stringify(await readProject(page));

    await runCommand(page, 'zrób mi kawę');

    await expect(page.getByText(/Nie rozumiem polecenia/)).toBeVisible();
    await expect(page.locator('.text-emerald-600')).toHaveCount(0);
    await expect(page.locator('button[title^="Cofnij"]')).toBeDisabled();
    expect(JSON.stringify(await readProject(page))).toBe(before);
  });

  test('a command obeys the number it was given', async ({ page }) => {
    await openEditor(page);
    await shiftClickNode(page, HEADING);

    await runCommand(page, 'powiększ o 50%');

    await expect
      .poll(async () => {
        const project = await readProject(page);
        return findStoredNode(project.directions.materia.pages.start.root, HEADING)?.styles
          .fontSize;
      })
      .toBe('84px'); // 56 * 1.5, not a fixed 20%
  });
});

test.describe('direction isolation', () => {
  test('recolouring one direction leaves the others and the snapshot untouched', async ({
    page,
  }) => {
    await openEditor(page);

    const before = await readProject(page);
    const otherAccents = Object.entries(before.directions)
      .filter(([id]) => id !== before.activeDirectionId)
      .map(([id, dir]: [string, any]) => [id, dir.tokens.accentCopper]);
    const snapshotBefore = JSON.stringify(before.snapshots);

    await page.locator('button[title="Style"]').click();
    await page.getByRole('button', { name: 'Kobalt', exact: true }).click();

    await expect
      .poll(async () => {
        const project = await readProject(page);
        return project.directions[project.activeDirectionId].tokens.accentCopper;
      })
      .toBe('#24486E');

    const after = await readProject(page);
    otherAccents.forEach(([id, accent]) => {
      expect(after.directions[id as string].tokens.accentCopper).toBe(accent);
    });
    expect(JSON.stringify(after.snapshots)).toBe(snapshotBefore);
  });

  test('switching direction restores that direction own look', async ({ page }) => {
    await openEditor(page);

    await page.locator('button[title="Style"]').click();
    await page.getByRole('button', { name: 'Grafit', exact: true }).click();
    await expect
      .poll(async () => (await readProject(page)).tokens.accentCopper)
      .toBe('#1C1B19');

    await page.locator('button[title="Kierunki"]').click();
    await page.locator('aside button').filter({ hasText: 'Interpretująca' }).click();
    await waitForDocumentRendered(page);

    await expect.poll(async () => (await readProject(page)).tokens.accentCopper).toBe('#A86645');

    await page.locator('aside button').filter({ hasText: 'Wierna briefowi' }).click();
    await waitForDocumentRendered(page);
    await expect.poll(async () => (await readProject(page)).tokens.accentCopper).toBe('#1C1B19');
  });

  test('the shared token control states its real scope', async ({ page }) => {
    await openEditor(page);
    await setScope(page, 'Małe ekrany');
    await page.locator('button[title="Style"]').click();

    await expect(page.getByText(/wspólne dla wszystkich ekranów/)).toBeVisible();
  });
});

test.describe('application health', () => {
  test('a full editing session raises no unhandled errors', async ({ page }) => {
    const problems = collectPageProblems(page);
    await openEditor(page);

    await shiftClickNode(page, HEADING);
    await page.getByRole('button', { name: 'Położenie' }).click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await page.locator('button[title="Struktura"]').click();
    await page.locator('button[title="Podstrony"]').click();
    await setViewport(page, 'Tablet (768 px)');
    await setViewport(page, 'Duże ekrany (1440 px)');
    await page.locator('button[title^="Cofnij"]').click();

    expect(problems.errors).toEqual([]);
    expect(problems.console).toEqual([]);
  });
});
