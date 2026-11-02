import type { Handler } from '../handler';
import { blockedHandler } from '../runtime';

export const notificationsDispatch: Handler = blockedHandler(
  'notifications-dispatch',
  'dispatch bloqué: aucun adaptateur de canal, contrat fournisseur, modèle de notification ou file de notifications n’est défini. Aucune notification ne sera marquée comme envoyée.',
);
