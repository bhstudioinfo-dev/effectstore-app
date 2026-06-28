# Menu Designer Reverse Engineering

Project: BH Studio / EffectStore  
Scope: `desktop/renderer/js/gift-menu-designer.js`, `backend/public/gift-menu-overlay.html`, and the backend routes they depend on for layout, OBS, template, and asset sync.

Status legend:

- ACTIVE: implemented and wired to reachable UI or runtime flow.
- DORMANT: code exists, but is hidden, legacy, stub-backed, or not reachable from normal UI.
- BROKEN: code path is reachable but likely fails or cannot complete.
- MISSING: expected feature is not implemented.

## Architecture Summary

The Menu Designer is a single large renderer-side JavaScript module built around `GiftMenuDesigner`, an IIFE-created class assigned to `window.giftMenuDesigner`. It owns all editor state, UI rendering, canvas rendering, event binding, layout persistence, OBS export, widget templates, and test progress logic.

The OBS overlay is a separate static HTML renderer served by Express at `/overlay/gift-menu/`. It polls `/api/tiktok/gift-menu-layout` every 700 ms and re-renders only when the layout signature changes.

The saved model has two coordinate systems:

- Editor/stage coordinates: `items[]` use `x`, `y`, `width`, `height` for the design canvas.
- Export coordinates: `exportedItems[]` are scaled to OBS output size, usually 1080x1920 for 9:16.

The main backend sync endpoint is `/api/tiktok/gift-menu-layout`, backed by `GiftMenuLayout` and mirrored to `backend/uploads/gift-menu-layout.json` for local OBS use.

## Core Files

| File | Purpose | Dependencies | Main classes/functions | Risk |
|---|---|---|---|---|
| `desktop/renderer/js/gift-menu-designer.js` | Full designer UI, canvas engine, layer inspector, widget templates, layout save/load, OBS export calls. | `window.app`, localStorage auth token, TikTok gift library API, gift menu layout API, OBS setup API, WebSocket port 9001, Font Awesome CSS classes. | `GiftMenuDesigner`, `init`, `render`, `renderCanvas`, `bindEvents`, `saveLayout`, `loadLayout`, `exportToOBS`, `renderGoalBoardInspector`, `getDefaultTemplates`. | HIGH: very large single file, mixed legacy/current state, undefined method calls, backend stub dependencies. |
| `backend/public/gift-menu-overlay.html` | OBS Browser Source renderer for saved/exported layouts. | `/gift-menu-renderer.css`, `/api/tiktok/gift-menu-layout`, browser fetch, query params `preview`, `layoutId`, `userId`. | `render`, `loadAndRender`, `safeText`, `auraShapeVars`. | HIGH: overlay fetch appears unauthenticated while backend route requires auth; duplicated renderer logic can drift from designer. |
| `backend/routes/tiktok.js` | Layout CRUD, template list, publish, goal-board asset/template stubs. | `authMiddleware`, `GiftMenuLayout`, `User`, local upload JSON path. | `/gift-menu-layout*`, `/gift-menu-templates`, `/goal-board/assets`, `/goal-board/templates`, `/goal-board/upload-asset`. | HIGH: several UI calls depend on stubbed or incomplete routes. |
| `backend/routes/obs.js` | Creates/updates OBS Browser Source for gift menu. | OBS service, OBS WebSocket settings. | `POST /api/obs/setup-gift-menu`. | MEDIUM: source setup exists, but runtime overlay data fetch may fail due auth mismatch. |
| `backend/server.js` | Serves overlay HTML. | Express static sendFile. | `GET /overlay/gift-menu/`. | LOW by itself; integration risk comes from overlay API auth. |

## Canvas Engine

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Stage canvas render loop | ACTIVE | `renderCanvas()` clears `.gmd-item` nodes and rebuilds them sorted by `zIndex`. | `gift-menu-designer.js` |
| Safe-area based aspect ratios | ACTIVE | Supports 9:16, 16:9, 1:1 with separate live canvas and safe area sizes. | `gift-menu-designer.js` |
| Coordinate conversion | ACTIVE | `logicalToStage()` and `stageToLogical()` map OBS logical coordinates to editor stage coordinates. | `gift-menu-designer.js` |
| Zoom controls | ACTIVE | Toolbar and Ctrl+wheel update `zoomLevel`; `applyZoom()` applies scale/pan. | `gift-menu-designer.js` |
| Pan controls | ACTIVE | Mouse wheel pans; Space/middle mouse enables panning when zoomed. | `gift-menu-designer.js` |
| Snap guides | ACTIVE | `snapEnabled`, `applySnapForItem()`, `activeGuides`, and guide DOM updates are wired to move operations. | `gift-menu-designer.js` |
| Undo/redo history | ACTIVE | Snapshot history covers item data, selection, zoom/pan, aspect ratio. Buttons and Ctrl+Z/Ctrl+Y are wired. | `gift-menu-designer.js` |
| Keyboard delete/duplicate | ACTIVE | Delete/Backspace removes selected layers; Ctrl+D duplicates. | `gift-menu-designer.js` |

## Drag, Drop, Resize, Rotate

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Gift click-to-add | ACTIVE | Clicking `.gmd-gift-card` calls `addGiftToCanvas()`. | `gift-menu-designer.js` |
| Gift drag/drop | ACTIVE | Drag sets `text/plain` gift id; drop creates an item at canvas point. | `gift-menu-designer.js` |
| Template drag/drop | ACTIVE | Drag sets `template-id`; drop calls `addTemplateToCanvas()`. | `gift-menu-designer.js` |
| Asset drag/drop | DORMANT | UI supports it, but asset list is backed by stub endpoints returning no assets. | `gift-menu-designer.js`, `tiktok.js` |
| Move selected item | ACTIVE | `dragState.mode = 'move'`; multi-selection and grouped items are included. | `gift-menu-designer.js` |
| Resize gift item | ACTIVE | Gift icons resize square by dominant mouse delta. | `gift-menu-designer.js` |
| Resize widget item | ACTIVE | Widgets resize width/height and sync `w`/`h`; lock-ratio mode exists. | `gift-menu-designer.js` |
| Rotate gift item | ACTIVE | Gift layers show rotate handle and update `rotation`. | `gift-menu-designer.js` |
| Rotate widget item | MISSING | Widget branch renders only resize handle; no rotate handle for widgets. | `gift-menu-designer.js` |
| Locked layer interaction | ACTIVE | Locked items can be selected but cannot move/resize/rotate. | `gift-menu-designer.js` |

## Layer Panel

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Layer list | ACTIVE | `renderLayerPanel()` lists items by z-order. | `gift-menu-designer.js` |
| Select layer | ACTIVE | `layer-select` uses the same selection system as canvas clicks. | `gift-menu-designer.js` |
| Hide/show layer | ACTIVE | `visible === false` removes the item from canvas and overlay export render. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Lock/unlock layer | ACTIVE | `locked` blocks editing and hides handles. | `gift-menu-designer.js` |
| Move layer up/down | ACTIVE | `moveLayer()` swaps normalized `zIndex` values. | `gift-menu-designer.js` |
| Align and distribute | ACTIVE | Toolbar actions align to safe area and distribute selected layers. | `gift-menu-designer.js` |
| Multi-select inspector | ACTIVE | Multi-select state exists and shows aggregate inspector. | `gift-menu-designer.js` |

## Grouping System

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Template group IDs | ACTIVE | `addTemplateToCanvas()` assigns a shared `groupId` to all template layers. | `gift-menu-designer.js` |
| Moving grouped template layers | ACTIVE | Move/resize setup expands selected items to include same `groupId`. | `gift-menu-designer.js` |
| Manual group creation | MISSING | No reachable UI action creates a group from arbitrary selected layers. | `gift-menu-designer.js` |
| Manual ungroup | MISSING | No UI action removes `groupId`. | `gift-menu-designer.js` |
| Legacy `goalBoard.items` group drag | DORMANT | Old `goal-move`/`goal-resize` handlers still reference `this.goalBoard.items`, but current widget canvas uses `this.items`. | `gift-menu-designer.js` |

## Text System

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Add text layer | ACTIVE | `addTextToCanvas()` creates `type: 'text'` layer. | `gift-menu-designer.js` |
| Text render in editor | ACTIVE | `renderCanvas()` renders `.gmd-text-widget`. | `gift-menu-designer.js` |
| Text render in OBS overlay | ACTIVE | Overlay supports `item.type === 'text'` and escapes text via `safeText()`. | `gift-menu-overlay.html` |
| Text inspector | ACTIVE | `renderGoalBoardInspector()` exposes text content, color, size, weight, shadow, alignment. | `gift-menu-designer.js` |
| Text resize scaling font | ACTIVE | Widget resize scales `fontSize` for text layers. | `gift-menu-designer.js` |
| Duplicate add-text button IDs | BROKEN | Two buttons use `id="gmd-add-text-btn"`. Event delegation still catches clicks, but duplicate IDs are invalid DOM and can cause selector ambiguity. | `gift-menu-designer.js` |

## Widget Matrix

| Widget / Feature | Status | Notes | Related Files |
|---|---|---|---|
| Standard gift icon | ACTIVE | Gift library creates icon/name/aura/motion layers. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Aura effects | ACTIVE | Glow, bubble, ring, frame, sweep, fire, electric mapped to CSS classes. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Motion effects | ACTIVE | Pulse, bounce, float, zoom, shake mapped to CSS classes. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Goal bar | ACTIVE | Editor, inspector, test button, save/export, and overlay render are implemented. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Goal circle | ACTIVE | Editor/overlay render, inspector, template, test/reset logic all exist. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Boss bar | ACTIVE | Template, inspector, editor/overlay render, test/reset logic all exist. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Top contributors leaderboard | ACTIVE | Editor and overlay render; test logic populates contributor data. Live source depends on external progress events. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Podium contributors leaderboard | ACTIVE | Editor and overlay render; test logic populates contributor data. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Combo widget | ACTIVE | Template, inspector/render, test/reset logic exist. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Mystery chest widget | ACTIVE | Progress milestones unlock visually at 25/50/75/100 percent. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Goal list / goal board widget | ACTIVE | Multi-goal rows, add/remove goal rows, auto-scroll and shimmer are implemented. | `gift-menu-designer.js`, `gift-menu-overlay.html` |
| Media asset widget | BROKEN | Editor and overlay can render `media-asset`, but upload/list routes are stubs and return no persisted asset. | `gift-menu-designer.js`, `gift-menu-overlay.html`, `tiktok.js` |
| Custom user-uploaded widgets/assets | BROKEN | Upload UI calls `/goal-board/upload-asset`; backend returns `{ asset: null }` and does not store the file. | `gift-menu-designer.js`, `tiktok.js` |
| Premium widget badges | ACTIVE | Widget cards display `Free` or a price tag from `isPremium`/`price`. | `gift-menu-designer.js` |
| Premium enforcement | MISSING | Premium templates can be added directly from built-in widget cards; no lock, purchase, subscription, or entitlement guard is applied there. | `gift-menu-designer.js` |
| Locked premium widgets | MISSING | `locked` only means editor layer lock. It is not a monetization lock. | `gift-menu-designer.js` |

## Template System

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Built-in templates | ACTIVE | `getDefaultTemplates()` returns goal-circle, goal-bar, goal-list, mystery chest, leaderboard, combo, boss, and premium beauty layout templates. | `gift-menu-designer.js` |
| Add built-in template to canvas | ACTIVE | Clicking or dropping `.gmd-template-card` calls `addTemplateToCanvas()`. | `gift-menu-designer.js` |
| Template grouping | ACTIVE | All layers from a template receive the same generated `groupId`. | `gift-menu-designer.js` |
| Custom template load | DORMANT | Frontend loads `/goal-board/templates`, but backend returns an empty array. | `gift-menu-designer.js`, `tiktok.js` |
| Save custom template | BROKEN | UI click path calls `showSaveTemplateModal()`, but no method definition exists in the inspected file. | `gift-menu-designer.js` |
| Clear goal board | BROKEN | UI click path calls `clearGoalBoard()`, but no method definition exists in the inspected file. | `gift-menu-designer.js` |
| Marketplace template list | PARTIAL | `/gift-menu-templates` returns DB templates and UI shows buy/use buttons. Purchase/use is delegated to missing `window.app.buyOrUseMenuTemplate`. | `gift-menu-designer.js`, `tiktok.js` |

## Test Effect Logic

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Test goal gift button | ACTIVE | Inspector shows test controls for goal widgets, leaderboards, mystery, combo. | `gift-menu-designer.js` |
| Simulated goal progress | ACTIVE | `sendSimulatedGift()` increments `currentCount`, goal-list rows, contributors, or combo count, then saves layout. | `gift-menu-designer.js` |
| Reset progress | ACTIVE | `resetGoalBoardItem()` resets progress, contributors, or combo count and saves layout. | `gift-menu-designer.js` |
| OBS preview sync after test | PARTIAL | Test saves layout, but overlay polling only sees it if overlay can fetch the protected layout endpoint. | `gift-menu-designer.js`, `gift-menu-overlay.html`, `tiktok.js` |

## OBS Export And Overlay Sync

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Save layout | ACTIVE | `saveLayout()` posts full payload to `/api/tiktok/gift-menu-layout` with auth header if token exists. | `gift-menu-designer.js`, `tiktok.js` |
| Export coordinate scaling | ACTIVE | `exportedItems` are generated from safe-area coordinates and output dimensions. | `gift-menu-designer.js` |
| OBS source setup | ACTIVE | `exportToOBS()` calls `/api/obs/setup-gift-menu`; backend creates/updates Browser Source `gift_menu_overlay`. | `gift-menu-designer.js`, `obs.js` |
| Overlay polling | ACTIVE | `loadAndRender()` polls every 700 ms and avoids redundant render by signature. | `gift-menu-overlay.html` |
| Overlay layout fetch | BROKEN | Overlay fetches `/api/tiktok/gift-menu-layout` without Authorization, but backend route is protected by `authMiddleware`. In OBS this likely returns 401 and renders nothing. | `gift-menu-overlay.html`, `tiktok.js` |
| `layoutId` / `userId` overlay params | DORMANT | Overlay appends params, but backend GET route ignores them and uses authenticated user active layout. | `gift-menu-overlay.html`, `tiktok.js` |
| Preview empty-state | ACTIVE | `preview=true` renders a friendly empty-state if no items exist. | `gift-menu-overlay.html` |

## Backend And Storage Dependencies

| Feature | Status | Notes | Related Files |
|---|---|---|---|
| Layout list | ACTIVE | `/gift-menu-layouts` returns authenticated user's non-template layouts. | `tiktok.js` |
| Active layout load | ACTIVE for app, BROKEN for overlay | App supplies auth; overlay does not. | `gift-menu-designer.js`, `gift-menu-overlay.html`, `tiktok.js` |
| Layout create | ACTIVE | `/gift-menu-layout/create` creates and activates a new empty layout. | `tiktok.js` |
| Layout activate/delete | ACTIVE | PUT activate and DELETE routes exist. | `tiktok.js` |
| Rename layout | PARTIAL | Frontend posts `{ id, name }` to `/gift-menu-layout`; backend updates the active layout, not a dedicated rename route. It may not rename arbitrary non-active layout reliably. | `gift-menu-designer.js`, `tiktok.js` |
| Publish to store | PARTIAL | Admin modal sends title, price, original price, description, icon, and `layoutData`; backend clones active layout as a template and ignores most metadata. | `gift-menu-designer.js`, `tiktok.js` |
| Asset storage | BROKEN | Asset list/upload routes are mock fallbacks and do not persist media. | `gift-menu-designer.js`, `tiktok.js` |

## Disconnected Or Suspicious Code

- `showSaveTemplateModal()` is called but not defined.
- `clearGoalBoard()` is called but not defined.
- `onModeChange()` exists as an empty placeholder.
- `goalBoard.items` move/resize logic remains, but current render/save paths use `this.items`; this looks like legacy code from an earlier goal-board-specific canvas.
- `buyOrUseTemplateFromSidebar()` depends on `window.app.buyOrUseMenuTemplate`, but no local fallback purchase/use implementation exists.
- `showPublishStoreModal()` collects marketplace metadata, but backend publish ignores price, description, icon, original price, and layoutData.
- `loadGoalAssets()` and `uploadGoalAsset()` are wired in UI, but backend returns empty assets and `asset: null`.
- `loadGoalTemplates()` is wired, but backend returns no custom templates.
- Overlay supports `layoutId` and `userId` query params, but backend active layout GET is auth-user based and ignores those params.
- Overlay fetches layout without auth, conflicting with the protected backend route.
- Duplicate `id="gmd-add-text-btn"` appears twice in the rendered UI.
- Premium templates have visible price tags but no entitlement gate in the built-in widget card path.

## Requested Feature Classification

| Requested Area | Classification | Reason |
|---|---|---|
| Canvas engine | ACTIVE | Render, selection, zoom, pan, safe area, history, snap guides are implemented. |
| Drag/drop | ACTIVE | Gifts and templates work; assets are UI-wired but backend-stubbed. |
| Resize | ACTIVE | Gifts and widgets resize; widget dimensions sync to logical export fields. |
| Rotate | PARTIAL | Gifts rotate; widgets do not expose rotate handles. |
| Layer panel | ACTIVE | Select, reorder, hide, lock are implemented. |
| Grouping system | PARTIAL | Template group IDs move together; manual group/ungroup is missing; legacy goalBoard grouping is dormant. |
| Text system | ACTIVE | Add, edit, render, export, and resize-scaling exist. |
| Goal widgets | ACTIVE | Goal bar, circle, boss, list, mystery and combo widgets render and test. |
| Leaderboard widgets | ACTIVE | Top contributors and podium render and have test data paths. |
| Combo widgets | ACTIVE | Render, inspect, test, reset exist. |
| Mystery chest widgets | ACTIVE | Template/render/test/reset exist. |
| Goal board widgets | ACTIVE | Goal-list widget is the practical goal board; old `goalBoard` object is dormant. |
| OBS export sync | BROKEN | OBS source setup is active, but overlay cannot fetch protected layout data without auth. |
| Template system | PARTIAL | Built-ins work; saved/custom templates and marketplace purchase/use are incomplete. |
| Premium widgets | PARTIAL | Price labels exist; enforcement is missing. |
| Locked widgets | PARTIAL | Editor lock exists; premium/entitlement lock is missing. |
| Test effect logic | ACTIVE | Simulated gift and reset logic exist for supported widgets. |

## Highest Risks

1. OBS overlay likely renders blank in production because its polling fetch lacks auth for `/api/tiktok/gift-menu-layout`.
2. Media upload/custom asset features are visible but backend-stubbed, so user-uploaded assets cannot become durable overlay layers through the normal flow.
3. Built-in premium template cards are not locked; premium is visual metadata only.
4. Template save and clear-board actions call undefined methods.
5. Designer and overlay duplicate large rendering logic, increasing drift risk whenever a widget changes.
6. The file contains legacy `goalBoard.items` logic beside the current `this.items` architecture, making regressions likely during future edits.
