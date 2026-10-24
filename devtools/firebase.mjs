// Runs the Firebase CLI with the project-local JDK 21 in .tools/ (the emulators need
// Java 21+; the machine-wide Java is 17 and is left alone). Falls back to PATH if absent.
// Usage: node firebase.mjs <firebase args...>
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, delimiter } from 'node:path';

const toolsDir = join(import.meta.dirname, '..', '.tools');
const jdk = existsSync(toolsDir) && readdirSync(toolsDir).find((d) => d.startsWith('jdk-21'));
const env = { ...process.env };
if (jdk) {
  env.JAVA_HOME = join(toolsDir, jdk);
  env.PATH = join(env.JAVA_HOME, 'bin') + delimiter + (env.PATH ?? env.Path ?? '');
  delete env.Path; // Windows env keys are case-insensitive; keep a single PATH
} else {
  console.warn('No .tools/jdk-21*: using Java from PATH (emulators need 21+). See docs/runbook.md.');
}

// firebase is a .cmd shim on Windows, which needs a shell; the shell joins args unquoted,
// so quote the ones with spaces (e.g. the emulators:exec command string).
const command = ['firebase', ...process.argv.slice(2).map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(' ');
const child = spawn(command, { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
