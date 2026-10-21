/**
 * Number and unit parsing for the demonstration command parser.
 *
 * Deliberately narrow. The goal is that a stated number is *obeyed* — a
 * command saying 50% must not quietly apply 20% — not that arbitrary language
 * is understood. Anything outside the supported shapes is reported honestly
 * rather than guessed at.
 */

/** A CSS length we are willing to scale or offset. */
export interface CssLength {
  value: number;
  unit: string;
}

/** Units whose numeric part can be scaled while keeping its meaning. */
export const SCALABLE_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw', 'pt'];

/** Units an optical offset may be expressed in. Offsets are a pixel nudge. */
export const OFFSET_UNITS = ['px'];

export type ValueParse =
  | { ok: true; value: number }
  | { ok: false; reason: 'missing' | 'ambiguous' | 'invalid' };

/**
 * Reads a Polish-formatted decimal: comma or dot, optional spaces before the
 * unit. "2,5" and "2.5" both mean 2.5.
 */
function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/**
 * Extracts a percentage, as a plain number ("o 50%" -> 50).
 *
 * Returns `ambiguous` when more than one percentage appears, rather than
 * silently taking the first.
 */
export function parsePercent(text: string): ValueParse {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
  if (matches.length === 0) return { ok: false, reason: 'missing' };
  if (matches.length > 1) return { ok: false, reason: 'ambiguous' };

  const value = toNumber(matches[0][1]);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, value };
}

/**
 * Extracts a pixel length ("o 20 px", "o 2,5px" -> 20 / 2.5).
 *
 * A bare number with no unit is accepted and read as pixels only when the
 * command context is already about pixels; callers decide by passing
 * `allowBareNumber`.
 */
export function parsePixels(text: string, allowBareNumber = false): ValueParse {
  const withUnit = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*px\b/gi)];
  if (withUnit.length > 1) return { ok: false, reason: 'ambiguous' };
  if (withUnit.length === 1) {
    const value = toNumber(withUnit[0][1]);
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    return { ok: true, value };
  }

  // A number carrying some other unit is a real instruction we cannot honour,
  // which is different from no number at all.
  // `%` gets no trailing \b: it is not a word character, so a boundary after
  // it never matches before a space, and "5% w lewo" would slip through as
  // "no number given" rather than "a unit I cannot use here".
  const otherUnit =
    /(\d+(?:[.,]\d+)?)\s*(?:(rem|em|vh|vw|pt|cm|mm|in)(?![a-z])|%)/i.exec(text);
  if (otherUnit) return { ok: false, reason: 'invalid' };

  if (!allowBareNumber) return { ok: false, reason: 'missing' };

  const bare = [...text.matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|$)/g)];
  if (bare.length === 0) return { ok: false, reason: 'missing' };
  if (bare.length > 1) return { ok: false, reason: 'ambiguous' };
  const value = toNumber(bare[0][1]);
  if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
  return { ok: true, value };
}

/**
 * Splits a CSS length into number and unit.
 *
 * This is why `parseInt` is not good enough: `parseInt('2rem')` is 2, and
 * treating that as 2px silently shrinks a 32px heading to 2px.
 */
export function parseCssLength(raw: string | undefined): CssLength | null {
  if (!raw) return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*([a-z%]*)\s*$/i.exec(String(raw));
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || '').toLowerCase();
  return { value, unit: unit || 'px' };
}

export function formatCssLength({ value, unit }: CssLength): string {
  // Trim pointless decimals: 36px, not 36.00px.
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}${unit}`;
}

export type ScaleOutcome =
  | { ok: true; next: CssLength; unchanged: boolean }
  | { ok: false; reason: 'unparsable' | 'unsupported-unit' | 'out-of-range' };

/**
 * Scales a CSS length by a percentage, keeping its unit.
 *
 * `percent` is the delta the user asked for: +50 grows by half, -25 shrinks by
 * a quarter.
 */
export function scaleLength(raw: string | undefined, percent: number): ScaleOutcome {
  const parsed = parseCssLength(raw);
  if (!parsed) return { ok: false, reason: 'unparsable' };
  if (!SCALABLE_UNITS.includes(parsed.unit)) return { ok: false, reason: 'unsupported-unit' };

  const factor = 1 + percent / 100;
  if (!Number.isFinite(factor) || factor <= 0) return { ok: false, reason: 'out-of-range' };

  const nextValue = parsed.value * factor;
  if (!Number.isFinite(nextValue)) return { ok: false, reason: 'out-of-range' };

  // A length that would round to zero or below is not a usable size.
  const rounded = Math.round(nextValue * 1000) / 1000;
  if (rounded <= 0) return { ok: false, reason: 'out-of-range' };

  return {
    ok: true,
    next: { value: rounded, unit: parsed.unit },
    unchanged: rounded === parsed.value,
  };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * Finds the single direction named in a command.
 *
 * Two directions ("w lewo i w dół") are ambiguous for a one-axis nudge, so
 * they are reported rather than half-applied.
 */
export function parseDirection(text: string): Direction | null | 'ambiguous' {
  const found: Direction[] = [];
  // No \b around words carrying Polish diacritics. JavaScript's \b is defined
  // over ASCII word characters, so "ł" and "ó" count as non-word and the
  // boundary never matches — /\bdół\b/ silently fails on "w dół", which made
  // the parser read a two-direction command as a one-direction one.
  if (/lewo|lewej/.test(text)) found.push('left');
  if (/prawo|prawej/.test(text)) found.push('right');
  if (/gór|gore|gora/.test(text)) found.push('up');
  if (/dół|dolu|dołu|\bdol\b/.test(text)) found.push('down');

  if (found.length === 0) return null;
  if (found.length > 1) return 'ambiguous';
  return found[0];
}

/** Turns a direction and magnitude into an (x, y) delta. */
export function directionDelta(direction: Direction, magnitude: number): { x: number; y: number } {
  switch (direction) {
    case 'left':
      return { x: -magnitude, y: 0 };
    case 'right':
      return { x: magnitude, y: 0 };
    case 'up':
      return { x: 0, y: -magnitude };
    case 'down':
      return { x: 0, y: magnitude };
  }
}

/** Whether the command asks to grow or shrink. */
export function parseGrowShrink(text: string): 'grow' | 'shrink' | null {
  const grow = /powiększ|zwiększ|powieksz|zwieksz/.test(text);
  const shrink = /pomniejsz|zmniejsz/.test(text);
  if (grow && shrink) return null;
  if (grow) return 'grow';
  if (shrink) return 'shrink';
  return null;
}
