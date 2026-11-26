# ADR 0023 — Hỏi cơ sở dữ liệu trong test (X-05)

Ngày: 2026-11-26 · Trạng thái: chấp nhận

## Bối cảnh
Sau khi lưu trên giao diện, tester muốn kiểm tra bản ghi thật trong CSDL (SQL Server, Postgres, MySQL). Engine phải độc lập với driver (nguyên tắc 2) và chạy được cả trong app lẫn CLI; mật khẩu CSDL là bí mật; Production không được bị ghi (W-10).

## Quyết định
1. **Kết nối thuộc môi trường** (`Env.dbConnections`: tên, loại, máy chủ, cổng, CSDL, tên đăng nhập, **tên bí mật** của mật khẩu, TLS) — lưu trong thư mục dự án như `httpAuth`; giá trị mật khẩu nằm trong bí mật của môi trường.
2. **Cổng `DbClient`** (`packages/engine/src/db/client.ts`): engine chỉ biết `query({connection, sql, args, readOnly, …}) → rows`. Host đưa vào `RunOptions.db`. Không có thì bước báo `DB_NOT_AVAILABLE`. Driver thật nằm ở `apps/desktop/src/main/db-query/` (M14-08b), dùng chung cho app (utility process) và CLI.
3. **Mặc định chỉ đọc, kiểm hai lớp**: (a) `checkSql` — bỏ chú thích và chuỗi, chỉ nhận một câu bắt đầu bằng SELECT/WITH/SHOW/EXPLAIN… và không chứa từ ghi (INSERT, UPDATE, DELETE, INTO, EXEC, SET…); nghi ngờ thì coi là ghi; (b) adapter yêu cầu CSDL tự từ chối ghi (giao dịch chỉ đọc) khi có thể.
4. **Ghi** cần `write: true` **và** `confirmWrite: true` trên chính bước đó; khai báo `writes()` nên W-10 chặn trước khi chạy trên môi trường được bảo vệ (và kiểm lại lúc chạy).
5. **Giá trị truyền bằng `?` + `args`** (adapter đổi sang `$1` / `@p1`), không nối chuỗi; kết quả là danh sách object lưu vào biến (`{{rows[0].status}}`), ngày → ISO, bigint/Buffer → chuỗi.
6. Lỗi driver có thể kèm mật khẩu → thay mọi giá trị bí mật bằng `•••` trước khi báo.

## Thư viện (M14-08b, sẽ thêm khi làm driver)
`pg` (Postgres), `mysql2` (MySQL), `tedious` (SQL Server), `better-sqlite3` (SQLite — có sẵn, dùng cho test và CSDL cục bộ). Chỉ nạp ở main/utility process, không vào renderer; nạp lười (dynamic import) để app mở nhanh.

## Hệ quả
- Chưa có kết nối qua SSH tunnel riêng cho CSDL; dùng VPN hoặc SSH của môi trường (G-07) nếu máy chủ nằm sau tunnel.
- Một câu một bước; thủ tục lưu sẵn (EXEC/CALL) bị coi là ghi.
