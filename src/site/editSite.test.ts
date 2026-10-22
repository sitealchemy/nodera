import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { importSite, type IncomingFile } from './importSite';
import {
  describeSelection,
  exportSite,
  overridesFor,
  setImage,
  setStyle,
  setText,
} from './editSite';
import { overridesToCss, renderSite } from './renderSite';
import { NODE_ID_ATTRIBUTE, SiteDocument } from './types';

const dom = new JSDOM('<!doctype html><html></html>');
const parseHtml = (html: string) => new JSDOM(html).window.document;
const serialise = (doc: Document) => `<!doctype html>\n${doc.documentElement.outerHTML}`;

// CSS.escape is used by the editing helpers; jsdom provides it on the window.
(globalThis as any).CSS = dom.window.CSS;

let realHtml: string;
let realCss: string;

beforeAll(() => {
  realHtml = readFileSync(new URL('../../e2e/fixtures/manus-real/index.html', import.meta.url), 'utf8');
  realCss = readFileSync(new URL('../../e2e/fixtures/manus-real/style.css', import.meta.url), 'utf8');
});

function build(): SiteDocument {
  const files: IncomingFile[] = [
    { path: 'index.html', contentType: 'text/html', text: realHtml },
    { path: 'style.css', contentType: 'text/css', text: realCss },
    ...[
      'hero-domek-w-lesie.jpg',
      'domek-w-lesie.jpg',
      'wnetrze-z-kominkiem.jpg',
      'sypialnia-w-zieleni.jpg',
      'dolny-slask-krajobraz.jpg',
    ].map((name) => ({
      path: `assets/images/${name}`,
      contentType: 'image/jpeg',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      bytes: 3,
    })),
  ];
  const result = importSite(files, parseHtml, serialise);
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

/** First element matching a selector, by its editing id. */
function idOf(site: SiteDocument, selector: string): string {
  const doc = parseHtml(site.html);
  const element = doc.querySelector(selector);
  if (!element) throw new Error(`nie znaleziono ${selector}`);
  return element.getAttribute(NODE_ID_ATTRIBUTE)!;
}

describe('describeSelection', () => {
  it('offers text editing only where there is nothing to destroy', () => {
    const site = build();
    const doc = parseHtml(site.html);

    const leaf = Array.from(doc.querySelectorAll('p')).find((p) => p.children.length === 0)!;
    const leafSelection = describeSelection(site, leaf.getAttribute(NODE_ID_ATTRIBUTE)!, parseHtml)!;
    expect(leafSelection.available).toContain('text');

    const nested = Array.from(doc.querySelectorAll('h1, h2, a')).find((el) => el.children.length > 0);
    if (nested) {
      const selection = describeSelection(site, nested.getAttribute(NODE_ID_ATTRIBUTE)!, parseHtml)!;
      // A heading with an <em> inside must not offer whole-text replacement.
      expect(selection.available).not.toContain('text');
      expect(selection.text).toBeNull();
    }
  });

  it('offers image editing on images', () => {
    const site = build();
    const selection = describeSelection(site, idOf(site, 'img'), parseHtml)!;
    expect(selection.available).toContain('image');
    expect(selection.image?.src).toMatch(/assets\/images\//);
  });

  it('returns null for an id that is not in the document', () => {
    expect(describeSelection(build(), 'nope', parseHtml)).toBeNull();
  });
});

describe('setText', () => {
  it('changes a leaf text and leaves every attribute in place', () => {
    const site = build();
    const doc = parseHtml(site.html);
    const leaf = Array.from(doc.querySelectorAll('p')).find((p) => p.children.length === 0)!;
    const nodeId = leaf.getAttribute(NODE_ID_ATTRIBUTE)!;
    const className = leaf.getAttribute('class');

    const next = setText(site, nodeId, 'Nowa treść akapitu', parseHtml, serialise)!;
    const after = parseHtml(next.html).querySelector(`[${NODE_ID_ATTRIBUTE}="${nodeId}"]`)!;

    expect(after.textContent).toBe('Nowa treść akapitu');
    expect(after.getAttribute('class')).toBe(className);
    // Nothing else in the document moved.
    expect(parseHtml(next.html).querySelectorAll('body *').length).toBe(
      doc.querySelectorAll('body *').length,
    );
  });

  // The regression this guards: replacing textContent on a formatted heading
  // silently deletes the <em> inside it.
  it('refuses an element that contains formatting', () => {
    const site = build();
    const doc = parseHtml(site.html);
    const nested = Array.from(doc.querySelectorAll('*')).find(
      (element) => element.children.length > 0 && (element.textContent ?? '').trim().length > 0,
    )!;
    const result = setText(site, nested.getAttribute(NODE_ID_ATTRIBUTE)!, 'x', parseHtml, serialise);
    expect(result).toBeNull();
  });
});

describe('setImage', () => {
  it('swaps the source and the alt text', () => {
    const site = build();
    const nodeId = idOf(site, 'img');
    const next = setImage(
      site,
      nodeId,
      { src: 'assets/images/sypialnia-w-zieleni.jpg', alt: 'Nowy opis' },
      parseHtml,
      serialise,
    )!;
    const after = parseHtml(next.html).querySelector(`[${NODE_ID_ATTRIBUTE}="${nodeId}"]`)!;
    expect(after.getAttribute('src')).toBe('assets/images/sypialnia-w-zieleni.jpg');
    expect(after.getAttribute('alt')).toBe('Nowy opis');
  });

  it('drops a srcset that pointed at the replaced image', () => {
    const site = build();
    const doc = parseHtml(site.html);
    const img = doc.querySelector('img')!;
    img.setAttribute('srcset', 'assets/images/domek-w-lesie.jpg 1x');
    const withSrcset: SiteDocument = { ...site, html: serialise(doc) };

    const next = setImage(
      withSrcset,
      img.getAttribute(NODE_ID_ATTRIBUTE)!,
      { src: 'assets/images/sypialnia-w-zieleni.jpg' },
      parseHtml,
      serialise,
    )!;
    const after = parseHtml(next.html).querySelector('img')!;
    expect(after.hasAttribute('srcset')).toBe(false);
  });

  it('refuses a non-image element', () => {
    const site = build();
    expect(setImage(site, idOf(site, 'p'), { alt: 'x' }, parseHtml, serialise)).toBeNull();
  });
});

describe('setStyle', () => {
  it('records an override without touching the original stylesheet', () => {
    const site = build();
    const nodeId = idOf(site, 'h1');
    const next = setStyle(site, nodeId, { color: '#b4532a', fontSize: '48px' });

    expect(overridesFor(next, nodeId)).toEqual({ color: '#b4532a', fontSize: '48px' });
    // The designer's CSS is byte-identical.
    expect(next.stylesheets[0].css).toBe(site.stylesheets[0].css);
  });

  it('merges further edits and clears a property with an empty value', () => {
    const site = build();
    const nodeId = idOf(site, 'h1');
    let next = setStyle(site, nodeId, { color: '#111111' });
    next = setStyle(next, nodeId, { fontSize: '40px' });
    expect(overridesFor(next, nodeId)).toEqual({ color: '#111111', fontSize: '40px' });

    next = setStyle(next, nodeId, { color: '' });
    expect(overridesFor(next, nodeId)).toEqual({ fontSize: '40px' });
  });

  it('drops the override entirely once nothing is left', () => {
    const site = build();
    const nodeId = idOf(site, 'h1');
    let next = setStyle(site, nodeId, { color: '#111111' });
    next = setStyle(next, nodeId, { color: '' });
    expect(next.overrides).toHaveLength(0);
  });
});

describe('overridesToCss', () => {
  it('emits a rule per element, in kebab-case', () => {
    const css = overridesToCss([
      { nodeId: 'n7', declarations: { color: '#fff', fontSize: '20px' } },
    ]);
    expect(css).toContain(`[${NODE_ID_ATTRIBUTE}="n7"]`);
    expect(css).toContain('color: #fff;');
    expect(css).toContain('font-size: 20px;');
  });

  it('refuses a value that could close the rule', () => {
    const css = overridesToCss([
      { nodeId: 'n1', declarations: { color: 'red; } body { display:none' } },
    ]);
    expect(css).not.toContain('display:none');
  });
});

describe('renderSite', () => {
  it('inlines the stylesheet and points images at local blobs', () => {
    const site = build();
    const rendered = renderSite(site, parseHtml, serialise);

    expect(rendered.html).not.toContain('<link rel="stylesheet" href="style.css"');
    expect(rendered.html).toContain('data-nodera-sheet="style.css"');
    expect(rendered.html).toContain('clamp(');
    expect(rendered.objectUrls.length).toBe(5);
    // Every local image now points at a blob we hold.
    const doc = parseHtml(rendered.html);
    Array.from(doc.querySelectorAll('img')).forEach((img) => {
      expect(img.getAttribute('src')).toMatch(/^blob:|^https?:/);
    });
  });

  it('leaves the external web font alone, so it still loads', () => {
    const rendered = renderSite(build(), parseHtml, serialise);
    expect(rendered.html).toMatch(/fonts\.googleapis\.com/);
  });

  it('appends user overrides after the original CSS', () => {
    const site = setStyle(build(), 'n5', { color: '#abcdef' });
    const rendered = renderSite(site, parseHtml, serialise);
    expect(rendered.html).toContain('data-nodera-overrides');
    expect(rendered.html.indexOf('data-nodera-sheet')).toBeLessThan(
      rendered.html.indexOf('data-nodera-overrides'),
    );
  });
});

describe('exportSite', () => {
  it('writes the entry, the stylesheet and every asset', () => {
    const files = exportSite(build(), parseHtml, serialise);
    const paths = files.map((file) => file.path);
    expect(paths).toContain('index.html');
    expect(paths).toContain('style.css');
    expect(paths.filter((p) => p.startsWith('assets/images/'))).toHaveLength(5);
  });

  it('strips the editing ids from the exported HTML', () => {
    const files = exportSite(build(), parseHtml, serialise);
    const html = files.find((file) => file.path === 'index.html')!.text!;
    expect(html).not.toContain(NODE_ID_ATTRIBUTE);
    // The page itself is otherwise intact.
    expect(html).toContain('Między');
  });

  it('carries user edits across as a separate stylesheet', () => {
    const site = setStyle(build(), 'n3', { color: '#b4532a' });
    const files = exportSite(site, parseHtml, serialise);
    const edits = files.find((file) => file.path === 'nodera-edits.css');
    expect(edits?.text).toContain('color: #b4532a;');

    const html = files.find((file) => file.path === 'index.html')!.text!;
    expect(html).toContain('nodera-edits.css');
    expect(html).toMatch(/nodera-edit-1/);
  });
});
