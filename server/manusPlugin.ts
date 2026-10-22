import { loadEnv, type Connect, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  MISSING_KEY_MESSAGE,
  configureEnv,
  createTask,
  fetchTaskFile,
  listTaskFiles,
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

const PROMPT_PREAMBLE = `Zaprojektuj i zbuduj KOMPLETNĄ, dopracowaną stronę internetową.

Masz pełną swobodę projektową: kompozycja, siatka, typografia, kolory,
odstępy i liczba sekcji należą do Ciebie. Nie ograniczam Cię do żadnego
szablonu ani zestawu gotowych bloków.

Wymagania techniczne:
- jedna kompletna strona, w pełni responsywna (desktop, tablet, telefon);
- statyczny HTML + CSS, bez frameworka i bez kroku budowania;
- jeśli używasz Tailwinda, dołącz skompilowany arkusz CSS, nie CDN;
- semantyczny HTML i sensowna dostępność.

Zdjęcia są częścią projektu:
- znajdź lub wygeneruj obrazy pasujące do briefu i DOŁĄCZ pliki do odpowiedzi;
- jeśli to zdjęcia poglądowe, napisz to wprost — nie podawaj ich jako
  autentycznych zdjęć obiektu klienta;
- nie wstawiaj adresów obrazów, co do których nie masz pewności.

Treść:
- pisz po polsku, konkretnie i w tonie pasującym do briefu;
- NIE wymyślaj opinii gości, nagród, certyfikatów, nazwisk, numerów telefonu
  ani adresów, których nie podano w briefie.

SPOSÓB DOSTARCZENIA — to jest krytyczne:
Dołącz do odpowiedzi RZECZYWISTE PLIKI projektu jako załączniki: index.html,
arkusz(e) stylów i wszystkie pliki obrazów, z zachowaniem struktury katalogów.
Nie odsyłaj wyłącznie do podglądu online — potrzebny jest kod źródłowy.

Brief użytkownika:`;

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
        // No structured_output_schema on purpose. Asking Manus for a JSON
        // page description was what took composition, typography and imagery
        // out of its hands; the deliverable is now the project's own files,
        // which arrive as attachments on the task's messages.
        const result = await createTask({
          message: { content: [{ type: 'text', text: `${PROMPT_PREAMBLE}\n\n${prompt}` }] },
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

      /* --- list the files a task produced ------------------------------- */
      if (url.startsWith('/api/manus/files') && req.method === 'GET') {
        const taskId = new URL(url, 'http://local').searchParams.get('taskId');
        if (!taskId) {
          sendJson(res, 400, { ok: false, code: 'invalid_argument', message: 'Brak taskId.' });
          return;
        }
        const result = await listTaskFiles(taskId);
        if (!result.ok) {
          failureResponse(res, result.error);
          return;
        }
        // The temporary download URLs stay on the server: the browser asks
        // this backend for each file instead of holding signed links.
        sendJson(res, 200, {
          ok: true,
          files: result.files.map(({ path, filename, contentType }) => ({
            path,
            filename,
            contentType,
          })),
        });
        return;
      }

      /* --- stream one task file ----------------------------------------- */
      if (url.startsWith('/api/manus/file') && req.method === 'GET') {
        const params = new URL(url, 'http://local').searchParams;
        const taskId = params.get('taskId');
        const path = params.get('path');
        if (!taskId || !path) {
          sendJson(res, 400, { ok: false, code: 'invalid_argument', message: 'Brak taskId lub path.' });
          return;
        }
        const result = await fetchTaskFile(taskId, path);
        if (!result.ok) {
          failureResponse(res, result.error);
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', result.contentType);
        res.setHeader('cache-control', 'no-store');
        res.end(Buffer.from(result.body));
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
