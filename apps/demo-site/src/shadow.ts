/** Web components with open shadow roots, one nested in another [W-05]. */
class KiemiBadge extends HTMLElement {
  connectedCallback(): void {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<button type="button" id="inner-btn">Xác nhận lồng</button>`;
    root.querySelector('button')?.addEventListener('click', () => {
      const out = document.getElementById('shadow-result');
      if (out) out.textContent = 'Đã xác nhận (lồng)';
    });
  }
}

class KiemiCard extends HTMLElement {
  connectedCallback(): void {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <h2>${this.getAttribute('title') ?? ''}</h2>
      <label for="who">Họ tên</label>
      <input id="who" placeholder="Nhập họ tên" />
      <button type="button" id="save">Lưu phiếu</button>
      <kiemi-badge></kiemi-badge>`;
    root.getElementById('save')?.addEventListener('click', () => {
      const v = (root.getElementById('who') as HTMLInputElement).value;
      const out = document.getElementById('shadow-result');
      if (out) out.textContent = `Đã lưu ${v}`;
    });
  }
}

customElements.define('kiemi-badge', KiemiBadge);
customElements.define('kiemi-card', KiemiCard);
