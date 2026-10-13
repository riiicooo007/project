# Web Audio Visualizer

Ứng dụng web trực quan hoá âm nhạc theo thời gian thực, chạy hoàn toàn trên trình duyệt bằng **Web Audio API** và **HTML5 Canvas**. Không cần cài đặt, không cần server, không phụ thuộc thư viện bên ngoài.

Giao diện gồm ảnh nền toàn màn hình phủ lớp tối mờ, visualizer ở giữa phản ứng theo bass và beat, cùng bảng điều khiển kính mờ (glassmorphism) nổi bên dưới.

## Cấu trúc

```
.
├── index.html       # Giao diện + CSS
├── visualizer.js    # Toàn bộ logic: âm thanh, vẽ canvas, danh sách phát, hiệu ứng
└── README.md
```

## Cách chạy

1. Đặt `index.html` và `visualizer.js` **cùng một thư mục**.
2. Mở `index.html` bằng trình duyệt hiện đại (Chrome, Edge, Firefox, Safari).
3. Kéo thả file nhạc vào màn hình, hoặc bấm **Thêm nhạc**.

Không cần chạy server, bấm đúp vào `index.html` là dùng được.

## Tính năng

### Visualizer
- Ba kiểu hiển thị, đổi trong phần **Tuỳ chỉnh**:
  - **Thanh đối xứng:** bass ở giữa, treble ra hai bên, mỗi thanh nảy lên xuống đối xứng qua đường trung tâm.
  - **Vòng tròn:** các thanh toả quanh một vòng sáng, bass ở đỉnh vòng.
  - **Sóng (oscilloscope):** hai đường sóng đối xứng nhau, tô mờ vùng giữa.
- Phản ứng theo bass và beat: thanh phình lên, glow sáng hơn, quầng sáng phía sau và ảnh nền nảy nhẹ.
- Khi chưa phát nhạc, visualizer vẫn gợn sóng nhẹ.

### Phát nhạc và danh sách phát
- Hỗ trợ `.mp3`, `.wav` (và các định dạng âm thanh khác mà trình duyệt đọc được như `.ogg`, `.m4a`, `.aac`, `.flac`).
- **Thêm nhiều bài cùng lúc** (chọn nhiều file hoặc kéo thả nhiều file). Các bài xếp vào hàng đợi và **tự chuyển bài** khi hết.
- Bấm vào một bài để phát bài đó, dấu **×** để xoá bài, **Xoá hết** để làm trống danh sách.
- Nút **Trước / Sau**, **Ngẫu nhiên** (mỗi bài chỉ phát một lần mỗi vòng), **Lặp lại** (tắt, cả danh sách, một bài).
- Thanh tiến trình tua được, thanh âm lượng.
- Bài lỗi sẽ tự được bỏ qua.

### Hiệu ứng
| Hiệu ứng | Mô tả |
|---|---|
| Nhấp nháy theo beat | Màn hình loé nhẹ bằng màu chủ đạo khi có nhịp bass mạnh |
| Rung màn hình | Nền và visualizer rung nhẹ theo beat |
| Hạt phát sáng | Hạt nổ ra từ giữa khi có beat, rải nhẹ theo bass |
| Màu theo ảnh nền | Tự lấy 3 màu nổi bật từ ảnh nền làm bảng màu |
| Tự ẩn bảng điều khiển | Khi đang phát và 4 giây không thao tác, bảng điều khiển và con trỏ ẩn đi |
| Toàn màn hình | Nút trên bảng điều khiển hoặc phím `F` |

Thanh trượt **Cường độ hiệu ứng** điều chỉnh chung độ mạnh của nhấp nháy, rung và hạt.

### Tuỳ chỉnh
| Tuỳ chọn | Phạm vi |
|---|---|
| Độ rộng thanh | 2 – 20 px |
| Khoảng cách giữa các thanh | 0 – 12 px |
| Độ phát sáng (glow) | 0 – 60 px |
| Độ nhạy | 0.4 – 2.5 |
| Độ mượt | 0 – 95% |
| Độ tối nền | 0 – 90% |
| Cường độ hiệu ứng | 0 – 2 |
| Bảng màu | Neon, Ocean, Candy, Sunset, Aurora, hoặc chọn tay 3 màu |

### Ảnh nền
Bấm **Ảnh nền** để chọn ảnh, hoặc thả file ảnh vào màn hình. Chưa chọn ảnh thì dùng nền gradient neon mặc định.

## Kéo và thả

Thả file vào bất kỳ đâu trên màn hình:
- File nhạc sẽ được thêm vào danh sách phát (nhiều file thì sắp xếp theo tên, nhận biết số thứ tự như `2` trước `10`).
- File ảnh sẽ trở thành ảnh nền.
- Thả cả hai loại cùng lúc đều được.

## Phím tắt

| Phím | Chức năng |
|---|---|
| `Space` | Phát / Tạm dừng |
| `N` | Bài kế tiếp |
| `P` | Bài trước (nghe quá 3 giây thì phát lại từ đầu bài) |
| `F` | Bật / tắt toàn màn hình |
| `H` | Ẩn / hiện bảng điều khiển |

Phím media trên bàn phím cũng chuyển bài được trên các trình duyệt hỗ trợ Media Session.

## Cách hoạt động

```
<audio> ─► MediaElementSource ─► AnalyserNode (FFT 2048) ─► loa
                                      │
                         dữ liệu tần số / sóng âm
                                      ▼
                           Canvas (requestAnimationFrame)
```

- Dữ liệu tần số được ánh xạ theo thang phi tuyến (luỹ thừa 2.2) từ vài chục Hz đến khoảng 14 kHz, nên vùng bass chiếm nhiều thanh hơn. Treble được nhân thêm hệ số bù vì thường yếu hơn.
- **Phát hiện beat:** so năng lượng bass (các bin thấp nhất) với giá trị trung bình trượt. Khi vượt ngưỡng sẽ phát xung `pulse` làm thanh phình, glow sáng, kích hoạt nhấp nháy, rung và hạt.
- Mức từng thanh được làm mượt (lên nhanh, xuống chậm) để chuyển động tự nhiên.
- Canvas tự co theo kích thước cửa sổ và độ phân giải màn hình (giới hạn DPR tối đa 2).
- Màu từ ảnh nền: thu nhỏ ảnh về 48×48, gom pixel vào 12 nhóm theo sắc độ, bỏ màu xám, quá tối hoặc quá sáng, rồi chọn tối đa 3 màu nổi bật cách nhau ít nhất 45° trên vòng màu.

## Lưu trữ

- **Cài đặt** (kiểu hiển thị, màu, thanh trượt, công tắc hiệu ứng, âm lượng, ngẫu nhiên, lặp lại) được lưu trong `localStorage` với khoá `audio-visualizer-settings-v1`.
- **Danh sách phát không được lưu**: trình duyệt không giữ được file bạn đã chọn sau khi tải lại trang.
- File nhạc và ảnh chỉ được đọc cục bộ trên máy bạn, không có gì được tải lên.

## Tuỳ biến mã nguồn

Trong `visualizer.js`:
- `PALETTES`: thêm hoặc sửa bảng màu có sẵn (mỗi bảng 3 màu: trung tâm, giữa, rìa).
- `DEFAULTS`: đổi giá trị mặc định của mọi tuỳ chỉnh và hiệu ứng.
- Trong `frame()`: ngưỡng beat (`bassAvg * 1.2 + 0.06`), thời gian chờ tối thiểu giữa hai beat (170 ms) và thời gian tự ẩn bảng điều khiển (4000 ms).
- `drawRadial()`, `drawWave()`: logic vẽ từng kiểu hiển thị, có thể thêm kiểu mới và đăng ký trong `frame()` cùng thẻ `<select id="mode">`.

## Lưu ý và xử lý sự cố

- **Không nghe thấy tiếng hoặc visualizer đứng yên:** trình duyệt chỉ cho phát âm thanh sau khi người dùng tương tác với trang. Bấm vào trang hoặc nút Play một lần.
- **Không đọc được file:** định dạng phụ thuộc vào trình duyệt. Thử chuyển sang `.mp3` hoặc `.wav`.
- **Nền hơi nặng hoặc giật trên máy yếu:** giảm độ phát sáng (glow), tắt Hạt phát sáng và Rung màn hình, hoặc giảm độ rộng thanh để vẽ ít thanh hơn.
- **Toàn màn hình không hoạt động trên iPhone:** Safari trên iPhone không hỗ trợ Fullscreen API cho trang web thông thường.
- **"Màu theo ảnh nền" báo không có màu nổi bật:** ảnh quá xám hoặc quá tối. Chọn ảnh có màu sắc rõ hơn.
