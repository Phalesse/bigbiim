# API (section 2 du document)

REST JSON sous `/api/v1`, OpenAPI dans `packages/contracts/openapi.yaml`, authentification Bearer (OIDC/JWT), pagination par curseur, erreurs RFC 7807, en-tête `Idempotency-Key` sur les POST qui touchent l'argent, WebSocket `/ws`, sondes `/health/live` et `/health/ready`.
Rôles : `public`, `C` client, `P` prestataire, `A` administrateur. Chaque route a une méthode de service dans `apps/api/src/modules/<module>/<module>.service.ts` : c'est là que vous codez.

| Module | Méthode | Route (`/api/v1`) | Rôles | Description |
|---|---|---|---|---|
| `identity` | POST | `/auth/otp/request` | public | Envoie un code par SMS/WhatsApp |
| `identity` | POST | `/auth/otp/verify` | public | Vérifie le code, renvoie les jetons |
| `identity` | POST | `/auth/register` | public | Crée un compte (client ou prestataire) |
| `identity` | POST | `/auth/login` | public | Connexion par e-mail et mot de passe |
| `identity` | POST | `/auth/refresh` | any | Renouvelle le jeton |
| `identity` | POST | `/auth/logout` | any | Révoque la session |
| `identity` | GET | `/me` | any | Profil courant |
| `identity` | PATCH | `/me` | any | Modifie le profil |
| `identity` | PUT | `/me/notification-preferences` | any | Canaux et langues |
| `identity` | DELETE | `/me` | any | Demande de suppression (droit à l’effacement) |
| `identity` | GET | `/admin/users` | A | Comptes et rôles |
| `catalog` | GET | `/sectors` | public | Arborescence des secteurs |
| `catalog` | GET | `/activities` | public | Recherche (q, sector, city, page) |
| `catalog` | GET | `/activities/{id}` | public | Fiche activité publiée |
| `catalog` | GET | `/activities/{id}/questionnaire` | public | Questionnaire de la version publiée |
| `catalog` | GET | `/activities/{id}/estimate` | public | Fourchette de prix indicative |
| `catalog` | GET | `/skills` | public | Catalogue de compétences |
| `builder` | POST | `/admin/activities` | A | Crée une activité en brouillon |
| `builder` | GET | `/admin/activities` | A | Liste avec statuts |
| `builder` | GET | `/admin/activities/{id}/draft` | A | Document complet du brouillon |
| `builder` | PUT | `/admin/activities/{id}/draft` | A | Enregistre le brouillon |
| `builder` | POST | `/admin/activities/{id}/validate` | A | Valide les sections requises et le graphe des étapes |
| `builder` | POST | `/admin/activities/{id}/simulate` | A | Prévisualisation structurelle (sans devis ni planning) |
| `builder` | POST | `/admin/activities/{id}/publish` | A | Publie la version n |
| `builder` | GET | `/admin/activities/{id}/versions` | A | Historique des versions |
| `builder` | POST | `/admin/activities/{id}/retire` | A | Retire du catalogue (projets en cours conservés) |
| `builder` | POST | `/admin/skills` | A | Crée ou modifie une compétence |
| `builder` | POST | `/admin/sectors` | A | Crée ou modifie un secteur |
| `providers` | POST | `/providers` | P | Crée le profil prestataire |
| `providers` | GET | `/providers/{id}` | P,A | Profil privé complet |
| `providers` | PATCH | `/providers/{id}` | P | Modifie le profil |
| `providers` | GET | `/providers/{id}/public` | public | Profil public |
| `providers` | PUT | `/providers/{id}/skills` | P | Compétences déclarées |
| `providers` | POST | `/providers/{id}/documents` | P | Dépose un justificatif |
| `providers` | PUT | `/providers/{id}/availability` | P | Agenda et capacité |
| `providers` | PUT | `/providers/{id}/zones` | P | Zones d’intervention |
| `providers` | PUT | `/providers/{id}/rates` | P | Tarifs par compétence |
| `providers` | GET | `/providers/{id}/reviews` | public | Avis reçus |
| `providers` | GET | `/admin/providers` | A | File de validation (status) |
| `providers` | POST | `/admin/providers/{id}/verify` | A | Valide |
| `providers` | POST | `/admin/providers/{id}/reject` | A | Refuse avec motif |
| `providers` | POST | `/admin/providers/{id}/suspend` | A | Suspend |
| `projects` | POST | `/projects` | C | Crée un projet depuis une version d’activité |
| `projects` | PATCH | `/projects/{id}/answers` | C | Enregistre les réponses du questionnaire |
| `projects` | POST | `/projects/{id}/quote` | C | Calcule le devis |
| `projects` | GET | `/projects/{id}/quote` | C | Lit le devis courant |
| `projects` | POST | `/projects/{id}/team/suggest` | C | Lance le matching (ville et date souhaitée requises) |
| `projects` | PUT | `/projects/{id}/team/{role}` | C | Propose un prestataire suggéré (`{ "providerId": "…" }`), offre valable 24 h |
| `projects` | POST | `/projects/{id}/team/{role}/replace` | C,A | Remplace une mission refusée/expirée (`{ "missionId": "…", "providerId": "…" }`), offre valable 24 h |
| `projects` | POST | `/projects/{id}/confirm` | C | Génère le contrat et ouvre la réservation |
| `projects` | GET | `/projects` | C,A | Liste des projets |
| `projects` | GET | `/projects/{id}` | C,P,A | Détail |
| `projects` | GET | `/projects/{id}/timeline` | C,P,A | Chronologie et phases |
| `projects` | POST | `/projects/{id}/cancel` | C,A | Annule selon les règles |
| `projects` | GET | `/missions` | P | Offres et missions du prestataire |
| `projects` | POST | `/missions/{id}/accept` | P | Accepte |
| `projects` | POST | `/missions/{id}/decline` | P | Refuse avec motif |
| `projects` | POST | `/missions/{id}/counter` | P | Contre-proposition (prix, date) |
| `projects` | POST | `/missions/{id}/start` | P | Démarre |
| `projects` | POST | `/missions/{id}/progress` | P | Déclare l’avancement |
| `projects` | POST | `/missions/{id}/deliverables` | P | Dépose un livrable |
| `projects` | POST | `/missions/{id}/complete` | P | Déclare la mission terminée |
| `projects` | GET | `/projects/{id}/milestones` | C,P,A | Jalons du projet |
| `projects` | POST | `/milestones/{id}/submit-proof` | P | Soumet les preuves |
| `projects` | POST | `/milestones/{id}/approve` | C | Valide, libère le paiement (Idempotency-Key obligatoire) |
| `projects` | POST | `/milestones/{id}/contest` | C | Conteste, ouvre un litige |
| `contracts` | GET | `/projects/{id}/contract` | C,P,A | Contrat courant |
| `contracts` | POST | `/contracts/{id}/sign` | C,P | Signature (OTP) |
| `contracts` | GET | `/contracts/{id}/pdf` | C,P,A | Document signé |
| `contracts` | GET | `/admin/contract-templates` | A | Liste des modèles de contrat |
| `payments` | POST | `/payments/intents` | C | Crée un paiement (acompte ou solde) (Idempotency-Key obligatoire) |
| `payments` | POST | `/payments/webhooks/{operator}` | operator | Confirmation Mobile Money ou carte |
| `payments` | GET | `/payments` | C,A | Historique |
| `payments` | GET | `/wallets/me` | P | Solde et mouvements |
| `payments` | POST | `/wallets/me/payouts` | P | Demande de retrait (Idempotency-Key obligatoire) |
| `payments` | GET | `/invoices` | C,P | Factures et reçus |
| `payments` | POST | `/admin/refunds` | A | Remboursement (Idempotency-Key obligatoire) |
| `payments` | POST | `/admin/payouts/{id}/approve` | A | Valide un retrait sensible (Idempotency-Key obligatoire) |
| `messaging` | GET | `/projects/{id}/messages` | C,P,A | Historique des messages |
| `messaging` | POST | `/projects/{id}/messages` | C,P,A | Envoie un message |
| `trust` | POST | `/missions/{id}/review` | C | Note et avis |
| `trust` | POST | `/disputes` | C,P | Ouvre un litige |
| `trust` | POST | `/disputes/{id}/evidence` | C,P | Ajoute une preuve |
| `trust` | POST | `/admin/disputes/{id}/decision` | A | Rend une décision |
| `trust` | GET | `/admin/disputes` | A | Litiges sans décision (ou statut demandé) |
| `notifications` | GET | `/notifications` | any | Liste |
| `notifications` | POST | `/notifications/{id}/read` | any | Marque comme lue |
| `files` | POST | `/files/presign` | any | URL signée de dépôt |
| `files` | GET | `/files/{id}` | authorized | Téléchargement contrôlé |
| `audit` | GET | `/admin/kpis` | A | Indicateurs |
| `audit` | GET | `/admin/audit-logs` | A | Journal d’audit |
| `audit` | GET | `/admin/settings` | A | Paramètres actuels |
| `audit` | PUT | `/admin/settings` | A | Commissions, zones, drapeaux |

## Routes volontairement indisponibles

Les services répondent `501 Not Implemented` lorsqu’une dépendance ou une règle métier indispensable n’est pas définie. Aucun comportement local simulé n’est utilisé pour l’authentification, les mouvements financiers ou la signature.

- Authentification OTP, inscription, connexion et renouvellement/révocation : fournisseur OIDC et fournisseur SMS/WhatsApp non configurés.
- Paiement, webhook, solde/retrait, remboursement et validation de jalon : agrégateur non choisi et procédures de séquestre/rapprochement non définies (ADR 0006).
- Matching, assignation et remplacement de missions : les suggestions exigent une ville et une date souhaitée; une nouvelle offre n’est créée que pour un candidat suggéré, avec une expiration à 24 h. Le remplacement est limité aux missions refusées/expirées durant la constitution d’équipe.
- Confirmation de projet : génération/signature du contrat et réservation indisponibles tant que les intégrations nécessaires ne sont pas configurées.
- PDF/signature et fichiers : fournisseur de stockage, signature OTP et URLs temporaires non configurés.
- Messagerie : règles de modération anti-contournement et de pièces jointes manquantes.
- Estimation catalogue : la fourchette n’est renvoyée que lorsqu’une fourchette min/médiane/max explicite et valide existe dans la version publiée.
