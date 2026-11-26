# ROADMAP — Kiemi v1

Mỗi task: làm trong 1 phiên, tham chiếu ID trong `SPEC.md`. Tick `[x]` khi xong (theo Definition of Done trong `CLAUDE.md`).

## M0 — Nền móng
- [x] **M0-01** Khởi tạo monorepo: pnpm workspaces, Turborepo, TypeScript strict, Biome, Vitest; script `lint`, `typecheck`, `test`, `dev`
- [x] **M0-02** Tạo `apps/desktop` bằng electron-vite (React 19 + Tailwind + shadcn/ui); bật contextIsolation/sandbox; cửa sổ "Hello Kiemi" chạy được
- [x] **M0-03** Nối electron-trpc giữa renderer ↔ main, 1 procedure mẫu có Zod
- [x] **M0-04** i18next (vi/en), cấu trúc file dịch, hook `useT`
- [x] **M0-05** Tạo `apps/demo-site` (Vite): trang login 2 vai trò, form có validate, bảng phân trang, iframe, popup/confirm, trang giả WebForms ID động, dữ liệu đồng bộ trễ (A tạo → B thấy sau 5s)
- [x] **M0-06** GitHub Actions: lint + typecheck + test trên Windows & macOS

## M1 — Schema & Engine lõi
- [x] **M1-01** `packages/schema`: Locator, Step, TestCase, Env, Dataset, RunResult (Zod) + `schemaVersion: 1` + framework migration + xuất JSON Schema [N-08, C-01, C-02]
- [x] **M1-02** `packages/engine`: `defineAction` registry, runner chạy tuần tự, stream event (stepStart/stepEnd/log), timeout từng step [D-07]
- [x] **M1-03** Locator resolver nhiều lớp + ngữ cảnh + thứ N + ID động [C-01, C-03, C-04, C-05]
- [x] **M1-04** Trình duyệt: phát hiện Edge/Chrome, fallback tải Chromium; headed/headless; viewport/mobile [N-03, G-01, G-03, G-05]
- [x] **M1-04b** Proxy theo môi trường (HTTP/SOCKS5, DNS qua proxy) [G-06]
- [x] **M1-05** Nhiều phiên (browser context theo `session`) [F-01, A-16]
- [x] **M1-06** Biến: `{{…}}`, phạm vi, generator, ngày, biểu thức [E-01, E-02, E-05, E-06, E-07]
- [x] **M1-07** Actions điều hướng & nhập liệu [A-01 → A-12]
- [x] **M1-08** Actions tab, dialog, iframe, cookie, chờ [A-13 → A-18]
- [x] **M1-09** Assertions [B-01 → B-11]
- [x] **M1-10** Lưu giá trị vào biến [E-04]
- [x] **M1-11** Luồng: step dùng chung, waitUntil, if/else, lặp, cleanup, tắt step [D-01 → D-06]
- [x] **M1-12** API call + bắt lỗi console/network [F-03, F-04]
- [x] **M1-13** Artifacts: ảnh chụp (khoanh đỏ), video, trace; che secret [I-01 → I-03, E-08]
- [x] **M1-14** Thông báo lỗi tiếng Việt + gợi ý sửa [I-04, N-06]
- [x] **M1-15** E2E: test mẫu "A tạo → B kiểm tra" chạy pass trên demo-site

## M2 — Lưu trữ
- [x] **M2-01** SQLite + Drizzle: schema theo Phụ lục 2, migration, seed workspace mặc định
- [x] **M2-02** Repository + tRPC CRUD: Project, Folder, TestCase, Suite, SharedStep, Element
- [x] **M2-03** Environment, Variable, Secret (safeStorage) [S-06, E-08, N-07]
- [x] **M2-04** Dataset: import Excel/CSV, bảng nhập tay [E-03]
- [x] **M2-05** Xuất / Nhập project, test (`.kiemi.json` / `.zip`) [J-03]

## M3 — UI soạn test
- [x] **M3-01** Layout app, điều hướng, trang chủ danh sách [S-01]
- [x] **M3-02** Bảng step: thêm/sửa/xóa/kéo thả/tắt/nhân bản, undo/redo [S-02, J-04, J-06]
- [x] **M3-03** Panel thuộc tính step tự sinh form từ `params` + `ui` của action
- [x] **M3-04** Ô nhập có gợi ý biến `{{` [E-01]
- [x] **M3-05** Kho phần tử + tìm nơi dùng [J-01, J-02]
- [x] **M3-06** Tab Dữ liệu, Biến, Phiên trong màn soạn test [E-03, F-01]
- [x] **M3-07** Màn Môi trường & Cài đặt [S-06, S-07]
- [x] **M3-08** SSH tunnel tích hợp (thư viện `ssh2` ở main process, SOCKS cục bộ, jump host, Kiểm tra kết nối, credential lưu Secret) + hướng dẫn VPN → SSH [G-07, G-08]

## M4 — Chạy & Kết quả
- [x] **M4-01** Engine chạy trong utility process, nối event về UI [N-05]
- [x] **M4-02** Màn Chạy test: tiến độ realtime, Dừng/Tạm dừng/Bước tiếp, breakpoint, chạy từ bước X, slow-mo [S-03, H-03, H-04]
- [x] **M4-03** Chạy suite / tag, chọn môi trường [H-01, H-02]
- [x] **M4-04** Màn Kết quả: step, ảnh, video, trace viewer [S-04]
- [x] **M4-05** Lịch sử chạy [S-05]
- [x] **M4-06** Xuất báo cáo HTML tự chứa [I-05]

## M5 — Recorder & Pick
- [x] **M5-01** `packages/recorder`: bắt thao tác → step, gộp thao tác thừa [K-01, K-02]
- [x] **M5-02** Sinh locator nhiều lớp + fingerprint khi ghi [C-01, C-02]
- [x] **M5-03** Thanh công cụ nổi: Thêm kiểm tra, Lưu giá trị, Dừng [K-03]
- [x] **M5-04** Pick + Highlight phần tử [C-06]
- [x] **M5-05** Ghi chèn từ step X; nhận ô password → Secret [K-04, K-05]
- [x] **M5-06** Lưu & dùng lại phiên đăng nhập [F-02]
- [x] **M5-07** Gợi ý kiểm tra tự động khi ghi (theo dõi thay đổi DOM/URL sau thao tác) [M-01]
- [x] **M5-08** "Biến thành dữ liệu" sau khi ghi [M-02]
- [x] **M5-09** Sinh biến thể negative/biên từ form đã ghi [M-03]

## M6 — Hoàn thiện sản phẩm
- [x] **M6-01** Onboarding lần đầu + test mẫu [S-08, L-01, L-02, N-01]
- [x] **M6-02** Chế độ Nâng cao (sửa selector) [C-07]
- [x] **M6-03** Rà soát toàn bộ i18n, thông báo lỗi, accessibility cơ bản
- [x] **M6-04** Hiệu năng: mở app ≤ 3s, test 200 step không giật UI [N-05]

## M7 — Đóng gói & Phát hành
- [x] **M7-01** electron-builder: `.exe` (NSIS) + `.dmg` + **Windows portable `.exe`** [N-10]
- [x] **M7-02** Ký code Windows + notarize macOS — *chốt 2026-11-16: v1 phát hành chưa ký; cấu hình + workflow ký sẵn qua secret (ADR 0015); mac chưa ký chỉ báo bản mới [N-12]; ký thật = N-14 (v1.x)*
- [x] **M7-03** Auto-update (electron-updater, nguồn GitHub Releases): tải ngầm, "Có gì mới", khởi động lại để cập nhật; DB migration khi mở bản mới; portable chỉ thông báo [N-09, N-12]
- [x] **M7-03b** GitHub Actions release: tag → build Win (NSIS per-user + portable) & Mac (dmg, universal) → ký code → publish Releases; release notes từ Changesets [N-11, N-13]
- [x] **M7-04** Sentry opt-in [N-09]
- [x] **M7-05** Hướng dẫn sử dụng (docs người dùng) + checklist phát hành v1.0

## M8 — Giao diện thân thiện (linh vật)
- [x] **M8-01** Thiết kế linh vật Cú Kiemi (SVG, 4 biểu cảm, sáng/tối) + icon app mới (nhận diện ở 16px) [U-16]
- [x] **M8-02** Đưa linh vật vào hộp thoại chào mừng, màn hình trống, màn Chạy/Kết quả (theo trạng thái) [U-16, U-06]
- [x] **M8-04** Màn hình khởi động (splash) mỗi lần mở + chuyển cảnh lần đầu nối sang chào mừng [U-18, N-05]
- [x] **M8-05** Chuyển động toàn app + linh vật động + công tắc "Giảm chuyển động" (theo cả cài đặt hệ điều hành) [U-17, U-13]
- [x] **M8-03** Chỉnh design tokens: bo góc 10/16px, nền trạng thái pastel; kiểm lại tương phản (a11y test) + đo lại khởi động trên app đóng gói + phát hành v0.2.0 [U-12, U-13, N-05]

# Phần 2 — Sẵn sàng cho dự án thật (v1.1 → v1.2)
> Nguồn: SPEC Phần 2 (chốt 2026-11-23). Thứ tự milestone theo phụ thuộc: đổi cấu trúc nền (M9) trước, sửa khi fail (M10) trước các tính năng kiểm tra mới.
> Quy ước chung: đổi Step DSL → tăng `schemaVersion` + migration + fixture mọi version cũ (ADR 0003). Mỗi milestone kết thúc bằng: trang demo-site tương ứng + bộ test mẫu L-03 liên quan chạy pass trong CI, cập nhật cột Trạng thái trong `docs/QC-COVERAGE.md`.
> Milestone quá lớn cho 1 phiên → dừng sau 1 task trọn vẹn, ghi "Đang làm dở" (CLAUDE.md mục 2).

## M9 — Dự án · Sản phẩm · Môi trường (đổi cấu trúc dữ liệu nền: DB + DSL)
- [x] **M9-01** ADR: dự án dạng thư mục file là nguồn chính, SQLite chỉ index/cache + lịch sử chạy; mô hình Sản phẩm × Môi trường; DSL `schemaVersion: 2` [T-01, O-01, O-02, O-11]
- [x] **M9-02** Lưu dự án dạng thư mục: `.kiemi/` + mỗi test 1 file `.kiemi.json` (định dạng dễ diff), SQLite thành index; mở nhiều thư mục dự án; chuyển dữ liệu DB hiện có sang thư mục; secret chỉ lưu tên tham chiếu [T-01, O-11]
- [x] **M9-03** Làm việc chung qua Git/thư mục mạng: theo dõi file đổi (≤ 5s), cảnh báo xung đột + hộp thoại chọn bản, khóa mềm khi đang sửa; nhập dự án trên máy khác → hỏi secret còn thiếu [T-01, O-11]
- [x] **M9-04** Cấp **Sản phẩm**: schema + lưu trữ, test/phần tử/step dùng chung/tag gắn sản phẩm; migration map baseURL cũ thành 1 sản phẩm mặc định; UI cây Dự án → Sản phẩm → Thư mục [O-01]
- [x] **M9-05** Ma trận Môi trường × Sản phẩm: mỗi ô URL, tài khoản/secret, proxy/SSH tunnel, biến; ô trống; nhân bản môi trường; DSL v2 `{{app.<sảnPhẩm>}}` (migration v1 → v2); engine mở tunnel theo ô [O-02]
- [x] **M9-06** Loại môi trường + màu nhận diện (thanh tiêu đề, màn Chạy, báo cáo) + bảo vệ Production: chặn step ghi (cleanup, API POST/PUT/DELETE, DB write), xác nhận 2 lần, cảnh báo đỏ [O-03, W-10]
- [x] **M9-07** Kế thừa biến nhiều cấp (Workspace → … → Dòng dữ liệu) + màn "Giá trị hiệu lực"; dataset/biến/secret riêng theo môi trường [O-04, O-05]
- [x] **M9-07z** Generator `pnpm gen action|i18n|table|router <tên>`: tạo file khuôn cho action engine/file i18n/migration DB/tRPC router; không viết tay từng file từ đây trở đi [S]
- [x] **M9-08a** Giới hạn test theo môi trường — engine: skip logic + `RunResult.skipped` + lý do bỏ qua; kiểm tra `only`/`except` trong `RunManager.start` (dùng tên/id/loại môi trường) [O-06, S]
- [ ] **M9-08b** Giới hạn test theo môi trường — UI: editor chọn `environments.only/except`, hộp thoại suite chọn môi trường mặc định [O-06, S]
- [ ] **M9-09a** Phạm vi tài nguyên dùng chung — DB/schema: bảng `shared_resources`, cột phạm vi Sản phẩm/Dự án/Workspace, service + migration [O-07, M]
- [ ] **M9-09b** Phạm vi tài nguyên dùng chung — UI: menu "Dùng chéo dự án", danh sách test bị ảnh hưởng khi sửa step dùng chung [O-07, M]
- [ ] **M9-10** Chuyển dự án nhanh (bộ chọn, gần đây, ghim) + tìm kiếm toàn workspace Ctrl/Cmd+K [O-08, S]
- [ ] **M9-11** Demo-site: 2 app khác domain (admin/web) + e2e: 1 test đi qua 2 sản phẩm, đổi môi trường lấy đúng URL/tài khoản; test cả milestone M9 + app thật + mở PR [L]

## M10 — Sửa khi fail
- [ ] **M10-01** Tạm dừng khi lỗi: giữ trình duyệt + mọi tab/phiên, chọn sẵn step lỗi, highlight phần tử (bật mặc định khi chạy tay, tắt khi suite/CLI) [FX-01] [S]
- [ ] **M10-02** Thử lại step · Tiếp tục từ đây · Bỏ qua step · Chạy lại đến bước N rồi dừng [FX-05] [S]
- [ ] **M10-03** Sửa step tại chỗ trên màn Chạy (panel thuộc tính dùng chung với màn Soạn) + chọn lại phần tử trên trang thật (Pick/Highlight) [FX-02, FX-03] [M]
- [ ] **M10-04** Chèn step trước/sau step lỗi: thêm tay hoặc ghi thao tác từ trạng thái hiện tại [FX-04] [S]
- [ ] **M10-05** Trình xử lý popup toàn cục ("nếu thấy X thì bấm Y", cấp dự án) [W-09] [M]
- [ ] **M10-06** Sửa nhanh theo loại lỗi (không tìm thấy → chọn lại/phần tử tương tự theo fingerprint/chờ lâu hơn; sai giá trị; bị popup che → W-09; hết thời gian; lỗi mạng) [FX-06] [M]
- [ ] **M10-07** Cập nhật kỳ vọng bằng giá trị thực tế + câu hỏi "Thay đổi đúng / Đây là bug"; nút "Copy báo cáo bug" (Markdown) [FX-07, X-02] [S]
- [ ] **M10-08** Phạm vi sửa: chỉ test này / mọi nơi dùng phần tử / step dùng chung, hiện danh sách test bị ảnh hưởng [FX-08] [S]
- [ ] **M10-09** "Sửa và chạy lại" từ màn Kết quả (cùng dòng dữ liệu, cùng môi trường) → vào trạng thái tạm dừng [FX-09] [S]
- [ ] **M10-10** Nhật ký sửa + Hoàn tác trong phiên sửa lỗi; đề nghị "Chạy lại từ đầu để xác nhận" [FX-11] [S]
- [ ] **M10-11** Demo-site: popup ngẫu nhiên + trang lỗi theo từng loại; e2e luồng sửa khi fail

## M11 — Validate form, thiết kế test & đo độ phủ
- [ ] **M11-01** Bảng đặc tả field (kiểu + quy tắc, phụ thuộc, so sánh giữa field, file) + lưu trữ `FieldSpec`/`FieldRule` [R-01]
- [ ] **M11-02** Tự suy ra đặc tả từ HTML form (+ OpenAPI/JSON Schema nếu có), QC duyệt [R-02]
- [ ] **M11-03** Thư viện quy tắc VN & catalog thông báo dùng chung (Email, SĐT VN, CCCD, MST, …) [R-10]
- [ ] **M11-04** Sinh test theo kỹ thuật chuẩn (phân vùng, biên, bảng quyết định, pairwise; 1 hợp lệ + mỗi case sai 1 field), chuyển biến thể M-03 cũ sang mô hình mới [R-03, M-03]
- [ ] **M11-05** Bộ dữ liệu xấu chuẩn, bật/tắt theo field, nhãn giải thích tiếng Việt [R-04]
- [ ] **M11-06** Kiểm tra thông báo lỗi theo field (vị trí, nội dung theo catalog, focus, không xóa dữ liệu, không gửi form) + round-trip lưu rồi đọc lại [R-05, R-07]
- [ ] **M11-07** Ma trận kết quả Field × Quy tắc (xem ảnh/chi tiết, xuất Excel) [R-09]
- [ ] **M11-08** Import đặc tả field từ Excel (file mẫu) [R-14]
- [ ] **M11-09** Nhãn kỹ thuật thiết kế + đặc tính ISO 25010 cho test/case (tự gắn với case sinh tự động) [CV-01]
- [ ] **M11-10** Độ phủ trang (khai báo danh sách trang) + độ phủ theo checklist `QC-COVERAGE.md` [CV-02, CV-04]
- [ ] **M11-11** Lint chất lượng test (có nút sửa nhanh/giải thích) + nhắc sinh thêm case sau khi ghi [CV-07, CV-08]
- [ ] **M11-12** Demo-site: form Đăng ký 5 field có lỗi cố ý; mẫu L-03 #7 "Validate form" [L-03]

## M12 — Dữ liệu & tính toán
- [ ] **M12-01** Biến danh sách & object: lưu bảng/danh sách thành list object, truy cập `{{x[0].y}}`, `{{x.length}}`, panel Biến (DSL tăng version) [P-02]
- [ ] **M12-02** Dataset lồng nhau: nhiều sheet liên kết khóa, step Lặp duyệt danh sách con, UI dạng cây [P-01]
- [ ] **M12-03** ADR engine công thức (an toàn, không `eval`) + thư viện công thức có tên, debug từng bước [P-03]
- [ ] **M12-04** So sánh số có sai lệch + định dạng số/tiền/ngày VN theo môi trường [P-04, P-10]
- [ ] **M12-05** Kỳ vọng 2 nguồn (cột Excel + công thức) + so sánh bảng với danh sách kỳ vọng theo khóa [P-05, P-06]
- [ ] **M12-06** Kiểm tra bảng: mọi dòng thỏa điều kiện, đã sắp xếp (thứ tự tiếng Việt), duyệt mọi trang + tổng khớp nhãn [Q-01, Q-02, Q-03]
- [ ] **M12-07** File tải về: tên/loại/dung lượng, đọc Excel/CSV/PDF → biến [Q-04]
- [ ] **M12-08** Sinh file Excel/CSV từ dataset + file mẫu để upload [P-09]
- [ ] **M12-09** Demo-site: Shop (giỏ hàng, mã giảm, VAT, ship), Bảng lương (xuất Excel, PDF), Danh sách 500 dòng, Import/Export có dòng lỗi; mẫu L-03 #1, #2, #4, #5 [L-03]

## M13 — Web thực tế & kiểm tra chéo
- [ ] **M13-01** Tab có tên: mở/bắt tab do thao tác mở, đặt tên, chuyển theo tên, nhãn tab trên step, recorder tự đặt tên [V-01]
- [ ] **M13-02** Phạm vi khi mở tab: cùng phiên / phiên khác / trình duyệt khác [V-02]
- [ ] **M13-03** So sánh trực tiếp giữa 2 nơi trong 1 step (text, số có sai lệch, bảng vs bảng), ảnh cả 2 tab khi lệch [V-03]
- [ ] **M13-04** Giả lập thời gian (đặt giờ, tua nhanh, đóng băng) [Y-01]
- [ ] **M13-05** HTTP Basic / NTLM / Windows auth theo môi trường [W-01]
- [ ] **M13-06** Grid phức tạp: cuộn ảo, sửa inline, chọn dòng, dòng con, lọc header [W-03]
- [ ] **M13-07** Control phức tạp (Select2-like, rich text, date-range, mask, autocomplete) — recorder ghi thành 1 step có nghĩa [W-04]
- [ ] **M13-08** Upload qua input ẩn và kéo thả [W-06]
- [ ] **M13-09** Demo-site: grid 1.000 dòng, control phức tạp, Basic auth, khuyến mãi theo ngày + đếm ngược; mẫu L-03 #8 [L-03]

## M14 — Team & quy trình QA (→ phát hành v1.1)
- [ ] **M14-01** Case thủ công (bước + kỳ vọng, đánh dấu pass/fail, ảnh, chuyển dần sang tự động) [T-03]
- [ ] **M14-02** Test plan & đợt test theo release (giao người, Pass/Fail/Blocked/Chưa chạy, dashboard) [T-02]
- [ ] **M14-03** Import test case từ Excel (file mẫu + map cột) thành case thủ công [X-08]
- [ ] **M14-04** Ma trận phân quyền từ Excel → sinh test mỗi vai trò (menu, nút, URL trực tiếp) + demo-site 3 vai trò; mẫu L-03 #3 [Q-09, L-03]
- [ ] **M14-05** Báo cáo Excel/PDF (sheet Tổng hợp + Chi tiết) [X-01]
- [ ] **M14-06** Thông báo kết quả qua webhook (Teams, Slack, Google Chat, Telegram, SMTP) [X-03]
- [ ] **M14-07** ADR + `apps/cli` (`kiemi run …`) dùng chung engine, đóng gói cùng app, hẹn giờ, JUnit XML [X-04]
- [ ] **M14-08** ADR + Query DB (SQL Server, Postgres, MySQL ở main process), mặc định chỉ đọc, ghi bị W-10 chặn; mẫu L-03 #6 [X-05, L-03]
- [ ] **M14-09** Rà soát `QC-COVERAGE.md` (không còn ❌ ở dòng v1.1), user guide, phát hành v1.1

## M15 — v1.2 (các mục còn lại)
- [ ] **M15-01** Dự án & môi trường: chạy ma trận, dashboard theo cấp, template dự án, phiên bản sản phẩm [O-09, O-10, O-12, O-13, R-15]
- [ ] **M15-02** Sửa dữ liệu tại chỗ khi data-driven [FX-10]
- [ ] **M15-03** Kiểm tra chéo: realtime không tải lại, so sánh 2 môi trường, điểm kiểm tra lan truyền [V-04, V-06, V-07]
- [ ] **M15-04** Trình duyệt: giả lập mạng, quyền, clipboard, request mạng [Y-02, Y-03, Y-04, Y-05]
- [ ] **M15-05** SEO/meta, đa ngôn ngữ web cần test, vỡ bố cục [Y-06, Y-07, Y-09]
- [ ] **M15-06** Field nâng cao: validate phía server, UI của field, hành vi Back/Refresh [R-06, R-08, R-13]
- [ ] **M15-07** Crawl toàn site + bảo mật cơ bản không phá hoại (IDOR, XSS phản hồi, cookie) [R-11, R-12]
- [ ] **M15-08** Dữ liệu: hàm ngày nghiệp vụ, sinh tổ hợp pairwise [P-07, P-08]
- [ ] **M15-09** Kiểm tra nâng cao: thời gian phản hồi, đối chiếu UI = API = DB, thao tác lặp nhanh, chuyển trạng thái [Q-05, Q-07, Q-08, Q-10]
- [ ] **M15-10** Web thực tế: client cert, Shadow DOM, In/PDF, session hết hạn [W-02, W-05, W-07, W-08]
- [ ] **M15-11** Team: yêu cầu/ticket + độ phủ yêu cầu, lịch sử phiên bản test, xu hướng/flaky, độ phủ phần tử, điểm độ phủ [T-04, T-05, T-07, CV-03, CV-05, CV-09]
- [ ] **M15-12** Tích hợp: tạo issue Jira/Redmine/Azure DevOps/GitLab/GitHub, Email/OTP, Mock API [X-02, X-06, X-07]

## M16 — Trợ lý Kiemi (AI, tùy chọn)
- [ ] **M16-01** ADR + `packages/ai` (main process): adapter Claude/OpenAI-compatible/Ollama, API key trong Secret, bật/tắt theo dự án [AI-01]
- [ ] **M16-02** Bảo vệ dữ liệu, duyệt qua diff + Zod, chi phí, hàng rào hành động [AI-02, AI-03, AI-04, AI-21]
- [ ] **M16-03** Gói kiến thức Kiemi sinh lúc build + công cụ tra cứu dự án + ngữ cảnh trang + ghi chú dự án [AI-15, AI-16, AI-17, AI-20]
- [ ] **M16-04** Panel chat + thiết kế test bằng hội thoại + gợi ý case còn thiếu/nghiệp vụ [AI-13, AI-18, AI-19, AI-08]
- [ ] **M16-05** Phân loại nguyên nhân fail + tự sửa selector + "Đề xuất sửa" trên màn Chạy [AI-10, AI-09, FX-12]
- [ ] **M16-06** Mô tả tiếng Việt → step, tài liệu → test, viết bug & tóm tắt đợt test [AI-05, AI-06, AI-11]

## Sau v1.2 (v1.x)
N-14 (ký code Windows + notarize macOS, khi có chứng chỉ).
M-07 (import Playwright codegen / Selenium IDE), A-19, B-14, D-08, F-09, G-02, G-04, H-05, H-06, I-08.
CV-06, Q-06, Y-08, Y-10, T-06, AI-07, AI-12, AI-14.
