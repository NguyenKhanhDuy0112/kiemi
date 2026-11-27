# CODEMAP — Code nằm ở đâu

> Mỗi module 1 dòng. Chỉ mở file này khi chưa biết code nằm ở đâu. Cập nhật khi thêm/đổi vị trí module. Giữ dưới ~80 dòng.

## apps/desktop/src/main (Electron main — không React)
- `index.ts` → khởi động: mở DB, backfill (sản phẩm, ô môi trường), đăng ký IPC, RunManager/RecorderManager
- `api/trpc.ts` → context tRPC, map `DbError` → mã tRPC + `kiemiCode` · `api/root.ts` → gộp router
- `api/routers/data.ts` → projects, products, folders, testCases, suites, sharedSteps, elements, environments, datasets, io
- `api/routers/{runs,recorder,system,samples,updates,app}.ts` → chạy test, ghi, cài đặt/SSH test, test mẫu, cập nhật
- `run/` → `run-manager.ts` (lập kế hoạch chạy, môi trường, biến các cấp), `worker-core.ts`/`engine-worker.ts` (utility process), `protocol.ts`, `start-input.ts`, `testing.ts` (`createTestRunManager`)
- `record/` → `recorder-manager.ts` + `record-core.ts` (ghi trong engine process)
- `tunnel/` → `ssh-tunnel.ts` (SSH → SOCKS), `network.ts` (tunnel/proxy theo ô sản phẩm×môi trường), `router.ts` (SOCKS định tuyến theo host)
- `projects/` → `folder-manager.ts` (đồng bộ thư mục dự án, watcher), `locks.ts` (khóa mềm)
- `results/` → `kiemi-artifact://`, trace server · `samples/` → dự án mẫu · `update/`, `crash/`
## apps/desktop/src/renderer/src (React)
- `lib/recent-projects.ts` → ghim/gần đây dự án (O-08) · `components/command-palette.tsx` → Ctrl/⌘K toàn workspace
- `App.tsx` → khung U-01 (sidebar, thanh tiêu đề, màn hình lazy) · `lib/` → `store.ts` (điều hướng), `trpc.ts`, `tx.ts`, `errors.ts`, `environment.ts`
- `features/tests/` → cây Dự án → Sản phẩm → Thư mục → Test, suite-dialog
- `features/editor/` → bảng bước, `schema-form.tsx` (form tự sinh), `editor-tabs.tsx` (Dữ liệu/Biến/Phiên), `dataset-tree-view.tsx` (cây dữ liệu lồng), `effective-variables.tsx`, `environment-rows.tsx`
- `features/environments/` → `environments-screen.tsx` (ma trận Môi trường × Sản phẩm, biến các cấp, bí mật, proxy/SSH), `environment-badge.tsx`
- `features/run/` → `fix-step-panel.tsx` (sửa step khi run chờ, FX-02/03), `run-screen.tsx`, `run-dialog.tsx` (`useStartRun`), `run-store.ts`, `report.ts`, `confirm-protected.tsx`
- `features/editor/quality-button.tsx` → cảnh báo chất lượng test (CV-07)
- `features/test-coverage/` → màn Độ phủ (CV-01/02/04)
- `features/formulas/` → màn Công thức dùng chung theo dự án + thử từng bước (P-03)
- `features/environments/http-auth.tsx` → đăng nhập HTTP Basic/NTLM của môi trường (W-01)
- `features/manual/` → màn Case thủ công (T-03): `manual-screen.tsx`, `manual-edit.ts` (thuần, có test)
- `features/manual/import-panel.tsx` → nhập case từ Excel (X-08) · logic ở `db/src/io/manual-excel.ts`, router `routers/manual.ts`
- Phân quyền (Q-09): `schema/src/permission-matrix.ts` (ma trận + `permissionSteps`), `db/src/io/permission-excel.ts`, `main/permissions/generate-tests.ts`, router `routers/permissions.ts`; demo-site cổng nội bộ `server/portal.ts` + `portal.html`/`portal-fn.html`
- `features/permissions/` → màn Phân quyền (Q-09): `permissions-screen.tsx`, `matrix-edit.ts`
- Thông báo (X-03): `schema/src/notify.ts` (nội dung + request từng dịch vụ), `db/src/services/notify-channels.ts` (bảng mã hóa), `main/notify/send.ts` (gửi + `notifyRun`, hook `RunManagerDeps.onFinished`), UI `features/notify/` trong Cài đặt
- CLI (X-04, ADR 0022): `apps/desktop/src/cli/` — `args.ts`, `run.ts` (`execute`: thư mục dự án → DB tạm → `RunManager`), `junit.ts`, `schedule.ts`, `index.ts` (entry)
- Query DB (X-05, ADR 0023): `engine/src/db/` (`client.ts` cổng `DbClient`, `sql-safety.ts` `checkSql`/`bindPlaceholders`), action `actions/query-db.ts`, `Env.dbConnections` (schema/env.ts, cột `environments.db_connections`)
- Driver CSDL: `apps/desktop/src/main/db-query/` (`index.ts` `createDbClient` nạp lười, `sqlite|postgres|mysql|mssql.ts`), nối ở `run/worker-core.ts` (`WorkerDeps.db`); màn kết nối `features/environments/db-connections.tsx`, router `dbQuery.test`
- demo-site DB: `server/db.ts` (`DemoDb` ghi đơn nghỉ vào SQLite thật; `DemoSite.dbPath`/`SampleSite.dbPath`), mẫu L-03 #6 trong `main/samples/samples.ts` (kết nối `donNghi`)
- Dashboard theo cấp (O-10): `schema/src/dashboard.ts` (`statsOf`/`groupStats`), router `routers/dashboard.ts` (workspace→dự án→sản phẩm→môi trường), UI `features/dashboard/`
- Mẫu dự án (R-15) + nhân bản (O-12): `db/src/templates.ts` (`PROJECT_TEMPLATES`, `createProjectFromTemplate`, `cloneProject`), tRPC `projects.templates|createFromTemplate|clone`, menu ở `app-sidebar.tsx`
- Sửa dữ liệu khi chờ (FX-10): `edit.row {runCaseId, values}` → `DebugController.editRow/rowEdit` → `VariableStore.setRow`; `RunManager.rowOf/saveRow` (ghi lại bảng của test hoặc dataset đã lưu); UI `features/run/fix-row-panel.tsx`
- Kiểm tra chéo (M15-03): `engine/src/actions/{live,observe,propagate}.ts` (`markLive`+check `live`=`assertLive`, `observe`, `propagate` dùng `ctx.runAllSteps`), `RunResult.observations` → cột `run_cases.observations` (migration 24) → so sánh ở `history/compare*.ts` (`schema/src/observations.ts`); demo `chat.html`
- Môi trường trình duyệt (M15-04): `engine/src/actions/browser-env.ts` (`network`, `permission`, `clipboard`, `assertRequest`); nhật ký request ở `Runner.#requests` → `RunServices.requests`
- `features/plans/` → màn Đợt test (T-02): `plans-screen.tsx`, `plan-edit.ts` · logic tổng hợp ở `schema/src/test-plan.ts`
- `features/forms/` → màn Biểu mẫu: đặc tả field (R-01), suy từ trang/OpenAPI (`infer-panel.tsx`, R-02)
- `features/elements/` → kho phần tử + `shared-library.tsx` (thư viện workspace, O-07)
- `features/{record,history,elements,settings,onboarding,projects,update}/`
- `components/ui/` → shadcn (không sửa tay) · `components/mascot/` → Cú Kiemi
## apps/demo-site
- web mục tiêu cho e2e (`server.ts` + trang HTML); `startDemoServer()` từ `@kiemi/demo-site/server`
## packages/
- `schema/src/` → `test-case.ts` (DSL v2), `step.ts`, `locator.ts`, `env.ts` (Env, apps, loại môi trường), `product.ts`, `form-spec.ts` (FormSpec/FieldSpec), `manual-case.ts` (case thủ công T-03), `field-rules.ts` (quy tắc có sẵn + catalog thông báo), `form-cases.ts`/`form-steps.ts`/`form-matrix.ts` (sinh case + step + ma trận từ FormSpec), `migrate.ts` (migration DSL) · fixtures ở `schema/fixtures/vN/`
- `db/src/` → `tables.ts` (Drizzle), `migrations.ts` (SQL theo số), `services/*.ts` (1 service/bảng; `shared-resources.ts` = thư viện workspace), `folder/` (DB ↔ thư mục dự án: `format.ts`, `files.ts`, `snapshot.ts`, `sync.ts`), `io/` (bundle, Excel/CSV), `testing.ts` (`createMemoryServices`)
- `engine/src/` → `runner.ts` (`runTestCase`), `define-action.ts`, `actions/<type>.ts`, `assertions/`, `locator/` (cả `similar.ts`), `browser/` (launch, proxy, sessions), `vars/` (biến, `{{app}}`, các cấp), `run/` (services, debug, `protection.ts`, `popups.ts`), `e2e/` (demo-site)
- `engine/src/actions/` web thực tế (M13): `tabs.ts` (tab có tên, `openIn`), `grid.ts` + `_table.ts` (`readVirtual`), `pick-option.ts`, `clock.ts`, `upload.ts` (`via`); `browser/sessions.ts` (tên tab, trình duyệt phụ) · `engine/src/forms/` → quét/suy đặc tả form (R-02) · `recorder/src/` → `injected.ts` (script trang), `collector.ts`, `pure.ts`
- `shared/src/i18n/locales/` → `vi.ts`/`en.ts` (lỗi engine), `vi-ui.ts`/`en-ui.ts` (chuỗi UI)

## Khuôn mẫu nên làm theo
- Thêm action → copy `packages/engine/src/actions/clear-data.ts`, đăng ký ở `actions/index.ts`, chuỗi `actions.<type>` ở `shared/.../vi.ts` + `en.ts`, e2e ở `engine/src/e2e/actions.e2e.test.ts`
- Thêm cột/bảng DB → `tables.ts` + migration mới cuối `migrations.ts` (test `database.test.ts` đối chiếu); nếu là dữ liệu dự án → thêm vào `folder/format.ts`, `files.ts`, `snapshot.ts` (test round-trip `folder.test.ts`)
- Thêm tRPC → router trong `api/routers/data.ts` (input Zod), test qua `createCaller` như `api/data.test.ts`
- Thêm màn hình/khối UI → copy cấu trúc `features/environments/environments-screen.tsx` (Section + shadcn), chuỗi vào `vi-ui.ts` trước rồi `en-ui.ts`
- Thêm mã lỗi engine → `engine/src/errors.ts` + `shared/.../vi.ts`/`en.ts` + danh sách trong `shared/src/i18n/errors.test.ts`
- Tạo file khuôn → `pnpm gen action|i18n|table|router <tên>` (`scripts/gen/index.mjs`, tự vá registry/i18n/migration); xong chạy `biome check --write` file đã đụng
