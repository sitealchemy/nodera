import { TreeEntry } from '../components/Editor/DrawerRail';
import { NODE_ID_ATTRIBUTE, SiteDocument } from './types';

/**
 * The structure of an imported page, as the editor's drawer shows it.
 *
 * Built from the stored document rather than from the live frame, so it is the
 * same source of truth the edits are written to, and it survives a save and a
 * reopen unchanged.
 */

/** Elements that carry no structure worth navigating. */
const SKIPPED = new Set(['script', 'style', 'link', 'meta', 'title', 'br', 'template']);

/**
 * A readable name for one element.
 *
 * Its own text first, because that is what the user recognises on the page;
 * then an image's alt text; then the first class, which is how a designer
 * names a region; and only then the tag, which the badge already shows.
 */
export function outlineLabel(element: Element): string {
  const tag = element.tagName.toLowerCase();

  if (tag === 'img') {
    const alt = element.getAttribute('alt')?.trim();
    return alt || 'Obraz';
  }

  const ownText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (ownText) return ownText.length > 40 ? `${ownText.slice(0, 37)}…` : ownText;

  const className = element.getAttribute('class')?.trim().split(/\s+/)[0];
  if (className) return className;

  return tag;
}

/** The whole page as a tree the drawer can render and select from. */
export function buildOutline(
  site: SiteDocument,
  parseHtml: (html: string) => Document,
): TreeEntry | null {
  const doc = parseHtml(site.html);
  const body = doc.body;
  if (!body) return null;

  const toEntry = (element: Element): TreeEntry | null => {
    const tag = element.tagName.toLowerCase();
    if (SKIPPED.has(tag)) return null;
    const id = element.getAttribute(NODE_ID_ATTRIBUTE);
    if (!id) return null;

    const children = Array.from(element.children)
      .map(toEntry)
      .filter((entry): entry is TreeEntry => entry !== null);

    return { id, tag, label: outlineLabel(element), children };
  };

  const children = Array.from(body.children)
    .map(toEntry)
    .filter((entry): entry is TreeEntry => entry !== null);

  return {
    id: body.getAttribute(NODE_ID_ATTRIBUTE) ?? 'body',
    tag: 'body',
    label: 'Strona',
    children,
  };
}

/** Finds one entry in an outline, for the overlay label and the inspector. */
export function findEntry(tree: TreeEntry | null, id: string | null): TreeEntry | null {
  if (!tree || !id) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children ?? []) {
    const found = findEntry(child, id);
    if (found) return found;
  }
  return null;
}
