# 🎥 OBS System Architecture

## 🔌 Connection
- **Protocol**: WebSocket (v5.0).
- **Port**: 4455.
- **Library**: `obs-websocket-js`.
- **Service**: `backend/services/obsService.js`.

## 🏗️ Auto-Setup Logic
On connection, the system automatically:
1. Checks for the existence of the **'EffectStore'** scene.
2. Creates the scene if missing.
3. For every active effect, it prepares a **Browser Source** with:
   - `url`: `http://localhost:9000/api/obs/effect/:id`
   - `width`: 1080, `height`: 1920.
   - `restart_when_active`: true.
   - `reroute_audio`: true.

## 🎬 Trigger Pipeline
1. `triggerOBSEffect(effectId, duration)` is called.
2. Source visibility is set to `true`.
3. `PressInputPropertiesButton` with `refreshnocache` is called to force reload.
4. A `setTimeout` is scheduled to hide the source after `duration`.

## 🐌 Animation Engine
- Supports smooth LERP animations for source transformations (position, scale, rotation).
- Easing functions: `linear`, `easeInOut`, `easeOut`, `easeIn`, `bounce`.
