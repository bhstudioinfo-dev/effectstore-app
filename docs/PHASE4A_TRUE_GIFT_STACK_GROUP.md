# PHASE 4A - True Gift Stack Group

## Files Changed

- `desktop/renderer/js/gift-menu-designer.js`
- `desktop/renderer/js/item-registry.js`
- `desktop/renderer/js/shared-render-engine.js`
- `desktop/renderer/js/inspector-engine.js`
- `backend/public/gift-menu-overlay.html`
- `backend/public/shared-render-engine.js`
- `docs/PHASE4A_TRUE_GIFT_STACK_GROUP.md`

## Data Model

`gift-stack-group` is now a true root layer with nested child gift data.

```js
{
  id: "stack_...",
  type: "gift-stack-group",
  name: "Nhom qua",
  x, y, width, height,
  layoutDirection: "vertical",
  gap: 10,
  iconSize: 64,
  textSize: 14,
  textPosition: "bottom",
  textGap: 4,
  textColor: "#ffffff",
  showName: true,
  loopEnabled: false,
  loopDirection: "vertical",
  loopSpeed: 15,
  children: [
    {
      ...originalGiftItemData,
      relativeX,
      relativeY
    }
  ]
}
```

Legacy controller layouts that still contain `itemRefs` are migrated in memory during load:

- referenced gift root items are copied into `children`
- referenced gift root items are removed from the current root `this.items`
- saved database layouts are not deleted or rewritten until the user saves again

## Create Group Flow

1. User selects at least two visible, unlocked root gift items.
2. User clicks `Gop qua`.
3. Designer computes the bounding box of selected gifts.
4. Designer creates one root `gift-stack-group` item.
5. Selected gifts are copied into `group.children` with `relativeX` and `relativeY`.
6. Selected gifts are removed from root `this.items`.
7. Group is inserted into root `this.items`, selected, rendered, and pushed to history.

## Ungroup Flow

1. User selects a `gift-stack-group`.
2. User clicks `Bo gop`.
3. Designer computes current visual child positions from group layout settings.
4. Group is removed from root `this.items`.
5. Children are restored as root gift items at their current visual positions.
6. Restored gifts are selected, z-index order is normalized, canvas/layers/inspector re-render, and history is pushed.

## Inspector Controls

When a `gift-stack-group` is selected, the inspector exposes:

- Huong sap xep: vertical / horizontal
- Khoang cach qua
- Kich thuoc icon
- Kich thuoc chu
- Vi tri chu: bottom / top / left / right
- Khoang cach chu
- Mau chu
- Hien ten qua
- Bat cuon
- Huong cuon
- Toc do cuon
- Bo gop

Loop fields are present, but loop animation is intentionally disabled for this phase. The UI states: `Tinh nang cuon se hoan thien o phase tiep theo.`

## Preview Behavior

- The group renders as one canvas item.
- Children render inside the group viewport.
- Children no longer appear as separate root layers.
- Group can be moved and resized as a single layer.
- Child spacing, direction, icon size, text size, text position, text gap, text color, and name visibility are applied through shared render helpers.

## OBS Behavior

- OBS overlay no longer hides `gift-stack-group`.
- `backend/public/gift-menu-overlay.html` renders the group as one positioned export item.
- Nested children are rendered with `MenuDesignerSharedRenderEngine.renderGiftStackGroup()`.
- `backend/public/shared-render-engine.js` is synchronized with the desktop shared renderer.
- Export scaling preserves group position, size, children, `gap`, `iconSize`, `textSize`, and `textGap`.

## Remaining Limitations

- Infinite loop scrolling is not implemented yet.
- Children inside a grouped layer are not individually selectable from the root layer panel.
- Ungroup restores children based on the current auto-layout visual positions, not the original pre-group manual arrangement.
- Legacy `itemRefs` support is migration-only and should not be used for new group behavior.

## Test Checklist

- `node --check desktop/renderer/js/gift-menu-designer.js` passed.
- `node --check desktop/renderer/js/item-registry.js` passed.
- `node --check desktop/renderer/js/shared-render-engine.js` passed.
- `node --check desktop/renderer/js/inspector-engine.js` passed.
- `node --check backend/public/shared-render-engine.js` passed.
- Manual app startup not run in this pass.
- Manual Menu Designer create group / ungroup should be verified in the running Electron app.
- Manual OBS overlay visual comparison should be verified after saving/exporting a grouped layout.
