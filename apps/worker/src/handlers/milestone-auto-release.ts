import type { Handler } from '../handler';
import { blockedHandler } from '../runtime';

/** Cannot change a milestone or ledger until an authorized payment-release contract exists. */
export const milestoneAutoRelease: Handler = blockedHandler(
  'milestone-auto-release',
  'libération automatique bloquée: le partenaire de paiement agréé et le contrat de transaction grand livre ne sont pas définis (ADR 0006). Aucun jalon ni fonds ne sera modifié.',
);
