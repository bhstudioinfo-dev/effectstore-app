# Changelog - BH Studio (EffectStore)

This file contains the audit log of system transitions, database refactorings, and optimizations in BH Studio.

---

## [0.9.0-Alpha] - 2026-07-03

This milestone brings the system to unified rendering stability, resolving layout shifts, multi-target duration bugs, and focus conflicts.

### Added
*   **Smart Mapping Conditions**: Bounded cooldown limits, exact triggers, and multiple effect array parameters (`effects`) inside the `GiftMapping` database schema.
*   **Central Event Bus**: Set up `eventBus.js` as an asynchronous message hub (`effect_playback_started`, `effect_playback_finished`, `queue_updated`).
*   **Static Queue Panel**: Redesigned the Queue Status panel UI. The element is now permanently visible (`display: block`) with clean idle placeholders, preventing viewport heights from shifting during test runs.
*   **🎤 Voice Script ("Kịch bản thoại") Panel**: Redesigned the settings bar column with Bật giọng đọc, Giọng đọc selection, Tốc độ, Cao độ, cursor-based variable insertions (`{username}`, `{giftName}`, `{quantity}`, `{coin}`), template loaders, and test features.
*   **TTS Preview Local Bypass**: Configured `/api/tiktok/usage/tts` route and service layers to bypass connection state checks when manual testing (`isTest: true`) is requested.

### Changed
*   **Unified Render Engine**: Re-routed Store Previews, Custom Library Previews, Gift Mapping Tests, and TikTok Live triggers to pass through `effectQueue.js` and play via the single `effect_player` browser source.
*   **Group Test Trigger Duration**: Updated the `/test-trigger` endpoint to pre-select the active target effect and return its exact duration (e.g. 6.0s for "Ngựa tym đội"), replacing the millisecond unit mismatch bug that returned a hardcoded 3000 seconds.
*   **Security & Path Hiding**: Replaced raw local path indicators (like `/assets/gift-icons/Finger_Heart.png`) with dynamic image parsers inside the mapping layout panel.

### Fixed
*   **401 Startup Error Spam**: Added guards to prevent client-side widgets (like `gift-menu-designer.js`) from requesting database templates before authentication completes.
*   **Stutter & Auto-Scroll Jumps**: Disabled browser-native scroll anchoring globally (`overflow-anchor: none !important`) and applied event target blurs on click, preventing Electron from jumping when toggling queue playback states.
*   **OBS Source Self-Healing**: Created the `/api/obs/repair-sources` route to auto-inspect and rebuild the `effect_player` scene inputs inside OBS if missing.
