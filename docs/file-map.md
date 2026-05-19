# 🗺️ FILE_MAP.md

## 🏗️ Repository Structure

```text
/
├── /backend              # Node.js Server
│   ├── /models           # Database Schemas (Mongoose)
│   ├── /routes           # API Handlers
│   ├── /services         # Core Logic (TikTok, OBS, Queue)
│   └── /utils            # Encryption, QR generation
├── /desktop              # Electron Frontend
│   └── /renderer
│       ├── /js           # home.js (App Controller)
│       └── /styles       # main.css (Premium Pro UI)
├── /docs                 # Documentation (See 00_START_HERE.md)
├── /effects              # Encrypted WebM assets
└── /uploads              # Dynamic assets (Banners, Thumbs)
```

## 🎯 Key File Responsibilities

| File | Responsibility |
| :--- | :--- |
| `backend/server.js` | Main entry point & service coordinator. |
| `backend/services/tiktokService.js` | Real-time TikTok Live integration. |
| `backend/services/obsService.js` | OBS WebSocket control & Scene automation. |
| `backend/services/effectQueue.js` | Sequential playback management. |
| `desktop/renderer/js/home.js` | **Frontend Brain**: View switching, State, TTS. |
| `backend/utils/encrypt-video.js` | DRM protection logic for WebM files. |

## 🚫 Critical Junctions
- **Port 9000**: API Communication.
- **Port 9001**: WebSocket Real-time events.
- **Port 4455**: OBS Studio WebSocket.
