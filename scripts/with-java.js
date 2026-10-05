/**
 * Runs a command with the portable Java from ./.tools/jre on the PATH (if present),
 * so the Firebase emulators work without a system-wide Java install.
 *   node scripts/with-java.js firebase emulators:start ...
 */
const path = require('path');
const { spawn } = require('child_process');
const { javaBin } = require('./setup-java');

const bin = javaBin();
const env = { ...process.env };
if (bin) {
  env.PATH = `${bin}${path.delimiter}${env.PATH || env.Path || ''}`;
  env.Path = env.PATH;
  env.JAVA_HOME = path.dirname(bin);
} else {
  console.warn('[with-java] Portable Java not found. If the emulators fail to start, run: npm run setup:java');
}

const [cmd, ...args] = process.argv.slice(2);
const localBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? `${cmd}.cmd` : cmd);
const program = require('fs').existsSync(localBin) ? localBin : cmd;
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
// One pre-quoted command line, so arguments with spaces survive on Windows (.cmd shims need a shell).
const child = spawn([program, ...args].map(quote).join(' '), { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
