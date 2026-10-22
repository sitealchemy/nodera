

/**
 * Undo/redo as a single pure reducer.
 *
 * The previous implementation nested `setHistoryStack` inside the updater
 * passed to `setProject`. React treats updaters as pure and, under
 * StrictMode, invokes them twice — so every edit pushed TWO history entries
 * and a single undo appeared to do nothing. Keeping project, past and future
 * in one reducer makes each transition atomic and side-effect free, which is
 * both correct under StrictMode and simpler to reason about.
 */

export const HISTORY_LIMIT = 25;

export interface DocumentState<T = unknown> {
  project: T;
  past: T[];
  future: T[];
}

export type DocumentAction<T = unknown> =
  /** An edit that should be undoable. */
  | { type: 'commit'; next: T }
  /** Replace the document without touching history (loading a project). */
  | { type: 'reset'; next: T }
  /**
   * Change which page or direction is being looked at.
   *
   * These live in ProjectState but are navigation, not edits: putting them in
   * history would make undo walk back through every page the user visited
   * before reaching the change they actually wanted to revert.
   */
  | { type: 'navigate'; next: T }
  | { type: 'undo' }
  | { type: 'redo' };

/**
 * Snapshot for the history stacks.
 *
 * `structuredClone` rather than JSON: a site document holds Blobs for its
 * assets, and JSON round-tripping would silently turn each one into `{}`.
 */
const clone = <T,>(state: T): T => {
  try {
    return structuredClone(state);
  } catch {
    return JSON.parse(JSON.stringify(state));
  }
};

export function createDocumentState<T>(project: T): DocumentState<T> {
  return { project, past: [], future: [] };
}

export function documentReducer<T>(state: DocumentState<T>, action: DocumentAction<T>): DocumentState<T> {
  switch (action.type) {
    case 'commit': {
      // A commit that changes nothing must not create a history entry: an undo
      // that appears to do nothing is worse than no undo at all.
      if (action.next === state.project) return state;
      return {
        project: action.next,
        past: [...state.past, clone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
      };
    }

    case 'navigate':
      return { ...state, project: action.next };

    case 'reset':
      return { project: action.next, past: [], future: [] };

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [clone(state.project), ...state.future].slice(0, HISTORY_LIMIT),
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        project: next,
        past: [...state.past, clone(state.project)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

export const canUndo = (state: DocumentState): boolean => state.past.length > 0;
export const canRedo = (state: DocumentState): boolean => state.future.length > 0;
