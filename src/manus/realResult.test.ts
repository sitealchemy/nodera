import { describe, expect, it } from 'vitest';
import realResult from '../../scripts/realResult.json';
import { validatePageSpec } from './pageSpec';
import { buildProjectFromSpec } from './buildDocument';
import { flattenNodes } from '../lib/documentTree';
import { pageFilenameFor, renderPageHtml } from '../render/exportHtml';

/**
 * Runs the importer over a result captured from the live Manus API
 * (task bVBNxeMbpRnvNMEUfJt8ZD, 2026-10-22).
 *
 * Kept as a fixture so the contract stays covered without paying for a task
 * on every run.
 */
describe('a real Manus result', () => {
  it('passes validation', () => {
    const result = validatePageSpec(realResult);
    if (!result.ok) console.log('ERRORS', JSON.stringify(result.errors, null, 2));
    expect(result.ok).toBe(true);
  });

  it('builds a document the editor and exporter can use', () => {
    const result = validatePageSpec(realResult);
    if (!result.ok) throw new Error('validation failed');

    const project = buildProjectFromSpec(result.spec, {
      projectId: 'real',
      projectName: 'Prawdziwy wynik',
      prompt: 'Zwróć przykładową stronę jednej piekarni.',
    });

    const direction = project.directions[project.activeDirectionId];
    const page = direction.pages[project.activePageSlug];
    const nodes = flattenNodes(page.root);

    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(nodes.length).toBeGreaterThan(5);
    expect(nodes.some((n) => n.content && n.content.length > 10)).toBe(true);

    const html = renderPageHtml(page, direction.tokens!, {
      knownSlugs: [page.slug],
      pageFilename: pageFilenameFor,
      partOfBundle: false,
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('<script');
    expect(html).toContain('@media');
  });
});
