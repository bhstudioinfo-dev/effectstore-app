# Menu Designer UI Architecture V2

Scope: redesign proposal for the right Inspector Panel only.

Rules:
- Documentation only.
- No code changes.
- No backend changes.
- No OBS export changes.
- No pricing/admin changes.

## Design Goal

The right Inspector Panel should become predictable, role-based, and widget-aware.

Current issue: gift items, text/media items, and goal widgets are mixed into one large inspector flow. Goal/test controls appear as part of widget configuration, and the panel does not clearly separate visual styling, layout, data binding, and simulation.

V2 goal:

- Gift items get editing controls only.
- Goal Board widgets get editing plus data plus test simulation.
- Test simulation is never shown for normal gift items.
- Every inspector type uses consistent tabs and field placement.

## Inspector Types

The inspector should classify the selected layer into one of these types:

| Layer Type | Inspector Mode | Test Panel |
|---|---|---|
| Standard gift item | Gift Inspector | No |
| Text layer | Text Inspector | No |
| Media asset layer | Media Inspector | No |
| `goal-bar` | Goal Widget Inspector | Yes |
| `goal-circle` | Goal Widget Inspector | Yes |
| `combo` | Goal Widget Inspector | Yes |
| `boss-bar` | Goal Widget Inspector | Yes |
| `mystery-chest` / `mystery-chests` | Goal Widget Inspector | Yes |
| `top-contributors` | Goal Widget Inspector | Yes |
| `goal-list` | Goal Widget Inspector | Yes |

## Gift Item Inspector

Gift items should not have test simulation.

Tabs:

```text
[BASIC] [ADVANCED]
```

### Gift BASIC Tab

Purpose: layout, icon, label, and layer placement.

Fields:

| Group | Controls |
|---|---|
| Position | Position X, Position Y |
| Size | Width, Height, Scale |
| Transform | Rotation |
| Icon | Icon Size |
| Text | Text Size, Font, Color, Gap |
| Shape | Border Radius |
| Layer | Layer Order |

Notes:

- Width and Height should be explicit.
- Scale should be a convenience control derived from width/height, not a separate conflicting source of truth.
- Icon Size should control the visual icon inside the gift item if the layer box and icon need separate sizing.
- Layer Order should be expressed as direct controls: send backward, bring forward, send to back, bring to front.
- Gift item BASIC should never include goal progress, coin simulation, combo, mystery unlock, or reset-test controls.

### Gift ADVANCED Tab

Purpose: visual effects and animation.

Controls:

| Category | Controls |
|---|---|
| Glow | Glow enable, glow color, glow intensity |
| Aura | Aura type, aura color, aura speed, aura scale |
| Neon | Neon enable, neon color, neon strength |
| Fire Effect | Fire enable, fire intensity |
| Bubble | Bubble enable, bubble size/speed |
| Motion | Pulse, Float, Shake, Bounce |
| Lifecycle Animation | Entrance Animation, Exit Animation |

Notes:

- Existing animation types can map into this tab.
- Existing aura types can map into Aura/Glow/Neon/Fire/Bubble categories.
- Entrance and Exit Animation may be schema placeholders until runtime supports them.

## Goal Board Widget Inspector

Applies to:

- `goal-bar`
- `goal-circle`
- `combo`
- `boss-bar`
- `mystery-chest`
- `mystery-chests`
- `top-contributors`
- `goal-list`

Tabs:

```text
[BASIC] [ADVANCED] [DATA] [TEST]
```

### Goal BASIC Tab

Purpose: layout and primary presentation.

Common controls:

| Group | Controls |
|---|---|
| Position | X, Y |
| Size | Width, Height, Lock Ratio |
| Transform | Rotation if supported |
| Typography | Title Font Size, Row Font Size, Value Font Size |
| Color | Primary Color, Text Color, Background Color |
| Layer | Layer Order, Lock, Visibility |

Widget-specific examples:

| Widget | Basic Controls |
|---|---|
| `goal-bar` | Bar height, border radius, title text, subtitle text |
| `goal-circle` | Circle color, center icon, number size |
| `combo` | Combo number size, title text |
| `boss-bar` | Boss name, HP bar height, subtitle |
| `mystery-chest` | Title, milestone display style |
| `top-contributors` | Limit count, show avatar, show value |
| `goal-list` | Header text, footer text, icon size, row spacing |

### Goal ADVANCED Tab

Purpose: visual effects and behavior that do not change data.

Controls:

| Category | Controls |
|---|---|
| Background | Hide background, custom background, blur/glass strength |
| Bar Style | Solid, glow pulse, gradient sweep, candy stripe |
| Animation | Pulse, Float, Shake, Bounce |
| Scroll | Vertical auto scroll, scroll speed |
| Shimmer | Row shimmer, shimmer speed |
| Glow | Glow color, glow intensity |
| Theme | Classic, Neon, Gaming, Beauty, Minimal |

Notes:

- Horizontal auto scroll should not be shown unless implemented.
- If horizontal scroll is planned but not implemented, keep it hidden or disabled with a clear unavailable state.

### Goal DATA Tab

Purpose: bind widget data to gifts, targets, contributors, combo count, or list rows.

Common data controls:

| Widget | Data Controls |
|---|---|
| `goal-bar` | Target gift, current count, target count |
| `goal-circle` | Target gift, current count, target count |
| `boss-bar` | Attack gift, current HP/progress, target HP |
| `combo` | Gift trigger, current combo count, combo timeout if supported |
| `mystery-chest` | Target gift, current count, target count, milestone thresholds |
| `top-contributors` | Contributor source, display limit, sort mode |
| `goal-list` | Add/remove goal rows, gift per row, current/target per row |

Notes:

- DATA should contain real stream data fields and manual data overrides.
- DATA should not contain visual effects.
- DATA should not contain test buttons.

### Goal TEST Tab

Purpose: simulation only.

This tab exists only for Goal Board widgets. It must not appear for standard gift items, text layers, or media layers.

Required controls:

```text
Add 100 coins
Add 500 coins
Add 1000 coins
Progress +10%
Progress +25%
Progress +50%
Combo x2
Combo x5
Mystery chest unlock
Reset
Replay animation
```

Recommended behavior by widget:

| Test Action | goal-bar | goal-circle | boss-bar | combo | mystery-chest | top-contributors | goal-list |
|---|---|---|---|---|---|---|---|
| Add 100 coins | Increase current | Increase current | Increase current/HP damage equivalent | Optional | Increase current | Add contributor value | Increase selected/default row |
| Add 500 coins | Increase current | Increase current | Increase current/HP damage equivalent | Optional | Increase current | Add contributor value | Increase selected/default row |
| Add 1000 coins | Increase current | Increase current | Increase current/HP damage equivalent | Optional | Increase current | Add contributor value | Increase selected/default row |
| Progress +10% | Yes | Yes | Yes | No | Yes | No | Selected/all row |
| Progress +25% | Yes | Yes | Yes | No | Yes | No | Selected/all row |
| Progress +50% | Yes | Yes | Yes | No | Yes | No | Selected/all row |
| Combo x2 | No | No | No | Yes | No | No | No |
| Combo x5 | No | No | No | Yes | No | No | No |
| Mystery chest unlock | No | No | No | No | Yes | No | No |
| Reset | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Replay animation | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

Notes:

- Unsupported test buttons can be hidden per widget or shown disabled with a short tooltip.
- Test actions should mutate only preview/session state unless the user explicitly saves.
- If test actions save to layout for OBS preview sync, the UI should label that behavior clearly.

## Tab Visibility Rules

| Selection | Tabs |
|---|---|
| No selection | Empty state |
| One gift item | BASIC, ADVANCED |
| Multiple gift items | BASIC, ADVANCED with shared controls only |
| Text layer | BASIC, ADVANCED |
| Media layer | BASIC, ADVANCED |
| Goal widget | BASIC, ADVANCED, DATA, TEST |
| Multiple mixed layer types | BASIC shared layout controls only, no TEST |

## Recommended Inspector Component Model

Future implementation should use a schema-driven structure:

```text
InspectorShell
  InspectorTabs
  InspectorSection
  InspectorField
  InspectorControl
```

Each layer type should provide an inspector schema:

```text
gift.inspector = {
  basic: [...],
  advanced: [...]
}

goalBar.inspector = {
  basic: [...],
  advanced: [...],
  data: [...],
  test: [...]
}
```

This keeps field definitions out of one giant render function.

## Event Architecture

Inspector controls should dispatch typed commands, not directly mutate random layer fields.

Recommended command examples:

```text
updateLayerField(layerId, key, value)
updateLayerFields(layerId, patch)
moveLayerForward(layerId)
moveLayerBackward(layerId)
simulateGoalCoins(layerId, amount)
simulateGoalProgress(layerId, percent)
simulateCombo(layerId, multiplier)
simulateMysteryUnlock(layerId)
resetWidgetTestState(layerId)
replayWidgetAnimation(layerId)
```

## Data Separation

The inspector should separate four concerns:

| Concern | Examples |
|---|---|
| Layout | X, Y, width, height, scale, rotation |
| Style | color, font, glow, aura, border radius |
| Data | target gift, current count, target count, contributor list |
| Test | add coins, progress percent, reset, replay |

This prevents gift items from receiving goal-specific testing controls.

## Migration Plan

Phase 1:
- Keep existing UI layout.
- Introduce tab model internally.
- Ensure gift item inspector only shows BASIC/ADVANCED.
- Move current test buttons into TEST tab for goal widgets only.

Phase 2:
- Convert hardcoded inspector HTML into schema sections.
- Create widget-specific schemas for each goal widget.
- Add disabled/hidden behavior for unsupported test actions.

Phase 3:
- Share inspector field components across gift, text, media, and goal widgets.
- Add command-based update layer API.
- Remove legacy direct DOM onclick handlers from inspector HTML.

## Non-Goals

Do not include in this redesign:

- Marketplace pricing UI changes.
- Admin dashboard changes.
- OBS export scaling changes.
- Backend persistence changes.
- New payment/subscription behavior.
- Full canvas engine refactor.

## Summary

The right Inspector Panel V2 should be split by layer type and task:

- Gift items: `BASIC`, `ADVANCED`.
- Goal widgets: `BASIC`, `ADVANCED`, `DATA`, `TEST`.
- Test tools belong only to Goal Board widgets.
- Visual editing, data binding, and simulation should be separate tabs.

This gives Menu Designer a stable long-term UI model without changing backend, OBS export, or marketplace behavior.
