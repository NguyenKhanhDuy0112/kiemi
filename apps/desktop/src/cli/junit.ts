export interface JunitCase {
  /** Group shown by CI tools (the suite name). */
  classname: string;
  name: string;
  timeMs: number;
  status: 'passed' | 'failed' | 'error' | 'skipped' | 'cancelled';
  /** Plain-language reason for failed / error / skipped. */
  message?: string | undefined;
}

export interface JunitInput {
  name: string;
  startedAt: Date;
  cases: JunitCase[];
}

const esc = (s: string) =>
  s
    // Characters XML 1.0 cannot carry at all.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const sec = (ms: number) => (Math.round(ms) / 1000).toFixed(3);

/** JUnit XML (one testsuite) that Jenkins, GitLab, GitHub and Azure DevOps all read [X-04]. */
export function buildJunit(input: JunitInput): string {
  const count = (...s: JunitCase['status'][]) =>
    input.cases.filter((c) => s.includes(c.status)).length;
  const total = input.cases.reduce((a, c) => a + c.timeMs, 0);
  const attrs = (extra: string) =>
    `name="${esc(input.name)}" tests="${input.cases.length}" failures="${count('failed')}" errors="${count('error')}" skipped="${count('skipped', 'cancelled')}" time="${sec(total)}"${extra}`;
  const cases = input.cases.map((c) => {
    const head = `<testcase classname="${esc(c.classname)}" name="${esc(c.name)}" time="${sec(c.timeMs)}"`;
    const msg = esc(c.message ?? '');
    switch (c.status) {
      case 'passed':
        return `${head}/>`;
      case 'failed':
        return `${head}><failure message="${msg}" type="AssertionError">${msg}</failure></testcase>`;
      case 'error':
        return `${head}><error message="${msg}" type="Error">${msg}</error></testcase>`;
      default:
        return `${head}><skipped message="${msg}"/></testcase>`;
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites ${attrs('')}>
<testsuite ${attrs(` timestamp="${input.startedAt.toISOString()}"`)}>
${cases.join('\n')}
</testsuite>
</testsuites>
`;
}
