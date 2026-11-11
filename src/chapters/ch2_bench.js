// Chapter 2: safety + hands-on trials — two temperatures the student picks, three repeats each — with teaching
// failures, one built-in measurement error (a leaking tube joint) and a 'why measure three times' card.
import * as THREE from 'three';
import { createProcedure } from '../game/procedure.js';
import { makeRng, mean, findOutliers, leakTemp } from '../game/model.js';
import { HAND_TEMPS, HAND_REPEATS } from '../game/config.js';
import { decide, leakFx } from './ch3_events.js';
import { boardAtStation } from './kit.js';
import { createGraphWall } from '../ui/graphWall.js';
import { createHandling } from '../lab/handling.js';

// what the student's notebook records after a teaching failure (src/ui/notebook.js)
const FAIL_NOTE = {
  splash: 'בלי משקפי מגן, מי חמצן ניתזו. מעכשיו תמיד משקפיים.',
  sealedBlast: 'פקק אטום: הלחץ העיף את הפקק. לגז חייב להיות מוצא.',
  elephantToothpaste: 'יותר מדי שמרים: הר קצף. בניסוי הוגן הכמות קבועה.',
  acidMelt: 'כמעט השתמשתי במי חמצן 30%, הם מאכלים! רק 3%.',
  boil: 'אמבט רותח: אין בועות. בחום כזה הקטלאז משנה צורה.',
  cylinderNotFilled: 'המשורה לא הייתה מלאה, אז אי אפשר למדוד. ממלאים עד הסוף.',
};
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
  // the tools are picked up and used by hand (src/lab/handling.js); only the timer is pressed
  input.register(P.P_timer, { onSelect: () => doAction({ type: 'timer' }) }); scope.add(() => input.unregister(P.P_timer));
  let lastAct = null;
  const hands = createHandling(ctx, app, { onAction: (a, o) => { const pr = doAction(a, o); lastAct = { type: a.type, pr }; return pr; } });
  scope.add(() => hands.dispose());

  let resolveTrial;
  const ANIM = {
    fillCylinder: () => app.fillCylinder(), pour: a => app.pour(a.bottle), yeast: () => app.addYeast(),
    stir: () => app.stir(), stopper: a => app.setStopper(a.kind),
  };

  async function playFail(fail, a, physical = false) {
    robi.face('oops');
    if (fail === 'acidMelt' && !physical) await app.pour('30');
    if (fail === 'sealedBlast') await app.setStopper('sealed');
    if (fail === 'elephantToothpaste' && a.type === 'stir' && !physical) await app.stir();
    await app.fx[fail]();
    await scope.say('fail_' + fail);
    if (FAIL_NOTE[fail]) game.note(FAIL_NOTE[fail]);
    robi.face('happy');
    if (fail === 'sealedBlast' || fail === 'elephantToothpaste') { app.clearFx(); app.emptyFlask(); }
    if (fail === 'cylinderNotFilled') app.reset();
  }

  // physical: the student's hand already did the motion (pour / spoon / stir), so only the result plays
  async function doAction(a, { physical = false } = {}) {
    if (busy || !proc || proc.step === 'done') { audio.sfx('no'); return { ok: false }; }
    busy = true; app.hint(null);
    let r;
    try {
      r = proc.act(a);
      if (r.fail) {
        ctx.pendingFx = playFail(r.fail, a, physical); await ctx.pendingFx; ctx.pendingFx = null;
        if (r.done) { resolveTrial(r.done); return r; }
      } else if (r.ok) {
        audio.sfx('click');
        if (!physical || a.type === 'stopper' || a.type === 'fillCylinder') await ANIM[a.type]?.(a);
        if (a.type === 'timer') {
          const stop = proc.leak ? leakFx(ctx, scope, app.props.flask, { subtle: true }) : null;
          await app.runTrial(proc.volume, 6); stop?.(); openReading();
        }
      } else audio.sfx('no');
    } finally { busy = false; }
    afterStep();
    return r;
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
  const handList = (ctx.params.get('hand') || '20,40').split(',').map(Number);
  const boiled = new Set();
  let failUsed = false;
  function chooseTemperature(level) {
    const used = new Set(game.handTemps());
    return new Promise(resolve => {
      const b = boardAtStation(ctx, scope, 'bench', { dist: 0.55, height: 1.05, side: 0.2 });
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
        c.mesh.userData.temp = t;
        if (used.has(t)) c.setState('right'); else if (boiled.has(t)) c.setState('off');
        c.mesh.position.set(-(HAND_TEMPS.length / 2 - HAND_TEMPS.indexOf(t) - 0.5) * 0.085, 0, 0.01);   // cold on the left
        b.add(c.mesh);
        return c;
      });
      if (level === 'full') { robi.gesture('point'); audio.say('c2_dial'); }
      if (ctx.auto) (async () => {
        if (autofail === 'boil' && !boiled.has(90)) {
          await scope.wait(40); await input.select(chips[HAND_TEMPS.indexOf(90)].mesh);
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
    const hard = completed() >= 3;   // later repeats: closer options, harder to be exact
    const d1 = hard ? 1.5 : 2, d2 = hard ? 3 : 5;
    const opts = [v, v >= d1 ? v + (rng() < 0.5 ? d1 : -d1) : v + d1, v >= d2 ? v + (rng() < 0.5 ? d2 : -d2) : v + d2].map(x => Math.round(x * 2) / 2);
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    let answered = false;
    const cards = opts.map(ml => scope.add(ui.card({ w: 0.13, h: 0.07, label: `${ml} מ״ל`, onSelect: c => {
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

  // ---- auto driver (tests): a virtual hand moves the real tools through the same handling code ----
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const settle = async () => { const p = lastAct?.pr; if (p) await p; await scope.wait(30); };
  async function handPour(bottle) {
    const H = hands.virtualHand(), m = app.flaskMouth();
    await H.grab(bottle === '30' ? P.P_bottle30 : P.P_bottle3);
    await H.moveTo(V(m.x + 0.142, m.y + 0.1, m.z), 500);
    lastAct = null; await H.tilt(1.9, 400);
    for (let i = 0; i < 120 && !lastAct; i++) await scope.wait(25);
    const r = await lastAct?.pr;
    if (r?.ok) for (let i = 0; i < 200 && proc.step === 'yeast'; i++) { await scope.wait(25); if (app.flaskLevel() >= 1) break; }
    await H.tilt(0, 300); await H.release(); await settle();
  }
  async function handYeast() {
    const H = hands.virtualHand(), m = app.flaskMouth(), j = app.jar.getWorldPosition(V(0, 0, 0));
    await H.grab(P.P_spoon);
    await H.moveTo(V(j.x, j.y + 0.06, j.z), 400); await scope.wait(60);
    lastAct = null; await H.moveTo(V(m.x, m.y + 0.05, m.z), 450);
    for (let i = 0; i < 60 && !lastAct; i++) await scope.wait(25);
    await H.release(); await settle();
  }
  async function handStir() {
    const H = hands.virtualHand(), m = app.flaskMouth();
    await H.grab(P.P_rod);
    lastAct = null; await H.moveTo(V(m.x, m.y + 0.07, m.z), 450);
    await H.circle(V(m.x, m.y + 0.07, m.z), 3.4, 1600);
    for (let i = 0; i < 60 && !lastAct; i++) await scope.wait(25);
    await H.release(); await settle();
  }
  async function handStopper(kind) {
    const H = hands.virtualHand(), m = app.flaskMouth();
    await H.grab(kind === 'sealed' ? P.P_stopperSealed : P.P_stopperTube);
    lastAct = null; await H.moveTo(V(m.x, m.y + 0.01, m.z), 450);
    for (let i = 0; i < 60 && !lastAct; i++) await scope.wait(25);
    await H.release(); await settle();
  }
  async function handCylinder() {
    const H = hands.virtualHand(), t = app.props.trough.getWorldPosition(V(0, 0, 0));
    await H.grab(P.P_cylinder);
    lastAct = null; await H.moveTo(V(t.x, t.y + 0.05, t.z), 500);
    for (let i = 0; i < 60 && !lastAct; i++) await scope.wait(25);
    await H.release(); await settle();
  }
  async function autoPlay() {
    const fail = !failUsed && autofail !== 'boil' ? autofail : null;
    failUsed = true;
    if (fail !== 'cylinderNotFilled') await handCylinder();
    if (fail === 'acidMelt') { await handPour('30'); return; }
    await handPour('3');
    if (proc.step === 'pour') { await takeGoggles(); await handPour('3'); }
    await handYeast();
    if (fail === 'elephantToothpaste') { await handYeast(); await handYeast(); await handStir(); return; }
    await handStir();
    if (fail === 'sealedBlast') { await handStopper('sealed'); await handPour('3'); await handYeast(); await handStir(); }
    await handStopper('tube');
    await doAction({ type: 'timer' }); await scope.wait(30);
    if (readUI) { const i = readUI.opts.indexOf(readUI.v); input.select(readUI.cards[i].mesh); }
  }

  // ---- teacher demo (?demo): Robi shows the current measurement with the real tools; "next stage" skips the bench ----
  let demoBusy = false;
  async function demoPlay() {
    if (demoBusy) return;
    demoBusy = true;
    try {
      for (let i = 0; i < 300 && (!proc || proc.step === 'done'); i++) await scope.wait(50);   // the bath may still be heating
      for (let n = 0; n < 12 && proc && proc.step !== 'done'; n++) {
        while (busy) await scope.wait(50);
        const s = proc.step;
        if (s === 'fillCylinder') await handCylinder();
        else if (s === 'pour') { if (!goggles) await takeGoggles(); await handPour('3'); }
        else if (s === 'yeast') await handYeast();
        else if (s === 'stir') await handStir();
        else if (s === 'stopper') await handStopper('tube');
        else if (s === 'timer') { await doAction({ type: 'timer' }); await scope.wait(30); }
        else if (s === 'read') { if (readUI) input.select(readUI.cards[readUI.opts.indexOf(readUI.v)].mesh); break; }
        else break;
      }
    } catch { /* a tool was in the student's hand: just stop */ } finally { demoBusy = false; }
  }
  if (ctx.demo) {
    const s = loco.stations.bench, dg = new THREE.Group();
    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)), right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    dg.position.copy(s.pos).addScaledVector(fwd, 0.62).addScaledVector(right, -0.4); dg.position.y = 1.2;
    dg.rotation.y = s.yaw + 0.57;                         // turned toward the student
    ctx.engine.scene.add(dg); scope.add(dg);
    const show = scope.add(ui.card({ w: 0.22, h: 0.065, label: '▶ רובי מדגים מדידה', name: 'demoShow', onSelect: () => demoPlay() }));
    const skip = scope.add(ui.card({ w: 0.22, h: 0.065, label: '⏭ לשלב הבא', name: 'demoSkip', onSelect: () => ctx.demoSkip?.() }));
    show.mesh.position.set(0, 0.04, 0); skip.mesh.position.set(0, -0.04, 0);
    dg.add(show.mesh, skip.mesh);
    const key = e => { if (e.code === 'KeyN') demoPlay(); };
    addEventListener('keydown', key); scope.add(() => removeEventListener('keydown', key));
    ctx.demoPlay = demoPlay;
  }

  // ---- two temperatures × three valid repeats (a failed trial is redone at the same temperature) ----
  const ownValid = T => (game.s.trials[T] || []).filter(t => t.by === 'student' && t.valid);
  const completed = () => game.handTemps().reduce((n, T) => n + ownValid(T).length, 0);
  const leakRep = 1 + Math.floor(makeRng(game.s.seed * 11 + 3)() * 2);   // the built-in error: repeat 2 or 3 at the first temperature
  ctx.why3Shown = 0;
  const announced = new Set();
  let curT = game.handTemps().find(T => ownValid(T).length < HAND_REPEATS) ?? null;
  while (!game.handDone()) {
    if (curT == null) {
      if (game.handTemps().length) await scope.say('c2_nextTemp');
      const lv = completed() === 0 ? 'full' : 'highlight';
      curT = await scope.guard(chooseTemperature(lv));
      game.s.flags.handFirstT ??= curT;
    }
    if (Math.abs(app.bathTemp - curT) > 0.5) { busy = true; try { await scope.guard(app.setBath(curT, ctx.auto ? 600 : 2500)); } finally { busy = false; } }
    const done = completed(), rep = ownValid(curT).length;
    if (!announced.has(done)) { announced.add(done); if (done === 1) await scope.say('c2_again'); if (done === 3) await scope.say('c2_alone'); }
    const hintIdx = done === 0 ? 0 : done < 3 ? 1 : 2;
    const first = game.s.flags.handFirstT;
    const isLeak = !game.s.flags.handLeak && curT === leakTemp(first, curT === first ? null : curT) && rep === leakRep;
    let valid = false;
    while (!valid) {
      app.emptyFlask(); app.setGas(50);
      proc = createProcedure({ game, rng, trialIndex: hintIdx, goggles, requiredTemp: curT, bathReady: true, leak: isLeak });
      proc.leak = isLeak; hands.enable(true);
      const d0 = new Promise(res => { resolveTrial = res; });
      afterStep();
      if (ctx.auto) autoPlay().catch(() => {});
      const d = await scope.guard(d0);
      app.hint(null);
      valid = d.valid;
      if (valid && isLeak) game.s.flags.handLeak = true;
      if (valid && done === 0) { robi.face('wow'); await scope.say('c2_warm'); robi.face('happy'); await ctx.notebook?.introduce(scope); }
      await scope.wait(ctx.auto ? 50 : 1100);   // let the reading board clear before the next board
      if (valid && done === 1) await controlNote();   // after the second hand measurement
    }
    if (ownValid(curT).length >= HAND_REPEATS) {
      await why3(curT);
      if (ownValid(curT).length >= HAND_REPEATS) curT = null;   // a disqualified reading → one more repeat here
    }
  }

  // ---- after the second hand measurement: a note on the control group (text card, no voice) ----
  async function controlNote() {
    const b = boardAtStation(ctx, scope, 'bench', { dist: 0.72, height: 1.3 });
    const card = scope.add(ui.panel({ w: 0.56, h: 0.3, name: 'controlNote', draw(g, W, H) {
      ui.rr(g, 4, 4, W - 8, H - 8, 26); g.fillStyle = 'rgba(12,18,30,0.96)'; g.fill(); g.lineWidth = 6; g.strokeStyle = ui.C.oxy; g.stroke();
      const min = ui.minPx(900);
      g.fillStyle = ui.C.oxy; ui.fitText(g, 'קבוצת ביקורת', { x: W * 0.05, y: H * 0.06, w: W * 0.9, h: H * 0.22, maxPx: H * 0.15, minPx: min, font: ui.FONT });
      g.fillStyle = ui.C.ink; ui.fitText(g, 'כדי לקיים קבוצת ביקורת, במקביל לכל מדידה מתבצעת גם מדידת חמצן לשמרים בטמפרטורה של 30 מעלות.', { x: W * 0.07, y: H * 0.32, w: W * 0.86, h: H * 0.6, maxPx: H * 0.12, minPx: min, weight: 500, font: ui.FONT });
    } }));
    b.add(card.mesh);
    let ok;
    const pressed = new Promise(r => { ok = r; });
    const btn = scope.add(ui.button3d('הבנתי', () => ok(), { w: 0.2, h: 0.075 }));
    btn.mesh.position.set(0, -0.2, 0.01); b.add(btn.mesh);
    audio.sfx('click');
    if (ctx.auto) setTimeout(() => ok(), 200);
    await scope.guard(pressed);
    btn.dispose(); card.dispose(); b.parent?.remove(b);
  }

  // ---- "why measure three times?": the three readings side by side; a deviating one is ringed ----
  async function why3(T) {
    ctx.why3Shown++;
    const list = game.s.trials[T].map((t, i) => ({ t, i })).filter(x => x.t.by === 'student' && x.t.valid);
    const vals = list.map(x => x.t.volume), m = mean(vals);
    const flagged = findOutliers({ [T]: vals }).map(o => list[o.index]);
    const tagged = flagged.filter(x => x.t.meta);              // a known cause (leak / unmixed) wins over plain noise
    const out = tagged.length ? tagged : flagged;
    const b = boardAtStation(ctx, scope, 'bench', { dist: 0.72, height: 1.3 });
    const card = scope.add(ui.panel({ w: 0.52, h: 0.44, name: 'why3', draw(g, W, H) {
      ui.rr(g, 4, 4, W - 8, H - 8, 26); g.fillStyle = 'rgba(12,18,30,0.94)'; g.fill(); g.lineWidth = 6; g.strokeStyle = ui.C.oxy; g.stroke();
      const min = ui.minPx(900);
      g.fillStyle = ui.C.ink; ui.fitText(g, `למה מודדים 3 פעמים? (${T}°)`, { x: W * 0.05, y: H * 0.03, w: W * 0.9, h: H * 0.12, maxPx: H * 0.08, minPx: min, font: ui.FONT });
      g.fillStyle = ui.C.muted; ui.fitText(g, 'מדידה אחת יכולה לטעות. שלוש מדידות חושפות טעות, והממוצע קרוב יותר לאמת.', { x: W * 0.05, y: H * 0.15, w: W * 0.9, h: H * 0.18, maxPx: H * 0.06, minPx: min, weight: 500, font: ui.FONT });
      const lo = 0, hi = Math.max(10, ...vals) * 1.1, y0 = H * 0.9, y1 = H * 0.46, Y = v => y0 - (y0 - y1) * (v - lo) / (hi - lo);
      g.strokeStyle = ui.C.mars; g.lineWidth = 5; g.setLineDash([14, 10]); g.beginPath(); g.moveTo(W * 0.3, Y(m)); g.lineTo(W * 0.92, Y(m)); g.stroke(); g.setLineDash([]);
      g.direction = 'ltr'; g.textAlign = 'center';
      list.forEach((x, k) => {
        const cx = W * (0.38 + k * (0.46 / Math.max(1, list.length - 1))), cy = Y(x.t.volume);
        g.fillStyle = ui.C.oxy; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill();
        if (out.includes(x)) { g.strokeStyle = '#ffd166'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.stroke(); }
        g.fillStyle = ui.C.ink; g.font = `700 ${min + 2}px ${ui.FONT}`; g.textBaseline = 'bottom'; g.fillText(String(x.t.volume), cx, cy - 22);
      });
      g.fillStyle = ui.C.mars; g.textBaseline = 'middle'; g.textAlign = 'left'; g.direction = 'rtl'; g.fillText(`ממוצע ${m.toFixed(1)}`, W * 0.05, Y(m));
    } }));
    b.add(card.mesh);
    if (out.length) {
      robi.face('think');
      await scope.say('c2_why3_err');
      const honest = await decide(ctx, scope, ['לפסול ולמדוד שוב', 'להשאיר'], { station: 'bench', place: { dist: 0.6, height: 1.02, side: 0 } });
      for (const x of out) if (honest) game.disqualify(T, x.i, x.t.meta || 'error');
      game.markDecision(honest);
      robi.face('happy');
      if (honest && out.some(x => x.t.meta === 'leak')) await scope.say('leak_ok');
    } else await scope.say('c2_why3');
    await scope.wait(ctx.auto ? 50 : 900);
    card.dispose();
  }

  // ---- mini chart: the student's three points (temperature grows to the right) ----
  const pts = game.handTemps().map(T => ({ T, v: Math.round(mean(ownValid(T).map(t => t.volume)) * 10) / 10 }));
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.75, height: 1.3 });
  const chart = scope.add(ui.panel({ w: 0.46, h: 0.3, name: 'miniChart', draw(g, W, H) {
    ui.rr(g, 4, 4, W - 8, H - 8, 26); g.fillStyle = ui.C.bg; g.fill();
    g.direction = 'rtl'; g.fillStyle = ui.C.ink;
    ui.fitText(g, 'הממוצעים שלכם', { x: W * 0.05, y: H * 0.03, w: W * 0.9, h: H * 0.15, maxPx: H * 0.1, minPx: ui.minPx(900), font: ui.FONT });
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
