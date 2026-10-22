/**
 * Browser-side client for the local Manus backend.
 *
 * Talks only to /api/manus/* on the same origin. It never sees an API key —
 * that is the point of routing through the local server at all.
 */

export interface ManusConfig {
  configured: boolean;
  message: string;
}

export interface CreatedTask {
  taskId: string;
  taskUrl: string | null;
  title: string;
}

export interface TaskStatus {
  phase: 'running' | 'waiting' | 'stopped' | 'error';
  brief: string;
  question: string | null;
  structuredResult: { success: boolean; value: unknown; error: string | null } | null;
  errorMessage: string | null;
}

export class ManusClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ManusClientError';
    this.code = code;
  }
}

async function parse(response: Response): Promise<any> {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    throw new ManusClientError(
      payload?.code ?? String(response.status),
      payload?.message ?? `Serwer lokalny zwrócił status ${response.status}.`,
    );
  }
  return payload;
}

export async function fetchConfig(): Promise<ManusConfig> {
  const payload = await parse(await fetch('/api/manus/config'));
  return { configured: payload.configured === true, message: payload.message ?? '' };
}

export async function createTask(prompt: string): Promise<CreatedTask> {
  const payload = await parse(
    await fetch('/api/manus/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }),
  );
  return { taskId: payload.taskId, taskUrl: payload.taskUrl ?? null, title: payload.title ?? '' };
}

export interface TaskFileInfo {
  path: string;
  filename: string;
  contentType: string;
}

/** The files a finished task attached, with their directory structure. */
export async function fetchTaskFiles(taskId: string): Promise<TaskFileInfo[]> {
  const payload = await parse(
    await fetch(`/api/manus/files?taskId=${encodeURIComponent(taskId)}`),
  );
  return payload.files ?? [];
}

/** Downloads one task file through the local backend. */
export async function fetchTaskFile(taskId: string, path: string): Promise<Blob> {
  const response = await fetch(
    `/api/manus/file?taskId=${encodeURIComponent(taskId)}&path=${encodeURIComponent(path)}`,
  );
  if (!response.ok) {
    let message = `Nie udało się pobrać pliku (status ${response.status}).`;
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {
      /* not JSON */
    }
    throw new ManusClientError('download_failed', message);
  }
  return response.blob();
}

export async function fetchStatus(taskId: string): Promise<TaskStatus> {
  const payload = await parse(
    await fetch(`/api/manus/status?taskId=${encodeURIComponent(taskId)}`),
  );
  return {
    phase: payload.phase,
    brief: payload.brief ?? '',
    question: payload.question ?? null,
    structuredResult: payload.structuredResult ?? null,
    errorMessage: payload.errorMessage ?? null,
  };
}

export async function replyToTask(taskId: string, text: string): Promise<void> {
  await parse(
    await fetch('/api/manus/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, text }),
    }),
  );
}

/** How often a running task is polled. */
export const POLL_INTERVAL_MS = 4000;
