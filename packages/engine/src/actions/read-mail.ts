import { z } from 'zod';
import { sleep } from '../assertions/actions';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { text } from './_common';

interface Mail {
  id: string;
  subject: string;
  to: string;
  createdAt: number;
  body: string;
}

type Get = (url: string, headers: Record<string, string>) => Promise<unknown>;

const realGet: Get = async (url, headers) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  return type.includes('json') ? res.json() : res.text();
};

/** Test mail box API: Mailpit (`/api/v1`) or Mailtrap (token) [X-06]. */
async function listMail(
  provider: 'mailpit' | 'mailtrap',
  base: string,
  headers: Record<string, string>,
  query: { to?: string | undefined; subject?: string | undefined },
  get: Get,
): Promise<Mail[]> {
  if (provider === 'mailpit') {
    const q = [query.to ? `to:${query.to}` : '', query.subject ? `subject:"${query.subject}"` : '']
      .filter(Boolean)
      .join(' ');
    const list = (await get(
      `${base}/api/v1/search?query=${encodeURIComponent(q)}&limit=20`,
      headers,
    )) as {
      messages?: { ID: string; Subject?: string; To?: { Address: string }[]; Created?: string }[];
    };
    const out: Mail[] = [];
    for (const m of list.messages ?? []) {
      const full = (await get(`${base}/api/v1/message/${m.ID}`, headers)) as {
        Text?: string;
        HTML?: string;
      };
      out.push({
        id: m.ID,
        subject: m.Subject ?? '',
        to: (m.To ?? []).map((x) => x.Address).join(', '),
        createdAt: Date.parse(m.Created ?? '') || 0,
        body: `${full.Text ?? ''}\n${full.HTML ?? ''}`,
      });
    }
    return out;
  }
  // Mailtrap: `base` is `https://mailtrap.io/api/accounts/<id>/inboxes/<inbox>`.
  const list = (await get(`${base}/messages`, headers)) as {
    id: number;
    subject?: string;
    to_email?: string;
    created_at?: string;
  }[];
  const out: Mail[] = [];
  for (const m of list) {
    if (query.to && !(m.to_email ?? '').toLowerCase().includes(query.to.toLowerCase())) continue;
    if (query.subject && !(m.subject ?? '').toLowerCase().includes(query.subject.toLowerCase()))
      continue;
    out.push({
      id: String(m.id),
      subject: m.subject ?? '',
      to: m.to_email ?? '',
      createdAt: Date.parse(m.created_at ?? '') || 0,
      body: String(await get(`${base}/messages/${m.id}/body.txt`, headers)),
    });
  }
  return out;
}

/**
 * Waits for an e-mail in a TEST mail box (Mailpit or Mailtrap) and takes a code
 * or link out of it with a regular expression (first group, else the whole
 * match) into a variable — OTP, "confirm your account" links… [X-06].
 */
export const readMailAction = defineAction({
  type: 'readMail',
  params: z.object({
    provider: z.enum(['mailpit', 'mailtrap']).default('mailpit'),
    /** Mailpit address (`http://localhost:8025`) or the Mailtrap inbox API address. */
    url: text,
    /** Name of a secret holding the Mailtrap API token. */
    tokenSecret: z.string().min(1).optional(),
    to: text.optional(),
    subjectContains: text.optional(),
    /** What to take: `(\d{6})` for an OTP, `https?://\S+/confirm\S*` for a link. */
    regex: text,
    into: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    /** Only mails that arrived after this step began. */
    onlyNew: z.boolean().default(true),
  }),
  ui: { label: 'actions.readMail', icon: 'mail', group: 'data' },
  // Waits for the mail for as long as the step may take.
  async execute(p, ctx) {
    let re: RegExp;
    try {
      re = new RegExp(p.regex, 'u');
    } catch {
      throw new EngineError('INVALID_PARAMS', `"${p.regex}" is not a valid pattern`, {
        param: 'regex',
      });
    }
    const token = p.tokenSecret ? ctx.run.secrets[p.tokenSecret] : undefined;
    if (p.provider === 'mailtrap' && !token)
      throw new EngineError(
        'PROXY_SECRET_MISSING',
        `Secret "${p.tokenSecret ?? ''}" has no value`,
        {
          secret: p.tokenSecret ?? '',
        },
      );
    const headers: Record<string, string> = token ? { 'Api-Token': token } : {};
    const base = p.url.replace(/\/+$/, '');
    const started = Date.now() - 1500;
    const get = realGet;
    let seen = 0;
    let lastErr = '';
    for (;;) {
      try {
        const mails = (
          await listMail(p.provider, base, headers, { to: p.to, subject: p.subjectContains }, get)
        )
          .filter((m) => !p.onlyNew || m.createdAt >= started)
          .sort((a, b) => b.createdAt - a.createdAt);
        seen = mails.length;
        for (const m of mails) {
          const hit = re.exec(m.body);
          if (hit) {
            const value = hit[1] ?? hit[0];
            ctx.vars.set(p.into, value);
            ctx.log(`${p.into} taken from "${m.subject}"`);
            return;
          }
        }
        lastErr = '';
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
      if (ctx.remainingMs() < 1200) break;
      await sleep(1000, ctx.signal);
    }
    throw new EngineError(
      'ACTION_FAILED',
      lastErr
        ? `Step ${ctx.stepNo}: the mail box could not be read (${lastErr})`
        : `Step ${ctx.stepNo}: no mail${p.to ? ` to ${p.to}` : ''} with a match for the pattern (${seen} mail(s) looked at)`,
      { url: base, mails: seen },
    );
  },
});
