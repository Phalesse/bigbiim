# ADR 0003 — Événements : outbox PostgreSQL + NATS JetStream

Statut : accepté (document §5.2, §3.17). Chaque commande écrit l'événement dans OutboxEvent dans la même transaction ; le worker outbox-publisher le publie sur NATS JetStream. Les nouveaux services s'abonnent sans modifier le cœur. API et événements rétro-compatibles : on ajoute des champs, on ne retire ni ne renomme rien dans la même version.
