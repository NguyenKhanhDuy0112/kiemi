# Skill: Đóng gói & Phát hành

**Tải skill này khi:** làm task M7, N-14, build/sign app, sửa CI release, cấu hình electron-builder, auto-update.

---

## electron-builder (ADR 0015)
- Config: `apps/desktop/electron-builder.config.js` (khóa bằng `src/main/packaging.test.ts`).
- Icon nguồn: `apps/desktop/build/icon.svg` → build ra `icon.png`.
- Build cục bộ: `pnpm build && pnpm --filter @kiemi/desktop exec electron-builder --config electron-builder.config.js --dir --publish never` → ra `apps/desktop/release/`.
- Build chéo Windows (`--win`) từ mac được.
- `dependencies` của desktop **chỉ** gồm gói main `require()` lúc chạy — thêm thư viện runtime cho main phải đặt vào đó.
- Đóng gói mac universal: `mac.x64ArchFiles` cho prebuild `better-sqlite3`; loại `@sentry/bundler-plugins`, `oxc-parser` (chỉ dùng lúc build). Thêm dependency native → xử lý tương tự.

## Ký code / Notarize (N-14, v1.x — chưa làm)
- **Windows**: chứng chỉ OV/EV `.pfx` → secret `WIN_CSC_LINK` (base64) + `WIN_CSC_KEY_PASSWORD`. EV trên USB/HSM → Azure Trusted Signing → sửa workflow.
- **macOS**: Apple Developer (99 USD/năm): Developer ID `.p12` → `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD`, API key App Store Connect → `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
- Chưa có chứng chỉ → phát hành bản không ký (SmartScreen/Gatekeeper cảnh báo; mac chưa ký chỉ báo bản mới, không tự cập nhật được).
- Workflow đặt `MAIN_VITE_CODE_SIGNED=1` khi có chứng chỉ.

## Auto-update (ADR 0016)
- `src/main/update/` (`UpdateService`, `release-source.ts`), tRPC `updates.*`, renderer `features/update/`.
- DB sao lưu `userData/backups` trước migration (`openDatabase({ backupDir })`).
- `KIEMI_DISABLE_UPDATES=1` tắt khi chạy kiểm tra tự động.

## Báo lỗi crash (ADR 0016)
- `src/main/crash/` (`crash-reports.ts`, `scrub.ts`), cài đặt `crashReports` (mặc định tắt).
- DSN lúc build: `MAIN_VITE_SENTRY_DSN` (turbo khai báo `MAIN_VITE_*`). Tùy chọn: `SENTRY_DSN`.

## Phát hành
- Quy trình: `pnpm changeset` → `pnpm release:version` → tag `vX.Y.Z` → `.github/workflows/release.yml` (draft → build → publish).
- Workflow Release chạy lại được: job nháp tự xóa bản nháp cũ cùng tag; release đã công bố → phải tăng version.
- Tên file phát hành không có số phiên bản (link cố định `releases/latest/download/…`).
- Checklist: `docs/RELEASE-CHECKLIST.md`.
- Đổi tên app `productName: "Kiemi"`: thư mục dữ liệu `~/Library/Application Support/Kiemi` (Windows `%APPDATA%\Kiemi`).
- README: nút tải theo OS (link cố định `releases/latest/download/{Kiemi-Setup.exe, Kiemi-mac.dmg, Kiemi-Portable.exe}`).

## CI notes
- Ma trận `windows-latest` + `macos-latest`, Node theo `.nvmrc`, pnpm theo `packageManager`.
- `.gitattributes` ép LF — Biome không lỗi CRLF trên Windows.
- `CI=1 pnpm test` → timeout ×3, retry 2 (engine/recorder/desktop); e2e mặc định 30s/bước.
- Turbo `globalPassThroughEnv: ["CI"]`.
