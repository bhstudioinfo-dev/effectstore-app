# ✨ FEATURES.md

## 1. 🛍️ Effect Store
- **How it works**: Users browse a catalog of visual effects. They can add items to a cart and "purchase" them (simulated via totalSpent or admin approval).
- **Related Files**: `backend/routes/effects.js`, `desktop/renderer/js/home.js`.
- **API Endpoints**: `GET /api/effects`, `GET /api/user/effects`.
- **Logic**: Admin-only upload with automatic WebM encryption.

## 2. 📱 TikTok Live Integration
- **How it works**: Connects to a TikTok Live room using the Unique ID. Listens for Gifts, Chats, Likes, and Follows.
- **Related Files**: `backend/services/tiktokService.js`, `backend/routes/tiktok.js`.
- **API Endpoints**: `POST /api/tiktok/connect`, `POST /api/tiktok/disconnect`.
- **Logic**: Uses `tiktok-live-connector`. Automatically attempts reconnection if disconnected.

## 3. 🎥 OBS Automation
- **How it works**: Automatically creates a "EffectStore" scene in OBS and adds Browser Sources for effects.
- **Related Files**: `backend/services/obsService.js`, `backend/routes/obs.js`.
- **API Endpoints**: `POST /api/obs/trigger`.
- **Logic**: Uses OBS WebSocket. Manages source visibility and forced refreshes to ensure clean playback.

## 4. 🔗 Gift Mapping
- **How it works**: Links a specific TikTok Gift (e.g., "Rose") to a purchased effect.
- **Related Files**: `backend/models/GiftMapping.js`, `backend/routes/tiktok.js`.
- **API Endpoints**: `POST /api/tiktok/map-gift`, `GET /api/tiktok/mappings`.
- **Logic**: Limits number of mappings based on user subscription level (Free/Pro/Business).

## 5. 🎨 Gift Menu Designer
- **How it works**: A visual editor to design gift menus. Supports drag-and-drop, Aura effects, and custom layouts.
- **Related Files**: `desktop/renderer/js/gift-menu-designer.js`, `backend/models/GiftMenu.js`.
- **Logic**: Uses Fabric.js for canvas manipulation. Serializes state to MongoDB.

## 6. 🗣️ TTS (Text to Speech) System
- **How it works**: Reads out gift donor names and messages in Vietnamese.
- **Related Files**: `desktop/renderer/js/home.js` (speakText logic).
- **Logic**: Uses Google TTS API with a sequential queue to avoid overlapping speech. Supports volume control and thresholds.

## 🛡️ DRM & Video Protection
- **How it works**: Videos are encrypted on upload. They are decrypted in-memory during streaming to the OBS overlay.
- **Related Files**: `backend/utils/encrypt-video.js`, `backend/routes/effects.js` (stream route).
- **Logic**: Prevents users from stealing raw WebM files by not exposing static file paths.
