# Full Application Architecture

This document analyzes the complete system architecture, data flow, communication boundaries, and services of the EffectStore application.

## System Architecture Diagram

The diagram below details the physical and logical boundaries of the application, including local desktop IPC, remote TikTok Live connection, local OBS Studio connection, and local/remote database connections.

```mermaid
graph TB
    subgraph Client Space (Local Machine)
        subgraph Electron Wrapper
            D_Main[desktop/main.js - Main Process]
            D_Render[desktop/renderer - Render Process]
            D_Bridge[desktop/preload.js - Preload IPC Bridge]
        end
        subgraph Live Services (Local Host)
            B_Server[backend/server.js - Express API]
            B_WS[backend/server.js - WebSocket Server 9001]
            B_TS[backend/services/tiktokService.js]
            B_OS[backend/services/obsService.js]
            B_EQ[backend/services/effectQueue.js]
        end
        subgraph OBS Studio
            OBS_App[OBS Studio Application]
            OBS_WebBrowser[OBS Browser Source]
        end
    end

    subgraph Cloud Space (Remote)
        MongoDB[(MongoDB Server)]
        TikTokAPI[TikTok Live API Stream]
    end

    %% Communications
    D_Main <--> |Electron IPC| D_Bridge
    D_Bridge <--> |Context Bridge| D_Render
    D_Render <--> |HTTP / JSON REST| B_Server
    D_Render <--> |WebSocket Events| B_WS
    B_Server <--> |Mongoose DB Queries| MongoDB
    B_TS <--> |TikTok Live Connector| TikTokAPI
    B_OS <--> |OBS WebSocket Protocol| OBS_App
    OBS_WebBrowser <--> |Renders HTML / JS| B_Server
    OBS_WebBrowser <--> |WebSocket Events| B_WS
```

## Architecture Modules

### 1. Electron Desktop App Wrapper
- **Main Process (`desktop/main.js`)**: Orchestrates window setup (Home UI, Admin UI, Overlay UI), handles desktop shells, triggers local media decryption, and registers custom IPC channels.
- **Context Bridge (`desktop/preload.js`)**: Safely exposes node integrations (like fs read/writes, system command execution) to the renderer process without opening security holes.
- **Renderer Process (`desktop/renderer/`)**: Builds the frontend UI pages. Coordinates coordinates, items, and menu layout rendering.

### 2. Express Backend API & WebSocket Server
- **Express HTTP Server (`backend/server.js`)**: Runs on port `9000` (default). Serves static upload assets (webM videos, goal target images, user avatars) and exposes REST APIs for authentication, admin panels, license validations, layouts, and mappings.
- **WebSocket Server (`backend/server.js`)**: Runs on port `9001` (default). Broadcasts real-time events to both the local Client App and OBS Browser Source overlay. Common events include:
  - `gift_catalog_update`: Pushes updated TikTok gift prices/icons.
  - `gift_logged`: Live updates of gifts received.
  - `effect_trigger`: Instructs overlay to play a specific WebM overlay.

### 3. TikTok Connection System (`backend/services/tiktokService.js`)
- Uses a local connection agent (`tiktok-live-connector` or equivalent custom stream scraper) to join a streamer's TikTok Live Room by `roomId` (unique stream identifier).
- Listens to incoming chat events, viewer count shifts, follow triggers, share triggers, and gift events.
- Maps received gifts (e.g. `rose`) to active database mappings and triggers enqueued overlay playbacks.

### 4. OBS Studio Communication (`backend/services/obsService.js`)
- Interfaces with OBS Studio's built-in WebSocket Server (compatible with OBS v5.x protocol).
- Auto-detects and auto-configures scenes, filters, and browser sources.
- Controls OBS directly (e.g. setting source visibility, toggling color key filters, and playing media items).

### 5. Media Queue Manager (`backend/services/effectQueue.js`)
- Manages an array-based FIFO (First-In, First-Out) trigger queue.
- If a streamer receives 10 gifts simultaneously, instead of playing all 10 video effects at once (which would lag the system and clutter the stream), the queue plays them sequentially based on their individual video duration attributes.

### 6. Authentication & Licensing
- **Token Authentication**: REST APIs are protected using JSON Web Tokens (JWT) through `backend/middleware/auth.js`.
- **License System (`backend/models/License.js`)**: Validates software keys against specific machine identifiers (`machineId`), expiry dates, and subscription plans on startup.
- **Subscription Levels**: Categorized into `free`, `pro`, `business`, and `studio`, restricting the number of active gift mappings (e.g. free gets 5 mappings; pro gets 20).
