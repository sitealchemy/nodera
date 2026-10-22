import { describe, expect, it } from 'vitest';
import { buildProjectFromSpec } from './buildDocument';
import { NoderaPageSpec, validatePageSpec } from './pageSpec';
import { StorageService } from '../services/storage';
import { flattenNodes } from '../lib/documentTree';
import { renderPageHtml, pageFilenameFor } from '../render/exportHtml';
import { NodeElement } from '../types/document';

function spec(sections: any[]): NoderaPageSpec {
  const result = validatePageSpec({
    schemaVersion: 1,
    siteName: 'Test',
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
        title: 'Test',
        description: 'Opis',
        sections,
      },
    ],
  });
  if (!result.ok) throw new Error('fixture failed validation');
  return result.spec;
}

const section = (over: Record<string, unknown>) => ({
  kind: 'text',
  heading: '',
  subheading: '',
  body: '',
  items: [],
  actions: [],
  image: { src: '', alt: '' },
  ...over,
});

const build = (sections: any[]) =>
  buildProjectFromSpec(spec(sections), {
    projectId: 'p1',
    projectName: 'Projekt',
    prompt: 'Zrób stronę piekarni',
  });

describe('buildProjectFromSpec', () => {
  it('produces a project the rest of the app can open', () => {
    const project = build([section({ kind: 'hero', heading: 'Witaj' })]);
    expect(project.id).toBe('p1');
    expect(Object.keys(project.directions)).toHaveLength(1);
    const direction = project.directions[project.activeDirectionId];
    expect(direction.pages[project.activePageSlug]).toBeDefined();
    expect(direction.tokens?.accentCopper).toBe('#8a5a2b');
  });

  it('stamps the current document schema version', () => {
    const project = build([section({ kind: 'hero', heading: 'Witaj' })]);
    // Migration must treat a generated project as already current.
    expect(StorageService.migrateProject(project)).toBe(project);
  });

  it('gives every element a unique, stable id', () => {
    const sections = [
      section({ kind: 'nav', heading: 'Marka', actions: [{ label: 'Start', href: '#top' }] }),
      section({
        kind: 'hero',
        heading: 'Nagłówek',
        body: 'Tekst',
        actions: [{ label: 'Zamów', href: '#zamow' }],
      }),
      section({
        kind: 'features',
        heading: 'Oferta',
        items: [
          { title: 'A', body: 'a', meta: '10 zł' },
          { title: 'B', body: 'b', meta: '' },
        ],
      }),
    ];
    const first = build(sections);
    const second = build(sections);

    const idsOf = (p: typeof first) =>
      flattenNodes(p.directions[p.activeDirectionId].pages.start.root).map((n) => n.id);

    const ids = idsOf(first);
    expect(new Set(ids).size, 'ids must be unique').toBe(ids.length);
    // Same spec, same ids: a re-import keeps selections meaningful.
    expect(idsOf(second)).toEqual(ids);
  });

  it('only emits tags the renderer and exporter support', () => {
    const allowed = new Set([
      'div', 'section', 'header', 'footer', 'nav', 'h1', 'h2', 'h3',
      'p', 'span', 'a', 'button', 'img',
    ]);
    const project = build([
      section({ kind: 'nav', heading: 'M', actions: [{ label: 'x', href: '#x' }] }),
      section({ kind: 'hero', heading: 'H', body: 'B', image: { src: 'https://e.com/a.png', alt: 'a' } }),
      section({ kind: 'features', heading: 'F', items: [{ title: 't', body: 'b', meta: 'm' }] }),
      section({ kind: 'cta', heading: 'C', actions: [{ label: 'go', href: '#g' }] }),
      section({ kind: 'contact', heading: 'K', body: 'adres' }),
      section({ kind: 'footer', body: '© 2026' }),
    ]);
    flattenNodes(project.directions[project.activeDirectionId].pages.start.root).forEach((node) => {
      expect(allowed.has(node.tag), `unexpected tag ${node.tag}`).toBe(true);
    });
  });

  it('carries the prompt text into the document, not boilerplate', () => {
    const project = build([section({ kind: 'hero', heading: 'Chleb na zakwasie', body: 'Z Gdańska.' })]);
    const contents = flattenNodes(project.directions.generated.pages.start.root)
      .map((n) => n.content ?? '')
      .join(' ');
    expect(contents).toContain('Chleb na zakwasie');
    expect(contents).toContain('Z Gdańska.');
    // No trace of the bundled demo.
    expect(contents).not.toContain('Pracownia Splot');
  });

  it('adds responsive overrides so the mobile preview differs', () => {
    const project = build([section({ kind: 'hero', heading: 'Duży nagłówek' })]);
    const heading = flattenNodes(project.directions.generated.pages.start.root).find(
      (n) => n.tag === 'h1',
    )!;
    expect(heading.responsiveOverrides?.mobile?.fontSize).toBeDefined();
    expect(heading.responsiveOverrides?.mobile?.fontSize).not.toBe(heading.styles.fontSize);
  });

  it('keeps safe links and neutralises unknown internal paths', () => {
    const project = build([
      section({
        kind: 'hero',
        heading: 'H',
        actions: [
          { label: 'Mail', href: 'mailto:a@b.c' },
          { label: 'Nieznana', href: '/nie-ma-takiej' },
        ],
      }),
    ]);
    const nodes = flattenNodes(project.directions.generated.pages.start.root);
    const hrefs = nodes.filter((n) => n.href).map((n) => n.href);
    expect(hrefs).toContain('mailto:a@b.c');
    // An unknown path would resolve against the app's own origin.
    expect(hrefs.some((h) => h === '/nie-ma-takiej')).toBe(false);
    expect(hrefs.some((h) => h?.startsWith('#'))).toBe(true);
  });

  it('never leaves an empty section the user cannot select', () => {
    const project = build([section({ kind: 'text' })]);
    const sectionNode = project.directions.generated.pages.start.root.children![0];
    expect(sectionNode.children?.length).toBeGreaterThan(0);
  });

  it('produces a document the existing exporter can render', () => {
    const project = build([
      section({ kind: 'hero', heading: 'Chleb', body: 'Opis' }),
      section({ kind: 'features', heading: 'Oferta', items: [{ title: 'Bochenek', body: 'x', meta: '12 zł' }] }),
    ]);
    const direction = project.directions.generated;
    const html = renderPageHtml(direction.pages.start, direction.tokens!, {
      knownSlugs: ['start'],
      pageFilename: pageFilenameFor,
      partOfBundle: false,
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Chleb');
    expect(html).toContain('@media');
    expect(html).not.toContain('<script');
  });

  it('escapes model text that looks like markup', () => {
    const project = build([section({ kind: 'hero', heading: '<img src=x onerror=alert(1)>' })]);
    const direction = project.directions.generated;
    const html = renderPageHtml(direction.pages.start, direction.tokens!, {
      knownSlugs: ['start'],
      pageFilename: pageFilenameFor,
      partOfBundle: false,
    });
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('builds a tree with no duplicate ids even for many items', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `T${i}`,
      body: 'b',
      meta: 'm',
    }));
    const project = build([
      section({ kind: 'features', heading: 'Dużo', items }),
      section({ kind: 'gallery', heading: 'Też dużo', items }),
    ]);
    const nodes: NodeElement[] = flattenNodes(
      project.directions.generated.pages.start.root,
    );
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
