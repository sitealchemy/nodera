import {
  CURRENT_SCHEMA_VERSION,
  NodeElement,
  ProjectState,
  ProposalSnapshot,
} from '../types/document';
import { INITIAL_SPLOT_PROJECT } from '../data/splotDemo';
import { pageFilenameFor, renderPageHtml } from '../render/exportHtml';

const STORAGE_KEY = 'nodera_project_state_v1';

export class StorageService {
  /**
   * Explicit, versioned migration.
   *
   * v1 -> v2 added per-breakpoint optical offsets. Purely additive: a v1
   *          document is already valid v2, so nothing is rewritten.
   * v2 -> v3 gave every direction its own design tokens. Previously all
   *          directions read one shared object, so recolouring one repainted
   *          the others. Each direction is seeded with a copy of the project's
   *          tokens, which preserves exactly how the document looked before —
   *          the directions only diverge from the next edit onwards.
   */
  static migrateProject(project: ProjectState): ProjectState {
    const version = project.schemaVersion ?? 1;
    if (version >= CURRENT_SCHEMA_VERSION) return project;

    const migrated: ProjectState = JSON.parse(JSON.stringify(project));

    if (version < 3) {
      Object.values(migrated.directions ?? {}).forEach((direction) => {
        if (!direction.tokens) {
          direction.tokens = JSON.parse(JSON.stringify(migrated.tokens));
        }
      });
    }

    migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
    return migrated;
  }

  /** Tokens that apply right now: the active direction's, falling back to the project's. */
  static activeTokens(project: ProjectState) {
    return project.directions[project.activeDirectionId]?.tokens ?? project.tokens;
  }

  static loadProject(): ProjectState {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return StorageService.migrateProject(JSON.parse(data) as ProjectState);
      }
    } catch (e) {
      console.warn('Could not load saved project from localStorage:', e);
    }
    return StorageService.migrateProject(INITIAL_SPLOT_PROJECT);
  }

  static saveProject(project: ProjectState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (e) {
      console.error('Could not save project to localStorage:', e);
    }
  }

  static resetToDemo(): ProjectState {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return JSON.parse(JSON.stringify(INITIAL_SPLOT_PROJECT));
  }

  static createSnapshot(project: ProjectState, title: string): ProposalSnapshot {
    const activeDir = project.directions[project.activeDirectionId];
    return {
      id: 'snap-' + Date.now(),
      createdAt: new Date().toLocaleString('pl-PL'),
      title: title || `Propozycja ${activeDir.name} (v${project.snapshots.length + 1})`,
      directionId: project.activeDirectionId,
      directionName: activeDir.name,
      commentsCount: project.comments.length,
      snapshotData: {
        pages: JSON.parse(JSON.stringify(activeDir.pages)),
        // The direction's own tokens, so a snapshot keeps the look it was
        // taken with even after that direction is recoloured later.
        tokens: JSON.parse(JSON.stringify(activeDir.tokens ?? project.tokens))
      }
    };
  }

  static exportProjectJson(project: ProjectState): void {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-nodera-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Generates production-ready standalone HTML + CSS
   */
  /**
   * Standalone HTML for one page.
   *
   * Delegates to the shared exporter, which emits a real stylesheet with
   * breakpoint rules rather than inline styles, escapes author text, and
   * validates tags and URLs.
   */
  static generateExportHtml(project: ProjectState, pageSlug: string): string {
    const dir = project.directions[project.activeDirectionId];
    const page = dir.pages[pageSlug] || Object.values(dir.pages)[0];
    const tokens = StorageService.activeTokens(project);

    return renderPageHtml(page, tokens, {
      knownSlugs: Object.keys(dir.pages),
      pageFilename: pageFilenameFor,
      partOfBundle: false,
    });
  }

  /** Every page of the active direction, as a navigable set of files. */
  static generateSiteExport(project: ProjectState): Record<string, string> {
    const dir = project.directions[project.activeDirectionId];
    const tokens = StorageService.activeTokens(project);
    const knownSlugs = Object.keys(dir.pages);

    const files: Record<string, string> = {};
    Object.values(dir.pages).forEach((page) => {
      files[pageFilenameFor(page.slug)] = renderPageHtml(page, tokens, {
        knownSlugs,
        pageFilename: pageFilenameFor,
        partOfBundle: true,
      });
    });
    return files;
  }
}
