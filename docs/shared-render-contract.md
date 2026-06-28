# Shared Render Contract

Project: BH Studio / EffectStore  
Module: Menu Designer / Gift Menu Overlay  
Purpose: define the rules that must keep Designer Preview and OBS Overlay visually identical.

## Core Rule

Designer Preview and OBS Overlay must render from the same item contract.

The item data saved in `layout.items` and `layout.exportedItems` must be sufficient for both renderers. A feature is not complete if it only renders correctly in the designer or only in OBS.

## Item Type Contract

Every supported item type must have a registry entry in:

```text
desktop/renderer/js/item-registry.js
```

Each item type contract contains:

```js
{
  type,
  defaults,
  inspectorTabs,
  renderContract,
  exportContract
}
```

Required supported types:

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

## Coordinate Contract

Coordinate conversion must go through:

```text
desktop/renderer/js/coordinate-engine.js
```

Supported helpers:

- `logicalToStage(item, aspectRatio)`
- `stageToLogical(item, aspectRatio)`
- `safeAreaToExport(item, aspectRatio)`
- `exportScaling(aspectRatio)`

Coordinate meanings:

| Field | Meaning |
| --- | --- |
| `x`, `y` in designer items | Stage position in designer canvas pixels |
| `width`, `height` in designer items | Stage size in designer canvas pixels |
| `w`, `h` in widget templates | Logical/export-space dimensions before conversion |
| `x`, `y`, `width`, `height` in `exportedItems` | OBS export-space coordinates |

Aspect ratio configurations:

| Ratio | Stage | Safe Area | Export |
| --- | --- | --- | --- |
| `9:16` | `720 x 960` | `360 x 640` | `1080 x 1920` |
| `16:9` | `960 x 720` | `640 x 360` | `1920 x 1080` |
| `1:1` | `900 x 900` | `480 x 480` | `1080 x 1080` |

## Render Contract

Every item type must specify:

- renderer family
- preview branch
- overlay branch
- whether it uses the scaled wrapper
- whether it supports resize
- whether it supports rotation
- default reference size for widget-like items

Gift items:

- Render as standard gift layers.
- Use direct stage dimensions.
- Support aura, motion, label position, resize, and rotation.

Widget-like items:

- Render through a reference-size wrapper.
- Use `gmd-visual-scaled-wrapper`.
- Must define a stable reference size.
- Must be implemented in both designer preview and overlay.

## OBS Match Rule

For any item type:

1. Designer preview must render the item.
2. Save must preserve required fields.
3. Export must create valid `exportedItems`.
4. OBS overlay must render the same type.
5. CSS class names and animation names must match between preview and overlay.
6. Text escaping and asset URL normalization must be consistent.

## Adding New Item Types

Before adding a new type:

1. Add registry contract.
2. Define defaults.
3. Define reference dimensions if widget-like.
4. Define inspector tabs.
5. Define export behavior.
6. Add designer renderer branch.
7. Add overlay renderer branch.
8. Add save/load normalization if needed.
9. Test designer preview and OBS overlay side by side.

## Current Limitation

This phase only introduces the registry and coordinate engine extraction. It does not yet fully remove duplicate renderer code from `gift-menu-designer.js` and `gift-menu-overlay.html`.

The next safe phase should extract shared pure render helpers so both preview and OBS call the same renderer contract.

