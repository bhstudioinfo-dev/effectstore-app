# Publish Audit 11 — Admin Production Audit

## Capability inventory

| Capability | Code | State |
|---|---|---|
| dashboard/stats | `/api/admin/dashboard`, `/stats` | implemented |
| users | list, plan update, delete | implemented; unsafe response/validation |
| Free/Basic/Pro/Studio | UI maps internal keys | implemented with legacy keys |
| payment approval/rejection | `routes/payment.js`, `paymentService` | implemented |
| plan expiration | stored and checked at auth/entitlements | partial |
| device management | only activeDevices during login/logout | no admin revoke UI/API |
| product upload | effects admin form/API | implemented locally |
| price/sale/trending | effect update API | implemented |
| publish/unpublish | `isActive` listing behavior; no explicit robust UI lifecycle | partial |
| product media update | thumbnail/metadata; replacement effect media absent | partial |
| ownership | embedded purchase grant | implemented |
| analytics | counts, revenue, uses/fake uses | minimal |
| deletion | user/effect/icon/banner | implemented; cascades incomplete |
| audit logging | none | MISSING |
| permissions | one boolean `isAdmin` | coarse but server-enforced |
| backup/restore | admin routes + service | implemented; operational test only |

## Security and integrity findings

- `GET /api/admin/users` returns raw lean User documents, including password hashes, device IDs, custom metadata and license keys. Admin access is required, but least-privilege response shaping is missing.
- `PUT /users/:userId/subscription` accepts any plan and duration; `extend` is ignored. No allowlist, duration bounds or audit record.
- User deletion does not cascade mappings, layouts, logs, payments, wheels, assets or local media.
- Effect deletion removes media and DB record even when purchased references exist.
- Admin effect update checks fields with truthiness, making zero prices/values unreliable, and permits “fake uses”.
- There are three admin surfaces: integrated `home.js`, desktop standalone pages and root `admin/index.html`; behavior/auth/copy can drift.
- Payment approval uses a processing state to reduce duplicate grants, but User save and final Payment update are not a database transaction.
- Backup restore is merge-oriented, not a proven disaster recovery process.

## Plan-name audit

Customer-facing pricing uses Free/Basic/Pro/Studio and correct sale prices. Internal `pro` = Basic and `business` = Pro remain throughout models, services and admin methods. Root legacy `admin/index.html` still contains a 99,000 price placeholder, so obsolete pricing residue remains outside the active integrated pricing UI.

## Readiness

**PARTIAL / P1.** Server-side admin authorization is stronger than old documentation suggests, but paid release requires response DTOs, plan validation, device revocation, immutable audit logs, transactional/idempotent entitlement grants, deletion/retirement policy and removal or quarantine of legacy admin pages.

