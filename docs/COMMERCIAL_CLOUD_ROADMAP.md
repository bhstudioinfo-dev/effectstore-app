# Lộ trình thương mại hóa EffectStore

> Trạng thái: Chưa triển khai. Chỉ bắt đầu sau khi bản desktop cục bộ đã ổn định và được chủ dự án xác nhận.
>
> Mục tiêu của tài liệu: Làm nguồn yêu cầu chính thức cho giai đoạn đưa EffectStore thành ứng dụng Windows thương mại có cửa hàng online, nội dung được bảo vệ và khả năng cập nhật sau phát hành.

## 1. Mục tiêu sản phẩm

EffectStore tiếp tục là ứng dụng Windows `.exe` xây dựng bằng Electron, dành chủ yếu cho người Việt livestream TikTok.

Người dùng có thể:

- Đăng nhập trong ứng dụng desktop.
- Kết nối TikTok Live và OBS.
- Gán quà TikTok với hiệu ứng.
- Mua gói sử dụng, effect hoặc mẫu bảng quà.
- Sử dụng nội dung đã mua trực tiếp trong EffectStore và OBS.
- Thấy sản phẩm mới trong cửa hàng mà không cần tải lại hoặc cài lại app.
- Tự thêm effect cá nhân và chỉ lưu effect đó trên máy của mình.

Admin có thể:

- Đăng effect mới từ tài khoản admin.
- Đóng gói thiết kế trong Gift Menu Designer thành sản phẩm để bán.
- Thay đổi giá, mô tả, ảnh xem trước, gói áp dụng và trạng thái sản phẩm.
- Phát hành phiên bản mới của effect/menu mà không ghi đè phiên bản cũ.
- Quản lý người dùng, đơn hàng, thiết bị và quyền sở hữu.

## 2. Nguyên tắc bắt buộc

### 2.1. Nội dung thương mại của admin

- Không đóng gói effect hoặc menu thương mại trong installer.
- File gốc chỉ lưu trong kho online riêng tư do admin kiểm soát.
- Không lưu file gốc dạng `.mp4`, `.webm`, `.gif`, `.png` hoặc JSON rõ trên máy khách.
- Không cung cấp nút tải xuống, xuất nguồn hoặc URL trực tiếp.
- Máy khách chỉ được giữ cache mã hóa khi cần đảm bảo khả năng phát ổn định.
- Nội dung chỉ được giải mã trong bộ nhớ khi sử dụng.
- Backend online là nơi duy nhất quyết định người dùng có quyền sử dụng hay không.

### 2.2. Effect cá nhân của khách

- Effect do khách tự thêm chỉ lưu trên máy của chính khách.
- Không tự động tải lên máy chủ hoặc kho online của admin.
- Không xuất hiện trong cửa hàng.
- Không đồng bộ sang thiết bị khác.
- Chỉ dùng cho Gift Mapping trên thiết bị đã thêm effect.
- Khách có thể xóa effect và ảnh thu nhỏ liên quan.

Hai loại nội dung phải dùng đường dẫn, API, mã nhận dạng và quy trình xử lý riêng.

## 3. Kiến trúc mục tiêu

```text
EffectStore.exe trên máy khách
├── Giao diện desktop tiếng Việt
├── TikTok Live
├── OBS WebSocket và Browser Source
├── Hàng đợi phát hiệu ứng
├── Gift Mapping
├── Gift Menu Designer
├── Effect cá nhân trên máy
├── Cache thương mại đã mã hóa
└── Trình cập nhật ứng dụng
             │ HTTPS
             ▼
Backend EffectStore online
├── Tài khoản và thiết bị
├── Cửa hàng
├── Gói và thanh toán
├── Quyền sở hữu
├── Phiên sử dụng ngắn hạn
├── Phiên bản sản phẩm
└── API quản trị
             │
      ┌──────┴──────┐
      ▼             ▼
Database online   Kho file riêng tư
                  ├── Effect mã hóa
                  ├── Menu mã hóa
                  ├── Ảnh xem trước
                  └── Bản cập nhật app
```

Backend được đóng gói trong desktop vẫn phụ trách TikTok, OBS, hàng đợi và phát nội dung cục bộ. Backend đó không được tự quyết định quyền sở hữu thương mại.

## 4. Hạ tầng khởi đầu dự kiến

Ưu tiên giai đoạn đầu gần như không tốn chi phí:

- Render Free: chạy backend Node.js/Express online trong giai đoạn beta.
- MongoDB Atlas Free: lưu tài khoản, sản phẩm, đơn hàng và quyền sở hữu.
- Cloudflare R2 Standard private: lưu effect/menu mã hóa.
- R2 hoặc GitHub Releases: phân phối cập nhật ứng dụng.
- Dùng domain miễn phí của dịch vụ trong giai đoạn thử nghiệm.

Giới hạn cần chấp nhận:

- Backend miễn phí có thể ngủ và khởi động chậm sau thời gian không hoạt động.
- Hạ tầng miễn phí không phù hợp để cam kết production liên tục.
- Database miễn phí cần quy trình backup riêng.
- Phải theo dõi dung lượng, lượt đọc và giới hạn request.

Khi có doanh thu, ưu tiên nâng cấp theo thứ tự:

1. Backend luôn hoạt động.
2. Backup database tự động.
3. Domain chính thức.
4. Code-signing Windows.
5. Giám sát lỗi và cảnh báo.
6. Database và kho lưu trữ khi chạm giới hạn.

## 5. Mô hình dữ liệu tối thiểu

### Product

```text
productId
type: effect | menu
name
description
price
previewAssets
planAccess
contentVersion
minimumAppVersion
checksum
status: draft | published | hidden | retired
publishedAt
```

### Entitlement

```text
userId
productId
source: purchase | subscription | admin_grant
startsAt
expiresAt
status
orderId
```

### Device

```text
deviceId
userId
name
firstSeenAt
lastSeenAt
status
```

### User menu layout

```text
userLayoutId
userId
sourceProductId
sourceContentVersion
customizations
createdAt
updatedAt
```

Mỗi bản của người dùng phải có ID riêng. Không lưu chỉnh sửa của khách vào mẫu gốc của admin.

## 6. Quy trình admin đăng effect

1. Admin chọn file effect.
2. Nhập tên, mô tả, giá và gói áp dụng.
3. Chọn hoặc tạo ảnh/video xem trước.
4. Chọn phiên bản app tối thiểu.
5. Hệ thống kiểm tra định dạng, dung lượng và thời lượng.
6. Hệ thống tối ưu media nếu cần.
7. Hệ thống mã hóa nội dung bằng khóa riêng của sản phẩm.
8. Tải nội dung đã mã hóa lên kho private.
9. Tạo bản ghi sản phẩm ở trạng thái nháp.
10. Admin xem trước và nhấn `Đăng bán`.
11. Cửa hàng của khách tự tải danh sách mới.

Không được đặt khóa kho lưu trữ hoặc khóa giải mã chính trong Electron.

## 7. Quy trình đóng gói menu để bán

Gift Menu Designer cần nút `Đóng gói để bán`, chỉ hiển thị cho admin.

Quy trình:

1. Kiểm tra bố cục và tài nguyên bị thiếu.
2. Thu thập layout, ảnh, video, font, widget và metadata.
3. Tạo ảnh xem trước.
4. Nhập tên, mô tả, giá, gói áp dụng và phiên bản app tối thiểu.
5. Tạo manifest và checksum.
6. Ký manifest.
7. Mã hóa gói menu.
8. Tải lên kho private.
9. Đăng sản phẩm vào cửa hàng.

Sau khi mua, khách chỉ thấy `Sử dụng mẫu`. App tạo bản tùy chỉnh riêng của khách; không cung cấp chức năng xuất toàn bộ tài nguyên nguồn của admin.

## 8. Đồng bộ cửa hàng

Không cần cập nhật `.exe` khi admin:

- Thêm effect hoặc menu mới.
- Đổi giá, tên, mô tả hoặc ảnh xem trước.
- Đưa sản phẩm vào hoặc ra khỏi một gói.
- Ẩn hoặc mở lại sản phẩm.
- Phát hành phiên bản nội dung dùng định dạng app đã hỗ trợ.

App khách cập nhật cửa hàng khi:

- Mở màn hình cửa hàng.
- Người dùng nhấn tải lại.
- Đến chu kỳ kiểm tra định kỳ.
- Nhận sự kiện sản phẩm mới qua WebSocket hoặc cơ chế realtime tương đương.

Nếu app quá cũ so với `minimumAppVersion`, hiển thị hướng dẫn cập nhật thay vì cố mở sản phẩm.

## 9. Luồng sử dụng nội dung thương mại

1. App gửi token đăng nhập, `deviceId` và `productId` cho backend online.
2. Backend kiểm tra tài khoản, thiết bị, gói và quyền sở hữu.
3. Backend cấp phiên sử dụng ngắn hạn gắn với user, device và product.
4. App nhận nội dung mã hóa từ kho online.
5. Effect nhỏ có thể giữ trong RAM; effect lớn dùng cache mã hóa.
6. Backend cục bộ giải mã theo đoạn khi phát.
7. OBS chỉ truy cập endpoint nội bộ tại `127.0.0.1` bằng token ngắn hạn.
8. Khi quyền hết hạn, app không được nhận phiên sử dụng mới.

Không được truyền URL nguồn lâu dài hoặc file rõ cho renderer/OBS.

## 10. Cache trên máy khách

- Chỉ lưu ciphertext, không lưu media rõ.
- Dùng tên file ngẫu nhiên và phần mở rộng riêng như `.esdata`.
- Không cho mở thư mục cache từ giao diện khách.
- Giới hạn tổng dung lượng cache.
- Dọn nội dung cũ theo LRU hoặc thời gian hết hạn.
- Xóa khóa phiên khi đăng xuất hoặc mất quyền.
- Có nút `Dọn bộ nhớ đệm` nhưng phải giải thích rõ không làm mất sản phẩm đã mua.
- Khi mất mạng giữa livestream, cân nhắc thời gian gia hạn ngắn để không dừng đột ngột.

## 11. Phiên bản nội dung

Không ghi đè object cũ:

```text
products/fire-dragon/v1/content.esdata
products/fire-dragon/v2/content.esdata
products/fire-dragon/v3/content.esdata
```

- Người đang phát phiên bản cũ không bị gián đoạn.
- Phiên mới dùng phiên bản đã được publish.
- Có thể rollback về phiên bản ổn định.
- Cache phân biệt bằng product ID, version và checksum.

## 12. Cập nhật ứng dụng Windows

Chỉ cần build `.exe` mới khi:

- Thêm hoặc thay đổi tính năng.
- Thêm widget/định dạng mà app cũ chưa hỗ trợ.
- Sửa lỗi hoặc lỗ hổng bảo mật.
- Thay đổi giao thức nội dung.

Auto-update cần:

- Kiểm tra phiên bản khi app khởi động và theo chu kỳ hợp lý.
- Tải bản cập nhật trong nền.
- Không tự khởi động lại khi đang livestream.
- Cho chọn `Cập nhật ngay` hoặc `Để sau`.
- Hỗ trợ phiên bản bắt buộc khi có lỗi bảo mật nghiêm trọng.
- Có release notes và quy trình rollback.
- Kiểm tra update trên bản cài đặt Windows thật, không chỉ bản dev.

## 13. Thanh toán ban đầu

Giai đoạn đầu tiếp tục duyệt thủ công:

1. Khách tạo đơn trong app.
2. Khách chuyển khoản và có thể gửi ảnh chứng minh.
3. Admin kiểm tra đơn.
4. Admin duyệt.
5. Backend online cấp entitlement đúng một lần.
6. App khách tự cập nhật quyền.

Không cấp quyền dựa trên dữ liệu do backend cục bộ hoặc renderer tự khai báo.

Sau khi có doanh thu mới cân nhắc tích hợp cổng thanh toán tự động.

## 14. Bảo mật tối thiểu

- Bucket không public.
- Không lưu credential R2 trong app khách.
- Không lưu master encryption key trong Electron.
- Mỗi sản phẩm có khóa nội dung riêng.
- Manifest được ký và kiểm tra checksum.
- Token sử dụng có thời hạn ngắn.
- Giới hạn thiết bị và phiên đồng thời.
- Có chức năng thu hồi thiết bị.
- Rate limit cho đăng nhập, cấp quyền và thanh toán.
- Ghi nhật ký sự kiện bảo mật quan trọng.
- Không trả secret hoặc stack trace cho khách.
- Có backup database và kiểm tra restore.

Mục tiêu bảo vệ thực tế là khách thông thường không thể vào thư mục và lấy file gốc. Không tuyên bố chống trích xuất tuyệt đối khỏi RAM/GPU.

## 15. Trải nghiệm người dùng

Luồng chính phải đơn giản:

```text
Cài app → Đăng nhập → Kết nối TikTok → Kết nối OBS
→ Chọn quà → Chọn hiệu ứng → Bắt đầu livestream
```

Yêu cầu UX:

- Tiếng Việt dễ hiểu cho người không chuyên.
- Không hiển thị backend, token, URI hoặc thuật ngữ nội bộ cho khách thường.
- Có hướng dẫn kết nối OBS và TikTok từng bước.
- Có nút `Kiểm tra toàn bộ kết nối`.
- Có trạng thái `Đã sẵn sàng phát`.
- Lỗi phải nêu nguyên nhân và cách xử lý.
- Cửa hàng hiển thị rõ: `Mua ngay`, `Đang chờ duyệt`, `Đã mua`, `Sử dụng`, `Có trong gói`, `Cần cập nhật ứng dụng`.
- Effect cá nhân có nhãn `Chỉ lưu trên thiết bị này`.
- Nội dung mua từ cửa hàng có nhãn `Sử dụng theo tài khoản EffectStore`.

## 16. Thứ tự triển khai

### Giai đoạn A — Chuẩn bị cloud

- Tạo môi trường development/staging/production riêng.
- Tạo backend online.
- Kết nối database online.
- Tạo R2 private.
- Chuẩn hóa secret và biến môi trường.
- Không thay đổi luồng TikTok/OBS cục bộ nếu chưa cần.

### Giai đoạn B — Nguồn quyền trung tâm

- Chuyển tài khoản, sản phẩm, đơn hàng và entitlement lên backend online.
- Thêm quản lý thiết bị.
- Backend cục bộ chỉ làm nhiệm vụ runtime.
- Bổ sung migration dữ liệu thử nghiệm.

### Giai đoạn C — Nội dung được bảo vệ

- Đóng gói và mã hóa effect.
- Admin upload lên R2.
- Cấp phiên sử dụng ngắn hạn.
- Cache mã hóa.
- Giải mã theo đoạn và phát qua localhost.

### Giai đoạn D — Cửa hàng động

- Đồng bộ danh mục từ cloud.
- Sản phẩm mới xuất hiện không cần update app.
- Đồng bộ trạng thái mua và gói.
- Hỗ trợ version và minimum app version.

### Giai đoạn E — Menu thương mại

- Nút `Đóng gói để bán`.
- Kiểm tra tài nguyên và tạo preview.
- Mã hóa, upload và publish.
- Tạo bản tùy chỉnh riêng cho từng user.

### Giai đoạn F — Auto-update

- Cấu hình electron-updater.
- Tạo metadata phát hành.
- UI cập nhật tiếng Việt.
- Update không làm gián đoạn livestream.
- Kiểm thử rollback và staged rollout.

### Giai đoạn G — Beta

- Thử nghiệm với 5–20 người dùng.
- Theo dõi lỗi, CPU, RAM, network và dung lượng cache.
- Kiểm tra nhiều máy cùng dùng một effect.
- Thu thập phản hồi người không chuyên.
- Chưa cam kết SLA hoặc quảng bá rộng.

### Giai đoạn H — Phát hành thương mại

- Backend luôn hoạt động.
- Backup tự động.
- Domain chính thức.
- Code-signing Windows.
- Điều khoản sử dụng và chính sách quyền riêng tư.
- Quy trình hỗ trợ khách hàng.
- Theo dõi chi phí, doanh thu và giới hạn dịch vụ.

## 17. Kiểm thử bắt buộc trước khi bán

- Cài mới trên máy Windows sạch.
- Đăng ký, đăng nhập và khôi phục phiên.
- Một tài khoản trên nhiều thiết bị.
- Giới hạn thiết bị và thu hồi thiết bị.
- Gói còn hạn, hết hạn và được gia hạn.
- Mua effect và menu.
- Admin đăng sản phẩm; khách thấy mà không update app.
- Nhiều máy cùng dùng một effect mà không xung đột.
- Mỗi khách sửa menu riêng mà không ghi đè mẫu gốc.
- Không tìm thấy file nguồn admin trong thư mục máy khách.
- Cache mã hóa không mở được như video thông thường.
- Effect cá nhân vẫn lưu và phát cục bộ.
- Mất mạng trước và trong livestream.
- TikTok/OBS mất kết nối rồi kết nối lại.
- Backup và restore database.
- Update app và rollback.
- Gỡ cài đặt không xóa nhầm dữ liệu cần giữ.

## 18. Thông tin chủ dự án cần chuẩn bị

- Tài khoản Cloudflare.
- Tài khoản MongoDB Atlas.
- Tài khoản Render hoặc nhà cung cấp backend được chọn sau này.
- Tài khoản GitHub.
- Email admin chính.
- Tên thương hiệu, icon và tài sản hình ảnh.
- Danh sách gói, giá và thời hạn.
- Quy định sản phẩm mua vĩnh viễn hay theo gói.
- Số thiết bị tối đa mỗi tài khoản.
- Quy trình hoàn tiền và thu hồi quyền.
- Danh sách effect/menu thử nghiệm.
- Thông tin nhận thanh toán.
- Sau giai đoạn beta: domain và chứng thư code-signing.

Secret không được ghi trực tiếp vào tài liệu hoặc commit vào repository.

## 19. Điều kiện bắt đầu triển khai tài liệu này

Chỉ bắt đầu khi các điều kiện sau được xác nhận:

- Bản desktop cục bộ đã ổn định.
- Các luồng TikTok, OBS, Gift Mapping và Gift Menu Designer đã smoke test.
- Phần tiếng Việt đã được kiểm tra trực quan.
- Hai luồng effect thương mại và effect cá nhân đã được thống nhất.
- Chủ dự án xác nhận mô hình gói, giá, thiết bị và quyền sở hữu.
- Có tài khoản hạ tầng development; chưa cần mua gói trả phí.
- Có ít nhất một effect và một menu dùng làm sản phẩm thử nghiệm.

## 20. Tiêu chí hoàn thành tổng thể

Giai đoạn thương mại hóa được xem là hoàn thành khi:

- Khách cài EffectStore bằng installer Windows.
- Admin đăng effect/menu mà không build lại app.
- Sản phẩm mới xuất hiện trên app khách.
- Khách mua hoặc được cấp gói và sử dụng được nội dung.
- Khách không nhận hoặc tìm thấy file nguồn admin theo cách sử dụng thông thường.
- Effect cá nhân chỉ lưu trên máy của khách.
- Nhiều user/máy dùng cùng sản phẩm không xung đột.
- Tính năng mới được phát hành qua auto-update.
- Quyền sử dụng, backup, rollback và vận hành admin đã được kiểm thử.

