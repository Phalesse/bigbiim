import type { Handler } from '../handler';
import { blockedHandler } from '../runtime';

export const fileScan: Handler = blockedHandler(
  'file-scan',
  'analyse antivirus bloquée: aucun moteur antivirus ni adaptateur de lecture du stockage objet n’est configuré. Les fichiers ne seront pas marqués comme propres.',
);
