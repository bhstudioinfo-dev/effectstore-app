# 📘 LIVEFLOW - SỔ TAY VẬN HÀNH TOÀN DIỆN TỪ A-Z (MASTER HANDBOOK)
> **Phiên bản:** v1.0.1 Stable  
> **Cập nhật:** 27/08/2026  
> **Tài liệu duy nhất & chuẩn mực cho toàn bộ hệ thống LiveFlow.**

---

## 📑 MỤC LỤC
1. [TỔNG QUAN KIẾN TRÚC HỆ THỐNG](#1-tổng-quan-kiến-trúc-hệ-thống)
2. [CƠ CHẾ BẢO MẬT HIỆU ỨNG (ATLAS + R2 + DRM)](#2-cơ-chế-bảo-mật-hiệu-ứng-atlas--r2--drm)
3. [HỆ THỐNG TRỢ LÝ AI CÀ KHỊA & GIỌNG ĐỌC SIÊU THỰC (GEMINI + ELEVENLABS + R2)](#3-hệ-thống-trợ-lý-ai-cà-khịa--giọng-đọc-siêu-thực-gemini--elevenlabs--r2)
4. [QUY TRÌNH XỬ LÝ & ĐỒNG BỘ HIỆU ỨNG (STORE & CUSTOM EFFECTS)](#4-quy-trình-xử-lý--đồng-bộ-hiệu-ứng-store--custom-effects)
5. [CƠ CHẾ THANH TOÁN & ĐỒNG BỘ ĐƠN HÀNG REALTIME](#5-cơ-chế-thanh-toán--đồng-bộ-đơn-hàng-realtime)
6. [CHI TIẾT CÁC TÍNH NĂNG CHÍNH CỦA LIVEFLOW](#6-chi-tiết-các-tính-năng-chính-của-liveflow)
7. [HƯỚNG DẪN VẬN HÀNH & XỬ LÝ LỖI (TROUBLESHOOTING)](#7-hướng-dẫn-vận-hành--xử-lý-lỗi-troubleshooting)
8. [QUY TRÌNH ĐÓNG GÓI & PHÁT HÀNH RELEASE WINDOWS](#8-quy-trình-đóng-gói--phát-hành-release-windows)

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
- **Port 8080:** Máy chủ giao diện Desktop (Express static server phục vụ Electron UI, Preview Overlay).
- **Port 9000:** Máy chủ API Backend (xử lý logic, DRM, database, R2, TikTok, ElevenLabs, Gemini, Custom Effects).
- **Port 9001:** Máy chủ WebSocket sự kiện thời gian thực (OBS Overlay, Gift Events, Stream Trigger).

---

## 2. CƠ CHẾ BẢO MẬT HIỆU ỨNG (ATLAS + R2 + DRM)

### A. Cơ chế Local-First Fast-Cache (Ưu tiên đệm máy tính):
- Khi một máy tính (Admin hoặc Streamer) phát một hiệu ứng:
  1. Backend kiểm tra file mã hóa `.enc` trong thư mục cục bộ `backend/effects/encrypted/`.
  2. **Nếu có sẵn (Cache Hit):** Giải mã trực tiếp từ ổ cứng phát sang OBS với độ trễ **0ms**.
  3. **Nếu chưa có (Cache Miss - Máy khách mới cài):** Tự động tải file `.enc` từ Cloudflare R2 về lưu vào bộ nhớ đệm rồi phát ngay lập tức.

### B. Cơ chế Bảo vệ Bản quyền (DRM AES-256):
- Mọi video khi đưa lên hệ thống đều được mã hóa bằng thuật toán `AES-256-CBC` với mật mã bảo mật (`ENCRYPTION_PASSWORD`).
- File lưu trên Cloudflare R2 là file mã hóa (`.enc`) đối với người ngoài. Không ai có thể tải trộm video gốc để sử dụng ngoài LiveFlow.
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

### B. Chính sách Nghe thử 0 Token / 0 Ký tự (0-Token Test Policy):
1. **Âm thanh mẫu chuẩn bị sẵn (Offline Pre-baked Samples):**
   - Đã sinh sẵn file mẫu âm thanh chuẩn cho toàn bộ các giọng (Adam `pNInz6...`, Callum `N2lVS1...`, Google Nữ `google_female_vi`) tương ứng với từng tính cách (`sassy`, `funny`, `sweet`, `smart`).
   - Các file âm thanh được đóng gói kèm app tại `desktop/renderer/assets/audio/voice-samples/` và đồng bộ trên Cloudflare R2 `voice-samples/`.
2. **Khóa bảo vệ Token người dùng trên Backend:**
   - Mọi thao tác bấm nghe thử gửi cờ `isTest: true` lên `/api/ai/speech`.
   - Backend đảm bảo `reservedCharacters = 0`, **không bao giờ trừ ký tự hay tiêu tốn token của tài khoản người dùng**.
   - Token chỉ tiêu thụ khi Streamer phát trực tiếp trên TikTok Live thật.

---

## 4. QUY TRÌNH XỬ LÝ & ĐỒNG BỘ HIỆU ỨNG (STORE & CUSTOM EFFECTS)

### A. Quy trình Thêm Hiệu Ứng Cửa Hàng (Admin Upload):
1. **Lấy File & Thông tin:** Giao diện gọi Electron API lấy đường dẫn video và ảnh thumbnail.
2. **Nén Video sang WebM VP9 trong suốt (`yuva420p`):** Chạy FFmpeg nén nhanh, tạo kênh Alpha trong suốt.
3. **Mã hóa DRM:** Tạo file `.enc` được mã hóa AES-256.
4. **Đồng bộ đám mây:** Đẩy file `.enc` và thumbnail lên Cloudflare R2 (`liveflow-effects`) và ghi danh mục vào MongoDB Atlas Online.

### B. Quy trình Hiệu Ứng Cá Nhân Cục Bộ (Personal Custom Effects):
1. **Tải lên Video cá nhân & Giữ trọn âm thanh:**
   - Hỗ trợ định dạng MP4, MOV, AVI, WebM dưới 500MB.
   - Lưu trữ trực tiếp trên máy tính người dùng (`userData/custom-effects/`), không chiếm dung lượng đám mây.
   - Tự động nén thành WebM VP9 dọc 9:16 (tối đa 15 giây), **giữ nguyên và nén âm thanh chuẩn Opus 96k**, phát mượt mà kèm tiếng trên OBS.
2. **Tùy chọn Thumbnail nén JPG siêu nhẹ:**
   - Người dùng có thể chọn ảnh đại diện riêng (PNG, JPG, JPEG, WebP) kèm khung xem trước (Preview) trực quan.
   - Nếu không chọn, hệ thống tự động trích xuất khung hình đầu tiên của video và nén thành `thumbnail.jpg` (chuẩn `-q:v 3` siêu nhẹ 20KB-40KB).
3. **Đổi / Cập nhật Thumbnail & Hiệu ứng Di chuột (Hover Preview):**
   - Trong mục **"Thư viện"**, trên mỗi thẻ hiệu ứng cá nhân có nút **"🖼️ Đổi ảnh"**.
   - Cho phép chọn ảnh mới và cập nhật tức thì vào `thumbnail.jpg` với cơ chế phá cache (`?v=timestamp`), hiển thị ngay trên giao diện mà không cần tải lại app.
   - Bình thường hiển thị ảnh thumbnail, khi di chuột vào thẻ sẽ tự động phát video chuyển động mượt mà.

---

## 5. CƠ CHẾ THANH TOÁN & ĐỒNG BỘ ĐƠN HÀNG REALTIME

Hệ thống hỗ trợ thanh toán qua chuyển khoản QR Code với quy trình xác thực tự động hoặc duyệt thủ công qua Admin:

```
┌─────────────────────────┐          Tạo đơn QR          ┌─────────────────────────┐
│     App Máy Khách       ├─────────────────────────────►│    Backend / DB Atlas   │
│  (Trạng thái: Chờ duyệt)│◄─────────────────────────────┤     (Tạo payment)       │
└───────────┬─────────────┘                              └────────────┬────────────┘
            │                                                         │
            │ Lắng nghe Realtime                                      │ Admin bấm Duyệt
            │ (startUserOrdersPoll)                                   ▼
            │                                            ┌─────────────────────────┐
            │   🎉 Đơn hàng đã được duyệt!               │    Trang Quản Trị       │
            └◄───────────────────────────────────────────┤   (Admin Dashboard)     │
                - Reo chuông thông báo 🔔                └─────────────────────────┘
                - Nút đổi sang "▶ Xem thử trên OBS"
                - Tự động mở khóa hiệu ứng ngay tức thì
```

### Điểm nổi bật:
- **API `GET /api/payment/my-orders`:** Trả về danh sách đơn hàng và quyền sở hữu hiệu ứng theo thời gian thực.
- **Bộ lắng nghe Realtime trên App khách (`startUserOrdersPoll`):**
  - Chạy ngầm định kỳ mỗi 4 giây.
  - Ngay khi Admin bấm **Duyệt đơn** ở trang Quản trị, máy khách của người dùng tự động:
    1. Phát âm thanh chuông báo `🔔`.
    2. Hiển thị popup thông báo chúc mừng.
    3. Tự động chuyển đổi nút từ **"⏳ Đang chờ duyệt"** sang **"▶ Xem thử trên OBS"** (Đã sở hữu) ngay trước mắt người dùng **mà không cần bấm Ctrl + R hay khởi động lại app**.
    4. Thêm hiệu ứng vào tab *Hiệu ứng của tôi* và danh sách chọn hiệu ứng ở mục *Gán quà*.

---

## 6. CHI TIẾT CÁC TÍNH NĂNG CHÍNH CỦA LIVEFLOW

1. **Cửa Hàng Hiệu Ứng (Store Marketplace):**
   - Phân loại danh mục (Biến hình, Quà tặng, Phông nền, Hoạt ảnh, PK, Meme...).
   - Hỗ trợ Flash Sale toàn cục, đếm ngược thời gian giảm giá, huy hiệu Hot Trends.
2. **Trang Quản Trị (Admin Dashboard):**
   - Quản lý thêm/sửa/xóa hiệu ứng cửa hàng.
   - Quản lý Banner trang chủ.
   - Quản lý Coins & Giá trị quy đổi quà tặng TikTok.
   - Quản lý tài khoản người dùng, gói thời hạn, duyệt và từ chối thanh toán.
3. **Trình Thiết Kế Bảng Quà & Vòng Quay (Menu Designer & Wheel):**
   - Thiết kế menu quà tặng tương tác trực quan (kéo thả, căn chỉnh thông minh, snapping, guides).
   - **Tích hợp trọn bộ 195 Font chữ UTM Unicode:** Streamer tự do chọn font UTM cho từng thành phần (Tên quà, Giá xu, Tiêu đề chữ, Bảng mục tiêu donate, Vòng quay, Thanh PK, Bảng xếp hạng Top Donate, Bục vinh danh).
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

## 7. HƯỚNG DẪN VẬN HÀNH & XỬ LÝ LỖI (TROUBLESHOOTING)

### A. Khởi động hệ thống trong môi trường phát triển (Dev):
1. Mở Terminal tại thư mục gốc:
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
| **Bấm thêm hiệu ứng bị đứng** | Tiến trình Server cũ trong RAM bị nghẽn cổng. | Tắt ứng dụng trong Task Manager và mở lại. |
| **Mất kết nối MongoDB** | Đường truyền mạng hoặc cấu hình IP trên Atlas. | Đảm bảo MongoDB Atlas đã mở Network Access `0.0.0.0/0` (Allow access from anywhere). |
| **Ảnh đại diện hiện nốt nhạc** | Chưa có ảnh thumbnail hoặc chưa chọn ảnh. | Dùng nút "🖼️ Đổi ảnh" trên thẻ hiệu ứng để chọn ảnh mới. |
| **AI Cà Khịa không phản hồi** | Chưa bật tính năng hoặc chưa có bình luận mới. | Bật checkbox "Trợ lý AI Cà Khịa Live Chat" và kiểm tra cooldown (mặc định 20s). |

---

## 8. QUY TRÌNH ĐÓNG GÓI & PHÁT HÀNH RELEASE WINDOWS

1. **Chuẩn bị môi trường & kiểm thử:**
   - Chạy lệnh `npm test` để xác minh 25 test suite hoàn toàn xanh.
   - Chạy `node scripts/validate-release.js` kiểm tra điều kiện phát hành.
2. **Lệnh đóng gói bản cài đặt chính thức:**
   ```bash
   npm run release:windows
   ```
3. **Cấu trúc bản cài đặt sau khi đóng gói:**
   - **Tệp cài đặt:** `desktop/dist/LiveFlow-Setup-1.0.1.exe` (~196MB).
   - Tự động tích hợp binary MongoDB, bộ font UTM, toàn bộ asset âm thanh mẫu offline và icon chính thức LiveFlow.
   - Hỗ trợ cài đặt 1-click mượt mà trên tất cả các máy tính Windows 10/11.

---
*Tài liệu này là cẩm nang kỹ thuật và vận hành chính thức của dự án LiveFlow.*
