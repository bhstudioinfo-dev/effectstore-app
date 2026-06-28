# Full Menu Designer Audit

Scope:
- `desktop/renderer/js/gift-menu-designer.js`
- `desktop/renderer/js/home.js`
- `backend/public/gift-menu-overlay.html`
- `backend/public/gift-menu-renderer.css`
- `backend/routes/*`
- `backend/models/*`

Audit date: current workspace state.

Status labels used:
- `working`
- `partially working`
- `code exists but hidden`
- `broken`
- `orphaned code`
- `missing UI binding`

## Executive Summary

The Gift Menu Designer core is usable for standard gift placement, layer editing, text layers, built-in widgets, layout save/load, and OBS Browser Source export. The major weak areas are persistence and productization around custom templates, marketplace purchase flow, media upload, and some legacy goal-board code that remains in the class but no longer matches the current `this.items` canvas model.

The highest-risk findings:

1. Asset upload UI exists, but backend upload/list endpoints are stubs and never persist files.
2. Template marketplace UI exists, but purchase/use is delegated to `window.app.buyOrUseMenuTemplate`, which does not exist in `home.js`.
3. `showSaveTemplateModal()` now exists, but only creates an in-session template because backend support remains incomplete.
4. Legacy `this.goalBoard.items` drag/resize code is orphaned beside the current `this.items` architecture.
5. Horizontal marquee/auto-scroll is not implemented.
6. Composite multi-source support exists for normal effects, not Gift Menu Designer overlays.

## Feature Audit

### 1. Gift Grouping System (`groupId` logic)

STATUS: partially working

Evidence:
- Built-in/custom template insertion assigns a generated `groupId` to all layers in the template.
- Move and resize setup expands selected items to include all unlocked visible layers with matching `groupId`.
- No UI exists for user-created group/ungroup.
- `showSaveTemplateModal()` strips `groupId` when creating a reusable in-session template.
- Legacy `goal-move` / `goal-resize` logic still references `this.goalBoard.items`, but current canvas uses `this.items`.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`

Risk:
- Template groups move together, but manual grouping is missing.
- Old goal-board grouping logic is orphaned and can confuse future maintenance.

### 2. Vertical Auto Scroll

STATUS: working

Evidence:
- `goal-list` widget has `autoScroll` and `autoScrollSpeed` inspector controls.
- Renderer duplicates goals when auto-scroll is enabled.
- CSS defines `@keyframes gmdMarqueeVertical` and `.gmd-goal-list-marquee-track`.
- Overlay renders the same vertical marquee behavior.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`
- `backend/public/gift-menu-renderer.css`
- `desktop/renderer/styles/gift-menu-designer.css`

Risk:
- Works only for `goal-list`; no generic widget/list scroll engine.

### 3. Horizontal Auto Scroll

STATUS: broken / missing UI binding

Evidence:
- No `gmdMarqueeHorizontal` keyframes found.
- No inspector option for horizontal direction.
- No renderer branch for horizontal marquee.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`
- `backend/public/gift-menu-renderer.css`

Risk:
- Any product/UI copy implying horizontal marquee would be inaccurate.

### 4. Marquee Animation System

STATUS: partially working

Evidence:
- Vertical marquee exists for `goal-list`.
- Row shimmer exists via `.gmd-shimmer-row::after` and `@keyframes gmdRowShimmer`.
- No horizontal marquee or reusable marquee abstraction exists.

Related files:
- `backend/public/gift-menu-renderer.css`
- `desktop/renderer/styles/gift-menu-designer.css`
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- Designer/overlay depend on CSS files for keyframes; inline HTML alone does not define `gmdMarqueeVertical`.

### 5. Text Replacing Gift Image

STATUS: partially working

Evidence:
- Text layers exist as separate `type: 'text'` widgets.
- Gift items support `showName`, label position, label size/color/gap.
- No feature replaces a gift icon image with arbitrary text inside the standard gift item renderer.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- If “text replacing gift image” means a text-only item, use `addTextToCanvas()`.
- If it means standard gift card icon replacement, that feature is missing.

### 6. `addTextToCanvas` System

STATUS: working

Evidence:
- `addTextToCanvas()` creates `type: 'text'` layers.
- Editor and overlay both render text layers.
- Inspector supports text content, color, font size, weight, shadow, and alignment.
- Toolbar/sidebar buttons are wired to `#gmd-add-text-btn`.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- There are duplicate `id="gmd-add-text-btn"` buttons. Event delegation still catches clicks, but duplicate IDs are invalid DOM and can become fragile.

### 7. `exportToOBS` Logic

STATUS: working

Evidence:
- Designer calls `POST /api/obs/setup-gift-menu`.
- Backend creates/updates OBS Browser Source named `gift_menu_overlay` in scene `EffectStore`.
- Source URL points at `/overlay/gift-menu/`.
- Backend refreshes browser source via `refreshnocache` when possible.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/routes/obs.js`
- `backend/server.js`

Risk:
- OBS setup always uses fixed browser source dimensions `1080x1920`; non-9:16 layouts rely on overlay scaling, not source dimension changes.
- `layoutId` is sent by frontend but ignored by `/setup-gift-menu`.

### 8. `saveAndExport` Logic

STATUS: working

Evidence:
- Calls `saveLayout(false, false)` then `exportToOBS()`.
- Cancels cleanly if layout naming prompt is cancelled.
- Shows success/error notifications.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`

Risk:
- Save route updates active layout only; if current ID and active DB layout diverge, save may target active layout rather than explicit `id`.

### 9. Overlay Renderer Synchronization

STATUS: partially working

Evidence:
- Overlay now fetches public read-only `/api/tiktok/gift-menu-overlay-layout`.
- Overlay polls every 700 ms and skips rerender when signature is unchanged.
- Save/load routes sync active layout to `backend/uploads/gift-menu-layout.json`.

Related files:
- `backend/public/gift-menu-overlay.html`
- `backend/routes/tiktok.js`
- `backend/uploads/gift-menu-layout.json`

Risk:
- Public overlay endpoint reads only local JSON. If DB changes without a save/load/activate path writing the JSON mirror, overlay can lag.
- Overlay still appends `layoutId` and `userId`, but public endpoint ignores both.

### 10. Composite Multi Source Support

STATUS: code exists but hidden / not part of Gift Menu Designer

Evidence:
- `home.js`, `Effect` model, and `effects.js` support `isComposite`, timelines, OBS source selection, and `/api/obs/trigger-with-duplicate`.
- Gift Menu Designer overlay export uses a single Browser Source (`gift_menu_overlay`).
- No Gift Menu Designer UI maps multiple OBS sources or timeline layers.

Related files:
- `desktop/renderer/js/home.js`
- `backend/models/Effect.js`
- `backend/routes/effects.js`
- `backend/routes/obs.js`

Risk:
- Composite support belongs to effect marketplace/admin timeline, not Menu Designer.

### 11. Aura / Glow Background Effects

STATUS: working

Evidence:
- Standard gifts support aura classes: Glow, Bubble, Magic Ring, Neon Frame, Light Sweep, Fire Aura, Electric Aura.
- Aura color, speed, scale, and shape are configurable.
- Overlay CSS includes smoothing/glow rules and motion keyframes.
- Goal widgets include glow/background controls such as `barColor`, `glowColor`, `hideBg`, `useCustomBg`, and `useCustomTextColor`.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`
- `backend/public/gift-menu-renderer.css`

Risk:
- Designer and overlay duplicate rendering logic; drift is possible.

### 12. Goal Board Widget System

STATUS: partially working

Evidence:
- Practical current system is `this.items` with widget types: `goal-bar`, `goal-circle`, `boss-bar`, `top-contributors`, `podium-contributors`, `mystery-chests`, `combo`, `goal-list`, `media-asset`, `text`.
- Widgets render in editor and overlay.
- Inspector supports widget-specific controls and test/reset logic.
- WebSocket handler updates matching `this.items` layers from `goal_board_progress_update`.
- Separate constructor state `this.goalBoard = { items: [] }` is no longer the canonical canvas.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- Old `goalBoard.items` drag/resize code is orphaned.
- Live progress depends on an external WebSocket event shape; no backend route in audited files emits this shape directly.

### 13. Goal Milestones (25%, 50%, 75%, 100%)

STATUS: working

Evidence:
- `mystery-chests` widget renders milestones at 25%, 50%, 75%, 100%.
- Milestone nodes receive `unlocked` class based on progress percentage.
- Editor and overlay use the same milestone logic.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`
- `backend/public/gift-menu-renderer.css`

Risk:
- Milestone percentages are hard-coded; no inspector UI to customize thresholds/rewards.

### 14. Goal Unlock Animations

STATUS: partially working

Evidence:
- CSS changes unlocked milestone chest size/color/drop-shadow.
- Chest has float animation.
- There is no one-shot unlock event animation when crossing a threshold; it is purely state-based render.

Related files:
- `backend/public/gift-menu-renderer.css`
- `desktop/renderer/styles/gift-menu-designer.css`
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- “Unlock animation” exists as visual state/transition, not as an event-triggered celebration.

### 15. Layer Management System

STATUS: working

Evidence:
- Layer panel lists layers.
- Supports select, visible toggle, lock toggle, up/down z-order.
- Supports multi-select, duplicate, delete, align, distribute.
- Hidden layers are not rendered.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`

Risk:
- Widget rotation UI is missing; standard gift items have rotate handles, widgets only expose resize handles.

### 16. Asset Upload (image/video/webm/mp4)

STATUS: broken

Evidence:
- UI has asset tab, upload button, file input, asset cards, and `media-asset` renderer.
- `uploadGoalAsset()` posts to `/api/tiktok/goal-board/upload-asset`.
- Backend route returns `{ success: true, asset: null }`.
- Asset list route returns empty `assets: []`.
- No multer/storage handling exists for goal-board assets.
- Renderer can display image/video/webm if `assetUrl` is present, but normal upload flow never produces one.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/routes/tiktok.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- User-visible upload flow can appear successful while creating no usable asset.

### 17. Canvas History Undo/Redo

STATUS: working

Evidence:
- Snapshot history stores `items`, selection, selected IDs, and aspect ratio.
- Undo/redo buttons and Ctrl+Z/Ctrl+Y are wired.
- Major operations push history: add, drop, duplicate, delete, move/resize finish, item updates, clear board.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`

Risk:
- History does not store zoom/pan, current layout ID/name, or custom templates.
- Some high-frequency inspector input changes push many snapshots.

### 18. Template Save System

STATUS: partially working

Evidence:
- `showSaveTemplateModal()` exists and no longer crashes.
- It creates an in-session `customTemplates` entry from current canvas items.
- It explicitly notifies that backend persistence is not complete.
- `/goal-board/templates` returns `customTemplates: []`.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/routes/tiktok.js`

Risk:
- Saved custom templates disappear on reload.
- The UI label can imply persistent save even though it is session-only.

### 19. Template Marketplace Support

STATUS: broken / partially working

Evidence:
- `/gift-menu-templates` returns layouts with `isTemplate: true`.
- Admin publish modal exists.
- Backend publish clones active layout as a template.
- Publish modal sends name, price, original price, description, icon, and `layoutData`, but backend ignores those fields.
- Sidebar template use/buy calls `window.app.buyOrUseMenuTemplate(templateId)`.
- `home.js` does not define `buyOrUseMenuTemplate`.
- `GiftMenuLayout` schema has no price, originalPrice, description, icon, ownership, purchase, or entitlement fields.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `desktop/renderer/js/home.js`
- `backend/routes/tiktok.js`
- `backend/models/GiftMenuLayout.js`

Risk:
- Marketplace templates can be listed, but purchase/use flow is disconnected.
- Premium economics are not persisted.

### 20. Hidden Functions Existing But Not Connected To UI

STATUS: mixed

Findings:
- `onModeChange()` exists as an empty placeholder.
- `this.goalBoard` state exists but current designer uses `this.items`.
- `goal-move` and `goal-resize` drag paths exist but are unreachable from current UI.
- `layoutId` / `userId` query params are parsed by overlay but ignored by public endpoint.
- `buyOrUseTemplateFromSidebar()` is connected to UI but delegates to a missing `window.app.buyOrUseMenuTemplate`.
- Composite/timeline editor functions in `home.js` are connected to admin/effects, not Menu Designer.
- `save-new-template` and `clear-goal-board` are now connected to existing methods, but template save is session-only.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `desktop/renderer/js/home.js`
- `backend/public/gift-menu-overlay.html`

Risk:
- Orphaned code can be mistaken for supported behavior.

## Additional Findings

### Zoom And Small Gift Size

STATUS: working

Evidence:
- Current `setZoom()` clamps max zoom to `500%`.
- Standard gift min size is `10px`; widgets remain `30px`.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`

### Rename Layout

STATUS: partially working / potentially broken

Evidence:
- Frontend posts `{ id, name }` to `/gift-menu-layout`.
- Backend save route does not use `payload.id`; it finds active layout and does not assign `layout.name = payload.name`.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/routes/tiktok.js`

Risk:
- Rename UI may show success while backend name does not persist as expected.

### Premium / Locked Widgets

STATUS: partially working

Evidence:
- Built-in widget cards can display premium price tags.
- There is no entitlement enforcement for adding built-in premium templates.
- `locked` means editor layer lock, not monetization lock.

Related files:
- `desktop/renderer/js/gift-menu-designer.js`
- `backend/models/GiftMenuLayout.js`

## Recovery Priority

1. Implement real goal-board asset upload/list storage.
2. Add persistent custom template backend or relabel session-only template save.
3. Add `buyOrUseMenuTemplate` or remove/disable marketplace purchase buttons until backend entitlement exists.
4. Remove or isolate orphaned `this.goalBoard.items` drag/resize code.
5. Fix layout rename route behavior.
6. Decide whether horizontal marquee is a real product requirement; if yes, add direction data model, inspector option, renderer branch, and keyframes.
7. Add explicit Gift Menu marketplace schema fields if premium templates are intended.
8. Consider sharing renderer logic between designer and overlay to reduce drift.
