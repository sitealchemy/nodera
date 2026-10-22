import { loadEnv, type Connect, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  MISSING_KEY_MESSAGE,
  configureEnv,
  createTask,
  listMessages,
  readApiKey,
  sendMessage,
  summariseMessages,
} from './manusApi';

/**
 * The local backend, mounted inside the Vite dev server.
 *
 * A Vite plugin rather than a separate process so that one command — the
 * existing `dev` script — runs both halves, with no extra dependency and no
 * second port to remember. The handlers execute in Node, so the API key stays
 * on the server side of the boundary.
 */

const PROMPT_PREAMBLE = `Jesteś generatorem stron dla edytora Nodera.

Zaprojektuj JEDNĄ kompletną, responsywną stronę na podstawie opisu użytkownika
i zwróć ją WYŁĄCZNIE jako obiekt zgodny z podanym schematem JSON.

Zasady treści:
- pisz po polsku, zwięźle i konkretnie;
- treść ma wynikać z opisu użytkownika;
- NIE wymyślaj referencji, opinii klientów, certyfikatów, nagród,
  nazwisk, numerów telefonów ani adresów, których użytkownik nie podał;
- jeżeli dane kontaktowe nie zostały podane, użyj neutralnego wezwania
  do kontaktu bez konkretnych danych;
- nie podawaj adresów obrazów, których istnienia nie jesteś pewien —
  w takim wypadku zostaw pole image.src puste.

Zasady struktury:
- zacznij od sekcji "nav", zakończ sekcją "footer";
- użyj od 4 do 7 sekcji łącznie;
- dokładnie jedna sekcja "hero" z nagłówkiem h1;
- w sekcjach "features" podaj od 2 do 4 pozycji w items;
- actions to przyciski: label plus href (slug strony, "#kotwica",
  albo pełny adres https/mailto/tel);
- kolory podaj jako #rrggbb i zadbaj o czytelny kontrast tekstu do tła.

Opis użytkownika:`;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // A local tool still should not accept an unbounded body.
    if (size > 1_000_000) throw new Error('Treść żądania jest za duża.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Maps a Manus failure onto an HTTP response without leaking the key.
 *
 * Also logs it. The first schema rejection left no trace anywhere on the
 * server, which turned a one-line diagnosis into a hunt; the code and message
 * come from the API and never contain credentials.
 */
function failureResponse(res: ServerResponse, error: { kind: string; message: string; status?: number; code?: string }) {
  if (error.kind !== 'config') {
    console.warn(
      `[manus] ${error.status ?? '—'} ${error.code ?? 'error'}: ${error.message}`,
    );
  }
  if (error.kind === 'config') {
    sendJson(res, 503, { ok: false, code: 'missing_api_key', message: error.message });
    return;
  }
  const status = error.status && error.status >= 400 ? error.status : 502;
  sendJson(res, status, { ok: false, code: 'manus_error', message: error.message });
}

export function manusApiPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/manus/')) {
      next();
      return;
    }

    try {
      /* --- configuration probe, so the UI can explain itself ---------- */
      if (url.startsWith('/api/manus/config') && req.method === 'GET') {
        const configured = readApiKey() !== null;
        sendJson(res, 200, {
          ok: true,
          configured,
          message: configured ? '' : MISSING_KEY_MESSAGE,
        });
        return;
      }

      /* --- create a task ---------------------------------------------- */
      if (url.startsWith('/api/manus/task') && req.method === 'POST') {
        const body = await readJsonBody(req);
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        if (!prompt) {
          sendJson(res, 400, { ok: false, code: 'invalid_argument', message: 'Pusty opis.' });
          return;
        }
        if (!body.schema || typeof body.schema !== 'object') {
          sendJson(res, 400, { ok: false, code: 'invalid_argument', message: 'Brak schematu wyniku.' });
          return;
        }

        const result = await createTask({
          message: { content: [{ type: 'text', text: `${PROMPT_PREAMBLE}\n\n${prompt}` }] },
          structured_output_schema: body.schema,
          locale: 'pl',
          agent_profile: 'standard',
          hide_in_task_list: false,
          async_title: true,
        });

        if (!result.ok) {
          failureResponse(res, result.error);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          taskId: result.data.task_id,
          taskUrl: result.data.task_url ?? null,
          title: result.data.task_title ?? '',
        });
        return;
      }

      /* --- poll a task ------------------------------------------------- */
      if (url.startsWith('/api/manus/status') && req.method === 'GET') {
        const taskId = new URL(url, 'http://local').searchParams.get('taskId');
        if (!taskId) {
          sendJson(res, 400, { ok: false, code: 'invalid_argument', message: 'Brak taskId.' });
          return;
        }
        const result = await listMessages(taskId, { order: 'desc', limit: 100 });
        if (!result.ok) {
          failureResponse(res, result.error);
          return;
        }
        sendJson(res, 200, { ok: true, ...summariseMessages(result.data.messages ?? []) });
        return;
      }

      /* --- answer a question ------------------------------------------- */
      if (url.startsWith('/api/manus/reply') && req.method === 'POST') {
        const body = await readJsonBody(req);
        const taskId = typeof body.taskId === 'string' ? body.taskId : '';
        const textReply = typeof body.text === 'string' ? body.text.trim() : '';
        if (!taskId || !textReply) {
          sendJson(res, 400, { ok: false, code: 'invalid_argument', message: 'Brak taskId lub treści.' });
          return;
        }
        const result = await sendMessage(taskId, textReply);
        if (!result.ok) {
          failureResponse(res, result.error);
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, code: 'not_found', message: 'Nieznany endpoint.' });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'internal',
        message: (error as Error).message || 'Błąd serwera lokalnego.',
      });
    }
  };

  return {
    name: 'nodera-manus-api',
    config(_config, { mode }) {
      // An empty prefix loads every variable, not just VITE_ ones. The values
      // stay in this Node process: nothing here goes into `define`, so none of
      // it can reach the browser bundle.
      configureEnv(loadEnv(mode, process.cwd(), ''));
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export { PROMPT_PREAMBLE };
