import { expect, test, Page } from '@playwright/test';
import { mockManus } from './manusMock';
import { documentFrame, waitForDocumentRendered, waitForSiteRendered } from './helpers';

/** Screenshots of the new screens, each with geometry assertions. */

const SHOTS = 'e2e-screenshots';
const PROMPT = 'Strona dla trzech domków do wynajęcia w lesie na Dolnym Śląsku.';

async function fresh(page: Page) {
  await page.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem('e2e-cleared')) return;
      window.sessionStorage.setItem('e2e-cleared', '1');
      indexedDB.deleteDatabase('nodera');
      window.localStorage.removeItem('nodera_project_state_v1');
    } catch {}
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Co chcesz stworzyć?' })).toBeVisible();
}

test.describe('visual: dashboard and generation', () => {
  test('empty dashboard', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.screenshot({ path: `${SHOTS}/10-dashboard-empty.png` });

    const field = (await page.getByLabel('Opis strony').boundingBox())!;
    expect(field.width).toBeGreaterThan(400);
    await expect(page.getByLabel('Opis strony')).toHaveValue('');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('dashboard with projects', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForSiteRendered(page);
    await page.locator('button[title="Wróć do projektów"]').click();
    await page.getByRole('button', { name: /projekt demonstracyjny/i }).click();
    await waitForDocumentRendered(page);
    await page.locator('button[title="Wróć do projektów"]').click();

    await expect(page.locator('li')).toHaveCount(2);
    await page.screenshot({ path: `${SHOTS}/11-dashboard-projects.png` });

    // Cards do not overlap and stay inside the viewport.
    const boxes = await page.locator('li').evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
    );
    boxes.forEach((box) => {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(1366);
    });
  });

  test('generation in progress', async ({ page }) => {
    await mockManus(page, { runningPolls: 40 });
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await expect(page.getByText('Generowanie strony')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/12-generating.png` });

    // No invented progress bar or percentage.
    await expect(page.locator('progress')).toHaveCount(0);
    await expect(page.getByText(/%/)).toHaveCount(0);
  });

  test('generation error', async ({ page }) => {
    await mockManus(page, { outcome: 'noHtml' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await expect(page.getByText('Nie udało się przygotować strony')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/13-generation-error.png` });

    // The prompt is still visible, so nothing the user wrote was lost.
    await expect(page.getByText(PROMPT)).toBeVisible();
  });

  test('generated page in the editor', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForSiteRendered(page);
    await page.screenshot({ path: `${SHOTS}/14-generated-in-editor.png` });

    // Editor chrome fits: the save control sits left of the export control
    // rather than on top of it.
    const save = (await page.locator('header button', { hasText: /Zapisz|Zapisano/ }).boundingBox())!;
    const download = (await page.locator('button[title^="Pobierz pliki"]').boundingBox())!;
    expect(save.x + save.width).toBeLessThanOrEqual(download.x + 1);
    await expect(documentFrame(page).locator('h1')).toBeVisible();
  });

  test('generated page at phone width', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForSiteRendered(page);

    await page.locator('button[title="Smartfon (375 px)"]').click();
    await page.locator('button[title="Dopasuj szerokość"]').click();
    await page.screenshot({ path: `${SHOTS}/15-generated-mobile-preview.png` });

    const state = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      return {
        width: parseFloat(frame.style.width),
        overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1,
      };
    });
    expect(state.width).toBe(375);
    // The designer's own layout holds at phone width: no sideways scroll.
    expect(state.overflow).toBe(false);
  });
});

test.describe('status accuracy', () => {
  test('a finished project is listed as ready, not as still preparing', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForSiteRendered(page);
    await page.locator('button[title="Wróć do projektów"]').click();

    const card = page.locator('li').filter({ hasText: 'domków' });
    await expect(card.getByText('Gotowy')).toBeVisible();
    await expect(card.getByText('Przygotowanie')).toHaveCount(0);
  });
});

test.describe('save state accuracy', () => {
  test('a freshly opened project is not marked as having unsaved changes', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForSiteRendered(page);

    // Nothing has been edited, so the control must read "Zapisano".
    const save = page.locator('header button', { hasText: /Zapisz|Zapisano/ });
    await expect(save).toContainText('Zapisano');

    // Reopening an existing project behaves the same way.
    await page.locator('button[title="Wróć do projektów"]').click();
    await page.locator('li').first().getByRole('button', { name: 'Otwórz', exact: true }).click();
    await waitForSiteRendered(page);
    await expect(page.locator('header button', { hasText: /Zapisz|Zapisano/ })).toContainText(
      'Zapisano',
    );
  });

  test('the designer own type and colour survive the import', async ({ page }) => {
    await mockManus(page);
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForSiteRendered(page);

    const styles = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      const view = doc.defaultView!;
      const title = view.getComputedStyle(doc.querySelector('.hero__title')!);
      const eyebrow = view.getComputedStyle(doc.querySelector('.eyebrow')!);
      const button = view.getComputedStyle(doc.querySelector('.button--solid')!);
      return {
        titleFamily: title.fontFamily,
        titleSize: parseFloat(title.fontSize),
        eyebrowFamily: eyebrow.fontFamily,
        // The custom face, loaded from an asset rather than a CDN.
        eyebrowFace: doc.fonts.check("11px 'Nodera Blocks'"),
        buttonRadius: button.borderRadius,
        buttonDecoration: button.textDecorationLine,
      };
    });

    expect(styles.titleFamily).toContain('Georgia');
    // clamp() still resolves against the preview width, not the window's.
    expect(styles.titleSize).toBeGreaterThan(60);
    expect(styles.eyebrowFamily).toContain('Nodera Blocks');
    expect(styles.eyebrowFace).toBe(true);
    expect(styles.buttonRadius).toBe('999px');
    expect(styles.buttonDecoration).toBe('none');
  });
});
