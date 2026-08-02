# Gift Menu Designer và widgets

## Mục lục

- Mục tiêu và canvas
- Item types
- Thao tác chung
- Quy tắc resize
- Gift và text
- Gift stack group
- Goal widgets
- PK
- Contributors và Talent
- Challenge wheel
- Layers
- Save/export và parity OBS

## Mục tiêu và canvas

Designer tạo overlay kéo-thả cho OBS với aspect `9:16`, `16:9`, `1:1`, logical canvas, safe area và output size. Editor có zoom/pan, guides và coordinate conversion; lưu logical values, xuất transformed `exportedItems` cho OBS.

State chính: `items`, `selectedId`, `selectedIds`, `layouts`, `currentLayoutId`, `aspectRatio`, history snapshots. Undo/redo tối đa khoảng 200 snapshot.

## Item types

Registry hiện có:

- `gift`: quà độc lập.
- `text`: chữ tự do.
- `media-asset`: PNG/GIF/WebM upload.
- `gift-stack-group`: nhóm quà chạy ngang/dọc.
- `goal-bar`: thanh mục tiêu; `barStyle: pk` là Thanh PK đối kháng.
- `goal-circle`: vòng tròn mục tiêu.
- `boss-bar`: boss HP.
- `combo`: combo quà.
- `mystery-chests`: rương bí ẩn.
- `goal-list`: mục tiêu hôm nay/danh sách.
- `top-contributors`, `podium-contributors`: Top Supporters.
- `talent-live`: phần thi trực tiếp.
- `talent-leaderboard`: bảng xếp hạng Talent.
- `challenge-wheel`: vòng quay thử thách.

Xem defaults/contracts trong `item-registry.js`; không hardcode default khác ở inspector nếu registry đã định nghĩa.

## Thao tác chung

- Drag/drop từ thư viện quà, mục tiêu, tài nguyên.
- Select, Shift multi-select, move, resize, rotate tùy loại.
- Align trái/giữa/phải, trên/giữa/dưới và distribute.
- Snap center/safe-area/object guides.
- Duplicate, delete, undo/redo.
- Layer reorder, visibility và lock.
- Background opacity riêng nền; content và border giữ nguyên.
- Custom background solid/gradient, text color, panel/border effects tùy widget.
- Aspect lock chỉ quyết định phép resize sau đó, không reset geometry khi toggle.

## Quy tắc resize

Có hai mô hình:

1. **Uniform scale** khi lock ratio: khung và content scale đồng bộ, giữ bố cục hiện tại.
2. **Responsive/reflow** khi unlock: thay đổi `w/h` của panel; chữ/icon giữ kích thước thiết kế, nội dung reflow/clip có kiểm soát thay vì bị kéo méo.

Ngoại lệ phải đọc branch hiện tại. Với `goal-list`, PK, Talent live và contributors, app/OBS dùng wrapper/scale riêng. Không dùng một công thức chung để vá tất cả.

## Gift và text

Gift hỗ trợ icon media hoặc chữ thay icon, main name/subtext, show/hide name, text position trái/phải/trên/dưới, font size/alignment/gap/color. Text background có Classic, Glass, Mystic, Hologram, Light Sweep; opacity nền phải độc lập viền. Mystic có hai lớp/viền gradient rõ và border radius.

Media nền icon phải trong suốt; glow/fire/aura không được tạo hình vuông màu đen phía sau asset.

## Gift stack group

- Gộp nhiều gift thành một root item với children.
- Layout ngang/dọc.
- Loop marquee và direction/speed.
- `iconGap`: khoảng cách giữa các gift item.
- `giftTextGap`: khoảng cách icon và text trong một gift; hỗ trợ per-gift override khi có field child.
- Icon size, main/subtext size, text position và border radius.
- Background opacity không restart animation/loop khi kéo slider; dùng signature tránh rebuild DOM nếu chỉ style đổi.

## Goal widgets

### Goal circle

Free hoàn toàn theo chủ đích sản phẩm. Chỉnh progress shape/effect/size, target/current, center icon, goal icon size, subtitle, gradient, show percentage và fonts.

### Goal list / Mục tiêu hôm nay

Danh sách nhiều mục tiêu và progress. Khi unlock ratio, giảm width/height phải thay panel/reflow, không scale chữ theo cạnh ngắn. Toggle lock giữ geometry. App và OBS phải dùng cùng content scaling contract.

### Boss/combo/mystery

Mỗi widget có target/current, theme/panel/bar effects và typography. Khi thêm field mới, persist và render cả app/OBS.

## PK

PK là `goal-bar` với `barStyle === 'pk'`.

- 2/3/4 đội; mỗi đội có name, score, colors/icon.
- Preset, target coins, transparent background, timer show/duration/vertical offset.
- Team cards, progress segments, electric border/scan effects và optional opponent text.
- Test controls cộng điểm từng đội và reset.
- Reset: tất cả score = 0, mỗi segment vẫn chiếm đều `100 / teamCount`, label hiển thị `0%` cho tất cả.
- Sau donate test, segment màu phải xuất hiện ngay; không chờ animation/state khác.
- Progress bar có offset Y riêng.
- Timer và team text không bị sát/cắt ở cạnh trên.
- Toggle lock ratio không tự sắp xếp lại đội hoặc reset content layout.
- Preview và OBS phải cùng hình dạng team card, border, icon visibility và animation speed.

## Contributors và Talent

### Top Supporters

Top/podium contributors có title, top 1/2/3, avatars, names, scores, background solid/gradient, border color/effects, avatar size, spacing và font controls. Tránh divider ngang thừa. Wrapper OBS phải scale giống preview để nội dung không tràn.

### Talent

`talent-live`: thí sinh đang biểu diễn, round/timer/status, avatar, name/subtitle/score/progress và audience message.

`talent-leaderboard`: bảng xếp hạng, optional avatars, top-3 podium, số hàng.

Free tối đa 3 thí sinh; thí sinh thứ 4 yêu cầu Basic. Khi sửa input thí sinh, inspector giữ scroll/focus, không nhảy về thí sinh 1. Resize unlock thay panel, không làm toàn bộ nội dung nhỏ theo.

## Challenge wheel

Wheel có segments, duration, auto-hide, no-repeat và presentation. Template designer có `productType: challenge-wheel`; mapping có thể trigger wheel. Preview trong mapping/store phải dùng presentation thật, không thumbnail hardcode sai.

## Layers

- Hiển thị full layer name, không thumbnail hỏng.
- Click layer chọn đúng canvas item và cho phép kéo nếu unlocked.
- Locked item: không move/resize/rotate và `pointer-events` không chặn click layer nằm dưới.
- Visibility độc lập lock.
- Reorder giữ zIndex ổn định.

## Save/export và parity OBS

Save layout lưu bản đang chỉnh. Save & Export lưu rồi gọi OBS setup/refresh. Layout đang active gần nhất tiếp tục trên OBS khi người dùng chỉ duyệt/mở layout khác.

Kiểm tra parity theo chuỗi:

`item-registry defaults → designer normalize → preview shared renderer/CSS → exportedItems → overlay normalize → backend shared renderer/CSS`.

Các lỗi thường do:

- sửa chỉ một shared renderer;
- wrapper scale khác;
- preview dùng `items`, OBS dùng `exportedItems`;
- field bị bỏ khi sanitize/export;
- CSS selector có scope khác;
- rebuild DOM làm reset animation.

