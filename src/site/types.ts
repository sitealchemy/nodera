/**
 * A site document: the page as Manus actually built it.
 *
 * The existing NodeElement model describes a page as a tree of elements the
 * editor knows how to lay out. That is the right model for a document Nodera
 * composes, and the wrong one for a document someone else designed: squeezing
 * hand-written CSS — custom properties, clamp(), grid, pseudo-elements — into
 * a fixed set of section templates loses exactly the quality we are trying to
 * keep.
 *
 * So a generated site is stored as what it is: source HTML, its stylesheets
 * and its assets. The editor renders that, and edits are written back into it.
 * Projects made the old way keep using the old model; the two coexist.
 */

export const SITE_DOCUMENT_VERSION = 1;

/** Which technology the delivered project turned out to use. */
export type SiteStack =
  /** Plain HTML and CSS, no build step and no scripts. Fully supported. */
  | 'static-html-css'
  /** HTML and CSS, but the page also ships JavaScript. Rendered without it. */
  | 'static-html-js'
  /** Something we recognise but cannot render faithfully (JSX, a framework). */
  | 'unsupported';

export interface SiteAsset {
  /** Project-relative path, exactly as the HTML and CSS refer to it. */
  path: string;
  contentType: string;
  /** Stored as a Blob: IndexedDB keeps these without base64 inflation. */
  blob: Blob;
  bytes: number;
}

export interface SiteStylesheet {
  path: string;
  css: string;
}

/** What the import did and did not manage, kept for the user to read. */
export interface ConversionReport {
  stack: SiteStack;
  entry: string;
  /** Files received, by path. */
  files: string[];
  /** Assets stored locally, by path. */
  assets: string[];
  /** Asset references in HTML or CSS that could not be resolved. */
  missingAssets: string[];
  /** Scripts found in the source. Reported rather than silently dropped. */
  scriptsRemoved: number;
  /** External URLs the page still depends on, e.g. web fonts. */
  externalReferences: string[];
  /** Anything the import could not carry over. */
  limitations: string[];
  importedAt: number;
}

export interface SiteDocument {
  kind: 'site';
  schemaVersion: number;
  /** Entry file path, e.g. "index.html". */
  entry: string;
  /** Editable HTML: the original, with stable ids added. */
  html: string;
  stylesheets: SiteStylesheet[];
  assets: SiteAsset[];
  /**
   * Edits the user has made, as a stylesheet appended after the originals.
   *
   * Keeping them separate means the designer's CSS is never rewritten, the
   * cascade and media queries still work, and an edit can be undone by
   * removing a rule rather than by reconstructing the original declaration.
   */
  overrides: SiteOverride[];
  report: ConversionReport;
}

/** One user edit, addressed by the stable id carried in the HTML. */
export interface SiteOverride {
  nodeId: string;
  /** CSS declarations, camelCase, applied to `[data-nodera-id="..."]`. */
  declarations: Record<string, string>;
}

/** The original delivery, kept untouched so a re-import can start over. */
export interface SiteOriginal {
  taskId: string;
  files: { path: string; contentType: string; text?: string; blob?: Blob }[];
  /**
   * True when every file the task reported was downloaded.
   *
   * A partial delivery is kept for diagnosis but must never be converted: an
   * import that happens to find the HTML would produce a page with its
   * stylesheet missing and call it a success.
   */
  complete: boolean;
  fetchedAt: number;
}

export const NODE_ID_ATTRIBUTE = 'data-nodera-id';

export function isSiteDocument(value: unknown): value is SiteDocument {
  return !!value && typeof value === 'object' && (value as SiteDocument).kind === 'site';
}
