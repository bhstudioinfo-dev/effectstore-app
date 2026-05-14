# 🏗️ ARCHITECTURE.md

## 📁 Folder Structure
- `/backend`: Core server logic.
  - `/models`: Mongoose schemas.
  - `/routes`: API endpoints.
  - `/services`: Core business logic (TikTok, OBS, Queue).
  - `/utils`: Helper functions (Encryption, QR generation).
- `/desktop`: Electron application.
  - `/renderer`: UI assets (HTML, CSS, JS).
    - `/js`: Frontend logic (home.js, gift-menu-designer.js).
    - `/styles`: CSS design system.
- `/effects`: Assets directory.
  - `/encrypted`: DRM protected WebM files.
- `/uploads`: User-uploaded content (Banners, Thumbs).

## 🔄 Frontend/Backend Flow
1. **Frontend (Electron)** sends REST API requests to **Backend (Node.js)** for data.
2. **Backend** communicates with **MongoDB** for persistence.
3. **Backend** listens to **TikTok Live** via `tiktok-live-connector`.
4. On events, **Backend** emits signals via **WebSocket (9001)** to the Frontend.
5. **Backend** sends commands to **OBS Studio** via `obs-websocket-js`.

## 🧠 State Management
- **Frontend**: Managed via the `EffectStoreApp` class in `home.js`. This class holds the current user state, cart, mappings, and active view state.
- **Backend**: Stateless REST API with session/auth data handled via JWT. Real-time state is held in Service singletons (`tiktokService.js`, `obsService.js`).

## 🌐 API Architecture
- **Base URL**: `http://localhost:9000/api`
- **Authentication**: JWT Bearer token in the `Authorization` header.
- **Streaming**: Custom binary streaming for encrypted video files.

## 🔐 Auth Flow
1. **Login**: User sends credentials + `machineId`.
2. **Backend**: Validates against MongoDB, checks device limits (based on subscription plan).
3. **Token**: JWT returned containing `userId`, `isAdmin`, and `machineId`.
4. **Persistence**: Token stored in `localStorage` on the frontend.

## 🗄️ Database Structure
- **Users**: Credentials, subscription level, purchased effects list.
- **Effects**: Metadata, pricing, file paths, usage stats.
- **GiftMappings**: User-specific links between TikTok Gift IDs and Effect IDs.
- **Payments**: Transaction history and pending QR orders.
- **GiftMenus**: Serialized Fabric.js objects for the designer.

## 📦 Important Dependencies
- `express`: Web framework.
- `mongoose`: MongoDB ODM.
- `ws`: WebSocket server.
- `obs-websocket-js`: OBS control.
- `tiktok-live-connector`: TikTok integration.
- `multer`: File upload handling.
- `bcryptjs` & `jsonwebtoken`: Security.

## 🎨 Design Patterns Used
- **Singleton**: Services like `TikTokService` and `OBSService` are singletons.
- **Command/Queue**: `EffectQueue` handles sequential processing of events.
- **Mediator**: `server.js` acts as a mediator between TikTok events and OBS triggers.
- **SPA (Single Page Application)**: Frontend handles view switching via DOM manipulation rather than page reloads.
