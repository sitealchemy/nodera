import { ProjectState, ProposalSnapshot, NodeElement } from '../types/document';
import { INITIAL_SPLOT_PROJECT } from '../data/splotDemo';

const STORAGE_KEY = 'nodera_project_state_v1';

export class StorageService {
  static loadProject(): ProjectState {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Could not load saved project from localStorage:', e);
    }
    return INITIAL_SPLOT_PROJECT;
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
  static generateExportHtml(project: ProjectState, pageSlug: string): string {
    const dir = project.directions[project.activeDirectionId];
    const page = dir.pages[pageSlug] || Object.values(dir.pages)[0];

    const renderNodeHtml = (node: NodeElement): string => {
      const stylesObj: Record<string, any> = { ...node.styles };
      if (node.opticalOffset && (node.opticalOffset.x !== 0 || node.opticalOffset.y !== 0)) {
        stylesObj.transform = `translate(${node.opticalOffset.x}px, ${node.opticalOffset.y}px)`;
      }

      const inlineStyle = Object.entries(stylesObj)
        .map(([k, v]) => {
          const cssKey = k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
          return `${cssKey}: ${v};`;
        })
        .join(' ');

      const childrenHtml = node.children ? node.children.map(renderNodeHtml).join('\n') : '';

      if (node.tag === 'img') {
        return `<img id="${node.id}" src="${node.src}" alt="${node.alt || ''}" style="${inlineStyle}" class="max-w-full" />`;
      }
      if (node.tag === 'input') {
        return `<input id="${node.id}" placeholder="${node.name}" style="${inlineStyle}" class="outline-none" />`;
      }
      if (node.tag === 'textarea') {
        return `<textarea id="${node.id}" placeholder="${node.name}" style="${inlineStyle}" class="outline-none"></textarea>`;
      }
      if (node.tag === 'a') {
        return `<a id="${node.id}" href="${node.href || '#'}" style="${inlineStyle}">${node.content || childrenHtml}</a>`;
      }

      return `<${node.tag} id="${node.id}" style="${inlineStyle}">${node.content || ''}${childrenHtml}</${node.tag}>`;
    };

    const bodyHtml = renderNodeHtml(page.root);

    return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${page.title}</title>
  <meta name="description" content="${page.description}" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      background-color: ${project.tokens.surfaceColor};
      color: ${project.tokens.textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
  }
}
