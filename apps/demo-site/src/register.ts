import { $, initPage } from './common';

void initPage();

/**
 * Form Đăng ký 5 ô để thử kiểm tra form [R-01 → R-09]. Quy tắc theo SPEC R.1.
 * `?bug=` bật lỗi cố ý (nhiều lỗi: `?bug=msg,clear`).
 */
const bugs = new Set((new URLSearchParams(location.search).get('bug') ?? '').split(','));
const KEY = 'kiemi-demo-accounts';

type Fields = 'fullname' | 'email' | 'phone' | 'dob' | 'password';
const ORDER: Fields[] = ['fullname', 'email', 'phone', 'dob', 'password'];

interface Account {
  fullname: string;
  email: string;
  phone: string;
  dob: string;
}
const load = (): Account[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Account[];
  } catch {
    return [];
  }
};

const input = (k: Fields) => $<HTMLInputElement>(`#${k}`);

function parseDob(v: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCDate() === d && date.getUTCMonth() === mo - 1 ? date : null;
}

function validate(v: Record<Fields, string>): Partial<Record<Fields, string>> {
  const e: Partial<Record<Fields, string>> = {};
  const name = v.fullname.trim();
  if (!name) e.fullname = 'Họ tên là bắt buộc';
  else if (name.length < 2) e.fullname = 'Họ tên phải có ít nhất 2 ký tự';
  else if (name.length > 50) e.fullname = 'Họ tên không được vượt quá 50 ký tự';
  else if (!/^[\p{L}\p{M} ]+$/u.test(name)) e.fullname = 'Họ tên không hợp lệ';

  const email = v.email.trim();
  if (!email) e.email = 'Email là bắt buộc';
  else if (email.length > 100)
    e.email = bugs.has('msg')
      ? 'Email không được vượt quá 50 ký tự'
      : 'Email không được vượt quá 100 ký tự';
  else if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}$/.test(email))
    e.email = 'Email không hợp lệ';
  else if (load().some((a) => a.email === email)) e.email = 'Email đã tồn tại';

  if (v.phone.trim() && !/^0\d{9}$/.test(v.phone.trim())) e.phone = 'Số điện thoại không hợp lệ';

  const dob = parseDob(v.dob.trim());
  if (!v.dob.trim()) e.dob = 'Ngày sinh là bắt buộc';
  else if (!dob) e.dob = 'Ngày sinh không hợp lệ';
  else if (dob.getTime() > Date.now()) e.dob = 'Ngày sinh không được ở tương lai';
  else if (Date.now() - dob.getTime() < 18 * 365.25 * 86_400_000) e.dob = 'Bạn phải đủ 18 tuổi';

  const pw = v.password;
  if (!pw) e.password = 'Mật khẩu là bắt buộc';
  else if (pw.length > 32) e.password = 'Mật khẩu không được vượt quá 32 ký tự';
  else if (
    pw.length < 8 ||
    !/[A-Z]/.test(pw) ||
    !/[a-z]/.test(pw) ||
    !/\d/.test(pw) ||
    !/[^A-Za-z0-9]/.test(pw)
  )
    e.password = 'Mật khẩu phải có ít nhất 8 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt';
  return e;
}

function showSaved(a: Account): void {
  $('#saved').hidden = false;
  $<HTMLInputElement>('#saved-fullname').value = a.fullname;
  $<HTMLInputElement>('#saved-email').value = a.email;
  $<HTMLInputElement>('#saved-phone').value = a.phone;
  $<HTMLInputElement>('#saved-dob').value = a.dob;
}

function save(v: Record<Fields, string>): void {
  let fullname = bugs.has('trim') ? v.fullname : v.fullname.trim();
  if (bugs.has('accent')) fullname = fullname.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const a: Account = { fullname, email: v.email.trim(), phone: v.phone.trim(), dob: v.dob.trim() };
  localStorage.setItem(KEY, JSON.stringify([...load(), a]));
  showSaved(a);
  $('#register-result').textContent = 'Đăng ký thành công';
}

$('#register').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = Object.fromEntries(ORDER.map((k) => [k, input(k).value])) as Record<Fields, string>;
  const errors = validate(v);
  for (const k of ORDER) {
    // Lỗi cố ý: thông báo của SĐT hiện ở chỗ của Email.
    const slot = bugs.has('field') && k === 'phone' ? 'email' : k;
    if (k !== 'phone' || !bugs.has('field')) $(`#err-${k}`).textContent = '';
    if (errors[k]) $(`#err-${slot}`).textContent = errors[k] ?? '';
    input(k).setAttribute('aria-invalid', errors[k] ? 'true' : 'false');
  }
  const first = ORDER.find((k) => errors[k]);
  if (!first) {
    save(v);
    return;
  }
  $('#register-result').textContent = 'Có lỗi, chưa gửi';
  if (bugs.has('sent')) save(v);
  if (bugs.has('clear')) for (const k of ORDER) input(k).value = '';
  if (!bugs.has('nofocus')) input(first).focus();
});
