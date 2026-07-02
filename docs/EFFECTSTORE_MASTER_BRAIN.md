# EffectStore Master Brain Documentation

Welcome! This is the ultimate master documentation of the **EffectStore** application state, architecture, design systems, database models, rendering loops, and development status.

## 1. Project Map & Master Index

- **Structure Map**: [FULL_PROJECT_STRUCTURE.md](file:///d:/effectstore-app/docs/FULL_PROJECT_STRUCTURE.md)
- **Application Architecture**: [FULL_ARCHITECTURE.md](file:///d:/effectstore-app/docs/FULL_ARCHITECTURE.md)
- **Features Inventory**: [FULL_FEATURE_INVENTORY.md](file:///d:/effectstore-app/docs/FULL_FEATURE_INVENTORY.md)
- **Renderer Sync Specification**: [RENDER_SYSTEM_ANALYSIS.md](file:///d:/effectstore-app/docs/RENDER_SYSTEM_ANALYSIS.md)
- **Database Full Schema**: [DATABASE_FULL_SCHEMA.md](file:///d:/effectstore-app/docs/DATABASE_FULL_SCHEMA.md)
- **UI Design System**: [UI_DESIGN_SYSTEM.md](file:///d:/effectstore-app/docs/UI_DESIGN_SYSTEM.md)
- **Bugs & Resolution Log**: [KNOWN_BUGS_FULL.md](file:///d:/effectstore-app/docs/KNOWN_BUGS_FULL.md)
- **Stability Status Report**: [CURRENT_PROJECT_STATE.md](file:///d:/effectstore-app/docs/CURRENT_PROJECT_STATE.md)
- **Future Roadmap**: [FUTURE_ROADMAP.md](file:///d:/effectstore-app/docs/FUTURE_ROADMAP.md)

---

## 2. Executive Architectural Overview

EffectStore is a professional streaming enhancement tool that connects TikTok Live streams directly to OBS Studio, decrypting proprietary media on the fly and playing interactive overlays.

- **Electron Wrapper**: Launches local system commands and handles client windows.
- **Express / WebSocket Server**: Serves API requests on port `9000` and stream updates on websocket port `9001`.
- **OBS Socket Integration**: Automates source configuration inside OBS Studio.
- **TikTok API Connector**: Pulls gift trigger streams in real time.

---

## 3. Core Engine Mechanics: Gift Stack Group (Bảng gộp)

### Seamless Loop Marquee
To solve visual jumps when looping very few items (e.g. only 2 items in a 320px viewport), the layout engine:
- Repeats the list of items **6 times** (`Array(6).fill(children).flat()`).
- Applies a CSS marquee keyframe translating from `0%` to **`-16.6667%`** (exactly `1/6` of the total duplicated track width).
- Removes container `gap` and places margins directly on child items to avoid spacing math offsets.

### Mystic Frame (Khung cổ thuật)
- **Background**: obsidian black (`rgba(8,8,12,0.94)`) to prevent glare.
- **Outer Outline**: an independent thin border (`::before` pseudo-element) positioned outside the main border (`inset: -2.5px`).
- **Glow**: Softened to `8%` - `22%` opacity.
- **Animation**: The main border and outer outline morph independently using dual offset keyframes (`gmdMagicLiquidMorph` at `6s` and `gmdMagicLiquidMorph2` at `8s`), creating an intersecting liquid wave effect.

---

## 4. Gift Menu Designer Capability Baseline (2026-06-30)

The current baseline includes the hardening work in commits `2144328` and `8baf46b`:

- Custom gift creation/deletion and text-as-icon mode.
- PNG, GIF and WebM-only upload validation with media optimization.
- Optional aspect-ratio locking for standalone gift frames.
- Standalone main/sub labels with visibility, position, 6–48px size, alignment, gap and color controls.
- Advanced label backgrounds: Classic, Glass, Mystic Frame, Hologram and Light Sweep.
- Mystic Frame stores two explicit gradient colors and shares the same output in desktop preview and OBS.
- Designer test gifts remain local to the app; OBS triggers are reserved for real TikTok Live gift events.

Canonical detail is maintained in:

- `FULL_FEATURE_INVENTORY.md` for available controls and persistence fields.
- `RENDER_SYSTEM_ANALYSIS.md` for desktop/OBS rendering parity.
- `KNOWN_BUGS_FULL.md` for resolved issues.
- `CURRENT_PROJECT_STATE.md` for stability and technical-debt notes.
