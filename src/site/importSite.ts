import {
  ConversionReport,
  NODE_ID_ATTRIBUTE,
  SITE_DOCUMENT_VERSION,
  SiteAsset,
  SiteDocument,
  SiteStack,
  SiteStylesheet,
} from './types';

/**
 * Turns the files Manus delivered into an editable site document.
 *
 * Deterministic: no model is involved. The HTML is parsed, given stable ids
 * and kept; the CSS is kept verbatim; the assets are kept as blobs. Nothing is
 * rewritten into Tailwind classes, because the delivered CSS leans on custom
 * properties, clamp() and grid, and restating that as utilities would cost
 * fidelity for no gain.
 */

export interface IncomingFile {
  /** Path as delivered, possibly absolute (e.g. /home/ubuntu/project/index.html). */
  path: string;
  contentType: string;
  text?: string;
  blob?: Blob;
  bytes?: number;
}

/**
 * Strips the common leading directory from delivered paths.
 *
 * Manus reports attachment paths inside its own sandbox, so every file shares
 * a prefix like `/home/ubuntu/miedzy-drzewami/`. Removing it restores the
 * project-relative paths the HTML and CSS actually use.
 */
export function stripCommonRoot(paths: string[]): (path: string) => string {
  const normalised = paths.map((p) => p.replace(/\\/g, '/').replace(/^\/+/, ''));
  if (normalised.length === 0) return (p) => p;

  const split = normalised.map((p) => p.split('/'));
  const prefix: string[] = [];
  for (let depth = 0; ; depth += 1) {
    const segment = split[0][depth];
    // Never consume the last segment: that is the filename.
    if (segment === undefined) break;
    if (!split.every((parts) => parts.length > depth + 1 && parts[depth] === segment)) break;
    prefix.push(segment);
  }

  return (path: string) => {
    const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = clean.split('/');
    return parts.slice(prefix.length).join('/') || clean;
  };
}

/** Picks the entry document: the shallowest .html, preferring index.html. */
export function pickEntry(paths: string[]): string | null {
  const html = paths.filter((p) => /\.html?$/i.test(p));
  if (html.length === 0) return null;
  return html.sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length;
    if (depth !== 0) return depth;
    const aIndex = /(^|\/)index\.html?$/i.test(a) ? 0 : 1;
    const bIndex = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.localeCompare(b);
  })[0];
}

/**
 * Classifies the delivered project.
 *
 * Reported honestly rather than assumed: a page that needs JavaScript to
 * render is not the same thing as one that does not, and saying so is the
 * difference between a known limitation and a silently broken import.
 */
export function detectStack(entryHtml: string, paths: string[]): SiteStack {
  if (paths.some((p) => /\.(jsx|tsx)$/i.test(p))) return 'unsupported';
  if (/\bdata-reactroot\b|__NEXT_DATA__/.test(entryHtml)) return 'unsupported';

  const scripts = entryHtml.match(/<script\b[^>]*>/gi) ?? [];
  const meaningful = scripts.filter((tag) => !/type=["']application\/ld\+json["']/i.test(tag));
  return meaningful.length > 0 ? 'static-html-js' : 'static-html-css';
}

/** Resolves a relative reference against the directory of the file holding it. */
export function resolvePath(fromFile: string, reference: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//')) return reference;
  const base = fromFile.split('/').slice(0, -1);
  const parts = reference.replace(/^\.\//, '').split('/');
  const out = [...base];
  parts.forEach((part) => {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  });
  return out.join('/');
}

/** Every asset reference in a stylesheet, as written. */
export function cssReferences(css: string): string[] {
  const out: string[] = [];
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) out.push(match[2].trim());
  return out;
}

const ID_PREFIX = 'n';

/**
 * Adds a stable id to every element, in document order.
 *
 * No wrappers: the attribute goes on the elements that are already there, so
 * layout is untouched. Ids are positional and deterministic, so re-importing
 * the same HTML yields the same ids and a saved selection still resolves.
 */
export function addStableIds(doc: Document): number {
  let counter = 0;
  doc.querySelectorAll('*').forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'html' || tag === 'head' || tag === 'meta' || tag === 'title' || tag === 'link')
      return;
    if (tag === 'script' || tag === 'style') return;
    counter += 1;
    element.setAttribute(NODE_ID_ATTRIBUTE, `${ID_PREFIX}${counter}`);
  });
  return counter;
}

export interface ImportResult {
  ok: true;
  document: SiteDocument;
}

export interface ImportFailure {
  ok: false;
  reason: string;
  /** What we did receive, so a failure can be diagnosed rather than guessed at. */
  files: string[];
}

/**
 * Builds a site document from delivered files.
 *
 * `parseHtml` is injected so this module stays testable outside a browser.
 */
export function importSite(
  incoming: IncomingFile[],
  parseHtml: (html: string) => Document,
  serialiseHtml: (doc: Document) => string,
): ImportResult | ImportFailure {
  if (incoming.length === 0) {
    return { ok: false, reason: 'Zadanie nie zwróciło żadnych plików.', files: [] };
  }

  const strip = stripCommonRoot(incoming.map((file) => file.path));
  const files = incoming.map((file) => ({ ...file, path: strip(file.path) }));
  const paths = files.map((file) => file.path);

  const entry = pickEntry(paths);
  if (!entry) {
    return {
      ok: false,
      reason: 'Wśród zwróconych plików nie ma dokumentu HTML.',
      files: paths,
    };
  }

  const entryFile = files.find((file) => file.path === entry)!;
  const entryHtml = entryFile.text ?? '';
  if (!entryHtml.trim()) {
    return { ok: false, reason: `Plik ${entry} jest pusty.`, files: paths };
  }

  const stack = detectStack(entryHtml, paths);
  const limitations: string[] = [];
  const externalReferences: string[] = [];

  const doc = parseHtml(entryHtml);

  // Scripts are removed from the editable copy. The original keeps them, and
  // the report says how many were dropped — a page that needed them to render
  // must not be presented as faithfully imported.
  const scripts = Array.from(doc.querySelectorAll('script'));
  scripts.forEach((script) => script.remove());
  if (scripts.length > 0) {
    limitations.push(
      `Usunięto ${scripts.length} skrypt(ów). Zachowania zależne od JavaScriptu nie działają w edytorze.`,
    );
  }

  addStableIds(doc);

  // Stylesheets referenced by the entry document, in order.
  const stylesheets: SiteStylesheet[] = [];
  const missingAssets: string[] = [];

  Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (!href) return;
    if (/^[a-z]+:|^\/\//i.test(href)) {
      externalReferences.push(href);
      return;
    }
    const target = resolvePath(entry, href);
    const file = files.find((candidate) => candidate.path === target);
    if (file?.text !== undefined) {
      stylesheets.push({ path: target, css: file.text });
    } else {
      missingAssets.push(target);
    }
  });

  // Inline <style> blocks are kept where they are, inside the HTML.

  // Everything that is not HTML or CSS is an asset.
  const assets: SiteAsset[] = [];
  files.forEach((file) => {
    if (file.path === entry) return;
    if (stylesheets.some((sheet) => sheet.path === file.path)) return;
    if (/\.(md|txt)$/i.test(file.path)) return; // documentation, not part of the page
    if (!file.blob) return;
    assets.push({
      path: file.path,
      contentType: file.contentType,
      blob: file.blob,
      bytes: file.bytes ?? file.blob.size,
    });
  });

  // Check that every reference actually resolves to something we hold.
  const assetPaths = new Set(assets.map((asset) => asset.path));
  Array.from(doc.querySelectorAll('img[src], source[src], video[poster]')).forEach((element) => {
    const raw =
      element.getAttribute('src') ?? element.getAttribute('poster') ?? '';
    if (!raw) return;
    if (/^[a-z]+:|^\/\//i.test(raw)) {
      externalReferences.push(raw);
      return;
    }
    const target = resolvePath(entry, raw);
    if (!assetPaths.has(target)) missingAssets.push(target);
  });

  stylesheets.forEach((sheet) => {
    cssReferences(sheet.css).forEach((reference) => {
      if (/^[a-z]+:|^\/\/|^data:/i.test(reference)) {
        externalReferences.push(reference);
        return;
      }
      const target = resolvePath(sheet.path, reference);
      if (!assetPaths.has(target)) missingAssets.push(target);
    });
  });

  if (stack === 'static-html-js') {
    limitations.push('Strona zawierała JavaScript — edytor pokazuje ją bez niego.');
  }
  if (stack === 'unsupported') {
    limitations.push('Rozpoznano stos, którego nie potrafię wiernie odwzorować.');
  }
  if (externalReferences.length > 0) {
    limitations.push(
      `Strona korzysta z ${new Set(externalReferences).size} zasobów zewnętrznych (np. fontów) — wymagają połączenia z siecią.`,
    );
  }

  const report: ConversionReport = {
    stack,
    entry,
    files: paths,
    assets: assets.map((asset) => asset.path),
    missingAssets: [...new Set(missingAssets)],
    scriptsRemoved: scripts.length,
    externalReferences: [...new Set(externalReferences)],
    limitations,
    importedAt: Date.now(),
  };

  return {
    ok: true,
    document: {
      kind: 'site',
      schemaVersion: SITE_DOCUMENT_VERSION,
      entry,
      html: serialiseHtml(doc),
      stylesheets,
      assets,
      overrides: [],
      report,
    },
  };
}
