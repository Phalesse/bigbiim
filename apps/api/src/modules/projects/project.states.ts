/** Cycle de vie d'un projet (section 3.1). Toute transition passe par cette machine à états. */
export type ProjectState =
  | 'BROUILLON' | 'DEVIS' | 'EQUIPE' | 'CONTRAT' | 'CONFIRME' | 'EN_COURS'
  | 'EN_LITIGE' | 'TERMINE' | 'CLOTURE' | 'ABANDONNE' | 'EXPIRE' | 'ANNULE';

export const PROJECT_TRANSITIONS: Record<ProjectState, ProjectState[]> = {
  BROUILLON: ['DEVIS', 'ABANDONNE'],
  DEVIS: ['EQUIPE', 'EXPIRE'],
  EQUIPE: ['CONTRAT', 'DEVIS'],
  CONTRAT: ['CONFIRME', 'ANNULE'],
  CONFIRME: ['EN_COURS', 'ANNULE'],
  EN_COURS: ['TERMINE', 'EN_LITIGE', 'ANNULE'],
  EN_LITIGE: ['EN_COURS', 'ANNULE', 'TERMINE'],
  TERMINE: ['CLOTURE'],
  CLOTURE: [],
  ABANDONNE: [],
  EXPIRE: [],
  ANNULE: [],
};

export function isProjectState(value: string): value is ProjectState {
  return Object.prototype.hasOwnProperty.call(PROJECT_TRANSITIONS, value);
}

export function canTransitionProject(from: ProjectState, to: ProjectState): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

/** Cycle de vie d'une mission (section 3.2). */
export type MissionState =
  | 'PROPOSEE' | 'ACCEPTEE' | 'REFUSEE' | 'CONTRE_PROPOSEE' | 'EXPIREE'
  | 'PLANIFIEE' | 'EN_COURS' | 'LIVREE' | 'VALIDEE'
  | 'ANNULEE' | 'EN_LITIGE' | 'REMPLACEE';

/**
 * Chaîne décrite dans le document : PROPOSEE -> ACCEPTEE | REFUSEE | CONTRE_PROPOSEE | EXPIREE
 * -> PLANIFIEE -> EN_COURS -> LIVREE -> VALIDEE.
 * Une contre-proposition est acceptée ou refusée ; un refus ou une expiration permet le remplacement.
 */
export const MISSION_TRANSITIONS: Record<MissionState, MissionState[]> = {
  PROPOSEE: ['ACCEPTEE', 'REFUSEE', 'CONTRE_PROPOSEE', 'EXPIREE'],
  ACCEPTEE: ['PLANIFIEE'],
  REFUSEE: ['REMPLACEE'],
  CONTRE_PROPOSEE: ['ACCEPTEE', 'REFUSEE'],
  EXPIREE: ['REMPLACEE'],
  PLANIFIEE: ['EN_COURS'],
  EN_COURS: ['LIVREE'],
  LIVREE: ['VALIDEE'],
  VALIDEE: [],
  ANNULEE: [],
  EN_LITIGE: [],
  REMPLACEE: [],
};

export function isMissionState(value: string): value is MissionState {
  return Object.prototype.hasOwnProperty.call(MISSION_TRANSITIONS, value);
}

export function canTransitionMission(from: MissionState, to: MissionState): boolean {
  return MISSION_TRANSITIONS[from].includes(to);
}
