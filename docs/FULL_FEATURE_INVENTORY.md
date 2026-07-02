# Full Application Feature Inventory

This document registers all features currently implemented in the EffectStore application.

---

## 1. User & Licensing System

### Purpose
Authenticates users, controls device registrations, and validates subscription plans or individual effect licenses.

### Files Involved
- `backend/routes/auth.js`
- `backend/models/User.js`
- `backend/models/License.js`
- `desktop/renderer/js/home.js`

### Status
`STABLE`

### Complete Logic Flow
1. User logs in with email/password or registers.
2. The server generates a JWT containing the user ID and subscription tier, sending it back to the Electron app client.
3. On startup, the desktop client fetches the machine's hardware UUID (making a local device key) and calls `/api/auth/validate-license`.
4. If valid, the app allows access; otherwise, it locks the UI and redirects the user to the subscription upgrade page.

---

## 2. Gift Mapping System

### Purpose
Maps TikTok gift identifiers to local decrypted overlay video effects.

### Files Involved
- `backend/routes/tiktok.js`
- `backend/models/GiftMapping.js`
- `desktop/renderer/gift-mapping.html`

### Status
`STABLE`

### Complete Logic Flow
1. User opens the "Gán hiệu ứng" (Map Gift) screen.
2. User chooses a gift from the TikTok Live catalog (or enters a custom gift ID) and selects a corresponding video effect.
3. Client checks limits based on user subscription tier:
   - `free`: Max 5 mappings
   - `pro`: Max 20 mappings
   - `business`: Max 100 mappings
   - `studio`: Unlimited mappings
4. If limits are respected, the mapping is saved to MongoDB.

---

## 3. Real-Time TikTok Live Connector

### Purpose
Connects to TikTok Live stream chat and event streams to trigger configured overlays.

### Files Involved
- `backend/services/tiktokService.js`
- `backend/routes/tiktok.js`
- `backend/services/effectQueue.js`

### Status
`STABLE`

### Complete Logic Flow
1. Streamer enters their TikTok username or Room ID and clicks "Kết nối" (Connect).
2. `tiktokService.js` opens a persistent connection to the TikTok Live server.
3. When a `gift` event fires, the service reads the `giftId` and checks `GiftMapping`.
4. If a mapping exists, it extracts the `effectId` and enqueues the play trigger into `effectQueue.js`.
5. The queue pushes the trigger event via WebSocket to the OBS Browser Source overlay.

---

## 4. OBS Studio Auto-Setup & Control

### Purpose
Establishes a connection to OBS Studio, automatically creating overlays, scenes, and media sources.

### Files Involved
- `backend/services/obsService.js`
- `backend/routes/obs.js`
- `backend/obs-auto-setup.js`

### Status
`STABLE`

### Complete Logic Flow
1. On start, the app reads connection details from `OBSSettings` and connects to `obs-websocket`.
2. Streamer clicks "Auto Setup OBS".
3. The server queries OBS for existing sources. If missing, it creates a new scene called `EffectStore` and inserts a Browser Source referencing `http://localhost:9000/gift-menu-overlay.html`.

---

## 5. WebM Video Decryption

### Purpose
Secures proprietary video effects from pirating by decrypting encrypted video assets on the fly.

### Files Involved
- `backend/utils/encrypt-video.js`
- `backend/routes/effects.js`
- `desktop/main.js`

### Status
`STABLE`

### Complete Logic Flow
1. Admin uploads an effect, which is encrypted using AES-256 and stored on the server.
2. When the overlay browser source requests the WebM file, the Express API decrypts the chunk in memory and streams it using HTTP range requests directly to OBS, preventing any plaintext storage of the video asset.

---

## 6. Gift Menu Designer

### Purpose
Builds and exports interactive gift menu layouts while keeping the desktop preview and OBS Browser Source visually synchronized.

### Files Involved
- `desktop/renderer/js/gift-menu-designer.js`
- `desktop/renderer/js/item-registry.js`
- `desktop/renderer/js/shared-render-engine.js`
- `desktop/renderer/styles/gift-menu-designer.css`
- `backend/public/shared-render-engine.js`
- `backend/public/gift-menu-renderer.css`
- `backend/public/gift-menu-overlay.html`
- `backend/routes/tiktok.js`
- `backend/routes/obs.js`

### Status
`STABLE — RUNTIME APP/OBS VISUAL CHECK RECOMMENDED`

### Implemented Capabilities

1. Add and delete custom gifts from the designer library.
2. Use PNG, GIF or WebM media, or replace the icon with configurable text.
3. Optimize oversized uploaded media before storage/use to reduce render cost.
4. Lock or unlock an item's aspect ratio and resize width/height independently.
5. Configure standalone gift main name, subtext, visibility, text position, font size down to 6px, alignment, spacing and color.
6. Enable Classic, Glass, Mystic Frame, Hologram or Light Sweep label backgrounds.
7. Configure Mystic Frame using two explicit gradient colors.
8. Keep standalone gift rendering synchronized between desktop and OBS shared render engines.
9. Preview test gift reception only inside the app; OBS is triggered only by real TikTok Live gift events.

### Persistence Fields Added/Used

- `lockRatio`
- `iconDisplayMode`, `iconText`, `iconTextColor`, `iconTextSize`
- `subtext`, `showName`, `textPosition`, `textSize`, `textAlign`, `textGap`, `textColor`
- `showTextBg`, `textBgStyle`, `textBgColor`
- `textBgGradientFrom`, `textBgGradientTo`
