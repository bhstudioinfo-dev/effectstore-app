# Hướng Dẫn Chạy EffectStore Trên Máy Mới

## 1) Cài phần mềm cần thiết

- `Git`
- `Node.js` (khuyên dùng bản LTS)
- (Nếu dùng desktop app) cài thêm môi trường build theo Electron của dự án

Kiểm tra nhanh:

```bash
git --version
node -v
npm -v
```

## 2) Clone source từ GitHub

```bash
git clone https://github.com/bhstudioinfo-dev/effectstore-app.git
cd effectstore-app
```

## 3) Cài thư viện

```bash
npm install
```

Nếu dự án có backend riêng trong thư mục `backend`, chạy thêm:

```bash
cd backend
npm install
cd ..
```

## 4) Tạo file môi trường (.env)

Tạo file `.env` ở root (và/hoặc trong `backend` nếu hệ thống yêu cầu), điền thông tin:

- DB connection
- JWT/secret key
- API key liên quan
- Port backend (thường là `9000`)

Lưu ý:
- **Không** commit `.env` lên GitHub.
- `.env` đã nằm trong `.gitignore`.

## 5) Chạy backend

Tùy script trong `package.json`, thường là:

```bash
cd backend
npm run dev
```

hoặc:

```bash
npm start
```

## 6) Chạy desktop/renderer

Mở terminal mới ở root project:

```bash
npm run dev
```

hoặc script Electron tương ứng trong `package.json`.

## 7) Kiểm tra nhanh sau khi chạy

1. Mở app thành công, đăng nhập được.
2. Vào `Gift Menu Designer` thấy đủ 3 cột.
3. Kéo gift vào canvas được.
4. Chỉnh aura/animation được.
5. Lưu layout không lỗi.
6. Mở preview overlay:
   - `http://localhost:9000/overlay/gift-menu/`

## 8) Quy trình cập nhật code hằng ngày

Trước khi làm:

```bash
git pull
```

Sau khi làm xong:

```bash
git add -A
git commit -m "mô tả thay đổi"
git push
```

## 9) Nếu gặp lỗi thường gặp

- Lỗi cổng đang dùng:
  - đổi port hoặc tắt process cũ.
- Lỗi thiếu module:
  - chạy lại `npm install`.
- Lỗi quyền truy cập GitHub:
  - chạy `gh auth login` rồi `git push`.

