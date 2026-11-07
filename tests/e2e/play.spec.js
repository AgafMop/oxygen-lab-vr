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
