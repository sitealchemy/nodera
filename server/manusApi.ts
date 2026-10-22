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

const MANUS_BASE_URL = process.env.MANUS_BASE_URL ?? 'https://api.manus.ai';

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
  const key = process.env.MANUS_API_KEY?.trim();
  return key ? key : null;
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

  const url = new URL(path, MANUS_BASE_URL);
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
