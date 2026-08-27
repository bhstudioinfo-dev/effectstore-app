# 📘 LIVEFLOW - SỔ TAY VẬN HÀNH TOÀN DIỆN TỪ A-Z (MASTER HANDBOOK)
> **Phiên bản:** v1.0.1 Stable  
> **Cập nhật:** 27/08/2026  
> **Tài liệu duy nhất & chuẩn mực cho toàn bộ hệ thống LiveFlow.**

---

## 📑 MỤC LỤC
1. [TỔNG QUAN KIẾN TRÚC HỆ THỐNG](#1-tổng-quan-kiến-trúc-hệ-thống)
2. [CƠ CHẾ BẢO MẬT HIỆU ỨNG (ATLAS + R2 + DRM)](#2-cơ-chế-bảo-mật-hiệu-ứng-atlas--r2--drm)
3. [HỆ THỐNG TRỢ LÝ AI CÀ KHỊA & GIỌNG ĐỌC SIÊU THỰC (GEMINI + ELEVENLABS + R2)](#3-hệ-thống-trợ-lý-ai-cà-khịa--giọng-đọc-siêu-thực-gemini--elevenlabs--r2)
4. [QUY TRÌNH XỬ LÝ & ĐỒNG BỘ HIỆU ỨNG (PIPELINE)](#4-quy-trình-xử-lý--đồng-bộ-hiệu-ứng-pipeline)
5. [CHI TIẾT CÁC TÍNH NĂNG CHÍNH CỦA LIVEFLOW](#5-chi-tiết-các-tính-năng-chính-của-liveflow)
6. [HƯỚNG DẪN VẬN HÀNH & XỬ LÝ LỖI (TROUBLESHOOTING)](#6-hướng-dẫn-vận-hành--xử-lý-lỗi-troubleshooting)
7. [KẾ HOẠCH BƯỚC TIẾP THEO: TỐI ƯU HÓA & ĐÓNG GÓI RELEASE](#7-kế-hoạch-bước-tiếp-theo-tối-ưu-hóa--đóng-gói-release)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

LiveFlow được xây dựng theo mô hình **Desktop Standalone kết hợp Hybrid Cloud**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LIVEFLOW DESKTOP CLIENT                          │
│                                                                         │
│  ┌───────────────────────┐             ┌─────────────────────────────┐  │
│  │   Electron Renderer   │◄───────────►│   Managed Backend Server    │  │
│  │  (UI / HTML / JS / CSS)│   HTTP/WS   │     (Node.js / Express)     │  │
│  └───────────────────────┘             └──────────────┬──────────────┘  │
│                                                       │                 │
└───────────────────────────────────────────────────────┼─────────────────┘
                                                        │
                    ┌───────────────────────────────────┴───────────────────────────────────┐
                    │                                                                       │
                    ▼                                                                       ▼
      ┌───────────────────────────┐                                           ┌───────────────────────────┐
      │   MongoDB Atlas Online    │                                           │   Cloudflare R2 Bucket    │
      │      (Database M0)        │                                           │    (`liveflow-effects`)   │
      │                           │                                           │                           │
      │ • effects (Danh mục)      │                                           │ • effects/{id}.enc (DRM)  │
      │ • users (Tài khoản)       │                                           │ • thumbs/{id}.png (Ảnh)   │
      │ • systemsecrets (API Keys)│                                           │ • voice-samples/ (Audio)  │
      │ • giftmappings (Gán quà)  │                                           │ • updates/stable/ (App)   │
      │ • giftmenulayouts (Menu)  │                                           │                           │
      └───────────────────────────┘                                           └───────────────────────────┘
```

### Các cổng kết nối nội bộ (Local Ports):
- **Port 8080:** Máy chủ giao diện Desktop (Express static server phục vụ Electron UI).
- **Port 9000:** Máy chủ API Backend (xử lý logic, DRM, database, R2, TikTok, ElevenLabs, Gemini).
- **Port 9001:** Máy chủ WebSocket sự kiện thời gian thực (OBS Overlay, Gift Events).

---

## 2. CƠ CHẾ BẢO MẬT HIỆU ỨNG (ATLAS + R2 + DRM)

### A. Cơ chế Local-First Fast-Cache (Ưu tiên đệm máy tính):
- Khi một máy tính (Admin hoặc Streamer) phát một hiệu ứng:
  1. Backend kiểm tra file mã hóa `.enc` trong thư mục cục bộ `backend/effects/encrypted/`.
  2. **Nếu có sẵn (Cache Hit):** Giải mã trực tiếp từ ổ cứng phát sang OBS với độ trễ **0ms**.
  3. **Nếu chưa có (Cache Miss - Máy khách mới cài):** Tự động tải file `.enc` từ Cloudflare R2 về lưu vào bộ nhớ đệm rồi phát ngay lập tức.

### B. Cơ chế Bảo vệ Bản quyền (DRM AES-256):
- Mọi video khi đưa lên hệ thống đều được mã hóa bằng thuật toán `AES-256-CBC` với mật mã bảo mật (`ENCRYPTION_PASSWORD`).
- File lưu trên Cloudflare R2 là file rác vô nghĩa (`.enc`) đối với người ngoài. Không ai có thể tải trộm video gốc để sử dụng ngoài LiveFlow.
- Khi phát video lên OBS, Backend giải mã luồng động (Stream Decryption) trực tiếp trên bộ nhớ RAM, **không bao giờ ghi file giải mã ra ổ cứng**.

---

## 3. HỆ THỐNG TRỢ LÝ AI CÀ KHỊA & GIỌNG ĐỌC SIÊU THỰC (GEMINI + ELEVENLABS + R2)

Tính năng **Trợ lý AI Cà Khịa Live Chat (PRO AI)** mang lại trải nghiệm livestream cuốn hút đỉnh cao:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 TIKTOK LIVE CHAT                       │
                  │        Khán giả comment: "Streamer live chán"          │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │                   GOOGLE GEMINI AI                     │
                  │      (Mô hình: gemini-3.6-flash / flash-latest)        │
                  │   Phân tích & sinh câu xéo sắc ngắn gọn dưới 20 từ:    │
                  │   "Chán mà xem từ nãy giờ là sao ta? Thả tym đi!"      │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │                    ELEVENLABS AI                       │
                  │         (Adam: pNInz6... / Callum: N2lVS1...)          │
                  │    Lồng tiếng siêu thực với ngữ điệu tự nhiên 100%     │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        │                                           │
                        ▼                                           ▼
          ┌───────────────────────────┐               ┌───────────────────────────┐
          │  Phát âm thanh ra OBS     │               │ Lưu đệm lên Cloudflare R2 │
          │     (OBS Browser Source)  │               │   (`voice-samples/...`)   │
          └───────────────────────────┘               └───────────────────────────┘
```

### A. 4 Tính cách AI linh hoạt (Personas):
1. 🌶️ **Xéo sắc, Cà khịa (`sassy`):** Chuyên "bắt bẻ", đáp trả khán giả một cách thông minh, tạo tiếng cười trên live.
2. 🎭 **Hài hước, Tinh nghịch (`funny`):** Vui vẻ, năng động, pha trò dí dỏm.
3. 💖 **Ngọt ngào, Dễ thương (`sweet`):** Nịnh người xem, cảm ơn ngọt ngào.
4. 🧠 **Thông thái, Triết lý (`smart`):** Trả lời điềm đạm, sâu sắc.

### B. Cơ chế Tiết kiệm Token Tuyệt đối (Zero-Cost Preview for Packaged Apps):
1. **Khi bạn bấm nghe thử từng giọng/tính cách trên App:**
   - Hệ thống gọi ElevenLabs tạo giọng chuẩn studio và **tự động tải file `.mp3` lên Cloudflare R2** dưới đường dẫn `voice-samples/{persona}_{voiceId}.mp3`.
2. **Khi phát hành bộ cài (`.exe`) cho người dùng/khách hàng khác:**
   - Khi khách hàng bấm "Nghe thử AI Cà Khịa", ứng dụng sẽ tải trực tiếp từ Cloudflare R2 về máy họ.
   - **HOÀN TOÀN MIỄN PHÍ - KHÔNG TIÊU TỐN 1 TOKEN ELEVENLABS NÀO CỦA BẠN!**
   - **Token ElevenLabs chỉ tiêu thụ khi:** Streamer bật tính năng trong phiên Live thật để phản hồi các comment thực tế của người xem.

---

## 4. QUY TRÌNH XỬ LÝ & ĐỒNG BỘ HIỆU ỨNG (PIPELINE)

### A. Khi Thêm Mới Hiệu Ứng (Upload Pipeline):
1. **Lấy File & Thông tin:**
   - Giao diện sử dụng `webUtils.getPathForFile` để lấy trực tiếp đường dẫn file gốc trên máy tính (`D:\HỦ QUÀ\...`).
   - Gửi lệnh JSON siêu nhẹ (1KB) chứa thông tin Tên, Giá, Đường dẫn sang Backend (hoàn tất trong 1ms).
2. **Nén Video sang WebM VP9 trong suốt (`yuva420p`):**
   - Tự động chạy FFmpeg với bộ lọc nén nhanh (`-deadline realtime -cpu-used 8 -threads 0`).
   - Tạo kênh trong suốt (Alpha Channel) giúp video không bị viền đen khi đè lên màn hình Live. Thời gian nén: **~6-7 giây** cho video 30MB.
3. **Mã hóa DRM:**
   - Tạo file `.enc` từ video WebM vừa nén trong **~0.08 giây**.
4. **Đẩy lên Cloudflare R2 & MongoDB Atlas:**
   - Tải file `.enc` và file ảnh `.png` lên Bucket `liveflow-effects` trên Cloudflare R2 trong **~2-4 giây**.
   - Tạo bản ghi trên MongoDB Atlas Online.
👉 **Tổng thời gian hoàn tất: Chỉ khoảng 10-13 giây.**

### B. Khi Xóa Hiệu Ứng (Cascade Deletion):
Khi bấm **"Xóa"** trong Trang quản trị, hệ thống đồng loạt thực thi:
1. 🗑️ Xóa bản ghi trong MongoDB Atlas.
2. ☁️ Xóa file `effects/{id}.enc` và `thumbs/{id}.png` trên Cloudflare R2.
3. 📁 Xóa sạch file `.webm`, `.enc`, `.png` trong thư mục ổ cứng máy tính.
4. 🧹 Thu hồi quyền sở hữu của người dùng & xóa các liên kết quà tặng liên quan.

---

## 5. CHI TIẾT CÁC TÍNH NĂNG CHÍNH CỦA LIVEFLOW

1. **Cửa Hàng Hiệu Ứng (Store Marketplace):**
   - Phân loại danh mục (Biến hình, Quà tặng, Phông nền, Hoạt ảnh, PK, Meme...).
   - Hỗ trợ Flash Sale toàn cục, đếm ngược thời gian giảm giá, huy hiệu Hot Trends.
2. **Trang Quản Trị (Admin Dashboard):**
   - Quản lý thêm/sửa/xóa hiệu ứng cửa hàng.
   - Quản lý Banner trang chủ.
   - Quản lý Coins & Giá trị quy đổi quà tặng TikTok.
   - Quản lý tài khoản người dùng, gói thời hạn, duyệt thanh toán.
3. **Trình Thiết Kế Bảng Quà & Vòng Quay (Menu Designer & Wheel):**
   - Thiết kế menu quà tặng tương tác trực quan (kéo thả, căn chỉnh thông minh, snapping, guides).
   - **Tích hợp trọn bộ 195 Font chữ UTM Unicode:** Streamer có thể tự do chọn font UTM cho từng thành phần (Tên quà, Giá xu, Tiêu đề chữ, Bảng mục tiêu donate, Vòng quay, Thanh PK, Bảng xếp hạng Top Donate, Bục vinh danh).
   - Vòng quay may mắn (Challenge Wheel) với tỷ lệ trúng thưởng tùy chỉnh.
   - Bảng mục tiêu (Goal Board), Bảng đấu PK (PK Battle Bar), Hũ quà vật lý (Gift Jar 2D).
4. **Tích Hợp OBS Studio:**
   - Kết nối qua OBS WebSocket v5 (cổng 4455).
   - Tự động tạo và đồng bộ 2 Browser Source trên OBS:
     - `gift_menu_overlay` -> Hiển thị bảng quà / vòng quay.
     - `effect_player` -> Phát hiệu ứng video WebM trong suốt khi có donate.
5. **Tích Hợp TikTok Live:**
   - Kết nối trực tiếp qua User ID TikTok.
   - Lắng nghe tự động sự kiện: Tặng quà (Gift), Lượt thích (Like), Bình luận (Comment), Chia sẻ (Share).
   - Tự động kích hoạt hiệu ứng video hoặc quay vòng quay tương ứng với từng món quà.

---

## 6. HƯỚNG DẪN VẬN HÀNH & XỬ LÝ LỖI (TROUBLESHOOTING)

### A. Khởi động hệ thống trong môi trường phát triển (Dev):
1. Mở Terminal tại thư mục `desktop`:
   ```bash
   cd desktop
   npm start
   ```
2. Kiểm tra log khởi động:
   - `MongoDB Connected (schema v4)` ➡️ Kết nối Atlas Online thành công.
   - `OBS WebSocket Connected & Identified` ➡️ Đã nhận diện OBS.
   - `Server chạy tại: http://localhost:9000` ➡️ Backend sẵn sàng.

### B. Chạy Bộ Kiểm Thử Tự Động (Test Suite):
Trước khi bàn giao hoặc đóng gói, luôn chạy lệnh kiểm thử toàn diện:
```bash
npm test
```
*(Yêu cầu: Toàn bộ 25/25 test suite đều phải đạt màu xanh `PASSED`).*

### C. Khắc phục sự cố thường gặp:

| Hiện tượng | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| **OBS không hiện video** | Chưa bật Browser Source hoặc sai cổng WebSocket. | Kiểm tra mục OBS trên App báo xanh "ĐÃ KẾT NỐI", đảm bảo nguồn `effect_player` đang bật. |
| **Bấm thêm hiệu ứng bị đứng** | Tiến trình Server cũ trong RAM bị nghẽn cổng. | Bấm `Ctrl + C` ở terminal và chạy lại `npm start`. |
| **Mất kết nối MongoDB** | Đường truyền mạng hoặc cấu hình IP trên Atlas. | Đảm bảo MongoDB Atlas đã mở Network Access `0.0.0.0/0` (Allow access from anywhere). |
| **Ảnh đại diện hiện nốt nhạc** | Chưa chọn ảnh thumbnail khi tải lên. | Chọn file ảnh thumbnail (`.jpg`/`.png`) khi thêm hiệu ứng. |
| **AI Cà Khịa không phản hồi** | Chưa bật tính năng hoặc chưa có bình luận mới. | Bật checkbox "Trợ lý AI Cà Khịa Live Chat" và kiểm tra cooldown (mặc định 20s). |

---

## 7. KẾ HOẠCH BƯỚC TIẾP THEO: TỐI ƯU HÓA & ĐÓNG GÓI RELEASE

Để đưa ứng dụng LiveFlow thành sản phẩm thương mại hoàn chỉnh, mượt mà và đóng gói chuyên nghiệp:

### 📦 Bước 1: Chuẩn bị tài nguyên thương hiệu (Brand Assets)
- Thiết kế bộ Icon chuẩn cho ứng dụng:
  - `desktop/assets/icon.ico` (cho Windows 256x256)
  - `desktop/assets/icon.png` (cho khay hệ thống Tray 32x32)

### 🚀 Bước 2: Tối ưu hóa hiệu năng máy khách (Performance Tuning)
- Bật cờ tăng tốc phần cứng GPU trong Electron (`--enable-gpu-rasterization --enable-zero-copy`).
- Giới hạn mức sử dụng RAM nền của Backend dưới **120MB**.
- Tự động giải phóng bộ nhớ đệm video cũ nếu dung lượng ổ cứng người dùng sắp đầy.

### 🛠️ Bước 3: Đóng gói Bộ cài đặt Windows Installer (`.exe`)
- Cấu hình tệp `desktop/package.json` với `electron-builder`:
  - Tạo bản cài đặt dạng **Setup Installer (`LiveFlow-Setup.exe`)** tự động tạo shortcut ngoài Desktop.
  - Tích hợp tính năng tự động cập nhật (Auto-Updater) qua Cloudflare R2: Khi bạn phát hành phiên bản mới, app của khách hàng sẽ tự động hiện thông báo nâng cấp.
- Lệnh đóng gói sản phẩm:
  ```bash
  cd desktop
  npm run build
  ```

---
*Tài liệu này là cẩm nang kỹ thuật và vận hành chính thức của dự án LiveFlow.*
