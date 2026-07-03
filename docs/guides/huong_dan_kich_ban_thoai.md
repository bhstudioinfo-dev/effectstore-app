# Hướng Dẫn Sử Dụng: Tính Năng Kịch Bản Thoại (Quà Tặng & Chào Mừng Follow)

Chào mừng bạn đến với tính năng **Kịch bản thoại** của BH Studio. Tính năng này giúp phòng livestream của bạn trở nên sống động và tương tác chuyên nghiệp hơn bằng cách tự động phát giọng nói cảm ơn mỗi khi có người xem tặng quà hoặc follow kênh.

Dưới đây là hướng dẫn từng bước vô cùng đơn giản giúp bạn làm chủ tính năng này, ngay cả khi bạn không phải là người rành công nghệ.

---

## 1. Khái niệm cơ bản
*   **Kịch bản thoại** là câu nói mà MC ảo (hoặc giọng nói Google chị) sẽ phát ra qua loa máy tính của bạn khi có sự kiện (ví dụ: người xem tặng quà hoặc bấm Follow).
*   Thay vì đọc một câu giống nhau nhàm chán, bạn có thể thiết lập câu thoại tự động thay đổi tên người tặng/người follow, tên quà, số lượng cụ thể bằng cách sử dụng các **Biến động**.

---

## 2. Ý nghĩa của các thiết lập

### 🎤 Kịch bản thoại quà:
*   **Bật giọng đọc**: Tích chọn để kích hoạt giọng đọc cảm ơn khi có quà tặng.
*   **Ngưỡng đọc**: Chỉ đọc cảm ơn đối với những món quà có giá trị từ số xu này trở lên (ví dụ: nhập `10` để tránh ồn ào khi người xem liên tục spam quà 1 xu).
*   **Tốc độ đọc**: Điều chỉnh giọng nói đọc nhanh hơn hoặc chậm đi (Chậm, Bình thường, Nhanh, Rất nhanh).
*   **Mẫu thoại**: Nhập nội dung câu nói bạn muốn phát ra. Bạn có thể tự soạn theo ý mình.

### 👤 Chào mừng Follow:
*   **Bật giọng đọc**: Tích chọn để kích hoạt câu chào mừng khi có người xem bấm Follow kênh.
*   **Mẫu thoại**: Nhập nội dung câu chào mừng bạn muốn phát ra. Bạn có thể tự soạn theo ý mình.

---

## 3. Hướng dẫn chèn biến tự động (👤 🎁 🔢 💰)

Khi viết câu thoại, bạn không thể biết trước ai sẽ tặng quà/follow và tặng món quà gì. Vì vậy, BH Studio cung cấp các **Biến động** nằm trong ngoặc nhọn `{ }`. Khi có người tương tác thật, phần mềm sẽ tự thay thế các ký tự này bằng thông tin thực tế.

### Các biến được hỗ trợ đối với Quà tặng:
*   `{username}`: Tên của người tặng quà.
*   `{giftName}`: Tên của món quà (ví dụ: Hoa Hồng, Corgi, Kính Râm...).
*   `{quantity}`: Số lượng quà họ tặng (ví dụ: 1, 10, 99...).
*   `{coin}`: Tổng số xu tương ứng của món quà.

### Các biến được hỗ trợ đối với Chào mừng Follow:
*   `{username}`: Tên của người vừa bấm Follow.

### Cách chèn biến vô cùng đơn giản:
1.  Click chuột vào vị trí bạn muốn chèn biến trong ô **Mẫu thoại**.
2.  Bấm vào nút **➕ Chèn biến**.
3.  Chọn thông tin bạn muốn hiển thị (ví dụ: chọn *Tên người tặng* hoặc *Tên người follow*). Từ khóa `{username}` sẽ tự động xuất hiện trong ô nhập liệu.

*Ví dụ kịch bản Quà tặng:*
> "Cảm ơn `{username}` đã tặng `{quantity}` `{giftName}` yêu thương!"
>
> Khi livestream, nếu bạn **Nguyễn Văn A** tặng **10 Hoa Hồng**, máy tính sẽ tự đọc:
> *"Cảm ơn Nguyễn Văn A đã tặng 10 Hoa Hồng yêu thương!"*

*Ví dụ kịch bản Follow:*
> "Cảm ơn `{username}` đã follow kênh mình nhé!"
>
> Khi có bạn **Trần Thị B** bấm Follow, máy tính sẽ tự đọc:
> *"Cảm ơn Trần Thị B đã follow kênh mình nhé!"*

---

## 4. Sử dụng các Mẫu kịch bản có sẵn (📋)

Nếu bạn chưa biết nên viết câu thoại thế nào cho hay, hãy bấm vào nút **📋 Mẫu thoại** bên dưới ô kịch bản tương ứng để chọn nhanh các phong cách đã được chuẩn bị sẵn:

### Đối với Quà tặng:
1.  **Cảm ơn cơ bản**: `Cảm ơn {username} đã tặng {giftName} ❤️`
2.  **Nhiệt tình**: `Wow, cảm ơn {username} đã tặng {quantity} {giftName}, tuyệt vời quá!`
3.  **Bán hàng**: `Cảm ơn {username} nha, chúc bạn một ngày thật nhiều niềm vui.`
4.  **Idol**: `Yêu quá, cảm ơn {username} đã tặng quà cho mình nha.`

### Đối với Follow:
1.  **Cảm ơn cơ bản**: `Cảm ơn {username} đã follow kênh nhé! ❤️`
2.  **Thân thiện**: `Chào mừng {username} đã ghé thăm phòng live của mình!`
3.  **Chào mừng**: `Welcome {username}! Chúc bạn xem live vui vẻ nhé!`

*Bạn chỉ cần click chuột vào mẫu bạn thích, kịch bản sẽ tự động được áp dụng và lưu lại.*

---

## 5. Hướng dẫn nghe thử giọng đọc (🔊)

Để kiểm tra xem giọng đọc nghe có vừa tai không, tốc độ đọc đã phù hợp chưa:

1.  Thiết lập kịch bản thoại theo ý muốn của bạn.
2.  Bấm vào nút **🔊 Nghe thử** ở góc phải dưới của khung kịch bản tương ứng.
3.  Hệ thống sẽ tự động ghép tên giả định (`Nguyễn Văn A`) và phát trực tiếp qua loa máy tính của bạn để bạn duyệt trước câu thoại.

> 💡 **Mẹo nhỏ cực kỳ tiện lợi**:
> Bạn không cần kết nối vào TikTok Live, cũng không cần mở phần mềm OBS vẫn có thể bấm nút **Nghe thử** này để kiểm tra giọng nói mọi lúc, mọi nơi!
