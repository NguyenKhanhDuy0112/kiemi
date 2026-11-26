# ADR 0020 — Đọc file tải về trong engine (Q-04)

Ngày: 2026-11-26 · Trạng thái: chấp nhận

## Bối cảnh
Tester cần kiểm tra file hệ thống xuất ra (bảng lương Excel, CSV, hóa đơn PDF): tên, loại, dung lượng, nội dung → biến để so với giá trị trên giao diện. Engine phải độc lập với `packages/db` (nguyên tắc 2), nên không dùng được bộ đọc Excel/CSV của db.

## Quyết định
1. Action `download` (`actions/download.ts`): bấm phần tử, chờ sự kiện `download` của Playwright, lưu vào thư mục tạm, kiểm tra `expectName/expectType/minBytes/maxBytes`, đọc nội dung vào biến `{ name, ext, size, path, rows | text, sheets, sheet, cell }`.
2. Bộ đọc nằm ở `packages/engine/src/files/read.ts`: Excel bằng **exceljs 4.4.0** (đã dùng ở `packages/db`, cùng phiên bản), CSV tự viết (RFC 4180, tự nhận `, ; tab`), PDF bằng **unpdf** (~3,5 MB, gói pdf.js không cần canvas/native, chạy trong utility process).
3. Bảng đọc ra là **danh sách object theo tiêu đề** (giống `extractTable`) → dùng thẳng với `SUM(f.rows, 'Lương')`.

## Hệ quả
- Trùng lặp nhỏ (~60 dòng) giữa đọc Excel của db và của engine; chấp nhận để giữ ranh giới. Có thể gộp vào gói `files` riêng nếu thêm định dạng.
- PDF chỉ lấy chữ (không OCR, không bảng). PDF dạng ảnh scan không đọc được.
- Tệp tạm nằm trong thư mục tạm của hệ điều hành, không dọn tự động trong run.
