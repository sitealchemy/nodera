import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { importSite } from './importSite';
import { buildOutline, findEntry, outlineLabel } from './outline';
import { NODE_ID_ATTRIBUTE, SiteDocument } from './types';

/**
 * The structure drawer, against the page Manus actually delivered.
 *
 * The outline is what makes a generated page navigable in the editor, so it
 * is held to the real document rather than to a hand-written sample that
 * would quietly stop resembling one.
 */

const FIXTURE = resolve(import.meta.dirname, '../../e2e/fixtures/manus-real');
const parseHtml = (html: string): Document => new JSDOM(html).window.document;
const serialise = (doc: Document): string => `<!doctype html>\n${doc.documentElement.outerHTML}`;

function realSite(): SiteDocument {
  const result = importSite(
    [
      {
        path: '/home/ubuntu/miedzy-drzewami/index.html',
        contentType: 'text/html',
        text: readFileSync(resolve(FIXTURE, 'index.html'), 'utf8'),
      },
      {
        path: '/home/ubuntu/miedzy-drzewami/style.css',
        contentType: 'text/css',
        text: readFileSync(resolve(FIXTURE, 'style.css'), 'utf8'),
      },
    ],
    parseHtml,
    serialise,
  );
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

const flatten = (entry: ReturnType<typeof buildOutline>): string[] =>
  entry ? [entry.id, ...(entry.children ?? []).flatMap(flatten)] : [];

describe('buildOutline', () => {
  const site = realSite();
  const outline = buildOutline(site, parseHtml);

  it('starts at the body and names it for a person, not a tag', () => {
    expect(outline?.tag).toBe('body');
    expect(outline?.label).toBe('Strona');
  });

  it('covers the page the designer built', () => {
    const ids = flatten(outline);
    // The real page is substantial; an outline of a handful of nodes would
    // mean the walk stopped early.
    expect(ids.length).toBeGreaterThan(100);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry addresses a real element in the stored document', () => {
    const doc = parseHtml(site.html);
    for (const id of flatten(outline).slice(1)) {
      expect(doc.querySelector(`[${NODE_ID_ATTRIBUTE}="${id}"]`), id).not.toBeNull();
    }
  });

  it('leaves out what is not structure', () => {
    const doc = parseHtml(site.html);
    const ids = new Set(flatten(outline));
    doc.querySelectorAll('style, script, br').forEach((element) => {
      const id = element.getAttribute(NODE_ID_ATTRIBUTE);
      if (id) expect(ids.has(id)).toBe(false);
    });
  });

  it('keeps the document order the designer wrote', () => {
    const doc = parseHtml(site.html);
    const ids = flatten(outline).slice(1);
    const positions = ids.map((id) =>
      Array.from(doc.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`)).findIndex(
        (element) => element.getAttribute(NODE_ID_ATTRIBUTE) === id,
      ),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('finds an entry by id, and reports a miss honestly', () => {
    const someId = flatten(outline)[5];
    expect(findEntry(outline, someId)?.id).toBe(someId);
    expect(findEntry(outline, 'nie-ma-takiego')).toBeNull();
    expect(findEntry(outline, null)).toBeNull();
  });
});

describe('outlineLabel', () => {
  const label = (html: string): string => {
    const doc = parseHtml(`<body>${html}</body>`);
    return outlineLabel(doc.body.firstElementChild!);
  };

  it('prefers the text the user can see on the page', () => {
    expect(label('<h1 class="hero__title">Zostań wśród drzew</h1>')).toBe('Zostań wśród drzew');
  });

  it('ignores text that belongs to a child, not to the element', () => {
    // The child has its own entry; repeating its text would make the tree
    // look like two copies of the same thing.
    expect(label('<section class="hero"><p>Treść dziecka</p></section>')).toBe('hero');
  });

  it('names an image by its alt text, and says so when there is none', () => {
    expect(label('<img src="a.png" alt="Domek w lesie">')).toBe('Domek w lesie');
    expect(label('<img src="a.png" alt="">')).toBe('Obraz');
  });

  it('falls back to the first class, then to the tag', () => {
    expect(label('<div class="shell header__inner"></div>')).toBe('shell');
    expect(label('<div></div>')).toBe('div');
  });

  it('shortens a long line rather than letting it stretch the drawer', () => {
    const long = label(`<p>${'bardzo długie zdanie '.repeat(10)}</p>`);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
  });
});
