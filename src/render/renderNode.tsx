import React from 'react';
import { NodeElement, ViewportDevice } from '../types/document';
import { isFormControl, isVoidTag, resolveRenderStyles } from './resolveStyles';

/**
 * Renders a document node tree to real DOM elements.
 *
 * The important property: **no wrapper elements**. The previous canvas wrapped
 * every node in a `<div class="relative group">`, which silently broke every
 * flex and grid layout in the document (the wrapper became the flex item, not
 * the element the author styled) and corrupted selectors that depend on
 * parent/child relationships.
 *
 * Instead each node renders as exactly the tag the document asks for, tagged
 * with `data-node-id`. Selection outlines and toolbars live in a separate
 * screen-space overlay outside the iframe and never touch layout.
 */

export const NODE_ID_ATTRIBUTE = 'data-node-id';

export interface RenderOptions {
  device: ViewportDevice;
  /** Marks the tree as interactive (user preview) rather than inert (editor). */
  interactive?: boolean;
}

export function renderNode(node: NodeElement, options: RenderOptions): React.ReactNode {
  const { device, interactive = false } = options;
  const styles = resolveRenderStyles(node, device);
  const Tag = node.tag as keyof JSX.IntrinsicElements;

  // `key` is passed to createElement separately, never spread: React warns
  // when a key arrives through a spread object and silently drops it.
  const common: Record<string, unknown> = {
    [NODE_ID_ATTRIBUTE]: node.id,
    style: styles,
  };

  if (node.tag === 'img') {
    return React.createElement('img', {
      ...common,
      key: node.id,
      src: node.src,
      alt: node.alt ?? '',
      draggable: false,
    });
  }

  if (node.tag === 'input') {
    // Uncontrolled on purpose: the document holds no field state, and a
    // controlled empty value would make the field unusable in the preview.
    return React.createElement('input', {
      ...common,
      key: node.id,
      placeholder: node.content || node.name,
      readOnly: !interactive,
      defaultValue: '',
    });
  }

  if (node.tag === 'textarea') {
    return React.createElement('textarea', {
      ...common,
      key: node.id,
      placeholder: node.content || node.name,
      readOnly: !interactive,
      defaultValue: '',
    });
  }

  if (isVoidTag(node.tag) || isFormControl(node.tag)) {
    return React.createElement(Tag, { ...common, key: node.id });
  }

  const children = node.children?.length
    ? node.children.map((child) => renderNode(child, options))
    : node.content;

  if (node.tag === 'a') {
    return React.createElement(
      'a',
      {
        ...common,
        key: node.id,
        href: node.href || undefined,
        // In the editor the whole tree is pointer-inert, but belt and braces:
        // a link must not navigate away from the editor if focus reaches it.
        ...(interactive ? {} : { tabIndex: -1 }),
      },
      children,
    );
  }

  if (node.tag === 'form') {
    return React.createElement(
      'form',
      { ...common, key: node.id, onSubmit: (e: React.FormEvent) => e.preventDefault() },
      children,
    );
  }

  return React.createElement(Tag, { ...common, key: node.id }, children);
}

/** Renders a whole page root. */
export function renderDocument(root: NodeElement, options: RenderOptions): React.ReactNode {
  return renderNode(root, options);
}
