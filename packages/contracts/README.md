# @bigbiim/contracts

Source de vérité : le code client et serveur est généré à partir de ces contrats.

- `openapi.yaml` : routes de la section 2 (identique aux contrôleurs de `apps/api`)
- `events/*.schema.json` : un schéma par événement du domaine (section 3.17)
- `activity-version.schema.json` : schéma officiel de la définition d'une version d'activité (section 4.2)

Règle : on ajoute des champs, on ne retire ni ne renomme rien dans la même version.
