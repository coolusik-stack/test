// npm test — every automated check the game has, in one headless Chromium.
//   npm test                         all suites
//   npm test -- --quick              fewer maps and turns (a fast local check)
//   npm test -- --only=walk,lockstep run some suites
// Screenshots and a summary land in tests/output/ (not committed). Exits non-zero on any failure.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { SUITES } from './suites/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'output');
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const run = SUITES.filter((s) => !only.length || only.includes(s.name));

// Console noise that says nothing about the game (offline fetches the page never needs).
const NOISE = /ERR_CERT|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|favicon|net::ERR_CONNECTION_REFUSED/;

const server = await serve(root);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const results = [];
const t0 = Date.now();

for (const suite of run) {
  const failures = [];
  const notes = [];
  const pages = [];
  const ctx = {
    url: server.url,
    quick,
    out,
    browser,
    check(ok, msg) { if (!ok) failures.push(msg); return ok; },
    note(msg) { notes.push(msg); },
    // A phone-sized landscape page that remembers its errors.
    async page(opts = {}) {
      const context = opts.context || await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: opts.dpr || 1, isMobile: true, hasTouch: true });
      if (opts.init) await context.addInitScript({ path: opts.init });
      const page = await context.newPage();
      page.errors = [];
      page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) page.errors.push('console: ' + m.text()); });
      await page.goto(server.url + 'index.html' + (opts.query || ''));
      await page.waitForFunction(() => window.__af && window.planck, null, { timeout: 15000 });
      pages.push(page);
      return page;
    },
    async shot(page, name) { await page.screenshot({ path: join(out, `${suite.name}-${name}.png`) }); },
  };
  const ts = Date.now();
  try {
    await suite.run(ctx);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack || e));
  }
  for (const p of pages) for (const e of p.errors) failures.push(e);
  for (const p of pages) await p.context().close().catch(() => {});
  const secs = ((Date.now() - ts) / 1000).toFixed(1);
  results.push({ name: suite.name, ok: !failures.length, secs, failures, notes });
  console.log(`${failures.length ? '✗' : '✓'} ${suite.name.padEnd(9)} ${secs.padStart(6)}s  ${suite.what}`);
  for (const n of notes) console.log(`    · ${n}`);
  for (const f of failures.slice(0, 12)) console.log(`    ✗ ${f}`);
}

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n${failed.length ? `${failed.length} of ${results.length} suites failed` : `all ${results.length} suites passed`} in ${total}s`);

// A markdown summary (GitHub shows it on the run page when CI writes it to the step summary).
const md = [`### 도토리깡 tests: ${failed.length ? '❌ ' + failed.length + ' failed' : '✅ all passed'} (${total}s${quick ? ', quick' : ''})`, '', '| suite | result | time | notes |', '|---|---|---|---|'];
for (const r of results) md.push(`| ${r.name} | ${r.ok ? '✅' : '❌ ' + r.failures.slice(0, 3).join('<br>').replace(/\|/g, '/')} | ${r.secs}s | ${r.notes.join('<br>').replace(/\|/g, '/')} |`);
writeFileSync(join(out, 'summary.md'), md.join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
