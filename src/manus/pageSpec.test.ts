import { describe, expect, it } from 'vitest';
import { MANUS_OUTPUT_SCHEMA, PAGE_SPEC_VERSION, validatePageSpec } from './pageSpec';

/** A well-formed result, as Manus is asked to produce it. */
function goodSpec(overrides: Record<string, unknown> = {}): any {
  return {
    schemaVersion: 1,
    siteName: 'Piekarnia Zakwas',
    tokens: {
      accent: '#8a5a2b',
      surface: '#fffdf8',
      text: '#241f1b',
      muted: '#6b645c',
      headingFont: 'serif',
      radius: '10px',
    },
    pages: [
      {
        slug: 'start',
        name: 'Strona główna',
        title: 'Piekarnia Zakwas',
        description: 'Pieczywo na zakwasie z Gdańska.',
        sections: [
          {
            kind: 'nav',
            heading: 'Zakwas',
            subheading: '',
            body: '',
            items: [],
            actions: [{ label: 'Kontakt', href: '#kontakt' }],
            image: { src: '', alt: '' },
          },
          {
            kind: 'hero',
            heading: 'Chleb, który dojrzewa powoli',
            subheading: 'Gdańsk',
            body: 'Wypiekamy codziennie rano.',
            items: [],
            actions: [{ label: 'Zamów', href: 'tel:+48123456789' }],
            image: { src: 'https://example.com/chleb.jpg', alt: 'Bochenek' },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('MANUS_OUTPUT_SCHEMA', () => {
  // The API rejects a schema that does not meet these two rules.
  it('lists every property as required and forbids extra properties', () => {
    const check = (node: any, path: string) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object') {
        expect(node.additionalProperties, `${path}.additionalProperties`).toBe(false);
        const declared = Object.keys(node.properties ?? {}).sort();
        expect([...(node.required ?? [])].sort(), `${path}.required`).toEqual(declared);
        Object.entries(node.properties ?? {}).forEach(([key, value]) =>
          check(value, `${path}.${key}`),
        );
      }
      if (node.type === 'array') check(node.items, `${path}[]`);
    };
    check(MANUS_OUTPUT_SCHEMA, 'root');
  });

  it('is self-contained, with no $ref the API would have to resolve', () => {
    expect(JSON.stringify(MANUS_OUTPUT_SCHEMA)).not.toContain('$ref');
  });
});

describe('validatePageSpec', () => {
  it('accepts a well-formed result', () => {
    const result = validatePageSpec(goodSpec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.schemaVersion).toBe(PAGE_SPEC_VERSION);
    expect(result.spec.pages[0].sections).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('rejects something that is not an object', () => {
    expect(validatePageSpec(null).ok).toBe(false);
    expect(validatePageSpec('<html>').ok).toBe(false);
    expect(validatePageSpec([1, 2]).ok).toBe(false);
  });

  it('rejects a result with no pages or no sections', () => {
    expect(validatePageSpec(goodSpec({ pages: [] })).ok).toBe(false);
    const noSections = goodSpec();
    noSections.pages[0].sections = [];
    expect(validatePageSpec(noSections).ok).toBe(false);
  });

  it('rejects a schema version it does not understand', () => {
    const result = validatePageSpec(goodSpec({ schemaVersion: 7 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/wersja schematu/i);
  });

  it('repairs an unknown section kind instead of failing', () => {
    const spec = goodSpec();
    (spec.pages[0].sections[1] as any).kind = 'parallax-carousel';
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.pages[0].sections[1].kind).toBe('text');
    expect(result.warnings.some((w) => w.message.includes('parallax-carousel'))).toBe(true);
  });

  it('replaces an invalid colour and says so', () => {
    const spec = goodSpec();
    (spec.tokens as any).accent = 'ciepły brąz';
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.tokens.accent).toBe('#A86645');
    expect(result.warnings.some((w) => w.path === 'tokens.accent')).toBe(true);
  });

  // A model that invents an image URL should not get it into the document.
  it('drops a non-https image and keeps the section', () => {
    const spec = goodSpec();
    spec.pages[0].sections[1].image.src = 'http://insecure.example/x.png';
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.pages[0].sections[1].image.src).toBe('');
    expect(result.warnings.some((w) => w.path.endsWith('image.src'))).toBe(true);
  });

  it('drops a javascript: image URL', () => {
    const spec = goodSpec();
    spec.pages[0].sections[1].image.src = 'javascript:alert(1)';
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.pages[0].sections[1].image.src).toBe('');
  });

  it('normalises a slug and reports the change', () => {
    const spec = goodSpec();
    spec.pages[0].slug = 'Strona Główna!';
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.pages[0].slug).toBe('strona-g-wna');
    expect(result.warnings.some((w) => w.path.endsWith('slug'))).toBe(true);
  });

  it('caps runaway section and item counts', () => {
    const spec = goodSpec();
    spec.pages[0].sections = Array.from({ length: 50 }, () => ({
      kind: 'text',
      heading: 'x',
      subheading: '',
      body: '',
      items: Array.from({ length: 40 }, () => ({ title: 't', body: 'b', meta: '' })),
      actions: [],
      image: { src: '', alt: '' },
    }));
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.pages[0].sections.length).toBeLessThanOrEqual(20);
    expect(result.spec.pages[0].sections[0].items.length).toBeLessThanOrEqual(12);
  });

  it('survives missing fields by filling defaults', () => {
    const result = validatePageSpec({
      pages: [{ sections: [{ kind: 'hero' }] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.tokens.accent).toMatch(/^#/);
    expect(result.spec.pages[0].name).toBe('Strona główna');
  });

  it('ignores action entries with no label', () => {
    const spec = goodSpec();
    spec.pages[0].sections[1].actions = [
      { label: '', href: '/x' },
      { label: 'OK', href: '#ok' },
    ];
    const result = validatePageSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.pages[0].sections[1].actions).toHaveLength(1);
  });
});
