# Project Overview

## Purpose
EffectStore is an Electron desktop app plus local backend for TikTok Live streamers. It sells/manages visual effects, maps TikTok gifts to effects, and triggers those effects in OBS during live streams.

## Target Users
- TikTok Live streamers who use OBS and want gift-driven visual reactions.
- Admin/operator users who upload effects, approve payments, manage users, banners, and gift coin metadata.

## Business Logic
- Users register/login, receive a JWT, and are limited by subscription/device rules in `backend/routes/auth.js`.
- Effects are sold through a cart/payment flow. Payments are created as VietQR bank transfer orders and manually approved by admin in `backend/routes/payment.js`.
- Approved payments add effect licenses to `User.purchasedEffects` or activate `pro`/`business` subscriptions.
- Subscription plans control device limits and gift mapping limits:
  - Device limits in `auth.js`: `free=1`, `pro=2`, `business=5`.
  - Gift mapping limits in `tiktok.js`: `free=5`, `pro=20`, `business=100`.
- Admin users are inferred from JWT `isAdmin`, `User.isAdmin`, `User.hasAdminUI` usage in routes, and the hardcoded email `admin@effectstore.vn`.

## Current Features
- Electron storefront UI with login/register, cart, effect catalog, owned library, admin views, settings, TikTok mapping, and TTS controls.
- Express API on `http://localhost:9000/api`.
- WebSocket broadcast server on `ws://localhost:9001` for backend TikTok/live events.
- Separate Electron local overlay server on `http://localhost:8080` and `ws://localhost:8081`.
- MongoDB persistence through Mongoose models in `backend/models`.
- OBS WebSocket automation with scene/source creation and effect triggering.
- TikTok Live connection through `tiktok-live-connector`.
- Effect upload, preview storage, thumbnail storage, encrypted video storage, and decrypted streaming.
- Admin dashboard stats, users, effects, gift coins, gift icons listing, payments, custom effect requests, and banner upload/delete.

## Tech Stack
- Runtime: Node.js, CommonJS modules.
- Desktop: Electron 28, static HTML/CSS/JS renderer.
- Backend: Express 4, Mongoose, WebSocket `ws`.
- Database: MongoDB, default URI `mongodb://localhost:27017/effectstore`.
- Integrations: OBS WebSocket, TikTok Live Connector, VietQR image URL generation.
- Uploads/media: Multer, local filesystem, AES-256-CBC encryption for videos.
- Build/package: `electron-builder` from `desktop/package.json`.

## Deployment Info
- Intended local-first deployment: run MongoDB, OBS, backend, and Electron app on the streamer/admin machine.
- Root scripts:
  - `npm run dev`: starts backend and desktop concurrently.
  - `npm run backend`: starts backend only.
  - `npm start`: starts Electron desktop.
  - `npm run build`: runs Electron build from `desktop`.
- Backend starts from `backend/index.js`, which requires `backend/server.js`.
- Desktop starts from `desktop/main.js`.

## Environment Usage
Important environment variables are loaded by `dotenv` in `backend/server.js`:
- `PORT`: backend HTTP port, defaults to `9000`.
- `MONGODB_URI`: Mongo connection string, defaults to local `effectstore`.
- `JWT_SECRET`: JWT signing secret, defaults to insecure `your-secret-key`.
- `ADMIN_DEFAULT_PASSWORD`: password for auto-created `admin@effectstore.vn`, defaults to `admin123`.
- `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`: OBS WebSocket connection, defaults to `127.0.0.1`, `4455`, `obs123`.
- `ENCRYPTION_PASSWORD`: video encryption password, defaults to a hardcoded development value.

Never commit real production values. The root `.env` exists locally and should be treated as secret-bearing.
