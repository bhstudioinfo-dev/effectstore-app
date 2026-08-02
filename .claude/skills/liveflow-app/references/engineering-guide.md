# Hướng dẫn kỹ thuật và kiểm thử

## Mục lục

- Lệnh chuẩn
- Quy trình sửa
- Verification matrix
- Git và runtime data
- Electron/Windows
- UI style
- Release

## Lệnh chuẩn

Từ root:

```text
npm run dev
npm start
npm test
npm run release:check
npm run build:verify
npm run build
```

Backend riêng:

```text
npm --prefix backend start
npm --prefix backend test
```

Desktop riêng:

```text
npm --prefix desktop start
npm --prefix desktop run build:verify
```

## Quy trình sửa

1. `git status --short` và đọc diff liên quan.
2. `rg` symbol/field/route ở toàn repo.
3. Xác định active path; bỏ qua legacy/dormant nếu không được yêu cầu.
4. Sửa bằng patch, không format file lớn ngoài phạm vi.
5. Nếu field persisted, kiểm normalize/save/export/load/migration.
6. Nếu render, cập nhật preview và overlay.
7. Nếu entitlement/payment/auth, thêm/chạy test backend.
8. Kiểm syntax và diff.

## Verification matrix

| Thay đổi | Kiểm tra tối thiểu |
|---|---|
| Renderer JS | `node --check <file>` + thao tác UI |
| Electron main/preload | `node --check` + restart toàn app + IPC |
| Backend route/service/model | backend test phù hợp hoặc full `npm --prefix backend test` |
| Shared render/CSS | app preview + OBS cùng layout, nhiều size/aspect |
| Designer | save/load, undo/redo, lock/unlock, resize, export |
| Mapping/queue | manual, test, simulated/live; countdown/FIFO/fade |
| Payment/plan | free/Basic/Pro/admin và backend enforcement |
| Docs only | validate paths, `git diff --check` |
| Release | `npm run release:check`, `npm run build:verify` |

Root `npm test` chạy toàn backend suite và localization validator. Không khẳng định OBS/TikTok runtime ổn chỉ vì unit tests pass.

## Git và runtime data

- Không reset hard/checkout user changes.
- Không stage runtime mirrors:
  - `backend/uploads/gift-menu-layout.json`
  - `backend/uploads/goal-board-layout.json`
- Cẩn trọng với upload/encrypted/data JSON thật.
- `git diff --check` có thể báo line-ending warning; phân biệt warning với whitespace error.
- Commit message mô tả outcome, không liệt kê từng file.

## Electron/Windows

- `desktop/main.js` tạo BrowserWindow, local server, IPC, directories, global shortcuts.
- `desktop/preload.js` expose bridge; ưu tiên bridge thay direct Node access mới.
- Main/preload thay đổi cần restart app; renderer thay đổi có thể Ctrl+R.
- Packaged paths khác dev; dùng backend manager/dataPaths.
- Không log token, Mongo URI, OBS password hoặc safeStorage plaintext.
- Dialog chọn file cần xử lý canceled, exception, size và formats.

## UI style

- Dark navy/black surfaces.
- Purple/pink primary, cyan secondary, green success, amber warning, red danger.
- Inter/Segoe UI.
- Cards radius khoảng 12–18px, border mờ, glow có kiểm soát.
- CTA rõ nhưng không gây áp lực cho Free.
- Text phải đọc được ở 1080p; tránh font 9–10px cho thông tin chính.
- Không thêm sidebar/card lớn gây mất diện tích canvas.
- Dùng class/component có sẵn trong `main.css`/designer CSS trước khi tạo style mới.

## Release

- Product name: LiveFlow.
- Electron builder output `desktop/dist`, NSIS Windows.
- Backend đóng gói dưới extraResources, loại `.env`, uploads/tests/scripts.
- AppData không bị xóa khi uninstall (`deleteAppDataOnUninstall: false`).
- Trước publish: database setup, auth, payment, OBS source repair, TikTok connection, upload limits, diagnostics, localization và build verify.

