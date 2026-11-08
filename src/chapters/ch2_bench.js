// Chapter 2: safety + three hands-on trials at 37 °C with teaching failures.
import * as THREE from 'three';
import { createProcedure } from '../game/procedure.js';
import { makeRng, mean } from '../game/model.js';
import { FIRST_TEMP } from '../game/config.js';
import { boardAtStation, row } from './kit.js';

const STEP_LINE = { dial: 'c2_dial', fillCylinder: 'c2_fill', pour: 'c2_pour', yeast: 'c2_yeast', stir: 'c2_stir', stopper: 'c2_stopper', timer: 'c2_timer', read: 'c2_read' };
const TEMPS = [20, 30, 37, 45, 60, 90];

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, app, lab, input } = ctx;
  const P = lab.props;
  const rng = makeRng(game.s.seed * 7 + 1);
  const autofail = ctx.auto && !ctx.autofailUsed ? ctx.params.get('autofail') : null;
  if (autofail) ctx.autofailUsed = true;
  let goggles = !!game.s.flags.goggles;
  app.reset(); app.clearFx();
  P.P_goggles.visible = !goggles;

  if (loco.current !== 'bench') await loco.goTo('bench');
  robi.placeNear(new THREE.Vector3(0, 0, -1.42), new THREE.Vector3(1.0, 0, 0.45));
  robi.face('happy');

  // ---- goggles (optional — skipping them is a teachable mistake) ----
  let proc = null, busy = false, readUI = null, dialUI = null;
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
    [P.P_bath, { type: 'dialUI' }], [P.P_thermometer, { type: 'dialUI' }],
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
    if (a.type === 'dialUI') return openDial();
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
      } else {
        audio.sfx('no');
        if (a.type === 'dial') await scope.say('c2_wrongTemp');
      }
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

  // ---- dial chooser ----
  function openDial() {
    if (dialUI || busy || proc.step !== 'dial') return;
    const b = boardAtStation(ctx, scope, 'bench', { dist: 0.55, height: 1.05, side: 0.32 });
    const chips = TEMPS.map(t => ui.card({ w: 0.075, h: 0.06, label: `${t}°`, onSelect: () => chooseTemp(t) }));
    chips.forEach(c => scope.add(c));
    row(b, chips, { gap: 0.012 });
    dialUI = { b, chips };
  }
  async function chooseTemp(t) {
    if (!dialUI) return;
    dialUI.chips.forEach(c => c.dispose()); dialUI = null;
    if (t >= 90 || t === FIRST_TEMP) {
      if (t === FIRST_TEMP) { busy = true; try { await app.setBath(t, 2500); } finally { busy = false; } }
      return doAction({ type: 'dial', temp: t });
    }
    audio.sfx('no'); await scope.say('c2_wrongTemp');
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
  async function autoPlay(trialIdx) {
    const fail = trialIdx === 0 ? autofail : null;
    const step = async a => { await doAction(a); await scope.wait(30); };
    if (fail === 'boil') { openDial(); await chooseTemp(90); }
    if (proc.step === 'dial') { openDial(); await chooseTemp(37); }
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

  // ---- three valid trials ----
  const valid = () => (game.s.trials[FIRST_TEMP] || []).filter(t => t.valid).length;
  const announced = new Set();
  while (valid() < 3) {
    const idx = valid();
    if (!announced.has(idx)) { announced.add(idx); if (idx === 1) await scope.say('c2_again'); if (idx === 2) await scope.say('c2_alone'); }
    app.emptyFlask(); app.setGas(50);
    proc = createProcedure({ game, rng, trialIndex: idx, goggles, requiredTemp: FIRST_TEMP });
    const done = new Promise(res => { resolveTrial = res; });
    afterStep();
    if (ctx.auto) autoPlay(idx).catch(() => {});
    const d = await scope.guard(done);
    app.hint(null);
    if (d.valid && valid() === 1) { robi.face('wow'); await scope.say('c2_warm'); robi.face('happy'); }
    await scope.wait(ctx.auto ? 50 : 600);
  }

  // ---- mini chart: three dots and their mean ----
  const vols = game.s.trials[FIRST_TEMP].filter(t => t.valid).map(t => t.volume);
  const m = mean(vols);
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.75, height: 1.3 });
  const chart = scope.add(ui.panel({ w: 0.42, h: 0.28, name: 'miniChart', draw(g, W, H) {
    ui.rr(g, 4, 4, W - 8, H - 8, 26); g.fillStyle = ui.C.bg; g.fill();
    g.direction = 'rtl'; g.fillStyle = ui.C.ink;
    ui.fitText(g, `שלוש חזרות ב-37° · ממוצע ${m.toFixed(1)} מ״ל`, { x: W * 0.05, y: H * 0.04, w: W * 0.9, h: H * 0.16, maxPx: H * 0.09, minPx: ui.minPx(900), font: ui.FONT }); g.textAlign = 'center';
    const lo = Math.min(...vols) - 4, hi = Math.max(...vols) + 4, Y = v => H * 0.88 - (v - lo) / (hi - lo) * H * 0.62;
    g.strokeStyle = ui.C.mars; g.lineWidth = 6; g.setLineDash([16, 10]); g.beginPath(); g.moveTo(W * 0.12, Y(m)); g.lineTo(W * 0.88, Y(m)); g.stroke(); g.setLineDash([]);
    vols.forEach((v, i) => { g.fillStyle = ui.C.oxy; g.beginPath(); g.arc(W * (0.3 + i * 0.2), Y(v), 16, 0, 7); g.fill(); g.fillStyle = ui.C.ink; g.font = `600 ${H * 0.07}px ${ui.FONT}`; g.fillText(`${v}`, W * (0.3 + i * 0.2), Y(v) - 26); });
  } }));
  b.add(chart.mesh);
  await scope.say('c2_why3');
  await scope.wait(ctx.auto ? 50 : 1500);
}
