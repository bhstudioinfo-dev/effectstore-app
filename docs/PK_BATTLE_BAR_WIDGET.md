# PK Battle Bar Widget (Bảng PK Nhóm)

The PK Battle Bar is a high-engagement livestream widget designed for TikTok Live streamers. It displays a real-time, versus-style progress bar split into segments representing 2 to 5 competing teams or players (idols).

## 1. Purpose
The widget gamifies TikTok Live sessions by showing active team competition. Viewers send specific gifts to support their favorite team, which shifts the segmented progress bar in real-time. It features:
- Solid 3D-gradient segment mapping for 2, 3, 4, or 5 players.
- Leader detection: displays a crown (👑) and active neon border glow around the card of the leading player.
- Responsive layout scaling: automatically hides player headers and subtitles under compact dimensions.

## 2. Data Model
The widget is stored in the layout's layers JSON config under `type: "goal-bar"` with `barStyle: "pk"`.

### Schema Fields
- `id` (String): Unique identifier.
- `type` (String): `"goal-bar"`.
- `barStyle` (String): `"pk"`.
- `themeStyle` (String): `"neon"` or `"classic"`.
- `barHeight` (Number): Height of the progress bar in pixels.
- `borderRadius` (Number): Border corner radius in pixels.
- `fontSize` (Number): Base font size for titles/names.
- `subtitleFontSize` (Number): Subtitle text font size.
- `subtitleText` (String): Optional footer/subtitle text.
- `pkPlayers` (Array): List of N players (length 2 to 5):
  - `name` (String): Player or team display name.
  - `score` (Number): Current accumulated score.
  - `color` (String): Hex color code for the segment.
  - `giftId` (String): Matched target gift ID (e.g. `"rose"`).
  - `giftName` (String): Display name of the matching gift.

Example JSON config:
```json
{
  "id": "neon_purple_goal_widget",
  "name": "⚡ THANH PK NHÓM NHẢY",
  "type": "goal-bar",
  "x": 90,
  "y": 800,
  "w": 900,
  "h": 160,
  "barHeight": 54,
  "barStyle": "pk",
  "themeStyle": "neon",
  "pkPlayers": [
    { "name": "TEAM RED", "score": 120, "color": "#ef4444", "giftId": "rose", "giftName": "Rose" },
    { "name": "TEAM BLUE", "score": 80, "color": "#3b82f6", "giftId": "coffee", "giftName": "Coffee" }
  ]
}
```

## 3. Editor Render
In the Canva layout builder, the widget is loaded and rendered in real-time inside the stage workspace.
- Path: `desktop/renderer/js/shared-render-engine.js` -> `renderGoalBar()`.
- Renders the player banners row at the top and the segmented PK bar below it.
- Reflects all live drag-and-drop scaling, width, and height modifications immediately.

## 4. Overlay Render
The browser-source OBS overlay loads the same shared rendering script from the backend.
- Path: `backend/public/shared-render-engine.js` -> `renderGoalBar()`.
- Guarantees 100% visual pixel-per-pixel consistency between the editor layout and OBS canvas.
- Renders using clean responsive styling: if the widget is smaller than `width < 420` or `height < 120`, secondary headers/labels are hidden automatically to ensure a clean layout.

## 5. Inspector Controls
The widget configuration inspector provides specialized controls when `selected.barStyle === 'pk'`:
- **Số lượng đấu thủ**: Dropdown selecting between 2, 3, 4, or 5 players. Selecting a value triggers `changePkPlayerCount()`, which automatically scales the player list and assigns distinctive default colors (`#ef4444`, `#3b82f6`, `#10b981`, `#f97316`, `#a855f7`).
- **Danh sách đấu thủ**: A dynamic card list for each active player allowing modification of:
  - Custom Color (Color picker input).
  - Team Name (Text input).
  - Current Score (Number input).
  - Matched Gift (Custom select dropdown list).
- Actions: **Gửi quà Test** randomly adds `+10` points to a random player to simulate active competition; **Reset lại đầu** restores starting counts.

## 6. Runtime Event Handling
When a TikTok Live gift event is processed:
- Path: `backend/services/tiktokService.js`.
- If the target widget layer is a PK goal bar (`barStyle === 'pk'`), the service checks `layer.pkPlayers`.
- Matches the incoming `giftId` (or `giftName`) against each player's matching configuration.
- Increments the correct player's `score` directly, and pushes real-time WebSocket socket updates to the OBS browser overlay to animate the bar shift.

## 7. Save/Export
- The layout is saved to `backend/uploads/gift-menu-layout.json` via HTTP POST.
- The `pkPlayers` state is saved directly into the JSON.
- OBS overlays reload and retrieve the updated JSON schema on restart.

## 8. Verification & Test Checklist
1. Add Bảng PK Nhóm to canvas.
2. Switch teamCount between 2, 3, and 4 players.
3. Confirm it remains ONE horizontal segmented bar.
4. Edit team names and confirm editor updates.
5. Change colors and verify segment gradients update.
6. Change matching gifts and verify icon thumbnails.
7. Click "Gửi quà Test" and confirm random scoring updates.
8. Save layout, reload, and verify persistence.
9. Verify standard non-PK goal widgets still work cleanly (no regressions).

## 9. Future Improvements
- **Winner Animations**: Trigger full-screen fireworks or confetti animations for the winning team when the PK timer expires.
- **PK Timer**: Add an integrated countdown timer directly inside the widget header to automate game duration.
