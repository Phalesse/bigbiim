# Modèles de données (section 4 du document)

Schéma Prisma : `apps/api/prisma/schema.prisma`. Règles d'intégrité en base (4.7) : `apps/api/prisma/sql/constraints.sql`.
UUID, dates UTC, montants entiers (unités mineures, BigInt) + devise, suppression logique, `createdAt` / `updatedAt` / `version` (verrouillage optimiste) sauf modèles immuables.

| Modèle | Champs (type) | Section |
|---|---|---|
| User | phone: String?, email: String?, passwordHash: String?, status: String, locale: String, type: String | 4.1 |
| Role | userId: String, role: String | 4.1 |
| Permission | role: String, resource: String, action: String | 4.1 |
| Session | userId: String, device: String?, refreshTokenHash: String, expiresAt: DateTime | 4.1 |
| ClientProfile | userId: String, displayName: String, city: String?, defaultPaymentMethod: String? | 4.1 |
| NotificationPreference | userId: String, eventType: String, channel: String, enabled: Boolean | 4.1 |
| ConsentLog (immuable) | userId: String, documentVersion: String, acceptedAt: DateTime | 4.1 |
| Sector | parentId: String?, nameI18n: Json, icon: String? | 4.2 |
| Skill | sectorId: String?, nameI18n: Json, synonyms: String[], parentId: String?, regulated: Boolean, requiredLicenseType: String? | 4.2 |
| Activity | sectorId: String, slug: String unique, status: String, currentVersionId: String? | 4.2 |
| ActivityVersion (version propre) | activityId: String, version: Int, status: String, definition: Json, publishedAt: DateTime?, publishedBy: String? | 4.2 |
| ContractTemplate (version propre) | name: String, version: Int, body: String, variablesSchema: Json, locale: String | 4.2 |
| PriceTable | name: String, rows: Json | 4.2 |
| ComplianceRule | activityVersionId: String, rule: Json | 4.2 |
| Provider | userId: String, type: String, legalName: String, bio: String?, kycLevel: Int, status: String, ratingBayes: Float?, reliabilityScore: Float? | 4.3 |
| ProviderSkill | providerId: String, skillId: String, years: Int?, verified: Boolean, rateMin: BigInt?, rateUnit: String? | 4.3 |
| ProviderZone | providerId: String, city: String?, geometry: Json?, radiusKm: Float? | 4.3 |
| ProviderAvailability | providerId: String, fromAt: DateTime, toAt: DateTime, capacity: Int, type: String | 4.3 |
| ProviderDocument | providerId: String, type: String, fileId: String, status: String, expiresAt: DateTime?, reviewedBy: String? | 4.3 |
| PortfolioItem | providerId: String, title: String, media: Json, activityId: String? | 4.3 |
| Badge | providerId: String, type: String, grantedAt: DateTime | 4.3 |
| Project | clientId: String, activityVersionId: String, status: String, answers: Json, targetDate: DateTime?, city: String?, totalAmount: BigInt?, currency: String | 4.4 |
| Quote (version propre) | projectId: String, version: Int, lines: Json, total: BigInt, validUntil: DateTime, locked: Boolean | 4.4 |
| ProjectRole | projectId: String, roleKey: String, skillId: String, quantity: Int | 4.4 |
| Mission | projectRoleId: String, providerId: String?, status: String, price: BigInt?, startAt: DateTime?, endAt: DateTime?, offerExpiresAt: DateTime? | 4.4 |
| MissionOffer | missionId: String, providerId: String, status: String, rank: Int, score: Float, explanation: Json? | 4.4 |
| Step | projectId: String, key: String, status: String, dependsOn: String[], plannedStart: DateTime?, plannedEnd: DateTime? | 4.4 |
| Milestone | projectId: String, stepId: String?, amount: BigInt, status: String, proofRequired: Json?, autoReleaseAt: DateTime? | 4.4 |
| Proof | milestoneId: String, type: String, fileId: String?, geo: Json?, submittedBy: String, submittedAt: DateTime | 4.4 |
| Deliverable | missionId: String, fileId: String, description: String? | 4.4 |
| ProjectEvent (immuable) | projectId: String, type: String, payload: Json, at: DateTime | 4.4 |
| Contract | projectId: String, templateVersion: Int, status: String, pdfFileId: String?, pdfHash: String? | 4.5 |
| Signature (immuable) | contractId: String, userId: String, signedAt: DateTime, otpRef: String?, ip: String?, device: String? | 4.5 |
| Amendment | contractId: String, reason: String, diff: Json, status: String | 4.5 |
| LedgerAccount | ownerType: String, ownerId: String?, kind: String, currency: String | 4.5 |
| LedgerTransaction (immuable) | type: String, reference: String?, idempotencyKey: String? unique, at: DateTime | 4.5 |
| LedgerEntry (immuable) | transactionId: String, accountId: String, direction: String, amount: BigInt, currency: String, at: DateTime | 4.5 |
| PaymentIntent | projectId: String, payerId: String, amount: BigInt, currency: String, operator: String, status: String, operatorRef: String? | 4.5 |
| Payout | providerId: String, amount: BigInt, operator: String, status: String, approvedBy: String? | 4.5 |
| Refund | paymentIntentId: String, amount: BigInt, reason: String?, status: String | 4.5 |
| Invoice | projectId: String, number: String unique, lines: Json, total: BigInt, pdfFileId: String? | 4.5 |
| Review | missionId: String, authorId: String, targetId: String, rating: Int, comment: String?, status: String | 4.6 |
| Dispute | projectId: String, milestoneId: String?, openedBy: String, status: String, decision: Json?, decidedBy: String? | 4.6 |
| DisputeEvidence | disputeId: String, fileId: String, authorId: String, note: String? | 4.6 |
| Message | projectId: String, authorId: String, body: String, attachments: Json?, at: DateTime | 4.6 |
| Notification | userId: String, type: String, payload: Json, channel: String, status: String, sentAt: DateTime? | 4.6 |
| File | ownerId: String, bucketKey: String, mime: String, size: Int, checksum: String?, scanStatus: String | 4.6 |
| AuditLog (immuable) | actorId: String?, action: String, entity: String, entityId: String?, before: Json?, after: Json?, ip: String?, at: DateTime | 4.6 |
| Setting | key: String unique, value: Json, scope: String | 4.6 |
| FeatureFlag | key: String unique, value: Json, scope: String | 4.6 |
| OutboxEvent (immuable) | type: String, payload: Json, publishedAt: DateTime? | 4.6 |

## Règles d'intégrité en base (4.7)

- Grand livre : somme des débits = somme des crédits par transaction (valeurs de `direction` : DEBIT / CREDIT) ; `LedgerEntry`, `LedgerTransaction` et `AuditLog` immuables.
- `ActivityVersion` publiée (statut `PUBLIE`) : modification et suppression interdites.
- `Project.activityVersionId` figé après la confirmation.
- Un seul `Quote` verrouillé actif par projet.
- Index : recherche de prestataires, projets par client et statut, journal d'audit par entité, GIN sur les réponses du projet.
