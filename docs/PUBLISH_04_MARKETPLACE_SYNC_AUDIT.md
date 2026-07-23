# Publish Audit 04 — Marketplace and Cloud Synchronization

## Current flow

```text
Admin POST /api/effects (routes/effects.js)
→ multer temp file
→ clear copy in dataPaths.previewsDir
→ AES encrypted copy in dataPaths.encryptedEffectsDir
→ Effect document with absolute/local paths
→ GET /api/effects queries current MongoDB
→ home.js loads cards whenever Store is loaded/refreshed
→ payment creates Payment
→ admin/webhook approval embeds effectId in User.purchasedEffects
→ GET /api/user/effects merges purchased + custom effects
→ GET /api/tiktok/available-effects uses the same library
→ mapping preview/test/live resolves through effectLibraryService/effect_player
```

This is **CONFIRMED BY CODE** in `routes/effects.js`, `paymentService.grantPayment`, `effectLibraryService.getUserAvailableEffects`, `routes/tiktok.js` and `home.js`.

## Storage truth

| Data | Current location |
|---|---|
| catalog metadata | MongoDB `effects` |
| ownership | embedded `User.purchasedEffects` |
| encrypted full media | local `backend/effects/encrypted` or packaged runtime data |
| clear preview media | local `backend/uploads/previews` |
| thumbnails | local `backend/uploads/thumbs` |
| menu templates | MongoDB `giftmenulayouts`; assets remain local URLs/files |
| custom media | customer Electron `userData/custom-effects` only |

The API can use a remote MongoDB URI, but media paths still refer to the machine that performed the upload. Therefore MongoDB alone does not make the store cloud-capable.

## Customer visibility answers

- Does a new product require rebuilding the desktop app? **No**, if every customer talks to the same reachable API and media store. The catalog is queried dynamically.
- Does that work today across customer computers? **No.** The packaged app starts a loopback backend and defaults to a local MongoDB. Media is stored on the publishing machine.
- Does the customer depend on the admin computer? **Yes in the only plausible shared-Mongo deployment**, because `previewFilePath`, `encryptedFilePath` and thumbnails are local to the uploading backend. With fully separate defaults, the customer sees neither shared metadata nor files.
- Cache invalidation: overlay uses `no-store`; catalog has no ETag/manifest/version policy. UI performs fetches, but there is no product event/manifest cache contract.
- Product versioning: **MISSING.** `Effect` has no `contentVersion`, checksum, or minimum app version.
- Publish state: `isActive` hides effects from customer catalog. No draft/published/retired state or publish audit.
- Deleted products: `DELETE /api/effects/:id` deletes DB/media even when owners reference it, so owners lose use and embedded references become orphaned.
- Device synchronization: ownership follows the central user document only if devices use the same database/API. Custom media intentionally does not synchronize.

## Production capability gap

| Required capability | State |
|---|---|
| central authenticated production API | MISSING |
| production MongoDB and migration/backup operations | configurable but not provisioned/verified |
| private object storage/CDN | MISSING |
| signed object/media delivery | only local JWT stream URLs |
| manifest + product/content version | MISSING |
| encrypted offline cache | MISSING |
| download resume/retry | MISSING |
| content hash/integrity | MISSING |
| unpublished/retired lifecycle | partial (`isActive`) |
| device-aware entitlement service | local User array only |
| monitoring and availability | MISSING |

## Before customers on other computers

1. Host one production identity/catalog/order/entitlement API over HTTPS.
2. Use a production database with tested backup/restore and migrations.
3. Store previews/thumbnails and encrypted commercial media in centrally reachable private object storage.
4. Replace local absolute media paths with immutable object keys and content versions.
5. Add short-lived, ownership-scoped delivery sessions and signed manifests.
6. Add checksum validation, retry/resume, encrypted cache limits and revocation.
7. Define deletion as retire/version policy so owners are not silently broken.
8. Separate cloud authority from the local OBS/TikTok runtime.

**P0 RELEASE BLOCKER:** current marketplace distribution cannot serve independent customer installations. `COMMERCIAL_CLOUD_ROADMAP.md` correctly labels the target as “Chưa triển khai”; it is a design reference, not current capability.

