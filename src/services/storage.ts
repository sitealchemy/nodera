import {
  CURRENT_SCHEMA_VERSION,
  NodeElement,
  ProjectState,
  ProposalSnapshot,
} from '../types/document';
import { INITIAL_SPLOT_PROJECT } from '../data/splotDemo';
import {
  isVoidTag,
  resolveRenderStyles,
  stylesToCssText,
} from '../render/resolveStyles';

const STORAGE_KEY = 'nodera_project_state_v1';

export class StorageService {
  /**
   * Explicit, versioned migration.
   *
   * v1 -> v2 added per-breakpoint optical offsets, which is purely additive:
   * a v1 document is already valid v2, so migration only stamps the version.
   * No stored document is silently rewritten. Any future non-additive change
   * gets its own branch here.
   */
  static migrateProject(project: ProjectState): ProjectState {
    const version = project.schemaVersion ?? 1;
    if (version >= CURRENT_SCHEMA_VERSION) return project;
    return { ...project, schemaVersion: CURRENT_SCHEMA_VERSION };
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
        tokens: JSON.parse(JSON.stringify(project.tokens))
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
   * Uses the same style resolver as the editor canvas, so an export can no
   * longer drift from what the user approved on screen.
   */
  static generateExportHtml(project: ProjectState, pageSlug: string): string {
    const dir = project.directions[project.activeDirectionId];
    const page = dir.pages[pageSlug] || Object.values(dir.pages)[0];

    const escapeAttr = (value: string): string =>
      value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const renderNodeHtml = (node: NodeElement): string => {
      // Export is the desktop rendering; responsive overrides stay in the
      // document model rather than being baked into inline styles.
      const inlineStyle = stylesToCssText(resolveRenderStyles(node, 'desktop'));
      const attrs = `id="${escapeAttr(node.id)}" style="${escapeAttr(inlineStyle)}"`;

      if (node.tag === 'img') {
        return `<img ${attrs} src="${escapeAttr(node.src || '')}" alt="${escapeAttr(node.alt || '')}" />`;
      }
      if (node.tag === 'input') {
        return `<input ${attrs} placeholder="${escapeAttr(node.content || node.name)}" />`;
      }
      if (node.tag === 'textarea') {
        return `<textarea ${attrs} placeholder="${escapeAttr(node.content || node.name)}"></textarea>`;
      }
      if (isVoidTag(node.tag)) {
        return `<${node.tag} ${attrs} />`;
      }

      const children = node.children?.length
        ? node.children.map(renderNodeHtml).join('\n')
        : node.content || '';

      if (node.tag === 'a') {
        return `<a ${attrs} href="${escapeAttr(node.href || '#')}">${children}</a>`;
      }
      return `<${node.tag} ${attrs}>${children}</${node.tag}>`;
    };

    return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeAttr(page.title)}</title>
  <meta name="description" content="${escapeAttr(page.description)}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      background-color: ${project.tokens.surfaceColor};
      color: ${project.tokens.textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    img { max-width: 100%; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    }
  </style>
</head>
<body>
  ${renderNodeHtml(page.root)}
</body>
</html>`;
  }
}
