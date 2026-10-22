import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addStableIds,
  cssReferences,
  detectStack,
  importSite,
  pickEntry,
  resolvePath,
  stripCommonRoot,
  type IncomingFile,
} from './importSite';
import { NODE_ID_ATTRIBUTE } from './types';

/**
 * Exercised against the page a real Manus task produced
 * (task HJwyF7zLZkWAGSV3Hu7RV2, the "Między Drzewami" brief), so the importer
 * is tested on the kind of output it will actually meet rather than on a
 * document written to suit it.
 */

const parseHtml = (html: string) => new JSDOM(html).window.document;
const serialise = (doc: Document) =>
  `<!doctype html>\n${doc.documentElement.outerHTML}`;

let realHtml: string;
let realCss: string;

beforeAll(() => {
  realHtml = readFileSync(new URL('../../e2e/fixtures/manus-real/index.html', import.meta.url), 'utf8');
  realCss = readFileSync(new URL('../../e2e/fixtures/manus-real/style.css', import.meta.url), 'utf8');
});

/** The delivery, as the API reports it: sandbox-absolute paths. */
function realDelivery(): IncomingFile[] {
  const images = [
    'hero-domek-w-lesie.jpg',
    'domek-w-lesie.jpg',
    'wnetrze-z-kominkiem.jpg',
    'sypialnia-w-zieleni.jpg',
    'dolny-slask-krajobraz.jpg',
  ];
  return [
    { path: '/home/ubuntu/miedzy-drzewami/index.html', contentType: 'text/html', text: realHtml },
    { path: '/home/ubuntu/miedzy-drzewami/style.css', contentType: 'text/css', text: realCss },
    { path: '/home/ubuntu/miedzy-drzewami/README.md', contentType: 'text/markdown', text: '# x' },
    ...images.map((name) => ({
      path: `/home/ubuntu/miedzy-drzewami/assets/images/${name}`,
      contentType: 'image/jpeg',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      bytes: 3,
    })),
  ];
}

describe('stripCommonRoot', () => {
  it('removes the sandbox prefix the API reports', () => {
    const strip = stripCommonRoot([
      '/home/ubuntu/site/index.html',
      '/home/ubuntu/site/style.css',
      '/home/ubuntu/site/assets/images/a.jpg',
    ]);
    expect(strip('/home/ubuntu/site/index.html')).toBe('index.html');
    expect(strip('/home/ubuntu/site/assets/images/a.jpg')).toBe('assets/images/a.jpg');
  });

  it('never swallows the filename when there is a single file', () => {
    const strip = stripCommonRoot(['/home/ubuntu/site/index.html']);
    expect(strip('/home/ubuntu/site/index.html')).toBe('index.html');
  });

  it('leaves already-relative paths alone', () => {
    const strip = stripCommonRoot(['index.html', 'style.css']);
    expect(strip('index.html')).toBe('index.html');
  });
});

describe('pickEntry', () => {
  it('prefers index.html at the shallowest level', () => {
    expect(pickEntry(['docs/page.html', 'index.html', 'about.html'])).toBe('index.html');
    expect(pickEntry(['site/index.html', 'site/deep/index.html'])).toBe('site/index.html');
  });

  it('returns null when there is no HTML at all', () => {
    expect(pickEntry(['style.css', 'a.jpg'])).toBeNull();
  });
});

describe('detectStack', () => {
  it('recognises plain HTML and CSS', () => {
    expect(detectStack('<html><body><p>x</p></body></html>', ['index.html'])).toBe('static-html-css');
  });

  it('recognises a page that ships JavaScript', () => {
    expect(detectStack('<html><body><script src="a.js"></script></body></html>', [])).toBe(
      'static-html-js',
    );
  });

  it('does not count structured-data blocks as scripts', () => {
    expect(
      detectStack('<script type="application/ld+json">{}</script>', ['index.html']),
    ).toBe('static-html-css');
  });

  it('refuses a JSX or framework build rather than pretending', () => {
    expect(detectStack('<div></div>', ['src/App.jsx'])).toBe('unsupported');
    expect(detectStack('<div id="__next"></div><script>__NEXT_DATA__={}</script>', [])).toBe(
      'unsupported',
    );
  });
});

describe('resolvePath and cssReferences', () => {
  it('resolves relative references against the referring file', () => {
    expect(resolvePath('index.html', 'assets/a.jpg')).toBe('assets/a.jpg');
    expect(resolvePath('css/style.css', '../assets/a.jpg')).toBe('assets/a.jpg');
    expect(resolvePath('css/style.css', './fonts/f.woff2')).toBe('css/fonts/f.woff2');
    expect(resolvePath('index.html', 'https://x/y.png')).toBe('https://x/y.png');
  });

  it('finds url() references including quoted ones', () => {
    expect(cssReferences(`a{background:url('a.png')} b{background:url("b.png")} c{background:url(c.png)}`))
      .toEqual(['a.png', 'b.png', 'c.png']);
  });
});

describe('addStableIds', () => {
  it('tags elements without adding wrappers', () => {
    const doc = parseHtml('<html><body><header><h1>A</h1></header><p>B</p></body></html>');
    const before = doc.querySelectorAll('*').length;
    addStableIds(doc);
    expect(doc.querySelectorAll('*').length).toBe(before);
    expect(doc.querySelector('h1')!.getAttribute(NODE_ID_ATTRIBUTE)).toBeTruthy();
  });

  it('is deterministic for the same document', () => {
    const idsOf = () => {
      const doc = parseHtml('<html><body><div><span>a</span><span>b</span></div></body></html>');
      addStableIds(doc);
      return Array.from(doc.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`)).map((element) =>
        element.getAttribute(NODE_ID_ATTRIBUTE),
      );
    };
    expect(idsOf()).toEqual(idsOf());
  });
});

describe('importing the real Manus delivery', () => {
  it('produces a site document', () => {
    const result = importSite(realDelivery(), parseHtml, serialise);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.entry).toBe('index.html');
    expect(result.document.report.stack).toBe('static-html-css');
    expect(result.document.stylesheets).toHaveLength(1);
    expect(result.document.stylesheets[0].path).toBe('style.css');
    expect(result.document.assets).toHaveLength(5);
  });

  it('keeps the designer stylesheet verbatim', () => {
    const result = importSite(realDelivery(), parseHtml, serialise);
    if (!result.ok) throw new Error('import failed');
    // Not rewritten into utilities: the CSS it shipped is the CSS we keep.
    expect(result.document.stylesheets[0].css).toBe(realCss);
    expect(result.document.stylesheets[0].css).toContain('clamp(');
    expect(result.document.stylesheets[0].css).toContain('grid-template');
    expect(result.document.stylesheets[0].css).toContain('@media');
  });

  it('resolves every local image the page references', () => {
    const result = importSite(realDelivery(), parseHtml, serialise);
    if (!result.ok) throw new Error('import failed');
    expect(result.document.report.missingAssets).toEqual([]);
  });

  it('reports the web font as an external dependency rather than hiding it', () => {
    const result = importSite(realDelivery(), parseHtml, serialise);
    if (!result.ok) throw new Error('import failed');
    expect(result.document.report.externalReferences.join(' ')).toMatch(/fonts\.googleapis\.com/);
    expect(result.document.report.limitations.join(' ')).toMatch(/zewnętrzn/i);
  });

  it('records that the real page needed no scripts', () => {
    const result = importSite(realDelivery(), parseHtml, serialise);
    if (!result.ok) throw new Error('import failed');
    expect(result.document.report.scriptsRemoved).toBe(0);
  });

  it('gives every element a stable id and keeps the structure intact', () => {
    const result = importSite(realDelivery(), parseHtml, serialise);
    if (!result.ok) throw new Error('import failed');

    const before = parseHtml(realHtml);
    const after = parseHtml(result.document.html);
    // Same element count: nothing wrapped, nothing dropped.
    expect(after.querySelectorAll('body *').length).toBe(before.querySelectorAll('body *').length);
    expect(after.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`).length).toBeGreaterThan(20);
    // Content order preserved.
    expect(after.querySelector('h1')?.textContent).toBe(before.querySelector('h1')?.textContent);
  });
});

describe('import failures are explicit', () => {
  it('reports an empty delivery', () => {
    const result = importSite([], parseHtml, serialise);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/żadnych plików/i);
  });

  it('reports a delivery with no HTML, listing what did arrive', () => {
    const result = importSite(
      [{ path: 'a/style.css', contentType: 'text/css', text: 'a{}' }],
      parseHtml,
      serialise,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/nie ma dokumentu HTML/i);
    expect(result.files).toContain('style.css');
  });

  it('removes scripts and says how many', () => {
    const result = importSite(
      [
        {
          path: 'index.html',
          contentType: 'text/html',
          text: '<html><body><p>a</p><script>alert(1)</script><script src="b.js"></script></body></html>',
        },
      ],
      parseHtml,
      serialise,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.html).not.toContain('alert(1)');
    expect(result.document.report.scriptsRemoved).toBe(2);
    expect(result.document.report.limitations.join(' ')).toMatch(/JavaScript/i);
  });

  it('names a missing image instead of silently dropping it', () => {
    const result = importSite(
      [
        {
          path: 'index.html',
          contentType: 'text/html',
          text: '<html><body><img src="assets/missing.jpg"></body></html>',
        },
      ],
      parseHtml,
      serialise,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.report.missingAssets).toContain('assets/missing.jpg');
  });
});
