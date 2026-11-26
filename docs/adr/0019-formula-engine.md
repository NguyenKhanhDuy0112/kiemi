# ADR 0019 — Engine công thức (P-03)

Ngày: 2026-11-26 · Trạng thái: chấp nhận

## Bối cảnh
Tester cần tính kỳ vọng (tổng đơn, VAT, ship, lương) ngay trong test mà không viết code. Ngôn ngữ biểu thức `{{ … }}` của engine (`packages/engine/src/vars/expression.ts`) đã có số, chuỗi, đường dẫn biến, hàm và `+ - * / % &`.

## Quyết định
1. **Mở rộng ngôn ngữ biểu thức hiện có**, không thêm thư viện và không dùng `eval`/`Function`. Parser tự viết, chỉ có: số, chuỗi, đường dẫn (`a.b[0]`), gọi hàm, toán tử, so sánh `= <> < <= > >=` (`==`, `!=` được chấp nhận), truy cập `.x`/`[i]` sau lời gọi hàm. Không có vòng lặp, gán, hay gọi hàm tùy ý của JS ⇒ an toàn với dữ liệu lạ.
2. **Thư viện hàm kiểu bảng tính** (`vars/sheet.ts`, tên không phân biệt hoa/thường): `SUM AVG COUNT MIN MAX`, `SUMIF COUNTIF FILTER` (tham số `(danh sách, cột, tiêu chí[, cột cộng])`, tiêu chí `">100"`, `"<>Hủy"` hoặc giá trị), `IF` (lười: chỉ nhánh được chọn chạy) `AND OR NOT`, `ROUND ROUNDUP ROUNDDOWN` (số chữ số âm = làm tròn chục/trăm; dịch thập phân bằng chuỗi `e` để tránh sai số nhị phân). Số đọc theo `toNumber` (`1.250.000 ₫` = `1250000`). Ô trống bị bỏ qua; ô chữ làm lỗi có tên giá trị.
3. **Công thức có tên** = `{ params: string[], expression }`, truyền vào `VariableScopes.formulas`; gọi như hàm `{{TongDon(gioHang, 90000)}}`; công thức gọi được công thức khác (sâu tối đa 8, chống đệ quy vô hạn); kiểm tra đủ số tham số. Lưu theo **dự án** (M12-03b).
4. **Debug từng bước**: `EvalEnv.trace` nhận mọi phép tính (`text`, `value`, `depth`) từ trong ra ngoài; `VariableStore.explain(expr)` trả `{ value, steps }`.

## Hệ quả
- Không đổi DSL của test (công thức nằm trong chuỗi `{{ }}` sẵn có) ⇒ không cần migration test.
- `min`/`max` cũ nhận thêm danh sách/cột; `round` cũ giữ hành vi (làm tròn nửa lên), thêm chữ số âm.
- Định dạng/sai số/locale: M12-04.
