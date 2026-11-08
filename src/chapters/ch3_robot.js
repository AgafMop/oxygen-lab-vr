// Chapter 3: the student picks the robot's extra temperatures (not the ones done by hand); Robi completes the
// student's temperatures to three repeats, then runs 3 repeats per new temperature; the student reads some results.
import * as THREE from 'three';
import { makeRng, trueRate, robotValues, sampleTrial, completeValues } from '../game/model.js';
import { decide, azoulayScene, leakFx, stormHits } from './ch3_events.js';
import { SLIDER, ROBOT_MIN, TRIAL_COST } from '../game/config.js';
import { createApparatus } from '../lab/apparatus.js';
import { createGraphWall } from '../ui/graphWall.js';
import { boardAtStation } from './kit.js';

const AUTO_PLAN = (ctx => (ctx.params.get('robot') || '10,30,50').split(',').map(Number));

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, lab, input } = ctx;
  const rng = makeRng(game.s.seed * 13 + 5);
  if (ctx.params.get('o2') && !ctx.o2Used) { ctx.o2Used = true; game.s.o2 = Number(ctx.params.get('o2')); game.spend(0); }

  // not even the smallest plan fits: open the emergency tanks (once per chapter attempt, costs score)
  const minCost = ROBOT_MIN * 3 * TRIAL_COST + 2 * TRIAL_COST;
  let reserve = false;
  if (game.s.o2 <= minCost) { game.s.o2 = 240; game.s.flags.reserveUsed = true; game.addScore(-100); game.spend(0); reserve = true; }
  ctx.graph ??= createGraphWall(ctx, lab.anchors.A_graphWall);
  ctx.graph.update();
  ctx.robotApp ??= createApparatus(ctx, { at: 'robot', speed: 3 });
  const rapp = ctx.robotApp;
  rapp.reset();

  await loco.goTo('robot');
  robi.placeNear(lab.anchors.A_robotBench.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0.62, 0, -0.1));
  robi.face('happy');
  if (reserve) await scope.say('c3_reserve');

  // ---- plan: temperature chips; the student's hand temperatures are locked (✋) ----
  const hand = game.handTemps();
  ctx.lockedTemps = hand;
  const b = boardAtStation(ctx, scope, 'robot', { dist: 0.85, height: 1.22 });
  const temps = [];
  for (let t = SLIDER.min; t <= SLIDER.max; t += SLIDER.step) temps.push(t);
  const plan = new Set(game.s.plan.filter(t => !hand.includes(t)));
  const MSG = { few: 'צריך לפחות 3 טמפרטורות לרובוט', many: 'יותר מ-5 יגמרו את החמצן', oneSided: 'צריך גם מתחת ל-35° וגם מעל 45°' };
  const fb = scope.add(ui.panel({ w: 0.9, h: 0.09, name: 'planFeedback', draw(g, W, H, f) {
    if (!f) return;
    ui.rr(g, 4, 4, W - 8, H - 8, H * 0.3); g.fillStyle = 'rgba(8,12,20,0.9)'; g.fill();   // readable over the wall graph
    g.fillStyle = f.msg ? ui.C.mars : ui.C.oxy;
    ui.fitText(g, MSG[f.msg] || (f.msg === 'budget' ? `התוכנית צריכה ${f.cost} דקות חמצן, ויש רק ${game.s.o2}` : `תוכנית טובה: ${f.cost} דקות חמצן. לוחצים הפעלה!`),
      { x: W * 0.03, y: 0, w: W * 0.94, h: H, maxPx: H * 0.5, minPx: ui.minPx(900), font: ui.FONT });
  } }));
  fb.mesh.position.set(0, 0.2, 0.01); b.add(fb.mesh);
  const chipW = 0.058, gap = 0.008;
  const chips = temps.map((t, i) => {
    const locked = hand.includes(t);
    const c = scope.add(ui.card({ w: chipW, h: 0.07, label: locked ? `${t}✋` : `${t}°`, name: 'planChip', onSelect: cc => {
      if (locked) return;
      if (plan.has(t)) { plan.delete(t); cc.setState('idle'); } else { plan.add(t); cc.setState('sel'); }
      audio.sfx('click'); refresh();
    } }));
    if (locked) c.setState('right'); else if (plan.has(t)) c.setState('sel');
    c.mesh.position.set(-(temps.length / 2 - i - 0.5) * (chipW + gap), 0.08, 0.01);  // math order: cold on the left
    b.add(c.mesh);
    return c;
  });
  const go = ui.button3d('הפעלה', () => resolvePlan(), { w: 0.24, h: 0.08 });
  scope.add(go); go.mesh.position.set(0, -0.04, 0.01); b.add(go.mesh);
  const robotPlan = () => [...plan].sort((a, c) => a - c);
  let resolvePlan; const planned = new Promise(r => { resolvePlan = () => { if (game.planFeedback(robotPlan()).ok) r(); else audio.sfx('no'); }; });
  const fullPlan = () => [...plan, ...hand].sort((a, c) => a - c);
  let lastMsg;
  function refresh() {
    const f = game.planFeedback(robotPlan());
    fb.redraw(f); go.setEnabled(f.ok);
    if (f.msg !== lastMsg && f.msg && plan.size >= 2) audio.say('c3_' + f.msg);
    if (f.ok && lastMsg !== null && lastMsg !== undefined) audio.say('c3_ok');
    lastMsg = f.msg;
  }
  refresh();
  await scope.say('c3_plan');
  if (ctx.auto) (async () => { for (const t of AUTO_PLAN(ctx)) if (!plan.has(t)) await input.select(chips[temps.indexOf(t)].mesh); resolvePlan(); })();
  await scope.guard(planned);
  game.s.plan = fullPlan();
  audio.sfx('ok');
  if (ctx.params.get('o2run') && !ctx.o2runUsed) { ctx.o2runUsed = true; game.s.o2 = Number(ctx.params.get('o2run')); game.spend(0); }
  for (const c of chips) c.dispose(); go.dispose(); fb.dispose();

  // ---- robot runs ----
  await scope.say('c3_run');
  const validAt = T => (game.s.trials[T] || []).filter(t => t.valid).length;
  // first: two more repeats at each of the student's temperatures (no oxygen cost). A student's "forgot to stir"
  // reading is made the visible outlier whenever possible — then the robot plants none of its own.
  let studentOut = false;
  for (const T of hand) {
    const own = game.s.trials[T].find(t => t.by === 'student' && t.valid);
    const unmixed = own.meta === 'unmixed';
    const { vals, studentOut: out } = completeValues(T, rng, own.volume, unmixed);
    if (out) studentOut = true;
    if (validAt(T) >= 3) continue;
    await scope.guard(rapp.setBath(T, 900));
    for (const v of vals.slice(0, 3 - validAt(T))) {
      rapp.reset(); rapp.setGas(0); rapp.robotPrep();
      await scope.guard(rapp.runTrial(v, 1.6));
      game.addTrial(T, { volume: v, by: 'robot', read: 'auto', fill: true }, { free: true });
      audio.sfx('click');
    }
  }
  const runTemps = game.s.plan.filter(t => !hand.includes(t));
  // one "forgot to stir" outlier at a temperature where it really shows (rate ≥ 15 ml/min); none if no such temperature
  const candidates = studentOut ? [] : runTemps.filter(t => trueRate(t) >= 15);
  const outT = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : null;
  const outI = Math.floor(rng() * 3);
  const valuesFor = T => robotValues(T, rng, T === outT ? outI : null);
  // story events: Azoulay after the 1st temperature, a leaking stopper at the 2nd, the dust storm at the 4th
  // random but well-separated: the leak at the 2nd or 3rd temperature (never the planted-outlier one), the storm later
  const leakIdx = [1, 2].filter(i => i < runTemps.length - 1 && runTemps[i] !== outT).sort(() => rng() - 0.5)[0] ?? 1;
  const stormIdx = Math.min(runTemps.length - 1, leakIdx + 1 + Math.floor(rng() * Math.max(1, runTemps.length - leakIdx - 1)));
  const leakT = runTemps[leakIdx] ?? null, stormT = runTemps[stormIdx];
  let n = 0, k = 0, leakDone = false, stormDone = false, azDone = false, why3 = false;
  for (const T of runTemps) {
    if (validAt(T) >= 3) { k++; continue; }
    const { vals, outIdx } = valuesFor(T);
    await scope.guard(rapp.setBath(T, 1200));
    let i = validAt(T);
    while (i < 3) {
      const v = vals[i], isOut = outIdx === i;
      const leakHere = !leakDone && T === leakT && i === (outIdx === 1 ? 0 : 1);
      const stormHere = !stormDone && !leakHere && T === stormT && T !== leakT && i === (outIdx === 0 ? 1 : 0);
      rapp.reset(); rapp.setGas(0); rapp.robotPrep();
      robi.gesture('point');
      if (leakHere) {
        leakDone = true;
        const lv = Math.round(v * 0.55 * 2) / 2;
        const stop = leakFx(ctx, scope, rapp.props.flask);
        await scope.guard(rapp.runTrial(lv, 2.4)); stop();
        robi.face('oops'); await scope.say('leak_1'); robi.face('think'); await scope.say('leak_2');
        const honest = await decide(ctx, scope, ['לפסול ולמדוד שוב', 'להשאיר']);
        if (honest) { game.addTrial(T, { volume: lv, by: 'robot', read: 'auto', valid: false, reason: 'leak' }); game.markDecision(true); robi.face('happy'); await scope.say('leak_ok'); }
        else { game.addTrial(T, { volume: lv, by: 'robot', read: 'auto', meta: 'leak' }); game.markDecision(false); await scope.say('leak_keep'); i++; }
        continue;
      }
      if (stormHere) {
        stormDone = true;
        const clear = await stormHits(ctx, scope);
        const sv = sampleTrial(T - 8, rng);
        await scope.guard(Promise.all([rapp.setBath(T - 8, 1600), rapp.runTrial(sv, 2.4)]));
        robi.face('think'); await scope.say('storm_2');
        const honest = await decide(ctx, scope, ['פוסלים וחוזרים', 'ממשיכים ורושמים']);
        if (honest) { game.addTrial(T, { volume: sv, by: 'robot', read: 'auto', valid: false, reason: 'storm' }); game.markDecision(true); game.award('stormCalm'); robi.face('happy'); await scope.say('storm_ok'); }
        else { game.addTrial(T, { volume: sv, by: 'robot', read: 'auto', meta: 'storm' }); game.markDecision(false); await scope.say('storm_keep'); i++; }
        await scope.guard(clear());
        await scope.guard(rapp.setBath(T, 1000));
        continue;
      }
      await scope.guard(rapp.runTrial(v, 2.4));
      const studentReads = n++ % 3 === 1;
      let read = 'auto';
      if (studentReads) { read = 'student'; await scope.guard(readByStudent(v)); }
      game.addTrial(T, { volume: v, by: 'robot', read, ...(isOut ? { meta: 'unmixed', mixed: false } : {}) });
      audio.sfx('click');
      i++;
    }
    k++;
    if (!why3) { why3 = true; robi.face('think'); await scope.say('c2_why3'); robi.face('happy'); }   // three repeats, three different results
    if (k === 1 && !azDone) { azDone = true; await azoulayScene(ctx, scope); }
  }
  rapp.reset();
  robi.face('wow');
  await scope.say('c3_done');
  robi.face('happy');

  function readByStudent(v) {
    return new Promise(res => {
      const rb = boardAtStation(ctx, scope, 'robot', { dist: 0.62, height: 1.1, side: -0.28 });
      const mag = scope.add(ui.panel({ w: 0.18, h: 0.24, name: 'magnifier', draw: (g, W, H) => rapp.readingDraw(g, W, H, v) }));
      mag.mesh.position.set(0.14, 0, 0.01); rb.add(mag.mesh);
      const opts = [v, v + 3, v >= 3 ? v - 2.5 : v + 6].sort(() => rng() - 0.5);   // distinct, never negative
      let first = true, answered = false;
      const cards = opts.map((ml, i) => {
        const c = scope.add(ui.card({ w: 0.13, h: 0.065, label: `${ml} מ״ל`, onSelect: cc => {
          if (answered) return;
          if (Math.abs(ml - v) <= 1) { answered = true; cc.setState('right'); audio.sfx('ok'); setTimeout(() => { mag.dispose(); cards.forEach(x => x.dispose()); res(); }, ctx.auto ? 30 : 700); }
          else { cc.setState('wrong'); audio.sfx('no'); if (first) game.s.flags.wrongRead = true; first = false; audio.say('c2_read_wrong'); }
        } }));
        c.mesh.position.set(-0.08, 0.08 - i * 0.08, 0.01); rb.add(c.mesh);
        return c;
      });
      audio.say('c3_yourRead');
      if (ctx.auto) setTimeout(() => input.select(cards[opts.indexOf(v)].mesh), 60);
    });
  }
}
