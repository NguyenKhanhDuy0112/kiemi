# Nhật ký Archive (M0 → M8)

| Ngày | Task | Kết quả | Ghi chú |
|---|---|---|---|
| 2026-11-16 | — | Tạo bộ tài liệu dự án | |
| 2026-11-16 | M0-01 | Xong — monorepo, script `lint`/`typecheck`/`test`/`dev`/`build`/`format` | `@kiemi/shared` có `BRAND` + test mẫu; đã kiểm tra lint bắt `any`, typecheck bắt lỗi kiểu |
| 2026-11-16 | M0-02 | Xong — `apps/desktop` (electron-vite, React 19, Tailwind 4, shadcn/ui Button, design tokens màu thương hiệu, font Be Vietnam Pro offline) | Đã chạy thật: cửa sổ "Hello Kiemi", sandbox xác nhận qua CDP (không có `require`/`process` trong renderer); chặn mở cửa sổ mới/điều hướng lạ; CSP chặt |
| 2026-11-16 | M0-03 | Xong — electron-trpc 1.0 + tRPC 11 + TanStack Query; router `app.info`, `app.echo` (Zod) | Chạy thật: renderer hiện version lấy từ main; chỉ có `window.electronTRPC`; `allow` chặn trang lạ (unit test); ADR 0002 |
| 2026-11-16 | M0-04 | Xong — i18next 27 + react-i18next 18; `createI18n`, `useT`, key có kiểu chặt; nút đổi ngôn ngữ tạm trên màn chính | Chạy thật: đổi vi↔en, `<html lang>` cập nhật, nhớ lựa chọn. Thêm happy-dom + Testing Library cho test React |
| 2026-11-16 | — | Đổi workflow: 1 chat = 1 task, kết thúc phiên thì dừng; UI dùng shadcn/ui + Blocks; thêm cách chạy tự động `claude -p` | CLAUDE.md §2, §5.8; START-PROMPT.md |
| 2026-11-16 | M0-05 | Xong — `apps/demo-site` (Vite MPA): login 2 vai trò, form đơn nghỉ (dropdown tự làm, lịch dd/MM/yyyy, contenteditable, upload, lỗi theo ô), danh sách đơn (duyệt/từ chối + confirm, đồng bộ trễ), bảng phân trang + tìm kiếm, iframe lồng 2 lớp, alert/confirm/prompt/popup/tab mới, WebForms ID động + postback | 18 unit test server (store, webforms, api qua HTTP thật). Chạy thử dev server: mọi trang 200, quản lý thấy đơn sau độ trễ; Chrome headless xác nhận JS client render |
| 2026-11-16 | M0-06 | Xong — workflow CI `lint`/`typecheck`/`test` trên Windows & macOS; `.gitattributes` (LF) | Run đầu tiên pass cả 2 OS (actions/runs/43815029737) |
| 2026-11-16 | M1-01 | Xong — `@kiemi/schema`: Locator (7 chiến lược theo thứ tự C-01) + Fingerprint, Element/Target, Step, TestCase v1, Dataset/nguồn dữ liệu, Env/Secrets, RunResult; framework migration + fixture v1; JSON Schema commit sẵn | 35 unit test; ADR 0003 |
| 2026-11-16 | M1-02 | Xong — `@kiemi/engine`: `defineAction` + `ActionRegistry` (validate params bằng Zod), `runTestCase` tuần tự, event `runStart/stepStart/log/stepEnd/runEnd`, timeout từng step + mặc định, soft/hard, bỏ step tắt, cleanup luôn chạy, hủy run | 14 unit test; ADR 0004 |
| 2026-11-16 | M1-03 | Xong — `resolveLocator`: thử chiến lược theo thứ tự, chờ phần tử xuất hiện, bỏ qua kết quả mơ hồ, scope `within`/`row`/`near`, `nth`, ID động (`ctl00_…`, ID ngẫu nhiên → khớp phần ổn định), hỗ trợ iframe | 36 test mới (unit stable-id + trình duyệt thật + e2e WebForms demo-site); ADR 0005 |
| 2026-11-16 | M1-04 | Xong — phát hiện Edge/Chrome theo OS, `launchBrowser` (auto/chọn trình duyệt, headless/headed, slowMo), tải Chromium có tiến trình, context riêng theo session, viewport + giả lập mobile | 23 test mới; đã thử tải Chromium thật (~150 MB) và chạy được; ADR 0006 |
| 2026-11-16 | M1-04b | Xong — `Env.proxy` (HTTP/HTTPS/SOCKS5, bypass, mật khẩu qua secret), proxy theo context, DNS qua proxy | 9 test mới (proxy HTTP có auth + SOCKS5 thật trong Node, tên máy nội bộ chỉ proxy phân giải được) |
| 2026-11-16 | — | Người dùng yêu cầu làm hết M1 trong 1 phiên, code xong hết rồi mới test | Bỏ qua quy tắc 1 chat = 1 task cho phiên này |
| 2026-11-16 | M1-05 | Xong — mỗi session 1 context riêng, nhãn session trên từng step, bước `switchSession` [F-01, A-16] | e2e: 2 phiên cách ly cookie |
| 2026-11-16 | M1-06 | Xong — `{{…}}`, phạm vi env→suite→test→runtime, generator (random/uuid/timestamp/fake.* tiếng Việt), ngày (`today+3d`, `startOfMonth`, `| dd/MM/yyyy`), biểu thức | 14 unit test |
| 2026-11-16 | M1-07 | Xong — goto, fill, clear, click (đúp/phải), hover, select (native + tự làm), check, pickDate, press, scroll, upload, navigate | e2e trên form demo-site |
| 2026-11-16 | M1-08 | Xong — tab mới/chuyển/đóng (tự bắt popup), dialog, iframe tự phát hiện (lồng 2 lớp), clearData, wait | e2e |
| 2026-11-16 | M1-09 | Xong — 12 loại kiểm tra (hiển thị, trạng thái, text, giá trị, số, ngày, đếm, bảng, URL, tiêu đề, thông báo, biến), cứng/mềm | e2e |
| 2026-11-16 | M1-10 | Xong — `extract` (text/value/thuộc tính/URL/tiêu đề + regex) | e2e |
| 2026-11-16 | M1-11 | Xong — `call` (step dùng chung có tham số), `waitUntil` (chu kỳ + tải lại), `if`/`elseSteps`, `loop` (N lần / dữ liệu / dòng bảng), `skipIf`, kết quả step con | e2e |
| 2026-11-16 | M1-12 | Xong — `api` (method/header/JSON/form, lưu response, kiểm status/field), ghi lỗi console & 4xx/5xx, tùy chọn fail | e2e |
| 2026-11-16 | M1-13 | Xong — ảnh chụp khoanh đỏ (lỗi / mọi step), video, trace, che secret | e2e; tự cài ffmpeg khi cần video |
| 2026-11-16 | M1-14 | Xong — lỗi tiếng Việt + gợi ý cho mọi mã lỗi, `describeRunError` (vi/en) | 6 unit test |
| 2026-11-16 | M1-15 | Xong — test mẫu "nhân viên tạo đơn → quản lý thấy sau đồng bộ trễ, kiểm tra bảng, duyệt" từ file `.kiemi.json`, chạy theo 2 dòng dữ liệu | Pass; cả repo 201 test; ADR 0007 |
| 2026-11-16 | — | Người dùng yêu cầu làm tiếp M2 cùng phiên, code xong rồi mới test | |
| 2026-11-16 | M2-01 | Xong — `@kiemi/db`: 17 bảng Phụ lục 2 (Drizzle), migration nhúng + bảng `_kiemi_migrations`, seed workspace/project/môi trường/ngôn ngữ | better-sqlite3 13 (N-API) chạy cả Node lẫn Electron 45 không cần rebuild; đã chạy app thật: tạo `kiemi.db` đúng |
| 2026-11-16 | M2-02 | Xong — `Repo` (workspace, soft delete, optimistic version) + service Project/Folder/TestCase/Suite/SharedStep/Element + tRPC | Thư mục chống vòng lặp, xóa lan xuống test con |
| 2026-11-16 | M2-03 | Xong — Môi trường, biến, secret mã hóa bằng `safeStorage`; renderer chỉ thấy tên secret | |
| 2026-11-16 | M2-04 | Xong — Dataset: bảng nhập tay, nhập CSV (`,`/`;`/tab, BOM), Excel (ngày, công thức, rich text) | |
| 2026-11-16 | M2-05 | Xong — Xuất/nhập `.kiemi.json` và `.zip` (project/suite), id mới, ánh xạ tham chiếu, không xuất secret | 33 test mới (db 29 + router 4); cả repo 234 test; ADR 0008 |
| 2026-11-16 | — | Sửa CI M2 fail: assertion có timeout ngắn trên máy CI chậm báo STEP_TIMEOUT thay vì ASSERTION_FAILED | Vòng lặp assertion tính thời gian mỗi lần kiểm tra; e2e dùng timeout ≥ 1,5 s |
| 2026-11-16 | M3-01 | Xong — layout 3 vùng (sidebar shadcn), chọn/tạo dự án, cây thư mục → test / bộ test, tìm theo tên/tag, tạo/đổi tên/nhân bản/chuyển thư mục, xóa có hoàn tác, Ctrl/⌘K, sáng/tối | Chạy app thật bằng Playwright `_electron`, chụp màn hình |
| 2026-11-16 | M3-02 | Xong — bảng bước đọc như câu tiếng Việt có chip, kéo thả, tắt/bật, nhân bản, xóa có hoàn tác, undo/redo, tự lưu, phím tắt | |
| 2026-11-16 | M3-03 | Xong — panel chi tiết tự sinh form từ JSON Schema của action (`system.actions`), mục Nâng cao | |
| 2026-11-16 | M3-04 | Xong — gõ `{{` gợi ý biến môi trường/test/dữ liệu/bí mật/đã lưu/generator | |
| 2026-11-16 | M3-05 | Xong — kho phần tử: phần tử của test + nơi dùng, phần tử dự án, thêm vào test, chặn xóa khi đang dùng | |
| 2026-11-16 | M3-06 | Xong — tab Dữ liệu (không / bộ đã lưu / bảng nhập tay, nhập Excel/CSV), Biến, Phiên (đổi tên cập nhật các bước) | |
| 2026-11-16 | M3-07 | Xong — màn Môi trường (địa chỉ gốc, biến, bí mật luôn che, proxy) và Cài đặt (ngôn ngữ, giao diện, trình duyệt, chạy ngầm, timeout, thư mục kết quả) | `settings.*` lưu DB |
| 2026-11-16 | M3-08 | Xong — SSH tunnel `ssh2` → SOCKS cục bộ, jump host, mật khẩu/khóa riêng từ bí mật, Kiểm tra kết nối, hướng dẫn VPN → SSH; `Env.ssh` + migration 2 | 5 test với SSH server giả (`ssh2.Server`), DNS phía SSH; cả repo 256 test; ADR 0009 |
| 2026-11-16 | M4-01 | Xong — engine chạy trong Electron utility process; `RunManager` ghi kết quả vào DB, mở/đóng SSH tunnel, phát event qua tRPC subscription; nút Chạy/Dừng, tiến độ, icon trạng thái từng bước, toast kết quả | Chạy app thật bằng `_electron`: thấy tiến trình Utility, UI vẫn bấm được khi chạy, test đạt/không đạt ghi đúng DB + ảnh lỗi; engine crash → `ENGINE_CRASHED`; cả repo 268 test; ADR 0010 |
| 2026-11-16 | — | Người dùng yêu cầu code hết M4 trong 1 phiên rồi test cả milestone | Bỏ qua quy tắc 1 chat = 1 task cho phiên này |
| 2026-11-16 | M4-02 | Xong — màn Chạy realtime: Tạm dừng / Tiếp tục / Bước tiếp / Dừng, breakpoint (bảng bước + màn Chạy), chạy từ bước X, chạy từng bước, chạy chậm, hiện trình duyệt | `DebugController` trong engine; e2e app thật: dừng ở bước 2 → bước tiếp → dừng ở bước 3 → tiếp tục → đạt |
| 2026-11-16 | M4-03 | Xong — chạy test / bộ test / theo tag, chọn môi trường, dừng khi test đầu tiên lỗi hoặc chạy hết; hộp thoại sửa bộ test | Migration 3 `runs.target` |
| 2026-11-16 | M4-04 | Xong — màn Kết quả: trạng thái + thời gian từng bước, lỗi tiếng Việt + gợi ý, ảnh chụp (phóng to), video, mở trace viewer, mở thư mục | `kiemi-artifact://`, trace viewer của playwright-core qua server 127.0.0.1 |
| 2026-11-16 | M4-05 | Xong — Lịch sử: lọc test / bộ test / kết quả, so sánh 2 lần chạy (chỉ hiện chỗ khác) | |
| 2026-11-16 | M4-06 | Xong — Xuất báo cáo HTML 1 file (CSS nội tuyến, ảnh data URL, không script) | Cả repo 282 test; kịch bản e2e app thật bao trọn M4 pass; ADR 0011 |
| 2026-11-16 | M5-01 | Xong — `@kiemi/recorder`: ghi bấm/đúp/chuột phải, nhập, chọn, tick, phím, chuyển trang, tab mới, iframe; gộp thao tác thừa | 14 test (unit + e2e ghi → chạy lại bằng engine trên demo-site); ADR 0012 |
| 2026-11-16 | — | Đổi quy trình: mỗi phiên làm trọn 1 milestone, test cả milestone ở cuối | CLAUDE.md §2, START-PROMPT.md |
| 2026-11-16 | M5-02 | Xong — locator nhiều lớp (role+tên → nhãn → placeholder → chữ → testId → css → xpath) + fingerprint (thuộc tính, phần tử lân cận, vị trí; không lưu giá trị ô mật khẩu) | |
| 2026-11-16 | M5-03 | Xong — thanh công cụ nổi trong trang: Thêm kiểm tra (hiện / chữ / giá trị / được chọn), Lưu giá trị vào biến, Lưu đăng nhập, Dừng | |
| 2026-11-16 | M5-04 | Xong — Pick (bấm chọn phần tử, kể cả trong iframe) + Highlight (báo 0 / 1 / nhiều phần tử khớp); nút trong ô Phần tử của editor | |
| 2026-11-16 | M5-05 | Xong — ghi chèn sau bước X (engine chạy tới X rồi giữ trình duyệt: `stopAfterStepId` + `keepSessions`); ô mật khẩu → đề nghị lưu thành bí mật | |
| 2026-11-16 | M5-06 | Xong — lưu & dùng lại đăng nhập có hạn dùng (bước `saveSession` / `useSession`, bảng `saved_logins`, chọn khi bắt đầu ghi, danh sách ở tab Phiên) | Migration 4 |
| 2026-11-16 | M5-07 | Xong — gợi ý kiểm tra sau thao tác: thông báo, dòng mới trong bảng, phần tử mới, đổi địa chỉ; bấm ✓ trong trang hoặc trong app | |
| 2026-11-16 | M5-08 | Xong — "Biến thành dữ liệu": chọn giá trị đã nhập → cột bảng dữ liệu + `{{row.x}}` | |
| 2026-11-16 | M5-09 | Xong — sinh biến thể lỗi từ form (bỏ trống, sai định dạng, giá trị biên, ký tự đặc biệt) → test mới gắn tag `negative` | Test cả M5: 325 test pass; app thật pass (sửa 3 lỗi: vòng lặp render, chuỗi i18n đặt sai chỗ, nhãn menu trùng); ADR 0013 |
| 2026-11-16 | M6-01 | Xong — hộp thoại chào mừng (nhập URL → mở editor và tự ghi / mở test mẫu), tour 3 bước, Dự án mẫu 4 test (đăng nhập, form + thông báo, A tạo → B duyệt, dữ liệu Excel) chạy trên trang mẫu đi kèm | 4 test mẫu (6 lần chạy) pass qua RunManager + trình duyệt thật; sửa CSS demo-site (`[hidden]` bị `display:grid` ghi đè) |
| 2026-11-16 | M6-02 | Xong — chế độ Nâng cao: CSS / testId / nhiều cách tìm, sửa danh sách chiến lược kể cả của phần tử đã lưu, cảnh báo cú pháp | |
| 2026-11-16 | M6-03 | Xong — rà chuỗi cứng (aria-label, placeholder), test đối chiếu mã lỗi engine/DB ↔ bản dịch, màu chữ trạng thái đạt AA, cỡ chữ tối thiểu 13px (trước đó `text-xs` = 10,5px) | |
| 2026-11-16 | M6-04 | Xong — minify + lazy màn phụ, memo dòng bước, `updateStep` không clone cả tài liệu | 200 bước: mỗi phím 31 ms → 4 ms; mở app ~0,7 s |
| 2026-11-16 | — | Test cả M6: lint + typecheck + 356 test pass; app thật pass (chào mừng → test mẫu → tour → Nâng cao → chạy test mẫu đạt → nhập URL bắt đầu ghi → khởi động lại không hiện chào mừng, trang mẫu vẫn chạy) | Sửa 2 lỗi: lưu 1 cài đặt reset các cài đặt khác (Zod `.partial()` điền mặc định); ô giá trị cách tìm bị cắt trong panel hẹp. ADR 0014 |
| 2026-11-16 | M7-01 | Xong — electron-builder: NSIS per-user (oneClick, không admin) + portable `.exe` + mac `dmg`/`zip` universal; trang mẫu trong `resources/sample-site`; icon K + tick | Build thật trên mac: `.dmg`, và build chéo `Kiemi-Setup-0.1.0.exe`, `Kiemi-Portable-0.1.0.exe`; app đóng gói mở 0,8–2,8 s, test mẫu chạy Đạt; ADR 0015 |
| 2026-11-16 | M7-02 | **Chờ người dùng** — ký code/notarize cấu hình qua biến môi trường + secret GitHub | Thiếu chứng chỉ → build không ký, có cảnh báo trong workflow |
| 2026-11-16 | M7-03 | Xong — electron-updater (tải ngầm, "Có gì mới", khởi động lại để cập nhật; portable chỉ báo), sao lưu DB trước migration | Unit + component test; app thật: trạng thái cập nhật hiện trong Cài đặt, lỗi mạng không bật thông báo; ADR 0016 |
| 2026-11-16 | M7-03b | Xong — workflow Release theo tag (draft → Win + Mac → publish), ghi chú từ CHANGELOG của Changesets | Script `release-notes.mts` có test; chưa chạy thật trên GitHub |
| 2026-11-16 | M7-04 | Xong — Sentry opt-in (mặc định tắt), lọc dữ liệu cá nhân, lỗi cửa sổ chuyển về main | App thật với DSN giả: bật → mở lại → SDK chạy, app bình thường |
| 2026-11-16 | M7-05 | Xong — `docs/user-guide/README.md`, `docs/RELEASE-CHECKLIST.md` | |
| 2026-11-16 | M7 (test) | lint + typecheck + 387 test pass; kiểm tra app đóng gói bằng `_electron.launch` | Sửa: thiếu `productName` → thư mục dữ liệu `@kiemi/desktop` (đã đổi thành `Kiemi`) |
| 2026-11-16 | M7-02 | Chốt — v1 phát hành chưa ký (SPEC N-11/N-12 sửa, thêm N-14 v1.x); mac chưa ký chỉ báo bản mới | Workflow đặt `MAIN_VITE_CODE_SIGNED=1` khi có chứng chỉ |
| 2026-11-16 | — | CI xanh lại cả Windows + macOS (đỏ từ M5): đường dẫn Windows, timeout/retry cho runner chậm, khóa SSH test | |
| 2026-11-16 | — | **Phát hành v0.1.0** (run 43903073128): Windows NSIS + portable, macOS universal dmg/zip, latest.yml | Sửa: gộp mac universal (`x64ArchFiles`, bỏ Sentry bundler plugins); README nút tải theo OS; đổi tên repo `kiemi` |
| 2026-11-16 | — | Chốt yêu cầu mới U-16 (linh vật Cú Kiemi), sửa U-12, U-06; thêm M8 | Người dùng chọn phương án A |
| 2026-11-16 | — | Chốt U-17 (chuyển động), U-18 (splash mỗi lần mở, lần đầu dài hơn); M8 thêm M8-04, M8-05 | |
| 2026-11-19 | M8-01 → M8-05 | Xong — Cú Kiemi (4 biểu cảm, icon mới), linh vật ở chào mừng/màn trống/kết quả, splash (lần đầu vẫy "Xin chào!"), chuyển động + Giảm chuyển động, bo góc 10/16 + nền pastel | ADR 0017 |
| 2026-11-19 | M8 (test) | lint + typecheck + 397 test pass; app đóng gói: splash 0,9 s → tắt 1,7 s (lần mở sau), cú vui khi Đạt, Giảm chuyển động áp dụng + nhớ sau khi mở lại, giao diện tối ổn | Sửa: logo sidebar chìm vào nền chàm |
