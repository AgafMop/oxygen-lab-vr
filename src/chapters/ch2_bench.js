// Chapter 2: safety + three hands-on trials at temperatures the student picks, with teaching failures.
import * as THREE from 'three';
import { createProcedure } from '../game/procedure.js';
import { makeRng } from '../game/model.js';
import { HAND_TEMPS, HAND_TRIALS } from '../game/config.js';
import { boardAtStation } from './kit.js';
import { createGraphWall } from '../ui/graphWall.js';

const STEP_LINE = { fillCylinder: 'c2_fill', pour: 'c2_pour', yeast: 'c2_yeast', stir: 'c2_stir', stopper: 'c2_stopper', timer: 'c2_timer', read: 'c2_read' };

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, app, lab, input } = ctx;
  const P = lab.props;
  const rng = makeRng(game.s.seed * 7 + 1);
  const autofail = ctx.auto && !ctx.autofailUsed ? ctx.params.get('autofail') : null;
  if (autofail) ctx.autofailUsed = true;
  let goggles = !!game.s.flags.goggles;
  app.reset(); app.clearFx();
  P.P_goggles.visible = !goggles;

  ctx.graph ??= createGraphWall(ctx, lab.anchors.A_graphWall);   // each hand trial shows up on the wall graph
  ctx.graph.update();
  if (loco.current !== 'bench') await loco.goTo('bench');
  robi.placeNear(new THREE.Vector3(0, 0, -1.42), new THREE.Vector3(1.0, 0, 0.45));
  robi.face('happy');

  // ---- goggles (optional — skipping them is a teachable mistake) ----
  let proc = null, busy = false, readUI = null;
  const takeGoggles = async () => {
    if (goggles) return;
    goggles = true; game.s.flags.goggles = true; proc?.act({ type: 'goggles' });
    input.unregister(P.P_goggles); app.hint(null);
    await app.goggles();
    await scope.say('c2_goggles_on');
    if (loco.current !== 'bench') await loco.goTo('bench');
  };
  if (!goggles) {
    input.register(P.P_goggles, { onSelect: () => takeGoggles() });
    scope.add(() => input.unregister(P.P_goggles));
    app.hint(P.P_goggles);
    await scope.say('c2_goggles');
    if (ctx.auto && autofail !== 'splash') await scope.guard(takeGoggles());
  }
  await scope.say('c2_intro');

  // ---- prop → action mapping ----
  const MAP = [
    [P.P_cylinder, { type: 'fillCylinder' }], [P.P_trough, { type: 'fillCylinder' }],
    [P.P_bottle3, { type: 'pour', bottle: '3' }], [P.P_bottle30, { type: 'pour', bottle: '30' }],
    [P.P_yeastJar, { type: 'yeast' }], [P.P_spoon, { type: 'yeast' }], [P.P_rod, { type: 'stir' }],
    [P.P_stopperTube, { type: 'stopper', kind: 'tube' }], [P.P_stopperSealed, { type: 'stopper', kind: 'sealed' }],
    [P.P_timer, { type: 'timer' }],
  ];
  for (const [obj, a] of MAP) { input.register(obj, { onSelect: () => doAction(a) }); scope.add(() => input.unregister(obj)); }

  let resolveTrial;
  const ANIM = {
    fillCylinder: () => app.fillCylinder(), pour: a => app.pour(a.bottle), yeast: () => app.addYeast(),
    stir: () => app.stir(), stopper: a => app.setStopper(a.kind),
  };

  async function playFail(fail, a) {
    robi.face('oops');
    if (fail === 'acidMelt') await app.pour('30');
    if (fail === 'sealedBlast') await app.setStopper('sealed');
    if (fail === 'elephantToothpaste' && a.type === 'stir') await app.stir();
    await app.fx[fail]();
    await scope.say('fail_' + fail);
    robi.face('happy');
    if (fail === 'sealedBlast' || fail === 'elephantToothpaste') { app.clearFx(); app.emptyFlask(); }
    if (fail === 'cylinderNotFilled') app.reset();
  }

  async function doAction(a) {
    if (busy || !proc || proc.step === 'done') return;
    busy = true; app.hint(null);
    try {
      const r = proc.act(a);
      if (r.fail) {
        ctx.pendingFx = playFail(r.fail, a); await ctx.pendingFx; ctx.pendingFx = null;
        if (r.done) return resolveTrial(r.done);
      } else if (r.ok) {
        audio.sfx('click');
        await ANIM[a.type]?.(a);
        if (a.type === 'timer') { await app.runTrial(proc.volume, 6); openReading(); }
      } else audio.sfx('no');
    } finally { busy = false; }
    afterStep();
  }

  function afterStep() {
    if (!proc || proc.step === 'done' || proc.step === 'read') return;
    const h = proc.hint();
    if (h.level === 'none') return;
    const target = h.target && lab.anchors[h.target] ? propAt(h.target) : null;
    app.hint(target);
    if (h.level === 'full') { robi.gesture('point'); audio.say(STEP_LINE[proc.step]); }
  }
  const propAt = anchor => ({ A_bath: P.P_bath, A_cylinder: P.P_cylinder, A_bottle3: P.P_bottle3, A_yeastJar: P.P_yeastJar, A_rod: P.P_rod,
    A_stopperTube: P.P_stopperTube, A_timer: P.P_timer, A_goggleRack: P.P_goggles })[anchor] || null;

  // ---- temperature chooser: one chip row; used temperatures locked, 90° boils ----
  const handList = (ctx.params.get('hand') || '20,40,60').split(',').map(Number);
  const boiled = new Set();
  let failUsed = false;
  function chooseTemperature(level) {
    const used = new Set(game.handTemps());
    return new Promise(resolve => {
      const b = boardAtStation(ctx, scope, 'bench', { dist: 0.55, height: 1.05, side: 0.32 });
      let busyPick = false;
      const chips = HAND_TEMPS.map(t => {
        const c = scope.add(ui.card({ w: 0.075, h: 0.065, label: used.has(t) ? `${t}° ✋` : `${t}°`, name: 'tempChip', onSelect: async cc => {
          if (busyPick || used.has(t) || boiled.has(t)) return;
          if (t >= 90) {
            busyPick = true; boiled.add(t); cc.setState('off');
            const r = createProcedure({ game, rng, requiredTemp: t }).act({ type: 'dial', temp: t });
            ctx.pendingFx = playFail(r.fail, {}); await ctx.pendingFx; ctx.pendingFx = null; app.clearFx();
            busyPick = false; return;
          }
          audio.sfx('click'); chips.forEach(x => x.dispose()); resolve(t);
        } }));
        if (used.has(t)) c.setState('right'); else if (boiled.has(t)) c.setState('off');
        c.mesh.position.set(-(HAND_TEMPS.length / 2 - HAND_TEMPS.indexOf(t) - 0.5) * 0.085, 0, 0.01);   // cold on the left
        b.add(c.mesh);
        return c;
      });
      if (level === 'full') { robi.gesture('point'); audio.say('c2_dial'); }
      if (ctx.auto) (async () => {
        if (autofail === 'boil' && !boiled.has(90)) {
          await scope.wait(40); input.select(chips[HAND_TEMPS.indexOf(90)].mesh);
          await scope.wait(60); while (busyPick) await scope.wait(50);
        }
        const t = handList.find(x => !used.has(x));
        input.select(chips[HAND_TEMPS.indexOf(t)].mesh);
      })().catch(() => {});
    });
  }

  // ---- reading the cylinder: magnified meniscus + three values ----
  function openReading() {
    const v = proc.volume;
    const b = boardAtStation(ctx, scope, 'bench', { dist: 0.6, height: 1.12, side: -0.05 });
    const mag = scope.add(ui.panel({ w: 0.2, h: 0.26, name: 'magnifier', draw: (g, W, H) => app.readingDraw(g, W, H, v) }));
    mag.mesh.position.set(0.16, 0, 0.01); b.add(mag.mesh);
    const opts = [v, v >= 2 ? v + (rng() < 0.5 ? 2 : -2) : v + 2, v >= 4 ? v + (rng() < 0.5 ? 5 : -4) : v + 5].map(x => Math.round(x * 2) / 2);
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    let answered = false;
    const cards = opts.map(ml => scope.add(ui.card({ w: 0.1, h: 0.07, label: `${ml} מ״ל`, onSelect: c => {
      if (answered) return;
      const r = proc.act({ type: 'read', ml });
      if (r.ok) answered = true;
      if (r.ok) { c.setState('right'); audio.sfx('ok'); audio.say('c2_read_ok'); cleanup(); resolveTrial(r.done); }
      else { c.setState('wrong'); audio.sfx('no'); audio.say('c2_read_wrong'); }
    } })));
    cards.forEach((c, i) => { c.mesh.position.set(-0.1, 0.09 - i * 0.085, 0.01); b.add(c.mesh); });
    if (proc.hint().level === 'full') audio.say('c2_read');
    readUI = { cards, opts, v };
    const cleanup = () => { setTimeout(() => { mag.dispose(); cards.forEach(c => c.dispose()); }, ctx.auto ? 50 : 900); readUI = null; };
  }

  // ---- auto driver (tests) ----
  async function autoPlay() {
    const fail = !failUsed && autofail !== 'boil' ? autofail : null;
    failUsed = true;
    const step = async a => { await doAction(a); await scope.wait(30); };
    if (fail !== 'cylinderNotFilled') await step({ type: 'fillCylinder' });
    if (fail === 'acidMelt') { await step({ type: 'pour', bottle: '30' }); return; }
    await step({ type: 'pour', bottle: '3' });
    if (proc.step === 'pour') { await takeGoggles(); await step({ type: 'pour', bottle: '3' }); }
    await step({ type: 'yeast' });
    if (fail === 'elephantToothpaste') { await step({ type: 'yeast' }); await step({ type: 'yeast' }); await step({ type: 'stir' }); return; }
    await step({ type: 'stir' });
    if (fail === 'sealedBlast') { await step({ type: 'stopper', kind: 'sealed' }); await step({ type: 'pour', bottle: '3' }); await step({ type: 'yeast' }); await step({ type: 'stir' }); }
    await step({ type: 'stopper', kind: 'tube' });
    await step({ type: 'timer' });
    if (readUI) { const i = readUI.opts.indexOf(readUI.v); input.select(readUI.cards[i].mesh); }
  }

  // ---- three temperatures, one valid trial each (a failed trial is redone at the same temperature) ----
  const announced = new Set();
  while (game.handTemps().length < HAND_TRIALS) {
    const idx = game.handTemps().length;
    if (!announced.has(idx)) { announced.add(idx); if (idx === 1) await scope.say('c2_again'); if (idx === 2) await scope.say('c2_alone'); }
    const level = ['full', 'highlight', 'none'][Math.min(idx, 2)];
    const T = await scope.guard(chooseTemperature(level));
    busy = true; try { await scope.guard(app.setBath(T, ctx.auto ? 600 : 2500)); } finally { busy = false; }
    let valid = false;
    while (!valid) {
      app.emptyFlask(); app.setGas(50);
      proc = createProcedure({ game, rng, trialIndex: idx, goggles, requiredTemp: T, bathReady: true });
      const done = new Promise(res => { resolveTrial = res; });
      afterStep();
      if (ctx.auto) autoPlay().catch(() => {});
      const d = await scope.guard(done);
      app.hint(null);
      valid = d.valid;
      if (valid && idx === 0) { robi.face('wow'); await scope.say('c2_warm'); robi.face('happy'); }
      await scope.wait(ctx.auto ? 50 : 600);
    }
  }

  // ---- mini chart: the student's three points (temperature grows to the right) ----
  const pts = game.handTemps().map(T => ({ T, v: game.s.trials[T].find(t => t.by === 'student' && t.valid).volume }));
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.75, height: 1.3 });
  const chart = scope.add(ui.panel({ w: 0.46, h: 0.3, name: 'miniChart', draw(g, W, H) {
    ui.rr(g, 4, 4, W - 8, H - 8, 26); g.fillStyle = ui.C.bg; g.fill();
    g.direction = 'rtl'; g.fillStyle = ui.C.ink;
    ui.fitText(g, 'שלוש הנקודות שלכם', { x: W * 0.05, y: H * 0.03, w: W * 0.9, h: H * 0.15, maxPx: H * 0.1, minPx: ui.minPx(900), font: ui.FONT });
    const x0 = W * 0.12, x1 = W * 0.92, y0 = H * 0.8, y1 = H * 0.24, X = T => x0 + (x1 - x0) * T / 70, Y = v => y0 - (y0 - y1) * v / 50;
    g.strokeStyle = '#4a5d7a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.direction = 'ltr'; g.fillStyle = ui.C.muted; g.font = `600 ${ui.minPx(900) + 2}px ${ui.FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let T = 0; T <= 70; T += 10) g.fillText(String(T), X(T), y0 + 8);
    pts.forEach(({ T, v }) => {
      g.fillStyle = ui.C.oxy; g.beginPath(); g.arc(X(T), Y(v), 14, 0, 7); g.fill();
      g.fillStyle = ui.C.ink; g.textBaseline = 'bottom'; g.fillText(String(v), X(T), Y(v) - 18);
    });
  } }));
  b.add(chart.mesh);
  robi.face('think');
  await scope.say('c2_three');
  robi.face('happy');
  await scope.wait(ctx.auto ? 50 : 1500);
}
