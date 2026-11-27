import { describe, expect, it } from 'vitest';
import { VariableStore } from './store';

const NOW = new Date(2026, 5, 15, 10, 0, 0);
const run = (expr: string, scopes: ConstructorParameters<typeof VariableStore>[0] = {}) =>
  new VariableStore(scopes, () => NOW).interpolate(`{{${expr}}}`);

describe('business-day functions [P-07]', () => {
  it('counts working days of a month by the configured calendar', () => {
    expect(run("WORKDAYS('01/12/2026', '31/12/2026')")).toBe(23);
    // 30/04 and 01/05 are fixed holidays: Apr 27–May 4 2026 has 6 weekdays − 2.
    expect(run("WORKDAYS('27/04/2026', '04/05/2026')")).toBe(4);
    // Tết / Hùng Vương are listed by the tester, as an argument…
    expect(run("WORKDAYS('06/04/2026', '10/04/2026', '09/04/2026; 10/04/2026')")).toBe(3);
    // …or in the `holidays` variable.
    expect(run("WORKDAYS('06/04/2026', '10/04/2026')", { test: { holidays: '09/04/2026' } })).toBe(
      4,
    );
  });

  it('finds the date n working days away, skipping weekends and holidays', () => {
    // Thu 30/04/2026 + 1 working day: 1/5 holiday, weekend → Mon 04/05.
    expect(run("format(WORKDAY('30/04/2026', 1))")).toBe('04/05/2026');
    expect(run("format(WORKDAY('04/05/2026', -1))")).toBe('29/04/2026');
    expect(run("ISWORKDAY('02/09/2026')")).toBe(false);
  });

  it('knows month / quarter / year ends and gaps between dates', () => {
    expect(run("format(ENDOFMONTH('15/02/2028'))")).toBe('29/02/2028');
    expect(run("format(ENDOFQUARTER('15/05/2026'))")).toBe('30/06/2026');
    expect(run("format(ENDOFYEAR('15/05/2026'))")).toBe('31/12/2026');
    expect(run("DAYSBETWEEN('01/01/2026', '31/01/2026')")).toBe(30);
    expect(run("MONTHSBETWEEN('15/01/2026', '15/06/2026')")).toBe(5);
  });

  it('computes age and seniority on a date (default: the run clock)', () => {
    expect(run("AGE('15/06/2000', '14/06/2026')")).toBe(25);
    expect(run("AGE('15/06/2000')")).toBe(26);
    expect(run("SENIORITY('01/03/2020', '28/02/2026')")).toBe(5);
    expect(run("SENIORITYMONTHS('20/01/2026', '19/06/2026')")).toBe(4);
  });
});
