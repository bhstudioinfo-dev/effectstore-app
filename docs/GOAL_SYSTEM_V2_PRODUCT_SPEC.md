# TÀI LIỆU TẢ THIẾT KẾ HỆ THỐNG MỤC TIÊU V2 & THANH ĐỐI KHÁNG ĐA LUỒNG
## Bảng Đặc Tả Sản Phẩm, UX/UI & Kiến Trúc Kỹ Thuật (BH Studio - Live Stream Tiktok)

---

## PHẦN 1 — TẦM NHÌN SẢN PHẨM & PHÂN TÍCH THIẾT KẾ (VISION & UI ANALYSIS)

Mô-đun **🎯 Mục tiêu Livestream (Bảng PK Nhóm)** được thiết kế để tạo ra các trận đấu PK trực tiếp kịch tính, lôi cuốn người xem tặng quà ủng hộ Idol. Dựa trên bản thiết kế giao diện chuẩn của BH Studio, hệ thống PK sẽ hỗ trợ cấu hình đa dạng từ **2 Đội, 3 Đội đến 4 Đội** với các phong cách đồ họa đặc thù được tối ưu hóa hiển thị.

### Phân tích giao diện mẫu (UI Showcase Analysis)
Các mẫu giao diện PK trong thiết kế của BH Studio đạt tính thẩm mỹ cực cao nhờ sự kết hợp hài hòa giữa:
1. **Mục tiêu quy đổi bằng Xu (Coins Target):** Điểm số thi đấu được hiển thị trực quan dưới dạng **Xu (Coins/Kim cương)** thay vì số lượng quà thô. Ở góc trên bên phải thanh PK, một huy hiệu màu vàng kim sang trọng sẽ hiển thị mục tiêu tổng của trận đấu (Ví dụ: `🎯 Mục tiêu: 30,000,000`). Giá trị mục tiêu này được cấu hình tùy ý theo nhu cầu của phiên live.
2. **Thông tin Đội tùy chỉnh (Custom Team Names):** Tên của các đội (Ví dụ: "TEAM DANCE", "TEAM MUSIC", "ĐỘI ĐỎ", "ĐỘI XANH") có thể chỉnh sửa tự do bằng văn bản tiếng Việt.
3. **Bộ đếm thời gian linh hoạt (Customizable Timer):** Đồng hồ đếm ngược thời gian trận PK hiển thị cân đối phía trên thanh, cho phép bật/tắt và cài đặt thời lượng thời gian thi đấu tùy ý.
4. **Biểu tượng đội linh hoạt (Dynamic Team Avatars):** Các huy hiệu hình khiên (Shield) ở hai đầu thanh tiến trình có thể tùy chỉnh hiển thị giữa các khiên linh vật có sẵn, ảnh avatar của streamer tự tải lên, hoặc trực tiếp hiển thị icon của món quà tặng đích.
5. **Hiệu ứng Hào quang (Aura Glow Effects):** Vầng hào quang động co giãn nhịp thở bao quanh cả thanh PK lẫn hình đại diện của các đội, nhấp nháy mạnh mẽ hơn cho đội đang dẫn đầu.
6. **Thanh tiến trình vát chéo (Slanted Segment Bar):** Các phân đoạn màu gặp nhau tại góc vát chéo động tạo cảm giác trượt đẩy kịch tính.

---

## PHẦN 2 — CƠ CẤU MÔ-ĐUN & PHÂN LOẠI PRESETS

Hệ thống điều khiển phía bên trái (Inspector) và khu vực hiển thị (Overlay) chia thành các cấu hình mẫu giao diện (Style Presets) cố định sau:

### 1. ⚔️ Các phong cách PK mẫu (PK Style Presets)
- **Esport (Thể thao điện tử):**
  - *Đặc điểm:* Các khiên linh vật hình lục giác góc trạng, phân đoạn chéo vát chéo, hào quang dạng viền sắc nét cường độ mạnh.
  - *Màu sắc:* Đỏ tươi, Xanh dương đậm, Vàng hổ phách, Xanh lá cây.
- **Fire vs Ice (Băng hỏa song hành - Chỉ cho PK 2 Đội):**
  - *Đặc điểm:* Phân đoạn đỏ rực hiệu ứng lửa cháy mờ khói đối đầu với phân đoạn xanh băng giá có tia sét bao phủ.
- **Royal (Hoàng gia):**
  - *Đặc điểm:* Huy hiệu vương miện mạ vàng sang trọng, thanh tiến trình ánh kim có độ bóng lồi (metallic bevel 3D), hào quang vàng kim quý phái phát sáng chầm chậm.
- **Neon (Đèn Neon lấp lánh):**
  - *Đặc điểm:* Huy hiệu ngôi sao neon tỏa sáng viền mỏng, thanh tiến trình màu hồng magenta và xanh cyan phát sáng rực rỡ trên nền kính mờ. Hào quang tỏa sáng lan tỏa mịn màng.
- **Minimal (Tối giản):**
  - *Đặc điểm:* Thanh phẳng, góc bo tròn nhẹ, màu sắc pastel nhã nhặn, không sử dụng hiệu ứng hào quang hoặc chỉ sử dụng bóng đổ xám tối giản.

---

## PHẦN 3 — MÔ HÌNH DỮ LIỆU ĐỒNG NHẤT (UNIFIED GOAL DATA MODEL V2)

Để lưu giữ trọn vẹn các thuộc tính mỹ thuật của giao diện mẫu, cấu trúc JSON của widget PK đối kháng được quy hoạch lại như sau:

### 1. JSON Schema Thuộc Tính PK Đầy Đủ
```typescript
interface PKGoalWidget {
  id: string;                     // Định danh layer
  type: "goal-bar";
  barStyle: "pk";                 // Định danh kiểu thanh PK đối kháng
  presetStyle: "esport" | "fire_vs_ice" | "royal" | "neon" | "minimal"; // Preset được chọn
  teamCount: 2 | 3 | 4;           // Số lượng đội (Giới hạn cứng từ 2 đến 4)
  
  // --- Cài đặt mục tiêu trận đấu tùy chỉnh ---
  targetScore: number;            // Mục tiêu xu của trận đấu (Ví dụ: 30000000 xu)
  showTimer: boolean;             // Bật/tắt đồng hồ đếm ngược
  timerDuration: string;          // Thời gian đếm ngược tùy chỉnh (Ví dụ: "00:20:00")
  showTopContributors: boolean;   // Bật/tắt hiển thị Top người đóng góp nhiều nhất
  
  // --- Thiết lập Hào quang (Aura) ---
  enableAuraEffect: boolean;      // Bật/tắt hiệu ứng hào quang động
  auraIntensity: "soft" | "normal" | "epic"; // Cường độ phát sáng hào quang
  
  // --- Danh sách thông tin đội ---
  pkPlayers: PKTeam[];
}

interface PKTeam {
  id: string;                    // Định danh đội (ví dụ: "team_1")
  name: string;                  // Tên đội tùy chỉnh (Ví dụ: "TEAM RED", "TEAM BLUE")
  color: string;                 // Màu sắc của đoạn thanh tiến trình đại diện cho đội
  score: number;                 // Điểm số (xu/coins) hiện tại của đội (Ví dụ: 12650000)
  giftId: string;                // ID quà tặng tính điểm (Ví dụ: "rose")
  giftName: string;              // Tên quà tính điểm
  pointMultiplier: number;       // Hệ số nhân điểm của đội này (ví dụ: 1)

  // --- Cấu hình tùy chọn ảnh đại diện cho đội ---
  iconMode: "preset" | "upload" | "gift"; // 3 Chế độ hiển thị: Khiên có sẵn / Tự tải ảnh / Tự lấy hình quà tặng
  iconPreset?: "lion" | "wolf" | "crown" | "star"; // Biểu tượng khiên có sẵn
  customIconUrl?: string;        // Đường dẫn hình avatar tự tải lên
  iconGiftId?: string;           // ID quà tặng để lấy icon quà làm avatar
}
```

---

## PHẦN 4 — KIẾN TRÚC HTML & CSS DỰNG CÁC PHONG CÁCH (CSS STYLING SPECIFICATIONS)

Dưới đây là đặc tả mã nguồn HTML/CSS gợi ý để lập trình viên BH Studio xây dựng giao diện chính xác theo hình ảnh thiết kế:

### 1. Dựng hiệu ứng Hào quang Động (Dynamic Aura Glow CSS)

#### A. Hiệu ứng Hào quang xung quanh Avatar (Avatar Aura Pulsing)
Hào quang bao quanh avatar đấu thủ sẽ co giãn cường độ phát sáng liên tục theo chu kỳ thời gian thực, đặc biệt nhấp nháy mạnh hơn cho **Đội đang dẫn đầu điểm số**:

```css
@keyframes auraPulse {
  0% {
    box-shadow: 0 0 10px var(--team-glow-color), 0 0 20px rgba(255,255,255,0.1);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 24px var(--team-glow-color), 0 0 45px var(--team-glow-color)80;
    transform: scale(1.03);
  }
  100% {
    box-shadow: 0 0 10px var(--team-glow-color), 0 0 20px rgba(255,255,255,0.1);
    transform: scale(1);
  }
}

.gmd-pk-avatar-aura {
  position: relative;
  border-radius: 50%;
  animation: auraPulse 2.5s ease-in-out infinite;
  transition: all 0.3s ease;
}

.gmd-pk-avatar-aura.is-leading {
  animation: auraPulse 1.2s ease-in-out infinite;
  border-color: #ffffff;
  box-shadow: 0 0 35px var(--team-glow-color), 0 0 60px var(--team-glow-color);
}
```

#### B. Hiệu ứng Hào quang xung quanh Thanh PK (PK Bar Glow Aura)
Thanh PK chính sẽ được bao quanh bởi một dải hào quang hỗn hợp để tạo hiệu ứng nổi bật:

```css
.gmd-pk-bar-container.has-aura {
  box-shadow: 
    0 10px 30px rgba(0,0,0,0.65), 
    0 0 18px color-mix(in srgb, var(--team-1-color) 50%, var(--team-2-color)) 30%;
  animation: barAuraBreathing 4s ease-in-out infinite alternate;
}

@keyframes barAuraBreathing {
  0% {
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--team-1-color) 40%, var(--team-2-color) 40%));
  }
  100% {
    filter: drop-shadow(0 0 18px color-mix(in srgb, var(--team-1-color) 60%, var(--team-2-color) 60%));
  }
}
```

---

## PHẦN 5 — SƠ ĐỒ THIẾT KẾ BẢNG ĐIỀU KHIỂN (INSPECTOR UI/UX)

Để đồng bộ với trải nghiệm thu gọn ngăn nắp giống như mục Quà Tặng, bảng Inspector của Bảng PK sẽ được tổ chức phân chia chặt chẽ thành **2 PHẦN CHÍNH** (collapsible accordion):

```
┌────────────────────────────────────────────────────────┐
│  WIDGET INSPECTOR: THANH PK ĐỐI KHÁNG                  │
├────────────────────────────────────────────────────────┤
│  [Header layer name] [Delete Button]                   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ▼ PHẦN 1: KÍCH THƯỚC & VỊ TRÍ                          │
│  ├─ Vị trí X / Y: [ 90 ] px  [ 800 ] px                │
│  ├─ Rộng (W):     [=================== 900px ]         │
│  ├─ Cao (H):      [========= 160px ]                   │
│  └─ Khóa tỷ lệ:   [X] Bật (Aspect Ratio)               │
│                                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ▼ PHẦN 2: TÍNH NĂNG NÂNG CAO                          │
│  ├─ CẤU HÌNH CHUNG:                                    │
│  │  ├─ Số đội PK: [ 2 ] [ 3 ] [ 4 ]                    │
│  │  ├─ Kiểu hiển thị: [ Thanh ngang chia phân ]        │
│  │  └─ Mẫu Preset: [ Esport / Neon / Royal / Minimal ] │
│  │                                                     │
│  ├─ CẤU HÌNH ĐỘI BÓNG / ĐẤU THỦ:                       │
│  │  ├─ Đội 1: [ Tên đội ] [ Màu ] [ Chọn Avatar/Quà ]  │
│  │  └─ Đội 2: [ Tên đội ] [ Màu ] [ Chọn Avatar/Quà ]  │
│  │                                                     │
│  ├─ CÀI ĐẶT MỤC TIÊU (COINS):                          │
│  │  ├─ Mục tiêu xu: [ 30,000,000 ] xu                 │
│  │  ├─ [X] Hiện thời gian PK: [ 00:20:00 ]             │
│  │  └─ [X] Hiện top đóng góp của các đội               │
│  │                                                     │
│  ├─ HIỆU ỨNG HÀO QUANG (AURA):                         │
│  │  ├─ [X] Bật Aura phát sáng cho thanh & avatar       │
│  │  └─ Cường độ sáng: [ Dịu nhẹ / Bình thường / Epic ]  │
│  │                                                     │
│  └─ GIẢ LẬP KIỂM THỬ (TEST SIMULATOR):                 │
│     ├─ Đội 1: [ +10K ] [ +50K ] [ +100K ]              │
│     ├─ Đội 2: [ +10K ] [ +50K ] [ +100K ]              │
│     └─ [ Reset điểm trận đấu ]                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Chi tiết hành vi tương tác UI của 2 phần:

1. **PHẦN 1: KÍCH THƯỚC & VỊ TRÍ:**
   - Được mở mặc định khi chọn widget để streamer có thể căn chỉnh nhanh tọa độ X, Y, W, H hoặc khóa tỷ lệ để khi co kéo widget không bị méo.
2. **PHẦN 2: TÍNH NĂNG NÂNG CAO:**
   - Sử dụng thẻ Accordion tiêu đề lớn có biểu tượng mũi tên đóng/gập.
   - Khi gập mở, chứa toàn bộ cấu hình lõi: chọn số đội, chọn Preset đồ họa, đổi tên/màu sắc của từng đội, chọn ảnh avatar tải lên hoặc icon quà tặng, cài đặt đích Xu mục tiêu, bộ chỉnh thời gian đếm ngược, bật tắt Aura hào quang, và khu vực nút giả lập Test.

---

## PHẦN 6 — HỆ THỐNG GIẢ LẬP TRỰC QUAN (TEST SIMULATOR)

Bộ giả lập kiểm thử phía dưới Inspector giúp streamer kiểm nghiệm chính xác chuyển động và hiệu ứng mà không phụ thuộc vào yếu tố ngẫu nhiên:

### 1. Phân bổ phím Test cố định
- **Nút Reset điểm:** Đưa điểm số của tất cả các đội về lại 0 (Thanh tiến trình chia đều các khoảng tự động).
- **Dòng nút Test nhanh:** Cung cấp 3 nút bấm cố định áp dụng cho từng đội:
  - `+10K` (Cộng 10.000 điểm)
  - `+50K` (Cộng 50.000 điểm)
  - `+100K` (Cộng 100.000 điểm)
  Streamer chỉ cần click chọn đội cần test, sau đó bấm nút điểm tương ứng để xem phân đoạn chéo của đội đó trượt đẩy lùi phân đoạn đội đối thủ ra sao trên Canva.

---

## PHẦN 7 — KẾ HOẠCH TRIỂN KHAI TỪNG BƯỚC AN TOÀN (IMPLEMENTATION PHASES)

Để triển khai hệ thống giao diện PK tuyệt đẹp này một cách an toàn nhất, kỹ sư BH Studio nên tiến hành theo 4 giai đoạn nhỏ:

- **Giai đoạn 1 (Giao diện tĩnh & Presets):** Dựng khung HTML/CSS tĩnh cho các mẫu chéo góc bằng `clip-path` và bộ khung viền hào quang phát sáng.
- **Giai đoạn 2 (Tích hợp Inspector & Luồng Upload):** Xây dựng bảng điều khiển chọn số đội, cấu hình màu sắc, nạp ảnh đại diện (hỗ trợ file upload và trích xuất ảnh quà tặng tự động) cùng cài đặt cường độ phát sáng hào quang.
- **Giai đoạn 3 (Point Engine & Live updates):** Tích hợp luồng WebSocket nhận điểm sự kiện quà tặng thật từ TikTok, định vị quà tặng tương ứng cho từng đội để cộng điểm chuẩn xác.
- **Giai đoạn 4 (Bộ Simulator & Hoàn thiện):** Hoàn thiện các nút cộng điểm nhanh cố định (+10K, +50K, +100K) và tối ưu hóa hiệu năng render chuyển động của thanh vát chéo trên OBS Studio.
