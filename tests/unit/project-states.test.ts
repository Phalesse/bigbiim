import { describe, expect, it } from 'vitest';
import {
  canTransitionMission,
  canTransitionProject,
  isMissionState,
  isProjectState,
  MISSION_TRANSITIONS,
  PROJECT_TRANSITIONS,
  type MissionState,
  type ProjectState,
} from '../../apps/api/src/modules/projects/project.states';

describe('unit/project-states', () => {
  it('autorise uniquement les transitions de projet déclarées', () => {
    const projectStates = Object.keys(PROJECT_TRANSITIONS) as ProjectState[];

    for (const from of projectStates) {
      for (const to of projectStates) {
        expect(canTransitionProject(from, to)).toBe(PROJECT_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('reconnaît les états stockés avant de les utiliser comme clés de transition', () => {
    expect(isProjectState('BROUILLON')).toBe(true);
    expect(isProjectState('ETAT_INCONNU')).toBe(false);
    expect(isMissionState('PROPOSEE')).toBe(true);
    expect(isMissionState('ETAT_INCONNU')).toBe(false);
  });

  it('autorise uniquement les transitions de mission déclarées', () => {
    const missionStates = Object.keys(MISSION_TRANSITIONS) as MissionState[];

    for (const from of missionStates) {
      for (const to of missionStates) {
        expect(canTransitionMission(from, to)).toBe(MISSION_TRANSITIONS[from].includes(to));
      }
    }
  });

  it.each([
    ['BROUILLON', 'DEVIS'],
    ['BROUILLON', 'ABANDONNE'],
    ['DEVIS', 'EQUIPE'],
    ['EQUIPE', 'CONTRAT'],
    ['CONTRAT', 'CONFIRME'],
    ['CONFIRME', 'EN_COURS'],
    ['EN_COURS', 'EN_LITIGE'],
    ['EN_LITIGE', 'TERMINE'],
    ['TERMINE', 'CLOTURE'],
  ] as const)('autorise la transition de projet %s → %s', (from, to) => {
    expect(canTransitionProject(from, to)).toBe(true);
  });

  it.each([
    ['CONTRE_PROPOSEE', 'ACCEPTEE'],
    ['CONTRE_PROPOSEE', 'REFUSEE'],
    ['REFUSEE', 'REMPLACEE'],
    ['EXPIREE', 'REMPLACEE'],
  ] as const)('autorise la transition de mission %s → %s', (from, to) => {
    expect(canTransitionMission(from, to)).toBe(true);
  });

  it.each([
    ['CLOTURE', 'DEVIS'],
    ['ABANDONNE', 'DEVIS'],
  ] as const)('refuse la transition de projet %s → %s', (from, to) => {
    expect(canTransitionProject(from, to)).toBe(false);
  });

  it.each([
    ['CONTRE_PROPOSEE', 'PLANIFIEE'],
    ['REFUSEE', 'ACCEPTEE'],
    ['EXPIREE', 'PLANIFIEE'],
    ['REMPLACEE', 'PROPOSEE'],
  ] as const)('refuse la transition métier %s → %s', (from, to) => {
    expect(canTransitionMission(from, to)).toBe(false);
  });
});
