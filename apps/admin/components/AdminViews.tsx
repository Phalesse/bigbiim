import AdminResourcePage from '@/components/AdminResourcePage';

export function ProjectsAdminView() {
  return (
    <AdminResourcePage
      title="Supervision des projets"
      description="Suivez l’avancement des projets et repérez les demandes nécessitant une intervention."
      endpoint="/projects?limit=100"
      rowLinkTemplate="/projets/:id"
      columns={[
        { key: 'id', label: 'Référence' },
        { key: 'status', label: 'Statut', format: 'status' },
        { key: 'city', label: 'Ville' },
        { key: 'totalAmount', label: 'Montant', format: 'amount' },
        { key: 'currency', label: 'Devise' },
        { key: 'createdAt', label: 'Créé le', format: 'date' },
      ]}
      emptyMessage="Aucun projet n’a encore été enregistré."
    />
  );
}

export function ProvidersAdminView() {
  return (
    <AdminResourcePage
      title="Validation des prestataires"
      description="Consultez les profils et le niveau de vérification des prestataires."
      endpoint="/admin/providers?limit=100"
      actionBase="/admin/providers"
      rowActions={[
        { kind: 'verify', label: 'Valider KYC' },
        { kind: 'reject', label: 'Refuser' },
        { kind: 'suspend', label: 'Suspendre' },
      ]}
      columns={[
        { key: 'id', label: 'Référence' },
        { key: 'legalName', label: 'Nom légal' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Statut', format: 'status' },
        { key: 'kycLevel', label: 'Niveau KYC' },
        { key: 'createdAt', label: 'Inscrit le', format: 'date' },
      ]}
      emptyMessage="Aucun prestataire ne correspond à cette file."
    />
  );
}

export function PaymentsAdminView() {
  return (
    <AdminResourcePage
      title="Paiements et séquestre"
      description="Suivez les paiements et les opérations financières enregistrés sur la plateforme."
      endpoint="/payments?limit=100"
      columns={[
        { key: 'id', label: 'Référence' },
        { key: 'projectId', label: 'Projet' },
        { key: 'amount', label: 'Montant', format: 'amount' },
        { key: 'currency', label: 'Devise' },
        { key: 'operator', label: 'Opérateur' },
        { key: 'status', label: 'Statut', format: 'status' },
        { key: 'createdAt', label: 'Date', format: 'date' },
      ]}
      emptyMessage="Aucun paiement n’est disponible."
    />
  );
}

export function DisputesAdminView() {
  return (
    <AdminResourcePage
      title="Litiges"
      description="Examinez les dossiers en attente de décision et suivez leur résolution."
      endpoint="/admin/disputes?limit=100"
      actionBase="/admin/disputes"
      rowActions={[{ kind: 'decide', label: 'Enregistrer la décision' }]}
      columns={[
        { key: 'id', label: 'Référence' },
        { key: 'projectId', label: 'Projet' },
        { key: 'milestoneId', label: 'Jalon' },
        { key: 'status', label: 'Statut', format: 'status' },
        { key: 'openedBy', label: 'Ouvert par' },
        { key: 'createdAt', label: 'Ouvert le', format: 'date' },
      ]}
      emptyMessage="Aucun litige en attente."
    />
  );
}

export function ActivitiesAdminView() {
  return (
    <AdminResourcePage
      title="Catalogue d’activités"
      description="Gérez les modèles d’activité, leurs statuts et leurs versions."
      endpoint="/admin/activities?limit=100"
      rowLinkTemplate="/activites/:id/informations"
      columns={[
        { key: 'slug', label: 'Identifiant' },
        { key: 'sectorId', label: 'Secteur' },
        { key: 'status', label: 'Statut', format: 'status' },
        { key: 'currentVersionId', label: 'Version publiée' },
        { key: 'updatedAt', label: 'Modifié le', format: 'date' },
      ]}
      emptyMessage="Le catalogue est vide. Créez un brouillon pour commencer."
      action={{ label: '＋ Nouvelle activité', href: '/activites/nouvelle/informations' }}
    />
  );
}

export function AuditAdminView() {
  return (
    <AdminResourcePage
      title="Journal d’audit"
      description="Historique en lecture seule des actions sensibles de la plateforme."
      endpoint="/admin/audit-logs?limit=100"
      columns={[
        { key: 'at', label: 'Date', format: 'date' },
        { key: 'actorId', label: 'Acteur' },
        { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Ressource' },
        { key: 'entityId', label: 'Identifiant' },
      ]}
      emptyMessage="Aucune action enregistrée."
    />
  );
}

export function UsersAdminView() {
  return (
    <AdminResourcePage
      title="Utilisateurs et rôles"
      description="Consultez les comptes, leurs statuts et leurs rôles attribués."
      endpoint="/admin/users?limit=100"
      columns={[
        { key: 'id', label: 'Référence' },
        { key: 'email', label: 'E-mail' },
        { key: 'phone', label: 'Téléphone' },
        { key: 'type', label: 'Type de compte' },
        { key: 'roles', label: 'Rôles' },
        { key: 'status', label: 'Statut', format: 'status' },
        { key: 'createdAt', label: 'Inscrit le', format: 'date' },
      ]}
      emptyMessage="Aucun utilisateur enregistré."
    />
  );
}

export function TemplatesAdminView() {
  return (
    <AdminResourcePage
      title="Modèles de contrat et de notification"
      description="Consultez les modèles de contrat disponibles et leurs versions."
      endpoint="/admin/contract-templates?limit=100"
      columns={[
        { key: 'name', label: 'Nom' },
        { key: 'version', label: 'Version' },
        { key: 'locale', label: 'Langue' },
        { key: 'variablesSchema', label: 'Variables' },
        { key: 'updatedAt', label: 'Modifié le', format: 'date' },
      ]}
      emptyMessage="Aucun modèle de contrat n’est enregistré."
    />
  );
}
