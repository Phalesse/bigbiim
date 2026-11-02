import { Injectable } from '@nestjs/common';
import { DEFAULT_MATCHING_WEIGHTS } from './matching.weights';

export type MatchCriterion = keyof typeof DEFAULT_MATCHING_WEIGHTS;

export type MatchHardFilters = {
  verifiedSkill: boolean;
  validLicense: boolean;
  serviceArea: boolean;
  availability: boolean;
  activeAccount: boolean;
  verificationLevel: boolean;
};

export type MatchCandidate = {
  providerId: string;
  hardFilters: MatchHardFilters;
  scores: Partial<Record<MatchCriterion, number>>;
};

export type RankedMatch = {
  providerId: string;
  rank: number;
  score: number;
  explanation: {
    strengths: Array<{ criterion: MatchCriterion; score: number; label: string }>;
  };
};

const CRITERIA = Object.keys(DEFAULT_MATCHING_WEIGHTS) as MatchCriterion[];

const CRITERION_LABELS: Record<MatchCriterion, string> = {
  reputation: 'réputation',
  price: 'prix',
  proximity: 'proximité',
  reliability: 'fiabilité',
  experience: 'expérience',
  equity: 'équité de répartition',
  responseTime: 'délai de réponse',
};

const HARD_FILTERS: Array<keyof MatchHardFilters> = [
  'verifiedSkill',
  'validLicense',
  'serviceArea',
  'availability',
  'activeAccount',
  'verificationLevel',
];

@Injectable()
export class MatchingService {
  rankCandidates(
    candidates: MatchCandidate[],
    weights: Partial<Record<MatchCriterion, number>> = DEFAULT_MATCHING_WEIGHTS,
    limit = 3,
  ): RankedMatch[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('limit doit être un entier entre 1 et 100');
    }

    const effectiveWeights = new Map<MatchCriterion, number>();
    for (const criterion of CRITERIA) {
      const weight = weights[criterion] ?? DEFAULT_MATCHING_WEIGHTS[criterion];
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RangeError(`Poids de matching invalide : ${criterion}`);
      }
      effectiveWeights.set(criterion, weight);
    }
    if (![...effectiveWeights.values()].some((weight) => weight > 0)) {
      throw new RangeError('Au moins un poids de matching doit être positif');
    }

    const candidateIds = new Set<string>();
    const eligible = candidates.flatMap((candidate) => {
      if (!candidate.providerId || candidateIds.has(candidate.providerId)) {
        throw new RangeError('Chaque prestataire doit avoir un identifiant unique');
      }
      candidateIds.add(candidate.providerId);

      if (HARD_FILTERS.some((filter) => candidate.hardFilters[filter] !== true)) return [];

      let weightedTotal = 0;
      let availableWeight = 0;
      const scoredCriteria: Array<{ criterion: MatchCriterion; score: number; weight: number }> = [];
      for (const criterion of CRITERIA) {
        const score = candidate.scores[criterion];
        if (score === undefined) continue;
        if (!Number.isFinite(score) || score < 0 || score > 1) {
          throw new RangeError(`Score de matching invalide : ${criterion}`);
        }
        const weight = effectiveWeights.get(criterion) ?? 0;
        if (weight === 0) continue;
        weightedTotal += score * weight;
        availableWeight += weight;
        scoredCriteria.push({ criterion, score, weight });
      }

      const score = availableWeight === 0 ? 0 : weightedTotal / availableWeight;
      const strengths = scoredCriteria
        .sort((left, right) => right.score * right.weight - left.score * left.weight)
        .slice(0, 3)
        .map(({ criterion, score: criterionScore }) => ({ criterion, score: criterionScore }));

      return [{ providerId: candidate.providerId, score, strengths }];
    });

    return eligible
      .sort((left, right) => right.score - left.score || left.providerId.localeCompare(right.providerId))
      .slice(0, limit)
      .map((match, index) => ({
        providerId: match.providerId,
        rank: index + 1,
        score: Number(match.score.toFixed(6)),
        explanation: {
          strengths: match.strengths.map((strength) => ({
            ...strength,
            label: CRITERION_LABELS[strength.criterion],
          })),
        },
      }));
  }
}
