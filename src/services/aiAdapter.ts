import { ProjectState, NodeElement, ResponsiveScope } from '../types/document';
import { resolveOpticalOffset } from '../render/resolveStyles';

/**
 * DEMONSTRATION COMMAND PARSER — not a language model.
 *
 * This matches a fixed set of Polish keyword patterns and performs the edit
 * directly. There is no model call and no network access. Anything outside the
 * patterns below is reported as `unsupported` rather than quietly succeeding.
 */
export const COMMAND_MODE = 'demo' as const;

export interface AICommandContext {
  projectName: string;
  directionName: string;
  pageSlug: string;
  selectedElementId: string | null;
  selectedElementName: string | null;
  /** The action the user has open on the selection, if any. */
  actionType: 'none' | 'text' | 'size' | 'appearance' | 'position';
  responsiveScope: ResponsiveScope;
}

/**
 * Outcome of a command.
 *
 * `applied` is the only kind that changes the document, and the only one that
 * should reach undo history or show a success confirmation. The parser used to
 * return success unconditionally, so an unrecognised instruction produced a
 * green tick, a history entry and no change at all.
 */
export type AIResultKind =
  | 'applied'
  | 'unchanged'
  | 'unsupported'
  | 'needsClarification'
  | 'error';

export interface AIExecutionResult {
  kind: AIResultKind;
  summary: string;
  detailedSteps: string[];
  affectedElementIds: string[];
  /** Only present when `kind === 'applied'`. */
  updatedProject?: ProjectState;
}

const unsupported = (prompt: string): AIExecutionResult => ({
  kind: 'unsupported',
  summary: `Nie rozumiem polecenia: „${prompt}".`,
  detailedSteps: [
    'Tryb demonstracyjny rozpoznaje ograniczony zestaw poleceń.',
    'Spróbuj np.: „Zmień kolor przycisków na kobaltowy", „Wyeksponuj warsztaty", „Powiększ o 20%", „Kontakt na koniec menu".',
  ],
  affectedElementIds: [],
});

const needsSelection = (what: string): AIExecutionResult => ({
  kind: 'needsClarification',
  summary: `Zaznacz najpierw element, ${what}.`,
  detailedSteps: ['Przytrzymaj Shift i kliknij element na płótnie albo włącz tryb „Wybierz".'],
  affectedElementIds: [],
});

export class AIAdapter {
  /**
   * Processes a natural language prompt with explicit context.
   */
  static executeCommand(
    prompt: string,
    context: AICommandContext,
    project: ProjectState
  ): AIExecutionResult {
    const p = prompt.toLowerCase().trim();
    if (!p) return unsupported(prompt);

    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const activeDirection = cloned.directions[cloned.activeDirectionId];
    const activePage = activeDirection.pages[cloned.activePageSlug];
    if (!activePage) {
      return {
        kind: 'error',
        summary: 'Nie można odczytać aktywnej podstrony.',
        detailedSteps: [],
        affectedElementIds: [],
      };
    }

    const steps: string[] = [];
    const affectedIds: string[] = [];
    const scope = context.responsiveScope;

    const findNode = (root: NodeElement, id: string): NodeElement | null => {
      if (root.id === id) return root;
      for (const child of root.children ?? []) {
        const found = findNode(child, id);
        if (found) return found;
      }
      return null;
    };

    /** Writes a style the same way manual editing does: honouring the scope. */
    const writeStyle = (node: NodeElement, patch: Record<string, string>) => {
      if (scope === 'all') {
        Object.assign(node.styles, patch);
        return;
      }
      node.responsiveOverrides = node.responsiveOverrides ?? {};
      node.responsiveOverrides[scope] = { ...node.responsiveOverrides[scope], ...patch };
    };

    const applied = (summary: string): AIExecutionResult => ({
      kind: 'applied',
      summary,
      detailedSteps: steps,
      affectedElementIds: affectedIds,
      updatedProject: cloned,
    });

    const scopeNote =
      scope === 'all' ? '' : ` (zakres: ${scope === 'mobile' ? 'małe ekrany' : 'tablety'})`;

    // CASE 1: expose the workshops section
    if (p.includes('warsztat') && (p.includes('eksponuj') || p.includes('wyżej') || p.includes('pokaż'))) {
      const rootChildren = activePage.root.children ?? [];
      const workshopIndex = rootChildren.findIndex((n) => n.id.includes('workshop'));
      const heroIndex = rootChildren.findIndex((n) => n.id.includes('hero'));

      if (workshopIndex === -1 || heroIndex === -1) {
        return {
          kind: 'unchanged',
          summary: 'Ta podstrona nie ma sekcji warsztatów do wyeksponowania.',
          detailedSteps: [`Sprawdzono podstronę: ${activePage.name}.`],
          affectedElementIds: [],
        };
      }
      if (workshopIndex <= heroIndex) {
        return {
          kind: 'unchanged',
          summary: 'Sekcja warsztatów jest już wyeksponowana.',
          detailedSteps: ['Znajduje się bezpośrednio pod główną sekcją.'],
          affectedElementIds: [rootChildren[workshopIndex].id],
        };
      }

      const [wsNode] = rootChildren.splice(workshopIndex, 1);
      rootChildren.splice(heroIndex + 1, 0, wsNode);
      steps.push('Przeniesiono sekcję warsztatów bezpośrednio pod główny nagłówek.');
      affectedIds.push(wsNode.id);

      const primaryCta = findNode(rootChildren[heroIndex], 'materia-hero-cta-primary');
      if (primaryCta) {
        primaryCta.content = 'Zapisz się na warsztaty weekendowe';
        steps.push('Zaktualizowano treść głównego przycisku CTA.');
        affectedIds.push(primaryCta.id);
      }

      const wsTitle = findNode(wsNode, 'materia-workshops-title');
      if (wsTitle) {
        wsTitle.styles.color = activeDirection.tokens?.accentCopper ?? cloned.tokens.accentCopper;
        steps.push('Wzmocniono akcent kolorystyczny tytułu warsztatów.');
        affectedIds.push(wsTitle.id);
      }

      cloned.lastUpdated = 'Przed chwilą';
      return applied('Wyeksponowano sekcję warsztatów na stronie głównej.');
    }

    // CASE 2: recolour buttons via the direction's accent token
    if (p.includes('kolor') && (p.includes('przycisk') || p.includes('cta') || p.includes('token'))) {
      const palette: [string[], string, string][] = [
        [['kobalt', 'niebiesk'], '#24486E', 'głęboki kobalt'],
        [['leśn', 'zielon', 'szałw'], '#3E5748', 'leśna szałwia'],
        [['czarn', 'grafit'], '#1C1B19', 'grafitowy'],
        [['mied', 'ciepł'], '#A86645', 'autorska miedź'],
      ];
      const match = palette.find(([keys]) => keys.some((k) => p.includes(k)));
      if (!match) {
        return {
          kind: 'needsClarification',
          summary: 'Na jaki kolor zmienić przyciski?',
          detailedSteps: ['Rozpoznaję: kobaltowy, leśna szałwia, grafitowy, miedziany.'],
          affectedElementIds: [],
        };
      }
      const [, targetColor, colorName] = match;

      const currentTokens = activeDirection.tokens ?? cloned.tokens;
      if (currentTokens.accentCopper.toLowerCase() === targetColor.toLowerCase()) {
        return {
          kind: 'unchanged',
          summary: `Przyciski już mają kolor ${colorName}.`,
          detailedSteps: [],
          affectedElementIds: [],
        };
      }

      // Only this direction is touched; the others keep their own look.
      const nextTokens = { ...currentTokens, accentCopper: targetColor };
      activeDirection.tokens = nextTokens;
      cloned.tokens = nextTokens;

      Object.values(activeDirection.pages).forEach((page) => {
        const walk = (node: NodeElement) => {
          if (node.tag === 'button' || node.tokenRef === 'buttonPrimary') {
            node.styles.backgroundColor = targetColor;
            affectedIds.push(node.id);
          }
          node.children?.forEach(walk);
        };
        walk(page.root);
      });

      steps.push(`Zmieniono token koloru przycisków na ${colorName} (${targetColor}).`);
      steps.push(
        `Zastosowano na ${Object.keys(activeDirection.pages).length} podstronach kierunku ${activeDirection.name}.`
      );
      steps.push('Pozostałe kierunki zachowały swój wygląd.');
      return applied(`Zmieniono kolor przycisków na ${colorName}.`);
    }

    // CASE 3: resize the selected element
    if (p.includes('powiększ') || p.includes('zwiększ') || p.includes('pomniejsz') || p.includes('zmniejsz')) {
      if (!context.selectedElementId) return needsSelection('który chcesz przeskalować');
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (!targetNode) return needsSelection('który chcesz przeskalować');

      const grow = p.includes('powiększ') || p.includes('zwiększ');
      const factor = grow ? 1.2 : 0.8;
      const percentStr = grow ? '+20%' : '-20%';

      const effective =
        scope !== 'all' && targetNode.responsiveOverrides?.[scope]
          ? { ...targetNode.styles, ...targetNode.responsiveOverrides[scope] }
          : targetNode.styles;

      if (effective.fontSize) {
        const current = parseInt(effective.fontSize, 10) || 16;
        const next = Math.max(1, Math.round(current * factor));
        writeStyle(targetNode, { fontSize: `${next}px` });
        steps.push(`Rozmiar tekstu: ${current}px → ${next}px (${percentStr})${scopeNote}.`);
      } else if (effective.height) {
        const current = parseInt(effective.height, 10) || 300;
        const next = Math.max(1, Math.round(current * factor));
        writeStyle(targetNode, { height: `${next}px` });
        steps.push(`Wysokość: ${current}px → ${next}px (${percentStr})${scopeNote}.`);
      } else {
        return {
          kind: 'unchanged',
          summary: `Element ${targetNode.name} nie ma rozmiaru, który mógłbym przeskalować.`,
          detailedSteps: ['Brak ustawionego fontSize ani height.'],
          affectedElementIds: [targetNode.id],
        };
      }

      affectedIds.push(targetNode.id);
      return applied(`Zmieniono rozmiar ${targetNode.name} o ${percentStr}.`);
    }

    // CASE 4: optical nudge
    if (p.includes('korekt') || p.includes('przesuń') || p.includes('offset') || /\d\s*px/.test(p)) {
      if (!context.selectedElementId) return needsSelection('który chcesz przesunąć');
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (!targetNode) return needsSelection('który chcesz przesunąć');

      let dx = 0;
      let dy = 0;
      if (p.includes('lewo')) dx -= 1;
      if (p.includes('prawo')) dx += 1;
      if (p.includes('gór') || p.includes('gora')) dy -= 1;
      if (p.includes('dół') || p.includes('dol')) dy += 1;

      if (dx === 0 && dy === 0) {
        return {
          kind: 'needsClarification',
          summary: 'W którą stronę przesunąć element?',
          detailedSteps: ['Podaj kierunek: w lewo, w prawo, w górę albo w dół.'],
          affectedElementIds: [targetNode.id],
        };
      }

      // Same scope rules as the inspector's directional pad.
      const current = resolveOpticalOffset(targetNode, scope) ?? { x: 0, y: 0 };
      const next = { x: current.x + dx, y: current.y + dy };
      if (scope === 'all') {
        targetNode.opticalOffset = next;
      } else {
        targetNode.opticalOffsets = targetNode.opticalOffsets ?? {};
        targetNode.opticalOffsets[scope] = next;
      }

      steps.push(`Korekta optyczna: X ${next.x}px, Y ${next.y}px${scopeNote}.`);
      steps.push('Zmiana nie rozpycha sąsiadujących elementów.');
      affectedIds.push(targetNode.id);
      return applied(`Przesunięto ${targetNode.name} o ${dx}px / ${dy}px.`);
    }

    // CASE 5: move Kontakt to the end of the nav
    if (p.includes('kontakt') && p.includes('koniec')) {
      const navNode = findNode(activePage.root, 'materia-menu');
      if (!navNode?.children?.length) {
        return {
          kind: 'unchanged',
          summary: 'Ta podstrona nie ma menu głównego do uporządkowania.',
          detailedSteps: [],
          affectedElementIds: [],
        };
      }
      const idx = navNode.children.findIndex((c) => c.name.toLowerCase().includes('kontakt'));
      if (idx === -1) {
        return {
          kind: 'unchanged',
          summary: 'W menu nie ma pozycji Kontakt.',
          detailedSteps: [],
          affectedElementIds: [],
        };
      }
      if (idx === navNode.children.length - 1) {
        return {
          kind: 'unchanged',
          summary: 'Pozycja Kontakt jest już na końcu menu.',
          detailedSteps: [],
          affectedElementIds: [navNode.children[idx].id],
        };
      }
      const [item] = navNode.children.splice(idx, 1);
      navNode.children.push(item);
      steps.push('Przeniesiono Kontakt na ostatnie miejsce w nawigacji.');
      affectedIds.push(item.id);
      return applied('Uporządkowano kolejność menu.');
    }

    return unsupported(prompt);
  }
}
