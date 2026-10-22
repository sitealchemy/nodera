import { describe, expect, it } from 'vitest';
import { ProjectState } from '../types/document';
import {
  DocumentState,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createDocumentState,
  documentReducer,
} from './history';

/** Minimal project stand-in; the reducer only cares about identity and cloning. */
const project = (name: string): ProjectState =>
  ({ id: 'p', name, directions: {}, activeDirectionId: 'd' } as unknown as ProjectState);

const commit = (state: DocumentState<ProjectState>, next: ProjectState) =>
  documentReducer(state, { type: 'commit', next });

describe('documentReducer', () => {
  it('records one history entry per commit', () => {
    let state = createDocumentState(project('a'));
    state = commit(state, project('b'));
    state = commit(state, project('c'));

    expect(state.project.name).toBe('c');
    expect(state.past).toHaveLength(2);
    expect(state.past.map((p) => p.name)).toEqual(['a', 'b']);
  });

  // The StrictMode regression: the previous implementation nested
  // setHistoryStack inside setProject's updater, and React double-invokes
  // updaters in StrictMode, so each edit pushed two entries and one undo
  // appeared to do nothing. A pure reducer is invoked once per dispatch.
  it('is pure, so repeated application of the same action is not cumulative', () => {
    const start = createDocumentState(project('a'));
    const action = { type: 'commit' as const, next: project('b') };

    const once = documentReducer(start, action);
    const twice = documentReducer(start, action);

    expect(once.past).toHaveLength(1);
    expect(twice.past).toHaveLength(1);
    expect(start.past).toHaveLength(0); // input never mutated
  });

  it('undo restores the previous project and makes redo available', () => {
    let state = createDocumentState(project('a'));
    state = commit(state, project('b'));

    state = documentReducer(state, { type: 'undo' });
    expect(state.project.name).toBe('a');
    expect(canRedo(state)).toBe(true);
    expect(canUndo(state)).toBe(false);

    state = documentReducer(state, { type: 'redo' });
    expect(state.project.name).toBe('b');
    expect(canUndo(state)).toBe(true);
  });

  it('a single edit needs exactly one undo', () => {
    let state = createDocumentState(project('before'));
    state = commit(state, project('after'));
    state = documentReducer(state, { type: 'undo' });
    expect(state.project.name).toBe('before');
  });

  it('ignores undo and redo at the ends of history', () => {
    const empty = createDocumentState(project('a'));
    expect(documentReducer(empty, { type: 'undo' })).toBe(empty);
    expect(documentReducer(empty, { type: 'redo' })).toBe(empty);
  });

  it('does not create an entry when the project object is unchanged', () => {
    const same = project('a');
    const state = createDocumentState(same);
    expect(commit(state, same)).toBe(state);
    expect(state.past).toHaveLength(0);
  });

  it('a new commit clears the redo future', () => {
    let state = createDocumentState(project('a'));
    state = commit(state, project('b'));
    state = documentReducer(state, { type: 'undo' });
    expect(canRedo(state)).toBe(true);

    state = commit(state, project('c'));
    expect(canRedo(state)).toBe(false);
  });

  it('caps history and keeps the most recent entries', () => {
    let state = createDocumentState(project('0'));
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) state = commit(state, project(String(i)));

    expect(state.past).toHaveLength(HISTORY_LIMIT);
    expect(state.past[state.past.length - 1].name).toBe(String(HISTORY_LIMIT + 9));
  });

  it('reset replaces the document and drops history', () => {
    let state = createDocumentState(project('a'));
    state = commit(state, project('b'));
    state = documentReducer(state, { type: 'reset', next: project('fresh') });

    expect(state.project.name).toBe('fresh');
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it('snapshots history entries, so later mutation of the live object cannot corrupt them', () => {
    const mutable = project('a');
    let state = createDocumentState(mutable);
    state = commit(state, project('b'));

    mutable.name = 'tampered';
    state = documentReducer(state, { type: 'undo' });
    expect(state.project.name).toBe('a');
  });
});

describe('navigate', () => {
  it('changes the project without creating a history entry', () => {
    let state = createDocumentState(project('page-a'));
    state = documentReducer(state, { type: 'navigate', next: project('page-b') });

    expect(state.project.name).toBe('page-b');
    expect(canUndo(state)).toBe(false);
    expect(state.past).toHaveLength(0);
  });

  it('leaves an existing redo future intact', () => {
    let state = createDocumentState(project('a'));
    state = commit(state, project('b'));
    state = documentReducer(state, { type: 'undo' });
    expect(canRedo(state)).toBe(true);

    state = documentReducer(state, { type: 'navigate', next: project('other-page') });
    expect(canRedo(state)).toBe(true);
  });

  it('undo after navigating still reverts the edit, not the navigation', () => {
    let state = createDocumentState(project('start'));
    state = commit(state, project('edited'));
    state = documentReducer(state, { type: 'navigate', next: project('kontakt') });

    state = documentReducer(state, { type: 'undo' });
    expect(state.project.name).toBe('start');
  });
});
