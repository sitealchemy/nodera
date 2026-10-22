import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_INTERVAL_MS, createTask, fetchStatus, replyToTask } from '../manus/client';
import { buildProjectFromSpec } from '../manus/buildDocument';
import { validatePageSpec } from '../manus/pageSpec';
import { projectRepository } from './indexedDbRepository';
import { GenerationState, ProjectRecord } from './types';

/**
 * Drives one project's generation from prompt to editable document.
 *
 * Two properties this hook exists to guarantee:
 *
 * - A task is created at most once. The task id is persisted before anything
 *   else, so a reload re-attaches to the running task instead of starting a
 *   second, separately billed one. A double click cannot start two either.
 * - A failed import never destroys the prompt, the task id or the raw result.
 *   The project stays in the list with its error, and the result is kept for
 *   diagnosis rather than replaced by a demo document.
 */

const PHASE_MESSAGE: Record<string, string> = {
  starting: 'Uruchamiam zadanie…',
  generating: 'Manus projektuje stronę…',
  importing: 'Pobieram wynik i przygotowuję do edycji…',
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

  /** Validates, builds and stores the document. */
  const importResult = useCallback(
    async (taskId: string, value: unknown, prompt: string, projectName: string) => {
      const id = projectIdRef.current;
      if (!id) return;

      await persist({ status: 'importing', message: PHASE_MESSAGE.importing, error: null });

      const validation = validatePageSpec(value);
      if (!validation.ok) {
        const detail = validation.errors.map((issue) => `${issue.path || 'wynik'}: ${issue.message}`);
        await persist({
          status: 'error',
          error: `Wynik nie przeszedł walidacji. ${detail.join(' ')}`,
          // Kept deliberately: the prompt, the task and the raw value all stay.
          rawResult: value,
          warnings: validation.warnings.map((issue) => `${issue.path}: ${issue.message}`),
          message: '',
        });
        return;
      }

      try {
        const document = buildProjectFromSpec(validation.spec, {
          projectId: id,
          projectName,
          prompt,
        });
        const record = await projectRepository.update(id, {
          document,
          status: 'ready',
          generation: {
            ...stateRef.current,
            status: 'ready',
            taskId,
            message: PHASE_MESSAGE.ready,
            error: null,
            question: null,
            warnings: validation.warnings.map((issue) => `${issue.path}: ${issue.message}`),
            rawResult: null,
            updatedAt: Date.now(),
          },
        });
        setState(record.generation);
        onReadyRef.current(record);
      } catch (error) {
        await persist({
          status: 'error',
          error: `Nie udało się zbudować dokumentu: ${(error as Error).message}`,
          rawResult: value,
          message: '',
        });
      }
    },
    [persist],
  );

  const poll = useCallback(
    async (taskId: string, prompt: string, projectName: string) => {
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
          const result = status.structuredResult;
          if (!result) {
            await persist({
              status: 'error',
              error:
                'Zadanie zakończyło się bez wyniku strukturalnego. Otwórz zadanie w Manus, aby sprawdzić przebieg.',
              message: '',
            });
            setWatching(false);
            return;
          }
          if (!result.success) {
            await persist({
              status: 'error',
              error: result.error ?? 'Manus nie zdołał wygenerować strony.',
              rawResult: result.value,
              message: '',
            });
            setWatching(false);
            return;
          }
          setWatching(false);
          await importResult(taskId, result.value, prompt, projectName);
          return;
        }

        // Still running.
        await persist({
          status: 'generating',
          message: status.brief || PHASE_MESSAGE.generating,
          error: null,
        });
        pollTimer.current = window.setTimeout(
          () => void poll(taskId, prompt, projectName),
          POLL_INTERVAL_MS,
        );
      } catch (error) {
        await persist({
          status: 'error',
          error: (error as Error).message,
          message: '',
        });
        setWatching(false);
      }
    },
    [importResult, persist],
  );

  const resume = useCallback(
    (record: ProjectRecord) => {
      if (!record.generation.taskId) return;
      if (record.generation.status === 'ready') return;
      clearTimer();
      setWatching(true);
      void poll(record.generation.taskId, record.prompt, record.name);
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
        void poll(task.taskId, record.prompt, record.name);
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
        void poll(state.taskId, '', '');
      } catch (error) {
        await persist({ status: 'error', error: (error as Error).message, message: '' });
      }
    },
    [persist, poll, state.taskId],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { state, start, resume, answer, stopWatching, watching };
}
