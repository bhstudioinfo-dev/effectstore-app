# Phase 3C - Inspector Engine Extraction

Project: BH Studio / EffectStore  
Module: Menu Designer  
Goal: prepare removal of giant inspector conditional logic without changing visible behavior.

## Files Changed

| File | Change |
| --- | --- |
| `desktop/renderer/js/inspector-engine.js` | Added pure inspector render helper API. |
| `desktop/renderer/index.html` | Loads `inspector-engine.js` before `gift-menu-designer.js`. |
| `desktop/renderer/js/gift-menu-designer.js` | Stores `window.MenuDesignerInspectorEngine` reference on the designer instance. |
| `docs/PHASE3C_INSPECTOR_ENGINE.md` | This phase documentation. |

## New Global

```js
window.MenuDesignerInspectorEngine
```

## Inspector Render Helpers

The new engine defines:

- `renderGiftInspector(item)`
- `renderTextInspector(item)`
- `renderMediaInspector(item)`
- `renderGoalBarInspector(item)`
- `renderGoalCircleInspector(item)`
- `renderBossBarInspector(item)`
- `renderComboInspector(item)`
- `renderMysteryInspector(item)`
- `renderTopContributorsInspector(item)`
- `renderPodiumInspector(item)`
- `renderGoalListInspector(item)`
- `renderInspectorForItem(item)`

Each helper returns:

```js
{
  type,
  tabs,
  panels,
  html
}
```

## Tab Contract

Supported tabs:

- `basic`
- `advanced`
- `data`
- `test`

Current mapping:

| Item Type | Tabs |
| --- | --- |
| `gift` | `basic`, `advanced` |
| `text` | `basic`, `advanced` |
| `media-asset` | `basic`, `advanced` |
| `goal-bar` | `basic`, `advanced`, `data`, `test` |
| `goal-circle` | `basic`, `advanced`, `data`, `test` |
| `boss-bar` | `basic`, `advanced`, `data`, `test` |
| `combo` | `basic`, `advanced`, `data`, `test` |
| `mystery-chests` | `basic`, `advanced`, `data`, `test` |
| `top-contributors` | `basic`, `advanced`, `data`, `test` |
| `podium-contributors` | `basic`, `advanced`, `data`, `test` |
| `goal-list` | `basic`, `advanced`, `data`, `test` |

## Behavior Change Assessment

Expected visible behavior change:

```text
None
```

This phase does not:

- redesign the right inspector panel
- remove existing inspector HTML
- change existing inspector event handlers
- change pricing UI
- change admin dashboard
- change OBS export

The existing `renderInspector()` and `renderGoalBoardInspector()` remain active. This is deliberate: replacing the entire inspector in one phase would likely change UI behavior because the current inspector contains many inline event bindings, custom selects, and widget-specific controls.

## Why This Is Still Useful

Before this phase, there was no isolated inspector contract. All inspector behavior lived directly inside `gift-menu-designer.js`.

After this phase:

- A pure inspector engine exists.
- Every known item type has a named inspector render helper.
- Future dynamic tabs have a stable contract.
- The designer can now migrate one inspector type at a time.

## Safe Migration Plan

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

For each type:

1. Render current inspector and new engine output side by side in development.
2. Match visible controls.
3. Wire existing update handlers to `data-inspector-key`.
4. Switch only that item type to the engine.
5. Test selection, update, save, undo/redo, and OBS sync.
6. Delete the old branch for that item type.

## Test Results

Syntax checks executed:

```text
node --check desktop/renderer/js/inspector-engine.js
node --check desktop/renderer/js/gift-menu-designer.js
```

Result:

```text
All syntax checks passed.
```

Manual checks still recommended:

- App starts.
- Menu Designer opens.
- Selecting gift item still shows current inspector.
- Selecting text item still shows current inspector.
- Selecting goal widget still shows current inspector.
- Existing controls still update items.
- Save still works.

## Remaining Risk

The giant inspector functions still exist in this phase. The risk is reduced because the target architecture now exists, but the code size risk remains until each type is migrated and old conditional branches are removed.

