import { $, escapeHtml, initPage } from './common';

interface Item {
  code: string;
  name: string;
  qty: number;
  price: number;
  status: string;
  expanded: boolean;
  selected: boolean;
}
interface Line {
  item: Item;
  /** Detail line of the item (shown under it when expanded). */
  detail: boolean;
}

void initPage();

const ROW_H = 32;
const HEAD_H = 64; // header + filter rows, both sticky
const NAMES = ['Bút bi', 'Vở kẻ ngang', 'Thước kẻ', 'Tẩy', 'Cặp sách', 'Hộp bút', 'Giấy A4', 'Kéo'];
const STATUS = ['Còn hàng', 'Sắp hết', 'Hết hàng'];

const items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
  code: `SP${String(i + 1).padStart(4, '0')}`,
  name: `${NAMES[i % NAMES.length]} loại ${Math.floor(i / NAMES.length) + 1}`,
  qty: (i * 7) % 50,
  price: 5000 + ((i * 37) % 90) * 1000,
  status: STATUS[i % STATUS.length] as string,
  expanded: false,
  selected: false,
}));

const grid = $('#grid');
const viewport = $('#viewport');
const filters: Record<string, string> = {};

function lines(): Line[] {
  const out: Line[] = [];
  for (const item of items) {
    if (
      Object.entries(filters).some(
        ([k, v]) =>
          v &&
          !String(item[k as keyof Item])
            .toLocaleLowerCase('vi')
            .includes(v.toLocaleLowerCase('vi')),
      )
    )
      continue;
    out.push({ item, detail: false });
    if (item.expanded) out.push({ item, detail: true });
  }
  return out;
}

function rowHtml(line: Line, index: number): string {
  const { item } = line;
  const top = `style="position:absolute;top:${HEAD_H + index * ROW_H}px;left:0;right:0"`;
  if (line.detail) {
    return `<div role="row" aria-rowindex="${index + 2}" class="g-row g-detail" ${top}>
      <div role="gridcell"></div>
      <div role="gridcell">Chi tiết ${item.code}: nhập kho ${item.qty + 10}, đã bán 10</div></div>`;
  }
  return `<div role="row" aria-rowindex="${index + 2}" aria-selected="${item.selected}" class="g-row${item.selected ? ' selected' : ''}" ${top}>
    <div role="gridcell"><input type="checkbox" data-code="${item.code}" aria-label="Chọn dòng ${item.code}"${item.selected ? ' checked' : ''} />
      <button type="button" data-expand="${item.code}" aria-label="${item.expanded ? 'Thu gọn' : 'Mở rộng'} ${item.code}" aria-expanded="${item.expanded}">${item.expanded ? '▾' : '▸'}</button></div>
    <div role="gridcell">${item.code}</div>
    <div role="gridcell">${escapeHtml(item.name)}</div>
    <div role="gridcell" data-edit="qty" data-code="${item.code}">${item.qty}</div>
    <div role="gridcell" data-edit="price" data-code="${item.code}">${item.price.toLocaleString('vi-VN')}</div>
    <div role="gridcell">${item.status}</div></div>`;
}

let editing = false;

function render(): void {
  if (editing) return;
  const all = lines();
  grid.setAttribute('aria-rowcount', String(all.length + 1));
  $('#shown-count').textContent = String(all.filter((l) => !l.detail).length);
  $('#selected-count').textContent = String(items.filter((i) => i.selected).length);
  const first = Math.max(0, Math.floor((grid.scrollTop - HEAD_H) / ROW_H) - 3);
  const count = Math.ceil(grid.clientHeight / ROW_H) + 6;
  viewport.style.height = `${HEAD_H + all.length * ROW_H}px`;
  viewport.innerHTML = all
    .slice(first, first + count)
    .map((l, i) => rowHtml(l, first + i))
    .join('');
}

grid.addEventListener('scroll', render);
for (const input of grid.querySelectorAll<HTMLInputElement>('[data-filter]')) {
  input.addEventListener('input', () => {
    filters[input.dataset.filter as string] = input.value;
    grid.scrollTop = 0;
    render();
  });
}
viewport.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  const item = items.find((i) => i.code === box.dataset.code);
  if (item && box.type === 'checkbox') {
    item.selected = box.checked;
    render();
  }
});
viewport.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-expand]');
  const item = items.find((i) => i.code === btn?.dataset.expand);
  if (item) {
    item.expanded = !item.expanded;
    render();
  }
});
viewport.addEventListener('dblclick', (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]');
  const item = items.find((i) => i.code === cell?.dataset.code);
  if (!cell || !item || editing) return;
  const field = cell.dataset.edit as 'qty' | 'price';
  editing = true;
  cell.innerHTML = `<input class="g-edit" aria-label="Sửa ${field === 'qty' ? 'Số lượng' : 'Đơn giá'} ${item.code}" value="${item[field]}" />`;
  const input = $<HTMLInputElement>('input', cell);
  input.focus();
  const done = (save: boolean) => {
    if (!editing) return;
    editing = false;
    const n = Number(input.value.replace(/\D/g, ''));
    if (save && Number.isFinite(n)) item[field] = n;
    render();
  };
  input.addEventListener('keydown', (k) => {
    if (k.key === 'Enter') done(true);
    if (k.key === 'Escape') done(false);
  });
  input.addEventListener('blur', () => done(true));
});

render();
