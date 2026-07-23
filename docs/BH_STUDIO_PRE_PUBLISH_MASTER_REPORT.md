# Báo cáo tổng trước khi phát hành BH Studio / EffectStore

Ngày kiểm tra: 23/07/2026  
Kết luận ngắn: **CHƯA SẴN SÀNG PHÁT HÀNH CHO KHÁCH HÀNG**

## Cách đọc báo cáo này

Một số từ được dùng trong báo cáo:

- **Ứng dụng:** chương trình EffectStore chạy trên máy tính.
- **Máy chủ (backend):** phần xử lý dữ liệu ở phía sau ứng dụng.
- **Cơ sở dữ liệu MongoDB:** nơi lưu tài khoản, sản phẩm, đơn hàng và thiết kế.
- **API:** đường giao tiếp giữa giao diện và phần xử lý phía sau.
- **OBS:** phần mềm dùng để livestream.
- **Lỗi P0:** lỗi nghiêm trọng nhất, bắt buộc sửa trước khi cho bất kỳ khách hàng nào cài.
- **Lỗi P1:** bắt buộc sửa trước khi bắt đầu bán sản phẩm.

Bạn không cần biết code để đọc báo cáo này. Tên file và tên hàm chỉ được ghi lại để người sửa code biết chính xác phải kiểm tra ở đâu.

## 1. Tóm tắt dễ hiểu

EffectStore đã có rất nhiều phần quan trọng:

- Đăng ký và đăng nhập.
- Cửa hàng hiệu ứng.
- Thanh toán bằng mã QR và gửi ảnh chuyển khoản.
- Trang quản lý dành cho admin.
- Kết nối TikTok Live.
- Kết nối OBS.
- Gán quà TikTok với hiệu ứng.
- Tải hiệu ứng cá nhân từ máy tính.
- Thiết kế bảng quà và bảng mục tiêu.
- Hàng chờ giúp các hiệu ứng chạy lần lượt.
- Công cụ sao lưu và xuất file chẩn đoán lỗi.

Tuy nhiên, ứng dụng hiện vẫn giống một bản đang phát triển trên máy của chủ dự án. Nó chưa có hệ thống máy chủ online hoàn chỉnh để nhiều khách hàng ở nhiều máy khác nhau cùng sử dụng.

Kết quả kiểm tra:

- Có **5 lỗi P0** rất nghiêm trọng.
- Có **12 lỗi P1** cần sửa trước khi bán.
- Bộ kiểm tra tự động hiện tại chạy thành công.
- Nhưng chưa kiểm tra thật trên TikTok Live, OBS và bộ cài Windows của khách hàng.

## 2. Tình trạng hiện tại

Ứng dụng có thể tiếp tục dùng để phát triển và kiểm tra nội bộ.

Ứng dụng chưa phù hợp để:

- Gửi bộ cài cho khách hàng.
- Mở thử nghiệm cho người ngoài.
- Thu tiền thuê bao.
- Bán hiệu ứng.
- Quảng cáo là sản phẩm hoàn chỉnh.

## 3. Ứng dụng hiện hoạt động như thế nào?

Khi mở EffectStore:

1. Electron mở cửa sổ ứng dụng Windows.
2. Ứng dụng tự mở phần máy chủ nội bộ trên chính máy đó.
3. Máy chủ kết nối MongoDB.
4. Máy chủ thử kết nối OBS.
5. Người dùng đăng nhập.
6. Người dùng tự kết nối TikTok Live.
7. Khi nhận quà, hệ thống tìm hiệu ứng đã gán.
8. Hiệu ứng được đưa vào hàng chờ.
9. OBS phát hiệu ứng bằng nguồn chung tên `effect_player`.

Vấn đề lớn là tài khoản, cửa hàng, thanh toán và quyền sở hữu sản phẩm hiện vẫn do phần máy chủ chạy trên máy khách xử lý. Khách hàng có thể kiểm soát máy của họ, vì vậy cách này chưa đủ an toàn để bán sản phẩm thật.

## 4. Những phần đang làm tốt

Các phần dưới đây đã có nền tảng tốt:

- Mật khẩu được mã hóa trước khi lưu.
- Quyền admin được kiểm tra lại ở máy chủ.
- Ứng dụng chỉ cho mở một cửa sổ chính.
- Phần máy chủ được đóng gói cùng ứng dụng.
- OBS có tự thử kết nối lại.
- Có nút sửa lại nguồn OBS bị thiếu.
- Hiệu ứng được xếp hàng để hạn chế chạy chồng lên nhau.
- Có kiểm tra quyền sở hữu trước khi phát nhiều loại hiệu ứng.
- Có giới hạn cơ bản theo từng gói.
- Có sao lưu dữ liệu.
- Có xuất file chẩn đoán và che một số thông tin bí mật.
- Menu Designer đã có nhiều công cụ mạnh.

Các điểm tốt này chưa có nghĩa là ứng dụng đã sẵn sàng bán. Chúng mới là nền móng.

## 5. Cửa hàng và đồng bộ sản phẩm

Hiện tại, khi admin đăng một hiệu ứng:

1. Thông tin sản phẩm được lưu vào MongoDB.
2. File hiệu ứng được lưu trên chính máy đang chạy máy chủ.
3. Ứng dụng khách chỉ thấy sản phẩm nếu kết nối đúng vào cùng máy chủ và cùng nơi lưu file.

Điều này có nghĩa:

- Khách hàng ở máy khác chưa thể nhận sản phẩm mới một cách đúng chuẩn.
- Chỉ đưa MongoDB lên mạng là chưa đủ, vì file video vẫn nằm ở máy admin.
- Chưa có kho file online riêng.
- Chưa có phiên bản sản phẩm.
- Chưa có kiểm tra file bị lỗi hoặc bị thay đổi.
- Chưa có tải lại khi mạng bị gián đoạn.

Trước khi bán, cần có:

- Một máy chủ online trung tâm.
- Một MongoDB dùng cho môi trường thật.
- Một kho file riêng tư trên mạng.
- Quyền sử dụng gắn với tài khoản và thiết bị.
- Đường dẫn tải có thời hạn ngắn.
- Kiểm tra phiên bản và tính toàn vẹn của file.

## 6. Lỗi Gift Mapping quan trọng

Luồng mới dùng một nguồn OBS chung tên `effect_player`.

Các đường phát thử và kiểm tra đã được chuyển sang nguồn này. Lỗi luồng quà TikTok thật thiếu địa chỉ file video đã được sửa trong code Giai đoạn A:

- Hàng chờ hiện chấp nhận hiệu ứng có thể được máy chủ tự tìm lại an toàn.
- Ngay trước khi phát, hệ thống kiểm tra lại quyền sở hữu, thời lượng và tạo địa chỉ video.
- Hiệu ứng cá nhân được kiểm tra xem file trên máy còn truy cập được hay không.
- Bài kiểm tra tự động mô phỏng đúng lỗi cũ hiện đã chạy thành công.
- Trạng thái vẫn là **CHỜ KIỂM TRA THẬT** trên TikTok Live và OBS.

Các file liên quan:

- `backend/services/tiktokService.js`
- `backend/services/effectQueue.js`
- `backend/services/playbackManager.js`

Quà dạng combo/lặp hiện đã được sửa để bỏ qua thông báo trung gian và chỉ phát video khi TikTok báo combo đã kết thúc. Phần này đã có kiểm tra tự động nhưng vẫn cần kiểm tra bằng quà thật.

## 7. Hiệu ứng cá nhân

Điểm đúng với yêu cầu sản phẩm:

- File cá nhân nằm trên máy của khách.
- Không tự tải lên máy chủ.
- Được chuyển sang WebM để OBS dễ phát.
- Có giới hạn 500 MB cho file đầu vào.
- Video được cắt tối đa 15 giây.
- Có tạo ảnh đại diện.

Rủi ro:

- Đổi máy thì file không đi theo.
- Dữ liệu tài khoản có thể nói rằng hiệu ứng tồn tại nhưng file thật đã mất.
- Nếu cổng nội bộ 8080 bị ứng dụng khác chiếm, hiệu ứng cá nhân không phát được.
- Xóa file và xóa dữ liệu máy chủ là hai bước riêng, có thể bị lệch nếu một bước lỗi.

## 8. Menu Designer

Menu Designer là một trong những phần mạnh nhất của dự án. Hiện đã có:

- Kéo, thả, phóng to và thu nhỏ.
- Xoay vật thể.
- Chọn nhiều vật thể.
- Hoàn tác và làm lại.
- Quản lý lớp.
- Khóa và ẩn lớp.
- Lưu nhiều thiết kế.
- Xuất sang OBS.
- Quà tặng, chữ, ảnh và video.
- Bảng mục tiêu.
- Bảng xếp hạng.
- Combo.
- Hộp quà bí ẩn.
- Danh sách mục tiêu.
- Nhóm nhiều quà thành một khối.

Rủi ro:

- File xử lý chính rất lớn và khó sửa an toàn.
- Bản xem trước trong ứng dụng và hình trên OBS vẫn cần kiểm tra bằng mắt.
- Có hai bản của bộ máy vẽ dùng chung, một cho ứng dụng và một cho OBS. Hai bản này có thể lệch nhau.
- Chưa kiểm tra chạy liên tục nhiều giờ.

## 9. OBS

Đã có:

- Kết nối OBS WebSocket.
- Tự thử kết nối lại sau khi mất kết nối.
- Tự tạo cảnh `EffectStore`.
- Tự tạo nguồn `effect_player`.
- Tự tạo nguồn bảng quà.
- Nút sửa lại nguồn bị thiếu.

Chưa hoàn chỉnh:

- Mật khẩu OBS được lưu dạng chữ thường trong cơ sở dữ liệu.
- Cài đặt OBS đang dùng chung, chưa tách theo từng người dùng.
- Khi khởi động, máy chủ chưa chắc đã dùng cài đặt OBS đã lưu.
- Nếu người dùng đổi tên nguồn, hệ thống có thể tạo thêm một nguồn mới.
- Chưa hỗ trợ tốt nhiều cảnh, nhiều hồ sơ OBS hoặc nhiều bản OBS.

## 10. Các gói thuê bao

Giao diện đang hiển thị đúng:

- Free.
- Basic: 199.000đ/tháng.
- Pro: 399.000đ/tháng.
- Studio: liên hệ.

Trong code, tên cũ vẫn được dùng:

- `pro` trong code có nghĩa là gói Basic.
- `business` trong code có nghĩa là gói Pro.

Điều này không nhất thiết hiện sai với khách, nhưng rất dễ làm người sửa code nhầm.

Đã có kiểm tra nhiều giới hạn ở máy chủ, nhưng còn lỗi:

- Free vẫn có thể tải thử 5 tài nguyên menu, trái với quy tắc cuối cùng.
- Một số chỗ chỉ kiểm tra đúng chữ `business`, làm gói Studio có thể bị chặn nhầm.
- Nhiều yêu cầu gửi cùng lúc có thể vượt giới hạn.
- Admin có thể nhập một tên gói bất kỳ.
- Chưa có quy tắc rõ ràng khi khách hạ gói nhưng đang có dữ liệu vượt giới hạn.

## 11. Bảo mật hiệu ứng mua

Một số biện pháp bảo vệ đã có:

- File chính được mã hóa.
- Đường xem hiệu ứng có mã truy cập hết hạn.
- Máy chủ kiểm tra quyền sở hữu.
- Không trả đường dẫn thật của file cho danh sách cửa hàng.

Nhưng có một lỗi rất nghiêm trọng:

1. Khi admin tải file lên, hệ thống tạo một bản xem trước không mã hóa.
2. Bản xem trước thực tế là bản sao đầy đủ của file admin tải lên.
3. Mọi tài khoản đã đăng nhập có thể nhận đường xem bản này.
4. Nếu đây chính là file bán, người dùng có thể lấy toàn bộ video mà chưa mua.

File liên quan: `backend/routes/effects.js`.

Không nên quảng cáo rằng hệ thống chống sao chép tuyệt đối. Mục tiêu thực tế nên là làm cho người dùng bình thường không thể mở thư mục và lấy file gốc một cách dễ dàng.

## 12. Bộ cài Windows

Đã có cấu hình tạo bộ cài NSIS, nhưng:

- Chưa tạo và kiểm tra bộ cài trong lần đánh giá này.
- Thiếu file biểu tượng `desktop/assets/icon.ico`.
- Chưa ký số ứng dụng.
- Chưa có tự cập nhật.
- Chưa có quay lại bản cũ khi bản mới lỗi.
- Chưa kiểm tra trên máy Windows sạch.
- Chưa xác định rõ phiên bản Windows tối thiểu.
- Chưa kiểm tra cảnh báo virus giả.
- Máy khách vẫn cần MongoDB bên ngoài.

Vì vậy chưa nên tạo bộ cài để gửi khách.

## 13. Trải nghiệm khách hàng

Người mới có thể gặp khó khăn vì:

- Phải nhập địa chỉ MongoDB.
- Phải hiểu cổng, nguồn OBS và cảnh OBS.
- Lỗi đôi lúc hiển thị bằng tiếng Anh.
- Có thể thấy mã kỹ thuật như `PLAN_LIMIT` hoặc `EFFECT_QUEUE_BUSY`.
- Chưa có một nút duy nhất để kiểm tra “mọi thứ đã sẵn sàng”.
- Chưa có hướng dẫn phục hồi đầy đủ khi TikTok, OBS hoặc file hiệu ứng bị lỗi.

Bộ kiểm tra tiếng Việt hiện tại chạy thành công trên 11 file giao diện đã chọn. Tuy nhiên, vẫn cần một người kiểm tra trực tiếp từng màn hình vì kiểm tra tự động không nhìn được giao diện giống con người.

## 14. Những việc pháp lý và kinh doanh còn thiếu

Trước khi nhận tiền của khách cần chuẩn bị:

- Điều khoản sử dụng.
- Chính sách quyền riêng tư.
- Chính sách hoàn tiền.
- Cách hủy thuê bao.
- Giấy phép sử dụng hiệu ứng.
- Quy định về nội dung khách tự tải lên.
- Cách xử lý khiếu nại bản quyền.
- Thời gian lưu dữ liệu.
- Thông tin doanh nghiệp.
- Kênh hỗ trợ khách hàng.

Các nội dung này cần người có chuyên môn pháp lý kiểm tra. Không nên sao chép mẫu trên mạng rồi dùng ngay.

## 15. Các lỗi nghiêm trọng nhất

Có 5 lỗi P0:

1. Chưa có hệ thống online trung tâm để nhiều khách cùng dùng cửa hàng.
2. Bộ cài vẫn phụ thuộc MongoDB bên ngoài.
3. Lỗi quà TikTok thật đã được sửa trong code nhưng chưa được xác nhận trên TikTok Live và OBS thật.
4. Bản xem trước có thể làm lộ toàn bộ file hiệu ứng đang bán.
5. Chưa có bộ cài được ký số, kiểm tra và có cơ chế cập nhật/quay lại.

Chi tiết nằm trong `PUBLISH_19_RELEASE_BLOCKERS.md`.

## 16. Kết luận phát hành

**KHÔNG NÊN PHÁT HÀNH CHO KHÁCH HÀNG.**

Hiện tại chỉ nên:

- Tiếp tục phát triển nội bộ.
- Sửa lỗi hiện tại.
- Viết thêm kiểm tra tự động.
- Kiểm tra thật với TikTok Live và OBS.

Chưa nên:

- Mở bán.
- Gửi bộ cài cho khách.
- Thêm nhiều tính năng mới.
- Xóa hệ thống OBS cũ.
- Bắt đầu quảng cáo sản phẩm hoàn chỉnh.

## 17. Việc tiếp theo duy nhất

**Thực hiện Giai đoạn A — sửa lỗi hiện tại: sửa quà TikTok thật không phát hiệu ứng đơn, xử lý đúng quà combo/lặp, kiểm tra file hiệu ứng cá nhân còn tồn tại, sau đó chạy kiểm tra tự động và kiểm tra thật trên OBS/TikTok trước khi làm bất kỳ giai đoạn nào khác.**
