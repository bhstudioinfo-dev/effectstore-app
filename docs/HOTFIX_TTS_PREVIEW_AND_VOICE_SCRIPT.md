# Hotfix - TTS Preview and Voice Script System

This document outlines the fixes for the Text-to-Speech (TTS) manual preview error (409 Conflict) and the implementation details of the Vietnamese-friendly **🎤 Kịch bản thoại** system using Google Translate TTS.

---

## 1. Cause of the 409 Conflict Error
Previously, the backend endpoint `/api/tiktok/usage/tts` checked for an active TikTok Live connection and validated `this.currentLiveUserId`. If the streamer clicked the "Nghe thử" (manual preview) button from the dashboard prior to establishing a live connection, the server rejected the request with `409 (Conflict)` and blocked audio synthesis.

---

## 2. Files Changed

*   **[backend/routes/tiktok.js](file:///d:/effectstore-app/backend/routes/tiktok.js)**:
    *   Updated the `/usage/tts` route to parse `isTest` from `req.body` and pass it to `consumeTts`, which bypasses live room checks when manual previewing.
*   **[backend/services/tiktokService.js](file:///d:/effectstore-app/backend/services/tiktokService.js)**:
    *   Modified `consumeTts(userId, isTest)` to bypass `currentLiveUserId` validation and skip incrementing the session quota counters when `isTest` is `true`.
*   **[desktop/renderer/index.html](file:///d:/effectstore-app/desktop/renderer/index.html)**:
    *   Replaced the technical "Gift TTS" column layout with the upgraded **🎤 Kịch bản thoại** layout.
    *   Added controls for reading speed rate, dynamic variables, and custom voice templates.
*   **[desktop/renderer/js/home.js](file:///d:/effectstore-app/desktop/renderer/js/home.js)**:
    *   State variables (`ttsSpeed`, `ttsTemplate`) are initialized and persisted in `localStorage`.
    *   Added helper functions (`toggleVariableMenu`, `insertVariable`, `toggleTemplateMenu`, `applyVoiceTemplate`, `testVoicePreview`) to support cursor-based insertion and quick script loading.
    *   Updated `speakText()` to pass `isTest` in the payload body and handle errors gracefully.
    *   Configured `processTTSQueue()` to directly play Google Translate TTS audio with rate adjustment (`playbackRate`), keeping it robust and free of external dependency checks.
    *   Bound a global document click listener to automatically close settings dropdowns.

---

## 3. Operations Flow

### Old Flow (Technical Google TTS only)
```
[Nghe thử Click] -> speakText() -> POST /api/tiktok/usage/tts -> Check live connection -> (Fail: 409 Conflict)
```

### New Flow (Flexible Variable Script and Local Bypass)
```
[Nghe thử Click] -> speakText(..., isTest = true) 
                        ↓
             POST /api/tiktok/usage/tts {"isTest": true}
                        ↓
             [Bypass active connection check & quota increment]
                        ↓
             Queue audio to local ttsQueue
                        ↓
             Process ttsQueue -> Play Google Translate TTS audio locally
```

---

## 4. UI Configurations & Variable Replacements
The voice script system replaces variables dynamically at runtime:
*   `{username}` -> Nickname or Unique ID of the gift donor.
*   `{giftName}` -> Localized gift name.
*   `{quantity}` -> Count of gifts sent.
*   `{coin}` -> Total value of the gift combo.

---

## 5. Verification & Test Checklist

1.  **Test Voice Section Preview**:
    *   Navigate to "Gán hiệu ứng" without connecting to a TikTok Room.
    *   Click **🔊 Nghe thử**.
    *   *Expectation*: The notification "Đã chạy thử hiệu ứng trên OBS!" is NOT shown. Google Translate audio plays locally in-app with the specified reading speed.
2.  **Variable Insertion**:
    *   Click **➕ Chèn biến** and select **👤 Tên người tặng**.
    *   *Expectation*: `{username}` is appended at the textarea cursor index.
3.  **Template Script Loading**:
    *   Click **📋 Mẫu thoại** and select any sample template.
    *   *Expectation*: The template text is automatically updated and saved.
4.  **OBS Isolated Rendering**:
    *   Press test button on any Gift card mapping (e.g. Corgi).
    *   *Expectation*: Graphical effect plays via `effect_player` on OBS, and queue status panel is populated correctly.
