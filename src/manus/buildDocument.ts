import {
  DesignTokens,
  DirectionOption,
  ElementStyles,
  NodeElement,
  PageDocument,
  ProjectState,
  CURRENT_SCHEMA_VERSION,
} from '../types/document';
import { NoderaPageSpec, SpecAction, SpecSection, SpecTokens } from './pageSpec';

/**
 * Turns a validated NoderaPageSpec into a Nodera document.
 *
 * All structure, tags, ids, styles and responsive overrides are produced here,
 * by code — never taken from the model. That is what makes the result
 * selectable, editable, exportable and safe: the importer can only build
 * shapes the renderer already understands.
 *
 * Ids are deterministic (`s{section}-{role}` and `s{section}-i{item}-{role}`),
 * so the same spec always produces the same document and a saved selection
 * stays meaningful across a re-import.
 */

const FONT_STACK = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export function tokensFromSpec(spec: SpecTokens): DesignTokens {
  return {
    primaryColor: spec.text,
    accentCopper: spec.accent,
    surfaceColor: spec.surface,
    textColor: spec.text,
    fontFamily: spec.headingFont,
    buttonRadius: spec.radius,
    buttonVariant: 'fill',
  };
}

/** Internal slugs become real document links; anything else is kept verbatim. */
function normaliseHref(href: string, knownSlugs: string[]): string {
  const trimmed = href.trim();
  if (!trimmed) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  const slug = trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
  if (knownSlugs.includes(slug)) return `/${slug}`;
  // An unknown path would resolve against the app's own origin; keep it as an
  // in-page anchor instead so the document has no dead external link.
  return `#${slug || 'top'}`;
}

interface BuildContext {
  tokens: SpecTokens;
  knownSlugs: string[];
}

const text = (
  id: string,
  name: string,
  tag: NodeElement['tag'],
  type: NodeElement['type'],
  content: string,
  styles: ElementStyles,
  responsive?: NodeElement['responsiveOverrides'],
): NodeElement => ({
  id,
  name,
  tag,
  type,
  content,
  styles,
  ...(responsive ? { responsiveOverrides: responsive } : {}),
});

const container = (
  id: string,
  name: string,
  tag: NodeElement['tag'],
  type: NodeElement['type'],
  styles: ElementStyles,
  children: NodeElement[],
  responsive?: NodeElement['responsiveOverrides'],
): NodeElement => ({
  id,
  name,
  tag,
  type,
  styles,
  children,
  ...(responsive ? { responsiveOverrides: responsive } : {}),
});

function buttonNode(
  id: string,
  action: SpecAction,
  context: BuildContext,
  primary: boolean,
): NodeElement {
  const href = normaliseHref(action.href, context.knownSlugs);
  const base: ElementStyles = {
    padding: '14px 28px',
    borderRadius: context.tokens.radius,
    fontWeight: '600',
    fontSize: '15px',
    display: 'inline-block',
    textAlign: 'center',
    // A call to action rendered as <a> (tel:, mailto:, another page) must not
    // carry the browser's default link underline.
    textDecoration: 'none',
  };
  // A link that leaves the page stays an <a>; an in-page action is a button.
  const isLink = /^(https?:|mailto:|tel:|\/|#)/.test(href);
  const styles: ElementStyles = primary
    ? { ...base, backgroundColor: context.tokens.accent, color: '#FFFFFF' }
    : {
        ...base,
        backgroundColor: 'transparent',
        color: context.tokens.text,
        borderWidth: '1px',
        borderColor: context.tokens.muted,
        border: `1px solid ${context.tokens.muted}`,
      };

  if (isLink) {
    return {
      id,
      name: primary ? 'Główny przycisk' : 'Przycisk',
      tag: 'a',
      type: 'button',
      content: action.label,
      href,
      ...(primary ? { tokenRef: 'buttonPrimary' } : {}),
      styles,
    };
  }
  return {
    id,
    name: primary ? 'Główny przycisk' : 'Przycisk',
    tag: 'button',
    type: 'button',
    content: action.label,
    ...(primary ? { tokenRef: 'buttonPrimary' } : {}),
    styles,
  };
}

function actionRow(prefix: string, section: SpecSection, context: BuildContext): NodeElement[] {
  if (section.actions.length === 0) return [];
  return [
    container(
      `${prefix}-actions`,
      'Grupa przycisków',
      'div',
      'container',
      { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' },
      section.actions.map((action, index) =>
        buttonNode(`${prefix}-cta-${index + 1}`, action, context, index === 0),
      ),
    ),
  ];
}

function imageNode(prefix: string, section: SpecSection, height: string): NodeElement[] {
  if (!section.image.src) return [];
  return [
    {
      id: `${prefix}-image`,
      name: 'Zdjęcie',
      tag: 'img',
      type: 'image',
      src: section.image.src,
      alt: section.image.alt,
      styles: {
        width: '100%',
        height,
        objectFit: 'cover',
        borderRadius: '12px',
        marginTop: '24px',
      },
      responsiveOverrides: { mobile: { height: '240px' } },
    },
  ];
}

const SECTION_PADDING: ElementStyles = {
  padding: '80px 48px',
  maxWidth: '1200px',
  margin: '0 auto',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const MOBILE_SECTION: Partial<ElementStyles> = { padding: '48px 20px', gap: '18px' };

function headingStyles(context: BuildContext, size: number) {
  return {
    fontSize: `${size}px`,
    fontWeight: '600',
    lineHeight: '1.15',
    color: context.tokens.text,
    fontFamily: FONT_STACK[context.tokens.headingFont],
  };
}

function buildSection(section: SpecSection, index: number, context: BuildContext): NodeElement {
  const prefix = `s${index + 1}`;
  const children: NodeElement[] = [];

  switch (section.kind) {
    case 'nav': {
      const links = section.actions.length
        ? section.actions
        : [{ label: section.heading || 'Start', href: '#top' }];
      return container(
        `${prefix}-nav`,
        'Pasek nawigacji',
        'header',
        'nav',
        {
          padding: '24px 48px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '24px',
          borderBottom: `1px solid ${context.tokens.muted}33`,
          backgroundColor: context.tokens.surface,
        },
        [
          text(
            `${prefix}-logo`,
            'Nazwa / logo',
            'span',
            'text',
            section.heading || 'Strona',
            {
              fontSize: '18px',
              fontWeight: '700',
              letterSpacing: '0.08em',
              color: context.tokens.text,
              fontFamily: FONT_STACK[context.tokens.headingFont],
            },
          ),
          container(
            `${prefix}-menu`,
            'Menu główne',
            'nav',
            'container',
            { display: 'flex', gap: '28px', fontSize: '14px', fontWeight: '500' },
            links.map((action, itemIndex) => ({
              id: `${prefix}-link-${itemIndex + 1}`,
              name: `Link ${action.label || itemIndex + 1}`,
              tag: 'a' as const,
              type: 'text' as const,
              content: action.label,
              href: normaliseHref(action.href, context.knownSlugs),
              styles: { color: context.tokens.text } as ElementStyles,
            })),
            { mobile: { flexWrap: 'wrap', gap: '12px 16px', fontSize: '13px' } },
          ),
        ],
        { mobile: { padding: '16px 20px', flexWrap: 'wrap', gap: '10px' } },
      );
    }

    case 'hero': {
      if (section.subheading)
        children.push(
          text(`${prefix}-kicker`, 'Kicker', 'span', 'badge', section.subheading, {
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: context.tokens.accent,
          }),
        );
      if (section.heading)
        children.push(
          text(`${prefix}-heading`, 'Główny nagłówek', 'h1', 'heading', section.heading, {
            ...headingStyles(context, 56),
            maxWidth: '900px',
          }, { mobile: { fontSize: '34px', lineHeight: '1.2' }, tablet: { fontSize: '44px' } }),
        );
      if (section.body)
        children.push(
          text(`${prefix}-lead`, 'Tekst wprowadzający', 'p', 'text', section.body, {
            fontSize: '18px',
            lineHeight: '1.6',
            color: context.tokens.muted,
            maxWidth: '640px',
          }, { mobile: { fontSize: '16px' } }),
        );
      children.push(...actionRow(prefix, section, context));
      children.push(...imageNode(prefix, section, '520px'));
      break;
    }

    case 'features':
    case 'gallery': {
      if (section.heading)
        children.push(
          text(`${prefix}-heading`, 'Nagłówek sekcji', 'h2', 'heading', section.heading, headingStyles(context, 38), {
            mobile: { fontSize: '27px' },
          }),
        );
      if (section.body)
        children.push(
          text(`${prefix}-desc`, 'Opis sekcji', 'p', 'text', section.body, {
            fontSize: '16px',
            lineHeight: '1.6',
            color: context.tokens.muted,
            maxWidth: '680px',
          }),
        );
      if (section.items.length) {
        children.push(
          container(
            `${prefix}-grid`,
            'Siatka kart',
            'div',
            'grid',
            {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '24px',
            },
            section.items.map((item, itemIndex) => {
              const itemPrefix = `${prefix}-i${itemIndex + 1}`;
              const card: NodeElement[] = [];
              if (item.meta)
                card.push(
                  text(`${itemPrefix}-meta`, 'Etykieta', 'span', 'badge', item.meta, {
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: context.tokens.accent,
                    display: 'block',
                  }),
                );
              if (item.title)
                card.push(
                  text(`${itemPrefix}-title`, 'Tytuł karty', 'h3', 'heading', item.title, {
                    ...headingStyles(context, 21),
                    margin: '10px 0 8px 0',
                  }),
                );
              if (item.body)
                card.push(
                  text(`${itemPrefix}-body`, 'Opis karty', 'p', 'text', item.body, {
                    fontSize: '14px',
                    lineHeight: '1.55',
                    color: context.tokens.muted,
                  }),
                );
              return container(
                `${itemPrefix}-card`,
                `Karta ${itemIndex + 1}`,
                'div',
                'card',
                {
                  padding: '28px',
                  borderRadius: '12px',
                  border: `1px solid ${context.tokens.muted}33`,
                  backgroundColor: context.tokens.surface,
                },
                card,
                { mobile: { padding: '20px' } },
              );
            }),
            { mobile: { gridTemplateColumns: '1fr', gap: '16px' } },
          ),
        );
      }
      children.push(...imageNode(prefix, section, '420px'));
      break;
    }

    case 'cta': {
      if (section.heading)
        children.push(
          text(`${prefix}-heading`, 'Nagłówek wezwania', 'h2', 'heading', section.heading, {
            ...headingStyles(context, 34),
            textAlign: 'center',
          }, { mobile: { fontSize: '25px' } }),
        );
      if (section.body)
        children.push(
          text(`${prefix}-body`, 'Tekst wezwania', 'p', 'text', section.body, {
            fontSize: '17px',
            lineHeight: '1.6',
            color: context.tokens.muted,
            textAlign: 'center',
            maxWidth: '620px',
            margin: '0 auto',
          }),
        );
      const actions = actionRow(prefix, section, context);
      actions.forEach((row) => {
        row.styles.justifyContent = 'center';
      });
      children.push(...actions);
      break;
    }

    case 'contact': {
      if (section.heading)
        children.push(
          text(`${prefix}-heading`, 'Nagłówek kontaktu', 'h2', 'heading', section.heading, headingStyles(context, 34)),
        );
      if (section.body)
        children.push(
          text(`${prefix}-body`, 'Dane kontaktowe', 'p', 'text', section.body, {
            fontSize: '16px',
            lineHeight: '1.7',
            color: context.tokens.muted,
            whiteSpace: 'pre-line',
          }),
        );
      section.items.forEach((item, itemIndex) => {
        if (!item.title && !item.body) return;
        children.push(
          text(
            `${prefix}-i${itemIndex + 1}-line`,
            item.title || `Informacja ${itemIndex + 1}`,
            'p',
            'text',
            [item.title, item.body].filter(Boolean).join(' — '),
            { fontSize: '15px', color: context.tokens.muted },
          ),
        );
      });
      children.push(...actionRow(prefix, section, context));
      break;
    }

    case 'footer': {
      return container(
        `${prefix}-footer`,
        'Stopka strony',
        'footer',
        'container',
        {
          padding: '40px 48px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          borderTop: `1px solid ${context.tokens.muted}33`,
          fontSize: '13px',
          color: context.tokens.muted,
        },
        [
          text(`${prefix}-note`, 'Treść stopki', 'p', 'text', section.body || section.heading, {
            fontSize: '13px',
            color: context.tokens.muted,
          }),
          ...section.actions.slice(0, 2).map((action, itemIndex) => ({
            id: `${prefix}-link-${itemIndex + 1}`,
            name: `Link ${action.label}`,
            tag: 'a' as const,
            type: 'text' as const,
            content: action.label,
            href: normaliseHref(action.href, context.knownSlugs),
            styles: { color: context.tokens.accent } as ElementStyles,
          })),
        ],
        { mobile: { padding: '28px 20px' } },
      );
    }

    case 'text':
    default: {
      if (section.heading)
        children.push(
          text(`${prefix}-heading`, 'Nagłówek', 'h2', 'heading', section.heading, headingStyles(context, 34), {
            mobile: { fontSize: '25px' },
          }),
        );
      if (section.subheading)
        children.push(
          text(`${prefix}-sub`, 'Podtytuł', 'p', 'text', section.subheading, {
            fontSize: '17px',
            color: context.tokens.accent,
            fontWeight: '600',
          }),
        );
      if (section.body)
        children.push(
          text(`${prefix}-body`, 'Treść', 'p', 'text', section.body, {
            fontSize: '17px',
            lineHeight: '1.7',
            color: context.tokens.muted,
            maxWidth: '760px',
            whiteSpace: 'pre-line',
          }, { mobile: { fontSize: '16px' } }),
        );
      children.push(...actionRow(prefix, section, context));
      children.push(...imageNode(prefix, section, '400px'));
      break;
    }
  }

  // A section that produced nothing still needs a body, or it would be an
  // invisible node the user cannot select or delete.
  if (children.length === 0) {
    children.push(
      text(`${prefix}-empty`, 'Pusta sekcja', 'p', 'text', section.heading || '…', {
        fontSize: '16px',
        color: context.tokens.muted,
      }),
    );
  }

  return container(
    `${prefix}-section`,
    sectionName(section, index),
    'section',
    'section',
    { ...SECTION_PADDING },
    children,
    { mobile: { ...MOBILE_SECTION } },
  );
}

function sectionName(section: SpecSection, index: number): string {
  const byKind: Record<string, string> = {
    hero: 'Sekcja główna',
    features: 'Sekcja kart',
    gallery: 'Galeria',
    text: 'Sekcja tekstowa',
    cta: 'Wezwanie do działania',
    contact: 'Kontakt',
    nav: 'Nawigacja',
    footer: 'Stopka',
  };
  const base = byKind[section.kind] ?? 'Sekcja';
  return section.heading ? `${base}: ${section.heading.slice(0, 40)}` : `${base} ${index + 1}`;
}

function buildPage(spec: NoderaPageSpec, pageIndex: number): PageDocument {
  const page = spec.pages[pageIndex];
  const context: BuildContext = {
    tokens: spec.tokens,
    knownSlugs: spec.pages.map((p) => p.slug),
  };

  const root: NodeElement = container(
    `page-${page.slug}-root`,
    page.name,
    'div',
    'container',
    {
      backgroundColor: spec.tokens.surface,
      color: spec.tokens.text,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT_STACK.sans,
    },
    page.sections.map((section, index) => buildSection(section, index, context)),
  );

  return {
    id: `page-${page.slug}`,
    name: page.name,
    slug: page.slug,
    title: page.title,
    description: page.description,
    root,
  };
}

/**
 * Builds a complete ProjectState from a spec.
 *
 * One direction is created, because one prompt produces one proposal at this
 * stage. The directions model is untouched, so alternatives can be added later
 * without reshaping the document.
 */
export function buildProjectFromSpec(
  spec: NoderaPageSpec,
  options: { projectId: string; projectName: string; prompt: string },
): ProjectState {
  const pages: Record<string, PageDocument> = {};
  spec.pages.forEach((_, index) => {
    const page = buildPage(spec, index);
    pages[page.slug] = page;
  });

  const tokens = tokensFromSpec(spec.tokens);
  const firstSlug = Object.keys(pages)[0];

  const direction: DirectionOption = {
    id: 'generated',
    name: 'Propozycja',
    subtitle: 'Wygenerowana z Twojego opisu',
    concept: options.prompt.slice(0, 400),
    typography: spec.tokens.headingFont === 'serif' ? 'Szeryfowe nagłówki' : 'Bezszeryfowe nagłówki',
    atmosphere: '',
    colorPalette: {
      primary: spec.tokens.text,
      copper: spec.tokens.accent,
      surface: spec.tokens.surface,
      text: spec.tokens.text,
    },
    subpagesPlan: spec.pages.map((page) => page.name),
    pages,
    tokens,
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: options.projectId,
    name: options.projectName,
    client: '',
    lastUpdated: new Date().toLocaleString('pl-PL'),
    assumptions: [],
    activeDirectionId: direction.id,
    directions: { [direction.id]: direction },
    activePageSlug: firstSlug,
    tokens,
    comments: [],
    snapshots: [],
    isPublished: false,
  };
}
