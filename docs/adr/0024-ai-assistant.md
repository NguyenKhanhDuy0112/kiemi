# ADR 0024 — Trợ lý AI (AI-01…AI-21)

Ngày: 2026-11-27 · Trạng thái: chấp nhận

## Bối cảnh
Tester muốn AI giúp thiết kế test, phân loại lỗi, đề xuất sửa. Kiemi chạy offline, không tài khoản; AI phải là tùy chọn, không đưa dữ liệu ra ngoài khi chưa được phép, và không bao giờ tự thay đổi dữ liệu.

## Quyết định
1. **`packages/ai`** chỉ chạy ở main process (không import electron/React/DB). Giao diện duy nhất cho tính năng: `AiProvider.complete(request) → {text, model, usage}`. Ba adapter: Claude (`/v1/messages`), OpenAI-compatible (`/chat/completions`, kể cả máy chủ cục bộ), Ollama (`/api/chat`). Đổi provider không sửa tính năng (AI-01).
2. **Không thêm thư viện**: dùng `fetch` có sẵn của Node; adapter nhận `fetch` để test không cần mạng.
3. **Khóa API là bí mật**: mã hóa bằng `safeStorage` như kênh thông báo (ADR 0021); không xuất ra renderer, không vào thư mục dự án, lỗi không bao giờ chứa khóa.
4. **Tắt mặc định, bật theo dự án**; chọn model theo tác vụ (`taskModels`); `isLocal(config)` để dự án khóa "chỉ model local" (AI-02).
5. **Mọi kết quả qua duyệt** (AI-03, AI-21): AI chỉ trả đề xuất; việc lưu/xóa/chạy do người dùng bấm. Sẽ làm ở M16-02.

## Hệ quả
- Lỗi chuẩn hóa `AI_AUTH | AI_RATE_LIMIT | AI_NETWORK | AI_HTTP | AI_BAD_RESPONSE`.
- Chưa có streaming (trả về cả câu); thêm khi làm panel chat nếu cần.
