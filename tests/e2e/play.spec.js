import { test, expect } from '@playwright/test';

const SHOTS = 'test-results/shots';

async function boot(page, query = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test' + query);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  return errors;
}

const budget = page => page.evaluate(() => {
  const { renderer, scene, camera } = window.__ctx.engine;
  renderer.info.autoReset = false; renderer.info.reset();
  renderer.render(scene, camera);
  const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  renderer.info.autoReset = true;
  return r;
});

test('ui: card, subtitle and O2 meter render in Hebrew', async ({ page }) => {
  const errors = await boot(page, '&uidemo');
  await page.waitForTimeout(700);
  await expect(page.locator('#sub')).toContainText('רובי');
  await expect(page.locator('#o2 b')).toHaveText('05:15');
  await page.screenshot({ path: `${SHOTS}/ui.png` });
  expect(errors).toEqual([]);
});

test('boots and teleports', async ({ page }) => {
  const errors = await boot(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/bench.png` });
  const b1 = await budget(page);

  await page.evaluate(() => window.__ctx.loco.goTo('robot'));
  const d = await page.evaluate(() => {
    const { engine, loco } = window.__ctx;
    const head = engine.headPosition();
    const s = loco.stations.robot.pos;
    return Math.hypot(head.x - s.x, head.z - s.z);
  });
  expect(d).toBeLessThan(0.3);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/robot.png` });
  const b2 = await budget(page);

  for (const id of ['entry', 'generator']) {
    await page.evaluate(i => window.__ctx.loco.goTo(i), id);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${id}.png` });
  }
  console.log('budget bench', b1, 'robot', b2);
  for (const b of [b1, b2]) { expect(b.calls).toBeLessThanOrEqual(150); expect(b.tris).toBeLessThanOrEqual(300_000); }
  expect(errors).toEqual([]);
});

for (const id of ['splash', 'sealedBlast', 'elephantToothpaste', 'acidMelt', 'boil', 'cylinderNotFilled']) {
  test(`fx: ${id}`, async ({ page }) => {
    const errors = await boot(page, `&auto&fx=${id}`);
    await page.waitForFunction(() => window.__fxMid === true);
    await page.waitForTimeout(id === 'splash' ? 150 : 900);
    await page.screenshot({ path: `${SHOTS}/fx-${id}.png` });
    await page.waitForFunction(() => window.__fxDone === true, null, { timeout: 120_000 });
    expect(errors).toEqual([]);
  });
}

test('trial demo: bubbles fill the cylinder', async ({ page }) => {
  const errors = await boot(page, '&auto&trialdemo');
  await page.waitForFunction(() => window.__running === true && window.__ctx.app.gasMl() > 8, null, { timeout: 120_000 });
  await page.screenshot({ path: `${SHOTS}/trial-running.png` });
  await page.waitForFunction(() => window.__fxDone === true, null, { timeout: 120_000 });
  const gas = await page.evaluate(() => window.__ctx.app.gasMl());
  expect(gas).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('chapter 1 auto', async ({ page }) => {
  const errors = await boot(page, '&auto&only=hypothesis');
  await page.waitForFunction(() => window.__ctx.loco.current === 'bench' && document.querySelectorAll('canvas').length, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ch1.png` });
  await page.waitForFunction(() => window.__chapterDone === 'hypothesis', null, { timeout: 150_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.hypothesis).toBe('peak');
  expect(s.flags.varsFirstTry).toBe(true);
  expect(errors).toEqual([]);
});

test('chapter 2 auto: three valid trials at 37', async ({ page }) => {
  const errors = await boot(page, '&auto&only=bench');
  await page.waitForFunction(() => window.__chapterDone === 'bench', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.trials[37].filter(t => t.valid).length).toBe(3);
  expect(s.o2).toBe(315);
  await page.screenshot({ path: `${SHOTS}/ch2-done.png` });
  expect(errors).toEqual([]);
});

test('chapter 2 autofail sealedBlast costs 15 more minutes', async ({ page }) => {
  const errors = await boot(page, '&auto&only=bench&autofail=sealedBlast');
  await page.waitForFunction(() => window.__chapterDone === 'bench', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.trials[37].filter(t => t.valid).length).toBe(3);
  expect(s.o2).toBe(300);
  expect(errors).toEqual([]);
});

test('chapter 2 autofail acidMelt: game over, restore, finish', async ({ page }) => {
  const errors = await boot(page, '&auto&only=bench&autofail=acidMelt');
  await page.waitForFunction(() => window.__gameOver === 1, null, { timeout: 170_000 });
  await page.screenshot({ path: `${SHOTS}/gameover.png` });
  await page.waitForFunction(() => window.__chapterDone === 'bench', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.o2).toBe(315);
  expect(s.flags.hadGameOver).toBe(true);
  expect(errors).toEqual([]);
});

test('chapter 3 auto: plan, 15 robot trials, one unmixed outlier', async ({ page }) => {
  const errors = await boot(page, '&auto&only=robot');
  await page.waitForFunction(() => Object.values(window.__ctx.game.s.trials).flat().length >= 9, null, { timeout: 170_000 });
  await page.screenshot({ path: `${SHOTS}/ch3-running.png` });
  await page.waitForFunction(() => window.__chapterDone === 'robot', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  const all = Object.values(s.trials).flat();
  expect(all.length).toBe(18);
  expect(all.filter(t => t.meta === 'unmixed').length).toBe(1);
  expect(s.plan).toEqual([20, 30, 37, 45, 55, 65]);
  await page.evaluate(() => window.__ctx.loco.goTo('robot', { fade: false }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/graph-wall.png` });
  expect(errors).toEqual([]);
});

test('chapter 3 low oxygen: game over mid-run, then restore and finish', async ({ page }) => {
  const errors = await boot(page, '&auto&only=robot&o2=40');
  await page.waitForFunction(() => window.__gameOver === 1, null, { timeout: 170_000 });
  await page.waitForFunction(() => window.__chapterDone === 'robot', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(Object.values(s.trials).flat().length).toBe(18);
  expect(s.o2).toBe(360 - 18 * 15);
  expect(errors).toEqual([]);
});
