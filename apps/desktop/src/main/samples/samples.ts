import type { Services } from '@kiemi/db';
import {
  CURRENT_SCHEMA_VERSION,
  type FormSpec,
  FormSpecSchema,
  type StepInput as FullStepInput,
  generateFormCases,
  TestCaseSchema,
} from '@kiemi/schema';
import ExcelJS from 'exceljs';
import { v7 as uuidv7 } from 'uuid';
import { generateFormTests } from '../forms/generate-tests';
import { installDataSamples } from './samples-data';

/** Name of the project holding the sample tests (one per workspace) [L-01]. */
export const SAMPLE_PROJECT = 'Dự án mẫu';
export const SAMPLE_ENV = 'Trang mẫu Kiemi';
export const SAMPLE_FOLDER = 'Test mẫu';
/** The sample site prefers this port so its address is stable between launches. */
export const SAMPLE_PORT = 47180;

/** A step before it gets its id (`s1`, `s2`… in order). */
type StepInput = Omit<FullStepInput, 'id'>;

const el = (name: string, ...strategies: Record<string, unknown>[]) => ({ name, strategies });

/** Elements of the demo site, shown to testers by name (U-03). */
const ELEMENTS = {
  el_tenDangNhap: el('Ô Tên đăng nhập', { kind: 'label', value: 'Tên đăng nhập' }),
  el_matKhau: el('Ô Mật khẩu', { kind: 'label', value: 'Mật khẩu' }),
  el_btnDangNhap: el('Nút Đăng nhập', { kind: 'role', role: 'button', name: 'Đăng nhập' }),
  el_nguoiDung: el('Tên người đang đăng nhập', { kind: 'testId', value: 'current-user' }),
  el_loaiNghi: el(
    'Danh sách Loại nghỉ',
    { kind: 'role', role: 'button', name: 'Loại nghỉ' },
    { kind: 'css', value: '#type-trigger' },
  ),
  el_tuNgay: el('Ô Từ ngày', { kind: 'label', value: 'Từ ngày' }),
  el_soNgay: el('Ô Số ngày', { kind: 'label', value: 'Số ngày' }),
  el_lyDo: el('Ô Lý do', { kind: 'label', value: 'Lý do' }),
  el_btnGui: el('Nút Gửi đơn', { kind: 'role', role: 'button', name: 'Gửi đơn' }),
  el_maDon: el('Mã đơn', { kind: 'css', value: '#ma-don' }),
  el_bangDon: el(
    'Bảng đơn nghỉ',
    { kind: 'role', role: 'table' },
    { kind: 'css', value: '#requests-table' },
  ),
} as const;
type ElementKey = keyof typeof ELEMENTS;

const ref = (key: ElementKey) => ({ ref: key });

function doc(input: {
  name: string;
  description: string;
  tags: string[];
  uses: ElementKey[];
  steps: StepInput[];
  sessions?: string[];
  variables?: Record<string, string>;
  datasetId?: string;
  cleanup?: StepInput[];
}) {
  return TestCaseSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: uuidv7(),
    name: input.name,
    description: input.description,
    tags: input.tags,
    sessions: input.sessions ?? ['default'],
    elements: Object.fromEntries(input.uses.map((k) => [k, ELEMENTS[k]])),
    variables: input.variables ?? {},
    ...(input.datasetId ? { dataset: { source: 'saved', datasetId: input.datasetId } } : {}),
    steps: input.steps.map((s, i) => ({ ...s, id: `s${i + 1}` })),
    cleanup: (input.cleanup ?? []).map((s, i) => ({ ...s, id: `c${i + 1}` })),
  });
}

/** The sample Excel file, built in memory and imported like a tester would [L-01, E-03]. */
export async function sampleWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Đơn nghỉ');
  ws.addRow(['loai', 'soNgay', 'lyDo']);
  ws.addRow(['Nghỉ phép năm', 2, 'Về quê']);
  ws.addRow(['Nghỉ ốm', 1, 'Đi khám bệnh']);
  ws.addRow(['Nghỉ không lương', 3, 'Việc gia đình']);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Fills in the leave form (used by samples 2 and 4). */
function leaveFormSteps(v: { loai: string; soNgay: string; lyDo: string }): StepInput[] {
  return [
    { action: 'select', params: { target: ref('el_loaiNghi'), option: v.loai } },
    { action: 'pickDate', params: { target: ref('el_tuNgay'), value: '{{today + 7d}}' } },
    { action: 'fill', params: { target: ref('el_soNgay'), value: v.soNgay } },
    { action: 'fill', params: { target: ref('el_lyDo'), value: v.lyDo } },
    { action: 'click', params: { target: ref('el_btnGui') } },
  ];
}

const FORM_ELEMENTS: ElementKey[] = [
  'el_loaiNghi',
  'el_tuNgay',
  'el_soNgay',
  'el_lyDo',
  'el_btnGui',
];

const byCss = (value: string) => ({ strategies: [{ kind: 'css' as const, value }] });

/** Field specification of the sample site's registration page (SPEC R.1) [L-03 #7]. */
export function registerFormSpec(): FormSpec {
  return FormSpecSchema.parse({
    id: 'dang-ky-mau',
    name: 'Validate form Đăng ký',
    path: '/register.html',
    submit: { strategies: [{ kind: 'role', role: 'button', name: 'Đăng ký' }] },
    successMessage: 'Đăng ký thành công',
    fields: [
      {
        key: 'fullname',
        label: 'Họ tên',
        locator: byCss('#fullname'),
        required: true,
        minLength: 2,
        maxLength: 50,
        readBack: byCss('#saved-fullname'),
      },
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        locator: byCss('#email'),
        required: true,
        maxLength: 100,
        unique: true,
        readBack: byCss('#saved-email'),
      },
      {
        key: 'phone',
        label: 'Số điện thoại',
        type: 'phone',
        locator: byCss('#phone'),
        ruleRefs: ['vn-phone'],
        readBack: byCss('#saved-phone'),
      },
      {
        key: 'dob',
        label: 'Ngày sinh',
        locator: byCss('#dob'),
        required: true,
        example: '15/06/1990',
        badData: false,
      },
      {
        key: 'password',
        label: 'Mật khẩu',
        type: 'password',
        locator: byCss('#password'),
        required: true,
        ruleRefs: ['strong-password'],
        maxLength: 32,
      },
    ],
  });
}

/**
 * Creates (once) the sample project: environment pointing at the bundled sample site,
 * a shared "Đăng nhập" step, an Excel dataset and the 4 sample tests [L-01].
 * Returns the existing project when it is already there.
 */
export async function installSamples(
  services: Services,
  baseUrl: string,
): Promise<{ projectId: string; created: boolean; firstTestId: string | null }> {
  const existing = services.projects.list().find((p) => p.name === SAMPLE_PROJECT);
  if (existing) {
    syncSampleEnvironment(services, baseUrl);
    const first = services.testCases.list(existing.id)[0];
    return { projectId: existing.id, created: false, firstTestId: first?.id ?? null };
  }
  const workbook = await sampleWorkbook();
  const project = services.projects.create({
    name: SAMPLE_PROJECT,
    description: 'Ví dụ có sẵn chạy trên trang mẫu đi kèm ứng dụng.',
  });
  const projectId = project.id;
  const env = services.environments.create({ projectId, name: SAMPLE_ENV, baseUrl });
  services.environments.setVariables(env.id, { nguoiDung: 'nhanvien', quanLy: 'quanly' });
  services.environments.setSecret(env.id, 'matKhau', '123456');

  const login = services.sharedSteps.create({
    projectId,
    name: 'Đăng nhập',
    params: ['user', 'pass'],
    steps: [
      { id: 'l1', action: 'goto', params: { url: '/login.html' } },
      {
        id: 'l2',
        action: 'fill',
        params: { target: { label: 'Tên đăng nhập' }, value: '{{param.user}}' },
      },
      {
        id: 'l3',
        action: 'fill',
        params: { target: { label: 'Mật khẩu' }, value: '{{param.pass}}' },
      },
      { id: 'l4', action: 'click', params: { target: { role: 'button', name: 'Đăng nhập' } } },
    ],
  });
  const loginAs = (user: string, session?: string): StepInput => ({
    action: 'call',
    params: { shared: login.id, args: { user, pass: '{{secret.matKhau}}' } },
    ...(session ? { session } : {}),
  });
  const dataset = await services.datasets.importExcel(
    projectId,
    'Đơn nghỉ mẫu',
    'don-nghi-mau.xlsx',
    workbook,
  );
  const folder = services.folders.create({ projectId, name: SAMPLE_FOLDER });
  const reset: StepInput = { action: 'api', params: { method: 'POST', url: '/api/reset' } };

  const docs = [
    doc({
      name: '1. Đăng nhập',
      description: 'Mở trang đăng nhập, nhập tài khoản và kiểm tra đã vào được.',
      tags: ['mẫu'],
      uses: ['el_tenDangNhap', 'el_matKhau', 'el_btnDangNhap', 'el_nguoiDung'],
      steps: [
        { action: 'goto', params: { url: '/login.html' } },
        { action: 'fill', params: { target: ref('el_tenDangNhap'), value: '{{nguoiDung}}' } },
        { action: 'fill', params: { target: ref('el_matKhau'), value: '{{secret.matKhau}}' } },
        { action: 'click', params: { target: ref('el_btnDangNhap') } },
        { action: 'assertUrl', params: { op: 'contains', value: '/form.html' } },
        {
          action: 'assertText',
          params: { target: ref('el_nguoiDung'), op: 'contains', value: 'Nguyễn Văn An' },
        },
      ],
    }),
    doc({
      name: '2. Điền form và kiểm tra thông báo',
      description: 'Tạo đơn nghỉ rồi kiểm tra thông báo thành công và mã đơn.',
      tags: ['mẫu'],
      uses: [...FORM_ELEMENTS, 'el_maDon'],
      steps: [
        loginAs('{{nguoiDung}}'),
        ...leaveFormSteps({ loai: 'Nghỉ phép năm', soNgay: '2', lyDo: 'Về quê ăn cưới' }),
        { action: 'assertToast', params: { text: 'Tạo đơn thành công' } },
        { action: 'assertText', params: { target: ref('el_maDon'), op: 'notEmpty' } },
      ],
      cleanup: [reset],
    }),
    doc({
      name: '3. Nhân viên tạo đơn → quản lý thấy và duyệt',
      description:
        'Hai người dùng cùng lúc: nhân viên gửi đơn, quản lý chờ đơn hiện ra (đồng bộ trễ) rồi duyệt.',
      tags: ['mẫu', 'nhiều phiên'],
      sessions: ['nhanvien', 'quanly'],
      uses: [...FORM_ELEMENTS, 'el_maDon', 'el_bangDon'],
      steps: [
        loginAs('{{nguoiDung}}', 'nhanvien'),
        ...leaveFormSteps({ loai: 'Nghỉ ốm', soNgay: '1', lyDo: 'Đi khám bệnh' }).map((s) => ({
          ...s,
          session: 'nhanvien',
        })),
        {
          session: 'nhanvien',
          action: 'extract',
          params: { target: ref('el_maDon'), into: 'maDon' },
        },
        { session: 'quanly', action: 'switchSession', params: {} },
        loginAs('{{quanLy}}', 'quanly'),
        {
          session: 'quanly',
          action: 'waitUntil',
          params: {
            condition: { assert: 'visible', target: { text: '{{maDon}}' } },
            timeoutSec: 30,
            intervalSec: 0.5,
            reloadEverySec: 1,
          },
        },
        {
          session: 'quanly',
          action: 'assertTable',
          params: {
            target: ref('el_bangDon'),
            where: { column: 'Mã đơn', value: '{{maDon}}' },
            column: 'Lý do',
            value: 'Đi khám bệnh',
          },
        },
        {
          session: 'quanly',
          action: 'click',
          params: {
            target: {
              strategies: [{ kind: 'role', role: 'button', name: 'Duyệt' }],
              scope: [{ kind: 'row', text: '{{maDon}}' }],
            },
          },
        },
        { session: 'quanly', action: 'assertToast', params: { text: 'Đã duyệt đơn {{maDon}}' } },
      ],
      cleanup: [{ ...reset, session: 'nhanvien' }],
    }),
    doc({
      name: '4. Chạy theo dữ liệu Excel',
      description: 'Mỗi dòng trong file Excel "don-nghi-mau.xlsx" là một lần chạy.',
      tags: ['mẫu', 'dữ liệu'],
      uses: [...FORM_ELEMENTS],
      datasetId: dataset.id,
      steps: [
        loginAs('{{nguoiDung}}'),
        ...leaveFormSteps({ loai: '{{row.loai}}', soNgay: '{{row.soNgay}}', lyDo: '{{row.lyDo}}' }),
        { action: 'assertToast', params: { text: 'Tạo đơn thành công' } },
      ],
      cleanup: [reset],
    }),
  ];
  const rows = docs.map((d) => services.testCases.insertDocument(projectId, folder.id, d));
  const suite = services.suites.create({
    projectId,
    name: 'Tất cả test mẫu',
    environmentId: env.id,
  });
  services.suites.setItems(
    suite.id,
    rows.map((r) => ({ testCaseId: r.id })),
  );

  // L-03 #7: "Validate form" — the spec, its pages and the tests generated from it.
  const form = registerFormSpec();
  services.projects.setFormSpecs(projectId, [form]);
  services.projects.setPages(projectId, [
    { id: 'p-dang-ky', name: 'Đăng ký', path: '/register.html', kind: 'form' },
  ]);
  const generated = generateFormTests(services, {
    projectId,
    formId: form.id,
    caseIds: generateFormCases(form)
      .filter((c) => c.selected)
      .map((c) => c.id),
  });
  const formSuite = services.suites.create({
    projectId,
    name: 'Validate form Đăng ký',
    environmentId: env.id,
  });
  services.suites.setItems(
    formSuite.id,
    services.testCases.list(projectId, generated.folderId).map((t) => ({ testCaseId: t.id })),
  );
  // L-03 #1, #2, #4, #5: data & calculation samples.
  installDataSamples(services, projectId, env.id);
  return { projectId, created: true, firstTestId: rows[0]?.id ?? null };
}

/** Points the sample environment at the sample site's current address. */
export function syncSampleEnvironment(services: Services, baseUrl: string): void {
  const project = services.projects.list().find((p) => p.name === SAMPLE_PROJECT);
  if (!project) return;
  const row = services.environments.list(project.id).find((e) => e.name === SAMPLE_ENV);
  // The URL lives in the "Web" cell [O-02].
  if (row && services.environments.get(row.id).baseUrl !== baseUrl)
    services.environments.update(row.id, { baseUrl });
}
