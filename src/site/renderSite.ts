import { NODE_ID_ATTRIBUTE, SiteDocument, SiteOverride } from './types';
import { cssReferences, resolvePath } from './importSite';

/**
 * Assembles a site document into one self-contained HTML string for the
 * preview frame.
 *
 * Assets become blob: URLs, so the page renders from local storage with no
 * network and no server. References are rewritten only in this rendered copy —
 * the stored document keeps its project-relative paths, which is what export
 * needs and what keeps a re-import comparable to the original.
 */

export interface RenderedSite {
  html: string;
  /** Blob URLs created for this render; revoke them when it is replaced. */
  objectUrls: string[];
}

const CSS_PROPERTY_PATTERN = /^[a-zA-Z-]+$/;

/** camelCase or kebab-case in, kebab-case out. */
function cssProperty(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * User edits, emitted as a stylesheet that comes after the originals.
 *
 * Appending rather than rewriting means the designer's CSS is untouched, the
 * cascade still resolves, and media queries keep working — which inline styles
 * copied from computedStyle would have destroyed.
 */
export function overridesToCss(overrides: SiteOverride[]): string {
  return overrides
    .map((override) => {
      const declarations = Object.entries(override.declarations)
        .filter(([property, value]) => CSS_PROPERTY_PATTERN.test(property) && !/[{}<>;]/.test(value))
        .map(([property, value]) => `  ${cssProperty(property)}: ${value};`)
        .join('\n');
      if (!declarations) return '';
      return `[${NODE_ID_ATTRIBUTE}="${CSS.escape(override.nodeId)}"] {\n${declarations}\n}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Rewrites url(...) references in CSS to the blob URLs we hold. */
function rewriteCssUrls(css: string, sheetPath: string, urlFor: (path: string) => string | null): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote, reference: string) => {
    const trimmed = reference.trim();
    if (/^[a-z]+:|^\/\/|^data:|^#/i.test(trimmed)) return match;
    const resolved = urlFor(resolvePath(sheetPath, trimmed));
    return resolved ? `url("${resolved}")` : match;
  });
}

/**
 * Builds the preview document.
 *
 * `parseHtml`/`serialise` are injected so this is testable without a DOM.
 */
export function renderSite(
  site: SiteDocument,
  parseHtml: (html: string) => Document,
  serialise: (doc: Document) => string,
): RenderedSite {
  const objectUrls: string[] = [];
  const byPath = new Map<string, string>();

  site.assets.forEach((asset) => {
    const url = URL.createObjectURL(asset.blob);
    objectUrls.push(url);
    byPath.set(asset.path, url);
  });
  const urlFor = (path: string) => byPath.get(path) ?? null;

  const doc = parseHtml(site.html);

  // Stylesheets: replace each <link> with the actual CSS, so the frame needs
  // no network and the order of the original cascade is preserved.
  Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (/^[a-z]+:|^\/\//i.test(href)) return; // external, e.g. web fonts — left alone
    const target = resolvePath(site.entry, href);
    const sheet = site.stylesheets.find((candidate) => candidate.path === target);
    if (!sheet) return;
    const style = doc.createElement('style');
    style.setAttribute('data-nodera-sheet', sheet.path);
    style.textContent = rewriteCssUrls(sheet.css, sheet.path, urlFor);
    link.replaceWith(style);
  });

  // Inline <style> blocks can carry url() too.
  Array.from(doc.querySelectorAll('style')).forEach((style) => {
    if (style.hasAttribute('data-nodera-sheet')) return;
    style.textContent = rewriteCssUrls(style.textContent ?? '', site.entry, urlFor);
  });

  // Images and media.
  Array.from(doc.querySelectorAll('[src], [poster], [srcset]')).forEach((element) => {
    (['src', 'poster'] as const).forEach((attribute) => {
      const raw = element.getAttribute(attribute);
      if (!raw || /^[a-z]+:|^\/\/|^data:/i.test(raw)) return;
      const url = urlFor(resolvePath(site.entry, raw));
      if (url) element.setAttribute(attribute, url);
    });

    const srcset = element.getAttribute('srcset');
    if (srcset) {
      const rewritten = srcset
        .split(',')
        .map((candidate) => {
          const [reference, ...rest] = candidate.trim().split(/\s+/);
          if (!reference || /^[a-z]+:|^\/\/|^data:/i.test(reference)) return candidate.trim();
          const url = urlFor(resolvePath(site.entry, reference));
          return [url ?? reference, ...rest].join(' ');
        })
        .join(', ');
      element.setAttribute('srcset', rewritten);
    }
  });

  // User edits last, so they win over the original rules at equal specificity.
  const overrideCss = overridesToCss(site.overrides);
  if (overrideCss) {
    const style = doc.createElement('style');
    style.setAttribute('data-nodera-overrides', '');
    style.textContent = overrideCss;
    doc.head.appendChild(style);
  }

  // Reduced motion, and a guard so the preview cannot scroll sideways in a
  // way the original would not.
  const base = doc.createElement('style');
  base.setAttribute('data-nodera-base', '');
  base.textContent = `
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    }`;
  doc.head.appendChild(base);

  return { html: serialise(doc), objectUrls };
}

/** Frees blob URLs from a previous render. */
export function releaseRender(rendered: RenderedSite | null): void {
  rendered?.objectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already revoked */
    }
  });
}

/** Reads every asset reference the stored document makes, for diagnostics. */
export function referencedAssetPaths(site: SiteDocument, parseHtml: (html: string) => Document): string[] {
  const doc = parseHtml(site.html);
  const out = new Set<string>();

  Array.from(doc.querySelectorAll('[src], [poster]')).forEach((element) => {
    const raw = element.getAttribute('src') ?? element.getAttribute('poster') ?? '';
    if (raw && !/^[a-z]+:|^\/\/|^data:/i.test(raw)) out.add(resolvePath(site.entry, raw));
  });
  site.stylesheets.forEach((sheet) => {
    cssReferences(sheet.css).forEach((reference) => {
      if (!/^[a-z]+:|^\/\/|^data:/i.test(reference)) out.add(resolvePath(sheet.path, reference));
    });
  });

  return [...out];
}
