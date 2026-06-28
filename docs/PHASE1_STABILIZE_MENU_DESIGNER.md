# Phase 1 - Stabilize Menu Designer Core

## Files Changed

- `backend/routes/tiktok.js`
- `backend/public/gift-menu-overlay.html`
- `desktop/renderer/js/gift-menu-designer.js`
- `docs/PHASE1_STABILIZE_MENU_DESIGNER.md`

## Endpoints Added Or Changed

| Endpoint | Change | Purpose |
|---|---|---|
| `GET /api/tiktok/gift-menu-overlay-layout` | Added public read-only route. | Allows OBS Browser Source to load the active synced gift menu layout without a frontend auth token. |
| `GET /api/tiktok/gift-menu-layout` | Unchanged. | Authenticated app save/load behavior remains intact. |

The public overlay endpoint reads the locally synced `backend/uploads/gift-menu-layout.json` file and returns only layout fields needed for rendering: `name`, `aspectRatio`, `canvasSize`, `safeArea`, `exportSize`, `savedAt`, `items`, and `exportedItems`.

## Functions Added

| Function | File | Behavior |
|---|---|---|
| `showSaveTemplateModal()` | `desktop/renderer/js/gift-menu-designer.js` | Prompts for a template name, creates a reusable in-session custom template from current canvas items, refreshes widget list when visible, and shows a clear notification that backend persistence is not complete. |
| `clearGoalBoard()` | `desktop/renderer/js/gift-menu-designer.js` | Confirms before clearing, clears only the current in-memory canvas/items, refreshes canvas/library/inspector, and pushes history so undo can restore the previous canvas. |

## Overlay Auth Fix

`backend/public/gift-menu-overlay.html` now fetches:

```text
/api/tiktok/gift-menu-overlay-layout
```

instead of:

```text
/api/tiktok/gift-menu-layout
```

This avoids requiring OBS to send an Authorization header while preserving the authenticated designer route.

## Test Results

| Checklist Item | Result |
|---|---|
| App starts without console syntax errors | Partially verified with `node --check` on changed JS files; full Electron app was not launched. |
| Menu Designer opens | Not launched in this shell. |
| Existing layout loads | Route compatibility preserved; not manually launched. |
| Save works | Authenticated save route unchanged; not manually exercised. |
| Save & Export works | OBS setup call unchanged; not manually exercised with OBS. |
| OBS overlay loads layout | Overlay fetch path updated to public endpoint; not manually exercised in OBS. |
| Clicking save template button does not crash | Missing method implemented; syntax verified. |
| Clicking clear board does not crash | Missing method implemented; syntax verified. |

Commands run:

```text
node --check backend\routes\tiktok.js
node --check desktop\renderer\js\gift-menu-designer.js
npm.cmd test
```

`npm test` via PowerShell was blocked by local execution policy for `npm.ps1`, so `npm.cmd test` was used instead. The repository test script is a placeholder that prints `All tests passed!`.
