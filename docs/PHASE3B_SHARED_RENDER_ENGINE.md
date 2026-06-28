# Phase 3B - Shared Render Engine

Project: BH Studio / EffectStore  
Module: Menu Designer / OBS Gift Menu Overlay  
Goal: begin removing duplicated render architecture safely.

## Files Changed

| File | Change |
| --- | --- |
| `desktop/renderer/js/shared-render-engine.js` | Added shared pure render helper API. |
| `backend/public/shared-render-engine.js` | Added public OBS-loadable copy of the same shared render engine. |
| `desktop/renderer/index.html` | Loads `shared-render-engine.js` before `gift-menu-designer.js`. |
| `backend/public/gift-menu-overlay.html` | Loads `/shared-render-engine.js` before overlay render code. |
| `desktop/renderer/js/gift-menu-designer.js` | Stores `window.MenuDesignerSharedRenderEngine` reference on the designer instance. |
| `docs/PHASE3B_SHARED_RENDER_ENGINE.md` | This phase documentation. |

## Shared Render API

New global:

```js
window.MenuDesignerSharedRenderEngine
```

Pure helpers defined:

- `renderGift(item, options)`
- `renderText(item, options)`
- `renderMediaAsset(item, options)`
- `renderGoalBar(item, options)`
- `renderGoalCircle(item, options)`
- `renderBossBar(item, options)`
- `renderCombo(item, options)`
- `renderMysteryChest(item, options)`
- `renderTopContributors(item, options)`
- `renderPodium(item, options)`
- `renderGoalList(item, options)`
- `renderByType(item, options)`
- `safeText(value)`

Common options:

```js
{
  mode: "preview" | "overlay",
  scale: 1,
  apiBase: "",
  gifts: [],
  escapeText: true,
  includeDesignerFallback: false
}
```

## Current Integration Level

This phase intentionally does not replace every existing render branch yet.

What is integrated now:

- Designer runtime loads the shared render engine.
- OBS overlay runtime loads the shared render engine.
- Designer instance stores `this.sharedRenderEngine`.
- Both environments now have the same render helper contract available.

What remains intentionally unchanged:

- Existing `renderCanvas()` branch output.
- Existing `gift-menu-overlay.html` branch output.
- Existing widget scaling behavior.
- Existing OBS source setup.
- Existing UI layout and controls.

Reason:

The current preview and overlay renderers are large, inline, and not visually tested by automation yet. Replacing all branches at once would risk changing visible output. The safe next step is to move one item type at a time to the shared helpers, compare preview vs OBS, then delete the old branch.

## Temporary Public Copy

OBS overlay is served from:

```text
backend/public
```

The requested source file is:

```text
desktop/renderer/js/shared-render-engine.js
```

Because there is not yet a shared static asset pipeline between desktop renderer assets and backend public assets, this phase adds:

```text
backend/public/shared-render-engine.js
```

This is a temporary bridge. It must stay synchronized with the desktop copy until the app has one canonical shared asset location.

## Render Contract Direction

Target architecture:

```text
item-registry.js
        |
        v
shared-render-engine.js
        |
        +--> Designer preview
        |
        +--> OBS overlay
```

Future per-type migration should follow this order:

1. Select one type, for example `text`.
2. Make designer preview call the shared helper for that type.
3. Make OBS overlay call the same helper for that type.
4. Compare output.
5. Remove old duplicated branch for that type.
6. Repeat for the next type.

Recommended migration order:

1. `text`
2. `media-asset`
3. `gift`
4. `combo`
5. `goal-bar`
6. `goal-circle`
7. `boss-bar`
8. `mystery-chests`
9. `top-contributors`
10. `podium-contributors`
11. `goal-list`

## Test Results

Syntax checks executed:

```text
node --check desktop/renderer/js/shared-render-engine.js
node --check backend/public/shared-render-engine.js
node --check desktop/renderer/js/gift-menu-designer.js
```

Result:

```text
All syntax checks passed.
```

Manual checks still recommended:

- App starts.
- Menu Designer opens.
- Existing gift items render.
- Existing text/media/widgets render.
- Existing layout saves.
- Save & Export still works.
- OBS overlay loads active layout.
- Browser console has no missing script error for `/shared-render-engine.js`.

## Remaining Risk

The duplicate render branches still exist in this phase. The risk is now reduced structurally because a shared engine is available in both runtimes, but the full duplication is not removed until each item type is migrated through the shared helper and verified.

