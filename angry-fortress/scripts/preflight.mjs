// Pre-launch check: the things App Store review and real players trip over, checked by machine.
//   npm run preflight            report; fails only on hard errors
//   npm run preflight -- --strict  warnings fail too (used before a store submission)
// Writes tests/output/preflight.md for the CI run page.
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strict = process.argv.includes('--strict');
const rows = [];
const ok = (msg) => rows.push(['✓', msg]);
const warn = (msg) => rows.push(['⚠', msg]);
const fail = (msg) => rows.push(['✗', msg]);
const check = (cond, good, bad, level = fail) => (cond ? ok(good) : level(bad));

// one version everywhere
const version = JSON.parse(read('package.json')).version;
const jsVersion = (read('js/version.js').match(/VERSION = '([^']+)'/) || [])[1];
const xcVersions = [...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
check(jsVersion === version, `version ${version} in package.json and js/version.js`, `js/version.js says ${jsVersion}, package.json ${version} (run npm run release)`);
check(xcVersions.length && xcVersions.every((v) => v === version), `Xcode MARKETING_VERSION ${version}`, `Xcode MARKETING_VERSION is ${xcVersions.join('/')}, package.json ${version} (CI overrides it, but keep them equal)`, warn);

// the store listing fits App Store Connect's limits and avoids other games' names
const meta = (f) => { const p = join(root, 'store/metadata/ko', f); return existsSync(p) ? readFileSync(p, 'utf8').trim() : null; };
for (const [f, max] of [['name.txt', 30], ['subtitle.txt', 30], ['keywords.txt', 100], ['promotional_text.txt', 170], ['description.txt', 4000]]) {
  const t = meta(f);
  if (t == null) { fail(`store/metadata/ko/${f} missing`); continue; }
  check(t.length <= max, `${f}: ${t.length}/${max}`, `${f} is ${t.length} characters, limit ${max}`);
}
const kw = meta('keywords.txt') || '';
const marks = ['포트리스', 'fortress', '웜즈', 'worms', '건바운드', 'gunbound', '앵그리버드', 'angry birds'].filter((w) => kw.toLowerCase().includes(w));
check(!marks.length, 'keywords free of other games\' names', `keywords mention ${marks.join(', ')} (App Review 2.3.7 rejects that)`);
for (const f of ['support_url.txt', 'privacy_url.txt']) check(/^https:\/\//.test(meta(f) || ''), `${f} is an https URL`, `${f} missing or not https`);

// pages the store links to are filled in
for (const f of ['privacy.html', 'support.html']) {
  if (!existsSync(join(root, f))) { fail(`${f} missing`); continue; }
  const t = read(f);
  check(!/\[문의 이메일|\[contact email\]/.test(t), `${f} has a contact`, `${f} still says [문의 이메일을 적어 주세요]: put your support email in`, warn);
}

// the App Store icon must be 1024×1024 with no alpha channel (upload fails otherwise)
const iconDir = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const icon = existsSync(iconDir) && readdirSync(iconDir).find((f) => f.endsWith('.png'));
if (!icon) fail('no App Store icon in AppIcon.appiconset');
else {
  const b = readFileSync(join(iconDir, icon));
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colorType = b[25];
  check(w === 1024 && h === 1024, `app icon ${w}×${h}`, `app icon is ${w}×${h}, needs 1024×1024`);
  check(colorType === 2, 'app icon has no alpha channel', `app icon has an alpha channel (PNG color type ${colorType}); App Store upload rejects it (ITMS-90717)`);
}

// everything the game loads works offline: no remote fonts, every script in the offline cache
const shipped = ['index.html', 'css/style.css', ...readdirSync(join(root, 'js')).map((f) => 'js/' + f)];
const remote = shipped.filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(read(f)));
check(!remote.length, 'no Google Fonts requests (fonts ship with the game)', `still loading fonts from Google: ${remote.join(', ')}`);
const sw = read('sw.js');
const missing = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js') && !sw.includes(`./js/${f}`));
check(!missing.length, 'every script is in the offline cache (sw.js)', `sw.js does not cache ${missing.join(', ')}`);

// iOS project basics
const plist = read('ios/App/App/Info.plist');
check(/ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist), 'export compliance answered in Info.plist', 'Info.plist lacks ITSAppUsesNonExemptEncryption = NO');
check(/UISupportedInterfaceOrientations[\s\S]*?Landscape/.test(plist), 'landscape-only orientation', 'Info.plist orientation is not landscape');

// fresh store screenshots (rendered by npm run store:shots or the Store assets workflow)
const shots = join(root, 'store/screenshots/ko');
const n = existsSync(shots) ? readdirSync(shots).filter((f) => f.endsWith('.png')).length : 0;
check(n >= 3, `${n} App Store screenshots ready`, 'no App Store screenshots yet (npm run store:shots)', warn);

const errors = rows.filter((r) => r[0] === '✗').length, warnings = rows.filter((r) => r[0] === '⚠').length;
for (const [s, m] of rows) console.log(`${s} ${m}`);
console.log(`\n${errors} errors, ${warnings} warnings`);
mkdirSync(join(root, 'tests/output'), { recursive: true });
writeFileSync(join(root, 'tests/output/preflight.md'), [`### 출시 전 점검: ${errors} errors, ${warnings} warnings`, '', ...rows.map(([s, m]) => `- ${s} ${m}`)].join('\n') + '\n');
process.exit(errors || (strict && warnings) ? 1 : 0);
