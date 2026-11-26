import { $, api, escapeHtml, initPage } from './common';

const me = await initPage({ requireLogin: true, links: false });
if (me) {
  const key = new URLSearchParams(location.search).get('f') ?? '';
  const { status, data } = await api<{ name?: string; error?: string }>(
    `/api/portal/fn/${encodeURIComponent(key)}`,
  );
  if (status === 200 && data.name) {
    document.title = `${data.name} — Kiemi Demo`;
    $('#fn-title').innerHTML = escapeHtml(data.name);
    $('#fn-body').textContent = `Nội dung của chức năng ${data.name}.`;
  } else {
    $('#fn-title').textContent = 'Không có quyền';
    $('#fn-body').textContent = data.error ?? 'Bạn không có quyền truy cập chức năng này';
  }
}
