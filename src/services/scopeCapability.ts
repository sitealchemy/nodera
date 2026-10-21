import { ResponsiveScope } from '../types/document';

/**
 * What each kind of operation can actually do per editing scope.
 *
 * The editor lets the user pick "Małe ekrany" and then run any command. Some
 * operations genuinely cannot be scoped: reordering a menu changes the
 * document tree, and a document has one tree regardless of viewport. Running
 * those while a local scope is selected used to change every screen while the
 * UI said the edit was local.
 *
 * Rather than silently widening the edit (or silently refusing), each
 * operation declares its capability and the caller explains the limit. The
 * scope is never switched automatically — that is the user's decision.
 */

export type OperationKind =
  /** Writes CSS properties; fully scopable via responsive overrides. */
  | 'style'
  /** Writes an optical offset; fully scopable via per-scope offsets. */
  | 'offset'
  /** Changes the document tree (order, insertion, removal). Not scopable. */
  | 'structure'
  /** Changes text content. One document, one text — not scopable. */
  | 'content';

export const SCOPABLE_OPERATIONS: OperationKind[] = ['style', 'offset'];

export function isScopable(kind: OperationKind): boolean {
  return SCOPABLE_OPERATIONS.includes(kind);
}

export interface ScopeCheck {
  allowed: boolean;
  /** Message shown when the operation cannot run in the current scope. */
  reason?: string;
  hint?: string;
}

const SCOPE_NAME: Record<ResponsiveScope, string> = {
  all: 'Wszystkie ekrany',
  mobile: 'Małe ekrany',
  tablet: 'Tablety',
};

/** Human description of an operation, for the refusal message. */
const OPERATION_NAME: Record<OperationKind, string> = {
  style: 'Zmiana stylu',
  offset: 'Korekta optyczna',
  structure: 'Zmiana struktury dokumentu',
  content: 'Zmiana treści',
};

/**
 * Decides whether `kind` may run under `scope`.
 *
 * Non-scopable operations are allowed only under 'all', where the user is
 * already looking at the shared rule and no false locality is implied.
 */
export function checkScope(kind: OperationKind, scope: ResponsiveScope): ScopeCheck {
  if (scope === 'all' || isScopable(kind)) return { allowed: true };

  return {
    allowed: false,
    reason: `${OPERATION_NAME[kind]} jest wspólna dla wszystkich ekranów i nie może dotyczyć wyłącznie zakresu „${SCOPE_NAME[scope]}".`,
    hint: 'Przełącz zakres na „Wszystkie ekrany", aby ją wykonać.',
  };
}

/** Label describing what a control will really affect at a given scope. */
export function scopeEffectLabel(kind: OperationKind, scope: ResponsiveScope): string {
  if (scope === 'all') return 'Zmiana dotyczy wszystkich ekranów';
  if (isScopable(kind)) return `Zmiana dotyczy tylko: ${SCOPE_NAME[scope]}`;
  return 'Ta zmiana jest wspólna dla wszystkich ekranów';
}

export { SCOPE_NAME };
