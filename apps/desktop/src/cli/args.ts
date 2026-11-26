export interface RunArgs {
  command: 'run';
  folder: string;
  /** Exactly one of these picks what to run (name or id). */
  suite?: string;
  test?: string;
  tag?: string;
  env?: string;
  junit?: string;
  results?: string;
  headless: boolean;
  secrets: Record<string, string>;
  timeoutSec?: number;
}

export interface ScheduleArgs {
  command: 'schedule';
  /** `HH:MM`. */
  at: string;
  /** Mon–Fri only, else every day. */
  weekdays: boolean;
  name: string;
  /** The `run` arguments to repeat (everything after `--`). */
  run: string[];
}

export type ParsedArgs =
  | RunArgs
  | ScheduleArgs
  | { command: 'help' }
  | { command: 'version' }
  | { command: 'error'; message: string };

const VALUE_FLAGS = new Set([
  '--suite',
  '--test',
  '--tag',
  '--env',
  '--junit',
  '--results',
  '--secret',
  '--timeout',
  '--at',
  '--name',
]);

/** Parses `kiemi <command> …`. Never throws: problems come back as `{command:'error'}`. */
export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined> = {},
): ParsedArgs {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h')
    return { command: 'help' };
  if (command === 'version' || command === '--version' || command === '-v')
    return { command: 'version' };
  if (command !== 'run' && command !== 'schedule')
    return { command: 'error', message: `Lệnh không biết: ${command}` };

  const dash = rest.indexOf('--');
  const own = dash < 0 ? rest : rest.slice(0, dash);
  const tail = dash < 0 ? [] : rest.slice(dash + 1);
  const flags = new Map<string, string[]>();
  const bools = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < own.length; i++) {
    const a = own[i] as string;
    if (a.startsWith('--')) {
      const [k, inline] = a.split(/=(.*)/s, 2) as [string, string | undefined];
      if (VALUE_FLAGS.has(k)) {
        const v = inline ?? own[++i];
        if (v === undefined) return { command: 'error', message: `Thiếu giá trị cho ${k}` };
        flags.set(k, [...(flags.get(k) ?? []), v]);
      } else if (k === '--headed' || k === '--headless' || k === '--weekdays') {
        bools.add(k);
      } else return { command: 'error', message: `Tùy chọn không biết: ${k}` };
    } else positional.push(a);
  }
  const one = (k: string): string | undefined => flags.get(k)?.at(-1);

  if (command === 'schedule') {
    const at = one('--at') ?? '';
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(at))
      return { command: 'error', message: 'Cần --at HH:MM, ví dụ --at 08:30' };
    if (tail.length === 0 || tail[0] !== 'run')
      return {
        command: 'error',
        message: 'Sau -- là lệnh run cần lặp lại, ví dụ: -- run D:\\du-an --suite smoke',
      };
    return {
      command: 'schedule',
      at,
      weekdays: bools.has('--weekdays'),
      name: one('--name') ?? 'Kiemi',
      run: tail,
    };
  }

  if (positional.length !== 1)
    return {
      command: 'error',
      message: 'Cần đúng một thư mục dự án: kiemi run <thư-mục-dự-án> --suite <tên>',
    };
  const picks = ['--suite', '--test', '--tag'].filter((k) => one(k) !== undefined);
  if (picks.length !== 1)
    return { command: 'error', message: 'Chọn đúng một trong --suite, --test, --tag' };

  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('KIEMI_SECRET_') && v !== undefined)
      secrets[k.slice('KIEMI_SECRET_'.length)] = v;
  }
  for (const s of flags.get('--secret') ?? []) {
    const eq = s.indexOf('=');
    if (eq <= 0)
      return {
        command: 'error',
        message: `--secret cần dạng TÊN=GIÁ_TRỊ (nhận: ${s.split('=')[0]})`,
      };
    secrets[s.slice(0, eq)] = s.slice(eq + 1);
  }
  const timeout = one('--timeout');
  if (timeout !== undefined && !(Number(timeout) >= 1))
    return { command: 'error', message: '--timeout là số giây (≥ 1)' };

  const args: RunArgs = {
    command: 'run',
    folder: positional[0] as string,
    headless: !bools.has('--headed'),
    secrets,
  };
  for (const k of ['suite', 'test', 'tag', 'env', 'junit', 'results'] as const) {
    const v = one(`--${k}`);
    if (v !== undefined) args[k] = v;
  }
  if (timeout !== undefined) args.timeoutSec = Number(timeout);
  return args;
}

export const HELP = `Kiemi CLI — chạy test không mở giao diện

  kiemi run <thư-mục-dự-án> (--suite <tên> | --test <tên> | --tag <tag>) [tùy chọn]
      --env <tên>        môi trường (mặc định: môi trường của suite, rồi môi trường đầu tiên)
      --junit <file>     ghi kết quả JUnit XML
      --results <thư mục> nơi lưu ảnh chụp/kết quả (mặc định: thư mục tạm)
      --secret TÊN=GIÁ_TRỊ  bí mật của môi trường (hoặc biến KIEMI_SECRET_<TÊN>)
      --timeout <giây>   thời gian chờ mỗi bước
      --headed           hiện cửa sổ trình duyệt
  kiemi schedule --at HH:MM [--weekdays] [--name <tên>] -- run <…>
      in lệnh Task Scheduler / cron để chạy hằng ngày
  kiemi version

Mã thoát: 0 đạt hết · 1 có test lỗi · 2 sai tham số/không tìm thấy · 3 lỗi hệ thống
`;
