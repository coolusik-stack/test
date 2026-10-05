// Addresses only a real build knows, read from site.json next to index.html (scripts/build-www.mjs
// writes it from the WEB_URL and RELAY_URL the release workflows find):
//   web    the public web version, for invite links shared from the app
//   relay  the friend-match relay server (see relay/)
// A plain checkout has neither, and everything still works without them.
let loading = null;
export const site = { web: '', relay: '' };

export function loadSite() {
  if (!loading) {
    loading = fetch('site.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((j) => {
        if (j && /^https:\/\/[^\s]+$/.test(j.web || '')) site.web = j.web.replace(/\/+$/, '');
        if (j && /^wss?:\/\/[^\s]+$/.test(j.relay || '')) site.relay = j.relay.replace(/\/+$/, '');
        if (!site.web && !site.relay) loading = null; // nothing yet (offline?): look again next time
        return site;
      });
  }
  return loading;
}
