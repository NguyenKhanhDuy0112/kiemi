const clean = new URLSearchParams(location.search).get('clean') === '1';
const hrefs = clean
  ? ['/audit.html', '/chat.html']
  : ['/audit.html', '/chat.html', '/api/khong-co', '/crawl-bad.html', '/logout'];
const ul = document.getElementById('links') as HTMLElement;
for (const h of hrefs) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = h;
  a.textContent = h;
  li.append(a);
  ul.append(li);
}
