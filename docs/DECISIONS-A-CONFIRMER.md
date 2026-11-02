# Points que le document ne tranchait pas (à confirmer)

Le projet suit le document de spécification. Là où celui-ci laisse un choix ouvert ou ne précise pas une valeur, voici ce qui a été fait, afin que rien ne soit caché.

| # | Sujet | Ce qui a été fait | À faire |
|---|---|---|---|
| 1 | Relations Prisma | Aucune `@relation` : clés étrangères = champs `xxxId` simples, avec index. UUID par défaut de Prisma (v4), pas v7 | Ajouter les relations, passer en UUID v7, puis utiliser des migrations versionnées (`npm run db:migrate`) avant la production |
| 2 | Démarrage de la base | `prisma db push --accept-data-loss` + `constraints.sql` à chaque démarrage (pratique en développement, peut effacer des données si le schéma change) | Remplacer par `prisma migrate deploy` en production |
| 3 | Statuts de `ActivityVersion` | `BROUILLON` / `PUBLIE` / `RETIRE` (utilisés par le déclencheur SQL d'immutabilité) | Confirmer ou renommer (à changer aussi dans `constraints.sql`) |
| 4 | `Ledger.direction` | `DEBIT` / `CREDIT` | Confirmer |
| 5 | Propriétaire de `/admin/kpis` et `/admin/settings` | Placés dans le module `audit` (le §5.1 ne les attribue à aucun module) | Créer un module dédié si vous préférez |
| 6 | Moteur d'expressions | JSONLogic sérialisé en JSON (`packages/rules`, ADR 0005) | Formules d'activité et tests de publication à compléter |
| 7 | Authentification | Validation des jetons OIDC RS256 via JWKS, émetteur/audience vérifiés ; rôles `C/P/A/operator` lus depuis `realm_access.roles` | Configurer le realm et mapper les rôles dans le fournisseur OIDC ; brancher l’inscription, OTP et sessions dans `modules/identity` |
| 8 | Agrégateur de paiement | Non choisi (FedaPay, KKiaPay, PayDunya, CinetPay à comparer) ; variables d'environnement vides dans `.env.example` | Choisir, vérifier agrément et séquestre |
| 9 | Commission | Pourcentage non fixé par le document | Définir dans `PUT /admin/settings` |
| 10 | Transitions de mission | Déduites du texte du §3.2 (ex. CONTRE_PROPOSEE → ACCEPTEE ou REFUSEE ; REFUSEE / EXPIREE → REMPLACEE) | Confirmer |
| 11 | URL des écrans | Le document nomme les écrans sans URL : les routes ont été choisies à la génération | Ajuster librement |
| 12 | Images de production | Alpine, utilisateur non root ; le document propose aussi distroless | Durcir plus tard |
| 13 | Observabilité | Prometheus et Grafana fournis (profil facultatif) ; OpenTelemetry, Loki, Tempo et Alertmanager à ajouter | À brancher |
| 14 | Activités pilotes | `seeds/activites/*.json` : structure vide à remplir (rien n'a été inventé) | Décrire les 3 activités du §6.3 |
| 15 | Vérification | La CI GitHub Actions et le pipeline Cloud Build exécutent les vérifications et tests ; aucun build n'a été exécuté depuis cet environnement | Publier le dépôt sur GitHub, activer Actions et vérifier les journaux du workflow ; le build Docker local reste à lancer dans Docker Desktop ou Codespaces |
