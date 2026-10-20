/**
 * Classification of links inside a rendered document.
 *
 * Needed because the preview renders the page inside an iframe on the app's
 * own origin. An unhandled click on `/warsztaty` resolves against that origin
 * and loads **the Nodera editor itself** inside the frame — the app nested in
 * its own preview. Every link is therefore classified before it is acted on.
 */

export type LinkTarget =
  /** A page of this project, optionally with a fragment: `/warsztaty#cennik`. */
  | { kind: 'page'; slug: string; hash: string | null }
  /** A fragment on the current page: `#kolekcje`. */
  | { kind: 'anchor'; hash: string }
  /** Anything on another origin. */
  | { kind: 'external'; href: string }
  /** `mailto:` / `tel:` and similar user-agent handled schemes. */
  | { kind: 'protocol'; href: string; scheme: string }
  /** Empty, `#`, or otherwise nothing to do. */
  | { kind: 'none' };

/** Schemes handed to the user agent rather than navigated. */
const PASSTHROUGH_SCHEMES = new Set(['mailto:', 'tel:', 'sms:', 'callto:', 'facetime:']);

/** Normalises `/warsztaty`, `warsztaty/`, `./warsztaty` to `warsztaty`. */
export function normaliseSlug(path: string): string {
  return path.replace(/^\.?\/+/, '').replace(/\/+$/, '').trim();
}

/**
 * Classifies an href against the set of page slugs the project actually has.
 *
 * `knownSlugs` matters: without it there is no way to tell a project page from
 * an arbitrary absolute path, and guessing would be how an editor ends up
 * nested inside its own preview.
 */
export function classifyLink(rawHref: string | null | undefined, knownSlugs: string[]): LinkTarget {
  const href = (rawHref ?? '').trim();
  if (!href || href === '#') return { kind: 'none' };

  const schemeMatch = /^([a-z][a-z0-9+.-]*:)/i.exec(href);
  const scheme = schemeMatch?.[1]?.toLowerCase();

  if (scheme && PASSTHROUGH_SCHEMES.has(scheme)) {
    return { kind: 'protocol', href, scheme };
  }

  // Protocol-relative (//host/path) is external too.
  if (href.startsWith('//')) return { kind: 'external', href };

  if (scheme === 'http:' || scheme === 'https:') {
    return { kind: 'external', href };
  }

  // Any other explicit scheme (javascript:, data:, file:, …) is not navigated.
  if (scheme) return { kind: 'none' };

  if (href.startsWith('#')) {
    return { kind: 'anchor', hash: href.slice(1) };
  }

  const [pathPart, ...hashParts] = href.split('#');
  const hash = hashParts.length ? hashParts.join('#') : null;
  const slug = normaliseSlug(pathPart);

  if (!slug) {
    return hash ? { kind: 'anchor', hash } : { kind: 'none' };
  }

  if (knownSlugs.includes(slug)) {
    return { kind: 'page', slug, hash };
  }

  // A relative path that is not one of our pages. Navigating it would load the
  // app shell into the frame, so it is treated as inert rather than followed.
  return { kind: 'none' };
}

/** True when a click should be handled by the app rather than the browser. */
export function shouldInterceptLink(target: LinkTarget): boolean {
  return target.kind !== 'protocol';
}
