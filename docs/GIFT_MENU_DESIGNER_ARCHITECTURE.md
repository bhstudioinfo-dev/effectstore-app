# Gift Menu Designer Architecture

Tài liệu này mô tả trạng thái hiện tại của Gift Menu Designer trong working tree tại thời điểm kiểm tra. Phạm vi là tài liệu hóa kỹ thuật, không đánh giá theo thiết kế mong muốn tương lai và không giả định hành vi chưa tồn tại trong code.

Không có source code nào cần được sửa để hiểu tài liệu này. Các file chính được tham chiếu ở cuối tài liệu.

---

## 1. Overview

### Purpose

Gift Menu Designer là công cụ thiết kế visual overlay cho TikTok Live. Module này cho phép streamer hoặc đội vận hành livestream dựng menu quà, bảng mục tiêu, danh sách mục tiêu, bảng top người tặng, nhóm quà chạy ngang/dọc, text và asset tùy chỉnh rồi xuất sang OBS dưới dạng browser source.

Mục tiêu thực tế của module là:

- Tạo overlay quà/mục tiêu đẹp mắt cho livestream.
- Cho phép chỉnh bằng kéo thả thay vì sửa code.
- Lưu nhiều layout theo tài khoản.
- Đồng bộ layout đang active sang OBS overlay.
- Nhận update runtime từ TikTok/backend qua websocket để thay đổi tiến độ quà/mục tiêu.

### Target users

- Streamer TikTok Live cá nhân.
- Operator chạy nhiều phòng live.
- Agency/đội vận hành cần template hóa giao diện livestream.
- Admin BH Studio cần tạo/publish template marketplace.

### Current capabilities

- Editor dạng canvas với safe area và nhiều tỉ lệ màn hình: `9:16`, `16:9`, `1:1`.
- Kéo thả gift từ thư viện TikTok vào canvas.
- Thêm custom gift cá nhân bằng media `PNG/GIF/WebM` hoặc text icon.
- Thêm text layer.
- Upload asset menu/mục tiêu từ máy người dùng.
- Thêm template/widget mục tiêu.
- Chỉnh vị trí, kích thước, visibility, lock, z-index.
- Multi-select, align, distribute.
- Snap vào safe area.
- Zoom/pan canvas.
- Undo/redo nội bộ.
- Group gift thành `gift-stack-group`.
- Ungroup `gift-stack-group`.
- Chỉnh nhiều thuộc tính chữ/nền/border/animation/effect cho gift và group.
- Lưu layout vào backend MongoDB.
- Fallback lưu localStorage khi chưa đăng nhập hoặc lỗi tải layout.
- Xuất layout sang OBS bằng browser source.
- Overlay runtime đọc layout active từ local JSON backend.
- Overlay runtime update theo websocket và polling.
- Admin publish layout thành template marketplace.

### Current limitations

- Editor chính vẫn là một class lớn `GiftMenuDesigner`, chứa nhiều trách nhiệm: UI rendering, state, drag, inspector, save/export, template, asset, websocket.
- Shared renderer đã tồn tại nhưng editor và overlay vẫn còn một số logic render/HTML riêng.
- Inspector đã có file `inspector-engine.js`, nhưng logic inspector thực tế vẫn nằm nhiều trong `gift-menu-designer.js`.
- Group system hiện tại chủ yếu phục vụ `gift-stack-group`, chưa phải layer group tổng quát.
- Clipboard/copy/paste chưa có implementation rõ ràng.
- Dirty state chưa được quản lý như một state riêng; save phụ thuộc thao tác người dùng.
- Overlay active layout được sync qua một file local JSON chung, nên chưa phải mô hình multi-room/cloud hoàn chỉnh.
- Một số string trong code hiện có dấu hiệu encoding/mojibake từ các lần sửa trước.
- Chưa thấy test tự động chuyên biệt cho Gift Menu Designer.

### Overall architecture

```text
Electron Renderer
  desktop/renderer/js/gift-menu-designer.js
        |
        | fetch / save / upload / publish
        v
Backend API
  backend/routes/tiktok.js
  backend/models/GiftMenuLayout.js
        |
        | MongoDB layouts
        | local active OBS JSON
        v
Overlay Runtime
  backend/public/gift-menu-overlay.html
  backend/public/shared-render-engine.js
  backend/public/gift-menu-renderer.css
        |
        | OBS browser source
        v
OBS Scene Source
  gift_menu or gift_menu_overlay
```

### Current maturity level

Module đang ở mức feature-rich beta: chức năng thương mại đã khá nhiều, đủ chứng minh sản phẩm, nhưng kiến trúc chưa “sạch” ở mức dài hạn. Phần mạnh là tốc độ phát triển tính năng, renderer dùng chung, save/export có format rõ. Phần yếu là class editor quá lớn, các flow còn đan xen, một số behavior runtime phụ thuộc local JSON/polling, và technical debt encoding/duplicate renderer vẫn còn.

---

## 2. Editor Architecture

### Main editor class

Editor nằm chủ yếu trong:

- `desktop/renderer/js/gift-menu-designer.js`

Class chính:

- `GiftMenuDesigner`

State chính trong constructor:

- `items`: danh sách object/layer trên canvas.
- `gifts`, `filteredGifts`: thư viện gift TikTok + custom gift local.
- `selectedId`, `selectedIds`: selection hiện tại.
- `aspectRatio`: tỉ lệ thiết kế.
- `canvasSize`: kích thước stage nội bộ.
- `layouts`, `currentLayoutId`, `currentLayoutName`: project/layout state.
- `zoomLevel`, `panX`, `panY`: viewport state.
- `dragState`: trạng thái kéo/resize/rotate/pan.
- `history`, `historyIndex`: undo/redo.
- `snapEnabled`, `activeGuides`: snap/guides.
- `itemRegistry`, `coordinateEngine`, `sharedRenderEngine`, `inspectorEngine`: các service/engine hỗ trợ.

### Canvas

Canvas UI có cấu trúc chính:

```text
gmd-canvas-shell
  gmd-canvas-viewport
    gmd-stage
      gmd-safe-area
      gmd-guide-x
      gmd-guide-y
      gmd-item-<id>...
```

`gmd-stage` là vùng thiết kế chính. `gmd-safe-area` là vùng an toàn theo tỉ lệ xuất thật. Object được position bằng absolute CSS theo tọa độ stage.

### Viewport

Viewport hỗ trợ:

- Fit-to-screen theo kích thước container.
- Zoom bằng nút toolbar hoặc `Ctrl/Cmd + wheel`.
- Pan khi zoom lớn hơn 1 bằng space/middle mouse/wheel.
- Transform tổng:

```text
translate(-50%, -50%)
translate(panX, panY)
scale(fitScale * zoomLevel)
```

### Coordinate system

Có 3 hệ tọa độ cần phân biệt:

1. Stage coordinates  
   Dùng trong editor DOM: `x`, `y`, `width`, `height`.

2. Logical/safe-area coordinates  
   Dùng cho một số widget và chuyển đổi với `coordinateEngine` nếu có.

3. Export coordinates  
   Dùng khi lưu `exportedItems` cho OBS overlay.

Tỉ lệ hiện tại:

| Ratio | Canvas | Safe area | Export |
|---|---:|---:|---:|
| `9:16` | `720x960` | `360x640` | `1080x1920` |
| `16:9` | `960x720` | `640x360` | `1920x1080` |
| `1:1` | `900x900` | `480x480` | `1080x1080` |

Khi đổi ratio, editor scale lại `x/y/width/height` theo safe area cũ sang safe area mới.

### Selection

Selection gồm:

- Single selection qua click object.
- Multi-selection bằng `Shift + click`.
- Empty canvas click để clear selection.
- `selectedId` giữ object chính.
- `selectedIds` giữ toàn bộ selection.

Object bị `locked` không được move/resize/delete theo các flow chính.

### Transform

Các transform chính:

- Move bằng drag item.
- Resize bằng handles.
- Rotate bằng rotate handle.
- Z-index bằng layer actions.
- Align/distribute khi multi-select.
- Clamp để không vượt quá canvas.
- Snap vào safe area nếu bật.

### Resize

Resize dùng handle của selection overlay. Với một số item có `lockRatio`, resize width/height sẽ bảo toàn tỷ lệ. Một số widget có thêm mapping giữa `width/height` stage và `w/h` logical.

Riêng `gift-stack-group` có logic resize riêng để cập nhật box group.

### Rotation

Editor có rotate drag handler. Gift item mặc định có `rotation`. Một số render contract trong registry đánh dấu không support rotation cho widget, nhưng editor vẫn có logic rotate ở mức chung cho selected wrapper. Vì vậy rotation là tính năng có tồn tại, nhưng mức hỗ trợ thực tế khác nhau theo loại object.

### Zoom

Zoom range hiện tại khoảng `0.5` đến `5`. Khi zoom về `<= 1`, pan được reset để stage về giữa.

### Pan

Pan hoạt động khi:

- Zoom lớn hơn 1.
- Người dùng giữ Space hoặc dùng middle mouse/canvas drag phù hợp.
- Wheel không kèm Ctrl/Cmd cũng có thể dịch viewport.

### Snap

Snap hiện tại là snap vào safe area:

- Left
- Center X
- Right
- Top
- Center Y
- Bottom

Ngưỡng snap khoảng `8px`. Guides hiển thị bằng `gmd-guide-x` và `gmd-guide-y`.

### Grid

Code hiện tại có visual safe area và guides, nhưng không thấy hệ grid snapping đầy đủ theo ô lưới. Nếu UI có nền check/grid thì chủ yếu là styling/canvas background, không phải grid engine hoàn chỉnh.

### Guides

Guides chỉ hiển thị khi snap active trong lúc move. `activeGuides` lưu trạng thái x/y. Không thấy custom guide kéo thả như Figma/Photoshop.

### Mouse interaction

Các interaction chính:

- Click gift card/template/asset để add hoặc drag vào canvas.
- Drag gift/template/asset từ library vào canvas.
- Click item để select.
- Shift click để multi-select.
- Drag item để move.
- Drag handle để resize.
- Drag rotate handle để rotate.
- Mouse wheel để pan/zoom.
- Canvas click để clear selection.

### Keyboard shortcuts

Các phím hiện có:

- `Delete` / `Backspace`: delete selected items.
- `Ctrl/Cmd + D`: duplicate selected.
- `Ctrl/Cmd + Z`: undo.
- `Ctrl/Cmd + Y`: redo.
- `Space`: pan mode.

Không thấy copy/paste clipboard chuẩn `Ctrl+C/Ctrl+V` được implement đầy đủ.

---

## 3. Object Model

### Common fields

Hầu hết object/layer dùng các field chung:

| Field | Meaning |
|---|---|
| `id` | ID nội bộ, thường dạng `itm_<timestamp>_<random>` |
| `type` | Loại object; gift legacy có thể không có type hoặc type `gift` |
| `name` | Tên hiển thị/layer name |
| `x`, `y` | Vị trí stage |
| `width`, `height` | Kích thước stage |
| `w`, `h` | Kích thước logical cho nhiều widget |
| `rotation` | Góc xoay nếu được dùng |
| `zIndex` | Thứ tự layer |
| `visible` | Có render hay không |
| `locked` | Có cho thao tác chỉnh sửa hay không |
| `lockRatio` | Resize bảo toàn tỉ lệ |
| `groupId` | Group liên quan, chủ yếu trong một số flow legacy |

Serialization hiện tại lưu raw `items` và `exportedItems`. `items` giữ state editor; `exportedItems` giữ state đã scale sang kích thước OBS/export.

### Registry object types

Registry nằm ở:

- `desktop/renderer/js/item-registry.js`

Các type được đăng ký:

| Type | Purpose | Status |
|---|---|---|
| `gift` | Gift item đơn lẻ | Stable |
| `text` | Text layer | Stable |
| `media-asset` | PNG/GIF/WebM asset | Stable |
| `goal-bar` | Progress bar mục tiêu | Stable |
| `goal-circle` | Vòng mục tiêu | Stable |
| `boss-bar` | Boss HP/challenge bar | Stable |
| `combo` | Combo popup/counter | Stable |
| `mystery-chests` | Mystery chest reward progress | Stable/Experimental |
| `top-contributors` | Danh sách top contributors | Experimental |
| `podium-contributors` | Podium top contributors | Experimental |
| `goal-list` | Danh sách nhiều mục tiêu | Stable/Experimental |
| `gift-stack-group` | Nhóm gift chạy/stack | Stable/Experimental |

### Gift Item

Gift item có thể đại diện gift TikTok hoặc custom gift local.

Fields chính:

- `type`: `gift` hoặc absent ở legacy.
- `giftId`
- `giftName`
- `giftIcon`
- `iconDisplayMode`: `media` hoặc `text`
- `iconText`
- `iconTextColor`
- `iconTextBgColor`
- `iconTextFontSize`
- `showName`
- `namePosition` / `textPosition`
- `textSize`
- `textColor`
- `textAlign`
- `textOffsetX`, `textOffsetY`
- `showTextBg`
- `textBgStyle`
- `textBgColor`
- `textBgOpacity`
- `textBgRadius`
- `textBgPaddingX`, `textBgPaddingY`
- `textBgGradientFrom`, `textBgGradientTo`
- `aura`
- `animation`
- `currentCount`
- `targetCount`

Transform:

- `x`, `y`, `width`, `height`, `rotation`, `zIndex`.
- `lockRatio` mặc định bật.

Visibility/lock:

- `visible` quyết định render.
- `locked` chặn thao tác chỉnh sửa.

Serialization:

- Raw gift lưu trong `items`.
- Khi export, vị trí/kích thước/text size được scale sang export size.

### Text

Fields chính:

- `type: "text"`
- `text`
- `color`
- `fontSize`
- `fontWeight`
- `fontFamily`
- `textAlign`
- `textShadow`
- `opacity`

Transform:

- `x`, `y`, `width`, `height`, `rotation`, `zIndex`.

Serialization:

- Text được scale font size và box theo export.

### Media Asset / Image / PNG / GIF / WebM

Fields chính:

- `type: "media-asset"`
- `assetUrl`
- `assetName`
- `isWebM`
- `fitMode`
- `opacity`
- `autoplay`
- `loop`
- `muted`
- `playsinline`

File upload hiện nhận asset menu/mục tiêu qua endpoint goal-board upload. UI accept `PNG/GIF/WebM`.

Transform:

- `x`, `y`, `width`, `height`, `rotation`, `zIndex`.

Rendering:

- WebM/video dùng `<video>`.
- PNG/GIF dùng `<img>`.

### Goal Bar

Fields chính:

- `type: "goal-bar"`
- `giftId`, `giftName`, `giftIcon`
- `targetCount`, `currentCount`
- `name`
- `barColor`, `glowColor`
- `barStyle`
- `fontSize`, `countFontSize`
- `showGiftIcon`, `showGiftName`, `showPercent`
- `hideBg`, `useCustomBg`, `bgColor`
- `useCustomTextColor`, `textColor`
- `contentOffsetY`

Mục đích:

- Hiển thị tiến độ quà/mục tiêu livestream.

### Goal Circle

Fields tương tự goal bar nhưng render dạng vòng/circular progress. Có target/current, gift icon/name, màu progress/glow, font settings.

### Boss Bar

Fields chính:

- `type: "boss-bar"`
- `bossName`
- `bossSub`
- `targetCount`, `currentCount`
- `barColor`, `glowColor`
- `barHeight`
- `fontSize`
- `hideBg`, custom bg/text flags

Mục đích:

- Biểu diễn HP boss/challenge bị “đánh” bằng gift.

### Combo

Fields chính:

- `type: "combo"`
- `comboCount`
- `name`
- `fontSize`
- `numberFontSize`
- `barColor`
- `hideBg`, custom bg/text flags

Mục đích:

- Hiển thị combo/quà liên tiếp hoặc boost popup.

### Mystery Chests

Fields chính:

- `type: "mystery-chests"`
- `targetCount`, `currentCount`
- `milestones`
- `barColor`
- `glowColor`
- `titleColor`
- `barHeight`
- `fontSize`

Mục đích:

- Hiển thị thanh mở rương/mốc thưởng.

### Top Contributors

Fields chính:

- `type: "top-contributors"`
- `contributors`
- `showValue`
- `fontSize`
- `rowFontSize`
- `valueFontSize`
- `barColor`
- custom bg/text flags

Mục đích:

- Hiển thị danh sách người đóng góp/top tặng quà.

### Podium Contributors

Fields tương tự top contributors nhưng render top 3 dạng bục/podium.

### Goal List

Fields chính:

- `type: "goal-list"`
- `goals`: danh sách mục tiêu con
- `name`
- `footerText`
- `fontSize`, `rowFontSize`, `footerFontSize`
- `barHeight`
- `autoScroll`
- `autoScrollSpeed`
- `shimmerEffect`
- `showGiftIcon`, `showGiftName`
- `hideBg`, custom bg/text flags

Mỗi goal con thường có:

- `giftId`
- `giftName`
- `giftIcon`
- `target`
- `current`

### Gift Stack Group

Fields chính:

- `type: "gift-stack-group"`
- `children`: list gift items copied into group.
- `layoutDirection`: `vertical` hoặc `horizontal`.
- `gap`
- `iconSize`
- `textGap`
- `showName`
- `textPosition`
- `textSize`
- `textColor`
- `showPanel`
- `panelStyle`
- `panelColor`
- `panelGradientFrom`, `panelGradientTo`
- `panelOpacity`
- `panelBlur`
- `panelPadding`
- `panelRadius`
- `panelEffect`
- `showBorder`
- `borderStyle`
- `borderColor`
- `borderGradientFrom`, `borderGradientTo`
- `borderWidth`
- `borderRadius`
- `borderEffect`
- `loopEnabled`
- `loopDirection`
- `loopSpeed`

Rendering:

- Render qua `renderGiftStackGroup` trong shared render engine.
- Có hỗ trợ marquee/loop bằng CSS animation và duplicate children khi cần.

---

## 4. Group System

### Current group implementation

Group hiện tại không phải hệ layer group tổng quát. Nó là một object đặc biệt: `gift-stack-group`.

Flow tạo group:

1. Người dùng multi-select từ 2 gift trở lên.
2. Editor lọc những item là gift, visible, unlocked.
3. Tính bounding box của các gift được chọn.
4. Sort children theo `y` rồi `x`.
5. Copy các gift vào `children` với `relativeX`, `relativeY`.
6. Tạo một item mới `gift-stack-group`.
7. Xóa các gift gốc khỏi root `items`.
8. Push group vào `items`.
9. Select group và ghi history.

### How groups are dissolved

Ungroup:

1. Lấy `gift-stack-group` selected.
2. Tính layout visual hiện tại của children.
3. Restore mỗi child thành root item với `x/y/width/height` mới.
4. Xóa group.
5. Normalize `zIndex`.
6. Select các item restored.
7. Push history.

### Nested groups

Không thấy hỗ trợ nested group thực sự. `children` của `gift-stack-group` được kỳ vọng là gift item, không phải object group bất kỳ.

### Horizontal group

`layoutDirection: "horizontal"` render children theo hàng ngang với `gap`, `iconSize`, panel/border.

### Vertical group

`layoutDirection: "vertical"` render children theo cột dọc với `gap`, `iconSize`, panel/border.

### Loop mode

`loopEnabled` bật animation chạy lặp. Các field liên quan:

- `loopDirection`
- `loopSpeed`
- Duplicate children ở render layer để tạo marquee mượt.

Loop nằm ở shared render engine/CSS, không phải timeline engine riêng.

### Spacing

Spacing chính:

- `gap`: khoảng cách giữa gift children.
- `textGap`: khoảng cách giữa icon và name.
- `panelPadding`: padding group panel.

### Auto layout

Gift stack group có auto layout theo direction/gap/icon size. Không có constraint engine tổng quát kiểu flexbox cho mọi object.

### Current limitations

- Chỉ group gift items.
- Không nested group.
- Không group text/media/widget chung.
- Không có transform matrix cho child; child chủ yếu được layout lại.
- Ungroup dùng visual layout hiện tại, không giữ nguyên toàn bộ quan hệ tương đối phức tạp.
- Một số legacy migration từ `itemRefs` vẫn tồn tại, cho thấy group data model từng thay đổi.

### Data model

```json
{
  "id": "grp_...",
  "type": "gift-stack-group",
  "x": 100,
  "y": 100,
  "width": 360,
  "height": 120,
  "children": [
    {
      "id": "itm_...",
      "type": "gift",
      "giftId": "5655",
      "giftName": "Rose",
      "relativeX": 0,
      "relativeY": 0
    }
  ],
  "layoutDirection": "horizontal",
  "gap": 10,
  "loopEnabled": false
}
```

---

## 5. Render Pipeline

### Canvas rendering

Editor render cycle:

```text
State change
  -> renderCanvas()
  -> requestAnimationFrame throttle
  -> renderCanvasActual()
  -> sort items by zIndex
  -> create/update DOM wrappers
  -> render item content
  -> render selection overlay
```

`renderCanvas()` có pending flag để tránh render liên tục trong cùng frame. `renderCanvas(sync=true)` gọi render ngay.

### Overlay rendering

Overlay nằm ở:

- `backend/public/gift-menu-overlay.html`

Overlay:

1. Load layout từ `/api/tiktok/gift-menu-overlay-layout`.
2. Dùng `exportedItems` nếu có, fallback `items`.
3. Render vào `#overlay-root`.
4. Poll layout định kỳ khoảng `700ms`.
5. Dùng signature để tránh render lại nếu layout không đổi.
6. Nhận websocket events để cập nhật progress/fade.

### OBS rendering

OBS nhận overlay qua browser source:

- Source name hiện dùng `gift_menu_overlay` hoặc giữ source cũ `gift_menu` nếu đã tồn tại.
- URL: `http://localhost:<PORT>/gift-menu-overlay.html?...`
- Kích thước source dựa vào `exportSize` từ local JSON layout, fallback `1080x1920`.

OBS setup route:

- `POST /api/obs/setup-gift-menu`

### Runtime rendering

Runtime rendering dùng:

- `backend/public/shared-render-engine.js`
- `backend/public/gift-menu-renderer.css`
- inline logic trong `gift-menu-overlay.html`

Một số item được render qua shared engine; overlay vẫn có trách nhiệm load layout, diff/signature, websocket và DOM orchestration.

### Update cycle

Các nguồn update:

- Editor local state update -> render editor canvas.
- Save layout -> backend MongoDB + local active JSON.
- Overlay polling -> reload active JSON if changed.
- Websocket `gift_menu_progress_update` -> update item progress.
- Websocket effect playback events -> fade overlay root.

### Render order

Render order dùng `zIndex` ascending. Item có zIndex cao hơn nằm trên.

### Layer order

Layer panel/action thay đổi `zIndex`. Sau một số thao tác, editor normalize hoặc cập nhật thứ tự layer.

### Caching

Editor caching hiện tại:

- DOM wrappers được reuse theo `gmd-item-<id>`.
- Mỗi wrapper có `contentSignature` JSON để tránh regenerate innerHTML nếu content không đổi.
- `requestAnimationFrame` throttle.

Overlay caching hiện tại:

- Layout signature từ `savedAt`, `exportSize`, `items`.
- Không rerender nếu signature không đổi, trừ force.

### Optimization

Đã có:

- Client-side PNG optimization khi upload asset lớn.
- Incremental DOM update trong editor.
- Shared renderer để tránh drift một phần giữa editor và overlay.
- Polling có signature guard.

Chưa thấy:

- Virtual canvas/layer virtualization.
- Offscreen canvas.
- Worker render.
- Object-level asset cache manager hoàn chỉnh.
- Automated performance budget.

---

## 6. Export / Import

### Current save format

Model MongoDB:

- `backend/models/GiftMenuLayout.js`

Schema chính:

| Field | Meaning |
|---|---|
| `userId` | Owner layout |
| `name` | Tên layout |
| `version` | Version format, default `2` |
| `savedAt` | Thời điểm save |
| `aspectRatio` | `9:16`, `16:9`, `1:1` |
| `canvasSize` | Canvas editor |
| `safeArea` | Safe area config |
| `exportSize` | Output size OBS |
| `items` | Raw editor items |
| `exportedItems` | Items đã scale cho overlay |
| `isActive` | Layout active của user |
| `isTemplate` | Template marketplace |
| `category`, `price`, `originalPrice`, `description`, `icon`, `isPremium` | Metadata template |

### JSON structure

Payload save layout gồm:

```json
{
  "id": "layoutId",
  "name": "Layout name",
  "version": 2,
  "aspectRatio": "9:16",
  "canvasSize": { "width": 720, "height": 960 },
  "safeArea": {
    "width": 360,
    "height": 640,
    "offsetX": 180,
    "offsetY": 160
  },
  "exportSize": { "width": 1080, "height": 1920 },
  "items": [],
  "exportedItems": []
}
```

### Import flow

Editor load flow:

1. Fetch `/api/tiktok/gift-menu-layout` nếu có token.
2. Nếu có active layout, normalize fields và load vào `items`.
3. Nếu không có backend layout, backend có thể tạo default layout.
4. Nếu lỗi hoặc chưa đăng nhập, fallback `localStorage.giftMenuDesignerLayoutV2`.
5. Reset selection/history và render canvas.

### Export flow

User action:

```text
Save / Save & Export
  -> saveLayout()
  -> build exportedItems
  -> POST /api/tiktok/gift-menu-layout
  -> backend saves MongoDB
  -> backend writes uploads/gift-menu-layout.json
  -> exportToOBS()
  -> POST /api/obs/setup-gift-menu
  -> OBS browser source points to gift-menu-overlay.html
```

### How overlay consumes exported layout

Overlay endpoint:

- `GET /api/tiktok/gift-menu-overlay-layout`

This route reads:

- `backend/uploads/gift-menu-layout.json`

Overlay ưu tiên `exportedItems` vì đã scale đúng output OBS. Nếu không có, fallback `items`.

---

## 7. Overlay Runtime

### How Gift Menu Overlay loads layout

Overlay page:

- `backend/public/gift-menu-overlay.html`

Load endpoint:

- `/api/tiktok/gift-menu-overlay-layout`

Behavior:

- Load initial layout on page start.
- Poll định kỳ khoảng `700ms`.
- Build signature để phát hiện thay đổi.
- Nếu layout missing, backend trả default empty layout.

### How runtime updates gift values

Editor và overlay đều lắng nghe websocket event:

- `gift_menu_progress_update`

Payload update có thể chứa:

- `giftId`
- `currentCount`
- `comboCount`
- `goals`
- `contributors`

Logic update tìm item matching gift/widget và mutate current values trong memory, sau đó rerender.

### How animation works

Animation hiện chủ yếu là CSS class/style trong shared renderer và CSS file:

- Gift aura.
- Gift animation class.
- Text background effects.
- Bar style effects.
- Panel effects.
- Border effects.
- Marquee/loop for stack group and goal list.

Không thấy timeline animation editor riêng.

### How loop works

Loop hiện có ở:

- `gift-stack-group` marquee.
- `goal-list` auto scroll.
- Media/video loop via `<video loop>`.

Loop speed được điều chỉnh bằng item property như `loopSpeed` hoặc `autoScrollSpeed`.

### How refresh works

Refresh runtime:

- Overlay polling reloads layout when signature changes.
- OBS setup route can refresh browser source URL/cache.
- Save layout writes local JSON used by overlay.

### How websocket updates arrive

Backend websocket server phát event. Overlay và editor tạo `WebSocket` đến port `9001` hoặc route tương ứng từ API host. Message parse JSON và dispatch theo `type`.

Các event liên quan hiện tại:

- `gift_menu_progress_update`
- `effect_playback_started`
- `effect_playback_finished`
- `effect_queue_empty`

Overlay fade behavior hiện phụ thuộc các effect playback events, đặc biệt `live_mapping` và `test_mapping`.

---

## 8. State Management

### Editor state

State chủ yếu nằm trong instance `GiftMenuDesigner`.

Không có Redux/Vuex/MobX hoặc store riêng. State mutation trực tiếp trong methods và callback event.

### Selection state

Selection:

- `selectedId`
- `selectedIds`

Flow:

- `setSelection()`
- `clearSelection()`
- `getSelectedItems()`
- `syncSelectionAfterDataChange()`

### Undo

Undo dùng snapshot:

- `createHistorySnapshot()`
- `pushHistory()`
- `undo()`

Snapshot chứa:

- `items`
- `selectedId`
- `selectedIds`
- `aspectRatio`

Max history khoảng `200`.

### Redo

Redo dùng cùng history array và `historyIndex`. Khi push snapshot mới sau undo, redo branch bị cắt.

### Clipboard

Không thấy clipboard chuẩn. `duplicateSelected()` có tồn tại qua hotkey `Ctrl/Cmd + D`, nhưng copy/paste hệ điều hành chưa là feature hoàn chỉnh.

### History

History lưu deep clone JSON của item state. Khi restore, editor set `isRestoringHistory` để tránh push nested history.

### Project state

Project/layout state:

- `layouts`
- `currentLayoutId`
- `currentLayoutName`

Các operation:

- Load list.
- Load active.
- Create new.
- Activate.
- Rename.
- Delete.
- Save.
- Publish template.

### Dirty state

Không thấy dirty flag rõ ràng kiểu `isDirty`. User cần chủ động save. Một số thao tác runtime test chỉ mutate local progress, không save.

---

## 9. Event System

### Mouse events

Mouse events được bind trong editor:

- `mousedown`: start move/resize/rotate/pan.
- `mousemove`: update drag operation.
- `mouseup`: end operation, push history.
- `click`: select item, clear canvas, toolbar actions.
- `wheel`: zoom/pan.

### Keyboard events

Keyboard events:

- `keydown`: Delete, Duplicate, Undo, Redo, Space.
- `keyup`: release Space.

### Drag events

HTML5 drag/drop:

- Gift cards.
- Template cards.
- Asset cards.

Drop vào canvas tạo item tại tọa độ drop đã convert sang canvas point.

### Resize events

Resize không dùng native `ResizeObserver` cho object. Resize là mouse drag trên handles. Sau resize:

- Update dimensions.
- Sync logical dimensions for widgets.
- Clamp.
- Rerender.
- Push history on mouseup.

### Selection events

Không có event bus riêng cho selection. Selection mutation gọi trực tiếp:

- `renderCanvas()`
- `renderInspector()`

### Runtime events

Runtime events gồm:

- TikTok gift progress updates.
- Simulated gift test trong editor.
- Effect playback events cho fade overlay.

### Overlay events

Overlay websocket events:

- Progress update.
- Effect playback started/finished.
- Queue empty.

Overlay also performs polling load events from backend.

---

## 10. Performance

### Current optimizations

- `requestAnimationFrame` throttle for editor canvas render.
- DOM wrapper reuse by item ID.
- Content signature to avoid rebuilding innerHTML unnecessarily.
- Layout polling signature to avoid overlay rerender if unchanged.
- Client-side PNG resize/compression before upload.
- Shared renderer avoids duplicate heavy logic in some areas.
- Video assets use native browser media pipeline.

### Virtual rendering

No full virtual rendering engine exists. All visible items are real DOM elements.

### Object caching

Object caching is mostly:

- DOM node reuse.
- Signature guard.

No dedicated cache invalidation graph exists.

### Image caching

Browser handles most image/video caching. No explicit image cache manager was found.

### Memory usage

Potential memory contributors:

- History snapshots deep clone entire `items` list.
- Large uploaded assets.
- Video/WebM DOM nodes.
- Repeated render signatures with JSON stringify on complex items.

### Potential bottlenecks

- Large `items` list with many videos/gifs.
- `JSON.stringify(item)` for content signature on every render pass.
- `history` storing full layout snapshots.
- Polling overlay every `700ms`.
- Monolithic inspector rerender on many small changes.
- Shared renderer returns HTML strings; complex widgets can rebuild large DOM chunks.

---

## 11. Current Features

### Stable

- Open Gift Menu Designer from Electron UI.
- Load TikTok gift library.
- Search/filter gifts.
- Add gift to canvas.
- Add text to canvas.
- Add media asset to canvas.
- Upload `PNG/GIF/WebM` menu assets.
- Create custom gift with media icon.
- Create custom gift with text icon.
- Delete custom gift from local storage.
- Drag/drop gift/template/asset to canvas.
- Select item.
- Multi-select with Shift.
- Move selected item(s).
- Resize selected item(s).
- Rotate selected item(s), with support varying by object type.
- Lock/unlock layer.
- Show/hide layer.
- Reorder layers.
- Align selected items.
- Distribute selected items.
- Snap to safe area.
- Show snap guides.
- Zoom canvas.
- Pan canvas.
- Undo.
- Redo.
- Duplicate selected items.
- Delete selected items.
- Save layout.
- Save and export to OBS.
- Load layout list.
- Activate layout.
- Rename layout.
- Delete layout.
- Create new layout.
- Use built-in templates/widgets.
- Use server templates.
- Save local custom template.
- Admin publish layout as marketplace template.
- Render overlay in OBS browser source.
- Runtime overlay reads active layout from backend local JSON.
- Websocket progress update for gift/menu values.
- Gift menu fade events during effect playback.

### Stable / Advanced

- Gift text settings: show name, text position, text size/color, alignment, offsets.
- Gift text background: enable, style, color, opacity, radius, padding, gradient.
- Gift icon display as media or text.
- Gift aura and animation settings.
- Goal bar customization.
- Goal circle customization.
- Boss bar customization.
- Combo widget customization.
- Goal list customization.
- Gift stack group customization.
- Panel/border color, gradient, radius, opacity, padding.
- Loop/marquee for group/list.

### Experimental

- `top-contributors` widget.
- `podium-contributors` widget.
- Marketplace template publishing from admin.
- Shared renderer extraction.
- Inspector engine extraction.
- Effect playback fade integration.
- Complex border/panel visual effects.

### Incomplete or partial

- General-purpose grouping.
- Nested groups.
- Clipboard copy/paste.
- True grid snapping.
- Custom guides.
- Full layer panel architecture.
- Full timeline/keyframe animation editor.
- Responsive constraints.
- Robust dirty-state prompt.
- Automated visual regression tests.
- Multi-user/multi-room cloud layout distribution.

---

## 12. Known Limitations

### UX problems

- Nhiều setting nâng cao nằm chung inspector, có thể gây quá tải cho người dùng mới.
- Một số tên/action trong UI có dấu hiệu encoding lỗi.
- Không thấy clear indication về unsaved changes.
- Multi-select/group capabilities chưa giống editor chuyên nghiệp.
- Một số feature bị plan-gate; nếu message không nhất quán có thể gây khó hiểu.

### Architecture problems

- `gift-menu-designer.js` quá lớn và nhiều trách nhiệm.
- Editor state mutation phân tán.
- Inspector logic chưa tách hết vào `inspector-engine.js`.
- Renderer chưa hoàn toàn thống nhất giữa editor và overlay.
- Overlay active layout phụ thuộc file JSON cục bộ chung.
- Group là object đặc biệt, chưa phải abstraction tổng quát.

### Performance problems

- Full item snapshot history có thể tốn RAM với layout lớn.
- Media asset/video nhiều có thể làm editor lag.
- Polling overlay liên tục thay vì event-only invalidation.
- DOM string rendering cho widget phức tạp có thể tốn CPU.
- Không có asset lazy-loading policy riêng.

### Missing functionality

- Copy/paste clipboard.
- True grid and ruler system.
- Custom guide lines.
- Constraint/responsive layout.
- Nested group/layer folders.
- Component/preset system versioned rõ ràng.
- Timeline animation/keyframes.
- Per-object comments/metadata.
- Conflict handling khi nhiều device cùng sửa.

### Technical debt

- Encoding/mojibake còn xuất hiện ở một số string.
- Legacy group migration còn trong editor.
- Disabled old test methods còn nằm trong file.
- Hardcoded sizes/styles/templates nhiều trong JS.
- Plan gating nằm lẫn trong editor logic.
- Some current behavior depends on uncommitted working-tree changes around overlay fade/effect playback.

---

## 13. Future Extension Points

Các điểm dưới đây là nơi phù hợp để tích hợp tính năng tương lai. Phần này chỉ mô tả điểm nối, không đề xuất sửa ngay.

### Animation

Integration points:

- `item-registry.js`: thêm default animation properties vào object contract.
- `shared-render-engine.js`: render animation classes/styles.
- `gift-menu-renderer.css`: define keyframes.
- Inspector section trong `gift-menu-designer.js` hoặc `inspector-engine.js`: UI chỉnh animation.

### Component

Integration points:

- `item-registry.js`: khai báo component type.
- `getDefaultTemplates()`: seed component/template.
- Save format `items/exportedItems`: lưu component instance.
- Shared renderer: render component.

### Theme

Integration points:

- Layout payload thêm `theme`.
- Shared renderer nhận theme context.
- Inspector/editor toolbar có theme selector.
- Overlay apply theme globally.

### Template

Integration points:

- `GiftMenuLayout` với `isTemplate`.
- `/gift-menu-templates`.
- `/gift-menu-layout/publish`.
- `/gift-menu-templates/:templateId/use`.
- Admin publish modal.

### Timeline

Integration points:

- Item model thêm `timeline` or `keyframes`.
- Editor state thêm playback state.
- Overlay renderer đọc timeline.
- CSS/JS animation runtime.

### Layer panel

Integration points:

- Existing layer actions in editor.
- `zIndex` and `visible/locked`.
- Could become separate layer tree component.

### Alignment

Integration points:

- `applyAlign()`.
- `applyDistribute()`.
- Selection model.
- Safe area coordinate helpers.

### Snap

Integration points:

- `applySnapForItem()`.
- `updateGuides()`.
- `snapEnabled`.
- Could extend to object-to-object snapping/grid snapping.

### Constraint

Integration points:

- Object common fields.
- Coordinate engine.
- Ratio conversion logic.
- Export scaling.

### Responsive

Integration points:

- `setAspectRatio()`.
- `logicalToStage()` / `stageToLogical()`.
- Save/export transform.
- Overlay layout loader.

---

## 14. File Map

| File | Responsibility |
|---|---|
| `desktop/renderer/js/gift-menu-designer.js` | Main editor class, UI, canvas, inspector, events, save/export, templates, assets, websocket |
| `desktop/renderer/js/item-registry.js` | Object type registry, defaults, contracts |
| `desktop/renderer/js/shared-render-engine.js` | Shared HTML renderer for widgets/groups/media/text in editor context |
| `desktop/renderer/js/inspector-engine.js` | Partial inspector abstraction; current editor still has much inline inspector logic |
| `desktop/renderer/styles/gift-menu-designer.css` | Editor UI/canvas/inspector styles |
| `backend/public/gift-menu-overlay.html` | OBS/runtime overlay page, layout polling, websocket runtime events |
| `backend/public/shared-render-engine.js` | Shared renderer used by overlay/browser runtime |
| `backend/public/gift-menu-renderer.css` | Runtime renderer CSS, widget effects, loop animations |
| `backend/models/GiftMenuLayout.js` | MongoDB schema for layouts/templates |
| `backend/routes/tiktok.js` | Gift library, layout CRUD, template APIs, overlay layout endpoint, asset upload APIs |
| `backend/routes/obs.js` | OBS setup route for gift menu browser source |
| `backend/services/obsService.js` | OBS helper/service; source management used by OBS routes |
| `backend/services/tiktokService.js` | TikTok live service; runtime gift events can feed progress updates |
| `backend/uploads/gift-menu-layout.json` | Local active layout consumed by OBS overlay |
| `docs/shared-render-contract.md` | Existing shared renderer contract documentation |

---

## 15. Flow Diagrams

### Create object

```text
User clicks/drags gift/template/asset
  -> editor resolves source data
  -> create item object with defaults
  -> push item into this.items
  -> setSelection(item.id)
  -> renderCanvas()
  -> renderInspector()
  -> pushHistory()
```

### Select object

```text
User clicks canvas item
  -> click handler reads data-item-id
  -> if Shift: toggle in selectedIds
  -> else: selectedIds = [id], selectedId = id
  -> renderCanvas()
  -> renderInspector()
```

### Group

```text
Multi-selected gift items
  -> createStackGroupFromSelection()
  -> filter visible unlocked gifts
  -> calculate bounds
  -> copy gifts into group.children
  -> remove original gifts from root items
  -> add gift-stack-group root item
  -> select group
  -> renderCanvas()
  -> pushHistory()
```

### Ungroup

```text
Selected gift-stack-group
  -> ungroupStackGroup()
  -> calculate current visual child layout
  -> convert children back to root gift items
  -> remove group
  -> normalize zIndex
  -> select restored gifts
  -> renderCanvas()
  -> pushHistory()
```

### Export

```text
User presses Save & Export
  -> saveLayout()
       -> build exportedItems from items
       -> POST /api/tiktok/gift-menu-layout
       -> MongoDB save
       -> write backend/uploads/gift-menu-layout.json
  -> exportToOBS()
       -> POST /api/obs/setup-gift-menu
       -> create/update OBS browser source
       -> source loads /gift-menu-overlay.html
```

### Runtime rendering

```text
OBS browser source loads gift-menu-overlay.html
  -> fetch /api/tiktok/gift-menu-overlay-layout
  -> read exportedItems
  -> render overlay DOM
  -> poll layout every ~700ms
  -> rerender only when signature changes
```

### Gift update

```text
TikTok/live/backend progress event
  -> websocket broadcast gift_menu_progress_update
  -> editor/overlay receive event
  -> find matching gift/widget by giftId
  -> update currentCount/combo/goals/contributors
  -> renderCanvas() or overlay render
```

### Overlay update / effect fade

```text
Effect playback starts
  -> backend websocket effect_playback_started
  -> gift-menu-overlay receives event
  -> if playbackType is live_mapping/test_mapping
  -> overlay root opacity fades to 0

Effect playback finishes or queue empty
  -> backend websocket effect_playback_finished/effect_queue_empty
  -> overlay root opacity fades back to 1
```

---

## 16. Product Review

### Scores

| Area | Score | Reason |
|---|---:|---|
| Ease of use | 7/10 | Kéo thả, template, inspector trực quan; nhưng nhiều setting nâng cao và thiếu dirty/guide UX rõ ràng. |
| Performance | 7/10 | Đã có DOM reuse, render throttle, signature cache; vẫn có rủi ro với nhiều video/asset/history snapshots. |
| Architecture | 5/10 | Chức năng chạy được nhưng editor monolithic, state mutation phân tán, overlay/editor chưa hoàn toàn thống nhất. |
| Extensibility | 6/10 | Registry/shared renderer là nền tốt; nhưng inspector/group/state cần tách rõ hơn để mở rộng bền. |
| Code organization | 4/10 | File chính quá lớn, nhiều inline template/style/logic, một số legacy/disabled code còn tồn tại. |
| Commercial readiness | 6/10 | Đủ hấp dẫn để demo/bán sớm cho streamer; cần hardening UX, test, encoding, multi-device/cloud và performance trước scale lớn. |

### Senior UX/Product evaluation

Gift Menu Designer có hướng sản phẩm đúng: streamer cần thiết kế nhanh, đẹp, chạy được trong OBS, không cần hiểu kỹ thuật. Bộ template/widget hiện tại đủ tạo cảm giác “livestream chuyên nghiệp” và khác biệt so với overlay tĩnh.

Điểm mạnh thương mại:

- Visual impact cao.
- Có nhiều widget đúng nhu cầu live: gift goal, combo, boss, mystery box, top contributor.
- Có template và publish store, mở đường marketplace.
- Có custom gift/text icon/media asset nên linh hoạt.
- OBS export flow đã có.

Điểm cần cải thiện trước khi scale mạnh:

- Đơn giản hóa inspector theo cấp độ người dùng.
- Làm rõ trạng thái đã lưu/chưa lưu.
- Chuẩn hóa renderer editor/overlay để giảm lệch hình.
- Tách editor core, state, inspector, renderer thành module rõ hơn.
- Tăng độ tin cậy runtime: event-driven layout update, multi-room layout identity, test tự động.
- Sửa triệt để encoding text tiếng Việt.

Kết luận: module hiện tại là một nền sản phẩm tốt, nhiều tính năng và giàu tiềm năng thương mại. Tuy nhiên để một senior engineer tiếp tục phát triển an toàn, ưu tiên nên là ổn định kiến trúc quanh state/render/inspector trước khi thêm các feature lớn như timeline, responsive constraints hoặc layer tree nâng cao.
