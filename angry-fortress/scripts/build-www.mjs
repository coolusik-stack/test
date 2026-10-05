// Copy the runtime files of the web game into www/ (what the iOS app bundles and the website
// serves). No bundler: the game is plain ES modules, so this is a straight copy. The service
// worker's cache name is stamped with the version and commit, so every deploy refreshes caches.
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'privacy.html', 'support.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'vendor', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) {
  const src = join(root, f);
  if (!existsSync(src)) continue;
  cpSync(src, join(out, f), { recursive: true });
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
let commit = 'local';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { /* not a checkout */ }
const sw = join(out, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'af-${version}-${commit}';`));
console.log(`www/ ready (v${version}, ${commit}):`, files.filter((f) => existsSync(join(root, f))).join(', '));
