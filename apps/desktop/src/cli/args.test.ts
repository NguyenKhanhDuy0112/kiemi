import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';

describe('CLI arguments [X-04]', () => {
  it('reads a run with a suite, environment, junit file and secrets', () => {
    const a = parseArgs(
      [
        'run',
        'D:\\du-an',
        '--suite',
        'smoke',
        '--env=uat',
        '--junit',
        'out.xml',
        '--secret',
        'matKhau=a=b',
        '--headed',
      ],
      { KIEMI_SECRET_token: 'T', PATH: '/x' },
    );
    expect(a).toEqual({
      command: 'run',
      folder: 'D:\\du-an',
      suite: 'smoke',
      env: 'uat',
      junit: 'out.xml',
      headless: false,
      secrets: { token: 'T', matKhau: 'a=b' },
    });
  });
  it('runs hidden by default and the flag wins over the environment variable', () => {
    const a = parseArgs(['run', 'p', '--test', 'T', '--secret', 'k=1'], { KIEMI_SECRET_k: '0' });
    expect(a).toMatchObject({ headless: true, secrets: { k: '1' } });
  });
  it('asks for exactly one target and one folder', () => {
    expect(parseArgs(['run', 'p'])).toMatchObject({
      command: 'error',
      message: expect.stringContaining('--suite'),
    });
    expect(parseArgs(['run', 'p', '--suite', 'a', '--tag', 'b'])).toMatchObject({
      command: 'error',
    });
    expect(parseArgs(['run', '--suite', 'a'])).toMatchObject({
      command: 'error',
      message: expect.stringContaining('thư mục'),
    });
  });
  it('explains bad options', () => {
    expect(parseArgs(['run', 'p', '--suite'])).toMatchObject({
      message: 'Thiếu giá trị cho --suite',
    });
    expect(parseArgs(['run', 'p', '--suite', 's', '--wat'])).toMatchObject({
      message: 'Tùy chọn không biết: --wat',
    });
    expect(parseArgs(['run', 'p', '--suite', 's', '--secret', 'oops'])).toMatchObject({
      command: 'error',
    });
    expect(parseArgs(['run', 'p', '--suite', 's', '--timeout', '0'])).toMatchObject({
      command: 'error',
    });
    expect(parseArgs(['nope'])).toMatchObject({ command: 'error' });
  });
  it('shows help and version', () => {
    expect(parseArgs([])).toEqual({ command: 'help' });
    expect(parseArgs(['--version'])).toEqual({ command: 'version' });
  });
  it('reads a schedule with the run to repeat after --', () => {
    expect(
      parseArgs(['schedule', '--at', '08:30', '--weekdays', '--', 'run', 'D:\\p', '--suite', 's']),
    ).toEqual({
      command: 'schedule',
      at: '08:30',
      weekdays: true,
      name: 'Kiemi',
      run: ['run', 'D:\\p', '--suite', 's'],
    });
    expect(parseArgs(['schedule', '--at', '25:00', '--', 'run', 'p'])).toMatchObject({
      command: 'error',
    });
    expect(parseArgs(['schedule', '--at', '08:00'])).toMatchObject({ command: 'error' });
  });
});
