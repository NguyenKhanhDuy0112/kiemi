# ADR 0021 — Thông báo kết quả qua webhook và email (X-03)

Ngày: 2026-11-26 · Trạng thái: chấp nhận

## Bối cảnh
Sau khi chạy xong, nhóm muốn nhận tin nhắn tóm tắt ở Teams, Slack, Google Chat, Telegram hoặc email, không phải mở app. Địa chỉ webhook, token bot và mật khẩu SMTP đều là bí mật.

## Quyết định
1. Mỗi kênh là một dòng bảng `notify_channels` (theo dự án): `kind`, `enabled`, `when` (`always` | `failed`), `config` (phần không bí mật: chat id Telegram, host/port/người gửi/người nhận SMTP) và `ciphertext` (phần bí mật: URL webhook, token bot, mật khẩu SMTP) mã hóa bằng `safeStorage` như bí mật môi trường. Không đưa vào thư mục dự án (bí mật gắn với máy, nguyên tắc 7).
2. Dựng nội dung và yêu cầu HTTP là hàm thuần ở `packages/schema/src/notify.ts` (test không cần mạng); gửi thật ở `apps/desktop/src/main/notify/send.ts` bằng `fetch` (Node), có thời hạn 10 giây, chạy sau khi run kết thúc, lỗi gửi không làm hỏng run (chỉ ghi nhận để hiện ở màn Cài đặt).
3. Email dùng **nodemailer** (~1 MB, không phụ thuộc gói khác, chuẩn thực tế cho SMTP: TLS, STARTTLS, xác thực). Tự viết SMTP bị loại vì rủi ro sai TLS/xác thực. Nodemailer chỉ nằm ở tiến trình main; không đụng engine.
4. "Link báo cáo": app chạy offline nên link là đường dẫn thư mục kết quả của run (và tên run) — không có máy chủ công khai.

## Hệ quả
- Thông báo chỉ gửi từ máy chạy app (CLI M14-07 dùng lại `send.ts`).
- Webhook gửi nội dung có tên test lỗi; không kèm ảnh, không kèm giá trị bí mật (tên test và thông báo lỗi đã che bí mật như log).
