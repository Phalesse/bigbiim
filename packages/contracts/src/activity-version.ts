/** Définition d'une version d'activité (JSONB, section 4.2). Schéma officiel : activity-version.schema.json. */
export interface ActivityVersionDefinition {
  /** champs, validations, conditions */
  questionnaire: unknown[];
  /** compétence, quantité, obligatoire, formule de prix, poids de matching */
  roles: unknown[];
  /** graphe, durées, conditions */
  steps: unknown[];
  /** part, déclencheur, preuve */
  milestones: unknown[];
  /** formules, remises, frais */
  pricing: Record<string, unknown>;
  contract_template_id: string | null;
  compliance: Record<string, unknown>;
  cancellation_policy: Record<string, unknown>;
  matching_mode: string | null;
}
