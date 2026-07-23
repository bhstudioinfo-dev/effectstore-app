# Publish Audit 12 — Database and Data Integrity

## Active collections and relationships

| Model | Main relationships / purpose |
|---|---|
| `User` | auth, subscription, active devices; embeds purchased/custom effects |
| `Effect` | catalog and local media metadata |
| `Payment` | `userId` string, ordered effect/product IDs |
| `GiftMapping` | `userId` string, effect IDs, optional `wheelId` |
| `GiftMenuLayout` | optional ObjectId `userId`, optional parent template |
| `ChallengeWheel` | ObjectId user and source template |
| `GiftLog` | user/session/effect strings |
| `GiftConfig` | unique gift ID and coin/icon metadata |
| `OBSSettings` | one global OBS config |
| `EffectRequest` | public request/contact data |
| `Banner` | active banner file metadata |
| `License` | largely unused license record |
| `SystemState` | schema/admin-bootstrap state |

There is no `Order` model separate from `Payment`, no subscription collection and no entitlement collection. Subscription and purchase rights are embedded in `User`.

## Integrity audit

- Required fields: basic required validation exists, but status/plan/category/payment enums are mostly absent.
- Unique indexes: User email, Payment orderId, GiftConfig giftId, License licenseKey. Gift mappings have a non-unique compound index, allowing overlapping mappings intentionally.
- Foreign keys: Mongoose refs exist for some fields but MongoDB does not enforce them. Many IDs are plain strings.
- Orphans: deletion routes do not comprehensively cascade. Effect/user/template deletion can leave purchases, mappings, payments, layouts, wheels, logs and files.
- Transactions: purchase approval, media upload+DB creation, layout JSON mirror and custom local+DB registration are multi-step without transactions/sagas.
- Migrations: `schemaMigrationService` has a version record and narrow repairs. **DOCUMENTATION OUTDATED** where older docs say no migrations. It is not a general migration history/tool.
- Old compatibility: legacy subscription keys and multiple item schema shapes are normalized in code; no complete migration contract is documented.
- Backup: encrypted JSON/database backup service and admin endpoints exist. Restore tests pass at unit scope; real production backup/restore was **NOT VERIFIED**.
- Connection strings: packaged Mongo URI is protected with `safeStorage`; development `.env` is untracked. Default is local MongoDB.
- Sensitive fields: User password hash and OBS plaintext password can be returned by admin/settings APIs. Payment proof paths and contact data are stored.
- Token storage: JWTs are not stored in Mongo; renderer keeps them in localStorage.

## Index and scale gaps

There is no TTL index for logs/payments/sessions, no unique per-user custom local ID index because custom effects are embedded, and no canonical unique active-layout constraint. Count-based plan enforcement can race. Large untyped layout arrays can approach MongoDB’s document limit without an application payload/item cap.

## Local versus remote mismatch

Mongo documents store local absolute effect paths and local asset URLs. Moving the database to Atlas does not move media. The single active layout JSON mirror and global OBS settings are incompatible with a multi-customer central backend.

## Required data work

Define explicit status/plan enums, an entitlement/order model, immutable product versions, user-scoped runtime settings, referential cleanup/retirement rules, transaction/idempotency boundaries, schema migration history, bounded layout schemas, retention policies, and tested encrypted backups with restoration into staging.

**Readiness: P1, with cloud/media locality as P0.**

