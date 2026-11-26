# Prompt dùng với Claude Code

> Nguyên tắc: **1 chat = 1 milestone** (CLAUDE.md §2, §8). Claude tự làm lần lượt các task (mỗi task 1 commit), hết milestone thì test cả milestone + push + mở PR rồi dừng. Task mới bắt đầu bằng chat mới để không tốn token cho lịch sử cũ.

## Cách 1 — Thủ công (khuyên dùng)
Trong VS Code (Claude Code):
```
/clear
Làm tiếp.
```
`/clear` xóa lịch sử chat hiện tại (tương đương mở chat mới). Claude tự đọc `CLAUDE.md` + `docs/PROGRESS.md` để biết làm task nào.

## Cách 2 — Tự động N task liên tiếp (mỗi task 1 phiên mới)
Chạy trong terminal tại thư mục dự án:
```bash
# Làm tối đa 5 task, mỗi lần là 1 phiên Claude riêng; dừng nếu một lần bị lỗi
for i in 1 2 3 4 5; do
  claude -p "Làm tiếp." --permission-mode acceptEdits || break
done
```
Lưu ý:
- `-p` chạy không tương tác: lệnh nào cần quyền mà chưa được cho phép sẽ bị từ chối → Claude dừng và ghi lý do vào `docs/PROGRESS.md`. Muốn ít bị chặn: thêm các lệnh hay dùng (`pnpm *`, `git add/commit/push`) vào `.claude/settings.json` (gõ `/fewer-permission-prompts` để Claude gợi ý).
- Task cần bạn quyết định (vd M7-02 chứng chỉ ký code) → Claude ghi câu hỏi vào mục "Vấn đề tồn đọng" và dừng; vòng lặp nên dừng ở đó.
- Xem kết quả: `git log --oneline` và `docs/PROGRESS.md`.

## Làm task cụ thể
```
/clear
Làm task M1-03.
```

## Thêm / sửa / bỏ yêu cầu
```
Yêu cầu mới: <mô tả>.
```
→ Claude đề xuất (ID, ưu tiên, tiêu chí chấp nhận, ảnh hưởng). Bạn trả lời:
```
Chốt.            (cập nhật SPEC/ROADMAP, chưa code)
Chốt, làm luôn.  (cập nhật tài liệu rồi code ngay)
```
Muốn bỏ qua bước đề xuất:
```
Yêu cầu mới: <mô tả>. Chốt luôn, làm luôn.
```

## Kiểm tra tiến độ
```
Tóm tắt tiến độ theo ROADMAP: đã xong gì, còn gì, có vấn đề gì.
```
