# 🧠 STACK_DECISIONS.md

## 🛠️ Technology Stack
We prioritize stability, low latency, and ease of deployment for streamers.

### 1. Node.js & Electron
- **Decision**: Use Node.js for the backend and Electron for the frontend.
- **Rationale**: Allows sharing a single JavaScript ecosystem and provides a native-like experience for Windows users while allowing deep system integration (like starting/stopping services).

### 2. MongoDB (Local/Cloud)
- **Decision**: MongoDB for persistence.
- **Rationale**: The flexible document structure is ideal for storing varied metadata for effects and complex serialized objects from the Gift Menu Designer (Fabric.js).

### 3. WebSocket (Port 9001)
- **Decision**: Custom `ws` implementation for real-time alerts.
- **Rationale**: TikTok events and OBS triggers require sub-millisecond responsiveness. HTTP polling is insufficient.

### 4. Vanilla CSS (Glassmorphism)
- **Decision**: Avoid utility frameworks like Tailwind for the core UI.
- **Rationale**: Maximum control over the "Premium Pro" aesthetic, specifically complex backdrop filters, HSL-based gradients, and neon glows that are easier to maintain in standard CSS.

### 5. DRM (Encrypted WebM)
- **Decision**: Files are encrypted on disk and decrypted in memory during streaming.
- **Rationale**: High-value visual assets must be protected from simple "copy-paste" theft while maintaining performance for OBS browser sources.

## 📐 Architecture Patterns
- **Service Singletons**: Services (TikTok, OBS) are instantiated once and maintain long-running socket connections.
- **Sequential Queue**: Gifts are processed FIFO (First In, First Out) to ensure the streamer's screen isn't cluttered and each donor gets their moment.
- **Class-based Frontend**: The `EffectStoreApp` class in `home.js` acts as a central mediator for UI state, preventing global variable pollution.
