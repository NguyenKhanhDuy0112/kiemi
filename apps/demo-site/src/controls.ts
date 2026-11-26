import { $, escapeHtml, initPage } from './common';

void initPage();

const CITIES = ['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'Huế', 'TP. Hồ Chí Minh', 'Cần Thơ'];
const PEOPLE = ['Nguyễn Văn An', 'Nguyễn Thị Bình', 'Trần Văn Cường', 'Lê Minh Quân'];
const state = { city: '', who: '', range: '', file: '' };

const fold = (s: string) => s.toLocaleLowerCase('vi');
const city = $('#city');
const cityBox = $('#city-box');
const citySearch = $<HTMLInputElement>('#city-search');
const cityList = $('#city-list');

function drawCities(filter: string): void {
  cityList.innerHTML = CITIES.filter((c) => fold(c).includes(fold(filter)))
    .map((c) => `<li role="option">${escapeHtml(c)}</li>`)
    .join('');
}
city.addEventListener('click', () => {
  cityBox.hidden = false;
  city.setAttribute('aria-expanded', 'true');
  drawCities('');
  citySearch.value = '';
  citySearch.focus();
});
citySearch.addEventListener('input', () => drawCities(citySearch.value));
cityList.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li) return;
  state.city = li.textContent ?? '';
  city.textContent = state.city;
  cityBox.hidden = true;
  city.setAttribute('aria-expanded', 'false');
});

const who = $<HTMLInputElement>('#who');
const whoBox = $('#who-box');
const whoList = $('#who-list');
who.addEventListener('input', () => {
  const hits = who.value ? PEOPLE.filter((p) => fold(p).includes(fold(who.value))) : [];
  whoList.innerHTML = hits.map((p) => `<li role="option">${escapeHtml(p)}</li>`).join('');
  whoBox.hidden = hits.length === 0;
});
whoList.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li) return;
  state.who = li.textContent ?? '';
  who.value = state.who;
  whoBox.hidden = true;
});

// Masked phone: digits only, grouped 4-3-3 as you type.
const phone = $<HTMLInputElement>('#phone');
phone.addEventListener('keydown', (e) => {
  if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
});
phone.addEventListener('input', () => {
  const d = phone.value.replace(/\D/g, '').slice(0, 10);
  phone.value = d.replace(/^(\d{4})(\d{0,3})(\d{0,3}).*/, (_m, a, b, c) =>
    [a, b, c].filter(Boolean).join(' '),
  );
});

const range = $<HTMLInputElement>('#range');
$('#range-apply').addEventListener('click', () => {
  state.range = range.value;
});

const showFile = (files: FileList | null) => {
  const f = files?.[0];
  state.file = f ? `${f.name} (${f.size} byte)` : '';
};
$<HTMLInputElement>('#file').addEventListener('change', (e) =>
  showFile((e.target as HTMLInputElement).files),
);
const zone = $('#dropzone');
zone.addEventListener('dragover', (e) => e.preventDefault());
zone.addEventListener('drop', (e) => {
  e.preventDefault();
  showFile(e.dataTransfer?.files ?? null);
});

$('#submit').addEventListener('click', () => {
  $('#result').textContent = JSON.stringify(
    {
      city: state.city,
      who: state.who,
      phone: phone.value,
      note: ($('#editor').textContent ?? '').trim(),
      range: state.range,
      file: state.file,
    },
    null,
    2,
  );
});
