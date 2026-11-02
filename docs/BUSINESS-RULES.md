# Logiques métier (section 3 du document)

Tout ce qui suit est **indépendant de l'activité** : le moteur lit le modèle d'activité (JSONB versionné) et applique ces règles génériques. Les fichiers à coder sont indiqués pour chaque règle.

## 3.1 Cycle de vie d'un projet — `apps/api/src/modules/projects/project.states.ts`
BROUILLON → DEVIS, ABANDONNE · DEVIS → EQUIPE, EXPIRE · EQUIPE → CONTRAT, DEVIS · CONTRAT → CONFIRME, ANNULE · CONFIRME → EN_COURS, ANNULE · EN_COURS → TERMINE, EN_LITIGE, ANNULE · EN_LITIGE → EN_COURS, ANNULE, TERMINE · TERMINE → CLOTURE · CLOTURE terminal.
Chaque transition est une commande explicite qui produit un événement et un enregistrement d'historique (`ProjectEvent`). Aucun état n'est modifié hors de la machine à états.

## 3.2 Cycle de vie d'une mission
PROPOSEE → ACCEPTEE, REFUSEE, CONTRE_PROPOSEE ou EXPIREE → PLANIFIEE → EN_COURS → LIVREE → VALIDEE. Branches : ANNULEE, EN_LITIGE, REMPLACEE.
Une contre-proposition mène à ACCEPTEE ou REFUSEE ; une mission REFUSEE ou EXPIREE peut être remplacée (REMPLACEE). Les transitions des branches ANNULEE et EN_LITIGE restent à préciser avant leur activation.

Les offres `MissionOffer` utilisent les états `PROPOSEE`, `ACCEPTEE`, `REFUSEE`, `CONTRE_PROPOSEE` et `REMPLACEE`. Une acceptation attribue la mission au profil prestataire et clôt les autres offres proposées. Une contre-proposition conserve prix/date dans l'offre jusqu'à la décision du client (`POST /missions/{id}/counter/resolve`) ; elle ne modifie pas le prix contractuel avant acceptation.

## 3.3 Moteur de questionnaire dynamique — `modules/rules`, `modules/builder`
Types de champs : texte, nombre, date, plage de dates, choix unique, choix multiple, oui/non, adresse (ville + quartier + point GPS), montant, fichier, liste répétable. Validations : obligatoire, min, max, motif, longueur, dépendance entre champs. Conditions d'affichage par expression. Valeurs dérivées (ex. `nb_tables = ceil(invites / 8)`). Rendu côté client depuis un schéma JSON ; validation **refaite côté serveur** avec le même schéma.

## 3.4 Moteur de règles et de formules — `packages/rules`
JSONLogic sans effet de bord ni exécution de code (voir ADR 0005) : opérateurs arithmétiques et comparaisons, `if`, `min`, `max`, `ceil`, `floor`, `round`, `lookup(table, clé)`, accès `answers.*` et `settings.*`. Limites strictes : taille d'expression, profondeur, nombre de nœuds évalués et taille de sortie. Formules testées dans l'Activity Builder avant publication. Utilisations : quantités de rôles, prix, remises, jalons, conditions d'étape, critères de matching.

## 3.5 Génération du plan de projet
1. Instancier les rôles selon les quantités calculées. 2. Instancier les étapes dont la condition est vraie. 3. Graphe de dépendances sans cycle (tri topologique). 4. Planning à rebours depuis une date cible ou en avant depuis une date de début ; chemin critique. 5. Rattacher les jalons de paiement.

## 3.6 Calcul du devis
Prix d'un rôle = formule du modèle ou tarif du prestataire choisi (plafond et plancher possibles). Avant le matching : fourchette (min, médiane, max) ; après la sélection : prix ferme. Total = lignes + frais de coordination + frais de plateforme − remises + taxes locales. Montants en unités mineures entières + devise, règles d'arrondi uniques. Devis verrouillé et daté (validité 7 jours) ; toute modification du questionnaire crée une nouvelle version du devis.
Le calcul partagé `packages/rules/src/quote.ts` reçoit les prix unitaires et frais déjà évalués en unités mineures, calcule les lignes avec une arithmétique entière exacte, puis refuse les montants invalides, les remises supérieures au sous-total avant taxes et les résultats dépassant la précision entière sûre de JavaScript. Les formules JSONLogic doivent être évaluées et arrondies avant leur conversion en unités mineures. La définition d'activité porte le code `pricing.currency` ISO 4217 et les tables de correspondance sous `pricing.tables`. Chaque rôle expose sa clé (`key` ou `roleKey`), sa quantité (`quantity` ou `quantity_formula`) et son prix unitaire (`unit_amount` ou `price_formula`) ; les montants sont des unités mineures entières.

## 3.7 Matching — `modules/matching`
Filtres durs : compétence vérifiée pour le rôle, licence exigée valide à la date de la mission, zone compatible, disponibilité et capacité, compte actif non suspendu, niveau de vérification suffisant.

| Critère | Poids par défaut |
|---|---|
| Note bayésienne | 0,25 |
| Prix par rapport au budget | 0,20 |
| Proximité | 0,15 |
| Fiabilité (acceptation, ponctualité, annulations) | 0,15 |
| Expérience dans cette activité | 0,10 |
| Équité de répartition | 0,10 |
| Délai de réponse | 0,05 |

Sortie : 3 meilleurs par rôle avec la raison du classement. Contraintes entre rôles déclarables dans le modèle. Échec : élargir la zone, autre date, liste d'attente, alerte administrateur.

## 3.8 Offres de mission
Délai de réponse (24 h par défaut) et relances. Mode « choix du client » ou « premier qui accepte ». Refus ou expiration : remplacement automatique par le suivant. La contre-proposition (prix, date) est soumise au client et ne modifie jamais le contrat sans accord.

## 3.9 Contrat et signature — `modules/contracts`
Généré depuis un modèle avec variables. Contrat cadre client–plateforme + sous-contrats plateforme–prestataire (rôle juridique à faire valider par un juriste local). Signature par OTP, horodatage, hash du PDF conservé, avenants versionnés.

## 3.10 Paiement, séquestre et commissions — `modules/payments`
Grand livre en partie double, écritures immuables. Flux : paiement client → séquestre → libération par jalon → part prestataire + commission → portefeuille → retrait Mobile Money. Idempotence (`Idempotency-Key`), webhooks rejouables, réconciliation quotidienne, retenue de garantie optionnelle (5 à 10 %), libération automatique après 72 h sans réaction du client (sauf contestation), barème d'annulation défini dans le modèle. Les fonds sont détenus via un partenaire de paiement agréé.

## 3.11 Jalons et preuves
Types de preuve : photos horodatées (avec localisation), document, signature du client, code de remise, rapport de contrôle. Le modèle définit la preuve exigée par jalon ; sans preuve le jalon ne peut pas être soumis. Le client valide, conteste, ou la validation automatique s'applique.

## 3.12 Litiges — `modules/trust`
Ouverture (jalon gelé) → délai de réponse et preuves → médiation admin → décision (libération totale ou partielle, remboursement total ou partiel, remplacement, pénalité) → effets sur la réputation et trace d'audit.

## 3.13 Réputation
Note moyenne bayésienne ; fiabilité : acceptation, ponctualité, annulations tardives, litiges perdus ; badges (vérifié, expert) et pénalités qui influencent le matching ; seuls les clients ayant réellement payé peuvent laisser un avis.

## 3.14 Vérification des prestataires (KYC) — `modules/providers/kyc.ts`

| Niveau | Exigence | Donne accès à |
|---|---|---|
| 0 | Téléphone vérifié | Profil visible en brouillon |
| 1 | Pièce d'identité + selfie | Missions simples |
| 2 | Justificatifs de métier, références | Missions standard |
| 3 | Licence ou agrément vérifié | Activités réglementées |

Licences avec date d'expiration : alerte avant échéance, suspension automatique de l'éligibilité à l'expiration (worker `provider-license-expiry`).

## 3.15 Versionnage des modèles d'activité
Une version publiée est immuable ; toute modification crée la version n+1 ; un projet reste attaché à la version vendue ; retrait = plus de nouvelles ventes, projets en cours conservés. La publication exige : validation de cohérence, simulation réussie, minimum de prestataires vérifiés par rôle obligatoire (par exemple 5).

## 3.16 Modification d'un projet en cours
Changement de date ou de lieu : revalidation par chaque prestataire concerné, sinon remplacement. Ajout d'un rôle : avenant + nouveau jalon. Recalcul du devis avec historique.

## 3.17 Événements du domaine
Voir `docs/EVENTS.md`.

## 3.18 Notifications — `modules/notifications`
Événement → destinataire → canal (push, WhatsApp, SMS, e-mail) → modèle multilingue. Repli automatique (WhatsApp → SMS). Heures de silence, déduplication, désinscription par type.

## 3.19 Anti-contournement et fraude
Détection de numéros et de liens dans la messagerie avant la signature. Limites et alertes sur retraits, comptes multiples, avis suspects, paiements anormaux.

## 3.20 Permissions (RBAC)

| Ressource | Client | Prestataire | Admin |
|---|---|---|---|
| Ses propres projets | lecture, écriture | missions liées seulement | tout |
| Profils prestataires | public limité | le sien | tout |
| Documents KYC | non | les siens | lecture sur décision |
| Modèles d'activité | lecture publiée | lecture publiée | création, publication |
| Paiements | les siens | son portefeuille | tout, double validation sur les montants sensibles |
| Journal d'audit | non | non | lecture seule |
