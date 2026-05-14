# ⛔ DO_NOT_TOUCH.md

## ⚠️ Critical Systems
These files and logic blocks are fundamental to the application's stability. Refactoring them without a deep understanding of their dependencies will likely break core functionality.

### 1. `backend/services/effectQueue.js`
- **Why**: Handles the complex timing of gift triggers. Any changes to the `setTimeout` or `process()` logic can cause video overlaps or UI freezes in OBS.

### 2. `backend/utils/encrypt-video.js`
- **Why**: The encryption/decryption keys and buffer-streaming logic are sensitive. Breaking this will render all existing visual effects unplayable.

### 3. `desktop/renderer/js/home.js` -> `EffectStoreApp.init()`
- **Why**: This sequence handles critical authentication, device limit checks, and service polling. Out-of-order execution here will lead to 401 errors or incorrect UI state.

### 4. `backend/services/tiktokService.js` -> Reconnection Logic
- **Why**: The 15-second retry timer and socket cleanup prevent memory leaks and duplicate client instances. Do not modify the `disconnected` event handler.

## 🔒 Hardcoded Constants
- **Email**: `admin@effectstore.vn` (Root Admin).
- **Ports**: 9000 (API), 9001 (WS), 4455 (OBS).
- **Scene Name**: `EffectStore` (Must match in OBS).

---
*If you need to modify these, create a detailed implementation plan and verify with the user first.*
