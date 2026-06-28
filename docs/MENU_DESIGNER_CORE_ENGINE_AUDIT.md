# Menu Designer Core Engine Audit

Project: BH Studio / EffectStore  
Scope: Menu Designer core engine  
Files audited:

- `desktop/renderer/js/gift-menu-designer.js`
- `backend/public/gift-menu-overlay.html`

Mode: documentation-only audit. No code changes.

## 1. Full Architecture Map

The Menu Designer is currently implemented as one large browser-side class:

```js
class GiftMenuDesigner
```

The class owns almost every subsystem:

| System | Current owner | Main state / methods |
| --- | --- | --- |
| App boot | `GiftMenuDesigner.init()` | CSS injection, UI render, event binding, data load |
| Canvas item state | `this.items` | Root source of truth for designer preview |
| Selection | `selectedId`, `selectedIds` | Single and multi-select |
| Render preview | `renderCanvas()` | Direct DOM rendering for gifts and widgets |
| Right inspector | `renderInspector()`, `renderGoalBoardInspector()` | Builds HTML strings for controls |
| Layer panel | `renderLayerPanel()`, `moveLayer()` | Sorts by `zIndex` |
| Save | `saveLayout()` | Saves `items` and computed `exportedItems` |
| Export to OBS | `saveAndExport()`, `exportToOBS()` | Saves layout then calls OBS setup route |
| History | `history`, `historyIndex` | JSON snapshots of item state |
| Canvas interaction | `bindEvents()` | Click, drag/drop, move, resize, rotate, hotkeys |
| Widget templates | `getDefaultTemplates()`, `addTemplateToCanvas()` | Inserts one or more template layers |
| Overlay runtime | `gift-menu-overlay.html` | Polls public layout endpoint and renders OBS output |

High-level flow:

```text
Gift library / widget templates / assets / text
        |
        v
this.items
        |
        +--> renderCanvas() preview
        |
        +--> renderInspector() controls
        |
        +--> saveLayout()
                 |
                 +--> payload.items
                 +--> payload.exportedItems
                 |
                 v
          backend layout storage
                 |
                 v
gift-menu-overlay.html fetches public overlay layout
                 |
                 v
OBS/browser overlay render()
```

There is no formal item registry, no shared renderer module, and no centralized schema definition. The schema is implicit in item creation, template layers, inspector controls, preview renderer, save/export, and overlay renderer.

## 2. Current Data Model

### Global Designer State

Important state in `GiftMenuDesigner`:

| Field | Purpose |
| --- | --- |
| `this.items` | Root array of canvas layers |
| `this.selectedId` | Primary selected item |
| `this.selectedIds` | Multi-select item ids |
| `this.aspectRatio` | Current ratio: `9:16`, `16:9`, or `1:1` |
| `this.canvasSize` | Stage size used by designer preview |
| `this.layouts` | Saved layouts list |
| `this.currentLayoutId` | Active layout id in backend |
| `this.currentLayoutName` | Active layout name |
| `this.zoomLevel` | Manual preview zoom |
| `this.panX`, `this.panY` | Preview pan offsets |
| `this.history` | JSON snapshot stack |
| `this.historyIndex` | Current undo/redo pointer |
| `this.snapEnabled` | Enables edge/center snapping |
| `this.gifts` | Gift library loaded from backend |
| `this.goalAssets` | Uploaded/custom goal/media assets |
| `this.customTemplates` | Goal/menu templates loaded from backend |

### Coordinate Systems

There are two major coordinate systems.

Designer stage coordinates:

- Used by `renderCanvas()`.
- Stored in `item.x`, `item.y`, `item.width`, `item.height`.
- Based on `canvasSize`:
  - `9:16`: stage `720 x 960`, safe area `360 x 640`
  - `16:9`: stage `960 x 720`, safe area `640 x 360`
  - `1:1`: stage `900 x 900`, safe area `480 x 480`

Logical/export coordinates:

- Used by widgets/templates and inspector for some fields.
- Stored in `item.w`, `item.h` for widget-like layers.
- Converted with `logicalToStage()` and `stageToLogical()`.
- Final OBS export sizes:
  - `9:16`: `1080 x 1920`
  - `16:9`: `1920 x 1080`
  - `1:1`: `1080 x 1080`

This mixed coordinate model is powerful but fragile. Gift items mostly behave in stage pixels. Widgets often expose logical/export dimensions through `w/h` but still render from stage dimensions.

### Item Type Classification

Current engine recognizes these root item types:

| Type | Category | Preview branch | Overlay branch |
| --- | --- | --- | --- |
| no `type` | Gift item | Standard gift branch | Standard gift branch |
| `gift` | Gift item | Treated like standard gift | Treated like standard gift |
| `text` | Widget-like layer | Widget branch | Widget branch |
| `media-asset` | Widget-like layer | Widget branch | Widget branch |
| `goal-bar` | Goal widget | Widget branch | Widget branch |
| `goal-circle` | Goal widget | Widget branch | Widget branch |
| `boss-bar` | Goal widget | Widget branch | Widget branch |
| `combo` | Goal/combo widget | Widget branch | Widget branch |
| `mystery-chests` | Mystery widget | Widget branch | Widget branch |
| `top-contributors` | Leaderboard widget | Widget branch | Widget branch |
| `podium-contributors` | Leaderboard widget | Widget branch | Widget branch |
| `goal-list` | Goal list widget | Widget branch | Widget branch |

User-facing docs sometimes call the mystery type `mystery-chest`, but the actual implemented type string is `mystery-chests`.

### Standard Gift Schema

Created by `createItemFromGift()`.

```js
{
  id,
  giftId,
  name,
  iconUrl,
  x,
  y,
  width,
  height,
  rotation,
  showName,
  textSize,
  textColor,
  textGap,
  textPosition,
  auraType,
  auraColor,
  auraShape,
  animationType,
  animationSpeed,
  auraSpeed,
  auraScale,
  zIndex,
  visible,
  locked
}
```

Notes:

- `type` is usually absent for regular gifts.
- Inspector treats no `type` and `type: "gift"` as gift items.
- Resize keeps gift width and height equal.
- Gift supports rotation handle.
- Gift supports aura and motion classes.

### Text Schema

Created by `addTextToCanvas()`.

```js
{
  id,
  name,
  type: "text",
  text,
  x,
  y,
  w,
  h,
  width,
  height,
  color,
  fontSize,
  fontWeight,
  textShadow,
  textAlign,
  zIndex,
  visible,
  locked
}
```

Notes:

- Text is rendered through the widget branch.
- Text has resize handle but no rotate handle in the current widget path.
- Text resize can also scale `fontSize` in drag resize logic.

### Media Asset Schema

Created by `addAssetToCanvas()`.

```js
{
  id,
  name,
  type: "media-asset",
  assetUrl,
  isWebM,
  x,
  y,
  w,
  h,
  width,
  height,
  opacity,
  fitMode,
  autoplay,
  loop,
  muted,
  playsinline,
  zIndex,
  visible,
  locked
}
```

Notes:

- Supports image and WebM-like video rendering.
- Overlay also treats `.webm` as video.
- The upload pipeline has been guarded previously, but the renderer can display existing `assetUrl`.

### Goal Bar Schema

Typical fields from templates and inspector:

```js
{
  id,
  name,
  type: "goal-bar",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  giftId,
  giftName,
  iconUrl,
  targetCount,
  currentCount,
  subtitleText,
  barColor,
  glowColor,
  titleColor,
  subtitleColor,
  borderRadius,
  barHeight,
  barStyle,
  themeStyle,
  fontSize,
  subtitleFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor,
  lockRatio,
  lockedW,
  lockedH
}
```

### Goal Circle Schema

```js
{
  id,
  name,
  type: "goal-circle",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  lockRatio,
  giftId,
  giftName,
  iconUrl,
  targetCount,
  currentCount,
  centerIcon,
  subtitleText,
  barColor,
  fontSize,
  subtitleFontSize,
  numberFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor
}
```

### Boss Bar Schema

```js
{
  id,
  name,
  type: "boss-bar",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  giftId,
  giftName,
  bossName,
  bossSub,
  targetCount,
  currentCount,
  barColor,
  barHeight,
  barStyle,
  fontSize,
  subtitleFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor
}
```

### Combo Schema

```js
{
  id,
  name,
  type: "combo",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  comboCount,
  subtitleText,
  barColor,
  fontSize,
  numberFontSize,
  subtitleFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor
}
```

### Mystery Chests Schema

```js
{
  id,
  name,
  type: "mystery-chests",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  giftId,
  giftName,
  targetCount,
  currentCount,
  subtitleText,
  barColor,
  glowColor,
  barHeight,
  barStyle,
  fontSize,
  subtitleFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor
}
```

Milestones are hard-coded visually at 25%, 50%, 75%, and 100%.

### Top Contributors Schema

```js
{
  id,
  name,
  type: "top-contributors",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  contributors,
  limitCount,
  showAvatar,
  showValue,
  barColor,
  fontSize,
  rowFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor
}
```

`contributors` shape:

```js
[
  { nickname, value, avatar }
]
```

### Podium Contributors Schema

Similar to `top-contributors`, but rendered as a podium.

```js
{
  id,
  name,
  type: "podium-contributors",
  contributors,
  showValue,
  fontSize,
  rowFontSize,
  valueFontSize,
  ...
}
```

### Goal List Schema

```js
{
  id,
  name,
  type: "goal-list",
  x,
  y,
  w,
  h,
  width,
  height,
  zIndex,
  visible,
  locked,
  barColor,
  goals,
  footerText,
  showGiftName,
  iconSize,
  barHeight,
  barStyle,
  autoScroll,
  autoScrollSpeed,
  shimmerEffect,
  fontSize,
  rowFontSize,
  footerFontSize,
  contentOffsetY,
  hideBg,
  useCustomBg,
  bgColor,
  useCustomTextColor,
  textColor
}
```

`goals` shape:

```js
[
  {
    giftId,
    giftName,
    current,
    target,
    icon
  }
]
```

## 3. Render Pipeline

### Designer Preview

The preview render entry point is:

```js
renderCanvas()
```

Current pipeline:

```text
renderCanvas()
  -> find #gmd-canvas and #gmd-stage
  -> remove old .gmd-item nodes from stage
  -> sort this.items by zIndex ascending
  -> skip item if visible === false
  -> create .gmd-item
  -> set absolute left/top/width/height/rotation/zIndex
  -> if item.type exists and item.type !== "gift":
       render widget branch
     else:
       render standard gift branch
  -> append to #gmd-stage
  -> applyZoom()
```

There are no separate `renderItem()` or `renderWidget()` methods. Widget rendering is a large chain of `if / else if` branches inside `renderCanvas()`.

### Standard Gift Rendering

Standard gifts render as:

```html
<div class="gmd-item">
  <div class="gmd-visual [motion] [aura]">
    <span class="gmd-aura gmd-aura-back"></span>
    <span class="gmd-icon-wrap">
      <img>
    </span>
    <span class="gmd-aura gmd-aura-front"></span>
  </div>
  <div class="gmd-item-label"></div>
  <span class="gmd-rotate-handle"></span>
  <span class="gmd-resize-handle"></span>
</div>
```

Gift rendering uses:

- `getAuraClass()`
- `getMotionClass()`
- `getAuraShapeVars()`
- CSS variables for aura color, speed, scale, and shape

### Widget Rendering

Widgets render inside a scaled wrapper:

```html
<div class="gmd-visual">
  <div class="gmd-visual-scaled-wrapper">
    [widget HTML]
  </div>
</div>
```

For each widget:

```js
refW = item.lockedW || item.w || default
refH = item.lockedH || item.h || default
scaleX = item.width / refW
scaleY = item.height / refH
```

The inner widget is authored at reference dimensions and then CSS-scaled to the current canvas rectangle.

Default reference dimensions:

| Type | Ref size |
| --- | --- |
| `boss-bar` | `840 x 180` |
| `combo` | `800 x 220` |
| `mystery-chests` | `900 x 240` |
| `top-contributors` | `900 x 560` |
| `podium-contributors` | `900 x 560` |
| `goal-list` | `900 x item.h/default` |
| `goal-bar` | `900 x 160` |
| `goal-circle` | `280 x 320` |
| fallback widget | `900 x 160` |

### Canvas Zoom

Preview zoom is independent from item data.

```text
getFitScale()
  -> fit stage inside canvas panel

applyZoom()
  -> finalScale = fitScale * zoomLevel
  -> transform #gmd-stage:
     translate(-50%, -50%) translate(panX, panY) scale(finalScale)
```

`clientToCanvasPoint()` reverses this transform for drag/drop and mouse movement.

## 4. Overlay Pipeline

The overlay engine is contained directly in `backend/public/gift-menu-overlay.html`.

Runtime flow:

```text
loadAndRender()
  -> build URL /api/tiktok/gift-menu-overlay-layout
  -> optional query layoutId/userId
  -> fetch no-store
  -> compare JSON signature
  -> render(layout)
  -> poll every 700ms
```

Overlay chooses items with:

```js
const items = Array.isArray(layout.exportedItems)
  ? layout.exportedItems
  : layout.items || [];
```

OBS viewport scaling:

```js
exportW = layout.exportSize.width || 1080
exportH = layout.exportSize.height || 1920
sx = window.innerWidth / exportW
sy = window.innerHeight / exportH
s = Math.min(sx, sy)
offsetX = (window.innerWidth - exportW * s) / 2
offsetY = (window.innerHeight - exportH * s) / 2
```

Each exported item is positioned as:

```js
left = offsetX + item.x * s
top = offsetY + item.y * s
width = item.width * s
height = item.height * s
```

Widget internals also multiply many sizes by `s`, while the wrapper is also scaled:

```js
scaleX = item.width / refW
scaleY = item.height / refH
wrapperScaleX = scaleX * s
wrapperScaleY = scaleY * s
```

This is intended to preserve the designer widget look inside arbitrary OBS viewport sizes.

Important match requirement:

- Designer preview and OBS overlay must render from equivalent HTML/CSS logic.
- Currently they are separate implementations, so any new widget must be implemented twice.

## 5. Save / Export Pipeline

### Save Engine

The save entry point is:

```js
saveLayout(showToast = true, forcePromptName = false)
```

Current save pipeline:

```text
saveLayout()
  -> maybe prompt for name
  -> compute aspect ratio config
  -> compute liveCanvasSize
  -> compute safeArea size and offset
  -> compute exportSize
  -> compute sx/sy from exportSize / safeArea
  -> map this.items to exportedItems
  -> build payload
  -> write payload to localStorage
  -> POST /api/tiktok/gift-menu-layout
  -> update currentLayoutId/currentLayoutName from backend response
  -> reload layout list
```

Saved payload shape:

```js
{
  id,
  name,
  version: 2,
  savedAt,
  aspectRatio,
  canvasSize,
  safeArea,
  exportSize,
  items,
  exportedItems
}
```

Export transform:

```js
x = Math.round((i.x - safeOffset.x) * sx)
y = Math.round((i.y - safeOffset.y) * sy)
width = Math.round(i.width * sx)
height = Math.round(i.height * sy)
textSize = Number(i.textSize || 13) * ((sx + sy) / 2)
textGap = Number(i.textGap || 4) * sy
```

For widget-like items:

```js
itemExport.w = itemExport.width
itemExport.h = itemExport.height
```

Risk:

- This overwrites widget logical `w/h` in exported data with exported pixel dimensions.
- Preview widgets and overlay widgets both use `w/h` as reference size in some branches.
- Future widgets must be very careful about whether `w/h` means logical design size, reference size, or exported size.

### Export To OBS

The OBS setup entry point is:

```js
exportToOBS()
```

It posts:

```js
POST /api/obs/setup-gift-menu
body: { layoutId: this.currentLayoutId }
```

`saveAndExport()` does:

```text
show "saving/exporting" notification
saveLayout(false, false)
if saved:
  exportToOBS()
show success/error notification
```

The actual visual OBS output is still loaded by the browser source from `gift-menu-overlay.html`, not directly from the designer DOM.

## 6. History Engine

History uses serialized JSON snapshots.

Snapshot shape:

```js
{
  items,
  selectedId,
  selectedIds,
  aspectRatio
}
```

Important methods:

| Method | Purpose |
| --- | --- |
| `createHistorySnapshot()` | Serializes state |
| `restoreHistorySnapshot()` | Parses snapshot and re-renders |
| `pushHistory(label)` | Adds snapshot unless duplicate |
| `undo()` | Moves `historyIndex` backward |
| `redo()` | Moves `historyIndex` forward |
| `updateHistoryButtons()` | Enables/disables undo/redo buttons |

Constraints:

- Maximum history length is 200 snapshots.
- Uses shallow object spread for items, so nested arrays/objects inside items are not deeply cloned before JSON serialization. JSON serialization itself creates a deep snapshot string, but intermediate item mapping is shallow.
- Frequent inspector input changes call `pushHistory()`, which may create many history entries while dragging sliders or typing.
- Drag move/resize pushes history on mouseup as `drag-finish`.

## 7. Selection Engine

Selection state:

```js
selectedId: primary selected item
selectedIds: all selected item ids
```

Important methods:

| Method | Purpose |
| --- | --- |
| `setSelection(ids, primaryId)` | Sets selected list and primary |
| `clearSelection()` | Clears selection |
| `getSelectedItems()` | Returns selected item objects |
| `syncSelectionAfterDataChange()` | Removes stale ids after load/delete |
| `selectItem(id, append)` | Handles normal click and shift-click |

Multi-select behavior:

- Shift-click toggles selected item membership.
- Multi-select works for canvas items and layer panel.
- Gift inspector can bulk-update many selected gift items.
- Some widget inspector paths assume one selected primary widget.

`groupId` behavior:

- Templates inserted by `addTemplateToCanvas()` assign one generated `groupId` to all template layers.
- Move and resize paths expand selected moving items to include all visible/unlocked items sharing that `groupId`.
- Layer panel still lists every layer separately.
- Save/export still serializes every layer separately.
- `groupId` is not a true parent-child system.

## 8. Layer Panel

Layer panel is generated by:

```js
renderLayerPanel()
```

Behavior:

- Copies `this.items`.
- Sorts by `zIndex` descending so top layers appear first.
- Renders each root item as a row.
- Row actions:
  - select
  - move layer up
  - move layer down
  - toggle visible
  - toggle locked

Z-index behavior:

```js
normalizeZIndexOrder()
  -> sort ascending by zIndex
  -> rewrite zIndex = index + 1

moveLayer(id, dir)
  -> normalize
  -> find item
  -> swap zIndex with neighbor
```

Canvas render sorts ascending, so larger `zIndex` draws later and appears above.

Risk:

- `normalizeZIndexOrder()` mutates `this.items` sort order.
- Layer panel assumes all layers are flat root items.
- Future parent widgets need explicit layer representation rules.

## 9. Inspector Engine

There are two inspector paths.

Gift inspector:

```js
renderInspector()
```

Used when selected item has no `type` or `type === "gift"`.

Controls include:

- name
- x/y
- width
- showName
- text position
- text size
- text gap
- text color
- animation type/speed
- aura type/color/shape/speed/scale

Gift update method:

```js
updateSelectedItem(key, value, refreshInspector)
```

Notes:

- Applies to all selected unlocked gift items.
- Width and height are locked together for gifts.
- Numeric values are parsed by key list.
- Some values are clamped.

Goal/widget inspector:

```js
renderGoalBoardInspector()
```

Used when selected item has `type && type !== "gift"`.

Controls include:

- logical x/y/w/h through `stageToLogical()`
- lock ratio
- background/text customization
- content offset
- widget-specific data
- test buttons for goal-like widgets

Widget update method:

```js
updateGoalBoardSelectedItem(key, value)
```

Important:

- For `x`, `y`, `w`, `h`, it converts from logical/export coordinates back to stage coordinates.
- For many other fields, it directly mutates the selected item.
- For `giftId`, it also updates `giftName` and `iconUrl`.

Goal list child updates:

- `updateGoalListItem()`
- `addGoalListItem()`
- `removeGoalListItem()`

Test simulation:

- `sendSimulatedGift()`
- `resetGoalBoardItem()`

These mutate item progress data, render preview, and call `saveLayout(false, false)` so OBS can see the update.

## 10. Dangerous Code Areas

### 1. Renderer Duplication

The biggest architectural risk is duplicated rendering logic:

- Designer preview render is in `gift-menu-designer.js`.
- OBS render is in `gift-menu-overlay.html`.
- Both contain separate branches for the same widget types.
- Both maintain their own scaling details.

Impact:

- Any new widget must be added twice.
- A small mismatch can make OBS output differ from designer preview.
- Existing widgets already have subtle differences in escaping, icon URL handling, and scaling.

### 2. No Item Schema Registry

Item schemas are implicit and scattered across:

- `createItemFromGift()`
- `addTextToCanvas()`
- `addAssetToCanvas()`
- `getDefaultTemplates()`
- `renderCanvas()`
- `renderGoalBoardInspector()`
- `saveLayout()`
- `gift-menu-overlay.html`

Impact:

- New fields may render in preview but not persist/export correctly.
- Unknown types silently fall into the standard gift branch in overlay unless explicitly handled.
- Type naming can drift, for example `mystery-chest` vs `mystery-chests`.

### 3. Mixed Coordinate Semantics

The engine mixes:

- stage coordinates: `x/y/width/height`
- logical/export dimensions: `w/h`
- exported OBS coordinates: `exportedItems`

Impact:

- Resize code can change both `width/height` and `w/h`.
- Save can overwrite exported widget `w/h`.
- Inspector edits and canvas drags use different conversion paths.

### 4. Large Monolithic Class

`GiftMenuDesigner` owns rendering, networking, templates, history, inspector, upload, layout management, OBS export, and WebSocket updates.

Impact:

- Small changes can have large blast radius.
- Hard to test one subsystem.
- Hard to introduce parent widgets safely.

### 5. HTML String Rendering

Most UI and canvas rendering is direct string interpolation.

Impact:

- Escaping is inconsistent.
- Designer preview frequently injects raw item text.
- Overlay uses `safeText()` in more places, but not all logic is shared.

### 6. Widget Branch Is Too Broad

The test:

```js
item.type && item.type !== "gift"
```

means every future non-gift type automatically enters the widget path.

Impact:

- A new type without explicit branch may render as an empty scaled wrapper.
- Parent/group widgets need careful handling.

### 7. `groupId` Is Not a Real Group

`groupId` only expands move/resize sets.

Impact:

- Not suitable for nested widgets.
- Layer panel cannot show parent/child.
- Save/load cannot preserve child structure.
- Future stack/group features should not rely on `groupId` as the primary model.

### 8. History Granularity

Inspector changes push history frequently.

Impact:

- Dragging sliders can flood history.
- Undo may feel too granular.
- Nested structures will increase snapshot size.

### 9. Runtime Polling Overlay

Overlay polls every 700ms and compares a JSON signature.

Impact:

- Simple and robust, but can be wasteful.
- Large future layouts with nested widgets may make signature serialization expensive.

### 10. Encoding / Text Corruption In Source

The audited files contain mojibake in many Vietnamese strings.

Impact:

- Does not necessarily break logic.
- Makes maintenance and UI copy review harder.
- Increases risk when editing strings manually.

## 11. Refactor Priority List

These are architecture priorities, not immediate implementation instructions.

### Priority 1: Define an Item Type Registry

Create a central contract per item type:

```js
{
  type,
  defaults,
  normalize,
  renderPreview,
  renderOverlay,
  inspector,
  exportTransform
}
```

Benefit:

- Prevents hidden schema drift.
- Makes new widgets safer.
- Clarifies what fields persist.

### Priority 2: Extract Shared Render Helpers

Move shared widget rendering into a reusable renderer layer.

Minimum safe target:

- Shared pure functions that return HTML for each widget type.
- Shared helper for reference dimensions.
- Shared helper for colors, icon URL normalization, and safe text.

Benefit:

- Designer preview and OBS overlay can use the same contract.
- Reduces preview/OBS mismatch.

### Priority 3: Formalize Coordinate Conversion

Centralize these concepts:

- stage rect
- safe area rect
- export rect
- logical rect
- widget reference rect

Benefit:

- New features like Gift Stack Group can use one clear pipeline.
- Prevents `w/h` ambiguity.

### Priority 4: Split Inspector By Item Family

Recommended boundaries:

- Gift inspector
- Text inspector
- Media inspector
- Goal widget inspector
- Leaderboard inspector
- Parent/group widget inspector

Benefit:

- Avoids one giant conditional.
- Makes it easier to remove test controls from gift items and keep goal tests isolated.

### Priority 5: Add Parent Layer Model

Before adding complex group widgets, define:

```js
{
  id,
  type,
  children,
  layout,
  style,
  zIndex,
  visible,
  locked
}
```

Benefit:

- Gift Stack Group can become a real parent layer.
- Existing `groupId` can remain template peer metadata.

### Priority 6: Improve History Transactions

Introduce grouped history transactions for:

- drag start/end
- inspector slider drag
- multi-field widget edits
- group creation/ungroup

Benefit:

- Cleaner undo behavior.
- Safer nested item editing.

### Priority 7: Create Render Equivalence Tests

For each item type:

- Create fixture item.
- Render designer preview.
- Render overlay.
- Compare dimensions, key class names, and expected fields.

Benefit:

- Protects OBS matching before adding new features.

## 12. Summary

The current Menu Designer engine works as a pragmatic single-class editor with flat `this.items` as the source of truth. It supports gifts, text, media assets, goal widgets, leaderboard widgets, combo widgets, mystery widgets, saving, exporting, history, layers, selection, and OBS overlay rendering.

The most important architecture constraint is that designer preview and OBS overlay are separate renderers that must be manually kept in sync. The second major constraint is the mixed coordinate model: stage coordinates, logical widget coordinates, and exported OBS coordinates coexist inside the same item objects.

For future features, especially parent widgets like Gift Stack Group, the safest path is to add a formal item contract and avoid building on `groupId` as if it were a real parent/child system.

