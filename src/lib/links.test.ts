import { describe, expect, it } from 'vitest';
import { classifyLink, normaliseSlug, shouldInterceptLink } from './links';

const SLUGS = ['start', 'warsztaty', 'o-pracowni', 'kontakt'];

describe('normaliseSlug', () => {
  it('strips leading and trailing slashes and dot-prefixes', () => {
    expect(normaliseSlug('/warsztaty')).toBe('warsztaty');
    expect(normaliseSlug('warsztaty/')).toBe('warsztaty');
    expect(normaliseSlug('./warsztaty')).toBe('warsztaty');
    expect(normaliseSlug('//warsztaty//')).toBe('warsztaty');
  });
});

describe('classifyLink', () => {
  // The regression this exists for: an unhandled "/warsztaty" resolves against
  // the app's own origin and loads the Nodera editor inside its own preview.
  it('recognises a project page', () => {
    expect(classifyLink('/warsztaty', SLUGS)).toEqual({
      kind: 'page',
      slug: 'warsztaty',
      hash: null,
    });
    expect(classifyLink('warsztaty', SLUGS)).toEqual({
      kind: 'page',
      slug: 'warsztaty',
      hash: null,
    });
  });

  it('recognises a page with a fragment', () => {
    expect(classifyLink('/warsztaty#cennik', SLUGS)).toEqual({
      kind: 'page',
      slug: 'warsztaty',
      hash: 'cennik',
    });
  });

  it('recognises an anchor on the current page', () => {
    expect(classifyLink('#kolekcje', SLUGS)).toEqual({ kind: 'anchor', hash: 'kolekcje' });
  });

  it('treats a bare hash as nothing to do', () => {
    expect(classifyLink('#', SLUGS)).toEqual({ kind: 'none' });
    expect(classifyLink('', SLUGS)).toEqual({ kind: 'none' });
    expect(classifyLink(null, SLUGS)).toEqual({ kind: 'none' });
    expect(classifyLink(undefined, SLUGS)).toEqual({ kind: 'none' });
  });

  it('recognises external URLs', () => {
    expect(classifyLink('https://example.com/a', SLUGS)).toEqual({
      kind: 'external',
      href: 'https://example.com/a',
    });
    expect(classifyLink('http://example.com', SLUGS)).toEqual({
      kind: 'external',
      href: 'http://example.com',
    });
    expect(classifyLink('//cdn.example.com/x', SLUGS)).toEqual({
      kind: 'external',
      href: '//cdn.example.com/x',
    });
  });

  it('passes mailto and tel through to the user agent', () => {
    expect(classifyLink('mailto:kontakt@pracowniasplot.pl', SLUGS)).toMatchObject({
      kind: 'protocol',
      scheme: 'mailto:',
    });
    expect(classifyLink('tel:+48123456789', SLUGS)).toMatchObject({
      kind: 'protocol',
      scheme: 'tel:',
    });
  });

  it('refuses to act on script-bearing and opaque schemes', () => {
    expect(classifyLink('javascript:alert(1)', SLUGS)).toEqual({ kind: 'none' });
    expect(classifyLink('data:text/html,<p>x', SLUGS)).toEqual({ kind: 'none' });
    expect(classifyLink('file:///etc/passwd', SLUGS)).toEqual({ kind: 'none' });
  });

  it('does not treat an unknown relative path as a page', () => {
    // Following this would load the app shell into the frame.
    expect(classifyLink('/nie-istnieje', SLUGS)).toEqual({ kind: 'none' });
    expect(classifyLink('/admin/panel', SLUGS)).toEqual({ kind: 'none' });
  });

  it('depends on the project pages it is given', () => {
    expect(classifyLink('/warsztaty', [])).toEqual({ kind: 'none' });
    expect(classifyLink('/sklep', ['sklep'])).toMatchObject({ kind: 'page', slug: 'sklep' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(classifyLink('  /kontakt  ', SLUGS)).toMatchObject({ kind: 'page', slug: 'kontakt' });
  });
});

describe('shouldInterceptLink', () => {
  it('intercepts everything except user-agent schemes', () => {
    expect(shouldInterceptLink(classifyLink('/warsztaty', SLUGS))).toBe(true);
    expect(shouldInterceptLink(classifyLink('#x', SLUGS))).toBe(true);
    expect(shouldInterceptLink(classifyLink('https://example.com', SLUGS))).toBe(true);
    expect(shouldInterceptLink(classifyLink('mailto:a@b.c', SLUGS))).toBe(false);
  });
});
