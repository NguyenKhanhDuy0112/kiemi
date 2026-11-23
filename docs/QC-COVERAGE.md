# QC-COVERAGE — Danh mục kiểm tra tổng quát của Kiemi

> Mục đích: thước đo **"Kiemi đã đủ để một QC dùng cho mọi dự án web chưa"** — không gắn với dự án hay ngành cụ thể.
> Mỗi khi thêm/đổi yêu cầu, cập nhật cột Trạng thái. Mục tiêu v1.1: không còn ô ❌ ở các dòng **P1**.

**Trạng thái:** ✅ đã có · 🟡 đã có trong SPEC Phần 2, chưa làm · ❌ chưa có
**Ưu tiên của mục đang thiếu:** P1 = v1.1 · P2 = v1.2 · P3 = v1.x (sau)

> Không công cụ nào bao quát được mọi case. Danh mục này bám theo **ISO/IEC 25010:2023** (9 đặc tính chất lượng sản phẩm) và **kỹ thuật thiết kế test ISTQB**. Phạm vi của Kiemi (UI test): mạnh ở *Phù hợp chức năng*; một phần *Bảo mật, Khả năng tương tác, Độ tin cậy, Tương thích, Hiệu năng*; ngoài phạm vi *Bảo trì, Linh hoạt, An toàn*.
> Độ phủ thực tế của từng dự án được **đo** bằng nhóm CV (SPEC Phần 2), không ước lượng bằng cảm giác.

---

## 1. Chức năng
| Loại kiểm tra | Ví dụ (mọi dự án) | Trạng thái | ID |
|---|---|---|---|
| Luồng chính (happy path) | Tạo / sửa / xóa / xem bản ghi | ✅ | A-*, B-* |
| Validate từng field | Bắt buộc, độ dài, định dạng, khoảng giá trị, ký tự, trùng lặp | 🟡 P1 | R-01 → R-05, R-10 |
| Giá trị biên & phân vùng tương đương | min−1/min/max/max+1 | 🟡 P1 | R-03 |
| Dữ liệu xấu | Khoảng trắng, emoji, Unicode, chuỗi rất dài, `<script>` | 🟡 P1 | R-04 |
| Quan hệ giữa field | Ngày kết thúc ≥ ngày bắt đầu; field B bắt buộc khi A = "Có" | 🟡 P1 | R-01, R-03 |
| Thông báo lỗi | Đúng field, đúng nội dung, focus field lỗi đầu, không xóa dữ liệu | 🟡 P1 | R-05 |
| Lưu rồi đọc lại (round-trip) | Nhập → lưu → mở lại đúng như nhập | 🟡 P1 | R-07 |
| Quy tắc nghiệp vụ / tính toán | Tổng tiền, thuế, lương, điểm, phí, chiết khấu | 🟡 P1 | P-01 → P-06 |
| Quy trình nhiều bước / nhiều vai trò | Gửi → duyệt → xác nhận | ✅ | F-01, A-16 |
| Chuyển trạng thái | Trạng thái X chỉ cho phép hành động Y | 🟡 P2 | Q-10 |
| Tìm kiếm / lọc | Mọi dòng kết quả thỏa điều kiện | 🟡 P1 | Q-01 |
| Sắp xếp | Đúng thứ tự (số, ngày, tiếng Việt có dấu) | 🟡 P1 | Q-02 |
| Phân trang | Duyệt mọi trang, tổng khớp nhãn | 🟡 P1 | Q-03 |
| Điều kiện hiển thị | Nếu có popup thì đóng; nếu A thì làm B | ✅ | D-03 |
| Data-driven | 1 test × N dòng dữ liệu | ✅ | E-03 |
| Dữ liệu lồng nhau | 1 bộ chứa nhiều dòng con | 🟡 P1 | P-01 |
| Sinh tổ hợp | Pairwise nhiều tham số | 🟡 P2 | P-08 |

## 2. Kiểm tra chéo (thao tác một nơi, kiểm tra nơi khác)
| Loại kiểm tra | Ví dụ | Trạng thái | ID |
|---|---|---|---|
| Lưu giá trị rồi dùng ở bước sau | Lấy mã đơn → tìm ở trang khác | ✅ | E-04 |
| Mở tab mới / bắt tab do thao tác mở | Bấm "Xem trước" mở tab mới → kiểm tra | ✅ (cơ bản) | A-13 |
| **Tab có tên, chuyển qua lại theo tên** | Tab "Admin", tab "Khách" | ❌ P1 | V-01 |
| **Chọn phạm vi khi mở tab**: cùng phiên / vai trò khác / trình duyệt khác | Admin sửa giá → khách (chưa đăng nhập) thấy giá mới | ⚠️ | F-01 → V-02 |
| **So sánh trực tiếp giá trị giữa 2 nơi** | Giá ở tab Khách = Giá ở tab Admin; bảng A = bảng B | ❌ P1 | V-03 |
| Chờ dữ liệu đồng bộ | Chờ tối đa 60s, tải lại mỗi 5s | ✅ | D-02 |
| **Đồng bộ realtime không tải lại** | Tab A gửi tin → tab B hiện ngay (WebSocket) | ❌ P2 | V-04 |
| **Nhiều sản phẩm trong 1 test** | Web quản trị + web khách + API, mỗi sản phẩm URL riêng theo môi trường | 🟡 P1 | O-02 |
| **So sánh giữa 2 môi trường / 2 phiên bản** | UAT vs Staging cùng dữ liệu cho kết quả giống nhau | ❌ P2 | V-06 |
| **Danh sách điểm cần kiểm tra khi dữ liệu đổi** | Đổi tên sản phẩm → kiểm tra ở chi tiết, danh sách, giỏ, báo cáo, email, API | ❌ P2 | V-07 |
| Kiểm tra ở API | UI lưu → API trả đúng | ✅ | F-03 |
| Kiểm tra ở DB | UI lưu → bảng SQL đúng | 🟡 P1 | X-05 |
| Đối chiếu 3 lớp UI = API = DB | 1 step báo lớp nào lệch | 🟡 P2 | Q-07 |
| Kiểm tra trong file tải về | Excel/PDF/CSV có giá trị đúng | 🟡 P1 | Q-04 |
| Kiểm tra trong email / OTP | Email xác nhận chứa mã đơn | 🟡 P2 | X-06 |

## 3. Dữ liệu & file
| Loại kiểm tra | Ví dụ | Trạng thái | ID |
|---|---|---|---|
| Upload file | Ảnh, tài liệu, input ẩn, kéo thả | ✅ / 🟡 | A-11, W-06 |
| Validate file upload | Sai loại, quá dung lượng | 🟡 P1 | R-01 |
| Import hàng loạt | Excel nhiều dòng, có dòng lỗi | 🟡 P1 | P-09 |
| Export / tải về | Nội dung file đúng | 🟡 P1 | Q-04 |
| In / PDF | Bắt file thay vì hộp thoại in | 🟡 P2 | W-07 |
| Định dạng số, tiền, ngày | `1.250.000 ₫`, `25/12/2026` | 🟡 P1 | P-10 |
| Logic ngày (ngày làm việc, lễ, cuối tháng) | | 🟡 P2 | P-07 |

## 4. Phân quyền, phiên & bảo mật cơ bản
| Loại kiểm tra | Ví dụ | Trạng thái | ID |
|---|---|---|---|
| Ma trận phân quyền | Vai trò × chức năng × được/không | 🟡 P1 | Q-09 |
| Truy cập URL trực tiếp khi không có quyền | | 🟡 P1 | Q-09 |
| Đăng nhập / đăng xuất / sai mật khẩu / khóa tài khoản | | ✅ | A-*, B-* |
| Session hết hạn giữa chừng | Tự đăng nhập lại | 🟡 P2 | W-08 |
| Basic / Windows (NTLM) / client cert | | 🟡 P1/P2 | W-01, W-02 |
| IDOR (đổi ID trên URL) | | 🟡 P2 | R-12 |
| XSS phản hồi, cookie Secure/HttpOnly | | 🟡 P2 | R-12 |
| Validate phía server (bỏ qua client) | | 🟡 P2 | R-06 |

## 5. Giao diện & trải nghiệm
| Loại kiểm tra | Ví dụ | Trạng thái | ID |
|---|---|---|---|
| Hiển thị / trạng thái phần tử | Hiện, ẩn, disable, checked | ✅ | B-01, B-02 |
| Text, label, placeholder, mặc định, dấu `*` | | ✅ / 🟡 | B-03, R-08 |
| Thứ tự Tab, Enter để gửi | | 🟡 P2 | R-08 |
| Responsive / mobile | Nhiều kích thước màn hình | ✅ | G-03 |
| **Vỡ bố cục** | Phần tử chồng nhau, tràn ngang | ❌ P2 | Y-09 |
| So sánh ảnh (visual regression) | | ❌ v1.x | B-14 |
| **Đa ngôn ngữ của web cần test** | Không còn chuỗi chưa dịch, định dạng theo ngôn ngữ | ❌ P2 | Y-07 |
| Giao diện sáng/tối của web cần test | | ❌ P3 | Y-08 |
| Accessibility cơ bản | Tương phản, thiếu label | 🟡 P3 | Q-06 |
| **Chỉ dùng bàn phím** | | ❌ P3 | Y-10 |
| Control phức tạp | Select2, rich text, date-range, mask, autocomplete | 🟡 P1 | W-04 |
| Grid phức tạp | Cuộn ảo, sửa inline | 🟡 P1 | W-03 |
| Popup bất chợt | Đóng tự động toàn project | 🟡 P1 | W-09 |
| Shadow DOM / web components | | 🟡 P2 | W-05 |

## 6. Hành vi hệ thống & môi trường
| Loại kiểm tra | Ví dụ | Trạng thái | ID |
|---|---|---|---|
| **Giả lập thời gian** | Đặt ngày giờ trình duyệt, tua nhanh: hết hạn, đếm ngược, khuyến mãi theo ngày | ❌ P1 | Y-01 |
| **Giả lập mạng** | Mạng chậm, mất mạng, mất rồi có lại | ❌ P2 | Y-02 |
| **Quyền trình duyệt** | Thông báo, vị trí, camera — cấp / từ chối | ❌ P2 | Y-03 |
| **Clipboard** | Nút "Sao chép" copy đúng nội dung | ❌ P2 | Y-04 |
| Vị trí địa lý, múi giờ, ngôn ngữ trình duyệt | | ❌ v1.x | G-04 |
| Gửi trùng / bấm nhanh | | 🟡 P2 | Q-08 |
| Back / Refresh sau submit, rời trang khi chưa lưu | | 🟡 P2 | R-13 |
| Lỗi API / timeout (mock) | | 🟡 P2 | X-07 |
| Lỗi JS console, request 4xx/5xx | | ✅ | F-04 |
| **Request theo dõi / analytics** | Có gửi event "purchase" với đúng tham số | ❌ P2 | Y-05 (gộp F-05) |
| **SEO / meta** | title, description, og:*, canonical, alt ảnh | ❌ P2 | Y-06 |
| Link hỏng, ảnh lỗi toàn site | | 🟡 P2 | R-11 |
| Thời gian phản hồi | | 🟡 P2 | Q-05 |
| Đa trình duyệt | Chrome, Edge (Firefox, WebKit sau) | ✅ / v1.x | G-01, G-02 |
| Môi trường được bảo vệ (Production) | | 🟡 P1 | W-10 |
| Proxy / SSH tunnel / VPN | | ✅ | G-06, G-07 |

## 7. Quy trình làm việc của QC
| Nhu cầu | Trạng thái | ID |
|---|---|---|
| Ghi thao tác, Pick phần tử, gợi ý kiểm tra | ✅ | K-*, C-06, M-01 |
| Step dùng chung, kho phần tử | ✅ | D-01, J-01 |
| Debug: breakpoint, chạy từ bước X, chạy chậm | ✅ | H-03 |
| **Sửa khi fail tại chỗ**: tạm dừng giữ trình duyệt, sửa/chèn/ghi step, chọn lại phần tử, thử lại & tiếp tục, sửa nhanh theo loại lỗi, phạm vi sửa | 🟡 P1 | FX-01 → FX-09, FX-11 |
| Sửa từ màn Kết quả (chạy lại tới step lỗi rồi dừng) | 🟡 P1 | FX-09 |
| AI đề xuất sửa dạng diff | 🟡 P2 | FX-12 |
| Import test case / đặc tả từ Excel | 🟡 P1 | X-08, R-14 |
| Case thủ công + tự động trong 1 đợt test | 🟡 P1 | T-02, T-03 |
| Test plan theo release, dashboard | 🟡 P1 | T-02 |
| Dùng chung project trong team | 🟡 P1 | T-01 |
| Báo cáo HTML / Excel / PDF / JUnit | ✅ / 🟡 | I-05, X-01, X-04 |
| Tạo bug (copy / Jira / Redmine / Azure DevOps) | 🟡 P1/P2 | X-02 |
| Thông báo kết quả (Teams/Slack/Telegram/email) | 🟡 P1 | X-03 |
| Chạy theo lịch / CLI / CI | 🟡 P1 | X-04 |
| Lịch sử phiên bản test, xu hướng, flaky | 🟡 P2 | T-05, T-07, H-06 |
| Gắn yêu cầu & độ phủ | 🟡 P2 | T-04 |
| Checklist theo loại dự án | 🟡 P2 | R-15 |
| Chat với trợ lý để thiết kế / sửa test case | 🟡 P2 | AI-13, AI-18 |
| AI gợi ý case còn thiếu (theo danh mục này, lịch sử fail, yêu cầu, UI đổi) | 🟡 P2 | AI-19 |
| AI tạo test từ mô tả / tài liệu / tự khám phá | 🟡 P2/P3 | AI-05 → AI-07 |
| AI tự sửa selector khi UI đổi | 🟡 P2 | AI-09 |
| AI phân loại nguyên nhân fail, viết bug, tóm tắt | 🟡 P2 | AI-10, AI-11 |
| Kiểm tra bằng AI (ngữ nghĩa / hình ảnh) | 🟡 P3 | AI-12 |
| Điều khiển Kiemi từ Claude Code / Claude Desktop (MCP) | 🟡 P3 | AI-14 |

## 8. Ngoài phạm vi (nói rõ với người dùng)
Load/stress test · Pentest chuyên sâu · App mobile native · App desktop · Vượt captcha (tắt captcha trên môi trường test).

## 9. Tổ chức dự án & môi trường
| Nhu cầu | Trạng thái | ID |
|---|---|---|
| Nhiều dự án trong 1 workspace | ✅ | S-01 |
| Nhiều sản phẩm trong 1 dự án (kho phần tử, step dùng chung riêng) | 🟡 P1 | O-01 |
| Ma trận Môi trường × Sản phẩm (URL, tài khoản, proxy/SSH theo ô) | 🟡 P1 | O-02 |
| Loại môi trường + màu nhận diện + bảo vệ Production | 🟡 P1 | O-03, W-10 |
| Kế thừa biến nhiều cấp, xem giá trị hiệu lực | 🟡 P1 | O-04 |
| Dữ liệu & tài khoản riêng theo môi trường | 🟡 P1 | O-05 |
| Giới hạn test theo môi trường | 🟡 P1 | O-06 |
| Thư viện dùng chung giữa các dự án | 🟡 P1 | O-07 |
| Chuyển dự án nhanh, tìm kiếm toàn workspace | 🟡 P1 | O-08 |
| Mỗi dự án 1 thư mục/repo, secret không nằm trong dự án | 🟡 P1 | O-11, T-01 |
| Chạy ma trận suite × môi trường × trình duyệt | 🟡 P2 | O-09 |
| Dashboard theo workspace / dự án / sản phẩm / môi trường | 🟡 P2 | O-10 |
| So sánh kết quả giữa 2 môi trường | 🟡 P2 | V-06 |

## 10. Đo độ phủ & chất lượng test
| Nhu cầu | Trạng thái | ID |
|---|---|---|
| Nhãn kỹ thuật thiết kế test + đặc tính ISO 25010 cho mỗi case | 🟡 P1 | CV-01 |
| Trang/màn hình chưa có test | 🟡 P1 | CV-02 |
| Phần tử tương tác chưa được test chạm tới | 🟡 P2 | CV-03 |
| Đối chiếu từng trang/form với danh mục này | 🟡 P1 | CV-04 |
| Độ phủ yêu cầu | 🟡 P2 | CV-05, T-04 |
| Độ phủ mã JS phía trình duyệt | 🟡 P3 | CV-06 |
| Lint chất lượng test (không có kiểm tra, selector yếu, thiếu cleanup…) | 🟡 P1 | CV-07 |
| Nhắc sinh thêm case lỗi/biên/phân quyền sau khi ghi | 🟡 P1 | CV-08 |
| Điểm độ phủ tổng hợp trên dashboard | 🟡 P2 | CV-09 |
