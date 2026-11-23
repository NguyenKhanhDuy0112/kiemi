# CLAUDE.md — Kiemi (No-code UI Test Automation)

> File này được Claude Code tự đọc mỗi phiên. Đây là luật của dự án — tuân thủ tuyệt đối.
> Skills: `.claude/skills/branding/SKILL.md` (UI/icon/màu — tải khi làm màn hình mới) · `.claude/skills/release/SKILL.md` (build/sign/CI release — tải khi làm M7/N-14)

## 1. Sản phẩm
Desktop app (Windows + macOS) cho **tester không biết code**: ghi thao tác hoặc soạn bảng step → bấm Chạy → xem kết quả. Offline, không cần tài khoản.
Docs: `docs/SPEC.md` (yêu cầu + ID), `docs/ROADMAP.md` (task), `docs/PROGRESS.md` (tiến độ), `docs/ARCHITECTURE.md`, `docs/adr/`.

## 2. Quy trình mỗi phiên (BẮT BUỘC)
1. Đọc `docs/PROGRESS.md` → mục **"Tiếp theo"**, **"Lưu ý cho task sau"**, **"Vấn đề tồn đọng"**. Tra các ID SPEC của task bằng `node scripts/spec-lookup.mjs <ID>...` (xem §8).
2. **Mỗi phiên (chat) làm 1 task** trong ROADMAP (vd M9-08). Không làm task kế, không làm ngoài phạm vi ROADMAP.
   - Task ước lượng > ~400 dòng thay đổi hoặc > 8 file → dừng, đề xuất chia nhỏ (M9-08a, M9-08b…) trước khi code.
   - Phải dừng giữa chừng → dừng ở điểm ổn định, commit, ghi phần còn lại vào PROGRESS mục **"Đang làm dở"**.
3. Trước mỗi task: nêu kế hoạch ngắn (file tạo/sửa, cách test).
4. **Trong lúc code**: viết kèm test (unit/e2e) của task; chỉ chạy test liên quan (§8). Trước khi commit chạy **1 lần** `pnpm lint && pnpm typecheck && pnpm test` (phải pass hết).
   **Task cuối của milestone** → thêm kiểm tra luồng chính trên app thật (build, `_electron.launch`) nếu milestone có UI. Sửa lỗi tìm được (commit `fix(...)`).
5. Cập nhật:
   - `docs/ROADMAP.md`: tick `[x]` task đã xong
   - `docs/PROGRESS.md`: thêm dòng nhật ký, cập nhật "Tiếp theo", **ghi đè "Lưu ý cho task sau"**, ghi vấn đề tồn đọng
   - Tạo/đổi vị trí module → cập nhật `docs/CODEMAP.md`
   - Có quyết định kiến trúc mới → thêm file `docs/adr/NNNN-ten.md`
6. Commit theo Conventional Commits, kèm ID: `feat(engine): add fill action [A-02]`
   - **Tác giả commit = chủ dự án**: `Duy Nguyen Khanh <duynguyen.011202@gmail.com>` (đã đặt trong `git config` của repo). Trước khi commit, kiểm tra `git config user.email` đúng email này.
   - **Không thêm** dòng `Co-Authored-By: Claude …` hay bất kỳ attribution AI nào vào commit/PR.
   - Mỗi task 1 commit. **Mỗi milestone làm trên nhánh riêng** (vd `m9`); push sau mỗi task commit. Cuối milestone mở PR từ `m9` → `main`. Chưa có remote `origin` → nhắc người dùng cung cấp URL repo, không tự tạo repo.
   - Không `push --force` lên `main`.
7. Nếu người dùng chỉ nói "làm tiếp" / "continue" → làm task trong mục "Tiếp theo" (hoặc mục "Đang làm dở" nếu có).
8. **Kết thúc phiên**: sau khi commit (và push nếu là task cuối milestone), DỪNG — không tự làm task kế. Báo ngắn gọn (≤ 10 dòng): đã xong gì, kết quả test, task tiếp theo, và nhắc người dùng `/clear` (hoặc mở chat mới) rồi gõ `Làm tiếp.`
9. Chạy tự động không cần mở chat: xem `START-PROMPT.md` (vòng lặp `claude -p "Làm tiếp."`, mỗi lần = 1 phiên mới = 1 task).

## 2b. Quy trình thay đổi yêu cầu (BẮT BUỘC)
Khi người dùng đưa yêu cầu mới / muốn sửa / bỏ một yêu cầu (vd "thêm tính năng X", "đổi Y", "bỏ Z"):

1. **Đề xuất, chưa sửa gì**. Trình bày ngắn gọn:
   - Yêu cầu viết lại rõ ràng + **ID mới** (theo mục phù hợp trong SPEC, vd `B-15`) hoặc ID bị sửa/bỏ
   - Ưu tiên đề xuất (v1 / v1.x) + **tiêu chí chấp nhận** (kiểm tra được)
   - **Ảnh hưởng**: yêu cầu nào liên quan/xung đột, task ROADMAP thêm/sửa, có đụng schema DSL (cần migration) hay DB không, có cần ADR không
   - Ước lượng độ lớn: S / M / L
2. **Chờ người dùng chốt** ("chốt", "ok", "đồng ý"). Nếu người dùng sửa → đề xuất lại.
   - Ngoại lệ: người dùng nói rõ "chốt luôn" / "làm luôn" ngay trong yêu cầu → bỏ qua bước chờ.
3. **Sau khi chốt**, cập nhật tài liệu trước, code sau:
   - `docs/SPEC.md`: thêm/sửa/bỏ dòng yêu cầu (bỏ thì gạch ngang `~~…~~` + ghi "Bỏ ngày …", không xóa ID — ID không bao giờ dùng lại)
   - `docs/SPEC.md` mục **Lịch sử thay đổi**: thêm 1 dòng
   - `docs/ROADMAP.md`: thêm/sửa task, đặt đúng milestone theo phụ thuộc
   - `docs/ARCHITECTURE.md` / `docs/adr/` nếu kiến trúc thay đổi
   - `docs/PROGRESS.md`: cập nhật "Tiếp theo" nếu thứ tự ưu tiên đổi
   - Commit riêng: `docs(spec): add B-15 <mô tả>`
4. **Hỏi làm ngay hay xếp hàng**: nếu người dùng muốn làm ngay → làm theo Quy trình mỗi phiên (mục 2) với task mới. Nếu không → để trong ROADMAP.
5. Không bao giờ code một tính năng **chưa có trong SPEC**. Nếu trong lúc code phát hiện cần thêm yêu cầu → dừng, đề xuất theo bước 1.

## 3. Stack (đã chốt — không tự ý thay)
| Phần | Công nghệ |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Ngôn ngữ | TypeScript `strict: true` |
| Lint/format | Biome |
| Desktop | Electron + electron-vite |
| UI | React 19, Tailwind CSS, shadcn/ui, TanStack Table, dnd-kit, Zustand |
| IPC | electron-trpc (type-safe, input validate bằng Zod) |
| DB | SQLite (better-sqlite3) + Drizzle ORM |
| Engine | playwright-core (channel `msedge` / `chrome`, fallback tải Chromium) |
| Schema | Zod (xuất JSON Schema) |
| Excel | exceljs |
| Dữ liệu giả | @faker-js/faker (locale vi) |
| Ngày giờ | date-fns |
| ID | UUIDv7 (`uuid` package) |
| i18n | i18next (vi mặc định, en) |
| Test | Vitest (unit), Playwright Test (e2e engine trên demo-site) |
| Đóng gói | electron-builder + electron-updater |
| Crash report | Sentry (opt-in) |

## 4. Cấu trúc thư mục
```
apps/
  desktop/        # Electron: main/, preload/, renderer/ (React)
  demo-site/      # Web mô phỏng ca khó để test engine (iframe, WebForms postback, popup, bảng, đồng bộ trễ, nhiều vai trò)
packages/
  schema/         # Zod: TestCase, Step, Locator, Dataset, Env, RunResult + migrations DSL
  db/             # SQLite + Drizzle: bảng, migration, service, nhập/xuất (ADR 0008). KHÔNG import electron
  engine/         # Dịch step → Playwright. KHÔNG import electron/DB/React
  recorder/       # Script bắt thao tác + Pick phần tử
  shared/         # util dùng chung (i18n keys, error codes)
docs/
```

## 5. Nguyên tắc bất biến
1. **Step DSL có version**: định nghĩa trong `packages/schema`. Mọi test file có `schemaVersion`. Đổi schema = tăng version + viết migration + test migration với fixture của mọi version cũ.
2. **Engine độc lập**: input `TestCase + Dataset + Env + Secrets` → output `RunResult` + stream event. Chạy trong Electron utility process (crash không kéo sập app). Dùng chung cho desktop và CLI sau này.
3. **Action = plugin**: `defineAction({ type, params: zodSchema, ui: { label, icon, group }, execute })`. UI tự sinh form từ `params` + `ui`. Thêm action = 1 file + unit test + e2e trên demo-site.
4. **Locator nhiều lớp**: mỗi phần tử lưu mảng `strategies` theo ưu tiên (role+name → label → placeholder → text → testId → css → xpath) + `fingerprint` (text, tag, attributes, vị trí) để self-heal sau này.
5. **Nhiều phiên từ đầu**: mỗi step có `session` (mặc định `"default"`); mỗi session = 1 browser context riêng.
6. **DB**: mọi bảng có `id` (UUIDv7), `workspaceId`, `createdAt`, `updatedAt`, `deletedAt` (soft delete), `version`.
7. **Bảo mật Electron**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Renderer chỉ gọi main qua electron-trpc. Secret lưu bằng `safeStorage`. Che secret trong log, kết quả, ảnh chụp.
8. **UI đẹp, đơn giản, dễ dùng**: mọi màn hình tuân thủ mục **U** trong `docs/SPEC.md`. Trước khi làm màn hình mới, tải skill `branding` (`.claude/skills/branding/SKILL.md`).
9. **Không thêm dependency lớn** khi chưa ghi lý do vào ADR.

## 6. Definition of Done
- Đáp ứng tiêu chí chấp nhận của các ID SPEC liên quan
- Có test: unit cho schema/engine; e2e trên demo-site cho mỗi action/assertion mới
- `lint`, `typecheck`, `test` pass
- Chuỗi UI có đủ `vi` + `en`
- ROADMAP + PROGRESS đã cập nhật, đã commit

## 7. Quy ước
- Code, tên biến, commit message: **tiếng Anh**. UI, docs: **tiếng Việt**.
- Tên file: kebab-case. Component React: PascalCase.
- Không để `any`, không `// @ts-ignore` khi chưa ghi lý do.
- Mỗi action engine nằm ở `packages/engine/src/actions/<type>.ts`.

## 8. Tiết kiệm token (BẮT BUỘC)

### Đọc tài liệu
- KHÔNG đọc toàn bộ `docs/SPEC.md`, `docs/proposals/*`, `docs/QC-COVERAGE.md`. Chỉ tra đúng ID của task:
  `node scripts/spec-lookup.mjs <ID> [ID...]`  (vd `node scripts/spec-lookup.mjs M9-08 O-06`)
- `docs/PROGRESS.md`: chỉ đọc mục **Tiếp theo**, **Lưu ý cho task sau** và **Vấn đề tồn đọng**. Nhật ký cũ hơn 2 tuần chuyển sang `docs/progress-archive.md`.
- `docs/CODEMAP.md`: chỉ mở khi chưa biết code nằm ở đâu.
- `docs/ARCHITECTURE.md` / ADR: chỉ đọc khi task đụng tới ranh giới giữa các khối.

### Phạm vi mỗi phiên
- **1 task / phiên** (§2). Không đọc file "cho chắc": tìm có mục tiêu (`rg`, go-to-definition) trước, chỉ mở file cần sửa.

### Chạy test
- Trong lúc làm: chỉ chạy test liên quan: `pnpm vitest run <đường-dẫn-hoặc-tên>` / `pnpm --filter <package> test`.
- Toàn bộ `pnpm lint && pnpm typecheck && pnpm test` chỉ chạy **1 lần cuối** trước khi commit.
- E2E engine trên demo-site: chỉ chạy spec của action/tính năng vừa làm, không chạy cả bộ.
- Hook `.claude/hooks/filter-test-output.sh` tự lọc output của lệnh `pnpm test|vitest|…` (chỉ trả phần lỗi + tóm tắt; log đầy đủ ở `$TMPDIR/kiemi-test.log`). Kết quả test dài → giao cho subagent chạy và chỉ trả về tóm tắt lỗi.

### Viết code
- Code lặp khuôn (action mới, file i18n, bảng DB, tRPC router) → dùng generator `pnpm gen <loại> <tên>` (nếu chưa có thì tạo ở task riêng), không viết tay từng file.
- Không in lại cả file khi chỉ sửa vài dòng. Không thêm log/giải thích dài vào chat; tóm tắt cuối task ≤ 10 dòng.

### Bàn giao giữa các phiên
Claude Code không nhớ gì giữa các phiên — kiến thức chỉ đi tiếp qua file.
- Cuối mỗi task, **ghi đè** mục "Lưu ý cho task sau" trong `docs/PROGRESS.md` (≤ 3 dòng): file/thư mục chính đã đụng, khuôn mẫu nên làm theo, cạm bẫy đã gặp.
- Tạo module/thư mục mới hoặc đổi vị trí code → cập nhật `docs/CODEMAP.md` (mỗi module 1 dòng). Giữ file dưới ~80 dòng.
- Làm việc giống task trước (thêm action, màn hình, bảng) → mở **1 file mẫu** cùng loại (theo CODEMAP) và làm theo, không khám phá lại.

### Compact
Khi compact, giữ lại: ID task đang làm, file đã sửa, test đang fail và lý do, quyết định đã chốt. Bỏ: nội dung file đã đọc, output test đã pass.
