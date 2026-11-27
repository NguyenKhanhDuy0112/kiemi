export interface RedactOptions {
  /** Exact secret values to hide (environment secrets, the project's passwords). */
  secrets?: string[];
  /** Hide emails, phone numbers, ID numbers (default true) [AI-02]. */
  pii?: boolean;
}

export interface Redaction {
  text: string;
  /** What was hidden, by kind — shown on "what will be sent". */
  counts: { secret: number; email: number; phone: number; idNumber: number };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Vietnamese mobile/landline: 0xxxxxxxxx or +84xxxxxxxxx, with optional spaces, dots, dashes.
const PHONE = /(?<![\d])(?:\+?84|0)(?:[\s.-]?\d){8,9}(?![\d])/g;
// CCCD is 12 digits, CMND 9; tax codes 10 or 13. Only long digit runs, to spare prices and counts.
const ID_NUMBER = /(?<![\d])(?:\d{12}|\d{13})(?![\d])/g;

const MIN_SECRET = 4;

/** Hides secrets and personal data before text leaves the computer [AI-02]. */
export function redact(input: string, opts: RedactOptions = {}): Redaction {
  const counts = { secret: 0, email: 0, phone: 0, idNumber: 0 };
  let text = input;
  // Longest first so a secret that contains another is hidden whole.
  const secrets = [...new Set(opts.secrets ?? [])]
    .filter((s) => s.length >= MIN_SECRET)
    .sort((a, b) => b.length - a.length);
  for (const s of secrets) {
    const parts = text.split(s);
    if (parts.length > 1) {
      counts.secret += parts.length - 1;
      text = parts.join('•••');
    }
  }
  if (opts.pii !== false) {
    text = text.replace(EMAIL, () => {
      counts.email++;
      return '[email]';
    });
    text = text.replace(ID_NUMBER, () => {
      counts.idNumber++;
      return '[so-dinh-danh]';
    });
    text = text.replace(PHONE, () => {
      counts.phone++;
      return '[sdt]';
    });
  }
  return { text, counts };
}
