# 🎭 Overlay & Rendering System

## 🏗️ Overlay Architecture
- **File**: `desktop/renderer/overlay.html`.
- **Purpose**: A transparent canvas loaded into OBS Browser Sources.
- **Protocol**: Receives trigger signals via WebSocket (9001).

## 🛡️ DRM & Video Pipeline
1. **Frontend**: Requests `/api/stream/effect/:id`.
2. **Backend**: 
   - Locates encrypted file (`.enc`).
   - Reads buffer.
   - Decrypts in-memory (AES-256).
   - Streams decrypted data with `Content-Type: video/webm`.
3. **Frontend**: Receives stream and sets as `<video src="...">`.

## 🎨 Layout & Styling
- **Size**: 1080x1920 (Portrait).
- **Background**: Transparent.
- **Transition**: CSS-based fade-in/out during play/pause cycles.

## ⚙️ Gift Menu Designer Integration
- Menus designed in the app are rendered as static or semi-interactive elements within the overlay.
- Uses `Fabric.js` for rendering the complex vector-based menu layouts.
