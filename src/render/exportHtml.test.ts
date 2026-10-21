import { describe, expect, it } from 'vitest';
import {
  escapeHtmlAttribute,
  escapeHtmlText,
  isSafeCssValue,
  pageFilenameFor,
  renderPageHtml,
  safeHref,
} from './exportHtml';
import { BREAKPOINTS, DESKTOP_MIN, TABLET_MIN, scopeForWidth } from './breakpoints';
import { DesignTokens, NodeElement, PageDocument } from '../types/document';

const SLUGS = ['start', 'warsztaty', 'kontakt'];

const tokens: DesignTokens = {
  primaryColor: '#292824',
  accentCopper: '#A86645',
  surfaceColor: '#FFFEFB',
  textColor: '#292824',
  fontFamily: 'serif',
  buttonRadius: '8px',
  buttonVariant: 'fill',
};

const options = {
  knownSlugs: SLUGS,
  pageFilename: pageFilenameFor,
  partOfBundle: false,
};

function page(root: NodeElement): PageDocument {
  return {
    id: 'p',
    name: 'Strona',
    slug: 'start',
    title: 'Tytuł',
    description: 'Opis',
    root,
  };
}

const node = (over: Partial<NodeElement>): NodeElement =>
  ({ id: 'n1', name: 'Węzeł', tag: 'div', type: 'container', styles: {}, ...over }) as NodeElement;

describe('escaping', () => {
  // The defect this exists for: node.content went into the export verbatim,
  // so author text containing markup became executable code in the file.
  it('renders script-looking text as text', () => {
    const html = renderPageHtml(
      page(node({ tag: 'p', type: 'text', content: '<script>alert(1)</script>' })),
      tokens,
      options,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes text and attributes by their own rules', () => {
    expect(escapeHtmlText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    // Text escaping leaves quotes alone; attribute escaping must not.
    expect(escapeHtmlText('say "hi"')).toBe('say "hi"');
    expect(escapeHtmlAttribute('say "hi"')).toBe('say &quot;hi&quot;');
    expect(escapeHtmlAttribute("it's")).toBe('it&#39;s');
  });

  it('escapes an alt attribute that tries to close its quote', () => {
    const html = renderPageHtml(
      page(node({ tag: 'img', type: 'image', src: 'https://e.com/a.png', alt: '" onerror="alert(1)' })),
      tokens,
      options,
    );
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain('&quot;');
  });
});

describe('URL safety', () => {
  it('refuses executable schemes', () => {
    expect(safeHref('javascript:alert(1)', SLUGS, pageFilenameFor)).toBeNull();
    expect(safeHref('data:text/html,<p>', SLUGS, pageFilenameFor)).toBeNull();
    expect(safeHref('file:///etc/passwd', SLUGS, pageFilenameFor)).toBeNull();
  });

  it('keeps links a visitor can reasonably follow', () => {
    expect(safeHref('https://example.com', SLUGS, pageFilenameFor)).toBe('https://example.com');
    expect(safeHref('mailto:a@b.c', SLUGS, pageFilenameFor)).toBe('mailto:a@b.c');
    expect(safeHref('tel:+48123', SLUGS, pageFilenameFor)).toBe('tel:+48123');
    expect(safeHref('#kolekcje', SLUGS, pageFilenameFor)).toBe('#kolekcje');
  });

  it('maps internal page links onto the generated filenames', () => {
    expect(safeHref('/warsztaty', SLUGS, pageFilenameFor)).toBe('warsztaty.html');
    expect(safeHref('/warsztaty#cennik', SLUGS, pageFilenameFor)).toBe('warsztaty.html#cennik');
  });

  it('drops a relative path that is not a page of this project', () => {
    expect(safeHref('/nie-ma', SLUGS, pageFilenameFor)).toBeNull();
  });

  it('renders a refused link as text, keeping the content visible', () => {
    const html = renderPageHtml(
      page(node({ tag: 'a', type: 'text', href: 'javascript:alert(1)', content: 'Klik' })),
      tokens,
      options,
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Klik');
  });

  it('marks external links noopener', () => {
    const html = renderPageHtml(
      page(node({ tag: 'a', type: 'text', href: 'https://example.com', content: 'Ext' })),
      tokens,
      options,
    );
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('CSS safety', () => {
  it('rejects values that could close a declaration or block', () => {
    expect(isSafeCssValue('16px')).toBe(true);
    expect(isSafeCssValue('red; } body { display:none')).toBe(false);
    expect(isSafeCssValue('url(javascript:alert(1))')).toBe(false);
    expect(isSafeCssValue('expression(alert(1))')).toBe(false);
  });

  it('drops an unsafe declaration instead of emitting a broken stylesheet', () => {
    const html = renderPageHtml(
      page(node({ styles: { color: 'red; } body { display:none', fontSize: '16px' } })),
      tokens,
      options,
    );
    expect(html).toContain('font-size: 16px');
    expect(html).not.toContain('display:none');
  });
});

describe('responsive output', () => {
  const responsive = () =>
    page(
      node({
        id: 'hero',
        tag: 'h1',
        type: 'heading',
        content: 'Nagłówek',
        styles: { fontSize: '56px' },
        responsiveOverrides: {
          mobile: { fontSize: '32px' },
          tablet: { fontSize: '44px' },
        },
      }),
    );

  // Inline styles beat media queries, so an inline-only export could never
  // carry an override. The base rule must be in the stylesheet too.
  it('emits styles as rules, not inline attributes', () => {
    const html = renderPageHtml(responsive(), tokens, options);
    expect(html).not.toMatch(/<h1[^>]*style=/);
    expect(html).toContain('#hero { font-size: 56px; }');
  });

  it('emits both breakpoint overrides', () => {
    const html = renderPageHtml(responsive(), tokens, options);
    expect(html).toContain('font-size: 32px');
    expect(html).toContain('font-size: 44px');
    BREAKPOINTS.forEach((bp) => expect(html).toContain(bp.media));
  });

  it('places breakpoint rules after the base rule so they win', () => {
    const html = renderPageHtml(responsive(), tokens, options);
    expect(html.indexOf('#hero { font-size: 56px; }')).toBeLessThan(
      html.indexOf('font-size: 32px'),
    );
  });

  it('composes the document transform with a per-scope optical offset', () => {
    const html = renderPageHtml(
      page(
        node({
          id: 'tilt',
          styles: { transform: 'rotate(3deg)' },
          opticalOffset: { x: 1, y: 0 },
          opticalOffsets: { mobile: { x: -2, y: 4 } },
        }),
      ),
      tokens,
      options,
    );
    // Base keeps the document's own transform plus the shared offset.
    expect(html).toContain('rotate(3deg) translate(1px, 0px)');
    // Mobile re-states the transform, or the base would keep winning.
    expect(html).toContain('rotate(3deg) translate(-2px, 4px)');
  });
});

describe('breakpoint boundaries', () => {
  it('assigns each width to exactly one scope', () => {
    expect(scopeForWidth(375)).toBe('mobile');
    expect(scopeForWidth(TABLET_MIN - 1)).toBe('mobile');
    expect(scopeForWidth(TABLET_MIN)).toBe('tablet');
    expect(scopeForWidth(DESKTOP_MIN - 1)).toBe('tablet');
    expect(scopeForWidth(DESKTOP_MIN)).toBe('all');
    expect(scopeForWidth(1440)).toBe('all');
  });

  it('leaves no gap at fractional widths between breakpoints', () => {
    expect(scopeForWidth(TABLET_MIN - 0.5)).toBe('mobile');
    expect(scopeForWidth(DESKTOP_MIN - 0.5)).toBe('tablet');
  });
});

describe('honesty of the output', () => {
  it('does not depend on the editor runtime or a CDN', () => {
    const html = renderPageHtml(responsivePage(), tokens, options);
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).not.toContain('<script');
  });

  it('disables form fields, since there is no backend', () => {
    const html = renderPageHtml(
      page(
        node({
          tag: 'form',
          type: 'form',
          children: [node({ id: 'i1', tag: 'input', type: 'input', content: 'Imię' })],
        }),
      ),
      tokens,
      options,
    );
    expect(html).toContain('disabled');
    expect(html).toContain('onsubmit="return false"');
    expect(html).toContain('demonstracyjne');
  });

  it('says whether this is one page or part of a bundle', () => {
    const single = renderPageHtml(responsivePage(), tokens, options);
    expect(single).toContain('Eksport pojedynczej podstrony');

    const bundled = renderPageHtml(responsivePage(), tokens, { ...options, partOfBundle: true });
    expect(bundled).toContain('Część eksportu całej witryny');
  });

  it('drops a tag that is not on the allow list', () => {
    const html = renderPageHtml(
      page(node({ tag: 'script' as NodeElement['tag'], content: 'alert(1)' })),
      tokens,
      options,
    );
    expect(html).not.toContain('alert(1)');
  });

  function responsivePage() {
    return page(node({ tag: 'p', type: 'text', content: 'Treść' }));
  }
});
