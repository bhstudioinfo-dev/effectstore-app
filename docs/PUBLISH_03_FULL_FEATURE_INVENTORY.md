# Publish Audit 03 — Full Feature Inventory

Status is based on code plus the automated run on 2026-07-23. No real OBS/TikTok/Windows installer manual test was performed.

| Feature | UI / frontend | Backend / API / model | Plan | Status | Readiness / issue |
|---|---|---|---|---|---|
| Authentication | `index.html`, `home.js` | `routes/auth.js`, `User` | device limits | WORKING BUT UNTESTED manually | tests pass; JWT in localStorage |
| User profile | `home.js.updateUserUI` | `GET /auth/me`, `User` | all | STABLE by unit scope | no profile edit flow |
| Subscription/pricing | pricing view, upgrade modal | `planEntitlements`, `paymentService` | all | PARTIAL | legacy DB keys `pro`/`business`; most but not all rules enforced |
| Payments | QR/proof UI | `routes/payment.js`, `Payment` | paid | WORKING BUT UNTESTED | manual + webhook supported; English raw errors remain |
| Admin dashboard | integrated + standalone pages | `routes/admin.js` | admin | PARTIAL | plan input unvalidated; duplicates; user response includes sensitive fields |
| Marketplace | Store cards in `home.js` | `GET /api/effects`, `Effect` | access all | LOCAL ONLY / RELEASE BLOCKER | dynamic only against same backend/filesystem |
| Effect publishing | admin upload UI | `POST /api/effects` | admin | PARTIAL | local media, no publish version/state beyond `isActive` |
| Effect purchase | cart/payment | payment APIs, embedded `purchasedEffects` | purchase | WORKING BUT UNTESTED | no transaction across grant/payment |
| Purchased library | My Effects | `GET /api/user/effects` | ownership | PARTIAL | shared library service; protection flaw |
| Custom upload | personal effect modal | Electron IPC + metadata register | 5/100/unlimited | PARTIAL | local VP9 conversion; known preview/live risks |
| Gift mapping | mapping view | `GiftMapping`, `/map-gift` | 5/30/unlimited | PARTIAL | combined picker exists; ownership checks; real single-effect live broken |
| Mapping test | Test button | `/test-trigger`, queue/player | mapped effects | WORKING BUT UNTESTED | effect_player; no real OBS proof |
| TikTok Live | live panel | `tiktokService` | all | PARTIAL | reconnect exists; streak events can duplicate media |
| OBS connection | status/settings | `obsService`, `OBSSettings` | all | PARTIAL | reconnect and source repair exist; global plaintext settings |
| effect_player | status + preview | overlay/player/queue | all | WORKING BUT UNTESTED | request IDs and timeout; no real OBS proof |
| Effect queue | queue widget | `effectQueue`, `playbackManager` | all | PARTIAL | one backend authority; memory-only, priority reorders FIFO classes |
| Comments | live feed | `tiktokService.consumeComment` | Free 20 | PARTIAL | backend session limit; no persistence/load tests |
| TTS | settings + browser speech | `/usage/tts`, renderer queue | Free 10 | PARTIAL | backend counter but actual speech is renderer-side |
| Goal trackers | designer widgets | layout routes/TikTok updates | 1/10/unlimited | PARTIAL | count validation uses broad widget set; separate overlay legacy |
| Menu Designer | designer view | layout/template routes | Lite/Basic/advanced | WORKING BUT UNTESTED | large monolith; extracted engines active |
| Templates/premium | Store/designer | `GiftMenuLayout.isTemplate` | gated | PARTIAL | no versioned package or cloud asset entitlement |
| Overlay export | Save & Export | `/setup-gift-menu` | plan layout count | WORKING BUT UNTESTED | browser source + JSON mirror |
| Leaderboards | designer contributor/talent widgets | TikTok layout mutation | unclear | PARTIAL | widget-level only, not standalone product analytics |
| Notifications | in-app toasts, tray call | renderer/Electron | all | PARTIAL | no durable notification model |
| Logs | gift UI/admin/backend log | `GiftLog`, file logs | all/admin | PARTIAL | no retention cap for DB gift logs |
| Updates | none | no updater dependency/provider | none | NOT IMPLEMENTED / RELEASE BLOCKER | installer cannot update/rollback |
| Diagnostics | operations UI | `desktop/diagnostics.js` | admin/ops UI | PARTIAL | export exists and sanitizes common secrets; limited state |
| Challenge wheel | mapping/designer | `ChallengeWheel`, TikTok routes | Pro key (`business`) | PARTIAL | recent feature, no end-to-end proof |

## Strongest code-confirmed systems

Authentication hardening, server-derived admin authorization, signed media URLs, queue request correlation, backend lifecycle management, plan constants, source repair, encrypted backend config, backup/restore safeguards, and automated regression scripts exist and passed their current tests.

## Critical classification notes

- **RELEASE BLOCKER:** `tiktokService` single mapping calls `effectQueue.add()` without `effectUrl`; `EffectQueue.add()` rejects all `live_mapping` single items missing a URL. Group mappings are resolved later by `PlaybackManager`.
- **DOCUMENTATION OUTDATED:** Phase 2C/hybrid docs say live remains legacy. `PlaybackManager.play()` now routes `live_mapping` to effect_player, matching Phase 2D intent.
- **NOT VERIFIED:** stable operation for six hours, rapid gifts, real TikTok gift streak semantics, OBS restarts, and clean-machine install.

