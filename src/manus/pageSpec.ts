/**
 * The contract between Manus and Nodera.
 *
 * Manus is asked for a NoderaPageSpec — a flat, versioned description of a
 * page — not for a NodeElement tree. Two reasons:
 *
 * 1. `structured_output_schema` requires every property to be listed in
 *    `required` with `additionalProperties: false`, which makes a recursive
 *    node tree awkward to express and easy for a model to get subtly wrong.
 * 2. A flat spec is a narrow, checkable surface. Nodera owns the mapping from
 *    spec to document, so element ids, tags, styles and responsive overrides
 *    are produced by code that is already tested, not by a language model.
 *
 * Anything outside this spec is not supported, and the importer says so rather
 * than pretending it round-tripped.
 */

export const PAGE_SPEC_VERSION = 1;

/** Section kinds the builder knows how to lay out. */
export const SECTION_KINDS = [
  'nav',
  'hero',
  'features',
  'text',
  'gallery',
  'cta',
  'contact',
  'footer',
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export interface SpecAction {
  label: string;
  /** Internal slug, '#anchor', or an absolute http(s)/mailto/tel URL. */
  href: string;
}

export interface SpecItem {
  title: string;
  body: string;
  /** Short supporting line: a price, a duration, a label. May be empty. */
  meta: string;
}

export interface SpecImage {
  /** Absolute https URL, or empty when the section needs no image. */
  src: string;
  alt: string;
}

export interface SpecSection {
  kind: SectionKind;
  heading: string;
  subheading: string;
  body: string;
  items: SpecItem[];
  actions: SpecAction[];
  image: SpecImage;
}

export interface SpecTokens {
  /** Hex colours, '#rrggbb'. */
  accent: string;
  surface: string;
  text: string;
  muted: string;
  headingFont: 'serif' | 'sans';
  /** CSS length for button corners, e.g. '8px'. */
  radius: string;
}

export interface SpecPage {
  slug: string;
  name: string;
  title: string;
  description: string;
  sections: SpecSection[];
}

export interface NoderaPageSpec {
  schemaVersion: number;
  siteName: string;
  tokens: SpecTokens;
  pages: SpecPage[];
}

/* ------------------------------------------------------------------ */
/* JSON Schema sent to Manus as `structured_output_schema`.            */
/* ------------------------------------------------------------------ */

const stringField = (description: string) => ({ type: 'string', description });

/**
 * Every property is listed in `required` and `additionalProperties` is false,
 * as the API demands. Fields that may legitimately be absent are declared as
 * strings that can be empty rather than as optional properties.
 */
export const MANUS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'siteName', 'tokens', 'pages'],
  properties: {
    schemaVersion: { type: 'integer', description: 'Always 1.' },
    siteName: stringField('Short name of the site or business.'),
    tokens: {
      type: 'object',
      additionalProperties: false,
      required: ['accent', 'surface', 'text', 'muted', 'headingFont', 'radius'],
      properties: {
        accent: stringField('Accent colour as #rrggbb, used for buttons and highlights.'),
        surface: stringField('Page background as #rrggbb.'),
        text: stringField('Body text colour as #rrggbb.'),
        muted: stringField('Secondary text colour as #rrggbb.'),
        headingFont: {
          type: 'string',
          enum: ['serif', 'sans'],
          description: 'Heading typeface family.',
        },
        radius: stringField('Button corner radius as a CSS length, e.g. "8px".'),
      },
    },
    pages: {
      type: 'array',
      description: 'Exactly one page for now.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'name', 'title', 'description', 'sections'],
        properties: {
          slug: stringField('URL slug, lowercase, no spaces, e.g. "start".'),
          name: stringField('Human name shown in the editor, e.g. "Strona główna".'),
          title: stringField('HTML <title>.'),
          description: stringField('Meta description, one sentence.'),
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'heading', 'subheading', 'body', 'items', 'actions', 'image'],
              properties: {
                kind: {
                  type: 'string',
                  enum: [...SECTION_KINDS],
                  description:
                    'Section layout. Use nav once at the top and footer once at the bottom.',
                },
                heading: stringField('Section heading. Empty string when not needed.'),
                subheading: stringField('Short line above or below the heading, may be empty.'),
                body: stringField('Paragraph text, may be empty.'),
                items: {
                  type: 'array',
                  description: 'Cards, features or list entries. Empty array when not needed.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title', 'body', 'meta'],
                    properties: {
                      title: stringField('Item title.'),
                      body: stringField('Item description.'),
                      meta: stringField('Short supporting line such as a price, may be empty.'),
                    },
                  },
                },
                actions: {
                  type: 'array',
                  description: 'Buttons or links. Empty array when not needed.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['label', 'href'],
                    properties: {
                      label: stringField('Button text.'),
                      href: stringField(
                        'Internal slug, "#anchor", or an https/mailto/tel URL.',
                      ),
                    },
                  },
                },
                image: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['src', 'alt'],
                  properties: {
                    src: stringField(
                      'Absolute https image URL, or empty string for no image. Do not invent URLs that may not exist.',
                    ),
                    alt: stringField('Alt text describing the image.'),
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/* ------------------------------------------------------------------ */
/* Runtime validation                                                  */
/* ------------------------------------------------------------------ */

export interface ValidationIssue {
  path: string;
  message: string;
}

export type SpecValidation =
  | { ok: true; spec: NoderaPageSpec; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const CSS_LENGTH = /^\d+(\.\d+)?(px|rem|em|%)$/;

/** Hard limits, so a runaway result cannot build an unusable document. */
const LIMITS = { sections: 20, items: 12, actions: 4, text: 4000 };

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clampText(value: string): string {
  return value.length > LIMITS.text ? value.slice(0, LIMITS.text) : value;
}

/**
 * Checks and normalises a result from Manus.
 *
 * Deliberately forgiving about things that can be corrected (a missing colour,
 * an unknown section kind, a stray extra field) and strict about things that
 * cannot (no pages, no sections at all, wrong schema version). Corrections are
 * reported as warnings so the import is never silently different from what the
 * model produced.
 */
export function validatePageSpec(input: unknown): SpecValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ path: '', message: 'Wynik nie jest obiektem JSON.' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : NaN;
  if (version !== PAGE_SPEC_VERSION) {
    if (Number.isNaN(version)) {
      warnings.push({ path: 'schemaVersion', message: 'Brak wersji schematu, przyjęto 1.' });
    } else {
      return {
        ok: false,
        errors: [
          {
            path: 'schemaVersion',
            message: `Nieobsługiwana wersja schematu: ${version}. Obsługiwana: ${PAGE_SPEC_VERSION}.`,
          },
        ],
        warnings,
      };
    }
  }

  const rawPages = Array.isArray(raw.pages) ? raw.pages : [];
  if (rawPages.length === 0) {
    errors.push({ path: 'pages', message: 'Wynik nie zawiera żadnej podstrony.' });
  }

  // --- tokens -------------------------------------------------------
  const rawTokens = (raw.tokens ?? {}) as Record<string, unknown>;
  const colour = (key: keyof SpecTokens, fallback: string): string => {
    const value = asString(rawTokens[key]);
    if (HEX.test(value)) return value;
    if (value) warnings.push({ path: `tokens.${key}`, message: `Niepoprawny kolor „${value}", użyto ${fallback}.` });
    return fallback;
  };

  const headingFontRaw = asString(rawTokens.headingFont);
  const radiusRaw = asString(rawTokens.radius);
  const tokens: SpecTokens = {
    accent: colour('accent', '#A86645'),
    surface: colour('surface', '#FFFEFB'),
    text: colour('text', '#292824'),
    muted: colour('muted', '#706C65'),
    headingFont: headingFontRaw === 'sans' ? 'sans' : 'serif',
    radius: CSS_LENGTH.test(radiusRaw) ? radiusRaw : '8px',
  };
  if (radiusRaw && !CSS_LENGTH.test(radiusRaw)) {
    warnings.push({ path: 'tokens.radius', message: `Niepoprawny promień „${radiusRaw}", użyto 8px.` });
  }

  // --- pages --------------------------------------------------------
  const pages: SpecPage[] = [];
  rawPages.forEach((rawPage, pageIndex) => {
    if (!rawPage || typeof rawPage !== 'object') {
      errors.push({ path: `pages[${pageIndex}]`, message: 'Podstrona nie jest obiektem.' });
      return;
    }
    const page = rawPage as Record<string, unknown>;
    const slugRaw = asString(page.slug).trim().toLowerCase();
    const slug = slugRaw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `strona-${pageIndex + 1}`;
    if (slugRaw && slug !== slugRaw) {
      warnings.push({ path: `pages[${pageIndex}].slug`, message: `Slug znormalizowany do „${slug}".` });
    }

    const rawSections = Array.isArray(page.sections) ? page.sections : [];
    if (rawSections.length === 0) {
      errors.push({ path: `pages[${pageIndex}].sections`, message: 'Podstrona nie ma żadnej sekcji.' });
    }
    if (rawSections.length > LIMITS.sections) {
      warnings.push({
        path: `pages[${pageIndex}].sections`,
        message: `Ograniczono liczbę sekcji do ${LIMITS.sections}.`,
      });
    }

    const sections: SpecSection[] = [];
    rawSections.slice(0, LIMITS.sections).forEach((rawSection, sectionIndex) => {
      if (!rawSection || typeof rawSection !== 'object') {
        warnings.push({
          path: `pages[${pageIndex}].sections[${sectionIndex}]`,
          message: 'Pominięto sekcję, która nie jest obiektem.',
        });
        return;
      }
      const section = rawSection as Record<string, unknown>;
      const kindRaw = asString(section.kind).trim().toLowerCase();
      const kind = (SECTION_KINDS as readonly string[]).includes(kindRaw)
        ? (kindRaw as SectionKind)
        : 'text';
      if (kindRaw && kind !== kindRaw) {
        warnings.push({
          path: `pages[${pageIndex}].sections[${sectionIndex}].kind`,
          message: `Nieznany typ sekcji „${kindRaw}", użyto „text".`,
        });
      }

      const rawItems = Array.isArray(section.items) ? section.items : [];
      const items: SpecItem[] = rawItems
        .slice(0, LIMITS.items)
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const record = item as Record<string, unknown>;
          return {
            title: clampText(asString(record.title)),
            body: clampText(asString(record.body)),
            meta: clampText(asString(record.meta)),
          };
        });

      const rawActions = Array.isArray(section.actions) ? section.actions : [];
      const actions: SpecAction[] = rawActions
        .slice(0, LIMITS.actions)
        .filter((action) => action && typeof action === 'object')
        .map((action) => {
          const record = action as Record<string, unknown>;
          return { label: clampText(asString(record.label)), href: asString(record.href).trim() };
        })
        .filter((action) => action.label !== '');

      const rawImage = (section.image ?? {}) as Record<string, unknown>;
      const src = asString(rawImage.src).trim();
      // Only https images are kept. http and data: URLs are dropped rather
      // than embedded in a document the user will export and share.
      const safeSrc = /^https:\/\/\S+$/i.test(src) ? src : '';
      if (src && !safeSrc) {
        warnings.push({
          path: `pages[${pageIndex}].sections[${sectionIndex}].image.src`,
          message: `Pominięto adres obrazu „${src.slice(0, 60)}" (wymagany https).`,
        });
      }

      sections.push({
        kind,
        heading: clampText(asString(section.heading)),
        subheading: clampText(asString(section.subheading)),
        body: clampText(asString(section.body)),
        items,
        actions,
        image: { src: safeSrc, alt: clampText(asString(rawImage.alt)) },
      });
    });

    if (sections.length === 0 && rawSections.length > 0) {
      errors.push({
        path: `pages[${pageIndex}].sections`,
        message: 'Żadnej sekcji nie udało się odczytać.',
      });
    }

    pages.push({
      slug,
      name: clampText(asString(page.name)) || 'Strona główna',
      title: clampText(asString(page.title)) || asString(raw.siteName) || 'Strona',
      description: clampText(asString(page.description)),
      sections,
    });
  });

  if (errors.length > 0) return { ok: false, errors, warnings };

  return {
    ok: true,
    warnings,
    spec: {
      schemaVersion: PAGE_SPEC_VERSION,
      siteName: clampText(asString(raw.siteName)) || pages[0].name,
      tokens,
      pages,
    },
  };
}
