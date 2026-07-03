# Known Limitations & Technical Debt

This document registers the verified constraints, performance risks, and structural limitations of the current BH Studio (EffectStore) implementation.

---

## 1. Structural & Architectural Constraints

### A. Local Loopback Assumption (Same Machine Requirement)
*   **Limitation**: The backend server is hardcoded to serve assets at `localhost` and `127.0.0.1`.
*   **Consequence**: OBS Studio must be installed and running on the same physical computer as the Electron application. A streamer cannot offload overlay rendering to a secondary dedicated streaming PC without refactoring host configurations.

### B. Single-User Database Binding
*   **Limitation**: MongoDB is local and does not use a cross-device syncing model.
*   **Consequence**: If a user logs in from a different machine, their mappings, designer templates, and custom WebM files are not automatically synchronized.

---

## 2. Technical Debt & Code Quality Risks

### A. Monolithic JavaScript Bindings (home.js)
*   **Limitation**: `desktop/renderer/js/home.js` contains over 4,000 lines of code. It handles rendering lists, binding events, managing category filtering, processing WebSockets, displaying warnings, and tracking state.
*   **Risk**: High maintenance cost and risk of regression. Modifying or adding UI elements can easily result in syntax or logic bugs.

### B. String-based Custom ID Conventions
*   **Limitation**: Custom effects are identified using standard string prefixes (`custom-1783...`), whereas system store effects are identified using MongoDB `ObjectId` structures.
*   **Consequence**: Mongoose models and queries must bypass standard type validation and catch CastErrors explicitly when querying by `_id`.

---

## 3. Performance & Resource Risks

### A. Queue Backlog with Heavy WebM Media Files
*   **Limitation**: WebM transparency layers are processor-intensive. In the event of high gift spam, queuing dozens of overlay effects can trigger high GPU/CPU utilization in OBS Studio.
*   **Risk**: Stream frame drops or lagging game capture.
