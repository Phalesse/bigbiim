# Événements du domaine (3.17)

- `ProjetCréé`
- `RéponsesProjetModifiées`
- `DevisCalculé`
- `ÉquipeConfirmée`
- `ContratSigné`
- `AcomptePayé`
- `MissionProposée`
- `MissionAcceptée`
- `MissionRefusée`
- `MissionContreProposée`
- `MissionPlanifiée`
- `MissionCommencée`
- `AvancementMissionDéclaré`
- `LivrableDéposé`
- `MissionTerminée`
- `PreuveSoumise`
- `JalonValidé`
- `PaiementLibéré`
- `LitigeOuvert`
- `LitigeRésolu`
- `ProjetTerminé`
- `ProjetAnnulé`
- `AvisPublié`
- `PrestataireVérifié`
- `ActivitéPubliée`

Schémas : `packages/contracts/events/*.schema.json`. Chaque événement porte un identifiant unique, une date, une version de schéma et l'identifiant de corrélation du projet. Publication fiable : outbox PostgreSQL + NATS JetStream (worker `outbox-publisher`).
