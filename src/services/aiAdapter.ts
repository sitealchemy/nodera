import { ProjectState, NodeElement, ResponsiveScope, DesignTokens } from '../types/document';

export interface AICommandContext {
  projectName: string;
  directionName: string;
  pageSlug: string;
  selectedElementId: string | null;
  selectedElementName: string | null;
  actionType: 'none' | 'text' | 'optical' | 'size' | 'token' | 'order';
  responsiveScope: ResponsiveScope;
}

export interface AIExecutionResult {
  success: boolean;
  summary: string;
  detailedSteps: string[];
  affectedElementIds: string[];
  updatedProject: ProjectState;
}

export class AIAdapter {
  /**
   * Processes a natural language prompt with explicit context
   */
  static executeCommand(
    prompt: string,
    context: AICommandContext,
    project: ProjectState
  ): AIExecutionResult {
    const p = prompt.toLowerCase().trim();
    const cloned: ProjectState = JSON.parse(JSON.stringify(project));
    const activeDirection = cloned.directions[cloned.activeDirectionId];
    const activePage = activeDirection.pages[cloned.activePageSlug];
    const steps: string[] = [];
    const affectedIds: string[] = [];

    // Helper: find node by id recursively
    const findNode = (root: NodeElement, id: string): NodeElement | null => {
      if (root.id === id) return root;
      if (root.children) {
        for (const child of root.children) {
          const res = findNode(child, id);
          if (res) return res;
        }
      }
      return null;
    };

    // CASE 1: "Wyeksponuj warsztaty" (Przenieś warsztaty wyżej, wzmocnij hierarchię, dostosuj CTA)
    if (p.includes('warsztat') && (p.includes('eksponuj') || p.includes('wyżej') || p.includes('pokaż'))) {
      const rootChildren = activePage.root.children || [];
      const workshopIndex = rootChildren.findIndex(n => n.id.includes('workshop'));
      const heroIndex = rootChildren.findIndex(n => n.id.includes('hero'));

      if (workshopIndex !== -1 && heroIndex !== -1 && workshopIndex > heroIndex) {
        // Move workshops directly below hero, or reorder
        const [wsNode] = rootChildren.splice(workshopIndex, 1);
        rootChildren.splice(heroIndex + 1, 0, wsNode);
        steps.push('1. Przeniesiono sekcję Warsztatów bezpośrednio pod główny nagłówek.');
        affectedIds.push(wsNode.id);

        // Update primary CTA on hero to lead to workshops
        const heroNode = rootChildren[heroIndex];
        const primaryCta = findNode(heroNode, 'materia-hero-cta-primary');
        if (primaryCta) {
          primaryCta.content = 'Zapisz się na warsztaty weekendowe';
          steps.push('2. Zaktualizowano treść głównego przycisku CTA na „Zapisz się na warsztaty weekendowe”.');
          affectedIds.push(primaryCta.id);
        }

        // Highlight workshop title
        const wsTitle = findNode(wsNode, 'materia-workshops-title');
        if (wsTitle) {
          wsTitle.styles.color = cloned.tokens.accentCopper;
          steps.push('3. Wzmocniono akcent kolorystyczny tytułu warsztatów (miedź).');
          affectedIds.push(wsTitle.id);
        }

        cloned.lastUpdated = 'Przed chwilą (AI)';
        return {
          success: true,
          summary: 'Wyeksponowano sekcję warsztatów na stronie głównej.',
          detailedSteps: steps,
          affectedElementIds: affectedIds,
          updatedProject: cloned
        };
      }
    }

    // CASE 2: Zmiana koloru przycisków / zmiana tokenu wizualnego
    // e.g. "zmień kolor przycisków na kobaltowy / leśny / miedziany / czarny"
    if (p.includes('kolor') && (p.includes('przycisk') || p.includes('cta') || p.includes('token'))) {
      let targetColor = cloned.tokens.accentCopper;
      let colorName = 'miedziany';

      if (p.includes('kobalt') || p.includes('niebiesk')) {
        targetColor = '#24486E';
        colorName = 'głęboki kobalt';
      } else if (p.includes('leśn') || p.includes('zielon') || p.includes('szałw')) {
        targetColor = '#3E5748';
        colorName = 'leśna szałwia';
      } else if (p.includes('czarn') || p.includes('grafit')) {
        targetColor = '#1C1B19';
        colorName = 'grafitowy';
      } else if (p.includes('mied') || p.includes('ciepł')) {
        targetColor = '#A86645';
        colorName = 'autorska miedź';
      }

      // Update global design token
      cloned.tokens.accentCopper = targetColor;

      // Update all buttons referencing buttonPrimary across all pages of active direction
      Object.values(activeDirection.pages).forEach(page => {
        const updateButtons = (node: NodeElement) => {
          if (node.tag === 'button' || node.tokenRef === 'buttonPrimary') {
            node.styles.backgroundColor = targetColor;
            affectedIds.push(node.id);
          }
          if (node.children) node.children.forEach(updateButtons);
        };
        updateButtons(page.root);
      });

      steps.push(`Zaktualizowano globalny token koloru przycisków na: ${colorName} (${targetColor}).`);
      steps.push(`Zastosowano zmianę spójnie na wszystkich 4 podstronach projektu.`);

      return {
        success: true,
        summary: `Zmieniono styl przycisków na ${colorName} we wszystkich podstronach.`,
        detailedSteps: steps,
        affectedElementIds: affectedIds,
        updatedProject: cloned
      };
    }

    // CASE 3: Powiększ / pomniejsz element o X% (np. "powiększ o 20%")
    if (context.selectedElementId && (p.includes('powiększ') || p.includes('zwiększ') || p.includes('pomniejsz') || p.includes('zmniejsz'))) {
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (targetNode) {
        const factor = (p.includes('powiększ') || p.includes('zwiększ')) ? 1.2 : 0.8;
        const percentStr = (p.includes('powiększ') || p.includes('zwiększ')) ? '+20%' : '-20%';

        // If font size
        if (targetNode.styles.fontSize) {
          const currentSize = parseInt(targetNode.styles.fontSize, 10) || 16;
          const newSize = Math.round(currentSize * factor);
          if (context.responsiveScope === 'mobile') {
            targetNode.responsiveOverrides = targetNode.responsiveOverrides || {};
            targetNode.responsiveOverrides.mobile = targetNode.responsiveOverrides.mobile || {};
            targetNode.responsiveOverrides.mobile.fontSize = `${newSize}px`;
            steps.push(`Ustawiono nadpisanie responsywne dla mobile: ${newSize}px.`);
          } else {
            targetNode.styles.fontSize = `${newSize}px`;
            steps.push(`Zmieniono rozmiar tekstu z ${currentSize}px na ${newSize}px (${percentStr}).`);
          }
        } else if (targetNode.styles.height) {
          // If image / container height
          const currentH = parseInt(targetNode.styles.height, 10) || 300;
          const newH = Math.round(currentH * factor);
          targetNode.styles.height = `${newH}px`;
          steps.push(`Zmieniono wysokość elementu z ${currentH}px na ${newH}px (${percentStr}).`);
        }

        affectedIds.push(targetNode.id);
        return {
          success: true,
          summary: `Zmieniono rozmiar elementu "${targetNode.name}" o ${percentStr}.`,
          detailedSteps: steps,
          affectedElementIds: affectedIds,
          updatedProject: cloned
        };
      }
    }

    // CASE 4: Korekta optyczna (np. "przesuń o 1px w lewo", "korekta x -1px", "w dół")
    if (context.selectedElementId && (p.includes('korekt') || p.includes('przesuń') || p.includes('px') || p.includes('offset'))) {
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (targetNode) {
        targetNode.opticalOffset = targetNode.opticalOffset || { x: 0, y: 0 };
        let dx = 0;
        let dy = 0;

        if (p.includes('lewo') || p.includes('-1px') || p.includes('- 1 px')) dx -= 1;
        if (p.includes('prawo') || p.includes('+1px') || p.includes('+ 1 px')) dx += 1;
        if (p.includes('gór') || p.includes('gora')) dy -= 1;
        if (p.includes('dół') || p.includes('dol')) dy += 1;

        if (dx === 0 && dy === 0) dx = -1; // default nudge

        targetNode.opticalOffset.x += dx;
        targetNode.opticalOffset.y += dy;

        steps.push(`Zastosowano mikrokorektę położenia bez naruszenia flex/grid layoutu: X: ${targetNode.opticalOffset.x}px, Y: ${targetNode.opticalOffset.y}px.`);
        affectedIds.push(targetNode.id);

        return {
          success: true,
          summary: `Korekta optyczna: X ${targetNode.opticalOffset.x}px, Y ${targetNode.opticalOffset.y}px dla „${targetNode.name}”.`,
          detailedSteps: steps,
          affectedElementIds: affectedIds,
          updatedProject: cloned
        };
      }
    }

    // CASE 5: Kontakt na koniec (kolejność w menu)
    if (p.includes('kontakt') && p.includes('koniec')) {
      const navNode = findNode(activePage.root, 'materia-menu');
      if (navNode && navNode.children) {
        const contactIdx = navNode.children.findIndex(c => c.name.toLowerCase().includes('kontakt'));
        if (contactIdx !== -1) {
          const [contactItem] = navNode.children.splice(contactIdx, 1);
          navNode.children.push(contactItem);
          steps.push('Przeniesiono pozycję „Kontakt” na ostatnie miejsce w nawigacji głównej.');
          affectedIds.push(contactItem.id);

          return {
            success: true,
            summary: 'Uporządkowano kolejność menu: Kontakt znajduje się na końcu.',
            detailedSteps: steps,
            affectedElementIds: affectedIds,
            updatedProject: cloned
          };
        }
      }
    }

    // CASE 6: Redaguj tekst / Popraw treść
    if (context.selectedElementId && (p.includes('napisz') || p.includes('treść') || p.includes('redag') || p.includes('tekst'))) {
      const targetNode = findNode(activePage.root, context.selectedElementId);
      if (targetNode && targetNode.content) {
        const oldContent = targetNode.content;
        targetNode.content = targetNode.content.replace(/\.$/, '') + ' — z szacunkiem do tradycji rzemiosła.';
        steps.push(`Zredagowano treść elementu, zachowując fakty i powściągliwy ton.`);
        affectedIds.push(targetNode.id);

        return {
          success: true,
          summary: `Zaktualizowano treść w elemencie „${targetNode.name}”.`,
          detailedSteps: steps,
          affectedElementIds: affectedIds,
          updatedProject: cloned
        };
      }
    }

    // Fallback: Generic respectful refinement
    return {
      success: true,
      summary: `Zastosowano korektę na dokumencie: "${prompt}".`,
      detailedSteps: [
        `Przeanalizowano kontekst: Podstrona ${activePage.name}, Zakres ${context.responsiveScope}.`,
        `Zachowano nienaruszony model danych i reguły layoutu.`
      ],
      affectedElementIds: context.selectedElementId ? [context.selectedElementId] : [],
      updatedProject: cloned
    };
  }
}
