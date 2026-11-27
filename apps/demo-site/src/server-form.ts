import { $, api } from './common';

const bugs = new Set((new URLSearchParams(location.search).get('bug') ?? '').split(','));
const form = $<HTMLFormElement>('#order');
const code = $<HTMLInputElement>('#code');

let dirty = false;
code.addEventListener('input', () => {
  dirty = true;
});
if (!bugs.has('noleave')) {
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });
}

async function paint(): Promise<void> {
  const { data } = await api<{ orders: string[] }>('/api/server-form');
  $('#orders').replaceChildren(
    ...data.orders.map((o) => {
      const li = document.createElement('li');
      li.textContent = o;
      return li;
    }),
  );
}
await paint();

const sendBtn = $<HTMLButtonElement>('#send');
const guard = new URLSearchParams(location.search).get('guard') === '1';
$('#btn-approve').addEventListener('click', () => {
  $('#order-status').textContent = 'Đã duyệt';
  if (!bugs.has('edit')) $('#btn-edit').hidden = true;
  ($('#btn-approve') as HTMLButtonElement).disabled = true;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (guard) sendBtn.disabled = true;
  $('#server-error').textContent = '';
  void api<{ error?: string }>('/api/server-form', {
    method: 'POST',
    headers: { 'x-skip-validation': bugs.has('server') ? '1' : '' },
    body: JSON.stringify({ code: code.value, email: $<HTMLInputElement>('#email').value }),
  }).then(async (r) => {
    if (r.status >= 400) {
      $('#server-error').textContent = r.data.error ?? 'Lỗi';
      return;
    }
    dirty = false;
    sendBtn.disabled = false;
    $('#server-result').textContent = 'Đã lưu đơn';
    await paint();
  });
});
