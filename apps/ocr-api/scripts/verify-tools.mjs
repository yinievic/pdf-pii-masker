import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function run(label, command, args) {
  const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 5 * 1024 * 1024 });
  const output = `${stdout}${stderr}`.trim();
  process.stdout.write(`\n$ ${label}\n${output}\n`);
}

await run('tesseract --version', 'tesseract', ['--version']);
await run('tesseract --list-langs', 'tesseract', ['--list-langs']);
await run('pdftoppm -h', 'pdftoppm', ['-h']);
