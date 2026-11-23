# ARCHITECTURE — Kiemi

## Tổng quan
```
┌──────────────────────── Kiemi desktop app (Electron) ─────────────────────────┐
│                                                                                │
│  Renderer (React UI)  ── tRPC qua preload ──▶  Main process                    │
│  - sandbox, contextIsolation                   - Services: Project, Test,      │
│  - không truy cập file/DB/Node                   Run, Env, Secret, Tunnel,     │
│                                                  Browser, Update               │
│                                                - Drizzle ──▶ SQLite            │
│                                                - Artifacts ──▶ thư mục dữ liệu │
│                                                      │ MessagePort             │
│                                                      ▼                         │
│                                                Engine (utility process)        │
│                                                - packages/engine               │
│                                                - Playwright                    │
└──────────────────────────────────────────────────────┼─────────────────────────┘
                                                       ▼
                               Edge / Chrome (playwright channel, có thể qua proxy/SSH)
                                                       ▼
                                                Web cần test
```

## Các khối & ranh giới
| Khối | Vị trí | Được làm | KHÔNG được làm |
|---|---|---|---|
| Renderer | `apps/desktop/src/renderer` | Hiển thị, state UI (Zustand), gọi tRPC | Import Node/Electron/DB, giữ secret đã giải mã |
| Preload | `apps/desktop/src/preload` | Expose cầu nối electron-trpc duy nhất | Expose API tùy ý |
| Main | `apps/desktop/src/main` | Services, DB, file, secret (safeStorage), SSH tunnel (`ssh2`), phát hiện/tải trình duyệt, auto-update, khởi chạy engine | Chạy Playwright trực tiếp (để engine làm) |
| Engine | `packages/engine` (chạy trong utility process) | Nhận `RunRequest`, chạy step, phát event, ghi artifact vào thư mục được chỉ định | Import Electron, DB, React |
| Recorder | `packages/recorder` | Script nhúng vào trang khi ghi, sinh step + locator nhiều lớp | Gửi dữ liệu ra ngoài máy |
| Schema | `packages/schema` | Zod types + migration DSL, dùng chung mọi nơi | Phụ thuộc runtime nào khác |
| DB | `packages/db` (chạy trong main) | SQLite + Drizzle, migration, repository/service, nhập/xuất Excel/CSV/zip (ADR 0008) | Import Electron (keychain được truyền vào qua `SecretCipher`) |

## Luồng chạy test
1. Renderer gọi `run.start({ testId | suiteId, envId, options })`.
2. Main: tạo `Run` (DB) → nạp TestCase, Dataset, Env → giải mã Secret → mở SSH tunnel nếu môi trường cấu hình → chọn trình duyệt → gửi `RunRequest` sang engine qua MessagePort.
3. Engine: tạo browser context cho mỗi `session` → chạy từng step (resolve biến → resolve locator → execute → assert) → phát event `runStart | stepStart | stepEnd | log | artifact | runEnd`.
4. Main: ghi `RunStep`/`Artifact` vào DB, chuyển tiếp event qua tRPC subscription.
5. Renderer: cập nhật màn Đang chạy theo realtime; xong → màn Kết quả.
6. Main: đóng tunnel, dọn tiến trình. Engine crash → Run đánh dấu `error`, app vẫn chạy.

## Luồng ghi thao tác (Recorder)
1. Renderer gọi `recorder.start({ testCaseId, url | afterStepId, loginName?, mode })` (ADR 0013).
2. Main (`RecorderManager`) tạo engine utility process, gửi `record`: mở trình duyệt hiện cửa sổ; nếu ghi chèn từ bước X / bắt đầu với đăng nhập đã lưu thì engine chạy các bước trước rồi giữ phiên (`stopAfterStepId` + `keepSessions`).
3. `packages/recorder` nhúng script vào mọi trang/iframe, bắt thao tác → step + locator nhiều lớp + fingerprint → binding → worker → main → renderer chèn vào bảng step (một lần Hoàn tác bỏ cả bản ghi).
4. Thanh công cụ nổi trong trang (Thêm kiểm tra, Lưu giá trị, Lưu đăng nhập, Dừng) và gợi ý kiểm tra (✓) đi cùng đường. Pick/Highlight từ editor dùng phiên đang ghi hoặc mở phiên chỉ-chọn (`mode: inspect`).
5. Đăng nhập lưu từ trang/bước được main mã hóa vào DB; cookie không bao giờ tới renderer.

## Dữ liệu
- **Thư mục dự án** (ADR 0018, T-01/O-11): mỗi dự án = 1 thư mục (`.kiemi/` + `tests/**/*.kiemi.json`), là nguồn chính để dùng chung qua Git/thư mục mạng. Lớp `packages/db/src/folder/` đồng bộ ba chiều DB ↔ file (base = hash lần đồng bộ cuối). Secret chỉ có tên trong thư mục.
- DB: SQLite trong thư mục dữ liệu app (`app.getPath('userData')/kiemi.db`) — index/cache của thư mục dự án + dữ liệu chỉ thuộc máy (lịch sử chạy, giá trị secret, đăng nhập đã lưu, cài đặt). Schema theo SPEC Phụ lục 2.
- Artifacts: `userData/runs/<runId>/` (ảnh, video, trace).
- Secret: chỉ lưu bản mã hóa bằng `safeStorage`; giải mã ở main, truyền cho engine trong bộ nhớ, không ghi ra đĩa, che trong log/ảnh.
- Xuất/Nhập: `.kiemi.json` (1 test) / `.zip` (project + data).

## Mở rộng sau này (không làm ở v1)
- `apps/cli`: dùng lại `packages/engine` để chạy trên CI / theo lịch.
- Cloud sync: server NestJS + Postgres, cùng schema Drizzle; DB đã có UUIDv7, workspaceId, updatedAt, deletedAt, version.
- Runner cloud: container chạy `packages/engine`.
