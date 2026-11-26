/**
 * `kiemi` command line [X-04, ADR 0022]. Runs under Node or Electron's `ELECTRON_RUN_AS_NODE`;
 * it never imports `electron`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HELP, parseArgs } from './args';
import { EXIT, execute } from './run';

/** Version of the app this file ships in (`package.json` two folders up from `out/main/cli.js`). */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const io = {
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
  };
  const args = parseArgs(argv, env);
  switch (args.command) {
    case 'help':
      io.out(HELP);
      return EXIT.ok;
    case 'version':
      io.out(env.KIEMI_VERSION ?? readVersion());
      return EXIT.ok;
    case 'error':
      io.err(`${args.message}\n\n${HELP}`);
      return EXIT.usage;
    case 'schedule': {
      const { scheduleLines } = await import('./schedule');
      for (const line of scheduleLines(args, {
        platform: process.platform,
        exe: env.KIEMI_CLI ?? 'kiemi',
      }))
        io.out(line);
      return EXIT.ok;
    }
    case 'run':
      return execute(args, io);
  }
}

if (process.env.KIEMI_CLI_AUTORUN !== '0') {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`Lỗi hệ thống: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(EXIT.system);
    },
  );
}
