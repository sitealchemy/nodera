import {
  DesignTokens,
  ElementStyles,
  NodeElement,
  PageDocument,
  ResponsiveScope,
} from '../types/document';
import { BREAKPOINTS, breakpointFor } from './breakpoints';
import { composeTransform, resolveOpticalOffset, stylesToCssText } from './resolveStyles';
import { classifyLink } from '../lib/links';

/**
 * Standalone HTML export.
 *
 * Two properties this module exists to guarantee:
 *
 * 1. RESPONSIVE PARITY. Styles are emitted as a real stylesheet keyed by
 *    element id, not as inline `style` attributes. Inline styles beat every
 *    media query (short of `!important`), so the old inline-only export could
 *    never carry a mobile or tablet override — the rules would be written and
 *    then lose. Base rules come first, breakpoint rules after, same
 *    specificity, later wins.
 *
 * 2. SAFETY. `node.content` is author text, not markup. It is escaped in text
 *    context, attributes are escaped separately, and tags, URLs and CSS values
 *    are validated rather than trusted.
 */

/** Tags the exporter is willing to emit. Anything else is dropped. */
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'a', 'button', 'img', 'div', 'section', 'header', 'footer',
  'nav', 'main', 'article', 'aside', 'ul', 'ol', 'li', 'form', 'input',
  'textarea', 'label', 'strong', 'em', 'small', 'br', 'hr', 'figure',
  'figcaption', 'blockquote',
]);

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr']);

/** Escapes text that will sit between tags. */
export function escapeHtmlText(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escapes a value going inside a double-quoted attribute.
 *
 * Kept separate from text escaping: an attribute additionally must not be able
 * to close its own quote, and text must not have to care about quotes.
 */
export function escapeHtmlAttribute(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns a safe href, or null when the URL must not be emitted.
 *
 * Internal page links are rewritten to the generated filename so a multi-page
 * export actually navigates; anything executable is refused outright.
 */
export function safeHref(
  raw: string | undefined,
  knownSlugs: string[],
  pageFilename: (slug: string) => string,
): string | null {
  const target = classifyLink(raw, knownSlugs);
  switch (target.kind) {
    case 'page':
      return target.hash
        ? `${pageFilename(target.slug)}#${target.hash}`
        : pageFilename(target.slug);
    case 'anchor':
      return `#${target.hash}`;
    case 'external':
    case 'protocol':
      return target.href;
    case 'none':
    default:
      // Covers javascript:, data:, unknown relative paths and empty hrefs.
      return null;
  }
}

/** CSS identifier safe for use in a selector. */
function cssEscapeIdent(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Rejects CSS values that could terminate the declaration or the block.
 *
 * Without this a crafted style value could close the rule and open a new one,
 * which is the stylesheet equivalent of unescaped markup.
 */
export function isSafeCssValue(value: unknown): boolean {
  const text = String(value);
  if (/[{}<>;]/.test(text)) return false;
  if (/@import|expression\s*\(|url\s*\(\s*["']?\s*javascript:/i.test(text)) return false;
  return true;
}

/** Drops unsafe declarations rather than emitting a broken stylesheet. */
function sanitiseStyles(styles: ElementStyles): ElementStyles {
  const out: ElementStyles = {};
  Object.entries(styles).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (!/^[a-zA-Z-]+$/.test(key)) return;
    if (!isSafeCssValue(value)) return;
    out[key] = value;
  });
  return out;
}

/** Base styles for a node: shared declarations plus the shared optical offset. */
function baseStylesFor(node: NodeElement): ElementStyles {
  const styles = { ...node.styles };
  const transform = composeTransform(
    styles.transform as string | undefined,
    resolveOpticalOffset(node, 'all'),
  );
  if (transform) styles.transform = transform;
  return sanitiseStyles(styles);
}

/**
 * Styles for one breakpoint: the scope's own overrides, plus a transform that
 * composes the document's own transform with the scope's optical offset.
 *
 * The transform is re-emitted whenever the scope has its own offset, because a
 * base `transform` would otherwise keep winning inside the media query.
 */
function scopeStylesFor(node: NodeElement, scope: Exclude<ResponsiveScope, 'all'>): ElementStyles {
  const overrides = node.responsiveOverrides?.[scope];
  const scopedOffset = node.opticalOffsets?.[scope];
  if (!overrides && !scopedOffset) return {};

  const styles: ElementStyles = { ...(overrides ?? {}) };
  if (scopedOffset) {
    const ownTransform =
      (styles.transform as string | undefined) ?? (node.styles.transform as string | undefined);
    const transform = composeTransform(ownTransform, scopedOffset);
    if (transform) styles.transform = transform;
  }
  return sanitiseStyles(styles);
}

interface CollectedRules {
  base: string[];
  byScope: Record<string, string[]>;
}

function collectRules(root: NodeElement): CollectedRules {
  const collected: CollectedRules = { base: [], byScope: {} };
  BREAKPOINTS.forEach((bp) => {
    collected.byScope[bp.scope] = [];
  });

  const walk = (node: NodeElement) => {
    if (!ALLOWED_TAGS.has(node.tag)) return;
    const selector = `#${cssEscapeIdent(node.id)}`;

    const base = stylesToCssText(baseStylesFor(node));
    if (base) collected.base.push(`${selector} { ${base} }`);

    BREAKPOINTS.forEach((bp) => {
      const scoped = stylesToCssText(scopeStylesFor(node, bp.scope));
      if (scoped) collected.byScope[bp.scope].push(`${selector} { ${scoped} }`);
    });

    node.children?.forEach(walk);
  };

  walk(root);
  return collected;
}

export interface ExportOptions {
  /** Slugs of every page in this project, for link classification. */
  knownSlugs: string[];
  /** Maps a slug to the file it was exported as. */
  pageFilename: (slug: string) => string;
  /** True when this file is one page of a multi-page bundle. */
  partOfBundle: boolean;
}

export function pageFilenameFor(slug: string): string {
  const safe = String(slug).replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safe || 'strona'}.html`;
}

function renderNodeHtml(node: NodeElement, options: ExportOptions): string {
  if (!ALLOWED_TAGS.has(node.tag)) return '';

  const idAttr = `id="${escapeHtmlAttribute(node.id)}"`;

  if (node.tag === 'img') {
    const src = safeHref(node.src, options.knownSlugs, options.pageFilename);
    if (!src) return '';
    return `<img ${idAttr} src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(node.alt ?? '')}" />`;
  }

  if (node.tag === 'input' || node.tag === 'textarea') {
    const placeholder = escapeHtmlAttribute(node.content || node.name);
    // Disabled on purpose: there is no backend, so an enabled field would
    // promise a submission that cannot happen.
    const common = `${idAttr} placeholder="${placeholder}" disabled aria-disabled="true"`;
    return node.tag === 'input' ? `<input ${common} />` : `<textarea ${common}></textarea>`;
  }

  if (VOID_TAGS.has(node.tag)) return `<${node.tag} ${idAttr} />`;

  const children = node.children?.length
    ? node.children.map((child) => renderNodeHtml(child, options)).join('\n')
    : escapeHtmlText(node.content ?? '');

  if (node.tag === 'a') {
    const href = safeHref(node.href, options.knownSlugs, options.pageFilename);
    // A link we refuse to emit still renders its text, as a span.
    if (!href) return `<span ${idAttr}>${children}</span>`;
    const external = /^https?:/i.test(href);
    const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
    return `<a ${idAttr} href="${escapeHtmlAttribute(href)}"${rel}>${children}</a>`;
  }

  if (node.tag === 'button') {
    return `<button ${idAttr} type="button">${children}</button>`;
  }

  if (node.tag === 'form') {
    // No action, nothing enabled inside: the form is visibly a demonstration.
    return `<form ${idAttr} onsubmit="return false">${children}</form>`;
  }

  return `<${node.tag} ${idAttr}>${children}</${node.tag}>`;
}

function buildStylesheet(root: NodeElement, tokens: DesignTokens): string {
  const rules = collectRules(root);

  const breakpointBlocks = BREAKPOINTS.map((bp) => {
    const body = rules.byScope[bp.scope];
    if (!body?.length) return '';
    return [
      `    /* ${bp.label} */`,
      `    @media ${bp.media} {`,
      body.map((rule) => `      ${rule}`).join('\n'),
      '    }',
    ].join('\n');
  })
    .filter(Boolean)
    .join('\n\n');

  return `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background-color: ${tokens.surfaceColor};
      color: ${tokens.textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    img { max-width: 100%; }
    [disabled] { cursor: not-allowed; }

    /* Shared rules — every screen size. */
${rules.base.map((rule) => `    ${rule}`).join('\n')}

${breakpointBlocks}

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    }`;
}

/**
 * Renders one page to a standalone HTML document.
 *
 * No Tailwind CDN, no editor runtime — the output depends on nothing.
 */
export function renderPageHtml(
  page: PageDocument,
  tokens: DesignTokens,
  options: ExportOptions,
): string {
  const body = renderNodeHtml(page.root, options);
  const stylesheet = buildStylesheet(page.root, tokens);

  const scopeNote = options.partOfBundle
    ? 'Część eksportu całej witryny — odnośniki prowadzą do pozostałych plików.'
    : `Eksport pojedynczej podstrony (${page.slug}). Odnośniki do innych podstron nie są dołączone.`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlText(page.title)}</title>
  <meta name="description" content="${escapeHtmlAttribute(page.description)}" />
  <!-- ${escapeHtmlText(scopeNote)} -->
  <!-- Formularze są demonstracyjne: brak backendu, pola są wyłączone. -->
  <style>${stylesheet}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export { breakpointFor };
