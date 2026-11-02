# ADR 0004 — Développement 100 % Docker, dans GitHub Codespaces

Statut : accepté (demande du porteur du projet). Rien à installer sur le poste : docker-compose.yml lance base, cache, NATS, MinIO, Gotenberg, Traefik, deps, api, worker, web, admin. VS Code s'ouvre dans le conteneur workspace via .devcontainer. Aucune commande manuelle n'est nécessaire.
