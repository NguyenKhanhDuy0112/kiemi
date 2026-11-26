import { $, api, escapeHtml, initPage } from './common';

const me = await initPage({ requireLogin: true, links: false });
if (me) {
  const { data } = await api<{ key: string; name: string }[]>('/api/portal/menu');
  $('#portal-menu').innerHTML = data
    .map((f) => `<a class="btn" href="/portal-fn.html?f=${f.key}">${escapeHtml(f.name)}</a>`)
    .join(' ');
}
