# 🏗️ EffectStore: Technical Architecture Guide

This document provides a deep dive into the system architecture of EffectStore for developers and architects.

## 1. System Communication Map
EffectStore uses a hybrid communication model to balance performance and real-time responsiveness.

- **HTTP/REST (Port 9000)**: Used for CRUD operations (Effects, Users, Settings, Payments).
- **WebSocket (Port 9001)**: Used for real-time events (TikTok Gift alerts, OBS triggers, System logs).
- **OBS WebSocket (Port 4455)**: Direct control of OBS Studio from the backend.

## 2. The "Premium Pro" UI Framework
The UI is built on a custom design system focused on the "Premium Pro" aesthetic:
- **Base**: `desktop/renderer/index.html` (Single Page Application architecture).
- **Logic**: `desktop/renderer/js/home.js` (Class-based state management).
- **Designer**: `desktop/renderer/js/gift-menu-designer.js` (Modular component for gift customization).

### Key Design Tokens:
- **Glass**: `rgba(255, 255, 255, 0.05)` background with `12px` blur.
- **Accent**: HSL(262, 83%, 75%) - Purple for Pro features.
- **Danger**: HSL(0, 84%, 60%) - Red for critical status/errors.

## 3. Visual Rendering Pipeline (DRM Protected)
To protect intellectual property, effect videos are not accessed directly by filename.
1. **Request**: Overlay requests a stream via `/api/effects/stream/:id`.
2. **Backend**: Reads encrypted WebM from `backend/effects/encrypted/`.
3. **Stream**: Pipes the buffer to the frontend with appropriate MIME types.
4. **Queue**: `effectQueue.js` ensures only one effect plays at a time on the overlay.

## 4. State Management
The `EffectStoreApp` class in `home.js` manages:
- `this.currentUser`: Logged-in user profile and balance.
- `this.cart`: Persistence-synced shopping cart.
- `this.giftMappings`: Active gift-to-effect links.
- `this.ttsQueue`: Sequential voice announcement queue.

## 5. Security & Authentication
- **Token**: JWT-based authentication stored in `localStorage`.
- **Machine ID**: Unique hardware identifier to prevent unauthorized account sharing.
- **CORS**: Restricted to the Electron environment to prevent web-based scraping.

---
*Created by Antigravity - Project Architect*
