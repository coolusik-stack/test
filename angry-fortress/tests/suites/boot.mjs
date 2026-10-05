// The game starts, its own fonts load (nothing fetched from Google), the title screen is there.
export default {
  name: 'boot',
  what: '켜짐 · 내장 글꼴 · 타이틀',
  async run(t) {
    const page = await t.page({ dpr: 2 });
    const r = await page.evaluate(async () => {
      await Promise.all([document.fonts.load('24px "Jua"'), document.fonts.load('24px "Black Han Sans"')]);
      await document.fonts.ready;
      const faces = [...document.fonts].map((f) => f.family.replace(/["']/g, '') + ':' + f.status);
      const remote = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /fonts\.(googleapis|gstatic)\.com/.test(n));
      return { faces, remote };
    });
    t.check(r.faces.includes('Jua:loaded'), `Jua not loaded (${r.faces.join(', ')})`);
    t.check(r.faces.includes('Black Han Sans:loaded'), `Black Han Sans not loaded (${r.faces.join(', ')})`);
    t.check(!r.remote.length, `fonts fetched from Google: ${r.remote.join(', ')}`);
    for (const id of ['#btn-friend', '#btn-solo', '#btn-help']) t.check(await page.isVisible(id), `${id} not visible on the title`);
    await page.waitForTimeout(800);
    await t.shot(page, 'title');
  },
};
