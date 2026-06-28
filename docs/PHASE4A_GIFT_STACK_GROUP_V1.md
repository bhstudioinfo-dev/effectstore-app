# Phase 4A - Gift Stack Group V1

Project: BH Studio / EffectStore  
Module: Menu Designer  
Feature: Gift Stack Group V1

## Files Changed

| File | Change |
| --- | --- |
| `desktop/renderer/js/item-registry.js` | Added `gift-stack-group` item contract. |
| `desktop/renderer/js/shared-render-engine.js` | Added `renderGiftStackGroup()` and type dispatch entry. |
| `backend/public/shared-render-engine.js` | Added OBS public copy support for `renderGiftStackGroup()`. |
| `desktop/renderer/js/inspector-engine.js` | Added `renderGiftStackGroupInspector()` contract. |
| `desktop/renderer/js/gift-menu-designer.js` | Added create stack group action, stack data model, canvas controller render, move/resize behavior, child layout, load normalization, and inspector controls. |
| `backend/public/gift-menu-overlay.html` | Added `gift-stack-group` as a known overlay controller type and hides it in OBS output. |
| `docs/PHASE4A_GIFT_STACK_GROUP_V1.md` | This documentation. |

## Data Model

V1 stack group is a parent controller layer. Child gifts remain normal root items in `this.items`.

```js
{
  id: "stack_...",
  type: "gift-stack-group",
  name: "Gift Stack Group",
  itemRefs: ["itm_1", "itm_2", "itm_3"],
  layoutDirection: "vertical",
  gap: 10,
  x: 100,
  y: 100,
  width: 120,
  height: 360,
  rotation: 0,
  zIndex: 10,
  visible: true,
  locked: false
}
```

Design decision:

- The group stores `itemRefs`, not nested child objects.
- Child gift items remain individually selectable/editable.
- Save/load keeps the group controller and the child items in the flat `items` array.
- OBS overlay hides the controller layer and renders only the child gift items.

## User Flow

1. User selects multiple gift items.
2. User clicks `Stack` / `Create Stack Group`.
3. Designer creates one `gift-stack-group` controller layer.
4. Selected gifts are linked through `itemRefs`.
5. Gifts are arranged vertically by default.
6. User can select the group layer to move or resize the stack.
7. User can clear selection and select individual child gifts for normal editing.

## V1 Behavior

Implemented:

- Create stack group from selected gift items.
- Store `itemRefs`.
- Default `layoutDirection: "vertical"`.
- Default `gap: 10`.
- Move group as one object.
- Resize group as one object.
- Re-layout children inside group on resize.
- Keep child items individually editable.
- Save/load preserves group controller.
- History captures group creation and drag changes.
- Layer panel continues to show flat layers.
- OBS overlay does not render the controller layer.

Not implemented in V1:

- Loop animation.
- Vertical loop.
- Horizontal loop.
- Auto scrolling.
- Realtime livestream event binding.
- Advanced animations.
- Nested child-only layer panel.
- Ungroup command.

## Migration Strategy

V1 uses non-destructive migration:

- Selected gifts are not removed.
- Selected gifts are not converted into nested children.
- A new controller item is added.
- The controller references existing gift IDs.
- Undo restores the previous state through the existing history stack.

This avoids breaking:

- existing gift rendering
- gift inspector
- save/load format
- OBS export
- individual gift editing
- layer panel assumptions

## Preview / OBS Strategy

Designer preview:

- Renders a dashed controller rectangle for `gift-stack-group`.
- The rectangle is only an editor affordance.
- Gift child items still render through the normal gift renderer.
- When the group is not selected, it uses `pointer-events: none` so child gifts remain clickable.

OBS overlay:

- Treats `gift-stack-group` as a known controller type.
- Sets the controller element to `display: none`.
- Renders child gift items normally from exported data.

Result:

```text
OBS output matches the actual exported visible gift items.
```

The editor-only controller outline is intentionally not exported visually.

## Test Results

Syntax checks executed:

```text
node --check desktop/renderer/js/gift-menu-designer.js
node --check desktop/renderer/js/item-registry.js
node --check desktop/renderer/js/shared-render-engine.js
node --check backend/public/shared-render-engine.js
node --check desktop/renderer/js/inspector-engine.js
```

Result:

```text
All syntax checks passed.
```

Manual checks still recommended:

- App starts.
- Menu Designer opens.
- Add multiple gift items.
- Select multiple gifts.
- Click `Stack`.
- Stack group appears in layer panel.
- Group moves child gifts together.
- Group resize re-layouts child gifts.
- Child gift can still be selected after clearing group selection.
- Save layout.
- Reload layout.
- Save & Export.
- OBS overlay still renders child gifts and does not show the controller rectangle.

