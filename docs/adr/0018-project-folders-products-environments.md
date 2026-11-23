# ADR 0018 — Dự án dạng thư mục file, mô hình Sản phẩm × Môi trường, DSL v2

**Trạng thái:** Đã chốt · **Ngày:** 2026-11-23 · **Task:** M9-01 (áp dụng ở M9-02 → M9-11) · **SPEC:** T-01, O-01, O-02, O-11

## Bối cảnh
v1.0 lưu mọi thứ trong một file SQLite (`userData/kiemi.db`). Team QC thật cần: dùng chung test qua Git hoặc thư mục mạng, xem khác biệt (diff) từng test, mỗi dự án là một repo riêng. Đồng thời một dự án thật có nhiều **sản phẩm** (web khách, trang quản trị, API…) chạy trên nhiều **môi trường** (DEV, UAT, Production…) với URL/tài khoản/đường hầm khác nhau — mô hình "1 môi trường = 1 baseUrl" của v1 không đủ.

## Quyết định

### 1. Thư mục dự án là nguồn chính, SQLite là index/cache
- Mỗi dự án gắn với **1 thư mục** (`projects.folder_path`). Thư mục chứa toàn bộ những gì team dùng chung; SQLite giữ bản sao để truy vấn nhanh (danh sách, tìm kiếm, chạy) + những thứ **chỉ thuộc máy này**: lịch sử chạy, ảnh/video, đăng nhập đã lưu, cài đặt, **giá trị secret**.
- Service/tRPC/UI hiện có **không đổi**: vẫn đọc/ghi SQLite. Một lớp đồng bộ (`packages/db/src/folder/`) chuyển qua lại DB ↔ file. Lý do: giữ nguyên ~200 chỗ dùng service, giao dịch SQLite vẫn nguyên tử, tìm kiếm/lọc vẫn nhanh; file chỉ là "định dạng lưu" ổn định.
- **ID giữ nguyên** giữa DB và file (UUIDv7 trong file) → lịch sử chạy, secret, suite vẫn trỏ đúng sau khi mở lại, đổi tên, kéo Git.

### 2. Bố cục thư mục (định dạng `kiemi-project` v1)
```
<dự án>/
  .kiemi/project.json        định danh: format, formatVersion, id, name, description
  .kiemi/products.json       sản phẩm (M9-04)
  .kiemi/folders.json        id + đường dẫn + thứ tự của thư mục test (giữ được thư mục rỗng, Git không lưu)
  .kiemi/environments.json   môi trường (biến, proxy, SSH, TÊN secret — không có giá trị)
  .kiemi/elements.json       kho phần tử
  .kiemi/shared-steps/<tên>.json
  .kiemi/datasets/<tên>.json
  .kiemi/suites/<tên>.json
  .kiemi/.gitignore          bỏ qua `local/`
  .kiemi/local/              chỉ máy này: khóa mềm (M9-03) — không đồng bộ
  tests/<key sản phẩm>/<thư mục>/<con>/<tên test>.kiemi.json
```
- **Dễ diff**: JSON thụt 2 dấu cách, xuống dòng `\n`, cuối file có dòng trống, không ghi `createdAt/updatedAt/version` (tránh nhiễu), mảng sắp theo thứ tự cố định (môi trường theo `sortOrder`, phần tử theo tên rồi id). Đọc thì bỏ qua `\r\n` (Git trên Windows).
- Tên file = `safeFileName(tên)` (giữ dấu tiếng Việt, bỏ ký tự cấm Windows/macOS); trùng thì thêm ` (2)`. **Danh tính = `id` trong file**, không phải tên file → đổi tên/di chuyển file ngoài app vẫn là cùng test.
- Thư mục test = thư mục thật dưới `tests/`. Thư mục xuất hiện ngoài app (người khác tạo) được nhận và cấp id mới.
- Hai file cùng `id` (người dùng chép file) → file sau (theo thứ tự đường dẫn) nhận id mới, thành bản sao.
- Ghi file **nguyên tử** (ghi `.tmp` rồi đổi tên) và **chỉ ghi file có nội dung đổi**.

### 3. Đồng bộ ba chiều theo từng file
DB lưu `projects.folder_state` = bản đồ `đường dẫn → hash` của lần đồng bộ cuối (**base**). Mỗi lần đồng bộ so 3 bản cho từng file: **local** (sinh từ DB), **remote** (đọc đĩa), **base**:

| local vs base | remote vs base | Làm gì |
|---|---|---|
| giống | giống | không làm gì |
| khác | giống | ghi local ra đĩa (hoặc xóa file) |
| giống | khác | nạp remote vào DB |
| khác | khác, local ≠ remote | **xung đột** → người dùng chọn bản (M9-03); trước khi chọn, file giữ nguyên |

- Sau khi gộp, toàn bộ bản đồ file được dựng lại thành "ảnh chụp dự án" và DB được **đối chiếu** theo id: thêm mới, cập nhật nếu khác, xóa mềm cái không còn, khôi phục cái xóa mềm nếu file quay lại.
- Thời điểm đồng bộ: sau mỗi mutation tRPC (gom 300 ms), lúc mở app, lúc đóng app, khi có file đổi trên đĩa (watcher, M9-03, ≤ 5 s). App tắt đột ngột trước khi ghi → lần mở sau thấy local ≠ base, remote = base → tự ghi bù, không mất dữ liệu.
- Dự án cũ (chỉ có trong DB) được chuyển sang thư mục ở lần mở đầu tiên: `<Tài liệu>/Kiemi/<tên dự án>` (đổi được bằng biến `KIEMI_PROJECTS_DIR` — dùng cho test). Dự án mới cũng tạo thư mục ở đó. Mở thêm thư mục có sẵn (bản clone Git, thư mục mạng) bằng "Mở thư mục dự án".
- Một id dự án chỉ gắn **một** thư mục: mở bản sao của thư mục đang mở → báo lỗi `PROJECT_ALREADY_OPEN` thay vì trộn hai bản.

### 4. Secret không bao giờ nằm trong thư mục [O-11]
File chỉ có **tên** secret (`secretNames`). Giá trị mã hóa bằng keychain máy, ở SQLite theo `environmentId` (id giữ nguyên nên mở lại vẫn khớp). Mở dự án trên máy khác → báo danh sách secret còn thiếu theo môi trường (M9-03). Đăng nhập đã lưu (cookie) cũng chỉ ở máy này.

### 5. Mô hình Sản phẩm × Môi trường [O-01, O-02]
- **Sản phẩm** (cấp dự án): `{ id, key, name, kind: web|api|app|module, sortOrder }`. `key` dạng `[a-z][a-z0-9_]*`, duy nhất trong dự án, dùng trong biến `{{app.<key>}}`. Thư mục test, phần tử, step dùng chung, tag gắn `productId` (null = cấp dự án, dùng chung mọi sản phẩm — nền cho O-07). Cây UI: Dự án → Sản phẩm → Thư mục → Test. Trong thư mục dự án: `.kiemi/products.json` + `tests/<key sản phẩm>/<thư mục>/…`; phần tử vẫn ở `.kiemi/elements.json`, mỗi phần tử có `productId`. Thư mục cấp 1 mới dưới `tests/` (người khác tạo) thành sản phẩm mới; file nằm thẳng dưới `tests/` thuộc sản phẩm đầu tiên.
- **Môi trường** (cấp dự án): `{ id, name, type: dev|test|uat|staging|production|other, color, sortOrder, protected }` — `type = production` bật `protected` mặc định (W-10, M9-06).
- **Ô ma trận** `(environmentId, productId)`: `{ url, variables, secretNames, proxy, ssh }`. Không có ô = sản phẩm không có ở môi trường đó (step dùng sản phẩm này báo lỗi dễ hiểu "Sản phẩm 'Admin' chưa có ở môi trường 'UAT'"). Thêm môi trường/sản phẩm không tự điền URL — ô trống tới khi người dùng nhập. **Nhân bản môi trường** chép mọi ô (trừ giá trị secret, chỉ chép tên).
- Engine nhận `Env` mở rộng: `apps: Record<key, { url, variables }>` của môi trường đang chạy; main mở SSH tunnel **theo ô** (mỗi ô có SSH riêng → một tunnel; các ô cùng cấu hình dùng chung một tunnel).
- Migration DB (M9-04/05): mỗi dự án cũ có 1 sản phẩm mặc định `key = "web"` (tạo bằng code lúc khởi động — `ProductService.backfillAll`, vì SQL không sinh được UUIDv7), mọi test/thư mục/phần tử gắn vào đó; step dùng chung để `productId = null` (cấp dự án); mỗi môi trường cũ sinh 1 ô `(env, web)` với `baseUrl`, proxy, SSH, biến, secret của môi trường cũ.

### 6. DSL `schemaVersion: 2`
- Thêm ở TestCase: `product?: string` (key sản phẩm chính của test; bỏ trống = sản phẩm đầu tiên của dự án) và `environments?: { only?: string[]; except?: string[]; reason?: string }` (O-06, M9-08 — khai báo luôn ở v2 để không phải lên v3 sớm).
- Biến: `{{app}}` = URL sản phẩm chính của test ở môi trường đang chạy; `{{app.<key>}}` = URL sản phẩm khác; `{{app.<key>.<biến>}}` = biến của ô. `{{env.baseUrl}}` vẫn đọc được (bí danh của `{{app}}`).
- Migration v1 → v2: thay `{{env.baseUrl}}` trong mọi chuỗi của step/cleanup bằng `{{app}}`; không đổi gì khác. Fixture v1 giữ trong test migration (CLAUDE.md §5.1).
- Lên v2 làm ở M9-05 (cùng lúc engine hiểu `app`); M9-02 → M9-04 vẫn ghi v1.

## Phương án đã cân nhắc
- **File là nơi đọc/ghi trực tiếp, bỏ SQLite**: mọi danh sách/tìm kiếm phải quét đĩa, mất giao dịch, viết lại hết service — quá lớn và chậm với thư mục mạng.
- **Một file lớn cho cả dự án**: diff/merge Git rất khó, hai người sửa hai test khác nhau vẫn xung đột.
- **Dùng thư viện Git trong app (isomorphic-git)**: thêm phụ thuộc lớn, tester vẫn có thể dùng Git Desktop/TortoiseGit; thư mục mạng không cần Git. Để v1.2 nếu có yêu cầu (X-xx).
- **Đặt tên file theo id**: ổn định nhưng tester không đọc được khi xem trong Git/Explorer.

## Hệ quả
- Mỗi lần sửa, app tuần tự hóa lại cả dự án để so (chỉ ghi file khác) — vài trăm test vẫn dưới vài chục ms; nếu dự án rất lớn sẽ tối ưu bằng đánh dấu bẩn theo thực thể.
- Mọi bảng dự án thêm sau này phải có mặt trong ảnh chụp dự án (`folder/snapshot.ts`) — test khóa: xuất → nạp lại → giống hệt.
- Thư mục mạng chậm: watcher dùng `fs.watch` đệ quy (Windows/macOS hỗ trợ), có quét định kỳ 5 s làm lưới an toàn cho ổ mạng không báo sự kiện.
