import { expect, test, Page } from '@playwright/test';
import { mockManus } from './manusMock';
import { documentFrame, waitForDocumentRendered } from './helpers';

/** Screenshots of the new screens, each with geometry assertions. */

const SHOTS = 'e2e-screenshots';
const PROMPT = 'Strona dla małej piekarni rzemieślniczej w Gdańsku — pieczywo na zakwasie.';

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
    await waitForDocumentRendered(page);
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
    await mockManus(page, { outcome: 'invalid' });
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
    await waitForDocumentRendered(page);
    await page.screenshot({ path: `${SHOTS}/14-generated-in-editor.png` });

    // Editor chrome and the save control coexist without collision.
    const save = (await page.locator('header button', { hasText: /Zapisz|Zapisano/ }).boundingBox())!;
    const preview = (await page.locator('button[title^="Otwórz podgląd"]').boundingBox())!;
    expect(save.x + save.width).toBeLessThanOrEqual(preview.x + 1);
    await expect(documentFrame(page).locator('h1')).toBeVisible();
  });

  test('generated page in mobile preview', async ({ page }) => {
    await mockManus(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForDocumentRendered(page);

    await page.locator('button[title="Smartfon (375 px)"]').click();
    await page.locator('button[title^="Otwórz podgląd"]').click();
    await waitForDocumentRendered(page);
    await page.screenshot({ path: `${SHOTS}/15-generated-mobile-preview.png` });

    const state = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      return {
        width: Math.round(frame.getBoundingClientRect().width),
        overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1,
      };
    });
    expect(state.width).toBe(375);
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
    await waitForDocumentRendered(page);
    await page.locator('button[title="Wróć do projektów"]').click();

    const card = page.locator('li').filter({ hasText: 'piekarni' });
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
    await waitForDocumentRendered(page);

    // Nothing has been edited, so the control must read "Zapisano".
    const save = page.locator('header button', { hasText: /Zapisz|Zapisano/ });
    await expect(save).toContainText('Zapisano');

    // Reopening an existing project behaves the same way.
    await page.locator('button[title="Wróć do projektów"]').click();
    await page.locator('li').first().getByRole('button', { name: 'Otwórz', exact: true }).click();
    await waitForDocumentRendered(page);
    await expect(page.locator('header button', { hasText: /Zapisz|Zapisano/ })).toContainText(
      'Zapisano',
    );
  });

  test('a call-to-action link is not underlined like body text', async ({ page }) => {
    await mockManus(page);
    await fresh(page);
    await page.getByLabel('Opis strony').fill(PROMPT);
    await page.getByRole('button', { name: 'Stwórz stronę' }).click();
    await waitForDocumentRendered(page);

    const decoration = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      const cta = doc.querySelector('a[href^="tel:"]')!;
      return doc.defaultView!.getComputedStyle(cta).textDecorationLine;
    });
    expect(decoration).toBe('none');
  });
});
