# API & WebSocket Communication Reference

This document serves as the developer reference for all HTTP REST routes, internal routes, WebSockets, and media streams in BH Studio (EffectStore).

---

## 1. REST API Endpoints

### A. Authentication

#### `POST /api/auth/login`
*   **Purpose**: Authenticate user and return token.
*   **Authentication**: None.
*   **Input (JSON)**: `{"email": "...", "password": "..."}`
*   **Output (JSON)**: `{"success": true, "token": "...", "user": {...}}`
*   **Used By**: Login View.

#### `POST /api/auth/register`
*   **Purpose**: Create a new streamer account.
*   **Authentication**: None.
*   **Input (JSON)**: `{"name": "...", "email": "...", "password": "..."}`
*   **Output (JSON)**: `{"success": true, "token": "...", "user": {...}}`

---

### B. Gift Mapping Management

#### `GET /api/tiktok/mappings`
*   **Purpose**: Retrieve all active mapping rules for the logged-in user.
*   **Authentication**: Bearer JWT.
*   **Output (JSON)**: `{"success": true, "mappings": [...]}`
*   **Used By**: Gift Mapping View.

#### `POST /api/tiktok/mappings`
*   **Purpose**: Create or update a gift mapping rule.
*   **Authentication**: Bearer JWT.
*   **Input (JSON)**:
    ```json
    {
      "giftId": "58",
      "giftName": "Corgi",
      "giftIcon": "/assets/gift-icons/Corgi.png",
      "effectId": "custom-1783065014051-cfayu4dcve",
      "effectName": "Ngựa tym đội",
      "effects": [
        {"effectId": "custom-1783065014051-cfayu4dcve", "effectName": "Ngựa tym đội"},
        {"effectId": "69e7559bf5b6f2f61a81d89c", "effectName": "Hoa Hồng"}
      ],
      "playbackMode": "random",
      "minQuantity": 10,
      "cooldown": 5,
      "cooldownAction": "ignore"
    }
    ```
*   **Output (JSON)**: `{"success": true, "mapping": {...}}`

#### `DELETE /api/tiktok/mappings/:id`
*   **Purpose**: Delete a gift mapping.
*   **Authentication**: Bearer JWT.
*   **Output (JSON)**: `{"success": true}`

---

### C. Playback & Trigger Operations

#### `POST /api/tiktok/test-trigger`
*   **Purpose**: Triggers a mapping test on the OBS overlays.
*   **Authentication**: Bearer JWT.
*   **Input (JSON)**: `{"mappingId": "MAPPING_MONGODB_ID"}`
*   **Output (JSON)**:
    ```json
    {
      "success": true,
      "message": "Effect triggered on OBS.",
      "effectId": "custom-1783065014051-cfayu4dcve",
      "effectName": "Ngựa tym đội",
      "duration": 6
    }
    ```

#### `POST /api/tiktok/usage/tts`
*   **Purpose**: Checks/consumes a TTS quote limit before vocalizing message streams.
*   **Authentication**: Bearer JWT.
*   **Input (JSON)**: `{"isTest": true}`
*   **Output (JSON)**: `{"success": true, "remaining": null}`

#### `GET /api/queue/status`
*   **Purpose**: Fetch the active queue state (remaining ms, queue length, next name).
*   **Authentication**: None.
*   **Output (JSON)**:
    ```json
    {
      "success": true,
      "status": "busy",
      "currentEffectName": "Ngựa tym đội",
      "remainingMs": 2700,
      "queueLength": 0,
      "nextEffectName": null
    }
    ```

---

### D. OBS Integration & Diagnostics

#### `POST /api/obs/repair-sources`
*   **Purpose**: Repair and auto-create missing Browser Sources (`effect_player` and `gift_menu_overlay`) inside the active OBS scene.
*   **Authentication**: Bearer JWT.
*   **Output (JSON)**: `{"success": true, "message": "OBS sources repaired successfully."}`

#### `GET /api/obs/effect-player-media/:effectId`
*   **Purpose**: Streams the WebM video asset to the overlay browser source.
*   **Authentication**: Checked via URL query parameter `?token=JWT_STREAM_TOKEN`.
*   **Output**: Binary WebM video stream.

---

## 2. WebSocket Protocol (Real-Time Server Events)

Serves real-time render cues on WebSocket Port 9001.

### `PLAY_EFFECT`
Broadcast to all overlays when a new item begins playback.
```json
{
  "type": "PLAY_EFFECT",
  "effectId": "custom-1783065014051-cfayu4dcve",
  "effectUrl": "http://localhost:9000/api/obs/effect-player-media/custom-1783065014051-cfayu4dcve?token=JWT_STREAM_TOKEN",
  "duration": 6000,
  "playbackType": "test_mapping"
}
```
