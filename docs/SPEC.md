# SPEC — Kiemi (No-code UI Test Automation)

Ưu tiên: **v1** = bản phát hành đầu tiên · **v1.1** / **v1.2** = sẵn sàng cho dự án thật (Phần 2) · **v1.x** = bổ sung sau.
Mỗi yêu cầu có ID để ROADMAP, commit và test tham chiếu.

---

## 0. Mục tiêu & yêu cầu phi chức năng
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| N-01 | Người mới cài app → chạy được test đầu tiên trong **≤ 5 phút** | v1 |
| N-02 | Chạy offline hoàn toàn, không cần tài khoản | v1 |
| N-03 | Không bắt cài thêm phần mềm: dùng Edge/Chrome có sẵn; không có thì tự tải Chromium (có thanh tiến trình) | v1 |
| N-04 | Windows 10+ và macOS 12+ | v1 |
| N-05 | App mở trong ≤ 3 giây; UI không đứng khi đang chạy test (engine chạy tiến trình riêng) | v1 |
| N-06 | Toàn bộ UI tiếng Việt (có tiếng Anh); lỗi giải thích bằng ngôn ngữ người không biết code | v1 |
| N-07 | Secret (mật khẩu, token) mã hóa bằng keychain hệ điều hành, không lộ trong log/ảnh/báo cáo | v1 |
| N-08 | Test file có `schemaVersion`; file cũ luôn mở và chạy được trên app mới | v1 |
| N-09 | Tự cập nhật app; báo lỗi crash (opt-in) | v1 |
| N-11 | **Phát hành tự động**: push tag `vX.Y.Z` → GitHub Actions build Win/Mac/portable, ký code **khi có chứng chỉ** (v1 phát hành chưa ký — xem N-14), upload lên GitHub Releases (repo public `kiemi-releases` nếu repo code private) | v1 |
| N-12 | **Tự cập nhật không cần tải lại**: kiểm tra khi mở app, tải ngầm, hiện "Có gì mới" + nút "Khởi động lại để cập nhật"; dữ liệu giữ nguyên; DB migration tự chạy khi mở bản mới. Bản portable **và bản macOS chưa ký**: chỉ thông báo có bản mới + nút "Tải bản mới" (cài đè, dữ liệu giữ nguyên) | v1 |
| N-13 | **Không cần cài thêm gì**: không cần quyền admin (cài per-user), không cần Node/Playwright/tài khoản; trình duyệt dùng Edge/Chrome có sẵn hoặc tự tải 1 lần | v1 |
| N-14 | **Ký code**: Windows (chứng chỉ OV/EV hoặc Azure Trusted Signing) + macOS (Developer ID + notarize) → không còn cảnh báo SmartScreen/Gatekeeper; bản macOS tự cập nhật như Windows. Tiêu chí: cài trên máy sạch không có cảnh báo; mac cập nhật bằng "Khởi động lại để cập nhật" | v1.x |
| N-10 | Có bản **portable** cho Windows (1 file .exe, không cần cài, không cần quyền admin) để chạy trực tiếp trên máy/server chỉ truy cập được qua RDP | v1 |

---

## 1. Màn hình
| ID | Màn hình | Nội dung | Ưu tiên |
|---|---|---|---|
| S-01 | Trang chủ / Danh sách | Project → Thư mục → Test case / Suite; tạo, sửa, xóa, nhân bản, tìm kiếm, tag | v1 |
| S-02 | Soạn test | Nút Ghi lại; bảng step (thêm, sửa, xóa, kéo thả, tắt/bật step); panel thuộc tính step; tab Dữ liệu, Biến | v1 |
| S-03 | Chạy test | Trình duyệt chạy thật; panel tiến độ từng step realtime; nút Dừng / Tạm dừng / Bước tiếp | v1 |
| S-04 | Kết quả | Pass/fail từng step, thời gian, ảnh chụp, video, trace; nút Xuất báo cáo | v1 |
| S-05 | Lịch sử chạy | Danh sách các lần chạy, lọc theo test/suite/trạng thái, so sánh 2 lần chạy | v1 |
| S-06 | Môi trường & Secret | Khai báo môi trường (UAT, Staging…) với baseURL, biến, tài khoản | v1 |
| S-07 | Cài đặt | Ngôn ngữ, trình duyệt mặc định, timeout mặc định, thư mục lưu kết quả | v1 |
| S-08 | Onboarding | Lần mở đầu: nhập URL → Ghi lại → Chạy; kèm test mẫu | v1 |

---

## U. Nguyên tắc giao diện (áp dụng cho MỌI màn hình)
| ID | Nguyên tắc | Ưu tiên |
|---|---|---|
| U-01 | **Bố cục 3 vùng**: sidebar trái (Test, Lịch sử, Môi trường, Phần tử, Cài đặt) · vùng chính · panel chi tiết bên phải (ẩn/hiện được) | v1 |
| U-02 | **Mỗi màn hình 1 hành động chính** nổi bật (Ghi lại / Chạy / Lưu), các hành động phụ nhẹ hơn hoặc nằm trong menu "…" | v1 |
| U-03 | **Step đọc như câu tiếng Việt**: `Bấm vào [nút Lưu]`, `Nhập [Mã NV] = 003609`, `Kiểm tra [thông báo] chứa "Thành công"` — phần tử và giá trị hiển thị dạng chip bấm được | v1 |
| U-04 | **Ẩn dần độ phức tạp**: mặc định chỉ hiện ô cần thiết; tùy chọn nâng cao (timeout, selector, retry) nằm trong mục "Nâng cao" thu gọn | v1 |
| U-05 | **Không thuật ngữ kỹ thuật** ở chế độ thường (không selector, CSS, XPath, Playwright, DOM) | v1 |
| U-06 | **Trạng thái rỗng có hướng dẫn**: màn hình trống luôn có minh họa (**linh vật Cú Kiemi**, U-16) + 1 câu giải thích + nút hành động ("Chưa có test nào — Ghi test đầu tiên") | v1 |
| U-07 | **Màu theo ý nghĩa, nhất quán**: xanh lá = pass, đỏ = fail, chàm = đang chạy/chính, vàng = cảnh báo/flaky, xám = bỏ qua. Luôn kèm icon/chữ, không chỉ dựa vào màu | v1 |
| U-08 | **Undo thay cho hộp thoại xác nhận**: xóa → toast "Đã xóa · Hoàn tác" (trừ thao tác không hoàn tác được) | v1 |
| U-09 | **Phản hồi tức thì**: mọi thao tác có phản hồi < 100ms (loading skeleton, trạng thái nút); không màn hình đứng | v1 |
| U-10 | **Phím tắt + Command palette** (Ctrl/Cmd+K): tìm test, chạy, tạo mới; phím tắt hiện trong tooltip | v1 |
| U-11 | **Sáng / Tối / Theo hệ thống** | v1 |
| U-12 | **Design tokens**: font *Be Vietnam Pro* (hiển thị dấu tiếng Việt đẹp), lưới 8px, bo góc **10px (control) / 16px (card)**, nút chính bo tròn hơn, nền trạng thái **pastel nhạt** (chữ/icon trạng thái vẫn đạt AA, U-13), viền mảnh, không gradient/bóng đổ nặng; icon Lucide (đi kèm shadcn/ui) | v1 |
| U-13 | **Khả năng tiếp cận**: tương phản WCAG AA, điều khiển được bằng bàn phím, focus ring rõ, cỡ chữ tối thiểu 13px | v1 |
| U-14 | **Hướng dẫn tại chỗ**: tooltip giải thích ngắn cho từng hành động; tour 3 bước ở lần đầu | v1 |
| U-16 | **Linh vật "Cú Kiemi"**: cú tròn màu chàm, mắt to, bụng/mỏ là dấu tick xanh lá. Xuất hiện ở: icon app, hộp thoại chào mừng, màn hình trống, kết quả chạy (biểu cảm **vui** khi Đạt, **lo lắng** khi Không đạt, **chăm chú** khi đang chạy, **bình thường**). **Không** đặt trong bảng bước / form. Tiêu chí: icon nhận diện được ở 16px; 4 biểu cảm; đẹp ở cả sáng/tối; minh họa không thay chữ (luôn có câu giải thích, `aria-hidden`); vẽ SVG nội tuyến, không làm chậm khởi động (N-05) | v1.x |
| U-17 | **Chuyển động mượt**: chuyển màn (mờ + trượt nhẹ), thêm/xóa bước, mở/đóng panel, bước đang chạy có viền "thở", icon Đạt/Không đạt nảy nhẹ, thanh tiến độ mượt, nút lún khi bấm, skeleton lấp lánh; linh vật chớp mắt / nhún (Đạt) / lắc đầu (Không đạt) / nghiêng đầu (đang chạy). Tiêu chí: 150–300ms (linh vật ≤ 600ms), chỉ `transform`/`opacity` (60 khung hình/giây, kể cả test 200 bước — N-05); tôn trọng "Giảm chuyển động" của hệ điều hành + công tắc **Giảm chuyển động** trong Cài đặt; không chuyển động nào bắt người dùng chờ. Chỉ CSS + `tw-animate-css` + View Transitions API, không thêm thư viện | v1.x |
| U-18 | **Màn hình khởi động (splash)** mỗi lần mở app: nền chàm, Cú Kiemi mở mắt + vẫy cánh, dấu tick tự vẽ, slogan, thanh tiến độ mảnh; mờ dần vào màn hình chính. **Lần mở đầu tiên**: cú bay vào chào rồi nối sang hộp thoại chào mừng. Tiêu chí: hiện < 300ms (HTML/CSS thuần, nạp trước React); tắt khi app sẵn sàng nhưng hiện **tối thiểu ~1,8s** để xem trọn hiệu ứng mở đầu, không làm chậm khởi động (N-05); bản tĩnh khi Giảm chuyển động; đẹp ở sáng/tối | v1.x |
| U-15 | **Kiểm tra cảm nhận**: người chưa từng dùng phải tạo + chạy được test đầu tiên mà không cần hỏi ai (đo bằng N-01) | v1 |

---

## A. Hành động (Actions)
| ID | Hành động | Ghi chú | Ưu tiên |
|---|---|---|---|
| A-01 | Mở URL | Hỗ trợ đường dẫn tương đối theo baseURL của môi trường | v1 |
| A-02 | Nhập | Ô text, textarea, contenteditable; tùy chọn xóa trước khi nhập | v1 |
| A-03 | Xóa nội dung ô | | v1 |
| A-04 | Bấm / Bấm đúp / Bấm chuột phải | | v1 |
| A-05 | Hover | | v1 |
| A-06 | Chọn dropdown | `<select>` và dropdown tự làm (div/li); chọn theo text/giá trị/vị trí | v1 |
| A-07 | Tick / Bỏ tick / Chọn radio | | v1 |
| A-08 | Chọn ngày | Gõ trực tiếp hoặc thao tác date picker | v1 |
| A-09 | Nhấn phím / Tổ hợp phím | Enter, Tab, Esc, Ctrl+S… | v1 |
| A-10 | Cuộn tới phần tử / cuộn trang | | v1 |
| A-11 | Upload file | File cố định hoặc từ dữ liệu test | v1 |
| A-12 | Tải lại / Quay lại / Tiến tới | | v1 |
| A-13 | Tab: mở mới, chuyển, đóng | Tự bắt tab/popup mới mở | v1 |
| A-14 | Hộp thoại alert/confirm/prompt | Chấp nhận / Hủy / nhập text | v1 |
| A-15 | Iframe | Tự phát hiện phần tử trong iframe (kể cả lồng nhau) | v1 |
| A-16 | Đổi phiên | Chuyển sang session A/B/C | v1 |
| A-17 | Xóa cookie / storage | | v1 |
| A-18 | Chờ cố định (giây) | Khuyên dùng hạn chế, UI cảnh báo | v1 |
| A-19 | Kéo thả | | v1.x |
| ~~A-20~~ | ~~Tải file về~~ | ~~Lưu file để kiểm tra ở B-13~~ — Bỏ ngày 2026-11-23, thay bằng Q-04 | ~~v1.x~~ |

## B. Kiểm tra (Assertions)
| ID | Kiểm tra | Ưu tiên |
|---|---|---|
| B-01 | Hiển thị / Không hiển thị / Không tồn tại | v1 |
| B-02 | Trạng thái: enabled/disabled, checked, required, readonly | v1 |
| B-03 | Text: bằng, chứa, bắt đầu bằng, kết thúc bằng, regex, không chứa (tùy chọn bỏ qua hoa/thường, khoảng trắng) | v1 |
| B-04 | Giá trị ô nhập | v1 |
| B-05 | So sánh số: =, ≠, >, ≥, <, ≤, trong khoảng (tự hiểu định dạng `1.000.000`, `1,000.00`) | v1 |
| B-06 | So sánh ngày: bằng, trước, sau, = hôm nay ± N (nhiều định dạng ngày) | v1 |
| B-07 | Đếm phần tử: =, ≥, ≤ | v1 |
| B-08 | Bảng: dòng có cột X = giá trị thì cột Y phải = giá trị | v1 |
| B-09 | URL: bằng / chứa / regex; Tiêu đề trang | v1 |
| B-10 | Thông báo (toast/message) xuất hiện với nội dung | v1 |
| B-11 | Kiểu kiểm tra: **cứng** (fail thì dừng) / **mềm** (ghi nhận, chạy tiếp) | v1 |
| ~~B-12~~ | ~~So sánh cả bảng với file Excel kỳ vọng~~ — Bỏ ngày 2026-11-23, thay bằng P-06 | ~~v1.x~~ |
| ~~B-13~~ | ~~Nội dung file tải về (tên, dung lượng, nội dung Excel/CSV/PDF)~~ — Bỏ ngày 2026-11-23, thay bằng Q-04 | ~~v1.x~~ |
| B-14 | So sánh ảnh với ảnh chuẩn (visual regression, có vùng bỏ qua) | v1.x |

## C. Định vị phần tử (Locator)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| C-01 | Lưu nhiều chiến lược theo ưu tiên: role+name → label → placeholder → text → testId → css → xpath; tự thử lần lượt | v1 |
| C-02 | Lưu fingerprint phần tử (tag, text, thuộc tính, phần tử lân cận) | v1 |
| C-03 | Định vị theo ngữ cảnh: "trong dòng có…", "bên dưới/cạnh nhãn…", "bên trong vùng…" | v1 |
| C-04 | Phần tử thứ N / đầu / cuối trong danh sách | v1 |
| C-05 | Xử lý ID động (ASP.NET WebForms `ctl00_…`, ID sinh ngẫu nhiên): khớp phần ổn định | v1 |
| C-06 | Nút Pick (bấm lên trang để chọn) và Highlight (hiện phần tử đang trỏ tới, báo nếu trùng nhiều) | v1 |
| C-07 | Chế độ Nâng cao: sửa selector thủ công | v1 |
| ~~C-08~~ | ~~Gợi ý selector mới khi hỏng (self-heal), người dùng duyệt~~ — Bỏ ngày 2026-11-23, thay bằng AI-09 | ~~v1.x~~ |

## D. Điều khiển luồng
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| D-01 | Step dùng chung có tham số (vd "Đăng nhập(user, pass)"), sửa 1 chỗ áp dụng mọi nơi | v1 |
| D-02 | Chờ đến khi điều kiện đúng: timeout, chu kỳ, tùy chọn tải lại trang mỗi lần | v1 |
| D-03 | If / Else theo điều kiện (phần tử hiển thị, text, biến) | v1 |
| D-04 | Lặp: qua từng dòng dữ liệu, qua từng dòng bảng trên trang, N lần | v1 |
| D-05 | Khối Cleanup luôn chạy dù pass hay fail | v1 |
| D-06 | Tắt/bật step; bỏ qua có điều kiện | v1 |
| D-07 | Timeout riêng cho từng step | v1 |
| D-08 | Thử lại một khối step N lần | v1.x |

## E. Dữ liệu & Biến
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| E-01 | Cú pháp biến `{{ten}}` ở mọi ô giá trị, có gợi ý tự động khi gõ | v1 |
| E-02 | Phạm vi biến: môi trường → suite → test → runtime (lưu từ trang) — *mở rộng bởi O-04 (v1.1)* | v1 |
| E-03 | Dữ liệu test từ Excel/CSV hoặc bảng nhập tay; mỗi dòng = 1 lần chạy | v1 |
| E-04 | Lưu giá trị từ trang vào biến: text, value, thuộc tính, một phần URL (regex) | v1 |
| E-05 | Sinh dữ liệu: `{{random}}`, `{{timestamp}}`, `{{uuid}}`, tên/SĐT/email/địa chỉ Việt Nam, chuỗi độ dài N | v1 |
| E-06 | Ngày: `{{today}}`, `{{today+3d}}`, `{{startOfMonth}}`, định dạng tùy chọn (`dd/MM/yyyy`) | v1 |
| E-07 | Biểu thức đơn giản: + − × ÷, nối chuỗi, làm tròn | v1 |
| E-08 | Secret: kiểu biến đặc biệt, mã hóa, tự che `••••` trong log/ảnh/báo cáo | v1 |

## F. Nhiều phiên & Ngoài giao diện
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| F-01 | Nhiều phiên trong 1 test (mỗi phiên = tài khoản/cookie riêng), hiển thị nhãn phiên trên từng step | v1 |
| F-02 | Lưu phiên đăng nhập, dùng lại cho các test sau (có hạn dùng) | v1 |
| F-03 | Gọi API: method, URL, header, body (JSON/form), lưu response vào biến, kiểm tra status/field | v1 |
| F-04 | Tự ghi nhận lỗi console JS và request 4xx/5xx; tùy chọn fail test khi có | v1 |
| ~~F-05~~ | ~~Chờ / kiểm tra một request mạng (URL, status, body)~~ — Bỏ ngày 2026-11-23, thay bằng Y-05 | ~~v1.x~~ |
| ~~F-06~~ | ~~Mock response API~~ — Bỏ ngày 2026-11-23, thay bằng X-07 | ~~v1.x~~ |
| ~~F-07~~ | ~~Đọc email / OTP từ hộp thư test~~ — Bỏ ngày 2026-11-23, thay bằng X-06 | ~~v1.x~~ |
| ~~F-08~~ | ~~Query DB chỉ đọc (SQL Server, Postgres, MySQL)~~ — Bỏ ngày 2026-11-23, thay bằng X-05 | ~~v1.x~~ |
| F-09 | Sinh mã TOTP từ secret (2FA) | v1.x |

## G. Môi trường chạy
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| G-01 | Trình duyệt: Edge, Chrome (có sẵn trên máy); Chromium tải tự động | v1 |
| G-02 | Firefox, WebKit | v1.x |
| G-03 | Kích thước màn hình; giả lập thiết bị mobile | v1 |
| G-04 | Ngôn ngữ, múi giờ, vị trí địa lý giả lập | v1.x |
| G-05 | Chạy có hiện trình duyệt / chạy ngầm | v1 |
| G-06 | Proxy theo môi trường: HTTP/HTTPS/SOCKS5 (DNS phân giải qua proxy), có bypass list | v1 |
| G-07 | SSH tunnel tích hợp: người dùng nhập host, port, user, mật khẩu hoặc private key (lưu dạng Secret) → app tự mở SOCKS tunnel khi chạy test của môi trường đó, tự đóng khi xong; nút "Kiểm tra kết nối"; hỗ trợ jump host (bastion) | v1 |
| G-08 | Hướng dẫn trong app cho trường hợp VPN → SSH → web nội bộ | v1 |

## H. Chạy test
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| H-01 | Chạy 1 test, 1 suite, theo tag | v1 |
| H-02 | Chọn môi trường khi chạy | v1 |
| H-03 | Debug: chạy từng bước, breakpoint, chạy từ bước X, chạy chậm (slow-mo) | v1 |
| H-04 | Dừng khi lỗi đầu tiên hoặc chạy hết | v1 |
| H-05 | Chạy song song N test | v1.x |
| H-06 | Tự chạy lại test fail, đánh dấu flaky | v1.x |
| ~~H-07~~ | ~~CLI chạy test file/suite (cho CI, chạy theo lịch)~~ — Bỏ ngày 2026-11-23, thay bằng X-04 | ~~v1.x~~ |
| ~~H-08~~ | ~~Hẹn giờ chạy trong app~~ — Bỏ ngày 2026-11-23, thay bằng X-04 | ~~v1.x~~ |

## I. Kết quả & Báo cáo
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| I-01 | Pass/fail/skip từng step + thời gian | v1 |
| I-02 | Ảnh chụp mỗi step lỗi (khoanh đỏ phần tử), tùy chọn chụp mọi step | v1 |
| I-03 | Video lần chạy; trace (tua lại DOM, network) | v1 |
| I-04 | Thông báo lỗi tiếng Việt dễ hiểu + gợi ý cách sửa | v1 |
| I-05 | Xuất báo cáo HTML (1 file tự chứa) | v1 |
| ~~I-06~~ | ~~Xuất PDF, Excel~~ — Bỏ ngày 2026-11-23, thay bằng X-01 | ~~v1.x~~ |
| ~~I-07~~ | ~~Xuất JUnit XML~~ — Bỏ ngày 2026-11-23, thay bằng X-04 | ~~v1.x~~ |
| I-08 | So sánh 2 lần chạy | v1.x |

## J. Bảo trì
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| J-01 | Kho phần tử (Element repository): đặt tên phần tử, dùng lại; sửa 1 lần áp dụng mọi test | v1 |
| J-02 | Tìm nơi dùng (phần tử, step dùng chung, biến) | v1 |
| J-03 | Xuất / Nhập test, suite, project (`.kiemi.json` hoặc `.zip`) | v1 |
| J-04 | Nhân bản test / step | v1 |
| ~~J-05~~ | ~~Lịch sử thay đổi test, khôi phục bản cũ~~ — Bỏ ngày 2026-11-23, thay bằng T-05 | ~~v1.x~~ |
| J-06 | Undo / Redo trong màn soạn test | v1 |

## K. Recorder
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| K-01 | Ghi: bấm, nhập, chọn, tick, phím, chuyển trang, tab mới, iframe | v1 |
| K-02 | Gộp thao tác thừa (nhiều lần gõ phím → 1 step Nhập) | v1 |
| K-03 | Thanh công cụ nổi khi ghi: Thêm kiểm tra (bấm phần tử → chọn loại kiểm tra), Lưu giá trị, Dừng | v1 |
| K-04 | Ghi chèn vào giữa test có sẵn (từ step X) | v1 |
| K-05 | Tự nhận ô password → đề nghị chuyển thành Secret | v1 |

## M. Tạo test nhanh
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| M-01 | Gợi ý kiểm tra tự động khi ghi: phát hiện thay đổi trên trang sau thao tác (toast/thông báo, dòng mới trong bảng, đổi URL, phần tử mới) → đề xuất step kiểm tra, người dùng bấm ✓ | v1 |
| M-02 | "Biến thành dữ liệu": chọn các giá trị đã nhập khi ghi → tự tạo cột dataset + thay bằng `{{row.x}}` | v1 |
| M-03 | Sinh biến thể từ form đã ghi (không cần AI): bỏ trống ô bắt buộc, sai định dạng (email, SĐT, ngày), giá trị biên (0, âm, quá dài), ký tự đặc biệt → người dùng tick chọn để tạo case negative — *mở rộng bởi R-03 (v1.1)* | v1 |
| ~~M-04~~ | ~~AI (tùy chọn, người dùng nhập API key Claude): mô tả tiếng Việt → step; phần tử chưa xác định thì đánh dấu để Pick~~ — Bỏ ngày 2026-11-23, thay bằng AI-05 | ~~v1.x~~ |
| ~~M-05~~ | ~~Import test case từ Excel/Word (dạng bước thủ công) → AI chuyển thành step~~ — Bỏ ngày 2026-11-23, thay bằng X-08, AI-06 | ~~v1.x~~ |
| ~~M-06~~ | ~~AI tự khám phá web (crawl menu với tài khoản cho trước) → sinh bộ smoke test~~ — Bỏ ngày 2026-11-23, thay bằng AI-07 | ~~v1.x~~ |
| M-07 | Nhập từ Playwright codegen / Selenium IDE (`.side`) | v1.x |

## L. Mẫu & Onboarding
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| L-01 | Test mẫu: Đăng nhập, Điền form và kiểm tra thông báo, Tạo ở A kiểm tra ở B, Data-driven từ Excel | v1 |
| L-02 | Hướng dẫn trong app từng bước lần đầu | v1 |

---

# Phần 2 — Sẵn sàng cho dự án thật (v1.1 → v1.2)
> Nguồn: đề xuất 0001 "Kiemi sẵn sàng cho dự án thật" (chốt 2026-11-23). Thước đo độ phủ: `docs/QC-COVERAGE.md` — mục tiêu v1.1: không còn ô ❌ ở dòng v1.1.
> Ưu tiên: **v1.1** = bắt buộc cho dự án thật · **v1.2** = bổ sung · **v1.x** = sau.
> **Mục tiêu:** Kiemi dùng được cho QC ở mọi dự án web (không riêng ngành nào): (1) test được nghiệp vụ, (2) chạy được trên web thực tế, (3) làm việc như một team QA.
> **Tiêu chí thành công:** với 8 bộ test mẫu (L-03), tester không biết code tự tạo và chạy được, không cần vào chế độ Nâng cao.

## O. Tổ chức: dự án · sản phẩm · môi trường
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| O-01 | **Cấp bậc**: Workspace → Dự án → **Sản phẩm** (web/app/API/module) → Thư mục/Tính năng → Test/Suite. Sản phẩm có kho phần tử, step dùng chung, tag riêng | v1.1 | 1 dự án 3 sản phẩm, test & phần tử không lẫn nhau |
| O-02 | **Ma trận Môi trường × Sản phẩm** (thay V-05): môi trường khai báo cấp dự án; mỗi ô (môi trường, sản phẩm) có URL, tài khoản/secret, proxy/SSH tunnel, biến riêng; ô trống = sản phẩm không có ở môi trường đó; thêm môi trường/sản phẩm tự tạo ô; **nhân bản môi trường**; step chọn sản phẩm | v1.1 | Đổi môi trường khi chạy → mọi step `{{app.<sảnPhẩm>}}` lấy đúng URL/tài khoản/tunnel; 1 test đi qua 2 sản phẩm khác domain |
| O-03 | **Loại môi trường** (Dev · Test · UAT · Staging · Production · Khác) + **màu nhận diện** trên thanh tiêu đề, màn Chạy, báo cáo; loại Production tự bật bảo vệ W-10 (xác nhận 2 lần trước khi chạy) | v1.1 | Chạy test có step ghi trên Production → bị chặn, hiện cảnh báo đỏ |
| O-04 | **Kế thừa biến/cấu hình** (thay E-02): Workspace → Dự án → Sản phẩm → Môi trường → Suite → Test → Dòng dữ liệu; màn "Giá trị hiệu lực" cho biết mỗi biến lấy từ cấp nào | v1.1 | Biến `timeout` khai báo ở 3 cấp → hiển thị đúng giá trị và nguồn |
| O-05 | **Dữ liệu & tài khoản theo môi trường**: dataset, biến, secret có bản riêng cho từng môi trường; test không đổi | v1.1 | Cùng test, UAT dùng `nv001`, DEV dùng `test01` |
| O-06 | **Giới hạn test theo môi trường**: chỉ chạy trên / không chạy trên môi trường X; suite chọn sẵn môi trường mặc định | v1.1 | Test đánh dấu "không chạy Production" bị bỏ qua có ghi lý do |
| O-07 | **Phạm vi tài nguyên dùng chung**: kho phần tử, step dùng chung, công thức, quy tắc field, trình xử lý popup ở cấp **Sản phẩm / Dự án / Thư viện workspace**; dùng chéo giữa dự án | v1.1 | Sửa step ở thư viện workspace → hiện danh sách dự án/test bị ảnh hưởng (FX-08) |
| O-08 | **Chuyển dự án nhanh**: bộ chọn dự án trên sidebar, gần đây, ghim; tìm kiếm toàn workspace (test, phần tử, step) qua Ctrl/Cmd+K | v1.1 | Chuyển giữa 5 dự án < 1 giây |
| O-09 | **Chạy ma trận**: 1 lần chạy = suite × nhiều môi trường × nhiều trình duyệt; kết quả dạng bảng | v1.2 | Smoke × (DEV, UAT) × (Edge, Chrome) = 4 cột kết quả |
| O-10 | **Dashboard theo cấp**: workspace → dự án → sản phẩm → môi trường; tỷ lệ pass, lần chạy gần nhất, test lỗi, xu hướng (gộp T-07) | v1.2 | |
| O-11 | **Mỗi dự án = 1 thư mục/repo riêng** (gắn T-01); workspace mở nhiều thư mục dự án; xuất/nhập từng dự án; **secret không bao giờ nằm trong thư mục dự án** (chỉ tên tham chiếu, giá trị trong keychain máy) | v1.1 | Xuất dự án → file không chứa secret; nhập trên máy khác → yêu cầu nhập secret còn thiếu |
| O-12 | **Tạo dự án/sản phẩm từ template** (R-15) hoặc nhân bản dự án có sẵn | v1.2 | |
| O-13 | **Phiên bản sản phẩm**: test plan (T-02) gắn với sản phẩm + release; báo cáo theo release | v1.2 | |

## FX. Sửa khi fail (tại chỗ, không chạy lại từ đầu)
Nối H-03, K-04, I-04 thành một luồng sửa lỗi liền mạch trên màn Chạy.

| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| FX-01 | **Tạm dừng khi lỗi** (mặc định bật khi chạy tay, tắt khi chạy suite/CLI): giữ nguyên trình duyệt + mọi tab/phiên ở trạng thái lúc fail, highlight phần tử liên quan | v1.1 | Step fail → trình duyệt không đóng, step lỗi được chọn sẵn |
| FX-02 | **Sửa step tại chỗ** trên màn Chạy (panel thuộc tính giống màn Soạn test) | v1.1 | Sửa giá trị/hành động rồi Thử lại trong ≤ 3 thao tác |
| FX-03 | **Chọn lại phần tử trên trang thật** (Pick/Highlight trên trạng thái lỗi), cập nhật locator nhiều lớp + fingerprint | v1.1 | |
| FX-04 | **Chèn step trước/sau** step lỗi: thêm tay hoặc **Ghi thao tác từ trạng thái hiện tại** (recorder chèn đúng vị trí) | v1.1 | Ghi thao tác đóng popup → chèn vào trước step lỗi |
| FX-05 | **Thử lại step này · Tiếp tục từ đây · Bỏ qua step** (lần chạy này) · **Chạy lại đến bước N rồi dừng** | v1.1 | Tiếp tục từ step 7 mà không chạy lại 1–6 |
| FX-06 | **Sửa nhanh theo loại lỗi**: *không tìm thấy phần tử* → Chọn lại / Dùng phần tử tương tự (theo fingerprint) / Chờ lâu hơn; *sai giá trị* → Cập nhật kỳ vọng; *bị che bởi popup* → Thêm trình xử lý popup (W-09); *hết thời gian* → Tăng timeout / Thêm step chờ; *lỗi mạng/API* → Thử lại / Xem request | v1.1 | Mỗi loại lỗi trên demo-site có ≥ 1 nút sửa nhanh đúng |
| FX-07 | **Cập nhật kỳ vọng bằng giá trị thực tế** có câu hỏi bắt buộc "Thay đổi đúng" / "Đây là bug" → bug thì chuyển sang tạo báo cáo bug (X-02), không sửa test | v1.1 | |
| FX-08 | **Phạm vi sửa**: chỉ test này / mọi nơi dùng phần tử (J-01) / step dùng chung (D-01); hiện danh sách test bị ảnh hưởng trước khi lưu | v1.1 | Sửa locator nút Lưu → hiện 12 test bị ảnh hưởng, chọn áp dụng |
| FX-09 | **Sửa từ màn Kết quả**: "Sửa và chạy lại" → chạy lại đến step fail (cùng dòng dữ liệu, cùng môi trường) rồi vào trạng thái FX-01 | v1.1 | Lần chạy ban đêm fail → sáng mở Kết quả → vào đúng trạng thái lỗi |
| FX-10 | **Sửa dữ liệu tại chỗ** khi test data-driven: biết lỗi ở dòng nào, sửa ô dữ liệu đó ngay trên màn Chạy | v1.2 | |
| FX-11 | **Nhật ký sửa + Hoàn tác** cho mọi sửa đổi trong phiên sửa lỗi; sau khi sửa đề nghị "Chạy lại từ đầu để xác nhận" | v1.1 | |
| FX-12 | **"Đề xuất sửa" bằng AI** (khi bật AI): gộp AI-09 + AI-10 — giải thích nguyên nhân + đề xuất sửa dạng diff, 1 nút áp dụng | v1.2 | |

## R. Kiểm tra field & kỹ thuật thiết kế test
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| R-01 | **Bảng đặc tả field** cho mỗi form: kiểu (text, số, tiền, email, SĐT, ngày, dropdown, checkbox, file…) + quy tắc: bắt buộc, độ dài min/max, giá trị min/max, định dạng/regex, ký tự cho phép, không trùng, mặc định, chỉ đọc, **phụ thuộc** (hiện khi / bắt buộc khi), **so sánh giữa field** (Ngày kết thúc ≥ Ngày bắt đầu, Xác nhận mật khẩu = Mật khẩu), file (loại, dung lượng tối đa) | v1.1 | Khai báo được form 5 field ở ví dụ R.1 bằng UI, không cần code |
| R-02 | **Tự suy ra đặc tả** từ form: `required`, `maxlength`, `minlength`, `pattern`, `type`, `min`, `max`, label có dấu `*`, OpenAPI/JSON Schema nếu có; QC duyệt và chỉnh | v1.1 | Mở form demo → đặc tả điền sẵn ≥ 80% quy tắc |
| R-03 | **Sinh test theo kỹ thuật chuẩn** (mở rộng M-03): phân vùng tương đương; **giá trị biên** (min−1, min, min+1, max−1, max, max+1); bảng quyết định cho field phụ thuộc; pairwise cho tổ hợp hợp lệ. Mặc định: 1 case **tất cả hợp lệ** + mỗi case **chỉ sai 1 field** | v1.1 | Form 5 field ở R.1 sinh đúng danh sách case như bảng mẫu; QC bỏ chọn/thêm case được |
| R-04 | **Bộ dữ liệu xấu chuẩn**, bật/tắt theo field: khoảng trắng đầu/cuối/chỉ khoảng trắng; tiếng Việt có dấu, Unicode NFC/NFD; emoji; ký tự đặc biệt; chuỗi 10.000 ký tự; số âm/0/thập phân/khoa học/số 0 đầu; ngày không tồn tại (31/02, 29/02 năm không nhuận); `<script>`, thẻ HTML; `' OR 1=1--`; dán vượt `maxlength` | v1.1 | Mỗi giá trị có nhãn giải thích tiếng Việt trong báo cáo |
| R-05 | **Kiểm tra thông báo lỗi theo field**: đúng **vị trí**, đúng **nội dung** (theo catalog thông báo, có mẫu `{field}`, `{min}`, `{max}`), thời điểm hiện (rời field / submit), **focus vào field lỗi đầu tiên**, **không xóa dữ liệu đã nhập**, form **không được gửi** khi còn lỗi | v1.1 | Phát hiện thông báo sai nội dung / hiện sai field trên demo-site |
| R-06 | **Kiểm tra validate phía server**: bỏ qua validate client (gỡ `maxlength`/`required` hoặc gửi thẳng API) | v1.2 | Demo-site có field chỉ chặn ở client → Kiemi báo "Server không validate" |
| R-07 | **Lưu rồi đọc lại (round-trip)**: mở lại/xem chi tiết → giá trị đúng như nhập (không mất dấu, không bị cắt, trim đúng quy định, định dạng số/ngày đúng) | v1.1 | Nhập "Nguyễn Thị Ánh  " → hiển thị lại đúng theo quy tắc trim |
| R-08 | **Kiểm tra UI của field**: label, placeholder, mặc định, dấu `*`, thứ tự Tab, Enter để submit, readonly/disabled, mask | v1.2 | |
| R-09 | **Ma trận kết quả Field × Quy tắc** (✓ / ✗ / –), bấm ô xem ảnh + chi tiết; xuất Excel | v1.1 | Form 5 field → ma trận 5 dòng × các cột quy tắc |
| R-10 | **Thư viện quy tắc & catalog thông báo dùng chung** (dự án và giữa dự án): Email, SĐT VN (10 số, đầu 0), CCCD (12 số), Mã số thuế (10/13 số), Mã bưu chính, URL, Mật khẩu mạnh, Họ tên tiếng Việt, Tiền VNĐ… | v1.1 | Gắn quy tắc "SĐT VN" vào field → tự sinh đủ case |
| R-11 | **Crawl kiểm tra toàn site** (theo tài khoản): link 404, ảnh/tài nguyên lỗi, lỗi JS console, trang quá chậm | v1.2 | Báo cáo danh sách trang lỗi |
| R-12 | **Bảo mật cơ bản không phá hoại** (không chạy trên Production — W-10): IDOR, vào trang khi chưa đăng nhập/sai vai trò, XSS phản hồi với giá trị R-04, cookie phiên `Secure`/`HttpOnly` | v1.2 | Demo-site có 1 lỗ IDOR cố ý → bị phát hiện |
| R-13 | **Hành vi trình duyệt**: Back/Refresh sau submit (gửi lại/tạo trùng?), cảnh báo rời trang khi chưa lưu, cùng form ở 2 tab | v1.2 | |
| R-14 | **Import đặc tả field từ Excel** (file mẫu: Field, Kiểu, Bắt buộc, Min, Max, Định dạng, Thông báo lỗi…); AI đọc SRS/Word là AI-06 | v1.1 | Import đặc tả 5 field → sinh test giống khai báo tay |
| R-15 | **Bộ checklist theo loại dự án** (template): Admin CRUD, E-commerce, HRM/ERP/lương, Tài chính, Đặt chỗ, CMS, LMS — suite gợi ý + quy tắc field thường gặp | v1.2 | Tạo dự án mới chọn "HRM" → có sẵn khung suite |

### R.1 Ví dụ: form Đăng ký 5 field
| Field | Đặc tả |
|---|---|
| Họ tên | Bắt buộc · 2–50 ký tự · chữ (có dấu) + khoảng trắng · trim |
| Email | Bắt buộc · định dạng email · ≤ 100 ký tự · không trùng |
| SĐT | Không bắt buộc · quy tắc "SĐT VN" (10 số, bắt đầu bằng 0) |
| Ngày sinh | Bắt buộc · `dd/MM/yyyy` · đủ 18 tuổi · không ở tương lai |
| Mật khẩu | Bắt buộc · 8–32 ký tự · có chữ hoa, số, ký tự đặc biệt |

Case sinh cho field **Họ tên**:
| # | Giá trị | Kỹ thuật | Kỳ vọng |
|---|---|---|---|
| 1 | (trống) | Bắt buộc | Lỗi "Họ tên không được để trống" |
| 2 | `   ` | Dữ liệu xấu | Lỗi bắt buộc |
| 3 | `A` | Biên min−1 | Lỗi "tối thiểu 2 ký tự" |
| 4 | `An` | Biên min | Hợp lệ |
| 5 | 3 ký tự | Biên min+1 | Hợp lệ |
| 6 | 49 ký tự | Biên max−1 | Hợp lệ |
| 7 | 50 ký tự | Biên max | Hợp lệ |
| 8 | 51 ký tự | Biên max+1 | Lỗi "tối đa 50 ký tự" (hoặc không nhập được ký tự 51) |
| 9 | `Nguyễn Thị Ánh` | Tiếng Việt có dấu | Hợp lệ, lưu & hiển thị lại đúng (R-07) |
| 10 | `Nguyen123` | Ký tự không cho phép | Lỗi định dạng |
| 11 | `<script>alert(1)</script>` | Dữ liệu xấu / XSS | Lỗi định dạng, không bị thực thi |
| 12 | `  Ánh  ` | Trim | Lưu thành `Ánh` |

Cả form ≈ **45–55 case** (1 case tất cả hợp lệ + mỗi case sai 1 field + case so sánh giữa field), kết quả theo ma trận R-09.

## CV. Đo độ phủ & chất lượng test
Phủ theo chuẩn (ISO/IEC 25010, kỹ thuật thiết kế ISTQB) và **đo** được còn thiếu gì.

| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| CV-01 | **Nhãn kỹ thuật & đặc tính chất lượng** cho mỗi test/case: kỹ thuật (phân vùng, biên, bảng quyết định, chuyển trạng thái, use case, pairwise, đoán lỗi, khám phá) + đặc tính ISO 25010 (chức năng, bảo mật, tương tác, tin cậy, tương thích, hiệu năng); case sinh tự động (R-03, P-08…) tự gắn nhãn | v1.1 | Báo cáo độ phủ theo kỹ thuật & đặc tính cho từng sản phẩm |
| CV-02 | **Độ phủ trang/màn hình**: danh sách trang của sản phẩm (crawl R-11 hoặc khai báo) so với trang đã có test | v1.1 | Demo-site: liệt kê đúng các trang chưa được test |
| CV-03 | **Độ phủ phần tử tương tác**: nút/field/link/menu chưa từng được thao tác hoặc kiểm tra; tô màu trên ảnh trang | v1.2 | |
| CV-04 | **Độ phủ theo checklist**: mỗi form/trang đối chiếu với nhóm trong `docs/QC-COVERAGE.md` (validate, lọc, sắp xếp, phân quyền, round-trip…) → ô còn trống | v1.1 | "Trang Danh sách: thiếu sắp xếp, phân trang, phân quyền" |
| CV-05 | **Độ phủ yêu cầu** (gộp T-04) | v1.2 | |
| CV-06 | **Độ phủ mã JS phía trình duyệt** (Chromium coverage) khi có source map | v1.x | |
| CV-07 | **Lint chất lượng test**: không có bước kiểm tra; chỉ chờ cố định; selector yếu; ghi dữ liệu mà không có cleanup; quá dài (> N step); trùng lặp; dữ liệu cứng thay vì biến | v1.1 | Mỗi cảnh báo có nút sửa nhanh hoặc giải thích |
| CV-08 | **Nhắc sau khi ghi thao tác**: "Test này mới là luồng chính. Sinh thêm case lỗi/biên/phân quyền?" → mở R-03 / Q-09 / AI-19 | v1.1 | |
| CV-09 | **Điểm độ phủ tổng hợp** (CV-01 + CV-02 + CV-04) trên dashboard, xu hướng theo thời gian | v1.2 | |

## P. Dữ liệu & tính toán nghiệp vụ
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| P-01 | **Dataset lồng nhau**: nhiều sheet liên kết bằng khóa (`Bo.maBo ↔ SanPham.maBo`); step Lặp duyệt danh sách con của dòng hiện tại | v1.1 | Import Excel 2 sheet; mỗi bộ chạy 1 lượt, lặp đúng số sản phẩm của bộ; UI hiện dạng cây |
| P-02 | **Biến danh sách & object**: lưu bảng/danh sách trên trang thành list object theo tên cột; `{{gioHang[0].thanhTien}}`, `{{gioHang.length}}` | v1.1 | Lấy bảng 50 dòng (kể cả nhiều trang khi bật "duyệt mọi trang"); xem được trong panel Biến |
| P-03 | **Thư viện công thức có tên**, dùng chung: `+ − × ÷ %`, `SUM/COUNT/MIN/MAX/AVG`, `SUMIF/COUNTIF/FILTER`, `IF`, `AND/OR`, `ROUND/ROUNDUP/ROUNDDOWN` (số chữ số âm), tham số đầu vào | v1.1 | Định nghĩa "Tổng đơn hàng" 1 lần, dùng ở 3 test; debug hiện từng bước tính trung gian |
| P-04 | **So sánh số có sai lệch cho phép** (tuyệt đối hoặc %) | v1.1 | `333.396` vs `333.400` với ±100 → pass; lỗi hiển thị chênh lệch |
| P-05 | **Kỳ vọng 2 nguồn**: cột Excel tester điền và/hoặc công thức; có cả hai → đối chiếu, cảnh báo nếu lệch | v1.1 | Điền sai kỳ vọng → cảnh báo "Kỳ vọng trong Excel khác công thức" |
| P-06 | **So sánh bảng với danh sách kỳ vọng** theo khóa; bỏ qua thứ tự, chỉ so cột chọn (thay B-12) | v1.1 | Báo dòng thiếu/thừa/lệch, tô đỏ ô lệch |
| P-07 | **Hàm ngày nghiệp vụ**: ngày làm việc, lịch nghỉ lễ VN cấu hình được, cuối tháng/quý/năm, khoảng ngày/tháng, tuổi, thâm niên | v1.2 | `WORKDAYS(01/12/2026, 31/12/2026)` đúng theo lịch cấu hình |
| P-08 | **Sinh tổ hợp bộ test** (đầy đủ hoặc pairwise) → sheet dataset | v1.2 | 4 × 3 × 2 tham số: pairwise ≤ 12 bộ, phủ mọi cặp |
| P-09 | **Sinh file để upload**: từ dataset + file mẫu tạo Excel/CSV mới rồi upload (test import) | v1.1 | Sinh file 200 dòng có `{{random}}`, upload, kiểm tra kết quả import |
| P-10 | **Định dạng VN**: parse/format số, tiền, ngày theo locale (`1.250.000 ₫`, `1,250,000`, `25/12/2026`), chọn theo môi trường | v1.1 | So sánh đúng giữa `1.250.000 ₫` và `1250000` |

## Q. Kiểm tra nâng cao
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| Q-01 | **Mọi dòng thỏa điều kiện** (kết quả lọc/tìm kiếm), tùy chọn duyệt mọi trang | v1.1 | Lọc "Phòng = Kế toán" → báo dòng vi phạm nếu có |
| Q-02 | **Bảng được sắp xếp** theo cột: tăng/giảm, số/ngày/chữ (đúng thứ tự tiếng Việt có dấu) | v1.1 | Phát hiện 1 dòng sai thứ tự trong 500 dòng |
| Q-03 | **Duyệt mọi trang** của bảng phân trang + tổng số bản ghi khớp nhãn ("Tổng 125") | v1.1 | 500 dòng / 20 dòng mỗi trang: đếm đúng 500 |
| Q-04 | **File tải về** (thay A-20, B-13): tên, loại, dung lượng; Excel (sheet, ô, vùng bảng → biến danh sách), CSV, PDF (text) | v1.1 | Xuất bảng lương → tổng cột Excel = tổng trên UI |
| Q-05 | **Thời gian phản hồi**: thao tác/trang ≤ N giây (cảnh báo hoặc fail) | v1.2 | Ghi thời gian từng step trong báo cáo |
| Q-06 | **A11y cơ bản** (axe) cho trang | v1.x | Liệt kê lỗi tương phản, thiếu label |
| Q-07 | **Đối chiếu 3 lớp** trong 1 step: UI = API = DB | v1.2 | 1 step báo rõ lớp nào lệch |
| Q-08 | **Thao tác lặp nhanh** (bấm N lần liên tục) + không tạo bản ghi trùng | v1.2 | Bấm "Lưu" 3 lần → chỉ 1 bản ghi |
| Q-09 | **Ma trận phân quyền**: Excel vai trò × chức năng × (Thấy / Không thấy / Bị chặn) → tự sinh test mỗi vai trò: menu, nút, truy cập URL trực tiếp | v1.1 | 3 vai trò × 10 chức năng sinh 3 test, báo đúng ô vi phạm |
| Q-10 | **Chuyển trạng thái**: bảng trạng thái → hành động hợp lệ/không hợp lệ; nút ẩn/disable đúng | v1.2 | Đơn "Đã duyệt" không còn nút "Sửa" |

## V. Kiểm tra chéo giữa trang, tab, hệ thống
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| V-01 | **Tab có tên**: mở tab bằng URL hoặc **bắt tab do thao tác mở** (`target=_blank`, `window.open`), đặt tên, chuyển theo tên, đóng, kiểm tra số tab; mỗi step hiện nhãn tab | v1.1 | 3 tab chuyển qua lại 10 lần không nhầm; recorder tự đặt tên tab mới |
| V-02 | **Phạm vi khi mở tab**: *cùng phiên* · *phiên khác* (vai trò khác, ẩn danh) · *trình duyệt khác* (Edge vs Chrome) | v1.1 | Admin sửa giá ở tab 1 → khách chưa đăng nhập ở tab 2 thấy giá mới |
| V-03 | **So sánh trực tiếp giữa 2 nơi** trong 1 step: `[Giá] ở tab Khách` = `[Giá] ở tab Admin`; text, số (sai lệch P-04), bảng vs bảng (P-06) | v1.1 | Báo giá trị ở mỗi nơi + ảnh cả 2 tab khi lệch |
| V-04 | **Đồng bộ realtime**: thay đổi ở tab A → tab B cập nhật **không tải lại** trong N giây | v1.2 | Demo-site chat realtime pass; tắt realtime → fail đúng |
| ~~V-05~~ | ~~Nhiều ứng dụng trong 1 môi trường~~ — Bỏ ngày 2026-11-23, thay bằng O-02 | — | |
| V-06 | **So sánh giữa 2 môi trường / 2 phiên bản**: cùng test trên Env A và B, báo khác biệt (giá trị lưu, bảng, API response) | v1.2 | UAT vs Staging: báo đúng 1 field khác |
| V-07 | **Điểm kiểm tra lan truyền**: "khi X thay đổi thì kiểm tra ở: chi tiết, danh sách, báo cáo, email, API, DB, file xuất" → step "Kiểm tra lan truyền" | v1.2 | |

## Y. Hành vi trình duyệt & kiểm tra chung
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| Y-01 | **Giả lập thời gian**: đặt ngày giờ, tua nhanh, đóng băng (Playwright `page.clock`) | v1.1 | Khuyến mãi theo ngày trên demo-site: tua sang ngày hết hạn → kiểm tra đã tắt |
| Y-02 | **Giả lập mạng**: chậm (3G), mất mạng, mất rồi có lại | v1.2 | Mất mạng khi bấm Lưu → thông báo lỗi & không mất dữ liệu |
| Y-03 | **Quyền trình duyệt**: thông báo, vị trí, camera/micro, clipboard — cấp/từ chối | v1.2 | |
| Y-04 | **Clipboard**: kiểm tra nội dung đã copy; dán từ clipboard | v1.2 | |
| Y-05 | **Kiểm tra request mạng** (thay F-05): request khớp URL/method, body chứa trường/giá trị (vd analytics `purchase`) | v1.2 | |
| Y-06 | **SEO / meta**: title, description, og:*, canonical, 1 h1, ảnh có alt | v1.2 | |
| Y-07 | **Đa ngôn ngữ của web cần test**: không còn chuỗi chưa dịch, định dạng ngày/số đúng, layout không vỡ | v1.2 | |
| Y-08 | Sáng/tối của web cần test (`prefers-color-scheme`) | v1.x | |
| Y-09 | **Vỡ bố cục**: phần tử chồng lấn, tràn ngang, text bị cắt ở nhiều kích thước | v1.2 | |
| Y-10 | Luồng chỉ dùng bàn phím + focus hiển thị | v1.x | |

## W. Tương thích web thực tế
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| W-01 | **HTTP Basic / NTLM / Windows auth** theo môi trường (credential lưu Secret) | v1.1 | Vào được trang bật Basic/Windows auth trên demo-site/mô phỏng |
| W-02 | **Client certificate** theo môi trường | v1.2 | |
| W-03 | **Grid phức tạp** (DevExpress, Telerik, Kendo, AG Grid, Handsontable): đọc kể cả cuộn ảo, sửa ô inline, chọn dòng, dòng con, lọc header | v1.1 | Grid cuộn ảo 1.000 dòng trên demo-site: đọc đủ, sửa ô, kiểm tra |
| W-04 | **Control phức tạp**: Select2/Chosen/Ant Select, rich text (CKEditor/TinyMCE/Quill), date-range picker, masked input, autocomplete | v1.1 | Recorder ghi đúng thành 1 step có nghĩa cho mỗi loại |
| W-05 | **Shadow DOM / web components** | v1.2 | |
| W-06 | **Upload qua input ẩn và kéo thả** (mở rộng A-11) | v1.1 | |
| W-07 | **In / PDF viewer**: bắt file thay vì hộp thoại in | v1.2 | Nút "In phiếu" → có file PDF để kiểm tra bằng Q-04 |
| W-08 | **Session hết hạn**: "khi gặp trang đăng nhập → chạy step dùng chung Đăng nhập rồi tiếp tục" | v1.2 | Hết session giữa test vẫn pass |
| W-09 | **Trình xử lý popup toàn cục**: "nếu thấy X thì bấm Y" áp dụng cả dự án | v1.1 | Popup xuất hiện ngẫu nhiên không làm fail test |
| W-10 | **Môi trường được bảo vệ**: Production → chặn step ghi dữ liệu (DB write, API POST/PUT/DELETE, cleanup), cảnh báo đỏ khi chạy | v1.1 | Chạy test có cleanup trên Production → bị chặn |

## T. Quản lý test & làm việc nhóm
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| T-01 | **Dự án dạng thư mục file** (`.kiemi/` + mỗi test 1 file `.kiemi.json`, dễ diff) dùng chung qua Git hoặc thư mục mạng; phát hiện file đổi bởi người khác, cảnh báo xung đột, khóa mềm khi đang sửa. SQLite chỉ là index/cache + lịch sử chạy local | v1.1 | 2 máy cùng mở 1 thư mục: sửa ở A → B thấy trong ≤ 5s; sửa cùng lúc → hộp thoại chọn bản |
| T-02 | **Test plan & đợt test** theo release: chọn test/suite, giao người, theo dõi Pass/Fail/Blocked/Chưa chạy; gồm case thủ công | v1.1 | Dashboard "Release 3.2: 120 case, 110 pass…" |
| T-03 | **Case thủ công**: bước + kết quả mong đợi; đánh dấu từng bước pass/fail, đính kèm ảnh; chuyển dần sang tự động | v1.1 | |
| T-04 | **Gắn yêu cầu/ticket** + độ phủ yêu cầu | v1.2 | |
| T-05 | **Lịch sử phiên bản test** + so sánh 2 phiên bản (thay J-05) | v1.2 | |
| T-06 | **Trạng thái duyệt test**: Nháp → Chờ duyệt → Đã duyệt | v1.x | |
| T-07 | **Thống kê xu hướng**: tỷ lệ pass theo thời gian, test chập chờn, test chậm nhất | v1.2 | |

## X. Tích hợp & báo cáo
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| X-01 | **Báo cáo Excel/PDF** (thay I-06): tổng hợp theo bộ dữ liệu / đợt test, chi tiết kỳ vọng vs thực tế | v1.1 | Mở bằng Excel, có sheet Tổng hợp + Chi tiết |
| X-02 | **Tạo bug** từ step lỗi: v1.1 = nút "Copy báo cáo bug" (Markdown: tiêu đề, môi trường, bước tái hiện, kỳ vọng/thực tế, ảnh); v1.2 = tạo issue Jira / Redmine / Azure DevOps / GitLab / GitHub | v1.1 / v1.2 | Dán vào Jira/Redmine hiển thị đúng |
| X-03 | **Thông báo kết quả** qua webhook: Teams, Slack, Google Chat, Telegram, email SMTP | v1.1 | Chạy suite xong → tin nhắn tóm tắt + link báo cáo |
| X-04 | **CLI + hẹn giờ + JUnit XML** (thay H-07, H-08, I-07): `kiemi run <project> --suite smoke --env uat` | v1.1 | Chạy được trên máy không mở UI; Task Scheduler/cron gọi được |
| X-05 | **Query DB** (thay F-08): SQL Server, Postgres, MySQL; mặc định chỉ đọc; ghi chỉ trong setup/cleanup có cờ xác nhận và bị W-10 chặn trên Production; kết quả → biến danh sách | v1.1 | Kiểm tra bản ghi sau khi lưu trên UI |
| X-06 | **Email/OTP** (thay F-07): IMAP hoặc API Mailpit/Mailtrap; lấy OTP/link bằng regex | v1.2 | |
| X-07 | **Mock API** (thay F-06): giả lập 500, timeout, dữ liệu rỗng | v1.2 | |
| X-08 | **Import test case từ Excel** (thay M-05): file mẫu + map cột → case thủ công (T-03), sau đó ghi thao tác để chuyển sang tự động | v1.1 | Import 100 case từ Excel mẫu |

## AI. Trợ lý Kiemi (tùy chọn, tắt mặc định)
**Nguyên tắc:** AI dùng để **tạo, bảo trì, phân tích** test. Lúc chạy, engine thực thi step đã lưu (xác định, không tốn token). AI chỉ chạy lúc test khi dùng step "Kiểm tra bằng AI" (AI-12).

| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| AI-01 | **Nền tảng AI**: `packages/ai`, adapter Claude API (mặc định), OpenAI-compatible, Ollama (local); API key lưu Secret; bật/tắt theo dự án; chọn model theo tác vụ | v1.2 | Đổi provider không cần sửa code tính năng |
| AI-02 | **Bảo vệ dữ liệu**: che secret + PII (email, SĐT, CCCD…) trước khi gửi; tùy chọn không gửi ảnh/DOM; màn "Xem dữ liệu sẽ gửi"; dự án khóa được "chỉ model local" | v1.2 | Log request không chứa secret; test tự động kiểm tra che dữ liệu |
| AI-03 | **Kết quả AI luôn qua duyệt**: pass Zod schema; diff để chấp nhận/từ chối từng phần; không tự lưu | v1.2 | |
| AI-04 | **Chi phí**: token/chi phí ước tính mỗi lần, tổng tháng, giới hạn tháng, cache kết quả giống nhau | v1.2 | |
| AI-05 | **Mô tả tiếng Việt → step** (thay M-04): AI mở web, tìm phần tử, sinh step; phần tử chưa chắc → đánh dấu để Pick | v1.2 | Mô tả 5 câu → test pass trên demo-site sau khi duyệt |
| AI-06 | **Tài liệu → test** (thay M-05 phần AI): Excel/Word/PDF test case hoặc SRS → case thủ công/tự động + đặc tả field | v1.2 | |
| AI-07 | **Tự khám phá web → smoke suite** (thay M-06) | v1.x | |
| AI-08 | **Gợi ý case nghiệp vụ bổ sung** cho form/luồng (ngoài R-03) | v1.2 | |
| AI-09 | **Tự sửa selector** (thay C-08): so fingerprint + DOM hiện tại → đề xuất locator mới, QC duyệt; sửa hàng loạt | v1.2 | Đổi text/ID nút trên demo-site → đề xuất đúng ≥ 80% |
| AI-10 | **Phân loại nguyên nhân fail**: Bug thật / UI thay đổi / Dữ liệu / Môi trường / Chập chờn, kèm giải thích | v1.2 | |
| AI-11 | **Viết báo cáo bug** từ step lỗi (bổ sung X-02) + **tóm tắt đợt test** | v1.2 | |
| AI-12 | **Step "Kiểm tra bằng AI"** (ngữ nghĩa/hình ảnh) có ngưỡng tin cậy; "không xác định" trong báo cáo; cấm trong chế độ CI nghiêm ngặt | v1.x | |
| AI-13 | **Trợ lý Kiemi (chat) trong app**: panel chat ở mọi màn hình; giao diện chính để dùng AI-05 → AI-11 | v1.2 | Tạo được test form 5 field hoàn toàn bằng chat như kịch bản AI.1 |
| AI-14 | **Kiemi MCP server**: Claude Code/Claude Desktop tạo test, chạy suite, đọc kết quả | v1.x | Claude Code chạy được suite smoke và đọc kết quả |
| AI-15 | **Gói kiến thức Kiemi sinh tự động** mỗi lần build: danh mục action/assertion (từ registry `defineAction`), JSON Schema DSL, thư viện R-10, kỹ thuật thiết kế test, `QC-COVERAGE.md`, hướng dẫn sử dụng; AI chỉ được tạo step trong danh mục | v1.2 | Thêm 1 action → build lại → AI dùng được, không sửa prompt tay |
| AI-16 | **Công cụ tra cứu dự án** cho AI (chỉ đọc trừ khi được duyệt): `listTests`, `getTest`, `searchElements`, `getFieldSpec`, `getEnv` (không trả secret), `getRunHistory`, `getRequirements`, `getProjectNotes` | v1.2 | AI trả lời đúng "test nào đang dùng nút Lưu?" |
| AI-17 | **Ngữ cảnh trang đang mở**: accessibility tree, form/field, ảnh (theo AI-02); AI gọi `pickElement`/`highlight` để xác nhận | v1.2 | AI chỉ đúng field trên trang demo |
| AI-18 | **Thiết kế test bằng hội thoại**: hỏi lại quy tắc thiếu → đặc tả field + danh sách case (bảng cạnh chat, sửa bằng lời/tay) → chạy thử → diff → lưu khi duyệt | v1.2 | "Bỏ nhóm X, thêm case Y" bằng lời → bảng cập nhật đúng |
| AI-19 | **Gợi ý case còn thiếu**: theo `QC-COVERAGE.md` từng trang/form, lịch sử fail, yêu cầu chưa có test, UI thay đổi | v1.2 | Trên demo-site chỉ ra ≥ 3 nhóm kiểm tra còn thiếu cho trang danh sách |
| AI-20 | **Ghi chú dự án** (`.kiemi/notes.md`, dùng chung qua T-01): "nhớ rằng…" → đề xuất thêm, duyệt rồi lưu; AI đọc mỗi phiên | v1.2 | Lần chat sau AI áp dụng quy ước đã ghi |
| AI-21 | **Hàng rào hành động**: AI không tự lưu/xóa/chạy hàng loạt; mọi thay đổi qua diff + duyệt; không chạy step ghi trên Production (W-10); nhật ký hành động AI | v1.2 | Test tự động: AI cố lưu khi chưa duyệt → bị chặn |

### AI.1 Kịch bản mẫu: tạo test bằng chat
1. Người dùng: "Tôi cần test form đăng ký ở trang đang mở."
2. AI (AI-17) đọc form → liệt kê 5 field + quy tắc suy ra từ HTML (R-02) → hỏi lại quy tắc còn thiếu.
3. Người dùng trả lời → AI (AI-18, R-03) đề xuất ~48 case theo nhóm + 3 case nghiệp vụ bổ sung (AI-08).
4. Người dùng: "Bỏ nhóm dữ liệu xấu, thêm case SĐT 11 số" → bảng cập nhật.
5. AI chạy thử 3 case → báo kết quả → [Xem diff] [Lưu tất cả] [Lưu từng case] (AI-21).

## L. Mẫu & Onboarding (bổ sung)
| ID | Yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
|---|---|---|---|
| L-03 | **8 bộ test mẫu theo loại kiểm tra** đi kèm app (mô tả tiếng Việt, dữ liệu mẫu, chạy pass trên site mẫu): (1) Giỏ hàng & khuyến mãi, (2) Bảng lương + xuất Excel, (3) Ma trận phân quyền, (4) Tìm kiếm – lọc – sắp xếp – phân trang, (5) Import Excel & dòng lỗi, (6) Duyệt nhiều cấp + đối chiếu DB, (7) Validate form 5 field → ma trận, (8) Thao tác một nơi, kiểm tra nơi khác | v1.1 | Mỗi mẫu chạy pass trong CI; tester mới tự chạy được không cần chế độ Nâng cao |

## Ảnh hưởng kỹ thuật của Phần 2
- **Step DSL → `schemaVersion: 2`**: biến danh sách/object, tham chiếu công thức, dataset lồng nhau, trình xử lý popup, hook session, `{{env.baseUrl}}` → `{{app.<product>}}` (migration map baseURL cũ thành 1 sản phẩm mặc định). Migration v1 → v2 + test fixture v1.
- **R-03 mở rộng M-03**: giữ dữ liệu cũ, chuyển biến thể đã sinh sang mô hình đặc tả field.
- **DB mới**: `Product`, `EnvironmentType`, `EnvProductConfig`, `VariableScope`, `FieldSpec`, `FieldRule`, `RuleLibrary`, `MessageCatalog`, `Formula`, `TestPlan`, `TestCycle`, `CycleItem`, `ManualCase`, `ManualStepResult`, `Requirement`, `Integration`, `Notification`; test/element/sharedStep gắn `productId`.
- **ADR bắt buộc**: dự án dạng thư mục file là nguồn chính, SQLite chỉ index/cache + lịch sử chạy (T-01); engine công thức an toàn, không `eval` (P-03); driver DB `mssql`/`pg`/`mysql2` ở main process (X-05); `apps/cli` dùng chung engine, đóng gói cùng app (X-04); `packages/ai` chỉ ở main process, chính sách dữ liệu gửi đi (AI-01, AI-02).
- **Bảo mật**: chuỗi kết nối DB, token Jira/webhook lưu Secret; file dự án dùng chung chỉ chứa tên secret.
- **Demo-site** bổ sung (mỗi milestone thêm trang của mình): Shop, Bảng lương, Phân quyền 3 vai trò, Danh sách 500 dòng, Import/Export, Grid cuộn ảo, Control phức tạp, Basic auth + session 60s, Popup ngẫu nhiên, Gửi trùng, Form Đăng ký có lỗi cố ý, 2 app khác domain, Realtime (WebSocket), Khuyến mãi theo ngày + đếm ngược, Analytics giả, Trang đa ngôn ngữ thiếu dịch, Lỗ IDOR/XSS cố ý, link 404/ảnh lỗi.

## Ngoài phạm vi (không làm)
Load testing · Pentest · App mobile native · App desktop · Vượt captcha · Cloud/đồng bộ/tài khoản (để giai đoạn sau) · Tính phí/license.

---

## Lịch sử thay đổi
| Ngày | ID | Thay đổi | Lý do |
|---|---|---|---|
| 2026-11-16 | — | Phiên bản SPEC đầu tiên | |
| 2026-11-16 | N-11, N-12, N-13 | Thêm phát hành tự động, tự cập nhật, không cần cài thêm | Người dùng chỉ tải 1 lần rồi dùng |
| 2026-11-19 | — (thương hiệu) | Slogan đổi thành **"Let Kiemi do the checking."** (tiếng Anh cho mọi ngôn ngữ), bỏ "Bấm một lần, kiểm mãi mãi." | Người dùng thấy câu cũ không hay |
| 2026-11-19 | U-18 | Splash hiện tối thiểu ~1,8s (trước 0,5s), mờ dần chậm hơn | Người dùng thấy splash quá nhanh |
| 2026-11-16 | U-17, U-18 | Thêm chuyển động mượt toàn app (có Giảm chuyển động) và màn hình khởi động có linh vật | Giao diện bắt mắt hơn — người dùng chốt |
| 2026-11-16 | U-16, U-12, U-06 | Thêm linh vật Cú Kiemi (icon, chào mừng, màn trống, kết quả chạy); bo góc 10/16px, nền trạng thái pastel | Giao diện thân thiện, "cute" hơn — người dùng chốt phương án A |
| 2026-11-16 | N-11, N-12, N-14 | v1 phát hành **chưa ký code**; mac chưa ký chỉ thông báo bản mới; ký code tách thành N-14 (v1.x) | Chưa có chứng chỉ; người dùng chốt phát hành không ký |
| 2026-11-23 | O, FX, R, CV, P, Q, V, Y, W, T, X, AI, L-03 | Thêm **Phần 2 — Sẵn sàng cho dự án thật** (v1.1 → v1.2) từ đề xuất 0001; thay thế A-20, B-12, B-13, C-08, F-05 → F-08, H-07, H-08, I-06, I-07, J-05, M-04 → M-06; E-02 mở rộng bởi O-04, M-03 mở rộng bởi R-03; V-05 bỏ (thay O-02) | Dùng được cho QC ở mọi dự án web thật — người dùng chốt |

---

## Phụ lục 1 — Step DSL v1 (định hướng)
```json
{
  "schemaVersion": 1,
  "id": "0193…",
  "name": "Tạo đơn ở A, quản lý thấy ở B",
  "tags": ["smoke"],
  "sessions": ["nhanvien", "quanly"],
  "dataset": { "source": "excel", "file": "don-nghi.xlsx" },
  "steps": [
    { "id": "s1", "session": "nhanvien", "action": "goto", "params": { "url": "{{env.portalUrl}}" } },
    { "id": "s2", "session": "nhanvien", "action": "call", "params": { "shared": "login", "args": { "user": "{{secret.nvUser}}", "pass": "{{secret.nvPass}}" } } },
    { "id": "s3", "session": "nhanvien", "action": "fill", "params": { "target": { "ref": "el_soNgay" }, "value": "{{row.soNgay}}" } },
    { "id": "s4", "session": "nhanvien", "action": "click", "params": { "target": { "ref": "el_btnGui" } } },
    { "id": "s5", "session": "nhanvien", "action": "extract", "params": { "target": { "ref": "el_maDon" }, "into": "maDon" } },
    { "id": "s6", "session": "quanly", "action": "waitUntil", "params": { "condition": { "assert": "visible", "target": { "text": "{{maDon}}" } }, "timeoutSec": 60, "reloadEverySec": 5 } },
    { "id": "s7", "session": "quanly", "action": "assertText", "params": { "target": { "ref": "el_lyDo" }, "op": "equals", "value": "{{row.lyDo}}" }, "mode": "soft" }
  ],
  "cleanup": [
    { "id": "c1", "session": "nhanvien", "action": "api", "params": { "method": "DELETE", "url": "{{env.apiUrl}}/don/{{maDon}}" } }
  ]
}
```

## Phụ lục 2 — Data model (định hướng)
`Workspace` · `Project` · `Folder` · `TestCase` · `Suite` · `SuiteItem` · `SharedStep` · `Element` (locator strategies + fingerprint) · `Environment` · `Variable` · `Secret` · `Dataset` · `Run` · `RunCase` · `RunStep` · `Artifact` (ảnh/video/trace) · `Setting`.
Mọi bảng: `id` UUIDv7, `workspaceId`, `createdAt`, `updatedAt`, `deletedAt`, `version`.
