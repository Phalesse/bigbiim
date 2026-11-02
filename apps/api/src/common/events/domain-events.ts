/** Événements du domaine (section 3.17). Les nouveaux services s'y abonnent sans modifier le cœur. */
export const DOMAIN_EVENTS = [
  'ProjetCréé',
  'RéponsesProjetModifiées',
  'DevisCalculé',
  'ÉquipeConfirmée',
  'ContratSigné',
  'AcomptePayé',
  'MissionProposée',
  'MissionAcceptée',
  'MissionRefusée',
  'MissionContreProposée',
  'MissionPlanifiée',
  'MissionCommencée',
  'AvancementMissionDéclaré',
  'LivrableDéposé',
  'MissionTerminée',
  'PreuveSoumise',
  'JalonValidé',
  'PaiementLibéré',
  'LitigeOuvert',
  'LitigeRésolu',
  'ProjetTerminé',
  'ProjetAnnulé',
  'AvisPublié',
  'PrestataireVérifié',
  'ActivitéPubliée',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[number];

/** Enveloppe commune : identifiant unique, date, version de schéma, identifiant de corrélation du projet. */
export interface DomainEvent<T = unknown> {
  id: string;
  type: DomainEventType;
  occurredAt: string;
  schemaVersion: number;
  correlationId: string;
  payload: T;
}
