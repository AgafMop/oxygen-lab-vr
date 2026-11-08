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
  const errors = await boot(page, '&nogame');
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
  expect(all.length).toBe(20);                                   // 3 student + 15 robot + leak + storm (both redone)
  expect(all.filter(t => t.meta === 'unmixed').length).toBe(1);
  expect(all.filter(t => t.reason === 'leak').length).toBe(1);
  expect(all.filter(t => t.reason === 'storm').length).toBe(1);
  expect(s.badges).toContain('stormCalm');
  expect(s.plan).toEqual([20, 30, 37, 45, 55, 65]);
  await page.evaluate(() => window.__ctx.loco.goTo('robot', { fade: false }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/graph-wall.png` });
  expect(errors).toEqual([]);
});

test('chapter 3 low oxygen: game over mid-run, then restore and finish', async ({ page }) => {
  const errors = await boot(page, '&auto&only=robot&o2run=40');
  await page.waitForFunction(() => window.__gameOver === 1, null, { timeout: 170_000 });
  await page.waitForFunction(() => window.__chapterDone === 'robot', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(Object.values(s.trials).flat().length).toBe(20);
  expect(s.o2).toBe(360 - 20 * 15);
  expect(errors).toEqual([]);
});

test('chapter 4 auto: outlier disqualified, peak found, enzyme zoom', async ({ page }) => {
  const errors = await boot(page, '&auto&only=graph&zoomhold');
  for (const phase of ['cold', 'warm', 'hot']) {
    await page.waitForFunction(p => window.__ctx.zoomPhase === p, phase, { timeout: 170_000 });
    await page.waitForTimeout(phase === 'hot' ? 2500 : 1500);
    await page.screenshot({ path: `${SHOTS}/zoom-${phase}.png` });
  }
  await page.waitForFunction(() => window.__chapterDone === 'graph', null, { timeout: 170_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.trials[45][2].valid).toBe(false);
  expect(s.badges).toContain('detective');
  expect(s.badges).toContain('scienceSense');
  expect(s.flags.decisionWrong).toBeFalsy();
  expect(Math.abs(s.peakPick - 45)).toBeLessThanOrEqual(5);
  const calls = await page.evaluate(() => window.__ctx.engine.renderer.info.render.calls);
  expect(calls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});

test('full auto run: boot to the end screen', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = await boot(page, '&auto');
  const seen = new Set();
  for (const id of ['hypothesis', 'bench', 'robot', 'graph', 'end']) {
    await page.waitForFunction(i => window.__ctx.game.s.chapter === i, id, { timeout: 400_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/full-${id}.png` });
    seen.add(id);
  }
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 300_000 });
  const final = await page.evaluate(() => window.__final);
  console.log('final', final, await page.evaluate(() => window.__budget));
  expect(final.stars).toBeGreaterThanOrEqual(2);
  const budget = await page.evaluate(() => window.__budget);
  for (const b of Object.values(budget)) { expect(b.calls).toBeLessThanOrEqual(150); expect(b.tris).toBeLessThanOrEqual(300_000); }
  expect(errors).toEqual([]);
});

test('resume: a saved checkpoint continues from that chapter', async ({ page }) => {
  await page.goto('/?test');
  await page.evaluate(() => localStorage.setItem('oxylab.v1', JSON.stringify({ seed: 3, chapter: 'robot', o2: 315, score: 0, hypothesis: 'peak', plan: [], trials: { 37: [{ volume: 34, by: 'student', valid: true }, { volume: 35, by: 'student', valid: true }, { volume: 33, by: 'student', valid: true }] }, badges: [], mistakes: [], flags: { goggles: true }, over: false })));
  const errors = await boot(page, '&auto');
  await expect(page.locator('#resumeNote')).toBeHidden();
  await page.waitForFunction(() => window.__ctx.game.s.chapter === 'robot', null, { timeout: 60_000 });
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.trials[37].length).toBe(3);
  expect(errors).toEqual([]);
});

test('intro video: plays on a screen with subtitles, then hands over to the lab state', async ({ page }) => {
  const errors = await boot(page, '&only=intro&video');
  await page.waitForFunction(() => window.__ctx.introPhase === 'video', null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__ctx.introVideo?.currentTime > 2.5, null, { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/intro-video.png` });
  const mid = await page.evaluate(() => ({ lab: window.__ctx.lab.root.visible, sub: document.getElementById('sub').textContent }));
  expect(mid.lab).toBe(false);                 // the lab is hidden while the film plays
  expect(mid.sub).toContain('בסיס תמר');        // intro_1 is subtitled
  await page.evaluate(() => { window.__ctx.introVideo.currentTime = 46.5; });
  await page.waitForFunction(() => window.__chapterDone === 'intro', null, { timeout: 30_000 });
  const s = await page.evaluate(() => ({ done: window.__ctx.game.s.flags.introDone, lab: window.__ctx.lab.root.visible, gen: window.__ctx.mood.state.gen }));
  expect(s).toEqual({ done: true, lab: true, gen: 0.15 });
  expect(errors).toEqual([]);
});

test('intro video: a returning student can skip the film', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('oxylab.introSeen', 'true'); } catch {} });
  const errors = await boot(page, '&only=intro&video');
  await page.waitForFunction(() => window.__ctx.introVideo?.currentTime > 1, null, { timeout: 60_000 });
  await page.click('#skip');
  await page.waitForFunction(() => window.__chapterDone === 'intro', null, { timeout: 20_000 });
  const s = await page.evaluate(() => ({ paused: window.__ctx.introVideo.paused, lab: window.__ctx.lab.root.visible, done: window.__ctx.game.s.flags.introDone }));
  expect(s).toEqual({ paused: true, lab: true, done: true });
  expect(errors).toEqual([]);
});

test('intro: outside, storm hits, inside with alarms; then chapter 1 starts', async ({ page }) => {
  const errors = await boot(page, '&auto&only=intro&hold');
  for (const ph of ['outside', 'storm', 'hit', 'inside']) {
    await page.waitForFunction(p => window.__ctx.introPhase === p, ph, { timeout: 170_000 });
    await page.waitForTimeout(ph === 'storm' ? 2500 : 1200);
    await page.screenshot({ path: `${SHOTS}/intro-${ph}.png` });
  }
  await page.waitForFunction(() => window.__chapterDone === 'intro', null, { timeout: 170_000 });
  const s = await page.evaluate(() => ({ done: window.__ctx.game.s.flags.introDone, y: window.__ctx.engine.rig.position.y }));
  expect(s.done).toBe(true);
  expect(Math.abs(s.y)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('review F1: entering again (e.g. after the headset slept) never starts a second game', async ({ page }) => {
  const errors = await boot(page, '&auto&only=hypothesis');
  await page.evaluate(() => { document.getElementById('boot').hidden = false; });
  await page.click('#enter');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__runs)).toBe(1);
  expect(errors).toEqual([]);
});

test('review F6: a look-drag that ends on a card does not select it', async ({ page }) => {
  const errors = await boot(page, '&uidemo');
  await page.waitForTimeout(800);
  const card = await page.evaluate(() => { let m; window.__ctx.engine.scene.traverse(o => { if (o.isMesh && o.geometry?.parameters?.width === 0.32) m = o; }); return !!m; });
  expect(card).toBe(true);
  const sel = () => page.evaluate(() => { let st; window.__ctx.engine.scene.traverse(o => { if (o.isMesh && o.geometry?.parameters?.width === 0.32) st = o; }); return window.__ctx.input.hovered() === st; });
  // find the card on screen by sweeping the mouse
  const find = async () => { for (let x = 120; x < 1180; x += 40) for (let y = 100; y < 640; y += 40) { await page.mouse.move(x, y); if (await sel()) return { x, y }; } return null; };
  let at = await find();
  expect(at).not.toBeNull();
  await page.mouse.move(at.x - 120, at.y); await page.mouse.down(); await page.mouse.move(at.x, at.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__uiCardState)).not.toBe('sel');
  at = await find();                       // the drag turned the view: find the card again
  expect(at).not.toBeNull();
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__uiCardState)).toBe('sel');
  expect(errors).toEqual([]);
});

test('review F5: blocked localStorage still boots', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); });
  const errors = await boot(page, '&auto&only=hypothesis');
  await page.waitForFunction(() => window.__chapterDone === 'hypothesis', null, { timeout: 150_000 });
  expect(errors).toEqual([]);
});

test('review F7: recenter / teleport during the enzyme zoom cannot strand the player', async ({ page }) => {
  const errors = await boot(page, '&auto&only=graph&zoomhold');
  await page.waitForFunction(() => window.__ctx.zoomPhase === 'warm', null, { timeout: 170_000 });
  await page.evaluate(() => { window.__ctx.loco.recenter(); window.__ctx.loco.goTo('bench'); });
  await page.waitForFunction(() => window.__chapterDone === 'graph', null, { timeout: 170_000 });
  const y = await page.evaluate(() => window.__ctx.engine.rig.position.y);
  expect(Math.abs(y)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('chapter 5 auto: the generator is set to the student peak and the base is saved', async ({ page }) => {
  const errors = await boot(page, '&auto&only=rescue');
  await page.waitForFunction(() => window.__chapterDone === 'rescue', null, { timeout: 170_000 });
  const s = await page.evaluate(() => ({ rescued: window.__ctx.game.s.flags.rescued, gen: window.__ctx.mood.state.gen, alarm: window.__ctx.mood.state.alarm }));
  expect(s.rescued).toBe(true);
  expect(s.gen).toBeGreaterThan(0.9);
  expect(s.alarm).toBe(0);
  await page.screenshot({ path: `${SHOTS}/ch5.png` });
  expect(errors).toEqual([]);
});

test('chapter 6 auto: four life cases in the corridor, then back to the lab', async ({ page }) => {
  const errors = await boot(page, '&auto&only=life');
  await page.waitForFunction(() => window.__ctx.loco.current === 'case1', null, { timeout: 170_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ch6-case1.png` });
  await page.waitForFunction(() => window.__ctx.loco.current === 'case2', null, { timeout: 170_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ch6-case2.png` });
  await page.waitForFunction(() => window.__chapterDone === 'life', null, { timeout: 170_000 });
  const s = await page.evaluate(() => ({ badges: window.__ctx.game.s.badges, at: window.__ctx.loco.current }));
  expect(s.badges).toContain('lifeScience');
  expect(s.at).toBe('bench');
  const calls = await page.evaluate(() => window.__budget.life.calls);
  expect(calls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});
