import { expect, test } from '@playwright/test';
import { collectPageProblems, documentFrame, openEditor, waitForDocumentRendered } from './helpers';

/** Opens the user preview from the editor. */
async function openPreview(page: import('@playwright/test').Page) {
  await page.locator('button[title^="Otwórz podgląd"]').click();
  await expect(page.getByRole('button', { name: /Wróć do edytora/ })).toBeVisible();
  await waitForDocumentRendered(page);
}

/** The page slug the preview is currently showing. */
function pageSelect(page: import('@playwright/test').Page) {
  return page.locator('select').first();
}

test.describe('user preview', () => {
  test('internal links switch the page without loading the editor into the frame', async ({
    page,
  }) => {
    const problems = collectPageProblems(page);
    await openEditor(page);
    await openPreview(page);

    await expect(pageSelect(page)).toHaveValue('start');

    const frameUrlBefore = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.contentWindow!.location.href;
    });

    await documentFrame(page).locator('a[href="/warsztaty"]').click();

    await expect(pageSelect(page)).toHaveValue('warsztaty');
    await expect(documentFrame(page).locator('h1')).toHaveText(
      'Zwolnij tempo. Poczuj dotyk surowej gliny.',
    );

    // The frame must not have navigated, and must not contain the app shell.
    const after = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return {
        url: f.contentWindow!.location.href,
        nestedEditor: !!f.contentDocument!.querySelector('#root'),
      };
    });
    expect(after.url).toBe(frameUrlBefore);
    expect(after.nestedEditor).toBe(false);

    expect(problems.errors).toEqual([]);
  });

  test('an anchor scrolls within the page and does not change it', async ({ page }) => {
    await openEditor(page);
    await openPreview(page);

    const anchor = documentFrame(page).locator('a[href="#kolekcje"]');
    await anchor.click();

    await expect(pageSelect(page)).toHaveValue('start');
    const url = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return f.contentWindow!.location.href;
    });
    expect(url).not.toContain('#kolekcje');
  });

  test('mailto is left to the user agent', async ({ page }) => {
    await openEditor(page);
    await openPreview(page);

    const prevented = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const link = f.contentDocument!.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      return event.defaultPrevented;
    });
    // Not intercepted: the browser decides what to do with mailto.
    expect(prevented).toBe(false);
  });

  test('links are interactive in the preview but inert in the editor', async ({ page }) => {
    await openEditor(page);

    const editorPointerEvents = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return getComputedStyle(f).pointerEvents;
    });
    expect(editorPointerEvents).toBe('none');

    await openPreview(page);
    const previewPointerEvents = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      return getComputedStyle(f).pointerEvents;
    });
    expect(previewPointerEvents).toBe('auto');
  });

  test('returning to the editor keeps the work and the page selection', async ({ page }) => {
    await openEditor(page);
    await openPreview(page);
    await documentFrame(page).locator('a[href="/warsztaty"]').click();
    await expect(pageSelect(page)).toHaveValue('warsztaty');

    await page.getByRole('button', { name: /Wróć do edytora/ }).click();
    await waitForDocumentRendered(page);

    await expect(page.locator('button[title="Wybierz podstronę"]')).toContainText('Warsztaty');
  });

  test('the preview frame scrolls internally at a fixed height', async ({ page }) => {
    await openEditor(page);
    await openPreview(page);

    const scrollable = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const d = f.contentDocument!;
      return {
        canScroll: d.documentElement.scrollHeight > d.documentElement.clientHeight,
        heightStyle: f.style.height,
      };
    });
    expect(scrollable.canScroll).toBe(true);
    expect(scrollable.heightStyle).toBe('100%');
  });
});

test.describe('artboard height', () => {
  test('a shorter page shrinks the artboard again', async ({ page }) => {
    await openEditor(page);

    const height = () =>
      page.evaluate(() => {
        const f = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
        return parseFloat(f.style.height);
      });

    const choosePage = async (name: RegExp) => {
      await page.locator('button[title="Wybierz podstronę"]').click();
      await page.getByRole('button', { name }).click();
      await waitForDocumentRendered(page);
    };

    const start = await height();
    await choosePage(/^Kontakt/);
    await expect.poll(height).toBeLessThan(start);
    const short = await height();

    await choosePage(/^Strona główna/);
    await expect.poll(height).toBeGreaterThan(short);

    await choosePage(/^Kontakt/);
    // Repeatable, not a one-way ratchet.
    await expect.poll(height).toBeLessThan(start);
  });
});
