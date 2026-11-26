import { $, api, escapeHtml, initPage } from './common';
import { vnd } from './shop-calc';

interface Row {
  name: string;
  dept: string;
  base: number;
  allowance: number;
  bonus: number;
  net: number;
}
interface Result {
  rows: Row[];
  totals: { base: number; allowance: number; bonus: number; net: number };
}

void initPage();

void api<Result>('/api/payroll').then(({ data }) => {
  $('#payroll-table tbody').innerHTML = data.rows
    .map(
      (
        r,
      ) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.dept)}</td><td>${vnd(r.base)}</td>
        <td>${vnd(r.allowance)}</td><td>${vnd(r.bonus)}</td><td>${vnd(r.net)}</td></tr>`,
    )
    .join('');
  const t = data.totals;
  $('#payroll-table tfoot').innerHTML = `<tr data-testid="payroll-total"><th colspan="2">Tổng</th>
    <th>${vnd(t.base)}</th><th>${vnd(t.allowance)}</th><th>${vnd(t.bonus)}</th><th>${vnd(t.net)}</th></tr>`;
});
