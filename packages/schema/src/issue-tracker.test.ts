import { describe, expect, it } from 'vitest';
import { issueLink, issueRequest, type TrackerConfig, trackerProblem } from './issue-tracker';

const cfg = (o: Partial<TrackerConfig> = {}): TrackerConfig => ({
  baseUrl: '',
  project: '',
  issueType: '',
  username: '',
  ...o,
});
const issue = { title: 'Lỗi lưu đơn', body: 'Bước 3 lỗi' };

describe('issue trackers [X-02]', () => {
  it('builds the request of each tracker with the token in the right header', () => {
    const gh = issueRequest('github', cfg({ project: 'cty/app' }), 'T', issue);
    expect(gh.url).toBe('https://api.github.com/repos/cty/app/issues');
    expect(gh.headers.authorization).toBe('Bearer T');
    expect(JSON.parse(gh.body)).toEqual({ title: 'Lỗi lưu đơn', body: 'Bước 3 lỗi' });

    const gl = issueRequest('gitlab', cfg({ project: 'cty/app' }), 'T', issue);
    expect(gl.url).toBe('https://gitlab.com/api/v4/projects/cty%2Fapp/issues');
    expect(gl.headers['private-token']).toBe('T');

    const jira = issueRequest(
      'jira',
      cfg({ baseUrl: 'https://j.vn/', project: 'HR', username: 'a@x.vn' }),
      'T',
      issue,
    );
    expect(jira.url).toBe('https://j.vn/rest/api/2/issue');
    expect(jira.headers.authorization).toBe(`Basic ${Buffer.from('a@x.vn:T').toString('base64')}`);
    expect(JSON.parse(jira.body).fields).toMatchObject({
      project: { key: 'HR' },
      issuetype: { name: 'Bug' },
    });

    expect(
      issueRequest('redmine', cfg({ baseUrl: 'https://r.vn', project: '7' }), 'T', issue).headers[
        'x-redmine-api-key'
      ],
    ).toBe('T');
    const az = issueRequest('azure', cfg({ project: 'org/Dự án' }), 'T', issue);
    expect(az.url).toContain('/org/D%E1%BB%B1%20%C3%A1n/_apis/wit/workitems/$Bug');
    expect(az.headers['content-type']).toBe('application/json-patch+json');
  });

  it('finds the link of the created issue', () => {
    expect(issueLink('github', cfg(), { html_url: 'https://g/1' })).toBe('https://g/1');
    expect(issueLink('jira', cfg({ baseUrl: 'https://j.vn/' }), { key: 'HR-9' })).toBe(
      'https://j.vn/browse/HR-9',
    );
    expect(issueLink('redmine', cfg({ baseUrl: 'https://r.vn' }), { issue: { id: 12 } })).toBe(
      'https://r.vn/issues/12',
    );
    expect(issueLink('gitlab', cfg(), {})).toBeNull();
  });

  it('names what is missing in the settings', () => {
    expect(trackerProblem('github', cfg())).toBe('project');
    expect(trackerProblem('jira', cfg({ project: 'HR' }))).toBe('baseUrl');
    expect(trackerProblem('github', cfg({ project: 'app' }))).toBe('githubRepo');
    expect(trackerProblem('gitlab', cfg({ project: '12' }))).toBeNull();
  });
});
