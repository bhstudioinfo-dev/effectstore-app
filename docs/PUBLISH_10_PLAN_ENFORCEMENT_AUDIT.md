# Publish Audit 10 — Plan Enforcement Audit

## Plan key mapping

The UI labels are final, but persisted/internal keys are legacy:

| Product label | Internal key | Price |
|---|---|---:|
| FREE | `free` | 0 |
| BASIC | `pro` | 199,000 VND/month |
| PRO | `business` | 399,000 VND/month |
| STUDIO | `studio` | contact |

`planEntitlements.js`, pricing HTML and `paymentService.SUBSCRIPTION_PRODUCTS` agree on this mapping. The legacy keys are a migration risk, not a customer-facing pricing redesign.

## Rule-by-rule result

| Rule | Frontend | Backend | Classification |
|---|---|---|---|
| Free 1 device | sends machine ID | login limits activeDevices to 1 | both; machine identity weak |
| Free 5 mappings | upgrade popup | `/map-gift` count check | both; non-atomic |
| Free 5 custom effects | upload handling | register count check | both; non-atomic |
| Free 1 layout | UI handles PLAN_LIMIT | save/create/template-use count checks | both |
| Free 20 comments/session | live UI receives warnings | `consumeComment()` | backend primarily |
| Free 10 TTS/session | UI calls usage API | `consumeTts()` | both |
| Free 1 goal tracker | designer UI gating | `validateDesignerItems()` | both, definition too broad |
| Free Lite move/resize/text | available | allowed | consistent |
| Free blocked colors/animations/layers | UI `showUpgrade` | layout validator | both |
| Basic 30 mappings | UI popup | backend 30 | both |
| Basic 100 custom effects | UI/API handling | backend 100 | both |
| Basic 10 layouts | UI/API handling | backend 10 | both |
| Basic 20 menu assets | upload UI | upload count uses 20 | both |
| Basic 10 goals | designer | backend item count | both |
| Pro unlimited core limits | UI | Infinity | both |
| Pro 1 device | UI label | backend 1 | both |
| Studio unlimited devices/team/agency | pricing text | Infinity devices only | **missing** team/agency/workflows |

## Confirmed inconsistencies

1. `planEntitlements.free.menuAssets` is 0, and layout validation rejects custom assets, but `/goal-board/upload-asset` grants Free up to five “trial” files. This is not in the final plan.
2. Goal tracker counting includes contributor, podium, combo and mystery widgets; the business definition “goal tracker” is not formally mapped to UI types.
3. Challenge wheels directly test `subscription === 'business'` rather than entitlements; Studio users are not included in several wheel/template checks unless admin.
4. Device enforcement occurs only at login. Existing JWTs remain usable after device changes until expiry; no request-time device revocation check exists.
5. Admin subscription update accepts arbitrary `plan` and `durationDays`; invalid values normalize to Free in entitlements but remain stored/displayed.
6. Basic/Free count checks use count-then-write and can be bypassed by concurrent requests.
7. Layout `POST /gift-menu-layout` has multiple rename/update branches; enforcement needs concurrency/API-fuzz tests.
8. Downgrades do not define behavior for existing items above limits.

## Direct API bypass assessment

Core mapping/custom/layout/designer restrictions are backend-enforced; hiding controls is not the sole control. However arbitrary plan assignment is admin-only, menu asset semantics are inconsistent, and device/session revocation is incomplete. Raw backend codes such as `PLAN_LIMIT`, `EFFECT_QUEUE_BUSY`, `FORBIDDEN` can reach generic UI error paths; `home.js.handleUpgradeRequired()` covers some but not all fetches.

## Required tests

Run authenticated parallel API tests for sixth/31st mapping, sixth/101st custom effect, second/11th layout, second/11th goal, 21st menu asset, comment 21, TTS 11, advanced item payloads, premium template direct use, device 2/4, expiry/downgrade and Studio challenge-wheel access.

**Readiness: PARTIAL / P1.** Pricing presentation is aligned; enforcement is substantial but not complete enough for paid subscriptions.

