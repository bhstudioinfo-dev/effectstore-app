# LIVEFLOW AGENT INSTRUCTIONS & PRESERVATION RULES

Before modifying any file in this repository, you MUST follow the architectural preservation rules below:

## 1. Video & Audio DRM Rules
- **NEVER delete preview WebM files:** `uploads/previews/${effectId}.webm` must ALWAYS be preserved for instant Store hover previews (<1ms). When encrypting to `.enc`, copy to a temp file first.
- **Opus Audio:** FFmpeg VP9 transcoding must always keep stereo Opus audio (`-map 0:v:0 -map 0:a? -c:a libopus -b:a 128k`).
- **Exact Duration:** Read video duration using FFmpeg stderr parser to 0.1s accuracy. Do not show duration badges on `menu_template` products.

## 2. Cloud & Database Rules
- **Direct Atlas Mode:** The database is connected directly to MongoDB Atlas.
- **NO Render Fallbacks:** Never introduce `https://effectstore-app.onrender.com` as fallback for empty URLs.

## 3. Admin & UI Performance
- **Non-blocking Approvals:** `approvePayment` and `rejectPayment` in `desktop/renderer/js/home.js` must NEVER call `showAppLoadingOverlay`. Use inline button state only.
- **OBS Isolation:** On logout, clear OBS overlay state via `/api/tiktok/gift-menu-overlay-clear`.

## 4. Verification
- Always verify changes with `npm test` before concluding tasks.
