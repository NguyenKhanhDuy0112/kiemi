import type { Services } from '@kiemi/db';
import { type IssueDraft, issueLink, issueRequest, isTracker, trackerProblem } from '@kiemi/schema';
import { type NotifyTransport, realTransport } from '../notify/send';

export interface IssueResult {
  ok: boolean;
  /** Web address of the new issue. */
  url?: string;
  message: string;
}

/** Files the issue in the tracker of the channel; the token never leaves this process but the request [X-02]. */
export async function createIssue(
  services: Services,
  channelId: string,
  issue: IssueDraft,
  transport: Pick<NotifyTransport, 'fetch'> = realTransport,
): Promise<IssueResult> {
  const ch = services.notifyChannels.forTest(channelId);
  if (!isTracker(ch.kind)) return { ok: false, message: 'Kênh này không phải nơi quản lý lỗi' };
  const cfg = {
    baseUrl: ch.config.baseUrl,
    project: ch.config.project,
    issueType: ch.config.issueType,
    username: ch.config.username,
  };
  const problem = trackerProblem(ch.kind, cfg);
  if (problem) return { ok: false, message: `Chưa cấu hình đúng (${problem})` };
  if (!ch.secret) return { ok: false, message: 'Chưa có mã truy cập (token)' };
  const req = issueRequest(ch.kind, cfg, ch.secret, issue);
  try {
    const res = await transport.fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(15_000),
    });
    const body = res.body;
    if (!res.ok) return { ok: false, message: `Nơi quản lý lỗi trả về ${res.status}` };
    const url = issueLink(ch.kind, cfg, body);
    return { ok: true, ...(url ? { url } : {}), message: url ?? 'Đã tạo' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message.slice(0, 200) : 'Không gửi được',
    };
  }
}
