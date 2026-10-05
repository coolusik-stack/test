// Cut a release: one command sets the version everywhere, commits, tags, and (with --push) sends
// it to GitHub, where the tag builds TestFlight, deploys the website and renders store
// screenshots (see .github/workflows).
//   npm run release -- patch            0.1.0 → 0.1.1
//   npm run release -- minor --push     0.1.0 → 0.2.0, then push the commit and the tag
//   npm run release -- 1.0.0 --push
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd) => execSync(cmd, { cwd: root, stdio: 'pipe' }).toString().trim();
const args = process.argv.slice(2);
const want = args.find((a) => !a.startsWith('--')) || 'patch';
const push = args.includes('--push');

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const next = { major: `${ma + 1}.0.0`, minor: `${ma}.${mi + 1}.0`, patch: `${ma}.${mi}.${pa + 1}` }[want] || want;
if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`not a version: ${next}`);
if (sh('git status --porcelain')) throw new Error('commit or stash your changes first');


pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(join(root, 'js/version.js'), `// Set by scripts/release.mjs; shown in the settings screen so testers can say which build they have.\nexport const VERSION = '${next}';\n`);
const pbx = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
writeFileSync(pbx, readFileSync(pbx, 'utf8').replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${next};`));
const sw = join(root, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'af-${next}';`));

// a 1.x release goes to the store: every pre-launch warning must be fixed first
try {
  execSync(`node scripts/preflight.mjs${Number(next.split('.')[0]) >= 1 ? ' --strict' : ''}`, { cwd: root, stdio: 'inherit' });
} catch {
  sh('git checkout -- package.json js/version.js sw.js ios/App/App.xcodeproj/project.pbxproj');
  console.error(`v${next} not released: fix the pre-launch check above first.`);
  process.exit(1);
}
sh('git add package.json js/version.js sw.js ios/App/App.xcodeproj/project.pbxproj');
sh(`git commit -m "Release v${next}"`);
sh(`git tag v${next}`);
console.log(`v${next} committed and tagged.`);
if (push) {
  const branch = sh('git rev-parse --abbrev-ref HEAD');
  sh(`git push origin ${branch}`);
  sh(`git push origin v${next}`);
  console.log(`pushed: GitHub now runs the tests, then TestFlight, the website and the store screenshots for v${next}.`);
} else {
  console.log(`to ship it: git push origin HEAD && git push origin v${next}`);
}
