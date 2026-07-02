# Future Development Roadmap

This document outlines the priority path and suggested feature roadmap for future developers of the EffectStore application.

---

## 1. High Priority: Code De-duplication & Consolidation

### Goal
Remove inline rendering duplicates inside `backend/public/gift-menu-overlay.html` and transition them entirely to the shared rendering engine (`shared-render-engine.js`).

### Action Plan
1. Migrate the inline `goal-list` and `goal-bar` templates into corresponding `renderGoalList` and `renderGoalBar` helpers inside `shared-render-engine.js`.
2. Clean up `gift-menu-overlay.html` to reference these shared rendering methods, eliminating double-maintenance overhead.

---

## 2. Medium Priority: Advanced Animation Options

### Goal
Allow streamers to customize the uốn lượn (wavy/morphing) speed, direction, and complexity for the Khung cổ thuật (Mystic Frame).

### Action Plan
1. Expose inputs for `morphSpeed` and `morphIntensity` in `inspector-engine.js` and `gift-menu-designer.js`.
2. Dynamically bind these parameters to the CSS animation styles within the shared rendering engine to let streamers build unique magical border vibrations.

---

## 3. Low Priority: Performance & Assets Caching Optimization

### Goal
Enhance performance in high-frequency live stream chats.

### Action Plan
1. Cache decrypted WebM video files locally using memory-level buffers on the local Express backend, reducing repeat disk reads.
2. Optimize WebSocket broadcast intervals so that high-rate gift combos are bundled into single state frames rather than flood-broadcasting.

---

## 4. Completed Gift Menu Designer Improvements (2026-06-30)

- [x] Delete custom gifts from the local designer library.
- [x] Allow text to replace a gift icon.
- [x] Unlock standalone gift aspect ratio for independent width/height resizing.
- [x] Add standalone main/sub labels and grouped-gift-equivalent text backgrounds.
- [x] Support font sizes down to 6px and left/center/right alignment.
- [x] Move text controls into Advanced Features.
- [x] Synchronize Classic, Glass, Mystic, Hologram and Light Sweep effects between app and OBS.
- [x] Make Mystic Frame a configurable two-color gradient.
- [x] Keep test gift reception inside the app and reserve OBS for real TikTok Live gifts.
- [x] Restrict gift/asset media to PNG, GIF and WebM with optimization for heavy files.

### Recommended Follow-up

1. Add automated serialization tests for the new standalone gift text and gradient fields.
2. Add screenshot regression fixtures comparing desktop preview against the OBS renderer.
3. Replace the inert legacy text-settings template with a single reusable inspector builder to reduce maintenance.
4. Perform a manual OBS/CEF matrix test for gradient rendering and `color-mix()` compatibility.
