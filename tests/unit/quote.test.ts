import { describe, expect, it } from 'vitest';
import { calculateQuote } from '../../packages/rules/src/quote';

describe('unit/quote', () => {
  it('calcule les lignes, frais, remises et taxes en unités mineures entières', () => {
    expect(
      calculateQuote({
        lines: [
          { key: 'venue', quantity: 1, unitAmount: 125_000 },
          { key: 'chairs', quantity: 8, unitAmount: 2_500 },
        ],
        coordinationFee: 5_000,
        platformFee: 2_500,
        discount: 10_000,
        taxes: 12_500,
      }),
    ).toEqual({
      lines: [
        { key: 'venue', quantity: 1, unitAmount: 125_000, totalAmount: 125_000 },
        { key: 'chairs', quantity: 8, unitAmount: 2_500, totalAmount: 20_000 },
      ],
      lineSubtotal: 145_000,
      coordinationFee: 5_000,
      platformFee: 2_500,
      discount: 10_000,
      taxes: 12_500,
      total: 155_000,
    });
  });

  it('rejects fractional, negative and unsafe amounts', () => {
    expect(() => calculateQuote({ lines: [{ key: 'role', quantity: 1, unitAmount: 1.5 }] })).toThrow(
      RangeError,
    );
    expect(() => calculateQuote({ lines: [{ key: 'role', quantity: 1, unitAmount: -1 }] })).toThrow(
      RangeError,
    );
    expect(() =>
      calculateQuote({
        lines: [{ key: 'role', quantity: Number.MAX_SAFE_INTEGER, unitAmount: 2 }],
      }),
    ).toThrow(RangeError);
  });

  it('rejects an empty quote or a discount larger than the pre-tax amount', () => {
    expect(() => calculateQuote({ lines: [] })).toThrow(RangeError);
    expect(() =>
      calculateQuote({
        lines: [{ key: 'role', quantity: 1, unitAmount: 100 }],
        discount: 101,
      }),
    ).toThrow(RangeError);
  });

  it('rejects invalid quantities and line keys', () => {
    expect(() =>
      calculateQuote({ lines: [{ key: 'role', quantity: 0, unitAmount: 100 }] }),
    ).toThrow(RangeError);
    expect(() =>
      calculateQuote({ lines: [{ key: ' ', quantity: 1, unitAmount: 100 }] }),
    ).toThrow(RangeError);
  });

  it('rejects totals that cannot be represented safely as JSON numbers', () => {
    expect(() =>
      calculateQuote({
        lines: [
          { key: 'first', quantity: 1, unitAmount: Number.MAX_SAFE_INTEGER },
          { key: 'second', quantity: 1, unitAmount: 1 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it.todo('verrouille le devis et crée une nouvelle version à chaque changement');
});
