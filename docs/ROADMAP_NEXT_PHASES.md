# Project Development Roadmap & Release History

This document logs completed development stages and outlines next phases for the BH Studio system.

---

## 1. Completed Phases (DONE)

### Phase 1: Core Cleanups & Mapping Consolidation
*   Stabilized Mappings schemas, normalized database storage structures, and verified basic user CRUD mappings actions.

### Phase 2A: Effect Player Foundation
*   Introduced the standalone `effect_player` WebGL/video overlay renderer, eliminating layout-specific video tags and creating a single OBS overlay target.

### Phase 2B: Preview Migration
*   Migrated store effect previews and library previews to render via the new `effect_player` system.

### Phase 2C: Gift Mapping Test Migration
*   Migrated the "Test" button pipeline in the Gift Mapping layout view to route WebM video triggers through the unified queue and `effect_player`.

### Phase 2D: Live Mapping Migration
*   Completed the transition for live TikTok socket streams. All simulated and real TikTok gifts are routed through the EventBus, placed in `effectQueue.js`, and dispatched to `effect_player` inside OBS.
*   **Stutter & Auto-Scroll Hotfixes (Completed)**: Corrected the 3000-second group test trigger bug to resolve exactly to the selected effect's duration. Patched local countdown renders and disabled global browser scroll-anchoring to prevent jumpy viewports.

---

## 2. Current Status
*   **Release Version**: Pre-v1.0 (Alpha).
*   **Architecture Status**: High stability. Core playback pipelines are migrated to the unified rendering engine. The database model checks are complete.
*   **Verification**: All automated backend tests are passing (`plan-entitlements.test.js`).

---

## 3. Recommended Next Phase: Phase 3 (V1.0 Release Candidates)

The priority for the next iteration is optimization, client-side enhancements, and visual aids:

### A. Queue Visualization Widget
*   Add a visual widget in the Desktop Client showing the active item and the next 5 elements waiting in the queue.

### B. PlaybackManager Hardening
*   Add edge-case cleanup timers so that if the OBS WebSocket disconnected abruptly during playback, the backend automatically transitions back to an idle state.

### C. Version 1.0 Cleanup
*   Remove unused files (e.g., legacy scripts, unused templates, and deprecated controllers).

---

## 4. Future Architecture Goals (v2 / v3 Ideas)

### A. Cloud Sync & Multi-Device
*   Decouple the MongoDB instance to support cloud-synced databases, enabling streamers to log in and sync their mappings across different streaming PCs.

### B. Multi-Platform Support
*   Generalize the socket parser class to process event types from YouTube Live, Twitch, and custom platforms, mapping them to the same Playback Pipeline.
