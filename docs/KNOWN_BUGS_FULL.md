# Known Bugs & Resolution Log

This document lists detected runtime bugs, rendering discrepancies, and their status or resolutions in the EffectStore application.

---

## 1. Double Scaling on Editor Canvas
- **Type**: Visual Renderer Bug
- **Status**: `RESOLVED`
- **Description**: The editor canvas wrapped widgets inside a `.gmd-visual-scaled-wrapper` applying CSS `transform: scale(scaleX, scaleY)`. However, passing `scaleX` as the scale option to `sharedRenderEngine.renderByType` made the engine multiply font sizes and padding by `scaleX` as well. This resulted in elements scaling down twice, rendering microscopic.
- **Resolution**: Modified `gift-menu-designer.js` to pass `scale: 1` to `renderByType`, letting the outer CSS scale wrapper handle the resizing correctly.

---

## 2. Frozen Border running-light in OBS Studio
- **Type**: OBS Compatibility Bug
- **Status**: `RESOLVED`
- **Description**: OBS Studio uses an older CEF version that does not support the SVG `pathLength` attribute on `<rect>` elements. Because of this, the running light animation remained completely static. Additionally, when using `vector-effect="non-scaling-stroke"`, the dash array repeated based on screen pixels rather than viewBox coordinates, creating dozens of short dashes instead of one.
- **Resolution**: Converted all border `<rect>` elements to `<path>` elements. Added a Node utility inside `shared-render-engine.js` to calculate the perimeter in screen pixels (`2 * (renderedW + renderedH)`) and configured absolute pixel-based dash offsets.

---

## 3. Gift Stack Group Sizing Distortions
- **Type**: Visual Layout Bug
- **Status**: `RESOLVED`
- **Description**: The gift stack group was wrapped in the `gmd-visual-scaled-wrapper` and squished down vertically because of its logical height differences.
- **Resolution**: Separated Bảng gộp (Gift Stack Group) from the generic widget scale branch, letting it render responsively with flexbox layout at `scale: 1` as originally designed.

---

## 4. Stack Group Loop State Wiped on Save
- **Type**: Data Loss / Sync Bug
- **Status**: `RESOLVED`
- **Description**: Clicking "Lưu" or "Lưu & Xuất" inside the app editor canvas forced `itemExport.loopEnabled = false;` in the layouts JSON generator, resetting the streamer's loop choice on every save and preventing the OBS overlay from ever scrolling.
- **Resolution**: Modified the serialization loops in `gift-menu-designer.js` to respect the actual state of `loopEnabled` (`Boolean(item.loopEnabled)`).

---

## 5. Standalone Gift Text Effects Differed from Grouped Gifts
- **Type**: Shared Renderer / CSS Bug
- **Status**: `RESOLVED`
- **Description**: Standalone labels generated animation declarations for Glass, Mystic, Hologram and Light Sweep, but their keyframes and Mystic pseudo-border were scoped to the grouped-gift renderer. The app and OBS output could therefore look static or structurally different.
- **Resolution**: Added the shared label wrapper, effect keyframes and matching background style generation to desktop preview CSS, OBS CSS and both shared render engines.

---

## 6. Garbled Text Settings in Advanced Features
- **Type**: UI Encoding / Duplicate DOM Bug
- **Status**: `RESOLVED`
- **Description**: Moving the standalone text controls into Advanced Features introduced incorrectly encoded Vietnamese labels and left a second hidden control block in the active DOM.
- **Resolution**: Replaced affected labels with encoding-safe output and made the legacy markup inert so it cannot register duplicate control events.

---

## 7. Designer Test Gift Could Reach OBS
- **Type**: Test/Production Isolation Risk
- **Status**: `RESOLVED`
- **Description**: A simulated gift used for designer testing could share behavior with live overlay triggers.
- **Resolution**: The test-reception flow is app-only. OBS effect playback is reserved for real gift events emitted by the TikTok Live connection.

---

## 8. Unrestricted or Heavy Designer Media Uploads
- **Type**: Validation / Performance Risk
- **Status**: `RESOLVED`
- **Description**: Unsupported or oversized media could enter the gift/asset workflow and increase memory, decode and frame-render load.
- **Resolution**: Restrict uploads to PNG, GIF and WebM and optimize accepted media before use where required.
