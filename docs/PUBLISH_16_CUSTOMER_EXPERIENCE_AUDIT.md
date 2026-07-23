# Publish Audit 16 — Customer Experience

## First-user journey

| Step | Current experience / risk |
|---|---|
| download/install | no built/signed artifact or download/update channel |
| first open | backend starts; Mongo setup may block ordinary users with a technical URI |
| register/login | Vietnamese flow exists; token restored for seven days |
| connect OBS | host/port/password form and repair button; scene nesting/onboarding unclear |
| connect TikTok | username-based flow; connector failures depend on English/technical responses |
| browse Store | dynamic local catalog; remote customer catalog unavailable |
| purchase | QR/proof flow; some backend messages remain English |
| find purchase | My Effects reloads server ownership |
| custom upload | clear local-only notice and optimization description |
| create mapping | unified purchased/custom picker |
| test mapping | effect_player route with readiness errors |
| start live | no single consolidated readiness gate |
| receive gift | real single-effect mapping currently fails silently/with backend warning |
| recover | OBS repair and diagnostics exist; backend/TikTok/media recovery is fragmented |

## Confusing or technical steps

- Customer is asked to configure a MongoDB URI, a developer/administrator concept.
- Four local ports, OBS WebSocket settings and the fixed `EffectStore` scene are exposed indirectly without an end-to-end wizard.
- “Basic” and “Pro” map internally to `pro` and `business`, increasing support/log confusion.
- Queue warnings and API codes can surface through generic notifications.
- Source repair reports names like `effect_player` and `gift_menu_overlay`.
- Custom effects exist on only one device, but server metadata may make another device appear to own an unavailable item.
- No “all systems ready” check combines DB, auth, OBS source/player, TikTok, media and queue.

## Vietnamese and encoding

`node scripts/validate-localization.js` passed 11 selected UI files. Direct UTF-8 inspection shows active customer UI text is generally valid. Therefore the earlier claim of widespread active UI corruption is **DOCUMENTATION OUTDATED / NOT REPRODUCED** in this checkout.

However:

- The validator targets a narrow double-encoding regex and selected files only.
- Several old docs contain mojibake.
- APIs contain English messages/codes such as `PLAN_LIMIT`, `EFFECT_QUEUE_BUSY`, `Invalid or expired token`, `Payment order not found`, and raw `error.message`.
- Customer UI sometimes displays `error.message` or backend message directly.

No visual traversal of every modal/page was performed; absence of visible corruption is **NOT VERIFIED**.

## Required UX release work

Provide a nontechnical first-run flow, central service with no Mongo URI prompt, connection/readiness wizard, clear source-scene instructions, localized error catalog, code-to-message mapping, recovery actions, device/custom-effect explanation, support link, update UI and tested keyboard/display scaling. Raw codes, stack/database errors and internal source names must be hidden behind Vietnamese guidance.

**Status: PARTIAL / P1, with unavailable production service as P0.**

