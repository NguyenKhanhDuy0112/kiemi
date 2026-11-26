# Chạy Kiemi bằng dòng lệnh (CLI)

Dùng khi muốn chạy test **không mở giao diện**: theo giờ (Task Scheduler / cron), trên máy chủ CI, hoặc từ Terminal. Kết quả có thể xuất **JUnit XML** để Jenkins, GitLab, GitHub, Azure DevOps đọc.

## Lệnh chạy

```
kiemi run <thư-mục-dự-án> --suite "Smoke" --env "UAT" --junit ket-qua.xml
```

- `<thư-mục-dự-án>`: thư mục dự án của Kiemi (nơi có `.kiemi/project.json`, thường là thư mục Git của nhóm).
- Chọn **một** trong `--suite <tên>`, `--test <tên>`, `--tag <tag>`. Tên không phân biệt hoa thường.
- `--env <tên>`: môi trường. Bỏ qua = môi trường của suite, rồi môi trường đầu tiên.
- `--junit <file>`: ghi JUnit XML. `--results <thư mục>`: nơi lưu ảnh chụp và kết quả (mặc định: thư mục tạm).
- `--headed`: hiện cửa sổ trình duyệt (mặc định chạy ẩn). `--timeout <giây>`: thời gian chờ mỗi bước.

### Bí mật (mật khẩu, token)

Bí mật **không** nằm trong thư mục dự án. Truyền khi chạy, chỉ cho các bí mật mà môi trường đã khai tên:

```
kiemi run D:\DuAn --suite Smoke --env UAT --secret matKhau=abc123
```

hoặc đặt biến môi trường `KIEMI_SECRET_matKhau=abc123` (nên dùng ở CI: không lộ trong lịch sử lệnh).

### Mã thoát

| Mã | Ý nghĩa |
|---|---|
| 0 | Mọi test đạt |
| 1 | Có test lỗi / không đạt |
| 2 | Sai tham số, không tìm thấy thư mục dự án, suite hoặc môi trường |
| 3 | Lỗi hệ thống (ví dụ không mở được trình duyệt) |

## File `kiemi` nằm ở đâu

Đi cùng app, trong thư mục tài nguyên:

- **Windows (bản cài)**: `%LOCALAPPDATA%\Programs\Kiemi\resources\cli\kiemi.cmd`
- **macOS**: `/Applications/Kiemi.app/Contents/Resources/cli/kiemi.sh`

Chạy trực tiếp bằng đường dẫn đầy đủ, hoặc thêm thư mục đó vào `PATH`. Không cần cài Node.js. Máy cần có Chrome hoặc Edge (hoặc đã để Kiemi tải Chromium một lần).

## Hẹn giờ

Kiemi không tự cài tác vụ hệ điều hành. Lệnh `schedule` in sẵn dòng để dán:

```
kiemi schedule --at 08:30 --weekdays --name "Kiemi smoke" -- run D:\DuAn --suite Smoke --env UAT --junit D:\kq\smoke.xml
```

- Windows: in lệnh `schtasks /Create …` — dán vào Command Prompt một lần. Tác vụ chạy dưới tài khoản đang dùng, nên **máy phải đăng nhập** (hoặc chọn "Run whether user is logged on or not" trong Task Scheduler).
- macOS/Linux: in một dòng cho `crontab -e`, có ghi log vào `$HOME/kiemi-<tên>.log`.

Với bí mật, đặt biến môi trường `KIEMI_SECRET_…` ở tài khoản chạy tác vụ thay vì viết thẳng vào lệnh.

## Giới hạn hiện tại

- Thông báo kết quả (Teams, Slack, email…) cấu hình trong app chưa chạy ở CLI; dùng JUnit + công cụ CI để báo.
- CLI chỉ đọc thư mục dự án, không đụng dữ liệu của app đang mở.
