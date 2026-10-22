import { ProjectState } from '../types/document';

/**
 * Project storage contract.
 *
 * Deliberately an interface rather than direct IndexedDB calls at the call
 * sites: saving to an account later means another implementation of this
 * interface, not a rewrite of the dashboard and editor. Nothing here assumes a
 * local store.
 */

export type GenerationStatus =
  /** Nothing requested yet (the demo project, or an imported document). */
  | 'none'
  /** The task is being created. */
  | 'starting'
  /** Manus is working. */
  | 'generating'
  /** The task finished; the result is being fetched and validated. */
  | 'importing'
  /** Manus is asking a question and will not continue without an answer. */
  | 'waiting'
  /** A document exists and can be edited. */
  | 'ready'
  /** Something failed. `error` explains what. */
  | 'error';

export interface GenerationState {
  status: GenerationStatus;
  /** The Manus task, kept so a reload re-attaches instead of paying again. */
  taskId: string | null;
  taskUrl: string | null;
  /** Operator-facing message for the current state. */
  message: string;
  /** Present when status is 'error'. */
  error: string | null;
  /** The last question Manus asked, when status is 'waiting'. */
  question: string | null;
  /** Non-fatal import corrections, kept for diagnosis. */
  warnings: string[];
  /** The raw result, retained when an import fails so it can be inspected. */
  rawResult: unknown;
  updatedAt: number;
}

/** What the dashboard list needs — never the whole document. */
export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
  status: GenerationStatus;
  /** True for the bundled example, so it is never shown as the user's work. */
  isDemo: boolean;
  /** Short text preview used when there is no thumbnail. */
  previewHeading: string;
}

/** Summary plus the editable document and generation bookkeeping. */
export interface ProjectRecord extends ProjectSummary {
  document: ProjectState | null;
  generation: GenerationState;
}

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectRecord | null>;
  create(record: ProjectRecord): Promise<void>;
  /** Partial update; `updatedAt` is set by the repository. */
  update(id: string, patch: Partial<Omit<ProjectRecord, 'id'>>): Promise<ProjectRecord>;
  remove(id: string): Promise<void>;
}

export function emptyGeneration(): GenerationState {
  return {
    status: 'none',
    taskId: null,
    taskUrl: null,
    message: '',
    error: null,
    question: null,
    warnings: [],
    rawResult: null,
    updatedAt: Date.now(),
  };
}

/** A short, human project name derived from the prompt. */
export function nameFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Nowy projekt';
  const firstSentence = cleaned.split(/[.!?]/)[0];
  const candidate = firstSentence.length >= 12 ? firstSentence : cleaned;
  return candidate.length > 60 ? `${candidate.slice(0, 57)}…` : candidate;
}

/** The first heading in a document, for the dashboard card. */
export function previewHeadingOf(document: ProjectState | null): string {
  if (!document) return '';
  const direction = document.directions[document.activeDirectionId];
  const page = direction?.pages?.[document.activePageSlug] ?? Object.values(direction?.pages ?? {})[0];
  if (!page) return '';

  let found = '';
  const walk = (node: { tag: string; content?: string; children?: any[] }) => {
    if (found) return;
    if (/^h[1-3]$/.test(node.tag) && node.content) {
      found = node.content;
      return;
    }
    node.children?.forEach(walk);
  };
  walk(page.root as any);
  return found;
}
