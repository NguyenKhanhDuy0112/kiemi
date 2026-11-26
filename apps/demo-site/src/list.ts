import { $, api, escapeHtml, initPage } from './common';
import { vnd } from './shop-calc';

interface Person {
  code: string;
  name: string;
  dept: string;
  salary: number;
  joined: string;
}
interface Result {
  items: Person[];
  page: number;
  total: number;
  totalPages: number;
  departments: string[];
}

void initPage();

const bug = new URLSearchParams(location.search).get('bug') ?? '';
const q = $<HTMLInputElement>('#q');
const dept = $<HTMLSelectElement>('#dept');
const prev = $<HTMLButtonElement>('#prev');
const next = $<HTMLButtonElement>('#next');
let page = 1;
let sort = 'code';
let dir: 'asc' | 'desc' = 'asc';
let request = 0;
let filled = false;

async function load(): Promise<void> {
  const id = ++request;
  $('#loading').hidden = false;
  const params = new URLSearchParams({
    q: q.value,
    dept: dept.value,
    sort,
    dir,
    page: String(page),
    pageSize: '20',
  });
  if (bug) params.set('bug', bug);
  const { data } = await api<Result>(`/api/people?${params}`);
  if (id !== request) return;
  $('#loading').hidden = true;
  if (!filled) {
    dept.insertAdjacentHTML(
      'beforeend',
      data.departments.map((d) => `<option>${escapeHtml(d)}</option>`).join(''),
    );
    filled = true;
  }
  page = data.page;
  $('#people-table tbody').innerHTML = data.items.length
    ? data.items
        .map(
          (p) => `<tr><td>${p.code}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.dept)}</td>
            <td>${vnd(p.salary)}</td><td>${p.joined}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="empty">Không có nhân viên phù hợp</td></tr>';
  $('#page-label').textContent = `Trang ${page}/${data.totalPages}`;
  $('#total-label').textContent = `Tổng ${data.total} bản ghi`;
  prev.disabled = page <= 1;
  next.disabled = page >= data.totalPages;
  for (const b of document.querySelectorAll<HTMLElement>('[data-sort]'))
    b.setAttribute(
      'aria-sort',
      b.dataset.sort === sort ? (dir === 'asc' ? 'ascending' : 'descending') : 'none',
    );
}

let debounce: ReturnType<typeof setTimeout> | undefined;
q.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    page = 1;
    void load();
  }, 300);
});
dept.addEventListener('change', () => {
  page = 1;
  void load();
});
prev.addEventListener('click', () => {
  page -= 1;
  void load();
});
next.addEventListener('click', () => {
  page += 1;
  void load();
});
document.addEventListener('click', (e) => {
  const key = (e.target as HTMLElement).closest<HTMLElement>('[data-sort]')?.dataset.sort;
  if (!key) return;
  dir = key === sort && dir === 'asc' ? 'desc' : 'asc';
  sort = key;
  page = 1;
  void load();
});
void load();
