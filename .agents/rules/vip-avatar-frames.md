# Quy Chuẩn Chuyển Đổi & Triển Khai Khung Avatar VIP LiveFlow

Tài liệu này là sổ tay quy chuẩn bắt buộc (SOP) cho mọi hiệu ứng khung Avatar VIP (VIP Avatar Frames) trong hệ thống LiveFlow.

---

## 1. Nguồn Master Gốc (Source Asset)
- **Định dạng:** Apple ProRes 4444 (`.mov`) có sẵn kênh Alpha trong suốt, kích thước 1000x1000 @ 29.97fps xuất từ After Effects.
- **Thư mục master:** `D:\HỦ QUÀ\khung\`

---

## 2. Chuẩn Xuất Bản Sang OBS Studio (Live Overlay)
- **Định dạng:** WebM VP9 Alpha (`alpha_mode: 1`).
- **Lệnh FFmpeg chuẩn:**
  ```powershell
  & "D:\effectstore-app-backup\backend\node_modules\ffmpeg-static\ffmpeg.exe" -y -i "D:\HỦ QUÀ\khung\<master>.mov" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 4M -auto-alt-ref 0 "D:\HỦ QUÀ\khung\khung <name>.webm"
  ```
- **Vị trí lưu trữ bắt buộc (Copy đồng bộ):**
  - `D:\HỦ QUÀ\khung\khung <name>.webm`
  - `desktop/renderer/assets/frames/khung_<name>.webm`
  - `backend/public/assets/frames/khung_<name>.webm`
- **Cơ chế phát trên OBS (`backend/public/effect-player-overlay.html`):**
  - Dùng thẻ `<video id="vip-overlay-frame-video" src="assets/frames/khung_<name>.webm" autoplay loop muted playsinline>`.
  - **Tuyệt đối KHÔNG** để thẻ `<img>` rỗng không có `src` trong DOM overlay để tránh hiện icon ảnh vỡ `🖼️` trên OBS CEF.

---

## 3. Chuẩn Xuất Bản Sang Desktop App Preview (Màn Hình Xem Trước)
- **Định dạng:** Lossless Animated PNG (`.png` / APNG) có kênh Alpha RGBA 32-bit (kích thước scale 400x400, loop vô tận `plays=0`).
- **Lý do dùng APNG cho Electron Preview:** 
  - Tránh triệt để lỗi ô vuông đen (Black Box) do cơ chế Hardware Compositor của Electron khi dùng thẻ video.
  - Tránh triệt để lỗi lem mờ / vệt chồng bóng (Ghosting) do cơ chế nén delta macroblock của WebP.
- **Lệnh FFmpeg chuẩn:**
  ```powershell
  & "D:\effectstore-app-backup\backend\node_modules\ffmpeg-static\ffmpeg.exe" -y -i "D:\HỦ QUÀ\khung\<master>.mov" -vf "scale=400:400" -pix_fmt rgba -f apng -plays 0 "desktop/renderer/assets/frames/khung_<name>_animated.png"
  ```
- **Vị trí lưu trữ:**
  - `desktop/renderer/assets/frames/khung_<name>_animated.png`
  - `backend/public/assets/frames/khung_<name>_animated.png`

---

## 4. Chuẩn Xuất Bản Ảnh Tĩnh (Static Snapshot)
- **Định dạng:** PNG RGBA 32-bit 1000x1000.
- **Lệnh FFmpeg:**
  ```powershell
  & "D:\effectstore-app-backup\backend\node_modules\ffmpeg-static\ffmpeg.exe" -y -ss 00:00:01 -i "D:\HỦ QUÀ\khung\<master>.mov" -vframes 1 -pix_fmt rgba "desktop/renderer/assets/frames/khung_<name>.png"
  ```
- **Vị trí lưu trữ:**
  - `desktop/renderer/assets/frames/khung_<name>.png`
  - `backend/public/assets/frames/khung_<name>.png`

---

## 5. Cấu Trúc Phân Lớp (Layer Stacking Architecture)
Mọi khung VIP trong Preview và OBS phải tuân thủ đúng thứ tự tầng:
1. **Tầng 1 (Đáy - `z-index: 1`):** Hào quang nền (Ambient Glow Aura) tỏa ánh sáng màu đặc trưng của khung.
2. **Tầng 2 (`z-index: 2`):** Ảnh Avatar người dùng (tròn trịa, giữ 100% màu sắc gốc tự nhiên).
3. **Tầng 5 (`z-index: 5` hoặc `3` trong OBS):** Khung Avatar chuyển động (Vành tròn Bezel vàng ôm trọn đè nhẹ lên mép ảnh Avatar, không bị lẹm viền trong).
4. **Tầng 10 (`z-index: 10` hoặc `5` trong OBS):** Tên VIP nằm nổi bật trên dải ruy băng bảng tên.
