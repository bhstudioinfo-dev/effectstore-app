# Publish Audit 17 — Support and Diagnostics

## Current logging

| Family | Current implementation |
|---|---|
| backend | stdout/stderr piped to `userData/logs/backend.log`, rotated at 5 MB, five archives |
| Electron main | `userData/main-error.log`, no rotation |
| OBS | connection/source/playback messages mixed into backend log |
| TikTok | connection/reconnect/gift warnings mixed into backend log |
| queue/player | console events and `/api/queue/status`; no dedicated file |
| payment | database status; limited backend errors; no immutable audit |
| crash | uncaught/unhandled Electron errors only; no minidump/crash reporter |

Gift activity is stored in `GiftLog` and viewable/deletable per user. No retention or export policy exists.

## Diagnostic export

“Xuất file chẩn đoán” effectively exists through `operations:create-diagnostics` in `desktop/main.js` and the operations UI in `home.js`.

Current JSON includes:

- generation time
- app name/version/packaged state
- OS platform/architecture/Electron version
- backend `/api/system/status`
- encrypted config field names (not values)
- last 500 sanitized backend log lines

`sanitizeDiagnosticText()` redacts MongoDB URIs, bearer tokens and major secret assignments. It does not attach media files.

## Gaps against desired package

Missing or incomplete: Windows version detail, OBS host-free connection/source validation, TikTok room-safe status, full queue snapshot policy, mapping count, active layout ID/name, custom/local media health, disk usage, recent structured error codes, correlation IDs and explicit proof that all token forms/OBS passwords/payment PII are removed.

The current backend status exposes client count and operational state but queue status is separate. Attaching raw logs may include usernames/gift/payment context; regex sanitization is not sufficient privacy classification.

## Recommended package

Generate a versioned schema containing app/OS/runtime versions, sanitized connectivity booleans, canonical OBS source checks, TikTok connected state (no room secret), queue counts/current type without media URL, mapping/layout counts, local media missing count, bounded recent structured errors and log file sizes. Apply recursive allowlisting, then a denylist scan for passwords, tokens, URIs, payment proofs, emails/phones and purchased media paths. Show the package contents before save.

Add per-subsystem rotating logs, correlation IDs, severity codes, retention controls, user-consent collection and a support runbook. Never include passwords, raw tokens, database URIs, payment proof images or commercial bytes.

**Status: PARTIAL and useful for beta operations, not paid support-ready.**

