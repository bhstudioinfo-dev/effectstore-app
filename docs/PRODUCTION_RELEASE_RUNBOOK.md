# LiveFlow production release runbook

## One-time production setup

Configure the central Render service with:

- `CLOUD_JWT_PRIVATE_KEY`: contents of the generated private PEM. Never put it
  in Git, Electron, diagnostics, or release artifacts.
- `CLOUD_JWT_PUBLIC_KEY`: contents of
  `desktop/assets/cloud-jwt-public.pem`.
- `ENCRYPTION_PASSWORD`: central server only, at least 32 random characters.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME`.

The current generated private key is stored outside the repository at:

`%LOCALAPPDATA%\Temp\liveflow-release-secrets\cloud-jwt-private.pem`

Back it up in a password manager or protected secret vault before clearing
temporary files.

Deploy the backend before distributing the matching desktop build. Verify:

- `/api/system/status` returns HTTP 200 with database connected.
- Public trending/catalog responses contain no full media URL for unowned
  effects.
- `/updates/stable/latest.yml` returns 404 before the first upload, not an
  application crash.

## Every application release

1. Update the same semantic version in root, desktop, and backend packages.
2. Update `docs/CHANGELOG.md`.
3. Run `npm test`.
4. Run `npm run release:check`.
5. Build on Windows with Developer Mode/Administrator symlink support and the
   production code-signing certificate:

   `npm run release:windows`

6. Verify the installer Authenticode signature and timestamp.
7. Install and smoke-test on a clean Windows machine.
8. Test TikTok gift streak, duplicate events, reconnect, mapping quantity,
   queue recovery, and OBS Effect Player completion.
9. Upload only after the signed build passes:

   `npm run release:upload`

10. Confirm these URLs:

   - `/updates/stable/latest.yml`
   - `/updates/stable/LiveFlow-Setup-<version>.exe`
   - `/updates/stable/LiveFlow-Setup-<version>.exe.blockmap`

11. From the previous installed version, use **Kiểm tra cập nhật**, download,
    restart, and verify settings/mappings remain intact.

## Rollback

- Keep the previous signed installer and its metadata.
- If the new release is bad, restore the previous three R2 objects under
  `updates/stable/`.
- Do not roll back the database unless an incompatible migration ran and a
  verified backup exists.
- Record the failed version and prevent it from being uploaded again with the
  same version number.

## Current release-candidate limitation

The locally generated `1.0.0` installer is unsigned and is for internal
verification only. Production build currently requires Windows Developer Mode
or an elevated build environment capable of creating symlinks, plus a valid
code-signing certificate.
