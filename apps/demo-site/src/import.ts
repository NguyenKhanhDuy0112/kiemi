import { $, api, escapeHtml, initPage } from './common';
import { vnd } from './shop-calc';

interface Row {
  code: string;
  name: string;
  email: string;
  salary: number;
}

void initPage();

async function refresh(): Promise<void> {
  const { data } = await api<{ imported: Row[] }>('/api/import');
  $('#imported-table tbody').innerHTML = data.imported
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.email)}</td><td>${vnd(r.salary)}</td></tr>`,
    )
    .join('');
  $('#imported-count').textContent = `Đã nhập ${data.imported.length} nhân viên`;
}

$('#upload').addEventListener('click', async () => {
  const file = $<HTMLInputElement>('#file').files?.[0];
  const result = $('#result');
  const errors = $('#errors');
  errors.innerHTML = '';
  if (!file) {
    result.textContent = 'Hãy chọn file trước';
    return;
  }
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: {
      'x-file-name': encodeURIComponent(file.name),
      'content-type': 'application/octet-stream',
    },
    body: await file.arrayBuffer(),
  });
  const data = (await res.json()) as {
    total?: number;
    imported?: number;
    errors?: { row: number; message: string }[];
    error?: string;
  };
  if (!res.ok) {
    result.textContent = data.error ?? 'Nhập thất bại';
    return;
  }
  const bad = data.errors ?? [];
  result.textContent = `Đã nhập ${data.imported}/${data.total} dòng, ${bad.length} dòng lỗi`;
  errors.innerHTML = bad.map((e) => `<li>Dòng ${e.row}: ${escapeHtml(e.message)}</li>`).join('');
  await refresh();
});
void refresh();
