# Agent Rules

These rules are mandatory for future AI agents working in this repo.

## Change Discipline
- Never refactor unrelated files.
- Preserve the current architecture unless the user explicitly asks for a redesign.
- Avoid duplicate components; search existing renderer, route, model, and service files first.
- Keep edits scoped to the requested behavior.
- Do not overwrite or revert user changes in a dirty worktree.
- Ask before changing database schemas, stored document shape, route paths, or auth/payment behavior.
- Avoid unnecessary dependency installs. Use existing libraries and patterns first.

## Verification
- Always run the relevant build or test command after production code edits when feasible.
- For doc-only edits, at least run a file/status check; a full Electron build is not required unless requested.
- If a build/test cannot run, record the reason in the final response.

## Security
- Never expose secrets from `.env`, local config, OBS passwords, JWT secrets, bank/payment credentials, or encryption passwords.
- Do not commit real credentials.
- Replace hardcoded development defaults before production deployment.
- Treat `backend/uploads`, `backend/effects/encrypted`, and local Mongo data as sensitive user/business data.

## Backend Rules
- Follow existing Express route/module style.
- Use `authMiddleware` and `adminMiddleware` consistently.
- Maintain response shapes with `success` flags unless intentionally normalizing an API.
- Validate frontend-called endpoints against `backend/server.js` mounts before documenting or using them.
- Do not change subscription/device/payment rules without explicit approval.

## Frontend Rules
- Use `EffectStoreApp` patterns in `desktop/renderer/js/home.js`.
- Prefer existing UI components/classes and notification helpers.
- Avoid adding new global functions unless matching the current renderer style requires it.
- Keep Electron navigation in sync with actual renderer files.

## Database Rules
- No schema changes without asking.
- If a route assumes ObjectId refs, verify the Mongoose schema actually defines a ref.
- Avoid storing new absolute filesystem paths unless the existing media pipeline requires it.

## Documentation Rules
- Keep `/docs` concise and AI-readable.
- Reference actual files and endpoint paths.
- Mark missing/mismatched functionality as known issues instead of pretending it exists.
