# Web Melodyne - Pitch & Scale Studio (with Stem Splitter & Remixer)

Ứng dụng web chỉnh sửa cao độ âm thanh (Monophonic Vocal/Pitch Editor) trực tiếp trên trình duyệt, hỗ trợ nhận diện nốt dạng Melodyne, khóa cao độ theo Scale gốc của bài hát, cùng hệ thống tiền xử lý: Cắt đoạn (Trimmer), Tách Stem (Vocal & Beat) và Ghép Master Mix hoàn chỉnh.

## Tính năng nổi bật

1. **Bộ Tiền Xử Lý: Cắt Đoạn (Trimmer) & Tách Stem (Vocal & Beat):**
   - Hỗ trợ tải các bài hát dài 3 - 5+ phút.
   - Sóng âm tương tác cho phép kéo chọn đoạn cần chỉnh (ví dụ: đoạn Điệp khúc 30s) hoặc chọn toàn bài.
   - Thuật toán **Mid-Side Spectral & Formant Extraction** tách nhanh bài hát thành 2 Stem: **Vocal Stem** (Giọng hát solo) và **Instrumental Stem** (Beat nhạc nền).
   - Nghe thử Solo từng stem ngay trước khi đưa vào chỉnh sửa.
2. **Nhận diện Cao độ & Cắt nốt (YIN Pitch Tracking & Note Segmentation):**
   - Thuật toán YIN F0 phát hiện cao độ chuẩn xác tới từng cent (< 0.1 cents sai số).
   - Tự động gom cụm F0 contour và năng lượng RMS thành các giọt nốt nhạc (Blobs) trực quan.
3. **Khóa nốt theo Scale gốc (Scale Snapping Engine):**
   - Hỗ trợ đầy đủ các âm giai: Major, Natural Minor, Harmonic Minor, Melodic Minor, Pentatonic, Blues, Dorian, Mixolydian, Chromatic.
   - Khi kéo nốt lên/xuống, hệ thống tự động hút (snap) vào các bậc âm hợp lệ của Scale gốc, ngăn hoàn toàn tình trạng phô/lạc giọng.
   - Nút **"Khóa về Scale"**: Tự động lượng tử hóa (quantize) toàn bộ bài hát về đúng Scale chỉ với 1 click.
   - Thuật toán **Krumhansl-Schmuckler**: Tự động dò tìm giọng (Key & Scale) từ giai điệu bài hát.
4. **Interactive Piano Roll Canvas (60 FPS):**
   - Vẽ giao diện dạng Melodyne mượt mà trên Canvas 2D.
   - Hiển thị đường lượn sóng cao độ bên trong giọt nốt (Pitch contour / Vibrato).
   - Highlight trực quan các hàng phím thuộc Scale (sáng) và ngoài Scale (tối).
   - Cảnh báo màu đỏ nổi bật với các nốt phô ngoài Scale, đổi màu xanh khi đã tinh chỉnh.
5. **Thanh Multi-Track Stem Session & Ghép Master Mix:**
   - Điều chỉnh âm lượng độc lập cho Vocal và Beat.
   - **"Nghe Thử Ghép Cả Beat"**: Phát đồng bộ Vocal đã sửa nốt hòa cùng Beat gốc tại đúng vị trí ban đầu trong bài hát.
   - **"Xuất Stem Vocal"**: Xuất file WAV riêng biệt cho giọng hát đã sửa.
   - **"Ghép & Xuất Full Master Mix"**: Thay thế Vocal đã sửa vào bài gốc với bộ limiter mềm chống méo tiếng và xuất ra file WAV hoàn chỉnh.
6. **Môi trường Test Toàn diện (Test Harness & Live Benchmark):**
   - 29 unit test tự động qua Vitest kiểm tra độ chính xác toán học DSP.
   - Bảng điều khiển Testbed đo đạc độ trễ YIN (15.99 ms) và Pitch Shift (46.17 ms) trực tiếp trên trình duyệt.

## Cài đặt & Chạy ứng dụng

```bash
# Cài đặt thư viện
npm install

# Chạy test suite DSP
npm test

# Chạy môi trường dev
npm run dev

# Build production
npm run build
```
