import { describe, expect, it } from 'vitest';
import { MatchingService } from '../../apps/api/src/modules/matching/matching.service';

const allHardFiltersPass = {
  verifiedSkill: true,
  validLicense: true,
  serviceArea: true,
  availability: true,
  activeAccount: true,
  verificationLevel: true,
};

describe('unit/matching', () => {
  const matching = new MatchingService();

  it('élimine les prestataires qui échouent aux filtres durs', () => {
    const results = matching.rankCandidates([
      {
        providerId: 'eligible',
        hardFilters: allHardFiltersPass,
        scores: { reputation: 1 },
      },
      {
        providerId: 'unverified-skill',
        hardFilters: { ...allHardFiltersPass, verifiedSkill: false },
        scores: { reputation: 1 },
      },
    ]);

    expect(results.map(({ providerId }) => providerId)).toEqual(['eligible']);
  });

  it('calcule le score pondéré avec les poids par défaut', () => {
    const results = matching.rankCandidates([
      {
        providerId: 'provider-1',
        hardFilters: allHardFiltersPass,
        scores: { reputation: 1, price: 0.5 },
      },
    ]);

    expect(results[0].score).toBe(0.777778);
  });

  it('explique le classement et limite les résultats aux trois premiers', () => {
    const results = matching.rankCandidates(
      [0.2, 0.9, 0.5, 0.7].map((reputation, index) => ({
        providerId: `provider-${index}`,
        hardFilters: allHardFiltersPass,
        scores: { reputation },
      })),
    );

    expect(results).toHaveLength(3);
    expect(results.map(({ rank }) => rank)).toEqual([1, 2, 3]);
    expect(results[0]).toMatchObject({
      providerId: 'provider-1',
      explanation: { strengths: [{ criterion: 'reputation', score: 0.9, label: 'réputation' }] },
    });
  });

  it('redistribue les poids des critères non calculés', () => {
    const results = matching.rankCandidates([
      {
        providerId: 'provider-1',
        hardFilters: allHardFiltersPass,
        scores: { price: 0.8 },
      },
    ]);

    expect(results[0].score).toBe(0.8);
  });

  it('refuse les scores en dehors de l’intervalle normalisé', () => {
    expect(() =>
      matching.rankCandidates([
        {
          providerId: 'provider-1',
          hardFilters: allHardFiltersPass,
          scores: { reputation: 1.1 },
        },
      ]),
    ).toThrow(RangeError);
  });
});
