# Brand assets cần bổ sung

## Bắt buộc trước khi phát hành chính thức

- [ ] `desktop/assets/icon.png`
  - PNG 1024×1024.
  - Nền trong suốt.
  - Biểu tượng rõ khi thu nhỏ, không chứa chữ nhỏ.

- [ ] `desktop/assets/icon.ico`
  - ICO đa kích thước dành cho Windows và installer.
  - Nên chứa 16, 24, 32, 48, 64, 128 và 256 px.
  - Xuất từ cùng thiết kế với `icon.png`.

## Nên có

- [ ] `desktop/assets/effectstore-logo.svg`
  - File vector nguồn, nền trong suốt.

- [ ] `desktop/assets/logo-horizontal.png`
  - Kích thước đề xuất 1200×320.
  - Gồm biểu tượng và chữ “EffectStore”.

- [ ] `desktop/assets/icon-monochrome.svg`
  - Phiên bản đơn sắc cho tray, watermark và nền tối/sáng.

## Yêu cầu thiết kế

- Chừa vùng an toàn 10–15% quanh biểu tượng.
- Ưu tiên 2–3 màu thương hiệu.
- Tránh chi tiết quá nhỏ, blur và chữ nằm trong icon.
- Kiểm tra ở kích thước 16×16 và trên cả nền sáng lẫn nền tối.
- Concept gợi ý: chữ E kết hợp nút Play, tia sáng/effect, hoặc khung video dọc kết hợp ngôi sao.

## Sau khi có file

- Cấu hình `desktop/package.json` sử dụng `assets/icon.ico` cho Windows build.
- Chạy `npm run release:check`.
- Chạy `npm run build:verify` và kiểm tra icon của file EXE.
- Build installer và kiểm tra icon tại Start Menu, Desktop shortcut và Apps & Features.
