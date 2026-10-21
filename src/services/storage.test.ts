import { describe, expect, it } from 'vitest';
import { StorageService } from './storage';
import { INITIAL_SPLOT_PROJECT } from '../data/splotDemo';
import { CURRENT_SCHEMA_VERSION, ProjectState } from '../types/document';

const clone = (p: ProjectState): ProjectState => JSON.parse(JSON.stringify(p));

/** A pre-versioning document: no schemaVersion, no per-direction tokens. */
function legacyProject(): ProjectState {
  const p = clone(INITIAL_SPLOT_PROJECT);
  delete (p as Partial<ProjectState>).schemaVersion;
  Object.values(p.directions).forEach((d) => {
    delete (d as { tokens?: unknown }).tokens;
  });
  return p;
}

describe('migrateProject', () => {
  it('opens a pre-versioning project and stamps the current version', () => {
    const migrated = StorageService.migrateProject(legacyProject());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('gives every direction its own token object', () => {
    const migrated = StorageService.migrateProject(legacyProject());
    const directions = Object.values(migrated.directions);

    directions.forEach((d) => expect(d.tokens).toBeDefined());

    // Separate objects, not shared references — the whole point of v3.
    const seen = new Set(directions.map((d) => d.tokens));
    expect(seen.size).toBe(directions.length);
  });

  it('preserves the look: each direction starts from the project tokens', () => {
    const legacy = legacyProject();
    const migrated = StorageService.migrateProject(legacy);
    Object.values(migrated.directions).forEach((d) => {
      expect(d.tokens).toEqual(legacy.tokens);
    });
  });

  it('mutating one direction tokens after migration does not affect another', () => {
    const migrated = StorageService.migrateProject(legacyProject());
    const ids = Object.keys(migrated.directions);
    migrated.directions[ids[0]].tokens!.accentCopper = '#000000';
    expect(migrated.directions[ids[1]].tokens!.accentCopper).not.toBe('#000000');
  });

  it('does not rewrite a project that is already current', () => {
    const current = StorageService.migrateProject(legacyProject());
    expect(StorageService.migrateProject(current)).toBe(current);
  });

  it('leaves the input untouched', () => {
    const legacy = legacyProject();
    const serialised = JSON.stringify(legacy);
    StorageService.migrateProject(legacy);
    expect(JSON.stringify(legacy)).toBe(serialised);
  });

  it('keeps existing per-direction tokens rather than overwriting them', () => {
    const p = StorageService.migrateProject(legacyProject());
    const ids = Object.keys(p.directions);
    p.directions[ids[0]].tokens!.accentCopper = '#123456';
    (p as ProjectState).schemaVersion = 2;

    const again = StorageService.migrateProject(p);
    expect(again.directions[ids[0]].tokens!.accentCopper).toBe('#123456');
  });
});

describe('activeTokens', () => {
  it('prefers the active direction tokens', () => {
    const p = StorageService.migrateProject(legacyProject());
    p.directions[p.activeDirectionId].tokens!.accentCopper = '#ABCDEF';
    expect(StorageService.activeTokens(p).accentCopper).toBe('#ABCDEF');
  });

  it('falls back to project tokens when a direction has none', () => {
    const p = legacyProject();
    expect(StorageService.activeTokens(p)).toEqual(p.tokens);
  });
});

describe('generateExportHtml', () => {
  it('emits the document with no Tailwind CDN dependency', () => {
    const p = StorageService.migrateProject(clone(INITIAL_SPLOT_PROJECT));
    const html = StorageService.generateExportHtml(p, 'start');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).toContain('prefers-reduced-motion');
  });

  it('uses the active direction tokens for the page background', () => {
    const p = StorageService.migrateProject(clone(INITIAL_SPLOT_PROJECT));
    p.directions[p.activeDirectionId].tokens!.surfaceColor = '#102030';
    expect(StorageService.generateExportHtml(p, 'start')).toContain('#102030');
  });

  it('escapes title as text and description as an attribute', () => {
    const p = StorageService.migrateProject(clone(INITIAL_SPLOT_PROJECT));
    const page = p.directions[p.activeDirectionId].pages.start;
    page.title = 'Splot "ceramika" & <spółka>';
    page.description = 'Opis z "cudzysłowem" i <tagiem>';

    const html = StorageService.generateExportHtml(p, 'start');

    // <title> is a text context: markup must be escaped, quotes need not be.
    expect(html).toContain('&lt;spółka&gt;');
    expect(html).not.toContain('<spółka>');
    // The meta description is an attribute, so its quotes must be escaped or
    // it would close its own value.
    expect(html).toContain('&quot;cudzysłowem&quot;');
  });
});
