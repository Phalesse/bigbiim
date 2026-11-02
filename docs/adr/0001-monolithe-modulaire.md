# ADR 0001 — Monolithe modulaire d'abord

Statut : accepté (document §5.1).
Un seul déploiement pour le MVP, avec 14 modules aux frontières strictes (un module n'accède jamais aux tables d'un autre : il passe par son interface ou par des événements). Chaque module peut devenir un service. À extraire en premier si la charge l'exige : notifications, matching, payments, puis messaging.
