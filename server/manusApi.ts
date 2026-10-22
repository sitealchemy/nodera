/**
 * Server-side Manus client.
 *
 * Runs only in the Node process. MANUS_API_KEY is read here and never reaches
 * the browser bundle, which is why this is not a VITE_ variable: anything
 * prefixed VITE_ is inlined into client code and shipped to every visitor.
 *
 * API shape per https://open.manus.im/docs/v2 (task.create, task.listMessages,
 * task.sendMessage), verified against the published reference on 2026-10-22.
 */

/**
 * Environment supplied by the Vite plugin.
 *
 * Vite reads .env files, but it only exposes VITE_-prefixed values, and only
 * to client code through import.meta.env. It does NOT populate process.env, so
 * a server-side module reading process.env.MANUS_API_KEY sees nothing however
 * correct the .env file is. The plugin loads the file explicitly and injects
 * the result here.
 */
let injectedEnv: Record<string, string | undefined> = {};

export function configureEnv(env: Record<string, string | undefined>): void {
  injectedEnv = env ?? {};
}

/** Injected .env first, then a variable exported in the shell. */
function readEnv(name: string): string | undefined {
  const value = injectedEnv[name] ?? process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function baseUrl(): string {
  return readEnv('MANUS_BASE_URL') ?? 'https://api.manus.ai';
}

export interface ManusConfigError {
  kind: 'config';
  message: string;
}

export interface ManusRequestError {
  kind: 'request';
  status: number;
  code: string;
  message: string;
}

export type ManusFailure = ManusConfigError | ManusRequestError;

export function readApiKey(): string | null {
  return readEnv('MANUS_API_KEY') ?? null;
}

export const MISSING_KEY_MESSAGE =
  'Brak klucza MANUS_API_KEY. Skopiuj .env.example do .env, wpisz klucz z https://manus.im ' +
  'i uruchom ponownie serwer deweloperski.';

async function callManus(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> },
): Promise<{ ok: true; data: any } | { ok: false; error: ManusFailure }> {
  const apiKey = readApiKey();
  if (!apiKey) {
    return { ok: false, error: { kind: 'config', message: MISSING_KEY_MESSAGE } };
  }

  const url = new URL(path, baseUrl());
  Object.entries(init.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        'content-type': 'application/json',
        // Direct API-key authentication. Never both this and Authorization.
        'x-manus-api-key': apiKey,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'request',
        status: 0,
        code: 'network',
        // The key is never interpolated into a message.
        message: `Nie udało się połączyć z Manus API: ${(error as Error).message}`,
      },
    };
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      error: {
        kind: 'request',
        status: response.status,
        code: payload?.error?.code ?? String(response.status),
        message: payload?.error?.message ?? `Manus API zwróciło status ${response.status}.`,
      },
    };
  }

  return { ok: true, data: payload };
}

export function createTask(body: Record<string, unknown>) {
  return callManus('/v2/task.create', { method: 'POST', body });
}

export function listMessages(taskId: string, options: { order?: 'asc' | 'desc'; limit?: number } = {}) {
  return callManus('/v2/task.listMessages', {
    method: 'GET',
    query: {
      task_id: taskId,
      order: options.order ?? 'desc',
      limit: String(options.limit ?? 50),
    },
  });
}

export interface TaskFile {
  /** Path inside the task sandbox, e.g. /home/ubuntu/site/index.html. */
  path: string;
  filename: string;
  contentType: string;
  /** Temporary download URL. Refetched rather than stored. */
  url: string;
}

/**
 * Every file the task attached to its messages.
 *
 * This is how a generated project actually arrives: `website.status` returns
 * 404 for a file-producing task, and the Website API documents no way to
 * download source code at all. The attachments carry a `path` with the full
 * directory structure, so the project tree can be reconstructed from them
 * without unpacking the archive.
 */
export async function listTaskFiles(
  taskId: string,
): Promise<{ ok: true; files: TaskFile[] } | { ok: false; error: ManusFailure }> {
  const files: TaskFile[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  do {
    const query: Record<string, string> = { task_id: taskId, order: 'asc', limit: '100' };
    if (cursor) query.cursor = cursor;
    const result = await callManus('/v2/task.listMessages', { method: 'GET', query });
    if (!result.ok) return { ok: false, error: result.error };

    (result.data.messages ?? []).forEach((message: any) => {
      const attachments = [
        ...(message.assistant_message?.attachments ?? []),
        ...(message.user_message?.attachments ?? []),
      ];
      attachments.forEach((attachment: any) => {
        if (!attachment?.url) return;
        const path = String(attachment.path ?? attachment.filename ?? '');
        if (!path || seen.has(path)) return;
        seen.add(path);
        files.push({
          path,
          filename: String(attachment.filename ?? path.split('/').pop() ?? 'plik'),
          contentType: String(attachment.content_type ?? 'application/octet-stream'),
          url: String(attachment.url),
        });
      });
    });

    cursor = result.data.has_more ? result.data.next_cursor : undefined;
  } while (cursor);

  return { ok: true, files };
}

/** Streams one task file, by its sandbox path. */
export async function fetchTaskFile(
  taskId: string,
  path: string,
): Promise<{ ok: true; body: ArrayBuffer; contentType: string } | { ok: false; error: ManusFailure }> {
  const listed = await listTaskFiles(taskId);
  if (!listed.ok) return { ok: false, error: listed.error };

  const file = listed.files.find((candidate) => candidate.path === path);
  if (!file) {
    return {
      ok: false,
      error: { kind: 'request', status: 404, code: 'not_found', message: `Brak pliku ${path}.` },
    };
  }

  try {
    const response = await fetch(file.url);
    if (!response.ok) {
      return {
        ok: false,
        error: {
          kind: 'request',
          status: response.status,
          code: 'download_failed',
          message: `Nie udało się pobrać ${file.filename} (status ${response.status}).`,
        },
      };
    }
    return { ok: true, body: await response.arrayBuffer(), contentType: file.contentType };
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'request',
        status: 0,
        code: 'network',
        message: `Błąd pobierania ${file.filename}: ${(error as Error).message}`,
      },
    };
  }
}

export function sendMessage(taskId: string, text: string) {
  return callManus('/v2/task.sendMessage', {
    method: 'POST',
    body: { task_id: taskId, message: { content: [{ type: 'text', text }] } },
  });
}

/* ------------------------------------------------------------------ */
/* Reducing a message list to the state the UI needs                    */
/* ------------------------------------------------------------------ */

export type TaskPhase = 'running' | 'waiting' | 'stopped' | 'error';

export interface TaskSnapshot {
  phase: TaskPhase;
  /** The agent's latest human-readable progress line, if any. */
  brief: string;
  /** Set when the agent is waiting for an answer. */
  question: string | null;
  /** The structured result, once the task has produced one. */
  structuredResult: { success: boolean; value: unknown; error: string | null } | null;
  errorMessage: string | null;
}

/**
 * Collapses `task.listMessages` output into one state.
 *
 * Messages arrive newest-first by default, so this walks from the end to find
 * the most recent status and the result that followed it.
 */
export function summariseMessages(messages: any[]): TaskSnapshot {
  const ordered = [...messages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const snapshot: TaskSnapshot = {
    phase: 'running',
    brief: '',
    question: null,
    structuredResult: null,
    errorMessage: null,
  };

  ordered.forEach((message) => {
    switch (message.type) {
      case 'status_update': {
        const status = message.status_update?.agent_status;
        if (status === 'running' || status === 'waiting' || status === 'stopped' || status === 'error') {
          snapshot.phase = status;
        }
        const brief = message.status_update?.brief ?? message.status_update?.description;
        if (typeof brief === 'string' && brief.trim()) snapshot.brief = brief.trim();
        break;
      }
      case 'assistant_message': {
        const content = message.assistant_message?.content;
        if (typeof content === 'string' && content.trim()) {
          snapshot.question = content.trim();
        }
        break;
      }
      case 'error_message': {
        const content = message.error_message?.content;
        snapshot.errorMessage = typeof content === 'string' ? content : 'Zadanie zakończyło się błędem.';
        snapshot.phase = 'error';
        break;
      }
      case 'structured_output_result': {
        const result = message.structured_output_result;
        if (result) {
          snapshot.structuredResult = {
            success: result.success === true,
            value: result.value ?? null,
            error: typeof result.error === 'string' ? result.error : null,
          };
        }
        break;
      }
      default:
        break;
    }
  });

  // A question only matters while the agent is actually waiting for it.
  if (snapshot.phase !== 'waiting') snapshot.question = null;

  return snapshot;
}
