// 깡단 후원 팩 with a stand-in store: the closet shows it with the store's price, a cancelled
// purchase changes nothing, a real one opens the pack items, and after the phone forgets
// (a reinstall) the purchase comes back by itself at launch and with 구매 복원.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOCK_SHOP = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mockshop.js');

export default {
  name: 'shop',
  what: '후원 팩: 가격 표시 · 구매 취소 · 구매 · 다시 설치 후 복원',
  async run(t) {
    const context = await t.browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await context.addInitScript({ path: MOCK_SHOP });
    const page = await t.page({ context });
    const locked = async (id) => (await page.getAttribute(`.look[data-look="${id}"]`, 'class')).includes('locked');
    const toastSays = (re) => page.waitForFunction((src) => { const el = document.querySelector('#toast'); return !el.hidden && new RegExp(src).test(el.textContent); }, re.source, { timeout: 5000 }).then(() => true, () => false);

    await page.click('#btn-closet');
    await page.waitForSelector('#shop-card:not([hidden])', { timeout: 5000 });
    t.check((await page.textContent('#shop-buy')).includes('₩5,900'), `price not shown: ${await page.textContent('#shop-buy')}`);
    t.check(await locked('ribbon'), 'the ribbon should be locked before buying');

    await page.evaluate(() => { window.__mockShopCancel = true; });
    await page.click('#shop-buy');
    await page.waitForTimeout(400);
    t.check(await locked('ribbon'), 'a cancelled purchase opened the pack');

    await page.click('#shop-buy');
    t.check(await toastSays(/고마워요/), 'no thank-you after buying');
    t.check(!(await locked('ribbon')), 'buying did not open the ribbon');
    t.check((await page.textContent('#shop-buy')) === '고마워요!' && await page.isDisabled('#shop-buy'), 'the pack can still be bought after buying it');
    await page.click('.look[data-look="ribbon"]');
    await page.click('#closet-tabs button[data-k="trail"]');
    t.check(!(await locked('rainbow')), 'the rainbow trail is not open after buying');
    await t.shot(page, 'bought');

    // a reinstall: the phone forgets, the store account remembers
    await page.evaluate(() => { localStorage.removeItem('af.owned'); });
    await page.reload();
    await page.waitForFunction(() => window.__af && window.planck, null, { timeout: 15000 });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('af.owned') || '{}').pack, null, { timeout: 5000 }).catch(() => {});
    t.check(await page.evaluate(() => !!JSON.parse(localStorage.getItem('af.owned') || '{}').pack), 'the purchase did not come back by itself at launch');
    const calls = await page.evaluate(() => window.__afShopMock.calls.join(','));
    t.check(!calls.includes('restore'), `launch asked the store to sync (could prompt for a password): ${calls}`);

    await page.evaluate(() => { localStorage.removeItem('af.owned'); });
    await page.click('#btn-settings');
    t.check(await page.isVisible('#settings-restore'), 'no 구매 복원 in settings');
    await page.click('#settings-restore');
    t.check(await toastSays(/되찾았어요/), 'restore did not say it worked');
    t.check(await page.evaluate(() => !!JSON.parse(localStorage.getItem('af.owned') || '{}').pack), '구매 복원 did not bring the pack back');
  },
};
