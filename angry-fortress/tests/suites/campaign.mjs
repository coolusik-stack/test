// 깡단 원정 and 깡단 옷장: the stage map opens in order, season by season, every stage on its own
// map; a stage plays as its CPU in its outfit, winning hands out stars by its goals and opens the
// next stage, stars open closet items, the outfit shows up in the next match, the result card is a
// real picture, and stars from the first campaign carry over.
export default {
  name: 'campaign',
  what: '깡단 원정 계절별 단계·별 → 옷장 아이템 열기·입기 → 결과 카드 → 옛 기록 옮기기',
  async run(t) {
    const page = await t.page();
    const game = (fn, arg) => page.evaluate(fn, arg);
    await page.click('#btn-solo');
    await page.waitForSelector('#campaign:not([hidden])');
    const tiles = await page.$$eval('#camp-grid .stage', (bs) => bs.map((b) => ({ id: b.dataset.stage, open: !b.disabled })));
    t.check(tiles.length === 12, `expected 12 stages, saw ${tiles.length}`);
    t.check(tiles[0].open && !tiles[1].open, 'only the first stage should be open at the start');
    const rows = await page.$$eval('#camp-grid .camp-row', (rs) => rs.map((r) => r.querySelector('.camp-map').textContent));
    t.check(rows.join() === '봄,여름,가을,겨울', `the stage rows should be the four seasons, saw ${rows.join()}`);
    const themes = await game(async () => (await import('./js/campaign.js')).STAGES.map((s) => s.theme));
    t.check(new Set(themes).size === 12, `every stage should have its own map: ${themes.join()}`);
    await t.shot(page, 'map');

    // stage 1: the card, then the match
    await page.click('#camp-grid .stage[data-stage="spring-1"]');
    await page.waitForSelector('#stagecard:not([hidden])');
    t.check((await page.$$('#stage-goals li')).length === 3, 'a stage card should list three goals');
    await t.shot(page, 'stage');
    await page.click('#stage-go');
    await page.waitForTimeout(400);
    if (await page.isVisible('#rotate')) await page.click('#rotate-ok');
    await page.waitForFunction(() => { const g = window.__af.game; return g && g.state === 'aim' && g.turn === 0; }, null, { timeout: 15000 });
    const o = await game(() => { const g = window.__af.game; return { campaign: g.opts.campaign, foe: g.players[1].name, hat: g.players[1].look.hat, diff: g.opts.difficulty }; });
    t.check(o.campaign === 'spring-1' && o.foe === '솔숲단 막내 솔솔' && o.diff === 'easy', `stage 1 did not start as itself: ${JSON.stringify(o)}`);

    // win it on the first shot, cleanly: three stars (won, health ≥ 50, within 8 shots)
    await game(() => { const g = window.__af.game; g.players[0].stats.shots = 1; g._kill(g.players[1], false); });
    await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    const got = await page.$$eval('#result-goals li', (ls) => ls.map((l) => l.className));
    t.check(got.length === 3 && got.every((c) => c.includes('got')), `expected all three goals met, saw ${JSON.stringify(got)}`);
    t.check(await page.textContent('#again-label') === '다음 단계', 'after a win the big button should go to the next stage');
    t.check(!(await page.isHidden('#unlock-note')) && /나뭇잎 모자/.test(await page.textContent('#unlock-note')), 'three stars should open the leaf hat (2 stars)');
    await page.waitForTimeout(1200);
    await t.shot(page, 'result');

    // the result card is a picture of the right size
    const card = await game(async () => {
      const { makeCard } = await import('./js/card.js');
      const cv = makeCard({ title: '승리!', sub: '솔솔을 이겼어요!', team: 0, look: { hat: 'crown', cart: 'gold', trail: 'star' }, map: '깡단 원정 · 봄 1 · 도토리 숲', stats: [['명중', 3], ['입힌 피해', 87], ['남은 체력', 64]], stars: 3, url: 'https://dotori-kkang.pages.dev' });
      const px = cv.getContext('2d').getImageData(600, 240, 1, 1).data;
      return { w: cv.width, h: cv.height, url: cv.toDataURL('image/png'), painted: px[3] > 0 };
    });
    t.check(card.w === 1200 && card.h === 675 && card.painted, `result card ${card.w}×${card.h}`);
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    writeFileSync(join(t.out, 'campaign-card.png'), Buffer.from(card.url.split(',')[1], 'base64'));

    // the next stage is open now
    await page.click('#btn-menu');
    await page.waitForSelector('#campaign:not([hidden])');
    t.check(await page.isEnabled('#camp-grid .stage[data-stage="spring-2"]'), 'winning stage 1 did not open stage 2');
    t.check(/★ 3/.test(await page.textContent('#camp-stars')), `star total: ${await page.textContent('#camp-stars')}`);

    // the closet: leaf hat open, mushroom hat (6 stars) locked; wear the leaf hat
    await page.click('#camp-closet');
    await page.waitForSelector('#closet:not([hidden])');
    t.check(!(await page.getAttribute('.look[data-look="leaf"]', 'class')).includes('locked'), 'the leaf hat should be open with 3 stars');
    t.check((await page.getAttribute('.look[data-look="mushroom"]', 'class')).includes('locked'), 'the mushroom hat should still be locked');
    await page.click('.look[data-look="mushroom"]');
    t.check(/별 6개/.test(await page.textContent('#closet-note')), 'a locked item should say how many stars it needs');
    await page.click('.look[data-look="leaf"]');
    t.check((await page.getAttribute('.look[data-look="leaf"]', 'class')).includes(' on'), 'the leaf hat was not put on');
    await page.click('#closet-tabs button[data-k="cart"]');
    t.check((await page.getAttribute('.look[data-look="red"]', 'class')).includes('locked'), 'the red cart (4 stars) should be locked at 3');
    await page.click('#closet-tabs button[data-k="hat"]');
    await page.waitForTimeout(300);
    await t.shot(page, 'closet');

    // and the next match shows it
    await page.click('#closet-back');
    await page.click('#camp-grid .stage[data-stage="spring-2"]');
    await page.click('#stage-go');
    await page.waitForFunction(() => { const g = window.__af.game; return g && g.opts.campaign === 'spring-2'; }, null, { timeout: 15000 });
    const o2 = await game(() => { const g = window.__af.game; return { hat: g.players[0].look.hat, theme: g.opts.theme }; });
    t.check(o2.hat === 'leaf', 'the chosen hat did not show up in the match');
    t.check(o2.theme === 'blossom', `stage 2 should be on 벚꽃 분지, was ${o2.theme}`);
    await page.waitForTimeout(1600);
    await t.shot(page, 'outfit');

    // stars from the first campaign (three stages on each of four maps) carry over stage for stage
    const moved = await game(async () => {
      const Camp = await import('./js/campaign.js');
      localStorage.setItem('af.campaign', JSON.stringify({ stars: { 'oak-1': [true, true, true], 'oak-2': [true, false, false], 'maple-1': [true, true, false] } }));
      const p = Camp.progress();
      return { total: Camp.totalStars(p), s2: Camp.starCount(p, 'spring-2'), s4: Camp.starCount(p, 'summer-1'), open5: Camp.isOpen(p, 4), saved: JSON.parse(localStorage.getItem('af.campaign')).stars };
    });
    t.check(moved.total === 6 && moved.s2 === 1 && moved.s4 === 2 && moved.open5, `old progress did not carry over: ${JSON.stringify(moved)}`);
    t.check(moved.saved['spring-1'] && !moved.saved['oak-1'], 'the carried-over progress should be saved under the new stage ids');
  },
};
