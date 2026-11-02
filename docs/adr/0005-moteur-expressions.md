# ADR 0005 — Moteur d'expressions : JSONLogic

Statut : Accepté.
Décision : JSONLogic, sérialisé sous forme JSON dans la définition d'activité. Cela évite d'ajouter un langage textuel à analyser et s'intègre au modèle d'activité versionné en JSON.
Exigences : aucun effet de bord, aucune exécution de code, opérateurs, if, min, max, ceil, floor, round, lookup(table, clé), accès answers.* et settings.*, limites strictes de taille d'expression, profondeur, nombre de nœuds évalués et taille de sortie. L'évaluateur est implémenté dans `packages/rules/src/evaluate.ts`; les prix dérivés doivent être arrondis explicitement avant leur conversion en unités mineures.
