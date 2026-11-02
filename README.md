# BIGBIIM — moteur universel d'activités

Le client **loue une activité** ; la plateforme est conçue pour assembler les prestataires nécessaires, faire signer un contrat, encaisser un paiement (séquestre) et le répartir par jalons. Aucune activité n'est codée en dur : une activité est un **modèle versionné** publié depuis l'Activity Builder.

Ce dépôt contient la base technique du MVP (écrans, API, modèles et infrastructure), mais **toutes les fonctions métier ne sont pas encore implémentées**. Les intégrations qui nécessitent un fournisseur externe (OIDC, paiement, SMS, stockage et signature) doivent être configurées ; certains parcours API sont volontairement indisponibles tant que leurs dépendances ne sont pas branchées. Les décisions et limites connues sont décrites dans `docs/DECISIONS-A-CONFIRMER.md`.

Le projet peut être exécuté dans Docker sans installer Node.js ni les dépendances npm sur votre ordinateur. **Docker Desktop doit toutefois être installé et démarré** (ou utilisez GitHub Codespaces).

Spécification de référence : https://claude.ai/artifact/3JEQ7D4dadxrAAHT3bAcDw

---

## Démarrer (GitHub Codespaces, sans terminal)

1. Sur github.com, créez un dépôt **privé**, puis **Add file → Upload files**. GitHub accepte au plus **100 fichiers par envoi** : déposez le projet **en plusieurs fois** (par exemple : `.devcontainer`, `.vscode`, `.github` et les fichiers de la racine ; puis `apps/api` + `apps/worker` ; puis `apps/web` ; puis `apps/admin` ; puis `packages`, `infra`, `docs`, `seeds`, `tests`). Validez chaque envoi avec **Commit changes**. Vérifiez à la fin que les dossiers cachés `.devcontainer`, `.vscode`, `.github` sont bien dans le dépôt.
   *Variante en une seule fois :* créez le Codespace sur un dépôt vide, glissez `bigbiim.zip` dans l'explorateur de fichiers de VS Code, puis exécutez une seule fois `unzip bigbiim.zip` et déplacez le contenu à la racine.
2. Bouton vert **Code → Codespaces → Create codespace on main**. Choisissez une machine **4 cœurs / 8 Go** au minimum.
3. Attendez la première construction (plusieurs minutes) : le conteneur `deps` installe les dépendances, génère Prisma et prépare la base. Les services démarrent seuls ensuite, à chaque ouverture du Codespace.
4. Ouvrez l'onglet **Ports** : cliquez sur le port **8080** (plateforme complète : `/` web, `/admin` back-office, `/api/v1` API).

Si quelque chose ne démarre pas : barre latérale **Docker** (icône baleine) → clic droit sur le conteneur → **View Logs**. Aucun terminal n'est nécessaire. Lisez aussi `docs/DECISIONS-A-CONFIRMER.md` (point 15 : ce projet a été généré sans pouvoir être lancé).

| Port | Service |
|---|---|
| 8080 | Plateforme complète (Traefik) — **utilisez celui-ci** |
| 3000 | Web (client, prestataire, public) |
| 3001 | Admin (adresse `/admin`) |
| 4000 | API (`/api/v1`, sondes `/health/live` et `/health/ready`) |
| 9001 | Console MinIO (identifiants dans `docker-compose.yml`) |
| 5432 / 6379 / 4222 | PostgreSQL / Redis / NATS |

Les modifications de code sont rechargées automatiquement (hot reload) dans chaque service.

### Lancer directement avec Docker Desktop

Installez et démarrez Docker Desktop, ouvrez un terminal à la racine du projet, puis lancez :

```sh
docker compose up --build
```

Docker construit l’image de développement et installe les dépendances dans le conteneur `deps` et le volume Docker `node_modules` ; aucune installation npm n’est nécessaire sur l’ordinateur. Au premier lancement, attendez la fin de la préparation de la base et l’état « healthy » de PostgreSQL, puis ouvrez `http://localhost:8080`. Arrêtez la plateforme avec `Ctrl+C`, ou dans un autre terminal avec `docker compose down`. Cette dernière commande conserve les données des volumes.

Les tests, vérifications TypeScript et builds sont configurés sur GitHub Actions à chaque push sur `main` et pour chaque pull request. La publication des images sur GitHub Container Registry est déclenchée par un tag `v*` ; elle ne déploie pas à elle seule la plateforme chez un hébergeur.

Les routes API privées exigent un jeton OIDC signé en RS256. Configurez `OIDC_ISSUER_URL`, `OIDC_AUDIENCE` et `OIDC_JWKS_URL` dans `.env` (voir `.env.example`) et déclarez les rôles `C`, `P`, `A` ou `operator` dans `realm_access.roles` du fournisseur. Le back-office utilise le flux OIDC Authorization Code + PKCE : configurez aussi `OIDC_ADMIN_CLIENT_ID` pour un client public sans secret, autorisez l’URI de redirection `http://localhost:8080/admin/auth/callback` (ou le domaine de votre plateforme), et activez CORS pour l’origine du back-office sur les endpoints OIDC.

### Vérifier le code sans Docker local

Le pipeline [Google Cloud Build](cloudbuild.yaml) lance la génération Prisma, les vérifications TypeScript, la compilation de l'API, du worker et des deux applications web, ainsi que les tests sur les workers Google Cloud du projet `dev-bigbiim-01`. Connectez votre dépôt GitHub et créez un déclencheur selon [docs/CLOUD-BUILD.md](docs/CLOUD-BUILD.md). Ce pipeline ne démarre pas l'application comme serveur ; utilisez Codespaces pour la tester dans un navigateur, ou configurez un déploiement Cloud Run séparé.

---

## Où coder (ouvrez le fichier et codez)

| Vous voulez… | Ouvrez |
|---|---|
| Compléter une route d'API | `apps/api/src/modules/<module>/<module>.service.ts` (consulter l'état de la route et les prérequis d'intégration) |
| Voir/modifier les routes HTTP | `apps/api/src/modules/<module>/<module>.controller.ts` |
| Coder une logique métier (§3) | l'en-tête de chaque service indique les sections du document à implémenter ; détail dans `docs/BUSINESS-RULES.md` |
| Machines à états projet / mission | `apps/api/src/modules/projects/project.states.ts` |
| Matching (poids par défaut) | `apps/api/src/modules/matching/` |
| KYC prestataires | `apps/api/src/modules/providers/kyc.ts` |
| Modèles de données | `apps/api/prisma/schema.prisma` |
| Règles d'intégrité SQL (§4.7) | `apps/api/prisma/sql/constraints.sql` |
| Tâches asynchrones | `apps/worker/src/handlers/*.ts` (outbox, expiration des devis et offres, libération automatique des jalons, licences, rapprochement du grand livre, notifications, antivirus) |
| Un écran client / prestataire / public | `apps/web/app/**/page.tsx` — liste complète dans `docs/SCREENS.md` |
| Un écran d'administration / Activity Builder | `apps/admin/app/**/page.tsx` |
| Moteur de formules (§3.4) | `packages/rules/src/evaluate.ts` |
| Contrats d'API, événements, schéma d'activité | `packages/contracts/` |
| Les 3 activités pilotes (§6.3) | `seeds/activites/*.json` (structure vide à remplir) |
| Tests | `tests/` (tests unitaires Vitest et scénarios `it.todo` encore à couvrir) |

## Structure

```
apps/api       NestJS — monolithe modulaire (14 modules)
apps/worker    traitements asynchrones (outbox → NATS JetStream, tâches planifiées)
apps/web       Next.js PWA — public, client, prestataire
apps/admin     Next.js — back-office et Activity Builder (/admin)
packages/      contracts (OpenAPI, événements, schéma d'activité), rules (formules), ui
infra/         docker (images de production), helm, terraform, argocd, observability
docs/          écrans, API, règles métier, modèles, événements, plan, ADR
```

## Tâches VS Code (palette de commandes → « Tasks: Run Task »)
Appliquer le schéma Prisma · Réappliquer les contraintes SQL · Vérifier les types · Lancer les tests · Formater le code.

## Production
- Images : `infra/docker/Dockerfile.{api,worker,web,admin}` (multi-étapes, utilisateur non root).
- Kubernetes : chart `infra/helm/bigbiim` (RollingUpdate sans indisponibilité, sondes, HPA, PodDisruptionBudget, NetworkPolicy, KEDA facultatif), valeurs `values-{dev,staging,prod}.yaml`.
- GitOps : `infra/argocd/application-*.yaml` · Namespaces : `infra/terraform`.
- CI : `.github/workflows/ci.yml` (types, tests, images, Trivy, helm lint) · Release signée : `release.yml` (cosign).
- Avant la production : relations Prisma + migrations versionnées (voir `docs/DECISIONS-A-CONFIRMER.md`).

## Observabilité (facultatif)
Voir `infra/observability/README.md`.
