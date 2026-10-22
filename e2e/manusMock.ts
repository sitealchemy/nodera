import { Page, Route } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

/**
 * Controlled Manus responses for the end-to-end suite.
 *
 * Every automated run uses these. A real task costs money and takes minutes,
 * and neither is acceptable per test — the live integration is exercised
 * separately and reported separately.
 *
 * The mock intercepts the local backend's own endpoints, so the frontend's
 * request shapes, polling, download loop and conversion are all genuinely
 * exercised; only the far side of the backend is replaced. The files it serves
 * are real files on disk, laid out the way Manus lays them out — paths inside
 * its sandbox, so path stripping is exercised too.
 */

/** Where Manus reports its files from. Stripped by the importer. */
const SANDBOX_ROOT = '/home/ubuntu/miedzy-drzewami';

export const FIXTURE_DIR = resolve(import.meta.dirname, 'fixtures/fidelity');

export interface MockFile {
  path: string;
  filename: string;
  contentType: string;
  body: Buffer;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  return CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Reads a fixture directory as the file list a finished task would report. */
export function fixtureFiles(directory = FIXTURE_DIR): MockFile[] {
  return walk(directory).map((full) => {
    const relativePath = relative(directory, full).split(sep).join('/');
    return {
      path: posix.join(SANDBOX_ROOT, relativePath),
      filename: posix.basename(relativePath),
      contentType: contentTypeFor(relativePath),
      body: readFileSync(full),
    };
  });
}

/** A delivery with no HTML at all, which the importer has to reject. */
export function filesWithoutHtml(): MockFile[] {
  return [
    {
      path: `${SANDBOX_ROOT}/notatki.md`,
      filename: 'notatki.md',
      contentType: 'text/markdown; charset=utf-8',
      body: Buffer.from('# Pomysły na stronę\n\nBrak kodu.\n', 'utf8'),
    },
  ];
}

export interface MockOptions {
  /** How many polls return "running" before the task finishes. */
  runningPolls?: number;
  /** What the finished task yields. */
  outcome?: 'success' | 'noHtml' | 'noFiles' | 'error' | 'waiting' | 'downloadFails';
  /** Overrides the files a finished task reports. */
  files?: MockFile[];
  /** Simulates a backend with no API key. */
  missingKey?: boolean;
  /** Makes task creation fail. */
  createFails?: boolean;
}

export interface MockHandle {
  /** How many times task creation was called — must stay at 1 per project. */
  createCount: () => number;
  /** How many file downloads were served. */
  downloadCount: () => number;
  /** Answers sent back to a waiting task. */
  replies: () => string[];
  /** Lets a waiting task continue, as if the question had been answered. */
  resolveWaiting: () => void;
  /** Stops failing downloads, so a retry can succeed. */
  healDownloads: () => void;
}

export async function mockManus(page: Page, options: MockOptions = {}): Promise<MockHandle> {
  const {
    runningPolls = 1,
    outcome = 'success',
    files,
    missingKey = false,
    createFails = false,
  } = options;

  let createCount = 0;
  let pollCount = 0;
  let downloadCount = 0;
  const replies: string[] = [];
  let waitingResolved = false;
  let downloadsBroken = outcome === 'downloadFails';

  const served =
    files ??
    (outcome === 'noHtml' ? filesWithoutHtml() : outcome === 'noFiles' ? [] : fixtureFiles());

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });

  await page.route('**/api/manus/config', (route) =>
    json(route, 200, {
      ok: true,
      configured: !missingKey,
      message: missingKey
        ? 'Brak klucza MANUS_API_KEY. Skopiuj .env.example do .env, wpisz klucz z https://manus.im i uruchom ponownie serwer deweloperski.'
        : '',
    }),
  );

  await page.route('**/api/manus/task', async (route) => {
    createCount += 1;
    if (missingKey) {
      await json(route, 503, {
        ok: false,
        code: 'missing_api_key',
        message: 'Brak klucza MANUS_API_KEY.',
      });
      return;
    }
    if (createFails) {
      await json(route, 502, {
        ok: false,
        code: 'manus_error',
        message: 'Manus API zwróciło status 500.',
      });
      return;
    }
    await json(route, 200, {
      ok: true,
      taskId: 'task-abc123',
      taskUrl: 'https://manus.im/app/task-abc123',
      title: 'Między Drzewami',
    });
  });

  await page.route('**/api/manus/status**', async (route) => {
    pollCount += 1;

    if (pollCount <= runningPolls) {
      await json(route, 200, {
        ok: true,
        phase: 'running',
        brief: 'Projektuję układ strony',
        question: null,
        structuredResult: null,
        errorMessage: null,
      });
      return;
    }

    if (outcome === 'waiting' && !waitingResolved) {
      await json(route, 200, {
        ok: true,
        phase: 'waiting',
        brief: '',
        question: 'Czy strona ma zawierać cennik?',
        structuredResult: null,
        errorMessage: null,
      });
      return;
    }

    if (outcome === 'error') {
      await json(route, 200, {
        ok: true,
        phase: 'error',
        brief: '',
        question: null,
        structuredResult: null,
        errorMessage: 'Zadanie zakończyło się błędem po stronie Manus.',
      });
      return;
    }

    await json(route, 200, {
      ok: true,
      phase: 'stopped',
      brief: '',
      question: null,
      structuredResult: null,
      errorMessage: null,
    });
  });

  // The file list, in the shape the local backend returns it: paths only, no
  // signed URLs — those never reach the browser.
  await page.route('**/api/manus/files**', async (route) => {
    await json(route, 200, {
      ok: true,
      files: served.map(({ path, filename, contentType }) => ({ path, filename, contentType })),
    });
  });

  await page.route('**/api/manus/file?**', async (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? '';
    const file = served.find((candidate) => candidate.path === path);
    if (!file) {
      await json(route, 404, { ok: false, code: 'not_found', message: `Brak pliku ${path}.` });
      return;
    }
    // One broken download is enough to exercise the failure path; letting them
    // all fail would hide whether the retry resumes or restarts.
    if (downloadsBroken && /\.css$/.test(path)) {
      await json(route, 502, {
        ok: false,
        code: 'manus_error',
        message: 'Pobieranie pliku nie powiodło się.',
      });
      return;
    }
    downloadCount += 1;
    await route.fulfill({ status: 200, contentType: file.contentType, body: file.body });
  });

  await page.route('**/api/manus/reply', async (route) => {
    const body = route.request().postDataJSON() as { text?: string };
    replies.push(body?.text ?? '');
    waitingResolved = true;
    await json(route, 200, { ok: true });
  });

  return {
    createCount: () => createCount,
    downloadCount: () => downloadCount,
    replies: () => [...replies],
    resolveWaiting: () => {
      waitingResolved = true;
    },
    healDownloads: () => {
      downloadsBroken = false;
    },
  };
}

/**
 * Serves the fixture as a plain website, on the app's own origin.
 *
 * This is the "original" side of the fidelity comparison: the same files, the
 * same relative paths, rendered by the browser with no Nodera involved.
 */
export async function serveOriginal(page: Page, directory = FIXTURE_DIR): Promise<string> {
  await page.route('**/__original__/**', async (route) => {
    const url = new URL(route.request().url());
    const relativePath = url.pathname.replace(/^.*__original__\//, '');
    try {
      const body = readFileSync(join(directory, relativePath));
      await route.fulfill({ status: 200, contentType: contentTypeFor(relativePath), body });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  return '/__original__/index.html';
}
