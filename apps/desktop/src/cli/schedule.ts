import type { ScheduleArgs } from './args';

export interface ScheduleEnv {
  platform: string;
  /** Command that starts the CLI (the launcher file next to the app). */
  exe: string;
}

const needsQuote = (s: string) => /[\s"'&|<>^%$`\\]/.test(s) && !/^[\w./:@=-]+$/.test(s);

/** Windows (cmd / Task Scheduler): wrap in double quotes, inner quotes escaped with \". */
const winQuote = (s: string) => (needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
/** POSIX shell: single quotes. */
const shQuote = (s: string) => (needsQuote(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s);

/**
 * Lines to paste into Task Scheduler (Windows) or `crontab -e` (macOS/Linux) so that a `run`
 * repeats every day, or Monday–Friday [X-04]. The app installs nothing by itself.
 */
export function scheduleLines(args: ScheduleArgs, env: ScheduleEnv): string[] {
  const [hh = '0', mm = '0'] = args.at.split(':');
  if (env.platform === 'win32') {
    const command = [env.exe, ...args.run].map(winQuote).join(' ');
    const days = args.weekdays ? 'WEEKLY /D MON,TUE,WED,THU,FRI' : 'DAILY';
    return [
      'Dán lệnh sau vào Command Prompt (chạy một lần để tạo tác vụ):',
      `schtasks /Create /TN ${winQuote(args.name)} /SC ${days} /ST ${hh.padStart(2, '0')}:${mm} /TR ${winQuote(command)} /F`,
      '',
      'Xóa tác vụ khi không cần nữa:',
      `schtasks /Delete /TN ${winQuote(args.name)} /F`,
    ];
  }
  const command = [env.exe, ...args.run].map(shQuote).join(' ');
  const log = `$HOME/kiemi-${args.name.replace(/[^\w-]+/g, '-')}.log`;
  return [
    'Chạy `crontab -e` rồi dán dòng sau:',
    `${Number(mm)} ${Number(hh)} * * ${args.weekdays ? '1-5' : '*'} ${command} >> ${log} 2>&1`,
  ];
}
