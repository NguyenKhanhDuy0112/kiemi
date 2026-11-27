/**
 * Page with deliberate SEO / translation / layout problems for the page audits
 * [Y-06, Y-07, Y-09]. `?bad=seo,i18n,layout` turns the problems on; `?lang=en` switches language.
 */
const q = new URLSearchParams(location.search);
const bad = new Set((q.get('bad') ?? '').split(','));
const lang = q.get('lang') === 'en' ? 'en' : 'vi';
document.documentElement.lang = lang;

const meta = (attr: 'name' | 'property', key: string, content: string): void => {
  const m = document.createElement('meta');
  m.setAttribute(attr, key);
  m.content = content;
  document.head.append(m);
};

if (!bad.has('seo')) {
  meta('name', 'description', 'Cửa hàng áo thun mùa hè, giao hàng toàn quốc.');
  meta('property', 'og:title', 'Áo thun mùa hè');
  meta('property', 'og:description', 'Áo thun cotton mát.');
  meta('property', 'og:image', 'https://example.com/shirt.png');
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = `${location.origin}/audit.html`;
  document.head.append(link);
}

const T = {
  vi: { h: 'Áo thun mùa hè', date: '30/06/2030', price: '1.250.000 ₫', buy: 'Mua ngay' },
  en: { h: 'Summer T-shirt', date: '06/30/2030', price: '$1,250.00', buy: 'Buy now' },
}[lang];

const root = document.getElementById('root') as HTMLElement;
root.innerHTML = `
  <h1>${T.h}</h1>
  ${bad.has('seo') ? '<h1>Tiêu đề thứ hai</h1>' : ''}
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40" ${bad.has('seo') ? '' : 'alt="Áo thun"'} />
  <p id="date">${bad.has('i18n') && lang === 'vi' ? '2030-06-30' : T.date}</p>
  <p id="price">${bad.has('i18n') && lang === 'vi' ? '1,250,000 ₫' : T.price}</p>
  <button type="button" class="btn primary" id="buy">${bad.has('i18n') ? 'checkout.button.buy' : T.buy}</button>
  <p id="note">${bad.has('i18n') ? 'Xin chào {{name}}, đơn hàng của bạn: undefined' : ''}</p>
  ${
    bad.has('layout')
      ? `<div style="width:900px;background:#fde">Bảng rộng cố định 900px làm tràn ngang trên điện thoại</div>
         <div style="position:relative;height:30px"><span style="position:absolute;left:0;top:0">Giá chồng</span><span style="position:absolute;left:10px;top:4px">lên nhau</span></div>
         <div id="clip" style="width:80px;height:20px;overflow:hidden;white-space:nowrap">Tên sản phẩm rất dài bị cắt mất</div>`
      : ''
  }`;
