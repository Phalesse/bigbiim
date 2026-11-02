/** Niveaux de vérification des prestataires (section 3.14). */
export const KYC_LEVELS = [
  { level: 0, requirement: 'Téléphone vérifié', grants: 'Profil visible en brouillon' },
  { level: 1, requirement: 'Pièce d’identité + selfie', grants: 'Missions simples' },
  { level: 2, requirement: 'Justificatifs de métier, références', grants: 'Missions standard' },
  { level: 3, requirement: 'Licence ou agrément professionnel vérifié', grants: 'Activités réglementées' },
] as const;
