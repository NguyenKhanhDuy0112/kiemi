# Checklist phát hành Kiemi

Quy trình kỹ thuật: ADR 0015 (đóng gói, ký, workflow) và ADR 0016 (tự cập nhật, báo lỗi).

## A. Chuẩn bị một lần (trước v1.0)
- [ ] **Chứng chỉ ký code Windows** (OV/EV, file `.pfx`) → secret `WIN_CSC_LINK` (base64 của file) + `WIN_CSC_KEY_PASSWORD`. *Chứng chỉ EV trên USB/HSM không xuất được `.pfx` → cần đổi sang dịch vụ ký đám mây (Azure Trusted Signing…), phải sửa workflow.*
- [ ] **Apple Developer ID Application** (`.p12`) → `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD`.
- [ ] **Notarize macOS**: App Store Connect API key → `APPLE_API_KEY_BASE64` (base64 của `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
- [ ] **Sentry**: tạo project (platform Electron), lấy DSN → secret `SENTRY_DSN`. Bật "Data scrubber" + "Prevent storing IP addresses" trong cài đặt project.
- [ ] Repo code **private**? → tạo repo public `kiemi-releases`, đặt biến `KIEMI_RELEASE_REPO=kiemi-releases` (+ `KIEMI_RELEASE_OWNER` nếu khác) và secret `KIEMI_RELEASE_TOKEN` (fine-grained token, quyền *Contents: write* trên repo đó). Repo public thì bỏ qua.
- [ ] Settings → Actions → General → *Workflow permissions* = **Read and write**.

## B. Mỗi lần phát hành
1. [ ] `main` xanh trên CI (Windows + macOS).
2. [ ] Mỗi thay đổi người dùng thấy được đã có changeset (`pnpm changeset`, chọn `@kiemi/desktop`, câu tiếng Việt viết cho tester).
3. [ ] `pnpm release:version` → kiểm tra `apps/desktop/package.json` (version) và `apps/desktop/CHANGELOG.md` (mục mới đọc dễ hiểu).
4. [ ] Commit `chore(release): vX.Y.Z`, push `main`.
5. [ ] `git tag vX.Y.Z && git push origin vX.Y.Z` → workflow **Release** chạy (draft → build Win/Mac → publish).
6. [ ] Workflow xanh; release có đủ: `Kiemi-Setup.exe` (+ `.blockmap`), `Kiemi-Portable.exe`, `Kiemi-mac.dmg`, `Kiemi-X.Y.Z-universal-mac.zip` (+ `.blockmap`), `latest.yml`, `latest-mac.yml`.

## C. Kiểm tra sau phát hành (máy sạch, tài khoản không phải admin)
- [ ] **Windows — bản cài**: cài không hỏi quyền admin; không có cảnh báo SmartScreen "Unknown publisher" (đã ký); mở app ≤ 3 giây; Dự án mẫu → Chạy → Đạt.
- [ ] **Windows — portable**: chạy file `.exe` trực tiếp (thử qua Remote Desktop); test mẫu chạy được.
- [ ] **macOS**: mở `.dmg`, kéo vào Applications, mở không bị Gatekeeper chặn (đã notarize); thử cả máy Intel và Apple Silicon.
- [ ] **Máy không có Edge/Chrome** (hoặc chọn Chromium trong Cài đặt): lần chạy đầu tải trình duyệt có thanh tiến trình, sau đó chạy offline được.
- [ ] **Offline**: rút mạng, mở app, chạy test mẫu → Đạt; Cài đặt → Cập nhật báo "Chưa kiểm tra được", không có thông báo lỗi bật lên.
- [ ] **Tự cập nhật**: cài bản trước, mở app → sau ~10 giây nút "Có bản mới" hiện, "Có gì mới" đúng nội dung CHANGELOG → "Khởi động lại để cập nhật" → app mở lại ở bản mới, **test, kết quả, cài đặt, bí mật còn nguyên**; có bản sao trong `backups/` nếu bản mới có migration DB.
- [ ] **Portable cập nhật**: chỉ thông báo, nút "Tải bản mới" mở trang Releases.
- [ ] **Báo lỗi**: mặc định tắt. Bật → mở lại app → gây lỗi thử → sự kiện trên Sentry **không** chứa tên người dùng, đường dẫn home, URL trang, email.
- [ ] Đổi ngôn ngữ English: không còn chuỗi tiếng Việt sót.
- [ ] **Query DB (X-05)**: thử 'Thử kết nối' + một bước 'Hỏi cơ sở dữ liệu' với Postgres, MySQL và SQL Server thật (đọc được; câu UPDATE bị chặn; môi trường Production chặn bước ghi).
- [ ] **CLI (X-04)**: trên bản cài Windows chạy `resources\cli\kiemi.cmd version` → in số phiên bản; `kiemi run <thư-mục-dự-án-mẫu> --suite … --junit kq.xml` → mã thoát 0 và có file JUnit; trên macOS thử `kiemi.sh` trong `Kiemi.app/Contents/Resources/cli/`.

## D. Riêng v1.0
- [ ] Mọi task M0 → M7 trong `docs/ROADMAP.md` đã tick, `docs/PROGRESS.md` không còn vấn đề chặn.
- [ ] Các yêu cầu `v1` trong `docs/SPEC.md` đã đáp ứng tiêu chí chấp nhận (đi lần lượt từng mục A → U, N).
- [ ] Hướng dẫn sử dụng (`docs/user-guide/README.md`) khớp với app (tên nút, ảnh chụp nếu thêm).
- [ ] Đo khởi động trên máy Windows cấu hình thấp (N-05: ≤ 3 giây).
- [ ] Ghi chú phát hành v1.0 viết tay thêm phần giới thiệu ngắn ở đầu.
