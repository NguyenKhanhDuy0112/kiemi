import { $, initPage } from './common';

void initPage();

/**
 * Ca lỗi để thử "sửa khi fail" [FX-01 → FX-11, W-09]:
 * `?mode=renamed|slow|popup|wrongvalue|api` (mặc định: chạy bình thường).
 */
const mode = new URLSearchParams(location.search).get('mode') ?? 'ok';
const stage = $('#stage');
const result = $('#fix-result');

function saveButton(id: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = id;
  b.className = 'btn primary';
  b.textContent = label;
  b.addEventListener('click', onClick);
  stage.append(b);
  return b;
}

switch (mode) {
  case 'renamed':
    // Bản mới của trang: nút "Lưu" đổi id và chữ.
    saveButton('btn-save-v2', 'Lưu lại', () => {
      result.textContent = 'Đã lưu';
    });
    break;
  case 'slow':
    setTimeout(
      () =>
        saveButton('btn-save', 'Lưu', () => {
          result.textContent = 'Đã lưu';
        }),
      2500,
    );
    break;
  case 'popup': {
    saveButton('btn-save', 'Lưu', () => {
      result.textContent = 'Đã lưu';
    });
    // Popup bất chợt che cả trang.
    setTimeout(() => {
      const overlay = document.createElement('div');
      overlay.id = 'cookie-banner';
      overlay.setAttribute('role', 'dialog');
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(255,255,255,.96);z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';
      overlay.innerHTML =
        '<p>Chúng tôi dùng cookie để cải thiện trải nghiệm.</p><button type="button" class="btn" id="cookie-ok">Đồng ý</button>';
      overlay.querySelector('#cookie-ok')?.addEventListener('click', () => overlay.remove());
      document.body.append(overlay);
    }, 150);
    break;
  }
  case 'wrongvalue':
    saveButton('btn-save', 'Lưu', () => {
      result.textContent = 'Đã lưu 5 bản ghi';
    });
    break;
  case 'api':
    saveButton('btn-save', 'Lưu', () => {
      void fetch('/api/fixes/boom', { method: 'POST' }).then((r) => {
        result.textContent = r.ok ? 'Đã lưu' : 'Lỗi máy chủ';
      });
    });
    break;
  default:
    saveButton('btn-save', 'Lưu', () => {
      result.textContent = 'Đã lưu';
    });
}
