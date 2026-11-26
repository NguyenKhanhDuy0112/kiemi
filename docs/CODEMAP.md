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
