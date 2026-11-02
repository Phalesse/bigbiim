/** Contexte d'évaluation d'une expression (section 3.4) : réponses du questionnaire et paramètres. */
export interface RuleContext {
  answers: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** Tables de correspondance : lookup(table, clé). */
  tables?: Record<string, Record<string, unknown>>;
}

/**
 * Fonctions autorisées (section 3.4) : opérateurs, if, min, max, ceil, floor, round, lookup(table, clé).
 * Langage sans effet de bord ni exécution de code ; limites strictes de temps, de profondeur et de taille.
 */
export const ALLOWED_FUNCTIONS = ['if', 'min', 'max', 'ceil', 'floor', 'round', 'lookup'] as const;
