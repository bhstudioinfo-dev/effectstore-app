# Gift Stack Group Feature Design

Project: BH Studio / EffectStore  
Module: Gift Menu Designer  
Feature name: Gift Stack Group / Nhom qua cuon  
Status: Design only, not implemented

## 1. Current Existing `groupId` Logic

The current Menu Designer already has a lightweight grouping mechanism based on `groupId`.

Observed behavior:

- Root canvas objects live in `this.items`.
- Multi-selection is tracked with `selectedIds`.
- Some template-created items share the same `groupId`.
- During canvas move/resize logic, items with the same `groupId` can be included in the same movement operation.
- Rendering still treats every grouped item as an independent root layer.
- Save/export still serializes each grouped item as a separate item.
- The layer panel still thinks in terms of individual canvas items, not a true parent group.

Current `groupId` is best understood as template peer metadata:

```js
[
  { id: "gift_1", type: "gift", groupId: "template_abc" },
  { id: "text_1", type: "text", groupId: "template_abc" },
  { id: "media_1", type: "media-asset", groupId: "template_abc" }
]
```

It is useful for keeping template pieces related, but it is not a real container layer.

## 2. Why `groupId` Alone Is Not Enough

`groupId` should not be reused as the core model for Gift Stack Group.

Reasons:

- It does not create a parent item.
- It does not preserve ordered child structure.
- It cannot define a viewport for clipping or scrolling.
- It cannot own layout rules such as vertical, horizontal, gap, alignment, or shared icon size.
- It cannot render as one layer in the layer panel.
- It cannot be resized as a single widget with predictable internal layout.
- It cannot guarantee OBS overlay output matches designer preview.
- It risks breaking existing template grouping behavior.
- It cannot safely support infinite loop animation because animation needs a track, viewport, duplicated children, and direction-aware CSS.

Gift Stack Group should therefore be a real root canvas item:

```js
{
  type: "gift-stack-group",
  children: []
}
```

The existing `groupId` may still exist on the stack item if the whole stack becomes part of a template, but child membership should not be represented by `groupId`.

## 3. Proposed Data Model

Recommended root item shape:

```json
{
  "id": "stack_1720000000000",
  "type": "gift-stack-group",
  "name": "Nhom qua cuon",
  "x": 120,
  "y": 160,
  "width": 320,
  "height": 520,
  "w": 960,
  "h": 1560,
  "rotation": 0,
  "zIndex": 10,
  "visible": true,
  "locked": false,
  "layout": {
    "direction": "vertical",
    "gap": 12,
    "alignment": "center",
    "padding": 0
  },
  "giftStyle": {
    "iconSize": 64,
    "showName": true,
    "textSize": 14,
    "textColor": "#f7cb64",
    "fontFamily": "Inter",
    "textGap": 4,
    "borderRadius": 0
  },
  "loop": {
    "enabled": false,
    "direction": "vertical",
    "speed": 18,
    "pauseOnHover": false
  },
  "children": [
    {
      "id": "child_rose",
      "sourceItemId": "gift_rose_old",
      "giftId": "rose",
      "name": "Rose",
      "iconUrl": "/assets/gift-icons/Rose.png",
      "showName": true
    }
  ],
  "version": 1
}
```

Notes:

- Use `children`, not nested `items`, to avoid confusion with root canvas `items`.
- `w` and `h` should represent reference dimensions for export/render scaling, following the existing widget pattern.
- `layout.direction` controls static arrangement.
- `loop.direction` controls animation direction. It can default to `layout.direction`.
- `giftStyle` is group-level style in phase 1.
- Per-child overrides can be added later, but should not be required for the first implementation.
- Existing database model can likely store this without schema migration because layout `items` and `exportedItems` are flexible arrays.

## 4. Proposed Inspector Controls

When selected item type is `gift-stack-group`, the right inspector should show controls specific to this parent widget.

### Basic

| Control | Purpose |
| --- | --- |
| Position X | Move stack group horizontally |
| Position Y | Move stack group vertically |
| Width | Resize group viewport width |
| Height | Resize group viewport height |
| Rotation | Rotate whole group |
| Layout Direction | Vertical or horizontal |
| Alignment | Start, center, end |
| Gap | Space between gifts |
| Icon Size | Shared gift icon size |
| Text Size | Shared gift label size |
| Font | Gift label font |
| Text Color | Gift label color |
| Text Gap | Gap between icon and label |
| Border Radius | Optional icon rounding |
| Layer Order | Z-index / layer position |

### Advanced

| Control | Purpose |
| --- | --- |
| Loop Enabled | Enables infinite scrolling |
| Loop Direction | Vertical or horizontal |
| Loop Speed | Animation duration or pixels per second |
| Clip Overflow | Keeps children inside group viewport |
| Pause On Hover | Optional designer-only preview behavior |

### Content

The group also needs a child gift list.

Recommended controls:

- Reorder child gift up/down.
- Remove child gift from group.
- Show gift name and icon preview.
- Ungroup back to independent gift items.

This content panel can be delayed until after the first stable grouping implementation. The minimum viable version can create groups from selected gifts and allow uniform style editing.

## 5. Canvas Render Behavior

Designer canvas should render Gift Stack Group as one root canvas item.

Recommended structure:

```html
<div class="gmd-item gmd-gift-stack-group">
  <div class="gmd-stack-viewport">
    <div class="gmd-stack-track gmd-stack-vertical">
      <div class="gmd-stack-gift">...</div>
      <div class="gmd-stack-gift">...</div>
    </div>
  </div>
</div>
```

Static mode:

- Render one track.
- Use flex column for vertical layout.
- Use flex row for horizontal layout.
- Apply `gap`, `alignment`, `iconSize`, `textSize`, `textColor`, and font from `giftStyle`.

Loop mode:

- Duplicate children in the render track:

```js
const renderChildren = loop.enabled
  ? [...children, ...children]
  : children;
```

- Vertical loop animates `translateY`.
- Horizontal loop animates `translateX`.
- Viewport uses `overflow: hidden`.
- Track animation must be deterministic so overlay and designer look the same.

Canvas interaction:

- Dragging moves the parent group only.
- Resizing changes the parent viewport only.
- Child gifts are not individually draggable in phase 1.
- Layer panel shows one layer named `Nhom qua cuon`.
- Selection handles belong to the parent group.

Important:

- Do not reuse the old `groupId` movement expansion for child items.
- The group is a single item in `this.items`.
- Children only exist inside `item.children`.

## 6. Overlay Render Behavior

`backend/public/gift-menu-overlay.html` should eventually add a renderer branch for:

```js
item.type === "gift-stack-group"
```

Overlay rendering must mirror designer rendering.

Recommended rules:

- Use the same data fields as designer.
- Use the same viewport/track/child DOM structure.
- Use the same class names or shared CSS contract.
- Use exported position and size from `exportedItems`.
- Apply the existing widget-style reference scaling strategy where possible.

Recommended CSS concepts:

```css
.gmd-stack-viewport {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.gmd-stack-track {
  display: flex;
}

.gmd-stack-track.vertical {
  flex-direction: column;
}

.gmd-stack-track.horizontal {
  flex-direction: row;
}

@keyframes gmdGiftStackLoopVertical {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}

@keyframes gmdGiftStackLoopHorizontal {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```

The overlay should not attempt to reconstruct groups from `groupId`. It should render the parent `gift-stack-group` object directly.

## 7. Save / Load / Export Behavior

### Save

Saved layout should preserve the parent object and nested children:

```js
items: [
  {
    type: "gift-stack-group",
    children: [...]
  }
]
```

The current flexible array model should be enough for initial persistence.

### Load

Load logic should normalize missing fields:

- `layout.direction`: default `vertical`
- `layout.gap`: default `8`
- `layout.alignment`: default `center`
- `giftStyle.iconSize`: default `64`
- `giftStyle.textSize`: default `14`
- `giftStyle.textColor`: default `#ffffff`
- `loop.enabled`: default `false`
- `loop.direction`: default to `layout.direction`
- `loop.speed`: default `18`
- `children`: default `[]`

### Export

Export should scale the parent group exactly like other widget-like items:

- Scale `x`
- Scale `y`
- Scale `width`
- Scale `height`
- Preserve `w` and `h` reference dimensions
- Preserve `children`, `layout`, `giftStyle`, and `loop`

Recommended approach:

- Keep child style values in the group's reference coordinate system.
- Let the same visual wrapper scaling used by other widgets scale internal contents.
- Avoid separately scaling every child style field during export unless the current renderer architecture requires it.

This reduces mismatch between designer and OBS overlay.

## 8. Migration Strategy From Selected Gifts

Expected flow:

1. User selects multiple regular gift items.
2. User clicks `Tao nhom qua`.
3. Designer validates selected items.
4. Designer computes a bounding box around selected gifts.
5. Designer creates one `gift-stack-group` root item.
6. Designer converts each selected gift into a child object.
7. Designer removes the original selected gifts from root `this.items`.
8. Designer inserts the new stack item into `this.items`.
9. Designer selects the new stack item.
10. Designer pushes history so undo restores the original independent gifts.

Sorting:

- Vertical group: sort by `y`, then `x`.
- Horizontal group: sort by `x`, then `y`.

Initial group dimensions:

- `x`: minimum selected x
- `y`: minimum selected y
- `width`: selected bounding box width
- `height`: selected bounding box height
- `zIndex`: maximum selected zIndex or next available zIndex

Handling existing `groupId`:

- Phase 1 should avoid converting template-linked groups automatically.
- If selected gifts have `groupId`, show a confirmation or block conversion with a clear message.
- The new stack item may receive a new id and should not depend on the old child `groupId`.
- Existing `groupId` template behavior must remain unchanged for non-stack items.

Ungroup strategy:

- Later implementation should provide `Ungroup`.
- Ungroup should recreate root gift items from `children`.
- Recreated positions should be calculated from the current group position, layout direction, gap, and style.

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Designer and overlay render drift | OBS output does not match preview | Share DOM/CSS contract and test both renderers |
| Export scaling mismatch | Icons/text appear wrong in OBS | Use widget reference scaling consistently |
| Breaking existing `groupId` templates | Existing saved templates move/render incorrectly | Keep stack membership separate from `groupId` |
| Layer panel ambiguity | Children may appear as root layers accidentally | Show stack as one root layer in phase 1 |
| Complex child editing | Dragging individual children inside group can destabilize canvas math | Delay child drag editing; use inspector list first |
| Loop seam is visible | Infinite scroll looks broken | Duplicate children and tune track size/duration |
| Empty or one-child loop | Animation looks pointless or broken | Disable loop preview when child count is less than 2 |
| Mixed effects from original gifts | Conversion may lose per-item styling | Phase 1 uses group-level style; later add child overrides |
| Old overlay does not recognize new type | Stack disappears in OBS if renderer is not updated | Add overlay support in same implementation phase as export |
| Large child lists | Animation performance may degrade | Limit child count or use CSS transform-only animation |

## 10. Safe Implementation Phases

### Phase A: Data Contract

- Add no UI first.
- Define `gift-stack-group` defaults.
- Add normalization helper for loaded layouts.
- Add fixture data for local manual testing.

### Phase B: Renderer Support

- Add designer render branch for `gift-stack-group`.
- Add overlay render branch for `gift-stack-group`.
- Add matching CSS for viewport, track, gift row/card, and loop animation.
- Verify static vertical and horizontal layouts first.

### Phase C: Export Support

- Ensure `saveLayout` and `saveAndExport` preserve nested `children`.
- Ensure `exportedItems` keeps the parent item shape.
- Confirm OBS overlay renders exported stack exactly like designer.

### Phase D: Create Group From Selection

- Add `Tao nhom qua` command.
- Convert selected gifts into one parent stack item.
- Remove original selected gifts only after the new parent item is created.
- Push history before and after conversion.
- Select the new parent group.

### Phase E: Inspector Controls

- Add Basic controls for direction, gap, icon size, text size, color, font, and alignment.
- Add Advanced controls for loop enabled, loop direction, and speed.
- Keep child editing minimal.

### Phase F: Layer Panel Integration

- Show stack group as one root layer.
- Add clear label and icon.
- Support move up/down z-index behavior on the parent only.

### Phase G: Ungroup And Child Management

- Add ungroup.
- Add child reorder.
- Add remove child.
- Add optional child-level style overrides only after group-level styling is stable.

### Phase H: Template Compatibility

- Allow `gift-stack-group` to be saved as part of templates.
- Keep `groupId` only as template peer metadata for root items.
- Do not use `groupId` as child membership.

## Recommended Initial Test Checklist

- Create two gifts, convert to vertical stack, save, reload.
- Create three gifts, convert to horizontal stack, save, reload.
- Drag stack as one item.
- Resize stack as one item.
- Change gap, icon size, text size, and color.
- Enable vertical loop.
- Enable horizontal loop.
- Save and export to OBS.
- Confirm overlay matches designer preview.
- Confirm old `groupId` templates still move/render as before.
- Confirm undo restores independent gifts after group creation.
- Confirm old layouts without `gift-stack-group` still load normally.

