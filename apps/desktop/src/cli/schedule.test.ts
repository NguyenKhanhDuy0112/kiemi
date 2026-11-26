import { describe, expect, it } from 'vitest';
import type { ScheduleArgs } from './args';
import { scheduleLines } from './schedule';

const base: ScheduleArgs = {
  command: 'schedule',
  at: '8:05',
  weekdays: true,
  name: 'Kiemi smoke',
  run: ['run', 'D:\\Dự án\\Web', '--suite', 'smoke test', '--junit', 'D:\\out.xml'],
};

describe('schedule command lines [X-04]', () => {
  it('builds a Task Scheduler command for Monday–Friday', () => {
    const [, cmd] = scheduleLines(base, {
      platform: 'win32',
      exe: 'C:\\Program Files\\Kiemi\\kiemi.cmd',
    });
    expect(cmd).toBe(
      'schtasks /Create /TN "Kiemi smoke" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 08:05 /TR "\\"C:\\Program Files\\Kiemi\\kiemi.cmd\\" run \\"D:\\Dự án\\Web\\" --suite \\"smoke test\\" --junit \\"D:\\out.xml\\"" /F',
    );
  });
  it('builds a daily crontab line with a log file', () => {
    const [, line] = scheduleLines(
      { ...base, weekdays: false, run: ['run', '/srv/du an', '--suite', 's'] },
      { platform: 'linux', exe: '/opt/Kiemi/kiemi.sh' },
    );
    expect(line).toBe(
      "5 8 * * * /opt/Kiemi/kiemi.sh run '/srv/du an' --suite s >> $HOME/kiemi-Kiemi-smoke.log 2>&1",
    );
  });
  it('uses 1-5 for weekdays on cron', () => {
    expect(scheduleLines(base, { platform: 'darwin', exe: 'kiemi' })[1]).toMatch(/^5 8 \* \* 1-5 /);
  });
});
