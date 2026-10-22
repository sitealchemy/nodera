import { Page, Route } from '@playwright/test';

/**
 * Controlled Manus responses for the end-to-end suite.
 *
 * Every automated run uses these. A real task costs money and takes minutes,
 * and neither is acceptable per test — the live integration is exercised
 * separately and reported separately.
 *
 * The mock intercepts the local backend's own endpoints, so the frontend's
 * request shapes, polling and state machine are all genuinely exercised; only
 * the far side of the backend is replaced.
 */

export interface MockOptions {
  /** How many polls return "running" before the task finishes. */
  runningPolls?: number;
  /** What the finished task yields. */
  outcome?: 'success' | 'invalid' | 'failed' | 'error' | 'waiting';
  /** Overrides the structured value returned on success. */
  value?: unknown;
  /** Simulates a backend with no API key. */
  missingKey?: boolean;
  /** Makes task creation fail. */
  createFails?: boolean;
}

export interface MockHandle {
  /** How many times task creation was called — must stay at 1 per project. */
  createCount: () => number;
  /** Answers sent back to a waiting task. */
  replies: () => string[];
  /** Lets a waiting task continue, as if the question had been answered. */
  resolveWaiting: () => void;
}

export function validSpecValue(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    siteName: 'Piekarnia Zakwas',
    tokens: {
      accent: '#8a5a2b',
      surface: '#fffdf8',
      text: '#241f1b',
      muted: '#6b645c',
      headingFont: 'serif',
      radius: '10px',
    },
    pages: [
      {
        slug: 'start',
        name: 'Strona główna',
        title: 'Piekarnia Zakwas — chleb na zakwasie',
        description: 'Rzemieślnicza piekarnia w Gdańsku.',
        sections: [
          {
            kind: 'nav',
            heading: 'Zakwas',
            subheading: '',
            body: '',
            items: [],
            actions: [
              { label: 'Oferta', href: '#oferta' },
              { label: 'Kontakt', href: '#kontakt' },
            ],
            image: { src: '', alt: '' },
          },
          {
            kind: 'hero',
            heading: 'Chleb, który dojrzewa powoli',
            subheading: 'Gdańsk Oliwa',
            body: 'Wypiekamy codziennie rano, na zakwasie prowadzonym od 2019 roku.',
            items: [],
            actions: [{ label: 'Zamów telefonicznie', href: 'tel:+48123456789' }],
            image: { src: '', alt: '' },
          },
          {
            kind: 'features',
            heading: 'Co pieczemy',
            subheading: '',
            body: '',
            items: [
              { title: 'Bochenek żytni', body: 'Pełnoziarnisty, długo dojrzewający.', meta: '18 zł' },
              { title: 'Pszenny rustykalny', body: 'Chrupiąca skórka, wilgotny miękisz.', meta: '16 zł' },
            ],
            actions: [],
            image: { src: '', alt: '' },
          },
          {
            kind: 'footer',
            heading: '',
            subheading: '',
            body: '© 2026 Piekarnia Zakwas',
            items: [],
            actions: [],
            image: { src: '', alt: '' },
          },
        ],
      },
    ],
    ...overrides,
  };
}

export async function mockManus(page: Page, options: MockOptions = {}): Promise<MockHandle> {
  const {
    runningPolls = 1,
    outcome = 'success',
    value,
    missingKey = false,
    createFails = false,
  } = options;

  let createCount = 0;
  let pollCount = 0;
  const replies: string[] = [];
  let waitingResolved = false;

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
      title: 'Piekarnia',
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

    if (outcome === 'failed') {
      await json(route, 200, {
        ok: true,
        phase: 'stopped',
        brief: '',
        question: null,
        structuredResult: { success: false, value: {}, error: 'Nie udało się zaprojektować strony.' },
        errorMessage: null,
      });
      return;
    }

    const resultValue =
      outcome === 'invalid'
        ? (value ?? { schemaVersion: 1, siteName: 'X', tokens: {}, pages: [] })
        : (value ?? validSpecValue());

    await json(route, 200, {
      ok: true,
      phase: 'stopped',
      brief: '',
      question: null,
      structuredResult: { success: true, value: resultValue, error: null },
      errorMessage: null,
    });
  });

  await page.route('**/api/manus/reply', async (route) => {
    const body = route.request().postDataJSON() as { text?: string };
    replies.push(body?.text ?? '');
    waitingResolved = true;
    await json(route, 200, { ok: true });
  });

  return {
    createCount: () => createCount,
    replies: () => [...replies],
    resolveWaiting: () => {
      waitingResolved = true;
    },
  };
}
