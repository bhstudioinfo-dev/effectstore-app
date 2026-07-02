# Current Development & Project State

This document catalogs the current development status, stability of modules, technical debt, and areas requiring precaution in the EffectStore codebase.

---

## 1. Module Stability Index

| Module / System | Stability | Notes |
| :--- | :--- | :--- |
| **Authentication & License Validation** | `STABLE` | Fully operational, validates local hardware machineId. |
| **Express REST APIs** | `STABLE` | Routes and middleware run smoothly, mongoose models integrate cleanly. |
| **TikTok Live Connection Engine** | `STABLE` | Receives live gift trigger feeds. |
| **OBS WebSocket connection** | `STABLE` | Auto-detects scenes and toggles source visibilities. |
| **Menu Designer Layout Canvas** | `STABLE` | Canvas drags, coordinate adjustments, layering, and zooming work. |
| **Shared Render Engine** | `STABLE` | Standardized rendering between App Editor and OBS Overlay. |
| **Seamless Loop Marquee (Stack Group)**| `STABLE` | Repeats items 6 times and translates by `-16.6667%` to loop seamlessly. |
| **Mystic Frame (Wavy Liquid Border)** | `STABLE` | Independent morphing outer borders running asynchronously. |
| **Standalone Gift Text Controls** | `STABLE` | Main/sub labels, alignment, size, position, background and background effects are configurable under Advanced Features. |
| **Custom Gift Library** | `STABLE` | Supports deletion and media or text-based gift icons. |
| **Gift/Asset Upload Pipeline** | `STABLE` | Accepts PNG, GIF and WebM with upload-side optimization to reduce overlay load. |
| **Gift Test Isolation** | `STABLE` | Designer tests stay inside the app; OBS responds only to real TikTok Live gift events. |

---

## 2. Technical Debt & Cleanup Areas

### Inline Renderer Duplications
- **Status**: Moderate Debt
- **Details**: `backend/public/gift-menu-overlay.html` still contains redundant inline rendering blocks for several widgets (e.g. goal-list, goal-bar) instead of relying 100% on `shared-render-engine.js`.
- **Precaution**: If any styling changes are made to `renderGoalBar` or similar helper blocks inside `shared-render-engine.js`, remember to cross-reference and apply them to `gift-menu-overlay.html` as well to prevent visual discrepancies in OBS.

### Shared Renderer file redundancy
- **Status**: Low Debt
- **Details**: `shared-render-engine.js` is duplicated at `desktop/renderer/js/shared-render-engine.js` and `backend/public/shared-render-engine.js`.
- **Precaution**: Make sure all changes are copied to both files.

---

## 3. Gift Menu Designer Update — 2026-06-30

Implemented by commits `2144328` and `8baf46b`:

- Custom gifts can be deleted from the gift library.
- A custom gift may use short text instead of a PNG/GIF/WebM icon.
- Standalone gift frames can unlock their aspect ratio and resize width/height independently.
- Standalone gifts now support main name, subtext, visibility, position, smaller font sizes, text alignment, gap and text color.
- Text settings are grouped under **Advanced Features**.
- Text backgrounds share the same Classic, Glass, Mystic, Hologram and Light Sweep behavior in the app and OBS renderers.
- Mystic Frame uses two configurable gradient colors (`textBgGradientFrom`, `textBgGradientTo`).
- App test gifts do not broadcast a fake gift to OBS. OBS playback remains tied to real TikTok Live gifts.
- Gift and asset uploads are restricted to PNG, GIF and WebM; oversized media is optimized to reduce lag.
