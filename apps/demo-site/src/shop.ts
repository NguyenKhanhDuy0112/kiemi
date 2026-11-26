import { $, escapeHtml, initPage } from './common';
import { CATALOG, COUPONS, type Coupon, totals, vnd } from './shop-calc';

void initPage();

const bugVat = new URLSearchParams(location.search).get('bug')?.split(',').includes('vat') ?? false;
const qty = new Map<string, number>();
let coupon: Coupon | undefined;

$('#catalog tbody').innerHTML = CATALOG.map(
  (p) => `<tr><td>${p.sku}</td><td>${escapeHtml(p.name)}</td><td>${vnd(p.price)}</td>
    <td><button type="button" class="btn" data-add="${p.sku}" aria-label="Thêm ${escapeHtml(p.name)}">Thêm vào giỏ</button></td></tr>`,
).join('');

function render(): void {
  const lines = CATALOG.filter((p) => (qty.get(p.sku) ?? 0) > 0).map((p) => ({
    ...p,
    qty: qty.get(p.sku) as number,
  }));
  $('#cart tbody').innerHTML = lines
    .map(
      (l) => `<tr><td>${escapeHtml(l.name)}</td>
        <td><input type="number" min="1" value="${l.qty}" data-qty="${l.sku}" aria-label="Số lượng ${escapeHtml(l.name)}" /></td>
        <td>${vnd(l.price)}</td><td>${vnd(l.price * l.qty)}</td>
        <td><button type="button" class="btn" data-remove="${l.sku}" aria-label="Xóa ${escapeHtml(l.name)}">Xóa</button></td></tr>`,
    )
    .join('');
  $('#cart-empty').hidden = lines.length > 0;
  const t = totals(lines, coupon, bugVat);
  for (const [k, v] of Object.entries(t)) {
    const el = $(`[data-testid="${k}"]`);
    el.textContent = vnd(v);
    if (k === 'total') el.innerHTML = `<strong>${vnd(v)}</strong>`;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const add = t.closest<HTMLElement>('[data-add]')?.dataset.add;
  const rem = t.closest<HTMLElement>('[data-remove]')?.dataset.remove;
  if (add) qty.set(add, (qty.get(add) ?? 0) + 1);
  else if (rem) qty.delete(rem);
  else return;
  render();
});
document.addEventListener('change', (e) => {
  const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-qty]');
  if (!input?.dataset.qty) return;
  const n = Math.floor(Number(input.value));
  if (n >= 1) qty.set(input.dataset.qty, n);
  else qty.delete(input.dataset.qty);
  render();
});
$('#apply-coupon').addEventListener('click', () => {
  const code = $<HTMLInputElement>('#coupon').value.trim().toUpperCase();
  const found = COUPONS[code];
  $('#coupon-error').textContent = found || !code ? '' : 'Mã giảm giá không hợp lệ';
  $('#coupon-ok').textContent = found ? `Đã áp dụng ${code}` : '';
  coupon = found;
  render();
});
render();
