import { Page, expect, Locator, FrameLocator } from '@playwright/test';

/**
 * Shared helpers for the end-to-end suite.
 *
 * Everything here waits on a real application state — an element being
 * attached, a value having settled — rather than on a fixed delay, so a slow
 * machine makes the suite slower, not flaky.
 */

export const STORAGE_KEY = 'nodera_project_state_v1';

/** Opens the editor on the demo project with no saved state carried over. */
export async function openEditor(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  }, STORAGE_KEY);

  await page.goto('/');
  await waitForDocumentRendered(page);
}

/** The iframe that renders the page document. */
export function documentFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Podgląd strony"]');
}

/** Waits until the document tree is actually rendered inside the frame. */
export async function waitForDocumentRendered(page: Page): Promise<void> {
  await page.locator('iframe[title="Podgląd strony"]').waitFor({ state: 'attached' });
  await expect(documentFrame(page).locator('[data-node-id]').first()).toBeAttached({
    timeout: 15_000,
  });
}

/** Reads the camera straight from the rendered transform — no app internals. */
export async function readCamera(page: Page): Promise<{ zoom: number; x: number; y: number }> {
  return page.evaluate(() => {
    const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
    const rect = frame.getBoundingClientRect();
    const cssWidth = parseFloat(frame.style.width);
    return { zoom: rect.width / cssWidth, x: rect.left, y: rect.top };
  });
}

/** The canvas surface that owns pointer and wheel gestures. */
export function canvas(page: Page): Locator {
  return page.locator('div[style*="cursor"]').first();
}

/** Geometry of a document node, in page coordinates. */
export async function nodeBox(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate((id) => {
    const frame = document.querySelector('iframe[title="Podgląd strony"]') as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    const el = doc.querySelector(`[data-node-id="${CSS.escape(id)}"]`)!;
    const inner = el.getBoundingClientRect();
    const outer = frame.getBoundingClientRect();
    const zoom = outer.width / parseFloat(frame.style.width);
    return {
      x: outer.left + inner.left * zoom,
      y: outer.top + inner.top * zoom,
      width: inner.width * zoom,
      height: inner.height * zoom,
    };
  }, nodeId);
}

/** The selection outline rectangle drawn by the overlay, if any. */
export async function selectionOutlineBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('div.absolute.border-2') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
}

/**
 * Selects a node the way a user does: Shift held, click on the element.
 *
 * The click lands at a point computed from the node's live geometry, so it
 * stays correct at any zoom or pan.
 */
export async function shiftClickNode(page: Page, nodeId: string): Promise<void> {
  const box = await nodeBox(page, nodeId);
  const view = (await canvas(page).boundingBox())!;

  // Click the centre of the VISIBLE part of the node. At high zoom a node can
  // extend past the canvas, and clicking its geometric centre would land
  // outside the canvas entirely — a flaw in the test, not in the editor.
  const left = Math.max(box.x, view.x + 2);
  const right = Math.min(box.x + box.width, view.x + view.width - 2);
  const top = Math.max(box.y, view.y + 2);
  const bottom = Math.min(box.y + box.height, view.y + view.height - 2);

  if (right <= left || bottom <= top) {
    throw new Error(
      `Node ${nodeId} is not visible in the canvas; reveal it before selecting.`,
    );
  }

  await page.keyboard.down('Shift');
  await page.mouse.move((left + right) / 2, (top + bottom) / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(page.locator('div.absolute.border-2')).toBeVisible();
}

/** Name shown on the selection label, or null when nothing is selected. */
export async function selectedNodeName(page: Page): Promise<string | null> {
  const label = page.locator('span.max-w-\\[220px\\]').first();
  if ((await label.count()) === 0) return null;
  return (await label.textContent())?.trim() ?? null;
}

/** Reads the whole stored project. */
export async function readProject(page: Page): Promise<any> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}

/** Finds a node inside a stored project tree. */
export function findStoredNode(root: any, id: string): any {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findStoredNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Opens the command field and submits a prompt. */
export async function runCommand(page: Page, prompt: string): Promise<void> {
  const opener = page.getByRole('button', { name: /Co chcesz zmienić/ });
  if (await opener.isVisible().catch(() => false)) await opener.click();

  const input = page.locator('input[placeholder^="np."]');
  await input.waitFor();
  await input.fill(prompt);
  await page.getByRole('button', { name: 'Wykonaj' }).click();
}

/** Switches the edit scope through the header control. */
export async function setScope(page: Page, label: string): Promise<void> {
  await page.locator('button[title^="Zakres edycji"]').click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('button[title^="Zakres edycji"]')).toContainText(label);
}

/** Switches the preview viewport width. */
export async function setViewport(page: Page, title: string): Promise<void> {
  await page.locator(`button[title="${title}"]`).click();
}

/** Collects unhandled page errors and console errors for a test. */
export function collectPageProblems(page: Page): { errors: string[]; console: string[] } {
  const errors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Vite's dev websocket is noise in a test environment, not an app fault.
    if (text.includes('WebSocket') || text.includes('[vite]')) return;
    consoleErrors.push(text);
  });

  return { errors, console: consoleErrors };
}
