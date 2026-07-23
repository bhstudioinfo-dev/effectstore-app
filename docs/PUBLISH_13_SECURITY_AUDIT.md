# Publish Audit 13 — Security Audit

No secret values are reproduced; sensitive values are `[REDACTED]`.

## Positive controls

JWT secret validation, server-derived admin state, bcrypt hashing, inactive-account checks, login/register/setup rate limits, bootstrap token, CORS loopback policy, security headers, loopback binds, WebSocket identity checks/message limits, multer size/type filters, path basename/resource ID validation, signed media URLs, `safeStorage` backend config and diagnostic redaction are present. Automated security/access/DRM/network tests passed.

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| CRITICAL | Authenticated catalog users can receive the full clear sale media as “preview” | `routes/effects.js` clear copy + catalog token; see Audit 05 |
| HIGH | JWT in localStorage plus remote scripts and no CSP | `home.js` stores token; `index.html` loads cdnjs; backend/local file UI has no effective CSP |
| HIGH | Preload exposes generic `ipcRenderer.invoke(channel, ...args)` | `desktop/preload.js`; any renderer XSS can reach every registered IPC handler |
| HIGH | OBS password is global plaintext and returned to any authenticated user | `OBSSettings`, `routes/settings.js` GET/POST; cross-user overwrite on shared backend |
| HIGH | No production cloud trust boundary | local child holds identity, payments, entitlements and media; customer controls the authority |
| HIGH | Public API error leakage | multiple routes return `error.message`, including database/validation internals |
| MEDIUM | Static overlay HMAC tokens have no expiry/revocation | `networkSecurity.getOverlayAccessToken` |
| MEDIUM | Local 8080 legacy trigger/WebSocket/custom media are unauthenticated | `desktop/main.js.startLocalServer`, loopback mitigates remote exposure |
| MEDIUM | Rate limiting is in-memory and per process | resets on restart; proxy deployment not supported |
| MEDIUM | WebSocket broadcasts all events to all connected authenticated users/overlays | no per-user channel filtering in `broadcastToClients` |
| MEDIUM | CORS accepts `null` origin | needed for file:// renderer, but broadens local origin access |
| MEDIUM | Upload validation relies partly on extension/MIME | commercial video lacks magic inspection; goal/payment have partial signatures |
| MEDIUM | No authenticated encryption/integrity for media | AES-CBC, no MAC/checksum |
| MEDIUM | No security/audit log and no token/device revocation | seven-day JWT remains valid unless user disabled/deleted |
| LOW | Diagnostics sanitization covers common strings, not structured recursive secrets | `diagnostics.js` regex-based |

## Electron

`nodeIntegration:false`, `contextIsolation:true`, `webSecurity:true`, packaged DevTools disabled: **CONFIRMED and improved over old docs.** Sandbox is not explicitly enabled. New utility windows omit preload but open DevTools unconditionally. No navigation/will-attach-webview/window-open policy is visible. Generic IPC exposure negates much of the narrow-bridge benefit.

## Injection/path checks

- File deletion paths generally use basename/ID validation; custom effect deletion validates parent.
- Goal asset and effect upload filters exist, but large/complex media decoding remains an attack surface.
- UI and designer use extensive template-string `innerHTML`; escaping is inconsistent and requires dedicated stored-XSS tests for effect names, descriptions, user names, gifts, layout text and wheel labels.
- No direct shell command is built from user input; ffmpeg uses argument arrays.

## Deployment boundary

Binding HTTP/WebSocket to loopback significantly limits remote attacks in the current local architecture. It also means the same backend cannot be the customer-facing central production service without redesigning authentication, TLS, tenant isolation, storage and broadcast scoping.

## Required release posture

Fix the preview leak; eliminate remote scripts or enforce pinned/local assets and CSP; replace generic IPC with allowlisted methods; encrypt/scope OBS settings; sanitize all API errors; add tenant-scoped WebSocket channels, token/device revocation and audit logs; add authenticated media encryption/integrity; commission an external security review before paid release.

