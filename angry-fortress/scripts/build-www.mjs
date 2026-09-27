// Copy the runtime files of the web game into www/ (what the iOS app bundles).
// No bundler: the game is plain ES modules, so this is a straight copy.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'privacy.html', 'manifest.webmanifest', 'css', 'js', 'vendor', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) {
  const src = join(root, f);
  if (!existsSync(src)) continue;
  cpSync(src, join(out, f), { recursive: true });
}
console.log('www/ ready:', files.filter((f) => existsSync(join(root, f))).join(', '));
