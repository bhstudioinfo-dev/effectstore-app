# Phase 2A - Menu Designer High-Risk Cleanup

## Files Changed

- `desktop/renderer/js/gift-menu-designer.js`
- `backend/routes/tiktok.js`
- `docs/PHASE2A_MENU_DESIGNER_CLEANUP.md`

## Legacy Code Found

### Orphaned Goal Board Drag Modes

Found in `desktop/renderer/js/gift-menu-designer.js`:

- `this.goalBoard.items`
- `goal-move`
- `goal-resize`

Current Menu Designer canvas uses `this.items`. No reachable current UI path creates `dragState.mode = 'goal-move'` or `dragState.mode = 'goal-resize'`.

Action taken:

- Removed the stale constructor `this.goalBoard` state.
- Replaced the old `goal-move` / `goal-resize` handlers with a short guard that disables those legacy modes if they ever appear.
- Removed the old mouseup finish path for `goal-*` drag modes.
- Left current `this.items` move/resize/drag/layer behavior untouched.

## What Was Guarded Or Fixed

### Asset Upload False Success

Problem:

- Frontend asset upload called `/api/tiktok/goal-board/upload-asset`.
- Backend returned `success: true` with `asset: null`, causing a fake success flow.

Change:

- Backend now returns HTTP `501`:

```text
Asset upload chưa được hỗ trợ ở phiên bản hiện tại.
```

Result:

- Frontend now falls into its existing error notification path.
- Existing media rendering remains untouched for layouts that already contain a real `assetUrl`.

### Session-Only Template Save Clarity

Problem:

- `showSaveTemplateModal()` creates templates only in current JS memory.
- Messaging could be mistaken as permanent save.

Change:

- Notification text now says:

```text
Mẫu đã lưu tạm trong phiên hiện tại. Chức năng lưu vĩnh viễn sẽ được hoàn thiện sau.
```

Result:

- Session-only behavior remains.
- No backend persistence was added.

### Marketplace Template Missing Function Guard

Problem:

- `buyOrUseTemplateFromSidebar()` expected `window.app.buyOrUseMenuTemplate`.
- `home.js` does not define that function.

Change:

- Active method now checks for the function.
- If missing, it shows:

```text
Chức năng mua mẫu đang được hoàn thiện.
```

Result:

- Clicking marketplace buy/use no longer crashes or routes into an undefined function.
- Payment/marketplace implementation remains unfinished.

Note:

- The previous encoded-alert method was renamed to `legacyBuyOrUseTemplateFromSidebar` and is not called by UI. It remains only because the old encoded string resisted safe patch deletion.

### Rename Layout Behavior

Problem:

- Frontend rename posted `{ id, name }`, but backend save route did not handle rename-by-id correctly.
- UI could report success without persistence.

Change:

- Backend `POST /api/tiktok/gift-menu-layout` now detects rename-only requests and updates the requested non-template layout by `_id` and `userId`.
- If the layout is active, the local OBS mirror JSON is refreshed.
- Normal save/load routes remain in place.
- Frontend now throws if rename HTTP response is not ok or `success` is false.

Result:

- Rename success is now tied to actual backend success.

## What Remains Unfinished

- Real asset upload/storage/listing for images, video, WebM, and MP4.
- Persistent custom template save/load backend.
- Template marketplace purchase, entitlement, ownership, and pricing persistence.
- Manual group/ungroup UI for arbitrary selected layers.
- Horizontal auto-scroll/marquee.
- Cleanup of all mojibake text in existing Menu Designer strings.

## Test Results

Commands run:

```text
node --check desktop\renderer\js\gift-menu-designer.js
node --check backend\routes\tiktok.js
npm.cmd test
```

Results:

- JavaScript syntax check passed for `gift-menu-designer.js`.
- JavaScript syntax check passed for `backend/routes/tiktok.js`.
- `npm.cmd test` passed. The repository test script is a placeholder that prints `All tests passed!`.

Manual checklist:

- App starts: not manually launched in this shell.
- Menu Designer opens: not manually launched in this shell.
- Add gift works: code path untouched; not manually exercised.
- Move/resize works: current `this.items` move/resize path untouched; syntax verified.
- Save layout works: save route preserved; syntax verified.
- Save & Export still works: OBS setup path untouched; syntax verified.
- Upload asset no longer fake succeeds: backend now returns 501 error.
- Save template no longer claims permanent save: notification text updated.
- Marketplace buy/use no longer crashes: missing function guard added.
- No console syntax errors: static syntax checks passed.
