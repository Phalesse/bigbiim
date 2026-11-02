/** Poids par défaut du score de matching, configurables par activité (section 3.7). */
export const DEFAULT_MATCHING_WEIGHTS = {
  reputation: 0.25, // note bayésienne
  price: 0.2, // prix par rapport au budget
  proximity: 0.15,
  reliability: 0.15, // acceptation, ponctualité, annulations
  experience: 0.1, // expérience dans cette activité
  equity: 0.1, // équité de répartition
  responseTime: 0.05, // délai de réponse
} as const;

/** Filtres durs (éliminatoires) du matching (section 3.7). */
export const MATCHING_HARD_FILTERS = [
  'compétence vérifiée pour le rôle',
  'licence exigée valide à la date de la mission',
  'zone d’intervention compatible',
  'disponibilité et capacité sur les créneaux',
  'compte actif et non suspendu',
  'niveau de vérification suffisant',
] as const;
