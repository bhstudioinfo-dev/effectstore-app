# Phase 3A - Architecture Extraction

Project: BH Studio / EffectStore  
Module: Menu Designer  
Goal: extract architecture contracts without changing visible app behavior.

## Files Changed

| File | Change |
| --- | --- |
| `desktop/renderer/js/item-registry.js` | Added central item type registry. |
| `desktop/renderer/js/coordinate-engine.js` | Added shared coordinate conversion engine. |
| `desktop/renderer/index.html` | Loads registry and coordinate engine before `gift-menu-designer.js`. |
| `desktop/renderer/js/gift-menu-designer.js` | Adds references to the new globals and delegates `logicalToStage()` / `stageToLogical()` when available. Existing fallback logic remains. |
| `docs/shared-render-contract.md` | Documents shared renderer rules for Designer Preview and OBS Overlay. |
| `docs/PHASE3A_ARCHITECTURE_EXTRACTION.md` | This phase summary. |

## Item Registry

New file:

```text
desktop/renderer/js/item-registry.js
```

Global exposed:

```js
window.MenuDesignerItemRegistry
```

Supported item types:

- `gift`
- `text`
- `media-asset`
- `goal-bar`
- `goal-circle`
- `boss-bar`
- `combo`
- `mystery-chests`
- `top-contributors`
- `podium-contributors`
- `goal-list`

Each type defines:

```js
{
  type,
  defaults,
  inspectorTabs,
  renderContract,
  exportContract
}
```

This phase does not yet drive rendering from the registry. It creates the stable contract first so future extraction can move one item type at a time.

## Coordinate Engine

New file:

```text
desktop/renderer/js/coordinate-engine.js
```

Global exposed:

```js
window.MenuDesignerCoordinateEngine
```

Functions added:

- `stageToLogical(item, aspectRatio)`
- `logicalToStage(item, aspectRatio)`
- `safeAreaToExport(item, aspectRatio)`
- `exportScaling(aspectRatio)`
- `getConfig(aspectRatio)`
- `getSafeArea(aspectRatio)`
- `getCanvasSize(aspectRatio)`
- `getExportSize(aspectRatio)`

The current designer methods now delegate to this engine:

```js
logicalToStage(item)
stageToLogical(item)
```

Both methods keep their original inline fallback logic. If the new helper fails to load, current behavior should continue.

## Shared Render Contract

New file:

```text
docs/shared-render-contract.md
```

It defines the rule:

```text
Designer Preview = OBS Overlay
```

The document captures:

- item type contract
- coordinate contract
- widget scaled-wrapper rules
- OBS match requirements
- checklist for adding new item types

## Behavior Change Assessment

Expected visible behavior change:

```text
None
```

This phase does not:

- add product features
- redesign UI
- change pricing
- change admin dashboard
- change payment
- change widget rendering output
- change OBS browser source setup

The only runtime wiring change is that existing coordinate methods delegate to the new coordinate engine when available.

## Why Fallback Logic Remains

The project currently uses plain script loading instead of ES modules. Keeping fallback code inside `gift-menu-designer.js` reduces boot risk:

- If `coordinate-engine.js` is not loaded, existing formulas remain available.
- Existing callsites still call the same method names.
- No migration is required for current code paths.

## What Remains Unfinished

This phase intentionally does not complete the full renderer extraction.

Still pending:

- Move widget HTML rendering into shared pure render helpers.
- Make `renderCanvas()` consult `item-registry.js` for reference dimensions.
- Make `gift-menu-overlay.html` consult the same render contracts.
- Normalize saved items with registry defaults on load.
- Add render equivalence tests for preview vs overlay.

## Test Results

Executed syntax checks:

```text
node --check desktop/renderer/js/item-registry.js
node --check desktop/renderer/js/coordinate-engine.js
node --check desktop/renderer/js/gift-menu-designer.js
```

Result:

```text
All syntax checks passed.
```

Manual checks:

- App starts.
- Menu Designer opens.
- Existing layout loads.
- Drag/drop gifts still works.
- Existing widgets still render.
- Save still works.
- Save & Export still works.
- OBS overlay still loads the active layout.
