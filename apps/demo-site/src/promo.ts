import { $, api, initPage, toast } from './common';
import { vnd } from './shop-calc';

interface Promo {
  price: number;
  base: number;
  endsOn: string;
}

let promo: Promo | undefined;
const pad = (n: number) => String(n).padStart(2, '0');

/** Paints the price, status and countdown from the browser clock (so a faked clock shows through). */
function paint(): void {
  if (!promo) return;
  const ends = new Date(`${promo.endsOn}T23:59:59`);
  const left = ends.getTime() - Date.now();
  const expired = left < 0;
  $('#price').textContent = vnd(expired ? promo.base : promo.price);
  $('#promo-status').textContent = expired ? 'Khuyến mãi đã kết thúc' : 'Đang khuyến mãi';
  if (expired) {
    $('#countdown').textContent = '';
    return;
  }
  const s = Math.floor(left / 1000);
  const days = Math.floor(s / 86_400);
  const rest = s % 86_400;
  $('#countdown').textContent =
    `Còn ${days} ngày ${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`;
}

async function load(): Promise<void> {
  const { data } = await api<Promo>('/api/promo');
  promo = data;
  paint();
}

const me = await initPage();
await load();
setInterval(paint, 1000);
setInterval(() => void load(), 1000);

if (me?.role === 'quanly') {
  $('#admin').hidden = false;
  $<HTMLInputElement>('#new-price').value = String(promo?.price ?? '');
  $('#save-price').addEventListener('click', async () => {
    const price = Number($<HTMLInputElement>('#new-price').value);
    const { status, data } = await api<Promo & { error?: string }>('/api/promo', {
      method: 'POST',
      body: JSON.stringify({ price }),
    });
    if (status !== 200) {
      toast(data.error ?? 'Không lưu được', 'error');
      return;
    }
    $('#saved').textContent = `Đã lưu giá ${vnd(price)}`;
    await load();
  });
}
