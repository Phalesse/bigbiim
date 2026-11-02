# BIGBIIM sur Google Cloud Build (`dev-bigbiim-01`)

`cloudbuild.yaml` installe Node.js et les dépendances dans les workers Google Cloud,
génère le client Prisma, valide le schéma, vérifie les types des workspaces, compile
l'API, le worker et les deux applications web, puis exécute les tests Vitest. Aucun
Docker local n'est requis.

## Préparer le dépôt

Cloud Build doit pouvoir lire les sources depuis un dépôt connecté. Si le projet
n'est pas encore dans GitHub, publiez d'abord son contenu dans un dépôt privé comme
indiqué dans la section « Démarrer » du [README](../README.md). Ne publiez pas le
fichier `.env`, de jetons ou de clés privées.

## Connecter le dépôt et créer le déclencheur

1. Ouvrez la console Google Cloud et sélectionnez le projet **`dev-bigbiim-01`**
   dans le sélecteur de projet.
2. Ouvrez **Cloud Build → Repositories**. Connectez GitHub si nécessaire et
   autorisez Cloud Build à accéder au dépôt privé qui contient BIGBIIM.
3. Ouvrez **Cloud Build → Triggers**, puis créez un déclencheur pour ce dépôt :
   - événement : push sur la branche que vous utilisez (par exemple `main`) ;
   - configuration : fichier `cloudbuild.yaml`, à la racine du dépôt.
4. Enregistrez puis lancez le déclencheur avec **Run**. Le premier build s'exécute
   sur les workers Cloud Build ; ses étapes et journaux apparaissent dans
   **Cloud Build → History**. Les pushes suivants sur la branche choisie relancent
   automatiquement les vérifications.

Les étapes s'exécutent dans Google Cloud ; il ne faut pas exécuter `docker compose`
sur le PC, ni installer Docker en local.

## Lancer manuellement depuis Cloud Shell (facultatif)

Si vous préférez ne pas créer immédiatement de déclencheur, ouvrez **Cloud Shell**
dans le projet `dev-bigbiim`, clonez le dépôt GitHub auquel vous avez accès, puis
exécutez à la racine du dépôt :

```sh
gcloud config set project dev-bigbiim-01
gcloud services enable cloudbuild.googleapis.com
gcloud builds submit --config=cloudbuild.yaml .
```

Cette commande transmet les sources à Cloud Build et lance le même pipeline
entièrement à distance. Elle ne lance pas Docker sur votre ordinateur.

## Portée

Ce pipeline valide le code et lance les tests unitaires. Il ne démarre pas la
plateforme complète avec PostgreSQL, Redis, NATS et les interfaces web, et Cloud
Build n'est pas un serveur permanent pour ouvrir l'application. Pour utiliser la
plateforme dans un navigateur sans Docker local, le chemin de développement déjà
prévu est GitHub Codespaces. Pour une URL publique durable, il faudra configurer un
déploiement distinct (par exemple Cloud Run avec ses services de données) et les
secrets OIDC de production.

Le pipeline utilise une URL PostgreSQL locale factice uniquement pour générer et
valider Prisma ; il ne se connecte à aucune base ni ne modifie de données. Le
projet Google Cloud doit avoir l'API Cloud Build activée et le compte exécutant le
build doit disposer des autorisations nécessaires pour lancer des builds.
