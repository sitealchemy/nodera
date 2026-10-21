import { ProjectState, NodeElement, ResponsiveScope } from '../types/document';
import { resolveOpticalOffset } from '../render/resolveStyles';
import {
  Direction,
  SCALABLE_UNITS,
  directionDelta,
  formatCssLength,
  parseCssLength,
  parseDirection,
  parseGrowShrink,
  parsePercent,
  parsePixels,
  scaleLength,
} from './commandValues';
import { OperationKind, SCOPE_NAME, checkScope } from './scopeCapability';

const DIRECTION_LABEL: Record<Direction, string> = {
  left: 'w lewo',
  right: 'w prawo',
  up: 'w górę',
  down: 'w dół',
};

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

    /** Styles that actually apply at the current scope. */
    const effectiveStyles = (node: NodeElement) =>
      scope !== 'all' && node.responsiveOverrides?.[scope]
        ? { ...node.styles, ...node.responsiveOverrides[scope] }
        : node.styles;

    const applied = (summary: string): AIExecutionResult => ({
      kind: 'applied',
      summary,
      detailedSteps: steps,
      affectedElementIds: affectedIds,
      updatedProject: cloned,
    });

    const unchangedResult = (summary: string, note?: string): AIExecutionResult => ({
      kind: 'unchanged',
      summary,
      detailedSteps: note ? [note] : [],
      affectedElementIds: affectedIds,
    });

    /** Refusal for an operation that cannot honour the selected scope. */
    const scopeRefusal = (kind: OperationKind): AIExecutionResult | null => {
      const check = checkScope(kind, scope);
      if (check.allowed) return null;
      return {
        kind: 'needsClarification',
        summary: check.reason!,
        detailedSteps: [check.hint!],
        affectedElementIds: [],
      };
    };

    const scopeNote = scope === 'all' ? '' : ` (zakres: ${SCOPE_NAME[scope]})`;

    // CASE 1: expose the workshops section — structural, not scopable
    if (p.includes('warsztat') && (p.includes('eksponuj') || p.includes('wyżej') || p.includes('pokaż'))) {
      const refusal = scopeRefusal('structure');
      if (refusal) return refusal;

      const rootChildren = activePage.root.children ?? [];
      const workshopIndex = rootChildren.findIndex((n) => n.id.includes('workshop'));
      const heroIndex = rootChildren.findIndex((n) => n.id.includes('hero'));

      if (workshopIndex === -1 || heroIndex === -1) {
        return unchangedResult(
          'Ta podstrona nie ma sekcji warsztatów do wyeksponowania.',
          `Sprawdzono podstronę: ${activePage.name}.`,
        );
      }
      if (workshopIndex <= heroIndex) {
        affectedIds.push(rootChildren[workshopIndex].id);
        return unchangedResult(
          'Sekcja warsztatów jest już wyeksponowana.',
          'Znajduje się bezpośrednio pod główną sekcją.',
        );
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

    // CASE 2: recolour buttons — a style operation, so it honours the scope
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

      const isButton = (node: NodeElement) =>
        node.tag === 'button' || node.tokenRef === 'buttonPrimary';

      if (scope === 'all') {
        const currentTokens = activeDirection.tokens ?? cloned.tokens;
        if (currentTokens.accentCopper.toLowerCase() === targetColor.toLowerCase()) {
          return unchangedResult(`Przyciski już mają kolor ${colorName}.`);
        }

        // Only this direction is touched; the others keep their own look.
        const nextTokens = { ...currentTokens, accentCopper: targetColor };
        activeDirection.tokens = nextTokens;
        cloned.tokens = nextTokens;

        Object.values(activeDirection.pages).forEach((page) => {
          const walk = (node: NodeElement) => {
            if (isButton(node)) {
              node.styles.backgroundColor = targetColor;
              affectedIds.push(node.id);
            }
            node.children?.forEach(walk);
          };
          walk(page.root);
        });

        steps.push(`Zmieniono wspólny token koloru przycisków na ${colorName} (${targetColor}).`);
        steps.push(
          `Zastosowano na ${Object.keys(activeDirection.pages).length} podstronach kierunku ${activeDirection.name}.`,
        );
        steps.push('Pozostałe kierunki zachowały swój wygląd.');
        return applied(`Zmieniono kolor przycisków na ${colorName}.`);
      }

      // Local scope: write overrides only. The shared token and every other
      // direction are left exactly as they were.
      let changed = 0;
      Object.values(activeDirection.pages).forEach((page) => {
        const walk = (node: NodeElement) => {
          if (isButton(node)) {
            const current = node.responsiveOverrides?.[scope]?.backgroundColor;
            if (String(current ?? '').toLowerCase() !== targetColor.toLowerCase()) {
              node.responsiveOverrides = node.responsiveOverrides ?? {};
              node.responsiveOverrides[scope] = {
                ...node.responsiveOverrides[scope],
                backgroundColor: targetColor,
              };
              changed += 1;
              affectedIds.push(node.id);
            }
          }
          node.children?.forEach(walk);
        };
        walk(page.root);
      });

      if (changed === 0) {
        return unchangedResult(`Przyciski już mają kolor ${colorName}${scopeNote}.`);
      }

      steps.push(`Dodano nadpisanie koloru przycisków${scopeNote}: ${colorName} (${targetColor}).`);
      steps.push('Wspólny token i pozostałe zakresy pozostały bez zmian.');
      return applied(`Zmieniono kolor przycisków na ${colorName}${scopeNote}.`);
    }

    // CASE 3: resize the selected element by a stated percentage
    const growShrink = parseGrowShrink(p);
    if (growShrink) {
      if (!context.selectedElementId) return needsSelection('który chcesz przeskalować');
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (!targetNode) return needsSelection('który chcesz przeskalować');

      const percent = parsePercent(p);
      if (!percent.ok) {
        return {
          kind: 'needsClarification',
          summary:
            percent.reason === 'ambiguous'
              ? 'Polecenie zawiera kilka wartości procentowych.'
              : 'O ile procent zmienić rozmiar?',
          detailedSteps: [
            percent.reason === 'invalid'
              ? 'Podaj wartość z zakresu 1–1000%.'
              : 'Napisz np. „powiększ o 50%" albo „zmniejsz o 25%".',
          ],
          affectedElementIds: [targetNode.id],
        };
      }

      const delta = growShrink === 'grow' ? percent.value : -percent.value;
      const styles = effectiveStyles(targetNode);

      // The active action decides which property is meant when both exist.
      const property =
        context.actionType === 'position'
          ? null
          : styles.fontSize
            ? 'fontSize'
            : styles.height
              ? 'height'
              : styles.width
                ? 'width'
                : null;

      if (!property) {
        return unchangedResult(
          `Element ${targetNode.name} nie ma rozmiaru, który mógłbym przeskalować.`,
          'Brak ustawionego fontSize, height ani width.',
        );
      }

      // A percentage height scaled by a percentage is relative to a container
      // we cannot see from here, so it is refused rather than guessed.
      const current = parseCssLength(styles[property] as string);
      if (current && current.unit === '%' && property !== 'fontSize') {
        return {
          kind: 'unsupported',
          summary: `Nie mogę przeskalować wartości procentowej (${styles[property]}) bez kontekstu rodzica.`,
          detailedSteps: ['Ustaw rozmiar w px, rem lub em, albo zmień go ręcznie w inspektorze.'],
          affectedElementIds: [targetNode.id],
        };
      }

      const outcome = scaleLength(styles[property] as string, delta);
      if (!outcome.ok) {
        if (outcome.reason === 'unsupported-unit') {
          return {
            kind: 'unsupported',
            summary: `Nie obsługuję jednostki w wartości ${styles[property]}.`,
            detailedSteps: [`Obsługiwane jednostki: ${SCALABLE_UNITS.join(', ')}.`],
            affectedElementIds: [targetNode.id],
          };
        }
        if (outcome.reason === 'out-of-range') {
          return {
            kind: 'unsupported',
            summary: `Wynik zmiany o ${delta}% nie jest poprawnym rozmiarem.`,
            detailedSteps: ['Rozmiar musi pozostać większy od zera.'],
            affectedElementIds: [targetNode.id],
          };
        }
        return {
          kind: 'unsupported',
          summary: `Nie potrafię odczytać wartości ${String(styles[property])}.`,
          detailedSteps: [],
          affectedElementIds: [targetNode.id],
        };
      }

      if (outcome.unchanged) {
        affectedIds.push(targetNode.id);
        return unchangedResult(
          `Rozmiar ${targetNode.name} pozostaje bez zmian.`,
          `${formatCssLength(outcome.next)} to ta sama wartość co obecna.`,
        );
      }

      const before = styles[property] as string;
      writeStyle(targetNode, { [property]: formatCssLength(outcome.next) });
      steps.push(
        `${property}: ${before} → ${formatCssLength(outcome.next)} (${delta > 0 ? '+' : ''}${delta}%)${scopeNote}.`,
      );
      affectedIds.push(targetNode.id);
      return applied(`Zmieniono rozmiar ${targetNode.name} o ${delta > 0 ? '+' : ''}${delta}%.`);
    }

    // CASE 4: optical nudge by a stated distance
    if (p.includes('korekt') || p.includes('przesuń') || p.includes('przesun') || p.includes('offset')) {
      if (!context.selectedElementId) return needsSelection('który chcesz przesunąć');
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (!targetNode) return needsSelection('który chcesz przesunąć');

      const direction = parseDirection(p);
      if (direction === null) {
        return {
          kind: 'needsClarification',
          summary: 'W którą stronę przesunąć element?',
          detailedSteps: ['Podaj kierunek: w lewo, w prawo, w górę albo w dół.'],
          affectedElementIds: [targetNode.id],
        };
      }
      if (direction === 'ambiguous') {
        return {
          kind: 'needsClarification',
          summary: 'Polecenie wskazuje więcej niż jeden kierunek.',
          detailedSteps: ['Wykonaj przesunięcie w jednej osi naraz.'],
          affectedElementIds: [targetNode.id],
        };
      }

      // Pixels only: an optical offset is a pixel nudge by definition.
      const distance = parsePixels(p, true);
      if (!distance.ok) {
        const summary =
          distance.reason === 'ambiguous'
            ? 'Polecenie zawiera kilka wartości.'
            : distance.reason === 'invalid'
              ? 'Korekta optyczna działa w pikselach.'
              : 'O ile pikseli przesunąć element?';
        return {
          kind: 'needsClarification',
          summary,
          detailedSteps: ['Napisz np. „przesuń o 20 px w prawo" albo „przesuń o 2,5 px w lewo".'],
          affectedElementIds: [targetNode.id],
        };
      }

      if (distance.value === 0) {
        affectedIds.push(targetNode.id);
        return unchangedResult('Przesunięcie o 0 px nic nie zmienia.');
      }

      const { x: dx, y: dy } = directionDelta(direction, distance.value);
      const current = resolveOpticalOffset(targetNode, scope) ?? { x: 0, y: 0 };
      const next = {
        x: Math.round((current.x + dx) * 1000) / 1000,
        y: Math.round((current.y + dy) * 1000) / 1000,
      };

      if (scope === 'all') {
        targetNode.opticalOffset = next;
      } else {
        targetNode.opticalOffsets = targetNode.opticalOffsets ?? {};
        targetNode.opticalOffsets[scope] = next;
      }

      steps.push(`Korekta optyczna: X ${next.x}px, Y ${next.y}px${scopeNote}.`);
      steps.push('Zmiana nie rozpycha sąsiadujących elementów.');
      affectedIds.push(targetNode.id);
      return applied(
        `Przesunięto ${targetNode.name} o ${distance.value}px (${DIRECTION_LABEL[direction]}).`,
      );
    }

    // CASE 5: move Kontakt to the end of the nav — structural, not scopable
    if (p.includes('kontakt') && p.includes('koniec')) {
      const refusal = scopeRefusal('structure');
      if (refusal) return refusal;

      const navNode = findNode(activePage.root, 'materia-menu');
      if (!navNode?.children?.length) {
        return unchangedResult('Ta podstrona nie ma menu głównego do uporządkowania.');
      }
      const idx = navNode.children.findIndex((c) => c.name.toLowerCase().includes('kontakt'));
      if (idx === -1) {
        return unchangedResult('W menu nie ma pozycji Kontakt.');
      }
      if (idx === navNode.children.length - 1) {
        affectedIds.push(navNode.children[idx].id);
        return unchangedResult('Pozycja Kontakt jest już na końcu menu.');
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
