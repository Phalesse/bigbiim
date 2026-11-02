# Écrans (section 1 du document)

Les routes d'administration ont un espace commun responsive. Le tableau de bord, les listes opérationnelles, les exports CSV et les sections de l'Activity Builder sont implémentés ; le Builder stocke les définitions JSON versionnées et vérifie la cohérence structurelle avant publication.

La prévisualisation du Builder reste structurelle : elle ne calcule pas encore de devis ni de planning. Certaines opérations serveur (décisions de litiges, remboursements et actions sur les prestataires) restent à implémenter ; les écrans affichent les erreurs API au lieu de simuler une réussite. Les routes client et prestataire du tableau restent à réaliser.
M = MVP, V2 = après le MVP. Web = client + prestataire + public ; Admin = back-office.

| Code | Écran | Acteurs | Prio | Route | Fichier à coder | Contenu |
|---|---|---|---|---|---|---|
| S01 | Accueil | public | M | `/` | `apps/web/app/page.tsx` | Recherche d’activité, secteurs, comment ça marche, témoignages |
| S02 | Secteurs et activités | public | M | `/activites` | `apps/web/app/activites/page.tsx` | Liste filtrable, recherche, tri |
| S03 | Fiche activité | public | M | `/activites/[id]` | `apps/web/app/activites/[id]/page.tsx` | Description, étapes, équipe type, fourchette de prix, avis, bouton « Louer cette activité » |
| S04 | Inscription / connexion | public | M | `/connexion` | `apps/web/app/connexion/page.tsx` | Téléphone + code OTP, e-mail, choix du type de compte |
| S05 | Légal | public | M | `/legal` | `apps/web/app/legal/page.tsx` | CGU, confidentialité |
| S05 | Aide | public | M | `/aide` | `apps/web/app/aide/page.tsx` | FAQ |
| S05 | Contact | public | M | `/contact` | `apps/web/app/contact/page.tsx` | Formulaire de contact |
| S06 | Page prestataire publique | public | M | `/prestataires/[id]` | `apps/web/app/prestataires/[id]/page.tsx` | Profil, compétences, portfolio, avis |
| S07 | Hors-ligne | public | M | `/hors-ligne` | `apps/web/app/hors-ligne/page.tsx` | État hors-ligne et mode faible connexion |
| S07 | Maintenance | public | M | `/maintenance` | `apps/web/app/maintenance/page.tsx` | Page de maintenance |
| C01 | Tableau de bord client | C | M | `/client` | `apps/web/app/client/page.tsx` | Projets en cours, actions à faire, notifications |
| C02 | Assistant de configuration | C | M | `/client/projets/[id]/configuration` | `apps/web/app/client/projets/[id]/configuration/page.tsx` | Questionnaire dynamique en étapes (généré depuis le modèle d’activité), sauvegarde automatique |
| C03 | Récapitulatif et devis | C | M | `/client/projets/[id]/devis` | `apps/web/app/client/projets/[id]/devis/page.tsx` | Lots, prix détaillés, formule, total, durée estimée |
| C04 | Composition de l’équipe | C | M | `/client/projets/[id]/equipe` | `apps/web/app/client/projets/[id]/equipe/page.tsx` | Propositions par rôle, comparaison, remplacement, profil détaillé |
| C05 | Contrat et signature | C | M | `/client/projets/[id]/contrat` | `apps/web/app/client/projets/[id]/contrat/page.tsx` | Lecture du contrat unique, signature électronique (OTP) |
| C06 | Paiement | C | M | `/client/projets/[id]/paiement` | `apps/web/app/client/projets/[id]/paiement/page.tsx` | Acompte par Mobile Money ou carte, reçu |
| C07 | Détail du projet | C | M | `/client/projets/[id]` | `apps/web/app/client/projets/[id]/page.tsx` | Chronologie, phases, équipe, documents, paiements, statut |
| C08 | Validation de jalon | C | M | `/client/projets/[id]/jalons/[milestoneId]` | `apps/web/app/client/projets/[id]/jalons/[milestoneId]/page.tsx` | Preuves (photos, fichiers), accepter ou contester |
| C09 | Messagerie du projet | C | M | `/client/projets/[id]/messages` | `apps/web/app/client/projets/[id]/messages/page.tsx` | Fil de groupe, pièces jointes |
| C10 | Évaluation | C | M | `/client/projets/[id]/evaluation` | `apps/web/app/client/projets/[id]/evaluation/page.tsx` | Notes et avis par prestataire et pour la plateforme |
| C11 | Litige | C | M | `/client/projets/[id]/litige` | `apps/web/app/client/projets/[id]/litige/page.tsx` | Ouvrir, ajouter des preuves, suivre la décision |
| C12 | Paiements et factures | C | M | `/client/paiements` | `apps/web/app/client/paiements/page.tsx` | Historique, téléchargement |
| C13 | Profil et paramètres | C | M | `/client/profil` | `apps/web/app/client/profil/page.tsx` | Langue, notifications, moyens de paiement |
| C14 | Annulation et modification de projet | C | M | `/client/projets/[id]/annulation` | `apps/web/app/client/projets/[id]/annulation/page.tsx` | Conditions, remboursement estimé |
| C15 | Centre de notifications | C | M | `/client/notifications` | `apps/web/app/client/notifications/page.tsx` | Liste, lu/non lu |
| C16 | Projets favoris / modèles réutilisables | C | V2 | `/client/modeles` | `apps/web/app/client/modeles/page.tsx` | Relancer une activité déjà faite |
| P01 | Onboarding prestataire | P | M | `/prestataire/onboarding` | `apps/web/app/prestataire/onboarding/page.tsx` | Assistant : identité, compétences, zone, tarifs, justificatifs |
| P02 | Édition du profil public | P | M | `/prestataire/profil` | `apps/web/app/prestataire/profil/page.tsx` | Présentation, portfolio, certifications |
| P03 | Vérification | P | M | `/prestataire/verification` | `apps/web/app/prestataire/verification/page.tsx` | Dépôt des documents, statut (en attente, validé, refusé) |
| P04 | Tableau de bord prestataire | P | M | `/prestataire` | `apps/web/app/prestataire/page.tsx` | Missions, revenus, alertes, taux d’acceptation |
| P05 | Offres de mission | P | M | `/prestataire/offres` | `apps/web/app/prestataire/offres/page.tsx` | Détail, délai de réponse, accepter, refuser, contre-proposer |
| P06 | Mission en cours | P | M | `/prestataire/missions/[id]` | `apps/web/app/prestataire/missions/[id]/page.tsx` | Tâches, livrables, déclaration d’avancement avec preuves |
| P07 | Agenda de disponibilité | P | M | `/prestataire/agenda` | `apps/web/app/prestataire/agenda/page.tsx` | Calendrier, indisponibilités, capacité |
| P08 | Portefeuille et retraits | P | M | `/prestataire/portefeuille` | `apps/web/app/prestataire/portefeuille/page.tsx` | Solde, historique, retrait Mobile Money |
| P09 | Messagerie prestataire | P | M | `/prestataire/messages` | `apps/web/app/prestataire/messages/page.tsx` | Fils par projet |
| P10 | Avis et réputation | P | M | `/prestataire/avis` | `apps/web/app/prestataire/avis/page.tsx` | Notes, commentaires, badges |
| P11 | Litiges prestataire | P | M | `/prestataire/litiges` | `apps/web/app/prestataire/litiges/page.tsx` | Réponse, preuves, décision |
| P12 | Paramètres prestataire | P | M | `/prestataire/parametres` | `apps/web/app/prestataire/parametres/page.tsx` | Langue, notifications, zones, tarifs |
| P13 | Équipe et sous-traitants | P | V2 | `/prestataire/equipe` | `apps/web/app/prestataire/equipe/page.tsx` | Gérer plusieurs personnes sous un même compte |
| A01 | Tableau de bord global | A | M | `/` | `apps/admin/app/page.tsx` | Projets, revenus, litiges, prestataires actifs |
| A02 | Liste des activités | A | M | `/activites` | `apps/admin/app/activites/page.tsx` | Statut (brouillon, publié, retiré), versions |
| A02a | Activity Builder : informations | A | M | `/activites/[id]/informations` | `apps/admin/app/activites/[id]/informations/page.tsx` | Nom, secteur, description, visuel, pays et villes |
| A02b | Activity Builder : questionnaire | A | M | `/activites/[id]/questionnaire` | `apps/admin/app/activites/[id]/questionnaire/page.tsx` | Éditeur de champs dynamiques (types, validations, conditions) |
| A02c | Activity Builder : rôles | A | M | `/activites/[id]/roles` | `apps/admin/app/activites/[id]/roles/page.tsx` | Rôles, compétences liées, quantités (formules), obligatoire ou non |
| A02d | Activity Builder : étapes | A | M | `/activites/[id]/etapes` | `apps/admin/app/activites/[id]/etapes/page.tsx` | Éditeur graphique des phases et dépendances |
| A02e | Activity Builder : prix et règles | A | M | `/activites/[id]/prix` | `apps/admin/app/activites/[id]/prix/page.tsx` | Formules de prix, remises, règles de matching |
| A02f | Activity Builder : jalons | A | M | `/activites/[id]/jalons` | `apps/admin/app/activites/[id]/jalons/page.tsx` | Répartition des paiements, preuve exigée par jalon |
| A02g | Activity Builder : contrat | A | M | `/activites/[id]/contrat` | `apps/admin/app/activites/[id]/contrat/page.tsx` | Modèle de contrat et clauses variables |
| A02h | Activity Builder : conformité | A | M | `/activites/[id]/conformite` | `apps/admin/app/activites/[id]/conformite/page.tsx` | Licences exigées, pays, restrictions |
| A02i | Activity Builder : simulation | A | M | `/activites/[id]/simulation` | `apps/admin/app/activites/[id]/simulation/page.tsx` | Faux projet de bout en bout avant publication |
| A02j | Activity Builder : publication et versions | A | M | `/activites/[id]/publication` | `apps/admin/app/activites/[id]/publication/page.tsx` | Publier, comparer, retirer, revenir en arrière |
| A03 | Catalogue de compétences | A | M | `/competences` | `apps/admin/app/competences/page.tsx` | Création, fusion, hiérarchie, synonymes |
| A04 | Secteurs et taxonomie | A | M | `/secteurs` | `apps/admin/app/secteurs/page.tsx` | Arborescence des secteurs |
| A05 | Validation des prestataires | A | M | `/prestataires` | `apps/admin/app/prestataires/page.tsx` | File d’attente, visionneuse de documents, décision |
| A06 | Supervision des projets | A | M | `/projets` | `apps/admin/app/projets/page.tsx` | Liste et consultation du détail, des étapes, jalons, devis et événements |
| A07 | Paiements et séquestre | A | M | `/paiements` | `apps/admin/app/paiements/page.tsx` | Transactions, réconciliation, remboursements, commissions |
| A08 | Litiges | A | M | `/litiges` | `apps/admin/app/litiges/page.tsx` | Dossier, preuves, médiation, décision |
| A09 | Utilisateurs et rôles | A | M | `/utilisateurs` | `apps/admin/app/utilisateurs/page.tsx` | Comptes, permissions, suspension |
| A10 | Modèles de contrat et de notification | A | M | `/modeles` | `apps/admin/app/modeles/page.tsx` | Textes, variables, langues |
| A11 | Paramètres | A | M | `/parametres` | `apps/admin/app/parametres/page.tsx` | Commissions, zones, devises, drapeaux de fonctionnalités |
| A12 | Journal d’audit | A | M | `/audit` | `apps/admin/app/audit/page.tsx` | Actions sensibles, filtres, export |
| A13 | Rapports et exports | A | V2 | `/rapports` | `apps/admin/app/rapports/page.tsx` | Indicateurs, CSV |
