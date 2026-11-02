# Plan de construction (section 6 du document)

## Deux jalons
- **Jalon A — colonne vertébrale (~8 semaines)** : identité, catalogue, Activity Builder, questionnaire dynamique, règles, projets, devis, prestataires, contrat, paiement par jalons. Matching, suivi avancé et litiges traités manuellement par l'administrateur derrière les mêmes écrans.
- **Jalon B — MVP complet (~14 à 16 semaines)** : matching automatique, offres de mission, messagerie temps réel, preuves, litiges, réputation, notifications multicanal, retraits.

| Semaines | Objectifs |
|---|---|
| 1 | Cadrage, décisions d'architecture, maquettes des parcours clés |
| 2–3 | Socle : CI/CD, Docker, Helm, identité, fichiers, audit |
| 3–5 | Catalogue + Activity Builder + moteur de règles + questionnaire dynamique |
| 5–6 | Prestataires, KYC, disponibilités, zones, compétences |
| 6–8 | Projets, devis, plan, contrat, signature, grand livre, acompte (**Jalon A**) |
| 9–10 | Matching automatique, offres de mission, contre-propositions |
| 11–12 | Jalons, preuves, libération de paiement, retraits Mobile Money |
| 13–14 | Messagerie, notifications, avis, réputation, litiges |
| 15–16 | Durcissement : sécurité, charge, observabilité, sauvegardes, bêta fermée (**Jalon B**) |

## Les trois activités qui prouvent l'universalité du moteur (6.3)
Décrites **uniquement par configuration** (`seeds/activites/*.json`, à remplir) :
1. Activité à forte fréquence et date fixe (cérémonie, événement) — planification à rebours, quantités par formule, acomptes.
2. Activité administrative à étapes séquentielles (création d'entreprise) — licences, dépendances strictes, livrables documentaires.
3. Activité à projet long et jalons multiples (rénovation, chantier) — jalons, preuves, retenue de garantie, avenants.
Si l'une exige du code spécifique, il manque une brique générique : on enrichit le moteur.

## Définition de « terminé » pour le MVP (6.4)
- Un administrateur crée et publie une activité en moins d'une demi-journée, sans développeur.
- Un client loue une activité, obtient une équipe, signe, paie l'acompte et suit son projet depuis un téléphone sur connexion faible.
- Un prestataire s'inscrit, est vérifié, accepte une mission, prouve l'avancement et reçoit son argent sur Mobile Money.
- Un déploiement en production n'interrompt aucun utilisateur connecté.
- Le grand livre est équilibré à chaque instant et réconcilié chaque jour.
- Une restauration complète depuis les sauvegardes a été réalisée avec succès.

## À décider ou vérifier avant de coder (6.5)
Juridique (statut, rôle de la plateforme, CGU, responsabilité) · Paiement (partenaire agréé pour le séquestre, frais, délais) · Fiscalité (facturation, TVA, retenues) · Données (hébergement, conservation, loi béninoise) · Équipe (développement, exploitation, support) · Secteurs réglementés (santé, droit, finance, transport : après avis juridique).
