// Finds the addresses a build should know (see js/site.js) and prints them as KEY=value lines,
// for a workflow to append to $GITHUB_ENV before `node scripts/build-www.mjs`:
//   WEB_URL    vars.WEB_URL, else https://<pages project>.pages.dev when Cloudflare is set up
//   RELAY_URL  vars.RELAY_URL, else wss://dotori-relay.<workers subdomain>.workers.dev, but only
//              if that relay answers its health check (so a build never points at nothing)
// Reads CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PROJECT, and the optional overrides above.
const env = process.env;
const say = (m) => console.error(m);
let web = env.WEB_URL || '';
let relay = env.RELAY_URL || '';
const cf = env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID;

if (!web && cf) web = `https://${env.PROJECT || 'dotori-kkang'}.pages.dev`;

if (!relay && cf) {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/subdomain`, {
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    });
    const j = await r.json();
    const sub = j && j.result && j.result.subdomain;
    if (sub) {
      const host = `dotori-relay.${sub}.workers.dev`;
      const ok = await fetch(`https://${host}/health`).then((h) => h.text()).catch(() => '');
      if (ok.includes('dotori relay ok')) relay = `wss://${host}`;
      else say(`relay: https://${host}/health did not answer; deploy it with the Relay workflow first`);
    } else say(`relay: no workers.dev subdomain on this account (${JSON.stringify(j && j.errors)})`);
  } catch (e) {
    say('relay: Cloudflare API lookup failed: ' + e.message);
  }
}

say(`web ${web || '(none)'} · relay ${relay || '(none)'}`);
if (web) console.log(`WEB_URL=${web}`);
if (relay) console.log(`RELAY_URL=${relay}`);
