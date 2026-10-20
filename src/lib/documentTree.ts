import { NodeElement } from '../types/document';

/** Pure tree queries over a page document. Shared by the canvas, tree and keyboard nav. */

export function findNode(root: NodeElement, id: string): NodeElement | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(root: NodeElement, id: string): NodeElement | null {
  for (const child of root.children ?? []) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

/** Root -> node, inclusive. Empty when the node is not in this tree. */
export function pathToNode(root: NodeElement, id: string): NodeElement[] {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const path = pathToNode(child, id);
    if (path.length) return [root, ...path];
  }
  return [];
}

export function nodeExists(root: NodeElement, id: string | null): boolean {
  return !!id && findNode(root, id) !== null;
}

export interface SiblingNavigation {
  previous: NodeElement | null;
  next: NodeElement | null;
}

export function siblingsOf(root: NodeElement, id: string): SiblingNavigation {
  const parent = findParent(root, id);
  if (!parent?.children) return { previous: null, next: null };
  const index = parent.children.findIndex((child) => child.id === id);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? parent.children[index - 1] : null,
    next: index < parent.children.length - 1 ? parent.children[index + 1] : null,
  };
}

export function firstChildOf(root: NodeElement, id: string): NodeElement | null {
  const node = findNode(root, id);
  return node?.children?.length ? node.children[0] : null;
}

/**
 * Structural navigation used by the arrow keys when no action is active:
 * up = parent, down = first child, left/right = sibling.
 *
 * Returns null when the move is not possible, so the caller can leave the
 * selection alone rather than jumping somewhere arbitrary.
 */
export function navigateFrom(
  root: NodeElement,
  id: string,
  direction: 'up' | 'down' | 'left' | 'right',
): NodeElement | null {
  switch (direction) {
    case 'up': {
      const parent = findParent(root, id);
      // The page root is not a useful selection target.
      return parent && parent.id !== root.id ? parent : null;
    }
    case 'down':
      return firstChildOf(root, id);
    case 'left':
      return siblingsOf(root, id).previous;
    case 'right':
      return siblingsOf(root, id).next;
    default:
      return null;
  }
}

/** Depth-first list of every node, used for counts and bulk walks. */
export function flattenNodes(root: NodeElement): NodeElement[] {
  const out: NodeElement[] = [root];
  for (const child of root.children ?? []) out.push(...flattenNodes(child));
  return out;
}

/**
 * Which local actions make sense for a node.
 *
 * Deliberately conservative: the toolbar must never show a button that does
 * nothing, so "text" only appears where there is text to edit.
 */
export type ElementAction = 'text' | 'size' | 'appearance' | 'position';

export function actionsFor(node: NodeElement): ElementAction[] {
  const actions: ElementAction[] = [];
  const hasOwnText = node.content !== undefined && !node.children?.length;
  if (hasOwnText) actions.push('text');
  actions.push('size', 'appearance', 'position');
  return actions;
}
