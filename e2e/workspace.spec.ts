import { expect, test, Page } from '@playwright/test';
import { mockManus } from './manusMock';
import {
  documentFrame,
  openEditor,
  selectSiteElement,
  selectionActions,
  waitForDocumentRendered,
  waitForSiteRendered,
} from './helpers';

/**
 * One workspace, two documents.
 *
 * A page designed by Manus used to open in a parallel, cut-down screen: no
 * drawer rail, no structure, no contextual actions, no preview. These tests
 * hold both document kinds to the same bar, so the two can never drift apart
 * again without something going red.
 */

const SHOTS = 'e2e-screenshots/workspace';
const PROMPT = 'Strona dla trzech domków w lesie na Dolnym Śląsku — zdjęcia, ceny, kontakt.';

/** Controls every document must offer, by the title the user can see. */
const SHARED_CONTROLS = [
  'Wróć do projektów',
  'Duże ekrany (1440 px)',
  'Tablet (768 px)',
  'Smartfon (375 px)',
  'Cofnij (Ctrl/Cmd + Z)',
  'Ponów (Ctrl/Cmd + Shift + Z)',
  'Zapisz projekt',
  'Więcej',
  'Tryb wybierania (lub przytrzymaj Shift)',
  'Narzędzie dłoni (lub przytrzymaj spację)',
  'Pomniejsz',
  'Ustaw 100%',
  'Powiększ',
  'Dopasuj szerokość',
];

/** The five drawers, which stay present for every document. */
const RAIL = ['Podstrony', 'Materiały', 'Kierunki', 'Struktura', 'Style'];

async function openGeneratedProject(page: Page) {
  await mockManus(page);
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
  await page.goto('/');
  await page.getByLabel('Opis strony').fill(PROMPT);
  await page.getByRole('button', { name: 'Stwórz stronę' }).click();
  await waitForSiteRendered(page);
}

/** A control is present, visible and hit-testable at its own centre. */
async function assertClickable(page: Page, title: string) {
  const control = page.locator(`[title="${title}"], [title^="${title} —"]`).first();
  await expect(control, `control "${title}" is missing`).toBeVisible();

  const box = (await control.boundingBox())!;
  const owner = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        tag: element?.tagName ?? null,
        // Walking up finds the control even when the hit lands on its icon.
        onControl: !!element?.closest('button'),
        frame: element?.tagName === 'IFRAME',
      };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );

  // Nothing — least of all the page being edited — sits on top of the tools.
  expect(owner.frame, `the document frame covers "${title}"`).toBe(false);
  expect(owner.onControl, `something covers "${title}" (hit ${owner.tag})`).toBe(true);
}

test.describe('the workspace is the same for both documents', () => {
  for (const kind of ['generated', 'demo'] as const) {
    test(`tools are present and clickable — ${kind}`, async ({ page }) => {
      if (kind === 'generated') await openGeneratedProject(page);
      else {
        await mockManus(page);
        await openEditor(page);
        await waitForDocumentRendered(page);
      }

      for (const title of SHARED_CONTROLS) await assertClickable(page, title);
      for (const label of RAIL) await assertClickable(page, label);

      await page.screenshot({ path: `${SHOTS}/${kind}-workspace.png` });
    });

    test(`pan, zoom and selection work — ${kind}`, async ({ page }) => {
      if (kind === 'generated') await openGeneratedProject(page);
      else {
        await mockManus(page);
        await openEditor(page);
        await waitForDocumentRendered(page);
      }

      const camera = () =>
        page.evaluate(() => {
          const frame = document.querySelector(
            'iframe[title="Podgląd strony"]',
          ) as HTMLIFrameElement;
          const rect = frame.getBoundingClientRect();
          return { zoom: rect.width / parseFloat(frame.style.width), x: rect.left, y: rect.top };
        });

      const before = await camera();

      // Zoom through the shared control.
      await page.locator('button[title="Powiększ"]').click();
      expect((await camera()).zoom).toBeGreaterThan(before.zoom);
      await page.locator('button[title="Ustaw 100%"]').click();
      expect((await camera()).zoom).toBeCloseTo(1, 5);

      // Pan with the hand tool.
      await page.locator('button[title^="Narzędzie dłoni"]').click();
      const canvas = page.locator('div[style*="cursor"]').first();
      const view = (await canvas.boundingBox())!;
      await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      await page.mouse.down();
      await page.mouse.move(view.x + view.width / 2 - 120, view.y + view.height / 2, { steps: 6 });
      await page.mouse.up();
      const panned = await camera();
      expect(Math.abs(panned.x - before.x)).toBeGreaterThan(20);
      await page.locator('button[title^="Narzędzie dłoni"]').click();

      await page.locator('button[title="Dopasuj szerokość"]').click();

      // Selection offers contextual actions, and only the applicable ones.
      if (kind === 'generated') {
        await selectSiteElement(page, '.hero__lead');
        expect(await selectionActions(page)).toContain('Tekst');
        await page.screenshot({ path: `${SHOTS}/${kind}-selection.png` });
      } else {
        const heading = documentFrame(page).locator('h1').first();
        const box = (await heading.boundingBox())!;
        await page.keyboard.down('Shift');
        await page.mouse.click(box.x + 30, box.y + 15);
        await page.keyboard.up('Shift');
        await expect(page.locator('button[title^="Odznacz"]').first()).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/${kind}-selection.png` });
      }
    });
  }

  test('the structure drawer drives selection on a generated page', async ({ page }) => {
    await openGeneratedProject(page);

    // Closed by default: the page is what the user sees first.
    await expect(page.getByText('STRUKTURA DOKUMENTU')).toHaveCount(0);

    await page.locator('button[title="Struktura"]').click();
    const drawer = page.locator('aside').first();
    await expect(drawer).toContainText('site-header');

    // The tree is the document's own structure, not a node model.
    await drawer.getByRole('button', { name: /hero__lead|Drewno, szkło/ }).first().click();
    await expect(page.locator('button[title^="Odznacz"]').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/generated-structure.png` });

    await page.locator('button[title="Zamknij panel"]').click();
    await expect(page.getByText('STRUKTURA DOKUMENTU')).toHaveCount(0);
  });

  test('controls that do not apply say why instead of vanishing', async ({ page }) => {
    await openGeneratedProject(page);

    // Still on the rail, visibly off, carrying the reason.
    const styles = page.locator('button[title^="Style —"]');
    await expect(styles).toBeDisabled();
    await expect(styles).toHaveAttribute('title', /Globalne tokeny/);

    const scope = page.locator('button[title^="Zakres edycji zapisuje"]');
    await expect(scope).toBeDisabled();

    // The command dock states its own limit rather than disappearing.
    await expect(page.getByText('Polecenia niedostępne dla tej strony')).toBeVisible();

    // And the "Więcej" menu explains each entry it cannot offer.
    await page.locator('button[title="Więcej"]').click();
    const proposal = page.getByRole('button', { name: /Propozycja dla klienta/ });
    await expect(proposal).toBeDisabled();
    await expect(proposal).toContainText('czyta model węzłowy Nodery');
    await page.screenshot({ path: `${SHOTS}/generated-more-menu.png` });
  });

  test('editing, saving and reopening keep the change — generated', async ({ page }) => {
    await openGeneratedProject(page);

    await selectSiteElement(page, '.hero__lead', 'Tekst');
    await page.locator('aside textarea').last().fill('Cisza i drewno.');
    await expect(documentFrame(page).locator('.hero__lead')).toHaveText('Cisza i drewno.');

    // A style change through the contextual panel, as an override rule.
    await selectSiteElement(page, '.hero__lead', 'Wygląd');
    await page.getByRole('textbox', { name: 'Kolor tekstu' }).fill('#B4452B');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const frame = document.querySelector(
            'iframe[title="Podgląd strony"]',
          ) as HTMLIFrameElement;
          const doc = frame.contentDocument!;
          const lead = doc.querySelector('.hero__lead')!;
          return doc.defaultView!.getComputedStyle(lead).color;
        }),
      )
      .toBe('rgb(180, 69, 43)');

    const save = page.locator('header button', { hasText: /Zapisz|Zapisano/ });
    await save.click();
    await expect(save).toContainText('Zapisano');

    await page.reload();
    await page.locator('li').first().getByRole('button', { name: 'Otwórz', exact: true }).click();
    await waitForSiteRendered(page);

    await expect(documentFrame(page).locator('.hero__lead')).toHaveText('Cisza i drewno.');
    const colour = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      return doc.defaultView!.getComputedStyle(doc.querySelector('.hero__lead')!).color;
    });
    expect(colour).toBe('rgb(180, 69, 43)');

    // Undo and redo still operate on the reopened document.
    await selectSiteElement(page, '.hero__lead', 'Tekst');
    await page.locator('aside textarea').last().fill('Jeszcze inaczej.');
    await expect(documentFrame(page).locator('.hero__lead')).toHaveText('Jeszcze inaczej.');
    await page.locator('button[title^="Cofnij"]').click();
    await expect(documentFrame(page).locator('.hero__lead')).toHaveText('Cisza i drewno.');
    await page.locator('button[title^="Ponów"]').click();
    await expect(documentFrame(page).locator('.hero__lead')).toHaveText('Jeszcze inaczej.');
  });

  test('preview shows the page and returns to the full editor', async ({ page }) => {
    await openGeneratedProject(page);

    await page.locator('button[title^="Otwórz podgląd"]').click();
    const preview = page.frameLocator('iframe[title="Podgląd strony dla użytkownika"]');
    await expect(preview.locator('h1')).toBeVisible();
    // No editor chrome in the preview.
    await expect(page.locator('[data-canvas-controls]')).toHaveCount(0);
    await expect(page.locator('button[title="Struktura"]')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/generated-preview.png` });

    await page.locator('button[title^="Wróć do edytora"]').click();
    await waitForSiteRendered(page);
    // The whole workspace is back.
    for (const title of SHARED_CONTROLS) await assertClickable(page, title);
  });
});
