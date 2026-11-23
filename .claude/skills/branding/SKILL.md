# Skill: Branding & UI

**Tải skill này khi:** làm UI mới, thiết kế icon/linh vật, viết copy marketing, chọn màu/bo góc, thêm màn hình shadcn.

---

## Thương hiệu
- Tên: **Kiemi** (từ "kiểm"). Package scope: `@kiemi/*`. File test: `.kiemi.json`. App ID: `app.kiemi.desktop`.
- Slogan (tiếng Anh, dùng mọi ngôn ngữ): *"Let Kiemi do the checking."*
- Màu chủ: chàm đậm `#1F2A5C` · pass `#3DDC84` · fail `#E5484D` · trắng.
- Linh vật: **Cú Kiemi** — cú tròn màu chàm, mắt to, bụng/mỏ là **dấu tick xanh lá** (SPEC U-16). Code: `components/mascot/`.
- Icon app: ô vuông bo góc nền chàm có Cú Kiemi. Phải nhận diện ở 16px. Nguồn: `apps/desktop/build/icon.svg`.

## Làm UI nhanh — dùng đồ có sẵn
- **Component**: `pnpm dlx shadcn@latest add <tên>` trong `apps/desktop` (button, input, dialog, dropdown-menu, command, table, tabs, sonner, tooltip, sheet…).
- **Bố cục màn hình**: dùng **shadcn Blocks** (vd `sidebar-07` cho layout 3 vùng U-01) rồi chỉnh token màu trong `styles.css`.
- **Bảng**: TanStack Table theo mẫu "Data Table" của shadcn. Icon: Lucide. Toast: sonner. Command palette: `command` (cmdk).
- Chỉ tự viết component khi shadcn không có; không thêm UI kit khác (MUI, Ant…).
- Demo-site (`apps/demo-site`) là web mục tiêu để test, không cần đẹp — HTML/CSS thuần.

## UI cho người không biết code
- Không hardcode chuỗi — dùng i18n (thêm key vào `packages/shared/src/i18n/locales/vi-ui.ts` trước, rồi `en-ui.ts`).
- Không hiện thuật ngữ kỹ thuật (selector, CSS, Playwright) trừ chế độ "Nâng cao".
- Lỗi phải nói bằng tiếng Việt dễ hiểu: *"Bước 5: Không tìm thấy nút 'Lưu' sau 10 giây"*.
- Token: bo góc 10/16px, nền trạng thái pastel `bg-{pass,fail,warning,info}-soft`. Chữ trạng thái dùng `text-pass-text`, `text-fail-text`, `text-warning-text` (không dùng `text-pass` trực tiếp trên nền sáng — AA fails).
- Chuyển động: `motion.css` phủ mọi animation. Mọi animation phải respect `prefers-reduced-motion` + setting `reduceMotion` DB.

## Màn hình tuân thủ
Mọi màn hình phải tuân thủ mục **U** trong `docs/SPEC.md` (U-01 → U-15). Trước khi làm màn hình mới, tra: `node scripts/spec-lookup.mjs U-01 U-06 U-16`.
