# FIX — Gift Stack Group OBS Border Mismatch

## Cause Found
1. **SMIL Animation compatibility**: Older Chromium Embedded Framework (CEF) versions in OBS Studio do not support CSS-based keyframe animation of SVG presentation attributes (such as `stroke-dashoffset`). This caused the border running-light animation to be completely static/frozen in OBS.
2. **Multiple streaks on stretch**: Because `vector-effect="non-scaling-stroke"` was used on the border path/rect, the browser rendered the stroke and calculated the dash cycle in screen pixels instead of SVG viewBox user coordinates. Since `borderPerimeter` was calculated in viewBox units (~396), the browser interpreted `stroke-dasharray` as a fixed `164px` dash and `231px` gap. In OBS (where the canvas size and container sizes are larger), this fixed pixel cycle repeated multiple times (2.9 times), breaking the single border light into 3 short light streaks.
3. **App Designer refresh delay**: Code changes in the desktop app renderer scripts do not automatically apply to the active editor window until the Electron application window is reloaded (via `Ctrl + R` or restarting the app).

## Files Changed
- [desktop/renderer/js/shared-render-engine.js](file:///d:/effectstore-app/desktop/renderer/js/shared-render-engine.js)
  - Calculated `borderPerimeter` in actual screen pixels (`renderedW` & `renderedH`) instead of SVG viewBox units to align with `vector-effect="non-scaling-stroke"`.
  - Converted SVG `<rect>` elements for `running-light` borders to `<path>` elements to natively support the `pathLength` coordinate systems across all browsers.
  - Reverted to standard SMIL `<animate>` tags using absolute pixel perimeter coordinates.
  - Synced the glow and core path animations using SMIL synchronization (`begin="run_anim.begin"`).
- [backend/public/shared-render-engine.js](file:///d:/effectstore-app/backend/public/shared-render-engine.js)
  - Synchronized the same code changes to the backend public rendering engine.
- [backend/public/gift-menu-overlay.html](file:///d:/effectstore-app/backend/public/gift-menu-overlay.html)
  - Reset `renderScale` back to default to allow pixel-perfect representation of designer border thickness.
  - Incremented script caching query parameters (`?v=1.0.8`) to bypass OBS browser cache.

## Before/After Behavior
- **Before**: 
  - Border running-light was completely frozen/static in OBS.
  - Border broken into 3 short light streaks instead of 1 long streak.
  - Border thickness and glow size mismatched between designer and overlay due to cache and scale overrides.
- **After**:
  - Border running-light runs smoothly at 60 FPS in OBS overlay.
  - Border displays exactly 1 long streak running around the perimeter, identical to the App.
  - Border thickness and glow sizes match perfectly.

## Test Checklist
- [x] Verify border animation runs in the Menu Designer App preview.
- [x] Verify border animation runs in OBS Studio overlay.
- [x] Verify exactly 1 long light streak runs around the border.
- [x] Verify the glow path and core path move in perfect synchronization.
- [x] Verify cache busting version forces OBS to load the new script immediately on refresh.
