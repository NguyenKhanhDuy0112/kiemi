import {
  MAX_ATTACHMENT_CHARS,
  MAX_ATTACHMENTS_PER_STEP,
  type ManualAttachment,
  type ManualCase,
  type ManualStatus,
  type ManualStep,
  manualCaseStatus,
} from '@kiemi/schema';

const uid = (): string => crypto.randomUUID();

export const newStep = (): ManualStep => ({
  id: uid(),
  action: '',
  expected: '',
  status: 'untested',
  actual: '',
  attachments: [],
});

export const newCase = (name: string, group = ''): ManualCase => ({
  id: uid(),
  name,
  group,
  preconditions: '',
  priority: 'medium',
  steps: [newStep()],
});

export const patchStep = (c: ManualCase, stepId: string, p: Partial<ManualStep>): ManualCase => ({
  ...c,
  steps: c.steps.map((s) => (s.id === stepId ? { ...s, ...p } : s)),
});

export function moveStep(c: ManualCase, stepId: string, by: -1 | 1): ManualCase {
  const i = c.steps.findIndex((s) => s.id === stepId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= c.steps.length) return c;
  const steps = [...c.steps];
  const [s] = steps.splice(i, 1);
  steps.splice(j, 0, s as ManualStep);
  return { ...c, steps };
}

/** Adds a picture to a step; returns `null` when it is not an image, too big, or too many. */
export function addAttachment(
  c: ManualCase,
  stepId: string,
  a: ManualAttachment,
): ManualCase | null {
  const step = c.steps.find((s) => s.id === stepId);
  if (!step || step.attachments.length >= MAX_ATTACHMENTS_PER_STEP) return null;
  if (!a.dataUrl.startsWith('data:image/') || a.dataUrl.length > MAX_ATTACHMENT_CHARS) return null;
  return patchStep(c, stepId, { attachments: [...step.attachments, a] });
}

export interface ManualCounts {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  untested: number;
}

export function countCases(cases: ManualCase[]): ManualCounts {
  const out: ManualCounts = { total: cases.length, pass: 0, fail: 0, blocked: 0, untested: 0 };
  for (const c of cases) out[manualCaseStatus(c) satisfies ManualStatus]++;
  return out;
}
