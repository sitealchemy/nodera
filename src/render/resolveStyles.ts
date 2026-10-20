import { ElementStyles, NodeElement, OpticalOffset, ResponsiveScope, ViewportDevice } from '../types/document';

/**
 * Single source of truth for turning a NodeElement into concrete styles.
 *
 * Shared by the editor canvas, the proposal preview and the HTML exporter so
 * the three can never drift apart — a document must look the same in all of
 * them at the same width.
 */

export const VIEWPORT_WIDTHS: Record<ViewportDevice, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

/** The editing scope a viewport corresponds to, used to pick overrides. */
export function scopeForViewport(device: ViewportDevice): ResponsiveScope {
  if (device === 'mobile') return 'mobile';
  if (device === 'tablet') return 'tablet';
  return 'all';
}

/**
 * Resolves the optical offset that applies at a given scope.
 *
 * `opticalOffset` is the shared value; `opticalOffsets.mobile` / `.tablet` are
 * optional per-breakpoint overrides. A scope with no override inherits the
 * shared value, which keeps every document written before per-scope offsets
 * existed rendering exactly as it did.
 */
export function resolveOpticalOffset(
  node: NodeElement,
  scope: ResponsiveScope,
): OpticalOffset | undefined {
  if (scope !== 'all') {
    const override = node.opticalOffsets?.[scope];
    if (override) return override;
  }
  return node.opticalOffset;
}

/**
 * Merges base styles with the override for the active viewport.
 *
 * Tablet deliberately does NOT inherit mobile: they are independent scopes in
 * the UI, so inheriting would make a tablet edit silently follow a mobile one.
 */
export function resolveStyles(node: NodeElement, device: ViewportDevice): ElementStyles {
  const base = { ...node.styles };
  if (device === 'mobile' && node.responsiveOverrides?.mobile) {
    Object.assign(base, node.responsiveOverrides.mobile);
  } else if (device === 'tablet' && node.responsiveOverrides?.tablet) {
    Object.assign(base, node.responsiveOverrides.tablet);
  }
  return base;
}

/**
 * Composes the optical offset into an existing transform rather than replacing
 * it, so a document that already uses `transform` keeps its own value.
 */
export function composeTransform(
  existing: string | undefined,
  offset: OpticalOffset | undefined,
): string | undefined {
  const hasOffset = !!offset && (offset.x !== 0 || offset.y !== 0);
  if (!hasOffset) return existing;
  const translate = `translate(${offset!.x}px, ${offset!.y}px)`;
  return existing ? `${existing} ${translate}` : translate;
}

/**
 * Final styles for rendering: viewport overrides + composed optical transform.
 *
 * Note what this does NOT do: it never forces `position`. The previous canvas
 * rewrote `position: absolute` to `relative` whenever a node carried an offset,
 * which silently moved absolutely-positioned elements. `translate` works on
 * static and absolute elements alike, so no position is needed.
 */
export function resolveRenderStyles(node: NodeElement, device: ViewportDevice): ElementStyles {
  const styles = resolveStyles(node, device);
  const offset = resolveOpticalOffset(node, scopeForViewport(device));
  const transform = composeTransform(styles.transform as string | undefined, offset);
  if (transform) styles.transform = transform;
  return styles;
}

/** camelCase style object -> inline CSS text, for the HTML exporter. */
export function stylesToCssText(styles: ElementStyles): string {
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${value};`)
    .join(' ');
}

/** Tags that must never receive children or a closing tag. */
export const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'source', 'meta', 'link']);

export function isVoidTag(tag: string): boolean {
  return VOID_TAGS.has(tag);
}

/** Tags that carry their text via an attribute rather than children. */
export function isFormControl(tag: string): boolean {
  return tag === 'input' || tag === 'textarea';
}
