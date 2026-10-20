import { describe, expect, it } from 'vitest';
import { AIAdapter, AICommandContext } from './aiAdapter';
import { StorageService } from './storage';
import { INITIAL_SPLOT_PROJECT } from '../data/splotDemo';
import { NodeElement, ProjectState } from '../types/document';

const freshProject = (): ProjectState =>
  StorageService.migrateProject(JSON.parse(JSON.stringify(INITIAL_SPLOT_PROJECT)));

const ctx = (over: Partial<AICommandContext> = {}): AICommandContext => ({
  projectName: 'Pracownia Splot',
  directionName: 'Materia',
  pageSlug: 'start',
  selectedElementId: null,
  selectedElementName: null,
  actionType: 'none',
  responsiveScope: 'all',
  ...over,
});

function findNode(root: NodeElement, id: string): NodeElement | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Every button colour in a direction, so leakage between directions is visible. */
function buttonColours(project: ProjectState, directionId: string): string[] {
  const out: string[] = [];
  Object.values(project.directions[directionId].pages).forEach((page) => {
    const walk = (node: NodeElement) => {
      if (node.tag === 'button' || node.tokenRef === 'buttonPrimary') {
        if (node.styles.backgroundColor) out.push(String(node.styles.backgroundColor));
      }
      node.children?.forEach(walk);
    };
    walk(page.root);
  });
  return out;
}

describe('result kinds', () => {
  // The regression: the parser used to end with a catch-all that reported
  // success, so an unrecognised instruction produced a green tick, a history
  // entry and no change whatsoever.
  it('reports an unrecognised command as unsupported, with no document', () => {
    const result = AIAdapter.executeCommand('zrób mi kawę', ctx(), freshProject());
    expect(result.kind).toBe('unsupported');
    expect(result.updatedProject).toBeUndefined();
  });

  it('reports an empty command as unsupported', () => {
    expect(AIAdapter.executeCommand('   ', ctx(), freshProject()).kind).toBe('unsupported');
  });

  it('asks for a selection instead of silently doing nothing', () => {
    const result = AIAdapter.executeCommand('powiększ o 20%', ctx(), freshProject());
    expect(result.kind).toBe('needsClarification');
    expect(result.updatedProject).toBeUndefined();
  });

  it('asks which colour when none is recognised', () => {
    const result = AIAdapter.executeCommand('zmień kolor przycisków', ctx(), freshProject());
    expect(result.kind).toBe('needsClarification');
  });

  it('asks for a direction when a nudge has none', () => {
    const result = AIAdapter.executeCommand(
      'korekta optyczna',
      ctx({ selectedElementId: 'materia-hero-heading' }),
      freshProject(),
    );
    expect(result.kind).toBe('needsClarification');
  });

  it('reports unchanged rather than applied when nothing needs doing', () => {
    const project = freshProject();
    // Materia's accent already is the copper value.
    const result = AIAdapter.executeCommand('zmień kolor przycisków na miedziany', ctx(), project);
    expect(result.kind).toBe('unchanged');
    expect(result.updatedProject).toBeUndefined();
  });

  it('returns applied with a document for a real change', () => {
    const result = AIAdapter.executeCommand(
      'zmień kolor przycisków na kobaltowy',
      ctx(),
      freshProject(),
    );
    expect(result.kind).toBe('applied');
    expect(result.updatedProject).toBeDefined();
  });
});

describe('direction isolation', () => {
  // The regression: handleUpdateTokens and the colour command both walked
  // every direction, so trying a colour on one concept repainted the others.
  it('recolouring one direction leaves the others untouched', () => {
    const before = freshProject();
    const otherIds = Object.keys(before.directions).filter((id) => id !== before.activeDirectionId);
    const otherBefore = otherIds.map((id) => buttonColours(before, id));

    const result = AIAdapter.executeCommand(
      'zmień kolor przycisków na kobaltowy',
      ctx(),
      before,
    );
    expect(result.kind).toBe('applied');
    const after = result.updatedProject!;

    // The active direction changed...
    expect(buttonColours(after, after.activeDirectionId).every((c) => c === '#24486E')).toBe(true);
    // ...and no other direction did.
    otherIds.forEach((id, i) => {
      expect(buttonColours(after, id)).toEqual(otherBefore[i]);
    });
  });

  it('writes the accent onto the active direction, not just the project', () => {
    const result = AIAdapter.executeCommand(
      'zmień kolor przycisków na leśną szałwię',
      ctx(),
      freshProject(),
    );
    const after = result.updatedProject!;
    expect(after.directions[after.activeDirectionId].tokens?.accentCopper).toBe('#3E5748');

    Object.entries(after.directions)
      .filter(([id]) => id !== after.activeDirectionId)
      .forEach(([, dir]) => expect(dir.tokens?.accentCopper).not.toBe('#3E5748'));
  });

  it('does not touch existing snapshots', () => {
    const before = freshProject();
    const snapshotBefore = JSON.stringify(before.snapshots);

    const after = AIAdapter.executeCommand(
      'zmień kolor przycisków na grafitowy',
      ctx(),
      before,
    ).updatedProject!;

    expect(JSON.stringify(after.snapshots)).toBe(snapshotBefore);
  });

  it('leaves the input project untouched', () => {
    const before = freshProject();
    const serialised = JSON.stringify(before);
    AIAdapter.executeCommand('zmień kolor przycisków na kobaltowy', ctx(), before);
    expect(JSON.stringify(before)).toBe(serialised);
  });
});

describe('responsive scope', () => {
  const selected = { selectedElementId: 'materia-hero-heading' };

  it('a resize in mobile scope writes an override and leaves desktop alone', () => {
    const before = freshProject();
    const baseSize = findNode(before.directions.materia.pages.start.root, 'materia-hero-heading')!
      .styles.fontSize;

    const after = AIAdapter.executeCommand(
      'powiększ o 20%',
      ctx({ ...selected, responsiveScope: 'mobile' }),
      before,
    ).updatedProject!;

    const node = findNode(after.directions.materia.pages.start.root, 'materia-hero-heading')!;
    expect(node.styles.fontSize).toBe(baseSize);
    expect(node.responsiveOverrides?.mobile?.fontSize).toBeDefined();
    expect(node.responsiveOverrides?.mobile?.fontSize).not.toBe(baseSize);
  });

  it('a resize in tablet scope writes a tablet override, touching neither desktop nor mobile', () => {
    const before = freshProject();
    const beforeNode = findNode(
      before.directions.materia.pages.start.root,
      'materia-hero-heading',
    )!;
    const baseSize = beforeNode.styles.fontSize;
    // This node ships with a mobile override, which makes it the right probe:
    // a tablet edit must not disturb a sibling scope.
    const mobileBefore = JSON.stringify(beforeNode.responsiveOverrides?.mobile);
    expect(mobileBefore).toBeDefined();

    const after = AIAdapter.executeCommand(
      'powiększ o 20%',
      ctx({ ...selected, responsiveScope: 'tablet' }),
      before,
    ).updatedProject!;

    const node = findNode(after.directions.materia.pages.start.root, 'materia-hero-heading')!;
    expect(node.styles.fontSize).toBe(baseSize);
    expect(node.responsiveOverrides?.tablet?.fontSize).toBeDefined();
    expect(JSON.stringify(node.responsiveOverrides?.mobile)).toBe(mobileBefore);
  });

  it('a nudge in mobile scope does not move desktop', () => {
    const after = AIAdapter.executeCommand(
      'przesuń o 1px w lewo',
      ctx({ ...selected, responsiveScope: 'mobile' }),
      freshProject(),
    ).updatedProject!;

    const node = findNode(after.directions.materia.pages.start.root, 'materia-hero-heading')!;
    expect(node.opticalOffsets?.mobile).toEqual({ x: -1, y: 0 });
    expect(node.opticalOffset).toBeUndefined();
  });

  it('a nudge in the shared scope writes the shared offset', () => {
    const after = AIAdapter.executeCommand(
      'przesuń o 1px w prawo',
      ctx({ ...selected, responsiveScope: 'all' }),
      freshProject(),
    ).updatedProject!;

    const node = findNode(after.directions.materia.pages.start.root, 'materia-hero-heading')!;
    expect(node.opticalOffset).toEqual({ x: 1, y: 0 });
    expect(node.opticalOffsets).toBeUndefined();
  });
});

describe('menu ordering', () => {
  /** The demo nav already ends with Kontakt, so move it first to have work to do. */
  function withKontaktFirst(): ProjectState {
    const p = freshProject();
    const nav = findNode(p.directions.materia.pages.start.root, 'materia-menu')!;
    const idx = nav.children!.findIndex((c) => c.name.toLowerCase().includes('kontakt'));
    const [item] = nav.children!.splice(idx, 1);
    nav.children!.unshift(item);
    return p;
  }

  it('moves Kontakt to the end', () => {
    const result = AIAdapter.executeCommand('kontakt na koniec menu', ctx(), withKontaktFirst());
    expect(result.kind).toBe('applied');

    const nav = findNode(
      result.updatedProject!.directions.materia.pages.start.root,
      'materia-menu',
    )!;
    expect(nav.children![nav.children!.length - 1].name.toLowerCase()).toContain('kontakt');
  });

  it('reports unchanged when it is already last, without producing a document', () => {
    // This is the demo's own starting state.
    const result = AIAdapter.executeCommand('kontakt na koniec menu', ctx(), freshProject());
    expect(result.kind).toBe('unchanged');
    expect(result.updatedProject).toBeUndefined();
  });
});
