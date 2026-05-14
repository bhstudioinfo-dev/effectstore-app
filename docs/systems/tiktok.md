# 📱 TikTok System Architecture

## 🔌 Connection
- **Library**: `tiktok-live-connector`.
- **Service**: `backend/services/tiktokService.js`.
- **Mode**: Room ID based connection (Unique ID).

## 📡 Event Listeners
The service listens for and broadcasts the following events:
- `connected`: Room connection successful.
- `disconnected`: Lost connection (triggers 15s reconnect timer).
- `gift`: Gift received. Checks `GiftMapping` database.
- `like`: Updates live stats.
- `follow`: Triggers TTS (if enabled).
- `share`: Triggers TTS (if enabled).
- `chat`: General chat messages.
- `viewer`: Live viewer count updates.

## 🎁 Gift Processing Logic
1. Event `gift` fires with `giftId` and `userId`.
2. Service queries `GiftMapping` for the current user and gift ID.
3. If a mapping exists:
   - Fetches the related `Effect` duration.
   - Calls `effectQueue.add(effectId, duration, data)`.
4. If no mapping exists:
   - Broadcasts the raw gift event for generic UI alerts.

## 🔄 Reconnection State Machine
- If `disconnected` fires:
  - `liveStats.isLive` = false.
  - Clear any existing `reconnectTimer`.
  - Set `reconnectTimer` for 15 seconds to call `connect(lastRoomId)`.
