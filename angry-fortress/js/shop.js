// In-app purchases: the 깡단 후원 팩 (and whatever joins it later). In the phone apps they go
// through the NativePurchases plugin (StoreKit 2 on iOS, Play Billing on Android; both verify the
// purchase on the device, so there is no server). The web version has no shop.
// What has been bought is remembered on the phone ('af.owned', read by the closet) and can always
// be restored from the store, which App Review requires.
//
// Product ids must match the ones created in App Store Connect and the Play Console.
import { storage } from './util.js';

export const PRODUCTS = [
  {
    id: 'supporter_pack',
    grants: ['pack'],
    name: '깡단 후원 팩',
    desc: '깡단 리본 · 산딸기 수레 · 무지개 발사 자국. 혼자 만드는 게임을 응원해 주세요!',
  },
];

function plugin() {
  if (window.__afShopMock) return window.__afShopMock; // tests
  const c = window.Capacitor;
  if (!c || typeof c.isNativePlatform !== 'function' || !c.isNativePlatform()) return null;
  return (c.Plugins && c.Plugins.NativePurchases) || null;
}

export const shopAvailable = () => !!plugin();

export function owned() {
  const o = storage.get('af.owned', {});
  return o && typeof o === 'object' ? o : {};
}

function grant(productId) {
  const p = PRODUCTS.find((q) => q.id === productId);
  if (!p) return false;
  const o = owned();
  for (const g of p.grants) o[g] = true;
  storage.set('af.owned', o);
  return true;
}

const has = (p) => p.grants.every((g) => owned()[g]);
export const ownsProduct = (id) => { const p = PRODUCTS.find((q) => q.id === id); return !!p && has(p); };

// Products with their store prices: [{ id, name, desc, price, owned }], or null without a shop.
let cache = null;
export async function catalog() {
  const P = plugin();
  if (!P) return null;
  if (!cache) {
    try {
      const { products } = await P.getProducts({ productIdentifiers: PRODUCTS.map((p) => p.id), productType: 'inapp' });
      cache = new Map((products || []).map((q) => [q.identifier, q]));
    } catch (e) {
      console.warn('shop products', e);
      return PRODUCTS.map((p) => ({ ...p, price: null, owned: has(p) }));
    }
  }
  return PRODUCTS.map((p) => ({ ...p, price: cache.get(p.id) ? cache.get(p.id).priceString : null, owned: has(p) }));
}

const cancelled = (e) => /cancel|취소|user/i.test(String((e && (e.code || e.message)) || e));

// 'bought' | 'cancelled' | 'failed' | 'unavailable'
export async function buy(id) {
  const P = plugin();
  if (!P) return 'unavailable';
  try {
    const t = await P.purchaseProduct({ productIdentifier: id, productType: 'inapp', quantity: 1 });
    if (t && (t.productIdentifier === id || !t.productIdentifier)) { grant(id); return 'bought'; }
    return 'failed';
  } catch (e) {
    if (cancelled(e)) return 'cancelled';
    console.warn('shop buy', e);
    return 'failed';
  }
}

// Everything the store says this account owns. `ask` also asks the store to sync first (iOS may
// ask for the Apple ID password then, so only on the player's tap).
// Returns the number of products restored, or -1 when the store could not be reached.
export async function restore(ask = true) {
  const P = plugin();
  if (!P) return -1;
  try {
    if (ask) await P.restorePurchases();
    const { purchases } = await P.getPurchases({ productType: 'inapp' });
    let n = 0;
    for (const t of purchases || []) {
      if (t.revocationDate) continue;
      if (t.purchaseState && !/purchased|1/i.test(String(t.purchaseState))) continue; // Android: pending
      if (grant(t.productIdentifier)) n++;
    }
    return n;
  } catch (e) {
    console.warn('shop restore', e);
    return -1;
  }
}
