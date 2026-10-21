import { ResponsiveScope, ViewportDevice } from '../types/document';

/**
 * The single definition of what each editing scope means in CSS.
 *
 * Used by the export, the preview frame widths and the UI labels, so the three
 * cannot describe different boundaries. Editing at "Małe ekrany" and exporting
 * a `max-width` that disagrees with it is the kind of mismatch that only shows
 * up on a real device.
 */

export interface Breakpoint {
  scope: Exclude<ResponsiveScope, 'all'>;
  /** Inclusive lower bound in CSS px, or null for "no lower bound". */
  min: number | null;
  /** Inclusive upper bound in CSS px, or null for "no upper bound". */
  max: number | null;
  /** The media condition, derived from the bounds. */
  media: string;
  /** Human label, shown in the UI and in the exported stylesheet. */
  label: string;
}

/** Where tablet starts. Below this is "small screens". */
export const TABLET_MIN = 768;
/** Where desktop starts. Tablet covers TABLET_MIN .. DESKTOP_MIN - 1. */
export const DESKTOP_MIN = 1024;

/**
 * `max` uses a 0.02px step below the next breakpoint rather than the integer
 * itself: a viewport can report a fractional width, and `max-width: 767px`
 * would leave 767.5px matching neither rule.
 */
const upperBound = (next: number) => next - 0.02;

export const BREAKPOINTS: Breakpoint[] = [
  {
    scope: 'mobile',
    min: null,
    max: upperBound(TABLET_MIN),
    media: `(max-width: ${upperBound(TABLET_MIN)}px)`,
    label: `Małe ekrany (< ${TABLET_MIN} px)`,
  },
  {
    scope: 'tablet',
    min: TABLET_MIN,
    max: upperBound(DESKTOP_MIN),
    media: `(min-width: ${TABLET_MIN}px) and (max-width: ${upperBound(DESKTOP_MIN)}px)`,
    label: `Tablety (${TABLET_MIN}–${DESKTOP_MIN - 1} px)`,
  },
];

export function breakpointFor(scope: Exclude<ResponsiveScope, 'all'>): Breakpoint {
  const found = BREAKPOINTS.find((b) => b.scope === scope);
  if (!found) throw new Error(`Unknown breakpoint scope: ${scope}`);
  return found;
}

/** Which scope a given viewport width falls into. 'all' means the shared rule. */
export function scopeForWidth(width: number): ResponsiveScope {
  for (const bp of BREAKPOINTS) {
    const aboveMin = bp.min === null || width >= bp.min;
    const belowMax = bp.max === null || width <= bp.max;
    if (aboveMin && belowMax) return bp.scope;
  }
  return 'all';
}

/**
 * Preview widths. Each sits unambiguously inside its own breakpoint, so what
 * the editor shows is what the exported CSS will select.
 */
export const VIEWPORT_WIDTHS: Record<ViewportDevice, number> = {
  desktop: 1440,
  // Exactly TABLET_MIN: the lower bound is inclusive, so this is unambiguously
  // inside the tablet range, and it matches the "Tablet (768 px)" label.
  tablet: TABLET_MIN,
  mobile: 375,
};

/** Sanity: every preview width must resolve to the scope it claims to be. */
export function previewWidthMatchesScope(device: ViewportDevice): boolean {
  const width = VIEWPORT_WIDTHS[device];
  const scope = scopeForWidth(width);
  if (device === 'desktop') return scope === 'all';
  return scope === device;
}
