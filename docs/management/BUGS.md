# 🐛 KNOWN_BUGS.md

## 🐞 Existing Bugs
- **Video AbortError**: Rapidly switching tabs or diplaying effects can occasionally trigger a `DOMException: The play() request was interrupted by a call to pause()`. 
  - *Status*: Partially mitigated by `.catch(() => {})` on play calls.
- **WebSocket Reconnection**: Rare cases where the backend fails to re-detect a restarted OBS instance without a manual service restart.
- **CSS Overflow**: The Gift Library in the Designer can sometimes overflow the container on low-resolution screens.

## 🛠️ Temporary Hacks
- **Manual Cache Clear**: Users must press `Ctrl + R` to see changes in `home.js` due to Electron's caching of local files.
- **Fake Uses Counter**: The `fakeUses` field in the Effect model is used to manually inflate popularity for marketing purposes.
- **Hardcoded Admin**: `admin@effectstore.vn` bypasses several validation checks directly in the code.

## ⚠️ Unstable Modules
- **Gift Menu Canvas**: The Fabric.js serialization can sometimes fail to restore complex grouped objects perfectly.
- **TikTok Reconnection**: The 15-second retry logic in `tiktokService.js` can occasionally lead to duplicate client instances if not careful.

## 🔇 Ignored Warnings
- `punycode` deprecation warning from `tiktok-live-connector` (upstream dependency).
- `Express` body-parser deprecation warnings in older parts of the backend.
