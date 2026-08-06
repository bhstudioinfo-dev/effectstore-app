# LiveFlow release readiness

Last verified: 2026-08-06

## Current decision

**Internal build: PASS**

**Closed beta / production release: BLOCKED**

The repository passes its automated test, release preflight, and unpacked
packaging checks. A customer release still requires external infrastructure
and real-device validation that cannot be proven by the repository alone.

## Automated checks completed

- `npm test`: passed.
- `npm run release:check`: passed.
- `npm run build:verify`: passed.
- Windows unpacked artifact created at `desktop/dist/win-unpacked`.
- Packaged backend excludes the real `.env` and runtime uploads.
- Local backend HTTP and WebSocket hosts default to `127.0.0.1`.
- Production build configuration no longer disables executable
  signing/editing. The unsigned override remains limited to `build:verify`.
- Production dependency trees pass `npm ls --all --omit=dev`. Electron-builder
  24 still prints dependency-analysis warnings while packaging, but the
  referenced packages are present in the installed production tree.

## Release blockers

### P0 — required before customer distribution

- Obtain a Windows code-signing certificate, configure it in the secure build
  environment, and verify the Authenticode signature and timestamp.
- Deploy the RS256 user-token migration described in
  `docs/CLOUD_JWT_KEY_MIGRATION.md`: configure the private key only on the
  central server and embed the matching public key in the customer build.
- Deploy and smoke-test the online-only cloud effect flow described in
  `docs/CLOUD_EFFECT_STREAMING.md`. The code no longer passes the central
  encryption password to customer installations, but production OBS/TikTok
  playback still requires real infrastructure validation.
- Validate Store, account, license, purchase, and effect isolation using at
  least two customer accounts on two clean machines.
- Confirm in production that unowned catalog entries have no video URL and
  central stream/download endpoints return 403.
- Run a real TikTok Live + OBS test, including reconnects, duplicate gifts,
  failed effects, and a multi-hour soak test.
- Install, upgrade, uninstall, and reinstall a signed installer on clean
  Windows 10 and Windows 11 machines.

### P1 — required before stable release

- Configure a production update provider and publish the installer,
  `latest.yml`, and blockmap over HTTPS.
- Test update from version N-1 to N and document rollback behavior.
- Complete the first-run database flow against the chosen production database
  architecture and perform a backup/restore drill.
- Complete the brand assets listed in `BRAND_ASSETS_TODO.md`.
- Add customer-facing privacy, terms, refund, support, and known-limitations
  documents.
- Select a release version, update all package versions consistently, create a
  Git tag, changelog entry, installer checksum, and retained rollback artifact.

## Required release evidence

Keep the following evidence with every release:

- Git commit and tag.
- Exact Node/npm versions used by the build machine.
- Passing output from test, preflight, and packaging.
- SHA-256 checksum of the installer.
- Authenticode verification result.
- Clean-machine smoke-test record.
- Database backup/restore record.
- OBS/TikTok soak-test record.
- Update and rollback test record.

Do not change this document to `production: PASS` until every P0 item has
recorded evidence.
