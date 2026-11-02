import { describe, expect, it } from 'vitest';
import {
  projectRolesFromDefinition,
  quoteFromDefinition,
} from '../../apps/api/src/modules/projects/projects.service';

describe('project quote from an activity definition', () => {
  const definition = {
    questionnaire: [{ key: 'guests', type: 'number', required: true, min: 1 }],
    roles: [
      {
        key: 'chairs',
        quantity_formula: {
          ceil: [{ '/': [{ var: 'answers.guests' }, 8] }],
        },
        price_formula: { lookup: ['chair-prices', { var: 'answers.guests' }] },
      },
      {
        key: 'optional-stage',
        quantity: 0,
        unit_amount: 500,
        required: false,
      },
    ],
    pricing: {
      currency: 'XOF',
      platform_fee: 1_000,
      tables: { 'chair-prices': { '90': 2_500 } },
    },
  };

  it('evaluates role formulas and produces a versionable integer quote', () => {
    const result = quoteFromDefinition(definition, { guests: 90 });

    expect(result.currency).toBe('XOF');
    expect(result.lines).toEqual([{ key: 'chairs', quantity: 12, unitAmount: 2_500 }]);
    expect(result.calculation.lineSubtotal).toBe(30_000);
    expect(result.calculation.platformFee).toBe(1_000);
    expect(result.calculation.total).toBe(31_000);
  });

  it('rejects missing prices, invalid currencies and non-integer formula results', () => {
    expect(() =>
      quoteFromDefinition(
        { ...definition, pricing: { currency: 'XOF' } },
        { guests: 90 },
      ),
    ).toThrow();
    expect(() =>
      quoteFromDefinition(
        { ...definition, pricing: { currency: 'xx', tables: definition.pricing.tables } },
        { guests: 90 },
      ),
    ).toThrow();
    expect(() =>
      quoteFromDefinition(
        {
          ...definition,
          roles: [{ key: 'chairs', quantity: 1, unit_amount: 1.5 }],
        },
        { guests: 90 },
      ),
    ).toThrow();
  });

  it('creates project-role definitions from the priced roles and their configured skills', () => {
    const definitionWithSkill = {
      ...definition,
      roles: definition.roles.map((role) =>
        role.key === 'chairs' ? { ...role, skillId: 'skill-chair' } : role,
      ),
    };
    const quote = quoteFromDefinition(definitionWithSkill, { guests: 90 });

    expect(projectRolesFromDefinition(definitionWithSkill, quote.lines)).toEqual([
      { roleKey: 'chairs', skillId: 'skill-chair', quantity: 12 },
    ]);
  });

  it('rejects a priced role without a configured skill', () => {
    const quote = quoteFromDefinition(definition, { guests: 90 });

    expect(() => projectRolesFromDefinition(definition, quote.lines)).toThrow(
      'La compétence doit être définie pour le rôle chairs',
    );
  });
});
