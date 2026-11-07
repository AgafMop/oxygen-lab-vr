// Chapter 3: plan the temperatures, Robi runs 3 repeats per temperature, the student reads some results.
import * as THREE from 'three';
import { sampleTrial, makeRng, trueRate, findOutliers } from '../game/model.js';
import { SLIDER, FIRST_TEMP } from '../game/config.js';
import { createApparatus } from '../lab/apparatus.js';
import { createGraphWall } from '../ui/graphWall.js';
import { boardAtStation } from './kit.js';

const AUTO_PLAN = [20, 30, 45, 55, 65];

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, lab, input } = ctx;
  const rng = makeRng(game.s.seed * 13 + 5);
  if (ctx.params.get('o2') && !ctx.o2Used) { ctx.o2Used = true; game.s.o2 = Number(ctx.params.get('o2')); game.spend(0); }

  ctx.graph ??= createGraphWall(ctx, lab.anchors.A_graphWall);
  ctx.graph.update();
  ctx.robotApp ??= createApparatus(ctx, { at: 'robot', speed: 3 });
  const rapp = ctx.robotApp;
  rapp.reset();

  await loco.goTo('robot');
  robi.placeNear(lab.anchors.A_robotBench.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0.62, 0, -0.1));
  robi.face('happy');

  // ---- plan: temperature chips (37 is locked in) ----
  const b = boardAtStation(ctx, scope, 'robot', { dist: 0.85, height: 1.22 });
  const temps = [];
  for (let t = SLIDER.min; t <= SLIDER.max; t += SLIDER.step) temps.push(t);
  const plan = new Set(game.s.plan.length ? game.s.plan.filter(t => t !== FIRST_TEMP) : []);
  const fb = scope.add(ui.panel({ w: 0.9, h: 0.09, draw(g, W, H, msg) {
    g.fillStyle = msg ? ui.C.mars : ui.C.oxy; g.font = `700 ${H * 0.5}px ${ui.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText({ few: 'צריך לפחות 5 טמפרטורות', many: 'יותר מ-7 טמפרטורות יגמרו את החמצן', oneSided: 'כולן באותו צד — אולי מחכה הפתעה בצד השני?' }[msg] || 'תוכנית טובה! לוחצים הפעלה', W / 2, H / 2);
  } }));
  fb.mesh.position.set(0, 0.2, 0.01); b.add(fb.mesh);
  const chipW = 0.058, gap = 0.008;
  const all = [...temps.slice(0, 7), FIRST_TEMP, ...temps.slice(7)];
  const chips = all.map((t, i) => {
    const locked = t === FIRST_TEMP;
    const c = scope.add(ui.card({ w: chipW, h: 0.07, label: `${t}°`, onSelect: cc => {
      if (locked) return;
      if (plan.has(t)) { plan.delete(t); cc.setState('idle'); } else { plan.add(t); cc.setState('sel'); }
      audio.sfx('click'); refresh();
    } }));
    if (locked) c.setState('right'); else if (plan.has(t)) c.setState('sel');
    c.mesh.position.set(-(all.length / 2 - i - 0.5) * (chipW + gap), 0.08, 0.01);  // math order: cold on the left
    b.add(c.mesh);
    return c;
  });
  const go = ui.button3d('הפעלה', () => resolvePlan(), { w: 0.24, h: 0.08 });
  scope.add(go); go.mesh.position.set(0, -0.04, 0.01); b.add(go.mesh);
  let resolvePlan; const planned = new Promise(r => { resolvePlan = () => { if (game.planFeedback(fullPlan()).ok) r(); else audio.sfx('no'); }; });
  const fullPlan = () => [...plan, FIRST_TEMP].sort((a, c) => a - c);
  let lastMsg;
  function refresh() {
    const f = game.planFeedback(fullPlan());
    fb.redraw(f.msg); go.setEnabled(f.ok);
    if (f.msg !== lastMsg && f.msg && plan.size >= 4) audio.say('c3_' + f.msg);
    lastMsg = f.msg;
  }
  refresh();
  await scope.say('c3_plan');
  if (ctx.auto) { for (const t of AUTO_PLAN) input.select(chips[all.indexOf(t)].mesh); resolvePlan(); }
  await scope.guard(planned);
  game.s.plan = fullPlan();
  audio.sfx('ok');
  for (const c of chips) c.dispose(); go.dispose(); fb.dispose();

  // ---- robot runs ----
  await scope.say('c3_run');
  const runTemps = game.s.plan.filter(t => t !== FIRST_TEMP);
  // inject exactly one "forgot to stir" outlier at a temperature where it will show (rate ≥ 15 ml/min)
  const candidates = runTemps.filter(t => trueRate(t) >= 15);
  const outT = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : runTemps[0];
  const outI = Math.floor(rng() * 3);
  // values per temperature: natural noise, never a spurious outlier; one deliberate unmixed outlier
  const valuesFor = T => {
    for (let tries = 0; tries < 20; tries++) {
      const vals = [0, 1, 2].map(i => sampleTrial(T, rng, { mixed: !(T === outT && i === outI) }));
      if (T === outT) {
        const md = [...vals].sort((a, c) => a - c)[1];
        if (!findOutliers({ [T]: vals }).some(o => o.index === outI)) vals[outI] = Math.round(md * 0.5 * 2) / 2;
        const f = findOutliers({ [T]: vals });
        if (f.length === 1 && f[0].index === outI) return vals;
      } else if (!findOutliers({ [T]: vals }).length) return vals;
    }
    return [0, 1, 2].map(() => Math.round(trueRate(T) * 2) / 2);
  };
  let n = 0;
  for (const T of runTemps) {
    const done = game.s.trials[T]?.length || 0;
    if (done >= 3) continue;
    const vals = valuesFor(T);
    await scope.guard(rapp.setBath(T, 1200));
    for (let i = done; i < 3; i++) {
      const v = vals[i], isOut = T === outT && i === outI;
      rapp.reset(); rapp.setGas(0); rapp.robotPrep();
      robi.gesture('point');
      await scope.guard(rapp.runTrial(v, 2.4));
      const studentReads = n++ % 3 === 1;
      let read = 'auto';
      if (studentReads) { read = 'student'; await scope.guard(readByStudent(v)); }
      game.addTrial(T, { volume: v, by: 'robot', read, ...(isOut ? { meta: 'unmixed', mixed: false } : {}) });
      audio.sfx('click');
    }
  }
  rapp.reset();
  robi.face('wow');
  await scope.say('c3_done');
  robi.face('happy');

  function readByStudent(v) {
    return new Promise(res => {
      const rb = boardAtStation(ctx, scope, 'robot', { dist: 0.62, height: 1.1, side: -0.28 });
      const mag = scope.add(ui.panel({ w: 0.18, h: 0.24, draw: (g, W, H) => rapp.readingDraw(g, W, H, v) }));
      mag.mesh.position.set(0.14, 0, 0.01); rb.add(mag.mesh);
      const opts = [v, Math.max(0, v + 3), Math.max(0, v - 2.5)].sort(() => rng() - 0.5);
      let first = true;
      const cards = opts.map((ml, i) => {
        const c = scope.add(ui.card({ w: 0.1, h: 0.065, label: `${ml} מ״ל`, onSelect: cc => {
          if (Math.abs(ml - v) <= 1) { cc.setState('right'); audio.sfx('ok'); setTimeout(() => { mag.dispose(); cards.forEach(x => x.dispose()); res(); }, ctx.auto ? 30 : 700); }
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
