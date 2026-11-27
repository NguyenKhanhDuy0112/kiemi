import type { HttpRequestSpec } from './notify';

/** Issue trackers a failed step can be filed in [X-02]. */
export const TRACKER_KINDS = ['jira', 'redmine', 'azure', 'gitlab', 'github'] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];
export const isTracker = (kind: string): kind is TrackerKind =>
  (TRACKER_KINDS as readonly string[]).includes(kind);

export interface TrackerConfig {
  /** Site address (`https://jira.congty.vn`); empty = the public one (GitHub, GitLab.com). */
  baseUrl: string;
  /** Jira key, Redmine project id, Azure `organization/project`, GitLab project id or path, GitHub `owner/repo`. */
  project: string;
  /** Jira issue type (default `Bug`). */
  issueType: string;
  /** Jira Cloud / Basic: the account e-mail; empty = the token is a bearer token. */
  username: string;
}

export interface IssueDraft {
  title: string;
  /** Markdown / plain text body. */
  body: string;
}

const json = { 'content-type': 'application/json; charset=utf-8' };
const trim = (u: string) => u.replace(/\/+$/, '');
const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

/** Address problem of the settings, or `null`. */
export function trackerProblem(kind: TrackerKind, c: TrackerConfig): string | null {
  if (!c.project.trim()) return 'project';
  const needsBase = kind === 'jira' || kind === 'redmine';
  if (needsBase && !/^https?:\/\/\S+$/.test(c.baseUrl.trim())) return 'baseUrl';
  if (kind === 'azure' && !/^[^/\s]+\/[^/\s]+$/.test(c.project.trim())) return 'azureProject';
  if (kind === 'github' && !/^[^/\s]+\/[^/\s]+$/.test(c.project.trim())) return 'githubRepo';
  return null;
}

/** HTTP request that files the issue in the tracker; the token goes in the right header. */
export function issueRequest(
  kind: TrackerKind,
  c: TrackerConfig,
  token: string,
  issue: IssueDraft,
): HttpRequestSpec {
  const base = trim(c.baseUrl.trim());
  const project = c.project.trim();
  switch (kind) {
    case 'github':
      return {
        url: `${base || 'https://api.github.com'}/repos/${project}/issues`,
        headers: {
          ...json,
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'user-agent': 'Kiemi',
        },
        body: JSON.stringify({ title: issue.title, body: issue.body }),
      };
    case 'gitlab':
      return {
        url: `${base || 'https://gitlab.com'}/api/v4/projects/${encodeURIComponent(project)}/issues`,
        headers: { ...json, 'private-token': token },
        body: JSON.stringify({ title: issue.title, description: issue.body }),
      };
    case 'jira':
      return {
        url: `${base}/rest/api/2/issue`,
        headers: {
          ...json,
          authorization: c.username ? basic(c.username, token) : `Bearer ${token}`,
        },
        body: JSON.stringify({
          fields: {
            project: { key: project },
            summary: issue.title,
            description: issue.body,
            issuetype: { name: c.issueType.trim() || 'Bug' },
          },
        }),
      };
    case 'redmine':
      return {
        url: `${base}/issues.json`,
        headers: { ...json, 'x-redmine-api-key': token },
        body: JSON.stringify({
          issue: { project_id: project, subject: issue.title, description: issue.body },
        }),
      };
    case 'azure': {
      const [org, proj] = project.split('/');
      return {
        url: `${base || 'https://dev.azure.com'}/${org}/${encodeURIComponent(proj ?? '')}/_apis/wit/workitems/$Bug?api-version=7.0`,
        headers: { 'content-type': 'application/json-patch+json', authorization: basic('', token) },
        body: JSON.stringify([
          { op: 'add', path: '/fields/System.Title', value: issue.title },
          {
            op: 'add',
            path: '/fields/Microsoft.VSTS.TCM.ReproSteps',
            value: issue.body.replace(/\n/g, '<br>'),
          },
        ]),
      };
    }
  }
}

/** Web address of the created issue, from the tracker's answer. */
export function issueLink(kind: TrackerKind, c: TrackerConfig, answer: unknown): string | null {
  const a = answer as Record<string, unknown> | null;
  if (!a || typeof a !== 'object') return null;
  const base = trim(c.baseUrl.trim());
  switch (kind) {
    case 'github':
      return typeof a.html_url === 'string' ? a.html_url : null;
    case 'gitlab':
      return typeof a.web_url === 'string' ? a.web_url : null;
    case 'jira':
      return typeof a.key === 'string' ? `${base}/browse/${a.key}` : null;
    case 'redmine': {
      const id = (a.issue as { id?: number } | undefined)?.id;
      return id === undefined ? null : `${base}/issues/${id}`;
    }
    case 'azure': {
      const href = (a._links as { html?: { href?: string } } | undefined)?.html?.href;
      return href ?? null;
    }
  }
}
