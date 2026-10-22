import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_INTERVAL_MS, createTask, fetchStatus, replyToTask } from '../manus/client';
import { importSite } from '../site/importSite';
import { ingestTaskOutput, parseHtml, serialise } from '../site/ingest';
import { SiteOriginal } from '../site/types';
import { projectRepository } from './indexedDbRepository';
import { GenerationState, ProjectRecord } from './types';

/**
 * Drives one project's generation from prompt to editable document.
 *
 * Four properties this hook exists to guarantee:
 *
 * - A task is created at most once. The task id is persisted before anything
 *   else, so a reload re-attaches to the running task instead of starting a
 *   second, separately billed one. A double click cannot start two either.
 * - A failed conversion never destroys the prompt, the task id or the files
 *   Manus delivered. The project stays in the list with its error, and the
 *   delivery is kept so it can be inspected.
 * - The two stages after generation — downloading the files and converting a
 *   copy of them — can each be retried on their own. Neither costs anything,
 *   because neither asks Manus to design the page again.
 * - The original delivery is stored next to the editable copy, so the copy can
 *   always be rebuilt from it.
 */

const PHASE_MESSAGE: Record<string, string> = {
  starting: 'Uruchamiam zadanie…',
  generating: 'Manus projektuje stronę…',
  downloading: 'Pobieram pliki strony…',
  importing: 'Przygotowuję kopię do edycji…',
  waiting: 'Manus pyta o szczegóły.',
  ready: 'Gotowe.',
};

export interface GenerationController {
  state: GenerationState;
  /** Starts generation for a project that has none. Safe to call twice. */
  start: (record: ProjectRecord) => Promise<void>;
  /** Re-attaches to a task already in flight (after a reload). */
  resume: (record: ProjectRecord) => void;
  /** Answers a question from Manus inside the same task. */
  answer: (text: string) => Promise<void>;
  /**
   * Re-runs download and conversion for a task that already finished.
   *
   * Uses files already on disk when there are any, so a conversion fault is
   * retried without touching the network — and never by generating again.
   */
  retryPreparation: () => Promise<void>;
  /** True when the failure is in a stage that `retryPreparation` can redo. */
  canRetryPreparation: boolean;
  /** Stops polling here. Does NOT cancel the task at Manus. */
  stopWatching: () => void;
  watching: boolean;
}

export function useGeneration(
  projectId: string | null,
  initial: GenerationState,
  onDocumentReady: (record: ProjectRecord) => void,
): GenerationController {
  const [state, setState] = useState<GenerationState>(initial);
  const [watching, setWatching] = useState(false);

  const pollTimer = useRef<number | null>(null);
  const startedRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // `useState(initial)` keeps the value from the first render only. The hook
  // mounts before any project is open, so without this the generation screen
  // would show an empty state for a project whose task is already running —
  // exactly the case a reload lands in.
  const syncedFor = useRef<string | null>(null);
  if (projectId !== syncedFor.current) {
    syncedFor.current = projectId;
    startedRef.current = false;
    if (state !== initial) setState(initial);
  }
  const onReadyRef = useRef(onDocumentReady);
  onReadyRef.current = onDocumentReady;

  // A mirror of `state`, so `persist` can compute the next value without
  // reading it inside a setState updater.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Writes one generation-state change, and resolves once it is stored.
   *
   * The write used to happen inside the setState updater, which made it both
   * impure and unordered: the 'importing' write could land after the 'ready'
   * one, leaving a finished project showing "Przygotowanie" on the dashboard.
   * Awaiting here makes the sequence deterministic.
   */
  const persist = useCallback(async (patch: Partial<GenerationState>) => {
    const id = projectIdRef.current;
    const next: GenerationState = { ...stateRef.current, ...patch, updatedAt: Date.now() };
    stateRef.current = next;
    setState(next);
    if (!id) return;
    try {
      await projectRepository.update(id, { generation: next, status: next.status });
    } catch {
      /* storage errors surface through the editor's save indicator */
    }
  }, []);

  /**
   * Shows progress without touching storage.
   *
   * File-by-file download progress is worth showing and not worth writing: one
   * IndexedDB transaction per downloaded image would be pure overhead, and the
   * phase itself is already persisted on either side of the loop.
   */
  const report = useCallback((message: string) => {
    const next = { ...stateRef.current, message };
    stateRef.current = next;
    setState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const stopWatching = useCallback(() => {
    clearTimer();
    setWatching(false);
  }, [clearTimer]);

  /** Stores a finished document and hands the record to the editor. */
  const finish = useCallback(
    async (taskId: string, document: ProjectRecord['document'], original: SiteOriginal) => {
      const id = projectIdRef.current;
      if (!id) return;
      const record = await projectRepository.update(id, {
        document,
        original,
        status: 'ready',
        generation: {
          ...stateRef.current,
          status: 'ready',
          taskId,
          message: PHASE_MESSAGE.ready,
          error: null,
          question: null,
          rawResult: null,
          updatedAt: Date.now(),
        },
      });
      stateRef.current = record.generation;
      setState(record.generation);
      onReadyRef.current(record);
    },
    [],
  );

  /**
   * Downloads the task's files and converts a copy of them.
   *
   * The original files are written even when the conversion fails: that is
   * what makes the next attempt free, and what lets the delivery be looked at
   * rather than guessed about.
   */
  const prepare = useCallback(
    async (taskId: string) => {
      const id = projectIdRef.current;
      if (!id) return;

      await persist({ status: 'downloading', message: PHASE_MESSAGE.downloading, error: null });

      const result = await ingestTaskOutput(taskId, (progress) => {
        if (progress.total > 0 && progress.downloaded >= progress.total) {
          report(PHASE_MESSAGE.importing);
          return;
        }
        report(
          `Pobieram pliki (${progress.downloaded + 1}/${progress.total})` +
            (progress.current ? ` — ${progress.current}` : '…'),
        );
      });

      if (!result.ok) {
        // Whatever arrived is kept, so a retry starts from the files rather
        // than from the network, and nothing has to be generated again.
        if (result.original) {
          try {
            await projectRepository.update(id, { original: result.original });
          } catch {
            /* the error below is the thing the user needs to see */
          }
        }
        await persist({
          status: 'error',
          error: result.reason,
          warnings: [],
          message: '',
        });
        return;
      }

      await persist({ warnings: result.document.report.limitations });
      await finish(taskId, result.document, result.original);
    },
    [finish, persist, report],
  );

  /**
   * Re-runs the conversion from files already stored, or re-downloads them.
   *
   * Deliberately never calls `createTask`: a conversion fault is ours, and
   * making the user pay for another generation to work around it would be
   * both expensive and dishonest about where the fault is.
   */
  const retryPreparation = useCallback(
    async () => {
      const id = projectIdRef.current;
      const taskId = stateRef.current.taskId;
      if (!id || !taskId) return;

      // Read the record rather than taking one from the caller: a failed
      // download writes what it managed to fetch, and the screen offering
      // this retry still holds the record from before that write.
      let stored: SiteOriginal | null | undefined;
      try {
        stored = (await projectRepository.get(id))?.original;
      } catch {
        stored = null;
      }

      // Only a complete delivery is worth converting again. Anything less and
      // the files are fetched afresh — which still costs nothing, because the
      // task is never asked to design the page a second time.
      if (!stored || !stored.complete || stored.files.length === 0) {
        await prepare(taskId);
        return;
      }

      await persist({ status: 'importing', message: PHASE_MESSAGE.importing, error: null });
      const result = importSite(
        stored.files.map((file) => ({
          path: file.path,
          contentType: file.contentType,
          text: file.text,
          blob: file.blob,
          bytes: file.blob?.size,
        })),
        parseHtml,
        serialise,
      );

      if (!result.ok) {
        await persist({
          status: 'error',
          error: `${result.reason} Pobrane pliki: ${result.files.join(', ')}`,
          message: '',
        });
        return;
      }

      await persist({ warnings: result.document.report.limitations });
      await finish(taskId, result.document, stored);
    },
    [finish, persist, prepare],
  );

  // Derived from the live generation state, not from a project record: the
  // record on screen is the one that was loaded before the task ran, and it
  // still says the project has no task at all.
  const canRetryPreparation = state.status === 'error' && state.taskId !== null;

  const poll = useCallback(
    async (taskId: string) => {
      try {
        const status = await fetchStatus(taskId);

        if (status.phase === 'error') {
          await persist({
            status: 'error',
            error: status.errorMessage ?? 'Zadanie Manus zakończyło się błędem.',
            message: '',
          });
          setWatching(false);
          return;
        }

        if (status.phase === 'waiting') {
          await persist({
            status: 'waiting',
            question: status.question ?? 'Manus prosi o dodatkowe informacje.',
            message: PHASE_MESSAGE.waiting,
          });
          setWatching(false);
          return;
        }

        if (status.phase === 'stopped') {
          setWatching(false);
          // The deliverable is the attached files, not a structured result.
          await prepare(taskId);
          return;
        }

        // Still running.
        await persist({
          status: 'generating',
          message: status.brief || PHASE_MESSAGE.generating,
          error: null,
        });
        pollTimer.current = window.setTimeout(() => void poll(taskId), POLL_INTERVAL_MS);
      } catch (error) {
        await persist({
          status: 'error',
          error: (error as Error).message,
          message: '',
        });
        setWatching(false);
      }
    },
    [persist, prepare],
  );

  const resume = useCallback(
    (record: ProjectRecord) => {
      if (!record.generation.taskId) return;
      if (record.generation.status === 'ready') return;
      clearTimer();
      setWatching(true);
      void poll(record.generation.taskId);
    },
    [clearTimer, poll],
  );

  const start = useCallback(
    async (record: ProjectRecord) => {
      // Guards against a second click and against a re-render racing the first.
      if (startedRef.current) return;
      if (record.generation.taskId) {
        resume(record);
        return;
      }
      startedRef.current = true;

      await persist({ status: 'starting', message: PHASE_MESSAGE.starting, error: null });
      try {
        const task = await createTask(record.prompt);
        // Persisted before polling: a reload now re-attaches rather than
        // creating — and paying for — a second task.
        await persist({
          status: 'generating',
          taskId: task.taskId,
          taskUrl: task.taskUrl,
          message: PHASE_MESSAGE.generating,
          error: null,
        });
        setWatching(true);
        void poll(task.taskId);
      } catch (error) {
        startedRef.current = false;
        await persist({
          status: 'error',
          error: (error as Error).message,
          message: '',
        });
      }
    },
    [persist, poll, resume],
  );

  const answer = useCallback(
    async (text: string) => {
      if (!state.taskId) return;
      await persist({ status: 'generating', message: PHASE_MESSAGE.generating, question: null });
      try {
        await replyToTask(state.taskId, text);
        setWatching(true);
        void poll(state.taskId);
      } catch (error) {
        await persist({ status: 'error', error: (error as Error).message, message: '' });
      }
    },
    [persist, poll, state.taskId],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return {
    state,
    start,
    resume,
    answer,
    retryPreparation,
    canRetryPreparation,
    stopWatching,
    watching,
  };
}
