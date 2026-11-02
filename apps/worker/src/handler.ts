export interface Handler {
  name: string;
  /** Démarre le traitement (boucle, abonnement NATS, tâche planifiée...). */
  start(): Promise<void> | void;
  /** Arrête le traitement et libère ses ressources. */
  stop?(): Promise<void> | void;
}
