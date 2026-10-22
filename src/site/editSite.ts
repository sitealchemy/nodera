import { NODE_ID_ATTRIBUTE, SiteDocument, SiteOverride } from './types';

/**
 * Edits applied to a site document.
 *
 * Every function returns a new document. Nothing mutates the iframe DOM as the
 * source of truth: the frame is a view, the document is the record, and the
 * two are re-synchronised by re-rendering. That is what makes an edit survive
 * a save, a reload and an export.
 */

export type SiteEditKind = 'text' | 'image' | 'style';

export interface SiteSelection {
  nodeId: string;
  tagName: string;
  /** Text the element owns directly, when it has no element children. */
  text: string | null;
  /** Present for images. */
  image: { src: string; alt: string } | null;
  /** Which edits make sense here. Anything absent is not offered in the UI. */
  available: SiteEditKind[];
}

/** Properties the inspector may set. Deliberately small and predictable. */
export const EDITABLE_PROPERTIES = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'padding',
  'margin',
  'textAlign',
  'borderRadius',
] as const;

export type EditableProperty = (typeof EDITABLE_PROPERTIES)[number];

function parse(html: string, parseHtml: (html: string) => Document): Document {
  return parseHtml(html);
}

function find(doc: Document, nodeId: string): Element | null {
  return doc.querySelector(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(nodeId)}"]`);
}

/**
 * Describes what can be done with the selected element.
 *
 * Text editing is offered only when the element has no element children, so a
 * heading containing <em> is not flattened by replacing its text. That is a
 * real limitation, and the UI says so rather than offering a control that
 * quietly destroys formatting.
 */
export function describeSelection(
  site: SiteDocument,
  nodeId: string,
  parseHtml: (html: string) => Document,
): SiteSelection | null {
  const doc = parse(site.html, parseHtml);
  const element = find(doc, nodeId);
  if (!element) return null;

  const tagName = element.tagName.toLowerCase();
  const hasElementChildren = element.children.length > 0;
  const available: SiteEditKind[] = ['style'];

  let text: string | null = null;
  if (!hasElementChildren) {
    text = element.textContent ?? '';
    available.unshift('text');
  }

  let image: SiteSelection['image'] = null;
  if (tagName === 'img') {
    image = {
      src: element.getAttribute('src') ?? '',
      alt: element.getAttribute('alt') ?? '',
    };
    available.unshift('image');
  }

  return { nodeId, tagName, text, image, available };
}

/** Replaces the text of a leaf element, leaving every attribute in place. */
export function setText(
  site: SiteDocument,
  nodeId: string,
  text: string,
  parseHtml: (html: string) => Document,
  serialise: (doc: Document) => string,
): SiteDocument | null {
  const doc = parse(site.html, parseHtml);
  const element = find(doc, nodeId);
  if (!element) return null;
  // Refuse rather than flatten: an element with children would lose its
  // nested <em>, <span> and <br> if its text were replaced wholesale.
  if (element.children.length > 0) return null;

  element.textContent = text;
  return { ...site, html: serialise(doc) };
}

/** Points an image at another stored asset, and updates its alt text. */
export function setImage(
  site: SiteDocument,
  nodeId: string,
  next: { src?: string; alt?: string },
  parseHtml: (html: string) => Document,
  serialise: (doc: Document) => string,
): SiteDocument | null {
  const doc = parse(site.html, parseHtml);
  const element = find(doc, nodeId);
  if (!element || element.tagName.toLowerCase() !== 'img') return null;

  if (next.src !== undefined) {
    element.setAttribute('src', next.src);
    // A changed source invalidates a srcset that pointed at the old image.
    element.removeAttribute('srcset');
  }
  if (next.alt !== undefined) element.setAttribute('alt', next.alt);

  return { ...site, html: serialise(doc) };
}

/**
 * Sets or clears style declarations for an element.
 *
 * Stored as an override rule rather than an inline style, so the original
 * stylesheet is never rewritten and responsive rules keep applying wherever
 * the user has not overridden them.
 */
export function setStyle(
  site: SiteDocument,
  nodeId: string,
  declarations: Record<string, string>,
): SiteDocument {
  const existing = site.overrides.find((override) => override.nodeId === nodeId);
  const merged: Record<string, string> = { ...(existing?.declarations ?? {}) };

  Object.entries(declarations).forEach(([property, value]) => {
    if (value === '') delete merged[property];
    else merged[property] = value;
  });

  const others = site.overrides.filter((override) => override.nodeId !== nodeId);
  const overrides: SiteOverride[] =
    Object.keys(merged).length > 0 ? [...others, { nodeId, declarations: merged }] : others;

  return { ...site, overrides };
}

/** The declarations currently overridden for an element. */
export function overridesFor(site: SiteDocument, nodeId: string): Record<string, string> {
  return site.overrides.find((override) => override.nodeId === nodeId)?.declarations ?? {};
}

/** A readable name for the selection, for the overlay label. */
export function labelFor(selection: SiteSelection): string {
  if (selection.image) return 'Obraz';
  if (selection.text !== null) {
    const trimmed = selection.text.trim();
    if (trimmed) return trimmed.length > 36 ? `${trimmed.slice(0, 33)}…` : trimmed;
  }
  return selection.tagName.toUpperCase();
}

/**
 * Files for export: the entry document with its own paths restored, the
 * stylesheets, the user's overrides as a separate sheet, and every asset.
 */
export function exportSite(
  site: SiteDocument,
  parseHtml: (html: string) => Document,
  serialise: (doc: Document) => string,
): { path: string; text?: string; blob?: Blob }[] {
  const doc = parse(site.html, parseHtml);

  // The editing ids are an editor concern; they do not belong in the output.
  doc.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(NODE_ID_ATTRIBUTE);
  });

  const out: { path: string; text?: string; blob?: Blob }[] = [];

  if (site.overrides.length > 0) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', 'nodera-edits.css');
    doc.head.appendChild(link);
    // Overrides are keyed by the editing id, which has just been removed, so
    // they are re-keyed onto a class added to the same elements.
    out.push({ path: 'nodera-edits.css', text: exportOverrideCss(site, parseHtml, doc) });
  }

  out.unshift({ path: site.entry, text: serialise(doc) });
  site.stylesheets.forEach((sheet) => out.push({ path: sheet.path, text: sheet.css }));
  site.assets.forEach((asset) => out.push({ path: asset.path, blob: asset.blob }));
  return out;
}

/**
 * Re-keys overrides for export.
 *
 * The exported HTML has no editing ids, so each overridden element gets a
 * stable class instead and the rules are written against that.
 */
function exportOverrideCss(
  site: SiteDocument,
  parseHtml: (html: string) => Document,
  exportDoc: Document,
): string {
  const source = parse(site.html, parseHtml);
  const blocks: string[] = [];

  site.overrides.forEach((override, index) => {
    const element = source.querySelector(
      `[${NODE_ID_ATTRIBUTE}="${CSS.escape(override.nodeId)}"]`,
    );
    if (!element) return;

    // Find the same element in the export copy by document position.
    const all = Array.from(source.querySelectorAll('*'));
    const position = all.indexOf(element);
    const target = Array.from(exportDoc.querySelectorAll('*'))[position];
    if (!target) return;

    const className = `nodera-edit-${index + 1}`;
    target.classList.add(className);

    const declarations = Object.entries(override.declarations)
      .map(([property, value]) => `  ${property.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}: ${value};`)
      .join('\n');
    blocks.push(`.${className} {\n${declarations}\n}`);
  });

  return `/* Zmiany wprowadzone w Noderze */\n\n${blocks.join('\n\n')}\n`;
}
