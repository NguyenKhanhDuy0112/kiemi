import type { Step, TestCase } from '@kiemi/schema';
import { describeRunError } from '@kiemi/shared';
import { stepText } from '../editor/describe';
import { childLists } from '../editor/doc-model';
import type { LiveCase, LiveRun } from './run-state';

type Tx = (key: string, vars?: Record<string, unknown>, fallback?: string) => string;

export interface ReportInput {
  run: LiveRun;
  title: string;
  environmentName: string | null;
  /** Colour stripe of the environment [O-03]. */
  environmentColor?: string | null;
  environmentProtected?: boolean;
  startedAt: Date | null;
  /** Test documents by id (for step sentences). */
  tests: Record<string, TestCase | undefined>;
  /** Screenshot path → data URL. */
  screenshots: Record<string, string>;
  sharedNames?: ReadonlyMap<string, string>;
  now?: Date;
  tx: Tx;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fmtSec = (ms: number | undefined) =>
  ms === undefined ? '' : `${(Math.round(ms / 100) / 10).toLocaleString('vi-VN')} s`;

const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const CSS = `
:root{--ink:#1F2A5C;--pass:#13803f;--fail:#c8282e;--muted:#5b6280;--line:#e5e7eb;--bg:#fff}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111827;background:#f6f7fb}
main{max-width:980px;margin:0 auto;padding:32px 20px}
.env{color:#111827;background:#fff;font-weight:600;padding:6px 16px;border-left:10px solid;border-radius:10px;margin-bottom:8px}
header{background:var(--ink);color:#fff;border-radius:12px;padding:20px 24px;margin-bottom:20px}
header h1{margin:0 0 4px;font-size:22px}header p{margin:0;opacity:.85}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:600;border:1px solid}
.passed{color:var(--pass);border-color:var(--pass)}.failed,.error{color:var(--fail);border-color:var(--fail)}
.skipped,.cancelled,.queued,.running{color:var(--muted);border-color:var(--muted)}
header .badge{background:#fff}
section{background:var(--bg);border:1px solid var(--line);border-radius:12px;margin-bottom:16px;overflow:hidden}
section h2{margin:0;padding:12px 16px;font-size:16px;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center}
section h2 small{font-weight:400;color:var(--muted);margin-left:auto}
ol{list-style:none;margin:0;padding:0}li{padding:8px 16px;border-top:1px solid var(--line)}li:first-child{border-top:0}
.row{display:flex;gap:10px;align-items:baseline}.no{width:40px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.text{flex:1}.dur{color:var(--muted);font-size:13px}
.err{margin:6px 0 0 50px;padding:8px 10px;border-left:3px solid var(--fail);background:#fef2f2;border-radius:4px}
.err b{display:block}.err span{color:var(--muted)}
img{display:block;max-width:100%;margin:8px 0 0 50px;border:1px solid var(--line);border-radius:8px}
.summary{display:flex;gap:16px;margin-top:10px;font-size:13px}
footer{color:var(--muted);font-size:13px;text-align:center;margin-top:24px}
@media print{body{background:#fff}section{break-inside:avoid}}
`;

export function* walk(
  steps: Step[],
  prefix: string,
  depth: number,
): Generator<{ step: Step; no: string; depth: number }> {
  for (const [i, step] of steps.entries()) {
    const no = `${prefix}${i + 1}`;
    yield { step, no, depth };
    for (const c of childLists(step)) yield* walk(c.steps, `${no}.`, depth + 1);
  }
}

function caseSection(c: LiveCase, input: ReportInput): string {
  const { tx } = input;
  const doc = input.tests[c.testCaseId];
  const statusLabel = tx(`ui.run.status.${c.status}`);
  const rows: string[] = [];
  const entries = doc
    ? [...walk(doc.steps, '', 0), ...walk(doc.cleanup, 'C', 0)]
    : Object.entries(c.steps).map(([id, s]) => ({
        step: { id, action: 'unknown', params: {} } as unknown as Step,
        no: s.stepNo,
        depth: 0,
      }));
  for (const { step, no, depth } of entries) {
    const r = c.steps[step.id];
    const status = r?.status ?? 'skipped';
    const text = doc
      ? stepText(step, doc.elements, tx, input.sharedNames)
      : tx('ui.run.stepMissing');
    let html = `<li style="padding-left:${16 + depth * 20}px"><div class="row"><span class="badge ${status}">${esc(tx(`ui.run.status.${status}`))}</span><span class="no">${esc(no)}</span><span class="text">${esc(text)}</span><span class="dur">${fmtSec(r?.durationMs)}</span></div>`;
    if (r?.error) {
      const d = describeRunError(r.error, tx);
      html += `<div class="err"><b>${esc(d.message)}</b><span>${esc(tx('ui.report.hint'))}: ${esc(d.hint)}</span></div>`;
    }
    for (const a of r?.artifacts ?? []) {
      const src = a.kind === 'screenshot' ? input.screenshots[a.path] : undefined;
      if (src) html += `<img alt="${esc(tx('ui.run.screenshot', { step: no }))}" src="${src}">`;
    }
    rows.push(`${html}</li>`);
  }
  const row =
    c.rowIndex === undefined ? '' : ` · ${esc(tx('ui.run.row', { row: c.rowIndex + 1 }))}`;
  const caseErr =
    c.error && !Object.values(c.steps).some((s) => s.error)
      ? `<div class="err" style="margin:8px 16px"><b>${esc(describeRunError(c.error, tx).message)}</b></div>`
      : '';
  return `<section><h2><span class="badge ${c.status}">${esc(statusLabel)}</span>${esc(c.testName)}${row}<small>${fmtSec(c.durationMs)}</small></h2>${caseErr}<ol>${rows.join('') || `<li>${esc(tx('ui.run.noSteps'))}</li>`}</ol></section>`;
}

/**
 * One self-contained HTML file (inline CSS, screenshots as data URLs, no
 * scripts) that anyone can open or print [I-05].
 */
export function buildHtmlReport(input: ReportInput): string {
  const { run, tx } = input;
  const n = (s: string) => run.cases.filter((c) => c.status === s).length;
  const statusLabel = tx(`ui.run.status.${run.status}`);
  const meta = [
    input.startedAt ? `${tx('ui.report.started')}: ${fmtDate(input.startedAt)}` : '',
    input.environmentName ? tx('ui.run.environment', { name: input.environmentName }) : '',
    run.durationMs !== undefined ? fmtSec(run.durationMs) : '',
  ]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  const runErr = run.error
    ? `<section><div class="err" style="margin:12px 16px"><b>${esc(describeRunError(run.error, tx).message)}</b><span>${esc(describeRunError(run.error, tx).hint)}</span></div></section>`
    : '';
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`${tx('ui.report.title')} — ${input.title}`)}</title><style>${CSS}</style></head>
<body><main>
${input.environmentColor && /^#[0-9a-fA-F]{6}$/.test(input.environmentColor) ? `<div class="env" style="border-left-color:${input.environmentColor}">${esc(input.environmentName ?? '')}${input.environmentProtected ? ` · ${esc(tx('ui.environments.protectedBadge'))}` : ''}</div>` : ''}<header><h1>${esc(input.title)} <span class="badge ${run.status}">${esc(statusLabel)}</span></h1><p>${meta}</p>
<div class="summary"><span>${esc(tx('ui.run.summary', { passed: n('passed'), total: run.cases.length }))}</span></div></header>
${runErr}${run.cases.map((c) => caseSection(c, input)).join('\n')}
<footer>${esc(tx('ui.report.generated', { at: fmtDate(input.now ?? new Date()) }))}</footer>
</main></body></html>`;
}
