import { ElementAction } from '../lib/documentTree';

/**
 * What the open document can and cannot do, and why.
 *
 * Nodera now edits two kinds of document: the node tree it composes itself,
 * and a page someone else designed, kept as HTML, CSS and assets. The chrome
 * around them is the same workspace, so a control that does not apply to the
 * open document must say so rather than vanish — a tool that disappears looks
 * like a bug, and a tool that is silently inert is worse.
 *
 * A feature absent from the map is supported. A feature present is not, and
 * its value is the sentence shown to the user.
 */

export type EditorFeature =
  | 'pages'
  | 'directions'
  | 'tokens'
  | 'responsiveScope'
  | 'commands'
  | 'proposal'
  | 'checklist'
  | 'opticalNudge';

export type UnsupportedFeatures = Partial<Record<EditorFeature, string>>;

/** Everything the node editor has always been able to do. */
export const NODE_DOCUMENT_CAPABILITIES: UnsupportedFeatures = {};

/**
 * A page designed by Manus, opened from its own source.
 *
 * The reasons are specific on purpose. "Nie działa" tells the user nothing;
 * saying that a page from Manus is a single HTML file explains both why the
 * control is off and what would have to change for it to be on.
 */
export const SITE_DOCUMENT_CAPABILITIES: UnsupportedFeatures = {
  pages: 'Strona z Manusa to pojedynczy dokument HTML — nie ma podstron do przełączania.',
  directions:
    'Kierunki projektowe są wariantami dokumentu Nodery. Strona z Manusa ma jeden, własny projekt graficzny.',
  tokens:
    'Globalne tokeny opisują dokument Nodery. Ta strona ma własny arkusz stylów autora — edytuj kolory na zaznaczonym elemencie.',
  responsiveScope:
    'Zakres edycji zapisuje nadpisania per breakpoint. Dla stron z Manusa zmiana stylu dotyczy na razie wszystkich szerokości.',
  commands:
    'Polecenia tekstowe działają na modelu węzłowym Nodery. Dla stron z Manusa nie są jeszcze obsługiwane.',
  proposal: 'Propozycja dla klienta czyta model węzłowy Nodery.',
  checklist: 'Przygotowanie do publikacji czyta model węzłowy Nodery.',
  opticalNudge:
    'Korekta optyczna przesuwa węzeł Nodery. Dla stron z Manusa zmieniaj odstępy w sekcji „Rozmiar".',
};

/** The edit actions a site element offers, given what it is. */
export function siteActionsFor(options: {
  hasOwnText: boolean;
  isImage: boolean;
}): ElementAction[] {
  const actions: ElementAction[] = [];
  if (options.hasOwnText || options.isImage) actions.push('text');
  actions.push('size', 'appearance');
  return actions;
}
