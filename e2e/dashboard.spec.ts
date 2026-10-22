import { expect, test, Page } from '@playwright/test';
import { fixtureFiles, mockManus } from './manusMock';
import {
  collectPageProblems,
  documentFrame,
  selectSiteElement,
  selectionActions,
  waitForDocumentRendered,
  waitForSiteRendered,
} from './helpers';

/**
 * Dashboard, generation and the round trip to the editor and back.
 *
 * Every test here uses a controlled Manus response (see manusMock.ts). None of
 * them calls the real API.
 */

const PROMPT =
  'Strona dla trzech domków do wynajęcia w lesie na Dolnym Śląsku — zdjęcia, ceny, kontakt.';

/** The fixture's hero heading, nested formatting flattened to plain text. */
const HERO_HEADING = 'Trzy domki, jedna polana';

/** Opens the app with a clean IndexedDB, so each test starts from nothing. */
async function openDashboard(page: Page) {
  // Guarded so a reload inside a test does not wipe the project it just made:
  // init scripts run on every navigation, not only the first.
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
  await expect(page.getByRole('heading', { name: 'Co chcesz stworzyć?' })).toBeVisible();
}

const promptField = (page: Page) => page.getByLabel('Opis strony');

/**
 * Opens the first project card.
 *
 * Scoped to the list on purpose: the page also has an "Otwórz projekt
 * demonstracyjny" button, and a loose match would open the demo instead.
 */
const openFirstProject = (page: Page) =>
  page.locator('li').first().getByRole('button', { name: 'Otwórz', exact: true });
const createButton = (page: Page) => page.getByRole('button', { name: 'Stwórz stronę' });

test.describe('dashboard', () => {
  test('starts empty, with no demo pretending to be the user work', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);

    await expect(page.getByText('Nie masz jeszcze żadnego projektu')).toBeVisible();
    // The prompt field is empty — no ceramics brief pre-filled.
    await expect(promptField(page)).toHaveValue('');
    await expect(createButton(page)).toBeDisabled();
  });

  test('explains a missing API key before a prompt is spent on it', async ({ page }) => {
    await mockManus(page, { missingKey: true });
    await openDashboard(page);
    await expect(page.getByText(/Brak klucza MANUS_API_KEY/)).toBeVisible();
  });

  test('the demo is an explicit, labelled choice', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);

    await page.getByRole('button', { name: /projekt demonstracyjny/i }).click();
    await waitForDocumentRendered(page);

    await page.locator('button[title="Wróć do projektów"]').click();
    await expect(page.getByText('Demo', { exact: true })).toBeVisible();
  });
});

test.describe('generation', () => {
  test('creates a project from the user prompt and opens it in the editor', async ({ page }) => {
    const problems = collectPageProblems(page);
    const manus = await mockManus(page, { runningPolls: 1 });
    await openDashboard(page);

    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    // Honest states, no invented percentage.
    await expect(page.getByText('Generowanie strony')).toBeVisible();
    await expect(page.locator('[aria-live="polite"]')).toContainText(/Projektuję|Manus|Pobieram/);

    await waitForSiteRendered(page);

    // Manus's own page, in the real editor: its heading, its nested
    // formatting, its images.
    const frame = documentFrame(page);
    await expect(frame.locator('h1')).toHaveText(/Trzy domki,\s*jedna polana/);
    await expect(frame.locator('h1 em')).toHaveText('jedna');
    await expect(frame.locator('img[alt="Domek wśród drzew"]')).toBeVisible();
    await expect(frame.locator('.cabin')).toHaveCount(3);
    expect(manus.createCount()).toBe(1);
    expect(problems.errors).toEqual([]);
  });

  test('a double click does not start two paid tasks', async ({ page }) => {
    const manus = await mockManus(page, { runningPolls: 2 });
    await openDashboard(page);

    await promptField(page).fill(PROMPT);
    // Both clicks dispatched in one task, before React can re-render and
    // disable the button — the case the guard actually has to survive.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes('Stwórz stronę'),
      ) as HTMLButtonElement;
      button.click();
      button.click();
    });

    await waitForSiteRendered(page);
    expect(manus.createCount()).toBe(1);
  });

  test('a reload during generation re-attaches instead of paying again', async ({ page }) => {
    const manus = await mockManus(page, { runningPolls: 40 });
    await openDashboard(page);

    await promptField(page).fill(PROMPT);
    await createButton(page).click();
    // The step label renders as soon as the screen does, which is before the
    // create request resolves — so wait for the request itself.
    await expect.poll(() => manus.createCount()).toBe(1);
    await expect(page.getByText('Generowanie strony')).toBeVisible();

    // Same page object keeps the routes, so the counter carries over.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Co chcesz stworzyć?' })).toBeVisible();
    await openFirstProject(page).click();

    await expect(page.getByText(/Generowanie strony|Manus projektuje/)).toBeVisible();
    // Re-attached to the existing task: still exactly one creation.
    expect(manus.createCount()).toBe(1);
  });

  test('an API error is shown and keeps the project and prompt', async ({ page }) => {
    await mockManus(page, { createFails: true });
    await openDashboard(page);

    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    await expect(page.getByText('Nie udało się przygotować strony')).toBeVisible();
    await expect(page.getByText(/Manus API zwróciło status 500/)).toBeVisible();
    // The prompt is still on screen, and the project still exists.
    await expect(page.getByText(PROMPT)).toBeVisible();

    await page.getByRole('button', { name: 'Wróć do projektów' }).click();
    await expect(page.getByText('Błąd')).toBeVisible();
  });

  test('a delivery with no page is reported, and names what did arrive', async ({ page }) => {
    await mockManus(page, { outcome: 'noHtml' });
    await openDashboard(page);

    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    await expect(page.getByText('Nie udało się przygotować strony')).toBeVisible();
    // Says which files came back, rather than just that something went wrong.
    await expect(page.getByText(/notatki\.md/)).toBeVisible();

    // Nothing from the bundled demo leaked in as a substitute.
    await expect(page.getByText('Pracownia Splot')).toHaveCount(0);
  });

  test('a task that attached nothing is reported as such', async ({ page }) => {
    await mockManus(page, { outcome: 'noFiles' });
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    await expect(page.getByText(/nie dołączyło żadnych plików/i)).toBeVisible();
  });

  test('a failed download is retried without paying for a second generation', async ({ page }) => {
    const manus = await mockManus(page, { outcome: 'downloadFails' });
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    await expect(page.getByText('Nie udało się przygotować strony')).toBeVisible();
    await expect(page.getByText(/Pobieranie pliku nie powiodło się/)).toBeVisible();
    // The free retry is offered first, and says plainly which one costs money.
    await expect(page.getByRole('button', { name: 'Przygotuj ponownie' })).toBeVisible();
    await expect(page.getByText(/nic nie kosztuje/)).toBeVisible();

    manus.healDownloads();
    await page.getByRole('button', { name: 'Przygotuj ponownie' }).click();

    await waitForSiteRendered(page);
    await expect(documentFrame(page).locator('h1')).toHaveText(/Trzy domki/);
    // One task for the whole episode: the retry re-used it.
    expect(manus.createCount()).toBe(1);
  });

  test('a question from Manus can be answered inside the same task', async ({ page }) => {
    const manus = await mockManus(page, { outcome: 'waiting', runningPolls: 1 });
    await openDashboard(page);

    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    await expect(page.getByText('Czy strona ma zawierać cennik?')).toBeVisible();
    await page.getByLabel('Odpowiedź dla Manus').fill('Tak, z cenami bochenków');
    await page.getByRole('button', { name: 'Wyślij' }).click();

    await waitForSiteRendered(page);
    expect(manus.replies()).toEqual(['Tak, z cenami bochenków']);
    // Still one task: the answer continued it rather than starting another.
    expect(manus.createCount()).toBe(1);
  });

  test('stopping the watch is not described as cancelling at Manus', async ({ page }) => {
    await mockManus(page, { runningPolls: 40 });
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();

    await expect(page.getByText('Przestań śledzić postęp')).toBeVisible();
    await expect(page.getByText(/Zadanie po stronie Manus działa dalej/)).toBeVisible();
    await expect(page.getByText(/Anuluj zadanie/)).toHaveCount(0);
  });
});

test.describe('persistence', () => {
  test('edits survive a save, a reload and reopening the project', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();
    await waitForSiteRendered(page);

    // Edit a leaf paragraph through the real editor, and swap an image.
    await selectSiteElement(page, '.hero__lead', 'Tekst');
    await page.locator('aside textarea').fill('Cisza, drewno i nic do roboty.');
    await expect(documentFrame(page).locator('.hero__lead')).toHaveText(
      'Cisza, drewno i nic do roboty.',
    );

    await selectSiteElement(page, '.hero__figure img', 'Tekst');
    await page.getByRole('textbox', { name: 'Tekst alternatywny' }).fill('Polana o wschodzie');

    // Explicit save, with a visible state.
    const saveButton = page.locator('header button', { hasText: /Zapisz|Zapisano/ });
    await expect(saveButton).toContainText('Zapisz');
    await saveButton.click();
    await expect(saveButton).toContainText('Zapisano');

    await page.reload();
    await openFirstProject(page).click();
    await waitForSiteRendered(page);
    // Both edits came back from storage, not from the iframe's live DOM.
    await expect(documentFrame(page).locator('.hero__lead')).toHaveText(
      'Cisza, drewno i nic do roboty.',
    );
    await expect(documentFrame(page).locator('.hero__figure img')).toHaveAttribute(
      'alt',
      'Polana o wschodzie',
    );
  });

  test('undo and redo work on a generated document', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();
    await waitForSiteRendered(page);

    const lead = documentFrame(page).locator('.hero__lead');
    const original = (await lead.textContent())!.trim();
    await selectSiteElement(page, '.hero__lead', 'Tekst');
    await page.locator('aside textarea').fill('Zmieniony akapit');
    await expect(lead).toHaveText('Zmieniony akapit');

    await page.locator('button[title^="Cofnij"]').click();
    await expect(lead).toHaveText(original);
    await page.locator('button[title^="Ponów"]').click();
    await expect(lead).toHaveText('Zmieniony akapit');
  });

  test('a heading with nested formatting is not offered as plain text', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();
    await waitForSiteRendered(page);

    // The hero heading holds <em> and <span>. Replacing its whole text would
    // destroy them, so the editor never offers the control in the first place.
    await selectSiteElement(page, '.hero__title');
    expect(await selectionActions(page)).toEqual(['Rozmiar', 'Wygląd']);

    // The nested markup is still there, untouched.
    await expect(documentFrame(page).locator('.hero__title em')).toHaveText('jedna');
  });

  test('two projects stay independent', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);

    await promptField(page).fill('Pierwszy projekt — domki');
    await createButton(page).click();
    await waitForSiteRendered(page);
    await page.locator('button[title="Wróć do projektów"]').click();

    // Second project, from a delivery with a different heading.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const second = fixtureFiles().map((file) =>
      file.filename === 'index.html'
        ? {
            ...file,
            body: Buffer.from(
              file.body.toString('utf8').replace('Trzy domki,', 'Kwiaciarnia na rogu,'),
              'utf8',
            ),
          }
        : file,
    );
    await mockManus(page, { files: second });
    await promptField(page).fill('Drugi projekt — kwiaciarnia');
    await createButton(page).click();
    await waitForSiteRendered(page);
    await expect(documentFrame(page).locator('h1')).toContainText('Kwiaciarnia na rogu');

    await page.locator('button[title="Wróć do projektów"]').click();
    await expect(page.getByText('Pierwszy projekt — domki')).toBeVisible();
    await expect(page.getByText('Drugi projekt — kwiaciarnia')).toBeVisible();

    // Opening the first one shows its own document, not the second's.
    await page
      .locator('li', { hasText: 'Pierwszy projekt — domki' })
      .getByRole('button', { name: 'Otwórz', exact: true })
      .click();
    await waitForSiteRendered(page);
    await expect(documentFrame(page).locator('h1')).toContainText('Trzy domki');
  });

  test('renaming and deleting a project', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();
    await waitForSiteRendered(page);
    await page.locator('button[title="Wróć do projektów"]').click();

    await page.locator('button[title="Zmień nazwę"]').first().click();
    await page.getByLabel('Nazwa projektu').fill('Między Drzewami');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Między Drzewami')).toBeVisible();

    await page.locator('button[title="Usuń projekt"]').first().click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Usuń', exact: true }).click();
    await expect(page.getByText('Nie masz jeszcze żadnego projektu')).toBeVisible();
  });

  test('a project saved by the previous single-project build is adopted', async ({ page }) => {
    await mockManus(page);
    // Seed the old localStorage key before the app boots.
    await page.addInitScript(() => {
      try {
        indexedDB.deleteDatabase('nodera');
        window.localStorage.clear();
        window.localStorage.setItem(
          'nodera_project_state_v1',
          JSON.stringify({
            id: 'legacy',
            name: 'Stary projekt',
            client: '',
            lastUpdated: '',
            assumptions: [],
            activeDirectionId: 'd1',
            activePageSlug: 'start',
            tokens: {
              primaryColor: '#292824',
              accentCopper: '#A86645',
              surfaceColor: '#FFFEFB',
              textColor: '#292824',
              fontFamily: 'serif',
              buttonRadius: '8px',
              buttonVariant: 'fill',
            },
            comments: [],
            snapshots: [],
            directions: {
              d1: {
                id: 'd1',
                name: 'Kierunek',
                subtitle: '',
                concept: '',
                typography: '',
                atmosphere: '',
                colorPalette: { primary: '#292824', copper: '#A86645', surface: '#FFFEFB', text: '#292824' },
                subpagesPlan: [],
                pages: {
                  start: {
                    id: 'p',
                    name: 'Strona główna',
                    slug: 'start',
                    title: 'Stary',
                    description: '',
                    root: {
                      id: 'root',
                      name: 'Root',
                      tag: 'div',
                      type: 'container',
                      styles: {},
                      children: [
                        {
                          id: 'old-h1',
                          name: 'Nagłówek',
                          tag: 'h1',
                          type: 'heading',
                          content: 'Zachowany stary dokument',
                          styles: { fontSize: '40px' },
                        },
                      ],
                    },
                  },
                },
              },
            },
          }),
        );
      } catch {
        /* private mode */
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Co chcesz stworzyć?' })).toBeVisible();
    await expect(page.getByText('Stary projekt').first()).toBeVisible();

    await openFirstProject(page).click();
    await waitForDocumentRendered(page);
    await expect(documentFrame(page).locator('h1')).toHaveText('Zachowany stary dokument');
  });
});

test.describe('no regression in the editor', () => {
  test('a generated page pans, zooms, selects and previews on mobile', async ({ page }) => {
    await mockManus(page);
    await openDashboard(page);
    await promptField(page).fill(PROMPT);
    await createButton(page).click();
    await waitForSiteRendered(page);

    const camera = () =>
      page.evaluate(() => {
        const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
        const rect = frame.getBoundingClientRect();
        return { zoom: rect.width / parseFloat(frame.style.width), x: rect.left };
      });

    const before = await camera();
    const canvas = page.locator('div[style*="cursor"]').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 200);
    const afterPan = await camera();
    expect(afterPan.zoom).toBeCloseTo(before.zoom, 5);

    await page.locator('button[title="Powiększ"]').click();
    expect((await camera()).zoom).toBeGreaterThan(before.zoom);

    // Selection still lands on the right element in a generated document.
    await page.locator('button[title="Dopasuj szerokość"]').click();
    const heading = documentFrame(page).locator('h1');
    const headingBox = (await heading.boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.click(headingBox.x + 30, headingBox.y + 15);
    await page.keyboard.up('Shift');
    await expect(page.locator('div.absolute.border-2')).toBeVisible();

    // Mobile preview applies the designer's own media queries: at 375px the
    // cabin grid collapses to one column and the nav links are hidden.
    await page.locator('button[title="Smartfon (375 px)"]').click();
    const mobile = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      const view = doc.defaultView!;
      return {
        width: frame.style.width,
        grid: view.getComputedStyle(doc.querySelector('.cabins__grid')!).gridTemplateColumns,
        navLink: view.getComputedStyle(doc.querySelector('.main-nav a')!).display,
      };
    });
    expect(mobile.width).toBe('375px');
    expect(mobile.grid.split(' ').length).toBe(1);
    expect(mobile.navLink).toBe('none');
  });
});
