# BH Studio / EffectStore - Project Master Analysis

Generated from source inspection on 2026-06-28. This document describes the current codebase state only. It does not assume intended future behavior beyond what is present in files.

## 1. Full Folder Structure

Important application tree, excluding dependency internals:

```text
.
|-- admin/
|   `-- index.html
|-- backend/
|   |-- assets/
|   |   |-- gift-icons/
|   |   |-- goal/placeholders/
|   |   |-- sounds/
|   |   `-- webm-frames/
|   |-- data/
|   |   |-- owned_effects.json
|   |   `-- payments.json
|   |-- effects/encrypted/
|   |-- middleware/
|   |   `-- auth.js
|   |-- models/
|   |   |-- Banner.js
|   |   |-- Effect.js
|   |   |-- EffectRequest.js
|   |   |-- GiftConfig.js
|   |   |-- GiftLog.js
|   |   |-- GiftMapping.js
|   |   |-- GiftMenuLayout.js
|   |   |-- License.js
|   |   |-- OBSSettings.js
|   |   `-- Payment.js
|   |   `-- User.js
|   |-- public/
|   |   |-- gift-menu-overlay.html
|   |   `-- gift-menu-renderer.css
|   |-- routes/
|   |   |-- admin.js
|   |   |-- auth.js
|   |   |-- banner.js
|   |   |-- effects.js
|   |   |-- obs.js
|   |   |-- payment.js
|   |   |-- settings.js
|   |   `-- tiktok.js
|   |-- services/
|   |   |-- effectQueue.js
|   |   |-- obsService.js
|   |   `-- tiktokService.js
|   |-- uploads/
|   |   |-- banners/
|   |   |-- effects/
|   |   |-- goal/
|   |   |-- previews/
|   |   |-- thumbs/
|   |   |-- gift-goal-config.json
|   |   |-- gift-menu-layout.json
|   |   |-- goal-board-layout.json
|   |   `-- goal-board-templates.json
|   |-- utils/
|   |   `-- encrypt-video.js
|   |-- index.js
|   |-- obs-auto-setup.js
|   |-- obs-controller.js
|   |-- obs_config.json
|   |-- package.json
|   |-- server.js
|   |-- sync_user_effects.js
|   |-- find_chao_effect.js
|   |-- restore_chao_effect.js
|   `-- update_chao_effect.js
|-- desktop/
|   |-- assets/fonts/
|   |-- renderer/
|   |   |-- assets/fonts/
|   |   |-- js/
|   |   |   |-- gift-menu-designer.js
|   |   |   `-- home.js
|   |   |-- styles/
|   |   |   |-- gift-menu-designer.css
|   |   |   `-- main.css
|   |   |-- admin-banner.html
|   |   |-- admin.html
|   |   |-- gift-coins-manager.html
|   |   |-- gift-mapping.html
|   |   |-- index.html
|   |   |-- overlay.html
|   |   `-- preload.js
|   |-- main.js
|   |-- package.json
|   `-- preload.js
|-- docs/
|   |-- api/
|   |-- archive/
|   |-- core/
|   |-- frontend/
|   |-- guides/
|   |-- management/
|   |-- systems/
|   |-- vi/
|   `-- existing project docs
|-- effects/
|-- frontend/
|   `-- overlay/
|       |-- goal-board-overlay.css
|       |-- goal-board-overlay.html
|       `-- goal-board-overlay.js
|-- scratch/
|-- uploads/
|-- package.json
|-- package-lock.json
`-- README.md
```

`node_modules/`, font binaries, uploaded media, encrypted media, and generated scratch scripts are part of the working tree but are not application architecture files.

## 2. Frontend Architecture

The primary frontend is not React/Vue/etc. It is a static Electron renderer made of HTML, CSS, and browser JavaScript.

- Main shell: `desktop/renderer/index.html`
- Main app controller: `desktop/renderer/js/home.js`
- Menu Designer controller: `desktop/renderer/js/gift-menu-designer.js`
- Styles: `desktop/renderer/styles/main.css`, `desktop/renderer/styles/gift-menu-designer.css`
- Standalone utility pages: `gift-mapping.html`, `gift-coins-manager.html`, `admin-banner.html`, `admin.html`, `overlay.html`

The renderer keeps application state in one global `EffectStoreApp` instance plus globals attached to `window`. State includes auth token, current user, cart, effects, owned effects, mappings, TikTok stats, TTS settings, pending payments, and view state. Persistence is mainly `localStorage`.

The UI calls `http://localhost:9000` or `http://127.0.0.1:9000` directly. WebSocket real-time updates use `ws://localhost:9001`. Electron IPC is used mostly for machine id, navigation, local overlay URL, hotkeys, and local file save/load helpers.

Risk level: High. The frontend is large, global-state-heavy, has duplicated standalone pages, hardcoded localhost endpoints, and mixed active/legacy overlay paths.

## 3. Backend Architecture

The backend is an Express/Mongoose CommonJS app.

- Entry: `backend/index.js` loads `.env`, requires `server.js`, and logs startup.
- Core server: `backend/server.js`
- Database: MongoDB through Mongoose, default `mongodb://localhost:27017/effectstore`
- HTTP port: `PORT` or `9000`
- WebSocket port: `WS_PORT` or `9001`
- Static paths: `/uploads`, `/assets`, `/overlay`, backend `public`
- Service singletons: `obsService`, `tiktokService`, `effectQueue`
- Auth: JWT bearer token through `backend/middleware/auth.js`

The backend boot sequence ensures local upload/asset directories exist, connects MongoDB, starts a WebSocket server, initializes services with the WebSocket broadcast function, attempts OBS connection, mounts routes, and starts Express.

Risk level: High. Startup mixes database, WebSocket, OBS connection, static assets, API routes, and directory creation in one file.

## 4. Electron Startup Flow

Root `package.json` points `main` to `desktop/main.js`. `npm start` runs `cd desktop && npm start`; `npm run dev` starts backend and desktop concurrently.

`desktop/main.js` flow:

1. Compute app data path and local effect storage path.
2. Create a machine id from app name, platform, and `userData`.
3. `app.whenReady().then(createWindow)`.
4. Create a `BrowserWindow` with `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false`, and preload `desktop/preload.js`.
5. Open DevTools and load `desktop/renderer/index.html`.
6. Create tray menu and global hotkeys.
7. Start local Express server on `8080` and WebSocket server on `8081` for legacy/local overlay.
8. Register IPC handlers for navigation, machine id, OBS overlay URL, hotkeys, local effect file save/load, auto-start, and OBS status.

Risk level: High. Security flags are permissive, DevTools always opens, Electron hosts a second overlay server distinct from the backend overlay server, and startup side effects are broad.

## 5. Database Models

MongoDB schemas are direct Mongoose schemas. There are no migrations.

| Model | Purpose | Important fields | Risk |
|---|---|---|---|
| `User` | Auth, subscriptions, owned effects, device tracking | `email`, `password`, `phone`, `machineId`, `subscription`, `subscriptionExpiresAt`, `activeDevices`, `purchasedEffects`, `isAdmin` | High |
| `Effect` | Marketplace/effect catalog and media metadata | `name`, `category`, `price`, `fileUrl`, `previewUrl`, `thumbUrl`, `previewFilePath`, `encryptedFilePath`, `duration`, `timeline`, `isComposite` | High |
| `Payment` | QR/proof payment records | `userId`, `orderId`, `effectIds`, `proofImage`, `amount`, `status` | High |
| `EffectRequest` | Custom effect request form | `name`, `phone`, `description`, `status` | Medium |
| `GiftMapping` | User gift-to-effect mapping | `userId`, `giftId`, `giftName`, `giftIcon`, `effectId`, `effectName`, `isActive` | High |
| `GiftLog` | Gift/effect trigger history | `giftId`, `giftName`, `userId`, `userName`, `effectId`, `triggeredAt`, `repeatCount` | Medium |
| `GiftConfig` | Gift coin/admin icon metadata | `giftId`, `giftName`, `coins`, `isActive` | Medium |
| `OBSSettings` | OBS host/port/password | `host`, `port`, `password` | High |
| `Banner` | Active marketplace/banner image | `filePath`, `publicUrl`, `isActive` | Medium |
| `License` | License key placeholder/model | `licenseKey`, `userId`, `effectId`, `machineId`, `expiresAt` | Medium |
| `GiftMenuLayout` | Menu Designer saved layouts/templates | `userId`, `name`, `aspectRatio`, `items`, `exportedItems`, `isActive`, `isTemplate` | High |

## 6. API Routes

Base URL is `http://localhost:9000/api` unless noted.

### Auth: `/api/auth`

- `POST /register`: create user, hash password, auto-admin if email is `admin@effectstore.vn`.
- `POST /login`: validates credentials, may auto-create default admin, enforces device limits by subscription.
- `GET /me`: validates token, returns user metadata, downgrades expired subscriptions to `free`.

Risk level: High. Uses fallback JWT secret and default admin password if env is not set.

### Effects: `/api`

- `GET /effects`: list active effects with category/search.
- `GET /effects/trending`: top effects by uses.
- `GET /effects/item/:id`: effect detail.
- `GET /user/effects`: owned effects or all active effects for admin.
- `GET /stream/effect/:effectId`: stream preview/encrypted effect media.
- `POST /effects`: admin upload/create effect, copy preview, encrypt original, save thumbnail.
- `POST /effects/:id/update`: admin metadata/thumb update.
- `DELETE /effects/:id`: admin delete effect and media files.
- `GET /effects/:id/timeline`: fetch composite/timeline data.
- `PUT /effects/:id/timeline`: save timeline/composite data.

Risk level: High. This path handles media upload, local filesystem writes/deletes, encrypted streaming, and catalog ownership.

### Payment: `/api/payment`

- `POST /create-qr`: creates VietQR URL and order id.
- `POST /confirm`: records pending payment and optional proof image.
- `GET /status/:orderId`: poll payment status.
- `POST /sepay-webhook`: compatibility no-op acknowledge.
- `GET /admin/payments`: admin list payments.
- `POST /admin/approve`: marks approved, grants effects or subscriptions.
- `POST /admin/reject`: marks rejected.

Risk level: High. Money/subscription ownership is driven by manual admin approval, proof upload, and string effect ids.

### Admin: `/api/admin`

- `GET /dashboard`, `GET /stats`: counts/revenue/pending payment stats.
- `GET /users`, `PUT /users/:userId/subscription`, `DELETE /users/:userId`.
- `POST /effect-requests`, `GET /effect-requests`, `PUT /effect-requests/:id`.
- `GET /effects`: all effects for admin.
- `GET /gift-coins`, `PUT /gift-coins/:giftId`, `POST /gift-coins/bulk-update`, `POST /gift-coins/reset`.
- `GET /gift-icons`, `POST /gift-icons/upload`, `POST /gift-icons/add`, `DELETE /gift-icons/:giftId`.
- `GET /payments/:id`: payment detail.

Risk level: High. This file owns admin operations across users, effects, payments, gift metadata, and file uploads.

### TikTok/Gifts/Menu Designer: `/api/tiktok`

- `POST /connect`, `POST /prepare`, `POST /disconnect`, `GET /stats`.
- `GET /mappings`, `POST /map-gift`, `DELETE /mappings/:id`, `PUT /mappings/:id/toggle`.
- `GET /available-effects`.
- `POST /test-trigger`, `POST /simulate-gift`.
- `GET /logs`, `DELETE /logs`.
- `GET /gifts-library`.
- `GET /gift-menu-layouts`, `GET /gift-menu-templates`, `GET /gift-menu-layout`.
- `POST /gift-menu-layout`, `POST /gift-menu-layout/create`.
- `PUT /gift-menu-layout/:layoutId/activate`, `DELETE /gift-menu-layout/:layoutId`.
- `POST /gift-menu-layout/publish`.
- `GET /goal-board/assets`, `GET /goal-board/templates`, `POST /goal-board/upload-asset`: currently mock/fallback responses.

Risk level: High. This route combines live platform control, gift trigger mapping, logs, designer persistence, template publishing, and goal-board stubs.

### OBS: `/api/obs`

- `GET /effect/:id`: returns transparent HTML video player for OBS Browser Source.
- `POST /setup-effect`: create/update OBS browser source for an effect.
- `POST /setup-gift-menu`: create/update OBS browser source for gift menu overlay.
- `POST /trigger`: add effect to processing queue.
- `GET /sources`: list OBS inputs.

Risk level: High. Directly controls OBS scene/source state.

### Settings: `/api/settings`

- `GET /obs`: load/create OBS settings.
- `POST /obs`: save settings and reconnect OBS.

Risk level: High because OBS password is stored plaintext.

### Banner: `/api/banner` and `/api/admin/banner`

- `GET /`: active banner.
- `POST /`: admin upload active banner.
- `DELETE /`: admin delete active banner.

Risk level: Medium.

### Server-level endpoints

- `POST /api/effect-requests`: compatibility route.
- `GET /api/system/status`: TikTok/OBS/backend status.
- `GET /overlay/gift-menu/`: backend public gift menu overlay file.

Risk level: Medium.

## 7. OBS Integration Architecture

There are three OBS-related layers:

1. Active service: `backend/services/obsService.js`
   - Maintains one `obs-websocket-js` connection.
   - Tracks `_isConnected`, `_lastConfig`, reconnect timer.
   - Creates `EffectStore` scene if missing.
   - Creates or updates browser sources named `effect_<effectId>`.
   - Uses `GET /api/obs/effect/:id?t=...` as the Browser Source URL.
   - Shows the source, refreshes browser source, hides it after duration.

2. Queue: `backend/services/effectQueue.js`
   - FIFO in-memory queue.
   - Broadcasts gift data when present.
   - Calls `obsService.triggerOBSEffect`.
   - Waits duration before processing next effect.

3. Older helpers: `backend/obs-controller.js` and `backend/obs-auto-setup.js`
   - Use media sources or more detailed timeline/webcam manipulation.
   - Not wired into `backend/server.js` active route flow.
   - Still important as legacy/prototype architecture for composite effects.

Risk level: High. OBS automation is stateful, timing-sensitive, singleton-based, and has legacy code paths.

## 8. Payment/Subscription Architecture

The payment system is manual/semi-manual:

1. Frontend cart or subscription flow calls `/api/payment/create-qr`.
2. Backend creates a VietQR URL using hardcoded bank information and generated `orderId`.
3. User confirms via `/api/payment/confirm`, with optional proof image or no-proof flag.
4. Payment stays `pending`.
5. Admin dashboard lists payments.
6. Admin approves through `/api/payment/admin/approve`.
7. Approval grants either:
   - subscription plan for `SUBSCRIPTION_PRO` or `SUBSCRIPTION_BUSINESS`, 30 days; or
   - purchased effect ids in `User.purchasedEffects`.

Plan/device limits are enforced in auth/login and gift mapping creation:

- Device login limits: `free:1`, `pro:2`, `business:5`, `studio:999`.
- Gift mapping limits: `free:5`, `pro:20`, `business:100`, `studio:9999`.

Risk level: High. Payment validation is not automated, webhook is no-op, and bank/account data is hardcoded in source.

## 9. Admin Dashboard Architecture

There are two admin experiences:

1. Integrated admin view inside `desktop/renderer/index.html` controlled by `home.js`.
   - Visible when `user.isAdmin` is true.
   - Loads stats/effects/payments/effect requests/users.
   - Uploads effects.
   - Edits effect metadata, flash sale, trending, fake uses, thumbnails.
   - Approves/rejects payments.
   - Manages user subscriptions and deletes users.

2. Standalone pages:
   - `desktop/renderer/admin.html`: older independent admin dashboard with login.
   - `desktop/renderer/admin-banner.html`: active banner upload/delete tool.
   - `desktop/renderer/gift-coins-manager.html`: gift icon and coin manager.
   - `admin/index.html`: older root-level admin page.

Risk level: High. Admin UX is split, code is duplicated, and standalone pages hardcode backend URLs/auth assumptions.

## 10. Menu Designer Architecture

Primary file: `desktop/renderer/js/gift-menu-designer.js`.

The Menu Designer is an in-app visual editor mounted at `#gift-menu-designer-view`.

Core concepts:

- `GiftMenuDesigner` class owns state: gifts, selected item ids, items/layers, aspect ratio, canvas size, current layout id/name, templates, goal assets, goal templates, zoom/pan/history state.
- Left panel loads gift library from `/api/tiktok/gifts-library`.
- Canvas renders draggable/resizable/rotatable items.
- Inspector edits selected gift or widget properties.
- My Library loads layouts from `/api/tiktok/gift-menu-layouts`.
- Templates load from `/api/tiktok/gift-menu-templates`.
- Save serializes layout payload to Mongo through `/api/tiktok/gift-menu-layout` and also saves fallback localStorage.
- Save/export calls `/api/obs/setup-gift-menu`.
- Publish template calls `/api/tiktok/gift-menu-layout/publish`.

The designer supports ordinary gift icons plus goal-board-style widgets such as goal bars, boss bars, contributor boards, podiums, mystery chests, combo counters, goal lists, text, and media asset placeholders.

Risk level: High. This is a large single-file editor with many UI concerns, persistence, scaling/export math, OBS export, and marketplace/template ambitions in one class.

## 11. Overlay Export Architecture

### Gift Menu Overlay

Active export path:

1. Designer calls `saveLayout`.
2. Backend stores a `GiftMenuLayout` document.
3. Backend also writes the active layout JSON to `backend/uploads/gift-menu-layout.json`.
4. Designer calls `/api/obs/setup-gift-menu`.
5. Backend creates/updates OBS Browser Source `gift_menu_overlay` in scene `EffectStore`.
6. Browser Source URL is `http://localhost:9000/overlay/gift-menu/`.
7. `backend/public/gift-menu-overlay.html` loads `/api/tiktok/gift-menu-layout` repeatedly and renders `exportedItems` or `items`.
8. CSS comes from `backend/public/gift-menu-renderer.css`, with additional inline renderer CSS.

Risk level: High. Overlay rendering polls every 700ms, route requires auth middleware in current backend code while overlay fetch does not send a token, and active layout is also mirrored to a single JSON file.

### Effect Overlay

OBS effect source path:

1. `/api/obs/trigger` queues an effect id.
2. `effectQueue` calls `obsService.triggerOBSEffect`.
3. OBS source URL becomes `/api/obs/effect/:id?t=timestamp`.
4. That route returns transparent HTML with a video source pointing to `/api/stream/effect/:effectId`.
5. Source is visible for duration and hidden after timeout.

Risk level: High.

### Goal Board Overlay

Files exist under `frontend/overlay/`.

- `goal-board-overlay.html` loads CSS and JS.
- `goal-board-overlay.js` fetches `/api/tiktok/goal-board/layout` and listens to WebSocket events `goal_board_layout_update` and `goal_board_progress_update`.
- `tiktokService.processGoalBoardGift` updates `backend/uploads/goal-board-layout.json` and broadcasts progress events.

Current mismatch: `backend/routes/tiktok.js` contains stub routes for assets/templates/upload but not the `/goal-board/layout` route expected by the overlay. This appears incomplete or mid-recovery.

Risk level: High.

## 12. File/Media Storage Architecture

Storage is local filesystem plus Mongo metadata.

- Effect encrypted originals: `backend/effects/encrypted/*.enc`
- Effect previews: `backend/uploads/previews/*.webm`
- Effect thumbnails: `backend/uploads/thumbs/*.png`
- Payment proof uploads: `backend/uploads/temp/*`
- Banners: `backend/uploads/banners/*`
- Gift icons: `backend/assets/gift-icons/*`
- Goal placeholders/assets: `backend/assets/goal`, `backend/uploads/goal`
- Active gift menu export mirror: `backend/uploads/gift-menu-layout.json`
- Goal board JSON mirrors: `backend/uploads/goal-board-layout.json`, `backend/uploads/goal-board-templates.json`
- Electron local effects: Electron `userData/effects`

`backend/utils/encrypt-video.js` encrypts with AES-256-CBC and writes the IV at the start of the file. The same utility streams encrypted media by decrypting on the fly. The default encryption password is hardcoded if env is absent.

Risk level: High. Local paths are stored in Mongo documents, upload temp paths are relative to process cwd, and secrets/default encryption settings are in code.

## 13. Important Core Files

### Root

#### `package.json`

- Purpose: root scripts for starting desktop, backend, dev, build, and placeholder test.
- Dependencies: `concurrently`.
- Functions/classes: none.
- Risk level: Medium. Scripts assume directory layout and separate backend/desktop packages.

#### `README.md`

- Purpose: points humans to docs.
- Dependencies: none.
- Functions/classes: none.
- Risk level: Low.

### Backend Core

#### `backend/index.js`

- Purpose: backend entrypoint; loads env and `server.js`.
- Dependencies: `dotenv`, `./server.js`.
- Functions/classes: none.
- Risk level: Low.

#### `backend/server.js`

- Purpose: main Express server, Mongo connection, WebSocket server, static mounts, service initialization, route mounting.
- Dependencies: `express`, `cors`, `mongoose`, `fs`, `path`, `ws`, models, route modules, OBS/TikTok/queue services.
- Functions/classes: `broadcastToClients`; route handlers for compatibility effect request, system status, gift menu overlay.
- Risk level: High.

#### `backend/middleware/auth.js`

- Purpose: JWT auth and admin gate.
- Dependencies: `jsonwebtoken`.
- Functions/classes: `authMiddleware`, `adminMiddleware`.
- Risk level: High.

#### `backend/utils/encrypt-video.js`

- Purpose: encrypt uploaded video, stream decrypted encrypted files.
- Dependencies: `crypto`, `fs`, `path`.
- Functions/classes: `encryptVideo`, `decryptVideoStream`, `streamDecryptedVideo`.
- Risk level: High.

### Backend Services

#### `backend/services/obsService.js`

- Purpose: active OBS WebSocket singleton for scene/source creation, reconnect, effect triggering, and source animation helper.
- Dependencies: `obs-websocket-js`.
- Functions/classes: `OBSService`, `connect`, `ensureConnected`, `startReconnect`, `triggerOBSEffect`, `smoothAnimateSource`, `isConnected`.
- Risk level: High.

#### `backend/services/effectQueue.js`

- Purpose: sequential in-memory OBS effect queue.
- Dependencies: `./obsService`.
- Functions/classes: `EffectQueue`, `setBroadcastFn`, `add`, `process`.
- Risk level: High.

#### `backend/services/tiktokService.js`

- Purpose: TikTok live connector singleton, gift catalog sync, event broadcasts, gift mapping trigger logic, goal-board progress update logic.
- Dependencies: `tiktok-live-connector`, `GiftMapping`, `Effect`, `GiftLog`, `effectQueue`, `fs`, `path`.
- Functions/classes: `TikTokService`, `init`, `connect`, `disconnect`, `isConnected`, `broadcast`, `normalizeGiftFromEvent`, `handleGiftCatalogUpdate`, `processGoalBoardGift`.
- Risk level: High.

### Backend Routes

#### `backend/routes/auth.js`

- Purpose: registration, login, current user lookup, device limits, admin bootstrap.
- Dependencies: `express`, `bcryptjs`, `jsonwebtoken`, `User`, auth middleware.
- Functions/classes: Express route handlers.
- Risk level: High.

#### `backend/routes/effects.js`

- Purpose: marketplace catalog, owned effects, media streaming, admin create/update/delete, timeline persistence.
- Dependencies: `express`, `Effect`, `User`, auth/admin middleware, `multer`, `path`, `fs`, encryption utility, child-process `ffprobe`.
- Functions/classes: `getVideoDuration`; Express route handlers.
- Risk level: High.

#### `backend/routes/payment.js`

- Purpose: QR creation, payment confirmation, polling, admin approval/rejection.
- Dependencies: `express`, `Payment`, `User`, auth/admin middleware, `multer`, `path`.
- Functions/classes: Express route handlers.
- Risk level: High.

#### `backend/routes/admin.js`

- Purpose: admin dashboard APIs, users, effect requests, effects list, gift coin/icon management, payment detail.
- Dependencies: `express`, `User`, `Effect`, `Payment`, `EffectRequest`, `GiftConfig`, `Banner`, auth/admin middleware, `multer`, `path`, `fs`.
- Functions/classes: Express route handlers.
- Risk level: High.

#### `backend/routes/tiktok.js`

- Purpose: TikTok connection, mapping, gift library, logs, Menu Designer layout/template APIs, goal-board fallback APIs.
- Dependencies: `express`, `fs`, `path`, `tiktokService`, `GiftMapping`, `GiftLog`, `GiftConfig`, `Effect`, `User`, `GiftMenuLayout`, auth middleware.
- Functions/classes: Express route handlers.
- Risk level: High.

#### `backend/routes/obs.js`

- Purpose: OBS browser-source HTML, source setup, gift menu source setup, trigger queue, source listing.
- Dependencies: `express`, `obsService`, auth middleware, `Effect`, `OBSSettings`, `jsonwebtoken`.
- Functions/classes: `getObsConnectionConfig`; Express route handlers.
- Risk level: High.

#### `backend/routes/settings.js`

- Purpose: OBS settings load/save and reconnect.
- Dependencies: `express`, `OBSSettings`, `obsService`, auth middleware.
- Functions/classes: Express route handlers.
- Risk level: High.

#### `backend/routes/banner.js`

- Purpose: active banner read/upload/delete.
- Dependencies: `express`, `Banner`, auth/admin middleware, `multer`, `path`, `fs`.
- Functions/classes: Express route handlers.
- Risk level: Medium.

### Backend Models

#### `backend/models/User.js`

- Purpose: account, auth, subscription, devices, purchases.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: High.

#### `backend/models/Effect.js`

- Purpose: effect catalog/media/timeline metadata.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: High.

#### `backend/models/Payment.js`

- Purpose: payment/order proof state.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: High.

#### `backend/models/GiftMenuLayout.js`

- Purpose: saved/published Menu Designer layouts.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: High.

#### `backend/models/GiftMapping.js`

- Purpose: user gift-to-effect mapping.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: High.

#### `backend/models/GiftLog.js`

- Purpose: trigger history.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: Medium.

#### `backend/models/GiftConfig.js`

- Purpose: gift coin/admin metadata.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: Medium.

#### `backend/models/OBSSettings.js`

- Purpose: OBS connection settings.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: High.

#### `backend/models/Banner.js`

- Purpose: active banner metadata.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: Medium.

#### `backend/models/EffectRequest.js`

- Purpose: custom effect request records.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: Medium.

#### `backend/models/License.js`

- Purpose: license key model, currently not wired into active routes.
- Dependencies: `mongoose`.
- Functions/classes: Mongoose schema/model.
- Risk level: Medium.

### Backend OBS Legacy/Support Files

#### `backend/obs-controller.js`

- Purpose: older OBS controller supporting media sources, webcam source detection, layer movement, smooth transforms, and timeline effects.
- Dependencies: `obs-websocket-js`.
- Functions/classes: `OBSController`, `connect`, `triggerEffect`, `addEffectSource`, `findWebcamSource`, `findEffectSource`, `setWebcamLayer`, `saveWebcamOriginalPosition`, `resetWebcamToOriginalPosition`, `moveWebcamSmooth`, `runTimelineEffect`, `disconnect`, `getStatus`.
- Risk level: High.

#### `backend/obs-auto-setup.js`

- Purpose: older utility to create `EffectStore` scene, add ffmpeg media source effects, trigger by source visibility.
- Dependencies: `obs-websocket-js`, `path`.
- Functions/classes: `OBSAutoSetup`, `connect`, `createEffectStoreScene`, `addEffectSource`, `triggerEffect`, `getSceneItemId`, `disconnect`.
- Risk level: Medium.

### Desktop/Electron

#### `desktop/package.json`

- Purpose: Electron app package/build settings.
- Dependencies: `electron`, `electron-builder`, `express`, `ws`, `auto-launch`.
- Functions/classes: none.
- Risk level: Medium.

#### `desktop/main.js`

- Purpose: Electron main process, window/tray/hotkeys/local overlay server/IPC.
- Dependencies: `electron`, `path`, `fs`, `crypto`, `express`, `ws`, `auto-launch`.
- Functions/classes: `getMachineId`, `createWindow`, `createTray`, `registerHotkeys`, `triggerEffectBySlot`, `startLocalServer`, `triggerEffect`, `showNotification`; many IPC handlers.
- Risk level: High.

#### `desktop/preload.js`

- Purpose: currently empty.
- Dependencies: none.
- Functions/classes: none.
- Risk level: Low.

#### `desktop/renderer/preload.js`

- Purpose: exposes machine id and generic IPC invoke to renderer.
- Dependencies: `electron`.
- Functions/classes: context bridge exports.
- Risk level: Medium.

### Desktop Renderer

#### `desktop/renderer/index.html`

- Purpose: main app DOM, auth modal, navigation, store/library/admin/settings/mapping/designer views, modals, timeline editor, cart.
- Dependencies: CDN CryptoJS, Font Awesome, `styles/main.css`, `styles/gift-menu-designer.css`, `js/home.js`, `js/gift-menu-designer.js`.
- Functions/classes: inline event hooks; most logic lives in JS files.
- Risk level: High.

#### `desktop/renderer/js/home.js`

- Purpose: primary app controller for auth, store, cart, payment, OBS trigger, admin, TikTok mapping, TTS, settings, timeline editor.
- Dependencies: browser DOM APIs, fetch, localStorage, WebSocket, SpeechSynthesis, Electron globals when present.
- Functions/classes: `EffectStoreApp` plus global helpers such as `bootstrapApp`, `toggleCart`, `filterCategory`, `switchView`, `showAccount`, `navigateTo`, timeline editor functions.
- Risk level: High.

#### `desktop/renderer/js/gift-menu-designer.js`

- Purpose: visual Gift Menu/Goal Board Designer.
- Dependencies: DOM APIs, fetch, localStorage, Font Awesome classes, backend API, main app notification hooks.
- Functions/classes: `GiftMenuDesigner` with render/load/save/export/layout/template/widget/asset/inspector/history/canvas methods.
- Risk level: High.

#### `desktop/renderer/styles/main.css`

- Purpose: global app styling for shell, cards, views, admin, modals, marketplace, settings, mapping.
- Dependencies: HTML class/id structure.
- Functions/classes: CSS only.
- Risk level: Medium.

#### `desktop/renderer/styles/gift-menu-designer.css`

- Purpose: in-app designer styling and renderer-compatible gift/widget styles.
- Dependencies: designer DOM structure and renderer classes.
- Functions/classes: CSS only.
- Risk level: High due to tight coupling with exported overlay visuals.

#### `desktop/renderer/gift-mapping.html`

- Purpose: standalone gift/effect mapping page with TikTok live controls, mappings list, logs, and WebSocket stats.
- Dependencies: backend APIs and WebSocket on 9001.
- Functions/classes: inline functions `loadGifts`, `loadEffects`, `createMapping`, `loadMappings`, `toggleMapping`, `deleteMapping`, `testTrigger`, `loadLogs`, `connectWebSocket`, `connectTikTok`, etc.
- Risk level: Medium.

#### `desktop/renderer/admin.html`

- Purpose: standalone admin dashboard/login.
- Dependencies: backend auth/admin/payment routes.
- Functions/classes: inline functions `checkAuth`, `adminLogin`, `loadDashboard`, `loadUsers`, `loadEffectRequests`, `viewPayment`, `approvePayment`, `rejectPayment`.
- Risk level: Medium.

#### `desktop/renderer/admin-banner.html`

- Purpose: standalone banner manager.
- Dependencies: backend banner routes.
- Functions/classes: inline functions `handleFileSelect`, `uploadBanner`, `loadCurrentBanner`, `deleteBanner`, `backToAdmin`.
- Risk level: Medium.

#### `desktop/renderer/gift-coins-manager.html`

- Purpose: standalone gift icon and coin manager.
- Dependencies: backend admin gift coin/icon routes.
- Functions/classes: inline functions `loadCoins`, `loadGiftIcons`, `renderCoins`, `handleIconUpload`, `uploadNewIcon`, `deleteIcon`, `saveCoin`, `saveAll`, `resetToDefault`.
- Risk level: Medium.

#### `desktop/renderer/overlay.html`

- Purpose: legacy local Electron overlay driven by WebSocket `ws://localhost:8081`.
- Dependencies: Electron main local server.
- Functions/classes: inline `playEffect`.
- Risk level: Medium.

### Backend Public/Frontend Overlay

#### `backend/public/gift-menu-overlay.html`

- Purpose: active OBS Browser Source renderer for Gift Menu Designer layouts.
- Dependencies: `/gift-menu-renderer.css`, `/api/tiktok/gift-menu-layout`, browser DOM.
- Functions/classes: inline renderer helpers and `loadAndRender`.
- Risk level: High.

#### `backend/public/gift-menu-renderer.css`

- Purpose: visual runtime CSS for gift menu and goal board widgets in OBS/browser.
- Dependencies: exported `gmd-*` class structure.
- Functions/classes: CSS only.
- Risk level: High.

#### `frontend/overlay/goal-board-overlay.html`

- Purpose: separate goal board OBS overlay entry.
- Dependencies: `goal-board-overlay.css`, `goal-board-overlay.js`, Font Awesome, Google Fonts.
- Functions/classes: none.
- Risk level: Medium.

#### `frontend/overlay/goal-board-overlay.js`

- Purpose: render goal board layers and subscribe to WebSocket updates.
- Dependencies: `/api/tiktok/goal-board/layout`, WebSocket 9001, DOM.
- Functions/classes: `loadLayout`, `connectWebSocket`, `render`, `escapeHtml`.
- Risk level: High because backend route alignment appears incomplete.

#### `frontend/overlay/goal-board-overlay.css`

- Purpose: styles for goal board widgets.
- Dependencies: `goal-board-overlay.js` DOM/classes.
- Functions/classes: CSS only.
- Risk level: Medium.

### Admin Root

#### `admin/index.html`

- Purpose: older standalone admin page.
- Dependencies: backend APIs by hardcoded URLs.
- Functions/classes: inline browser functions.
- Risk level: Medium, likely legacy/out of sync.

### Scratch and Maintenance Files

#### `scratch/*.js`

- Purpose: patch/recovery scripts from prior maintenance work.
- Dependencies: file-specific.
- Functions/classes: patch helpers.
- Risk level: Medium if reused blindly; not part of runtime.

#### `backend/find_chao_effect.js`, `restore_chao_effect.js`, `update_chao_effect.js`, `sync_user_effects.js`

- Purpose: one-off maintenance/repair scripts.
- Dependencies: backend models/filesystem depending on script.
- Functions/classes: script-specific.
- Risk level: Medium.

## 14. Architectural Risk Summary

- Security defaults: fallback JWT secret, fallback encryption password, default admin creation/password, permissive Electron settings, plaintext OBS password.
- Money path: no real payment provider verification; webhook is currently a no-op.
- Local storage coupling: Mongo stores local paths; active layouts are both Mongo records and JSON mirrors.
- OBS coupling: singleton state, hardcoded scene/source names, timing-based visibility, route-generated browser source HTML.
- Frontend scale: `home.js` and `gift-menu-designer.js` are large global controllers with many responsibilities.
- Endpoint drift: standalone pages, overlay files, and backend routes do not all agree, especially goal-board layout routes and auth expectations for gift-menu overlay polling.
- Encoding: multiple files show mojibake in Vietnamese text, suggesting prior encoding corruption.

