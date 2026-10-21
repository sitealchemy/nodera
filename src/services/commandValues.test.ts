import { describe, expect, it } from 'vitest';
import {
  directionDelta,
  formatCssLength,
  parseCssLength,
  parseDirection,
  parseGrowShrink,
  parsePercent,
  parsePixels,
  scaleLength,
} from './commandValues';

describe('parsePercent', () => {
  it('reads the stated percentage', () => {
    expect(parsePercent('powiększ o 50%')).toEqual({ ok: true, value: 50 });
    expect(parsePercent('zmniejsz o 25 %')).toEqual({ ok: true, value: 25 });
  });

  it('accepts a Polish decimal comma', () => {
    expect(parsePercent('powiększ o 12,5%')).toEqual({ ok: true, value: 12.5 });
    expect(parsePercent('powiększ o 12.5%')).toEqual({ ok: true, value: 12.5 });
  });

  it('reports a missing number rather than guessing', () => {
    expect(parsePercent('powiększ')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reports two percentages as ambiguous', () => {
    expect(parsePercent('powiększ o 10% i 20%')).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('rejects percentages outside a usable range', () => {
    expect(parsePercent('powiększ o 0%')).toEqual({ ok: false, reason: 'invalid' });
    expect(parsePercent('powiększ o 5000%')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('parsePixels', () => {
  it('reads whole and fractional pixel values', () => {
    expect(parsePixels('przesuń o 20 px w prawo')).toEqual({ ok: true, value: 20 });
    expect(parsePixels('przesuń o 2,5px w lewo')).toEqual({ ok: true, value: 2.5 });
    expect(parsePixels('przesuń o 2.5 px w lewo')).toEqual({ ok: true, value: 2.5 });
  });

  it('treats another unit as invalid, not as missing', () => {
    // "2rem" is a real instruction we cannot honour for a pixel nudge.
    expect(parsePixels('przesuń o 2rem w lewo')).toEqual({ ok: false, reason: 'invalid' });
    expect(parsePixels('przesuń o 5% w lewo')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports a missing value', () => {
    expect(parsePixels('przesuń w lewo')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reads a bare number only when the caller allows it', () => {
    expect(parsePixels('przesuń o 3 w lewo')).toEqual({ ok: false, reason: 'missing' });
    expect(parsePixels('przesuń o 3 w lewo', true)).toEqual({ ok: true, value: 3 });
  });

  it('reports two pixel values as ambiguous', () => {
    expect(parsePixels('przesuń o 2px i 5px')).toEqual({ ok: false, reason: 'ambiguous' });
  });
});

describe('parseCssLength', () => {
  // The reason parseInt is not enough: parseInt('2rem') === 2, and treating
  // that as 2px turns a 2rem heading into a 2px one.
  it('keeps the unit', () => {
    expect(parseCssLength('56px')).toEqual({ value: 56, unit: 'px' });
    expect(parseCssLength('2rem')).toEqual({ value: 2, unit: 'rem' });
    expect(parseCssLength('80%')).toEqual({ value: 80, unit: '%' });
    expect(parseCssLength('1.5em')).toEqual({ value: 1.5, unit: 'em' });
  });

  it('defaults a unitless number to px', () => {
    expect(parseCssLength('12')).toEqual({ value: 12, unit: 'px' });
  });

  it('returns null for values it cannot read', () => {
    expect(parseCssLength('calc(100% - 20px)')).toBeNull();
    expect(parseCssLength('auto')).toBeNull();
    expect(parseCssLength(undefined)).toBeNull();
    expect(parseCssLength('')).toBeNull();
  });
});

describe('scaleLength', () => {
  it('applies the stated percentage, not a fixed step', () => {
    expect(scaleLength('100px', 50)).toMatchObject({ ok: true, next: { value: 150, unit: 'px' } });
    expect(scaleLength('100px', -25)).toMatchObject({ ok: true, next: { value: 75, unit: 'px' } });
    expect(scaleLength('56px', 50)).toMatchObject({ ok: true, next: { value: 84, unit: 'px' } });
  });

  it('preserves the unit rather than converting to px', () => {
    expect(scaleLength('2rem', 50)).toMatchObject({ ok: true, next: { value: 3, unit: 'rem' } });
    expect(scaleLength('1.5em', 100)).toMatchObject({ ok: true, next: { value: 3, unit: 'em' } });
  });

  it('flags a scale that produces no change', () => {
    expect(scaleLength('40px', 0)).toMatchObject({ ok: true, unchanged: true });
  });

  it('refuses a result that is not a usable size', () => {
    expect(scaleLength('10px', -100)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(scaleLength('10px', -200)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('refuses values and units it cannot handle', () => {
    expect(scaleLength('calc(50% + 2px)', 50)).toEqual({ ok: false, reason: 'unparsable' });
    expect(scaleLength('10ch', 50)).toEqual({ ok: false, reason: 'unsupported-unit' });
    expect(scaleLength(undefined, 50)).toEqual({ ok: false, reason: 'unparsable' });
  });

  it('refuses a non-finite factor', () => {
    expect(scaleLength('10px', Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });
});

describe('formatCssLength', () => {
  it('trims pointless decimals', () => {
    expect(formatCssLength({ value: 36, unit: 'px' })).toBe('36px');
    expect(formatCssLength({ value: 2.5, unit: 'px' })).toBe('2.5px');
    expect(formatCssLength({ value: 1.23456, unit: 'rem' })).toBe('1.235rem');
  });
});

describe('parseDirection', () => {
  it('reads a single direction', () => {
    expect(parseDirection('przesuń w lewo')).toBe('left');
    expect(parseDirection('przesuń w prawo')).toBe('right');
    expect(parseDirection('przesuń w górę')).toBe('up');
    expect(parseDirection('przesuń w dół')).toBe('down');
  });

  it('reports no direction and two directions differently', () => {
    expect(parseDirection('przesuń o 2px')).toBeNull();
    expect(parseDirection('przesuń w lewo i w dół')).toBe('ambiguous');
  });
});

describe('directionDelta', () => {
  it('maps direction and magnitude onto one axis', () => {
    expect(directionDelta('left', 20)).toEqual({ x: -20, y: 0 });
    expect(directionDelta('right', 2.5)).toEqual({ x: 2.5, y: 0 });
    expect(directionDelta('up', 3)).toEqual({ x: 0, y: -3 });
    expect(directionDelta('down', 3)).toEqual({ x: 0, y: 3 });
  });
});

describe('parseGrowShrink', () => {
  it('distinguishes grow from shrink', () => {
    expect(parseGrowShrink('powiększ o 50%')).toBe('grow');
    expect(parseGrowShrink('zmniejsz o 25%')).toBe('shrink');
    expect(parseGrowShrink('zmień kolor')).toBeNull();
  });

  it('treats a command asking for both as neither', () => {
    expect(parseGrowShrink('powiększ i zmniejsz')).toBeNull();
  });
});
