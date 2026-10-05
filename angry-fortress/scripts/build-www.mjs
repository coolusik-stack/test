// Copy the runtime files of the web game into www/ (what the iOS app bundles and the website
// serves). No bundler: the game is plain ES modules, so this is a straight copy. The service
// worker's cache name is stamped with the version and commit, so every deploy refreshes caches.
// site.json gets the addresses the release workflows found (env WEB_URL, RELAY_URL; see js/site.js).
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'privacy.html', 'support.html', 'manifest.webmanifest', 'site.json', 'sw.js', 'css', 'js', 'vendor', 'assets'];

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
const siteFile = join(out, 'site.json');
const siteInfo = { web: '', relay: '', ...JSON.parse(readFileSync(siteFile, 'utf8')) };
if (process.env.WEB_URL) siteInfo.web = process.env.WEB_URL.replace(/\/+$/, '');
if (process.env.RELAY_URL) siteInfo.relay = process.env.RELAY_URL.replace(/\/+$/, '');
writeFileSync(siteFile, JSON.stringify(siteInfo) + '\n');
const sw = join(out, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'af-${version}-${commit}';`));
console.log(`www/ ready (v${version}, ${commit}):`, files.filter((f) => existsSync(join(root, f))).join(', '));
console.log(`  web ${siteInfo.web || '(none)'} · relay ${siteInfo.relay || '(none: friend matches use direct links)'}`);
