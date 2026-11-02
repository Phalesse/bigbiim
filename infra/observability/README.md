# Observabilité

Objectif du document : OpenTelemetry partout, Prometheus + Grafana (métriques), Loki (journaux), Tempo (traces), Alertmanager (alertes).

## En local (facultatif)
Ces cinq services existent dans `docker-compose.yml` sous le profil `observability` (désactivés par défaut) :
1. Créez à la racine un fichier `.env` contenant une seule ligne : `COMPOSE_PROFILES=observability`
2. Reconstruisez l'environnement (palette de commandes de VS Code → « Codespaces: Rebuild Container »).
3. Ouvrez les ports : Grafana `3030`, Prometheus `9090`.

## Kubernetes
À installer dans le namespace `platform` (créé par `infra/terraform/main.tf`).

## À coder
Endpoint `/metrics` dans l'API, instrumentation OpenTelemetry, tableaux de bord métier (projets créés, conversion devis → contrat, délai de réponse des prestataires, paiements en échec, litiges ouverts), canal d'alerte dans `alertmanager.yml`. Objectifs de service du document : 99,9 % de disponibilité, 95 % des requêtes sous 500 ms.
