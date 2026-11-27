import { type FieldSpecInput, type FormSpec, FormSpecSchema } from '@kiemi/schema';
import { exportBundle, importBundle } from './io/bundle';
import type { Services } from './services';

/**
 * Checklist templates by project type [R-15]: folders of empty tests (names
 * only — the tester records or writes the steps), one suite with all of them,
 * and form specs with the fields usually found in that kind of app.
 */
export interface ProjectTemplate {
  key: string;
  /** Vietnamese label and one-line description shown in the picker. */
  name: string;
  description: string;
  groups: { folder: string; tests: string[] }[];
  forms: { name: string; fields: FieldSpecInput[] }[];
}

const text = (key: string, label: string, extra: Partial<FieldSpecInput> = {}): FieldSpecInput => ({
  key,
  label,
  type: 'text',
  ...extra,
});
const required = { required: true } as const;

const LOGIN = {
  folder: 'Đăng nhập & phân quyền',
  tests: [
    'Đăng nhập đúng tài khoản',
    'Đăng nhập sai mật khẩu báo lỗi',
    'Đăng xuất rồi quay lại không vào được trang trong',
    'Tài khoản không đủ quyền không thấy chức năng',
  ],
};
const crud = (what: string) => ({
  folder: `Quản lý ${what}`,
  tests: [
    `Danh sách ${what} hiện đúng dữ liệu`,
    `Tìm kiếm ${what}`,
    `Thêm mới ${what} hợp lệ`,
    `Thêm mới ${what} bỏ trống ô bắt buộc báo lỗi`,
    `Sửa ${what} rồi mở lại thấy giá trị mới`,
    `Xóa ${what} có hộp thoại xác nhận`,
    `Phân trang danh sách ${what}`,
  ],
});

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: 'admin-crud',
    name: 'Trang quản trị (CRUD)',
    description: 'Danh sách, thêm/sửa/xóa, tìm kiếm, phân trang, phân quyền.',
    groups: [
      LOGIN,
      crud('bản ghi'),
      { folder: 'Xuất nhập', tests: ['Xuất danh sách ra Excel', 'Nhập từ Excel báo dòng lỗi'] },
    ],
    forms: [
      {
        name: 'Biểu mẫu thêm bản ghi',
        fields: [
          text('name', 'Tên', { ...required, maxLength: 100 }),
          text('email', 'Email', { type: 'email', unique: true }),
          text('note', 'Ghi chú', { type: 'textarea', maxLength: 500 }),
        ],
      },
    ],
  },
  {
    key: 'ecommerce',
    name: 'Thương mại điện tử',
    description: 'Tìm sản phẩm, giỏ hàng, thanh toán, đơn hàng.',
    groups: [
      { folder: 'Tài khoản khách', tests: ['Đăng ký tài khoản mới', 'Đăng nhập', 'Quên mật khẩu'] },
      {
        folder: 'Sản phẩm',
        tests: [
          'Tìm sản phẩm theo tên',
          'Lọc theo giá và danh mục',
          'Xem chi tiết sản phẩm',
          'Sản phẩm hết hàng không cho mua',
        ],
      },
      {
        folder: 'Giỏ hàng & thanh toán',
        tests: [
          'Thêm vào giỏ',
          'Đổi số lượng cập nhật tổng tiền',
          'Áp mã giảm giá hợp lệ',
          'Áp mã giảm giá hết hạn báo lỗi',
          'Đặt hàng thành công',
          'Địa chỉ giao hàng bỏ trống báo lỗi',
        ],
      },
      { folder: 'Đơn hàng', tests: ['Xem lịch sử đơn hàng', 'Hủy đơn khi chưa giao'] },
    ],
    forms: [
      {
        name: 'Địa chỉ giao hàng',
        fields: [
          text('fullName', 'Họ tên', required),
          text('phone', 'Số điện thoại', { type: 'phone', ...required }),
          text('address', 'Địa chỉ', { ...required, maxLength: 255 }),
          text('coupon', 'Mã giảm giá'),
        ],
      },
    ],
  },
  {
    key: 'hrm',
    name: 'Nhân sự / ERP / lương',
    description: 'Hồ sơ nhân viên, nghỉ phép, chấm công, bảng lương.',
    groups: [
      LOGIN,
      {
        folder: 'Hồ sơ nhân viên',
        tests: [
          'Thêm nhân viên mới',
          'Mã nhân viên không được trùng',
          'Cập nhật thông tin cá nhân',
          'Nhân viên nghỉ việc không còn trong danh sách đang làm',
        ],
      },
      {
        folder: 'Nghỉ phép',
        tests: [
          'Tạo đơn nghỉ phép',
          'Ngày kết thúc nhỏ hơn ngày bắt đầu báo lỗi',
          'Quản lý duyệt đơn',
          'Số ngày phép còn lại trừ đúng sau khi duyệt',
        ],
      },
      {
        folder: 'Chấm công & lương',
        tests: [
          'Chấm công vào/ra',
          'Tính lương đúng theo công thức',
          'Xuất phiếu lương',
          'Chỉ HR xem được lương người khác',
        ],
      },
    ],
    forms: [
      {
        name: 'Hồ sơ nhân viên',
        fields: [
          text('code', 'Mã nhân viên', { ...required, unique: true, maxLength: 20 }),
          text('fullName', 'Họ tên', { ...required, maxLength: 100 }),
          text('birthday', 'Ngày sinh', { type: 'date', ...required }),
          text('phone', 'Số điện thoại', { type: 'phone' }),
          text('salary', 'Lương cơ bản', { type: 'money', min: 0 }),
        ],
      },
    ],
  },
  {
    key: 'finance',
    name: 'Tài chính / ngân hàng',
    description: 'Số dư, chuyển khoản, sao kê, hạn mức, làm tròn tiền.',
    groups: [
      LOGIN,
      { folder: 'Tài khoản', tests: ['Xem số dư', 'Sao kê theo khoảng ngày', 'Xuất sao kê PDF'] },
      {
        folder: 'Giao dịch',
        tests: [
          'Chuyển khoản hợp lệ',
          'Số tiền lớn hơn số dư báo lỗi',
          'Vượt hạn mức ngày báo lỗi',
          'Số tiền âm hoặc bằng 0 báo lỗi',
          'Nhập OTP sai báo lỗi',
          'Giao dịch ghi đúng số dư sau khi chuyển',
        ],
      },
    ],
    forms: [
      {
        name: 'Chuyển khoản',
        fields: [
          text('toAccount', 'Số tài khoản nhận', {
            ...required,
            allowedChars: 'digits',
            minLength: 8,
            maxLength: 16,
          }),
          text('amount', 'Số tiền', { type: 'money', ...required, min: 1 }),
          text('content', 'Nội dung', { maxLength: 140 }),
        ],
      },
    ],
  },
  {
    key: 'booking',
    name: 'Đặt chỗ / đặt lịch',
    description: 'Chọn ngày giờ, chống đặt trùng, hủy và đổi lịch.',
    groups: [
      {
        folder: 'Đặt chỗ',
        tests: [
          'Đặt chỗ ngày giờ còn trống',
          'Không đặt được khung giờ đã đầy',
          'Không đặt ngày trong quá khứ',
          'Hai người cùng đặt một chỗ chỉ một người thành công',
        ],
      },
      {
        folder: 'Quản lý lịch',
        tests: ['Đổi lịch', 'Hủy lịch trả lại chỗ trống', 'Nhận email xác nhận'],
      },
    ],
    forms: [
      {
        name: 'Đặt lịch',
        fields: [
          text('date', 'Ngày', { type: 'date', ...required }),
          text('guests', 'Số người', { type: 'number', ...required, min: 1, max: 20 }),
          text('phone', 'Số điện thoại', { type: 'phone', ...required }),
        ],
      },
    ],
  },
  {
    key: 'cms',
    name: 'Quản lý nội dung (CMS)',
    description: 'Bài viết, bản nháp/xuất bản, ảnh, SEO, phân quyền biên tập.',
    groups: [
      LOGIN,
      {
        folder: 'Bài viết',
        tests: [
          'Tạo bài nháp',
          'Xuất bản bài hiện ngoài trang công khai',
          'Gỡ bài khỏi trang công khai',
          'Tải ảnh đại diện',
          'Tiêu đề trùng báo lỗi',
        ],
      },
      {
        folder: 'Biên tập',
        tests: ['Biên tập viên không xuất bản được khi cần duyệt', 'Lịch sử chỉnh sửa'],
      },
    ],
    forms: [
      {
        name: 'Bài viết',
        fields: [
          text('title', 'Tiêu đề', { ...required, maxLength: 150, unique: true }),
          text('slug', 'Đường dẫn', { allowedChars: 'no-special' }),
          text('body', 'Nội dung', { type: 'textarea', ...required }),
        ],
      },
    ],
  },
  {
    key: 'lms',
    name: 'Học trực tuyến (LMS)',
    description: 'Khóa học, bài học, bài kiểm tra, điểm, chứng chỉ.',
    groups: [
      LOGIN,
      {
        folder: 'Khóa học',
        tests: [
          'Ghi danh khóa học',
          'Học viên chưa ghi danh không xem được bài',
          'Đánh dấu hoàn thành bài học',
        ],
      },
      {
        folder: 'Kiểm tra',
        tests: [
          'Làm bài kiểm tra và nộp',
          'Hết giờ tự nộp bài',
          'Điểm tính đúng',
          'Giới hạn số lần làm lại',
        ],
      },
      { folder: 'Chứng chỉ', tests: ['Hoàn thành khóa nhận chứng chỉ'] },
    ],
    forms: [
      {
        name: 'Ghi danh',
        fields: [
          text('fullName', 'Họ tên', required),
          text('email', 'Email', { type: 'email', ...required }),
        ],
      },
    ],
  },
];

export function templateByKey(key: string): ProjectTemplate {
  const t = PROJECT_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`Unknown project template: ${key}`);
  return t;
}

/** Creates a project with the template's folders, empty tests, suite and form specs. */
export function createProjectFromTemplate(
  services: Services,
  key: string,
  name: string,
): { projectId: string; testCount: number } {
  const tpl = templateByKey(key);
  const project = services.projects.create({ name, description: tpl.description });
  const ids: string[] = [];
  for (const g of tpl.groups) {
    const folder = services.folders.create({ projectId: project.id, name: g.folder });
    for (const n of g.tests) {
      const t = services.testCases.create({ projectId: project.id, folderId: folder.id, name: n });
      ids.push(t.id);
    }
  }
  const suite = services.suites.create({ projectId: project.id, name: `Checklist ${tpl.name}` });
  services.suites.setItems(
    suite.id,
    ids.map((testCaseId) => ({ testCaseId })),
  );
  const forms: FormSpec[] = tpl.forms.map((f, i) =>
    FormSpecSchema.parse({ id: `${tpl.key}-${i + 1}`, name: f.name, fields: f.fields }),
  );
  services.projects.setFormSpecs(project.id, forms);
  return { projectId: project.id, testCount: ids.length };
}

/**
 * Copy of a project [O-12]: tests, folders, suites, environments through its
 * bundle, plus the project-level settings the bundle does not carry. Things
 * that point at old ids (test plans, links manual→automated test, forms'
 * product) are cleared instead of left dangling.
 */
export function cloneProject(services: Services, projectId: string, name: string): string {
  const out = exportBundle(services, { projectId });
  const newId = importBundle(services, out.data, { projectName: name }).projectId;
  const p = services.projects;
  p.setPopupRules(newId, p.popupRules(projectId));
  p.setMessageCatalog(newId, p.messageCatalog(projectId));
  p.setFormulas(newId, p.formulas(projectId));
  p.setPages(newId, p.pages(projectId));
  p.setPermissionMatrices(newId, p.permissionMatrices(projectId));
  p.setFormSpecs(
    newId,
    p.formSpecs(projectId).map((f) => ({ ...f, productId: null })),
  );
  p.setManualCases(
    newId,
    p.manualCases(projectId).map((c) => {
      const { automatedTestId: _drop, ...rest } = c;
      return rest;
    }),
  );
  p.setVariables(newId, p.get(projectId).variables ?? {});
  return newId;
}
