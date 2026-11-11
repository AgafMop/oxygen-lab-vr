// Boot: engine → input → lab → locomotion → UI/audio/game. Chapters run in order (Task 10+).
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createLocomotion } from './core/locomotion.js';
import { createUI } from './core/ui3d.js';
import { createAudio } from './core/audio.js';
import { loadLab } from './lab/labScene.js';
import { createApparatus } from './lab/apparatus.js';
import { createRobi } from './lab/robi.js';
import * as THREE from 'three';
import { createGame } from './game/state.js';
import { createStorage } from './game/storage.js';
import { CHAPTERS } from './game/config.js';
import { skipFill } from './game/skipFill.js';
import { makeRng } from './game/model.js';
import { createScope, Abort } from './chapters/kit.js';
import * as ch0 from './chapters/ch0_intro.js';
import * as ch1 from './chapters/ch1_hypothesis.js';
import { createMood } from './fx/mood.js';
import { createLabSigns } from './ui/labSigns.js';
import * as ch2 from './chapters/ch2_bench.js';
import * as ch3 from './chapters/ch3_robot.js';
import * as ch4 from './chapters/ch4_graph.js';
import * as chEnd from './chapters/ch_end.js';
import * as ch5 from './chapters/ch5_rescue.js';
import * as ch6 from './chapters/ch6_life.js';
import { SAVE_KEY } from './game/config.js';
import { createIntroVideo, primeIntroVideo } from './fx/introCinema.js';
import { isClear } from './lab/clearance.js';
import { createNotebook } from './ui/notebook.js';
import { DEFAULT_SENTENCE } from './game/hypothesis.js';

const CH = { intro: ch0, hypothesis: ch1, bench: ch2, robot: ch3, graph: ch4, rescue: ch5, life: ch6, end: chEnd };
const CH_NAMES = { intro: 'פתיחה', rescue: 'הצלת הבסיס', life: 'מסדרון החיים', hypothesis: 'תדריך והשערה', bench: 'הניסוי בידיים', robot: 'רובי מריץ ניסויים', graph: 'הגרף והאנזים', end: 'סיכום' };

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const AUTO = params.has('auto');

const engine = createEngine(document.body);
const input = createInput(engine);
const ui = createUI(engine, input, { audit: TEST });
const audio = createAudio(ui, { fast: AUTO });
const seed = Number(params.get('seed')) || (Date.now() % 100000);
const storage = createStorage();
const game = createGame({ seed, storage });
const ctx = { engine, input, ui, audio, game, storage, ready: false, params, auto: AUTO, seed, demo: params.has('demo') };
ctx.animSpeed = Number(params.get('animspeed')) || (AUTO ? 8 : 1);    // ?animspeed=1: auto choices at real animation speed
if (TEST) {          // motion audit: a visible tracked object must not jump (> 5 cm per frame at real speed) outside a fade
  ctx.motionAudit = []; const tracked = new Map(), seenJump = new Set(), P = new THREE.Vector3();
  ctx.track = (o, name) => { if (o && !tracked.has(o)) tracked.set(o, { name, last: null, vis: false }); };
  // collision audit: rays from a figure's body axis (knee/hip/chest height) must not hit the room or furniture within its radius
  ctx.collisionAudit = []; const bodies = new Map(), seenHit = new Set(), rcB = new THREE.Raycaster(), C = new THREE.Vector3(); let frameN = 0;
  ctx.body = (o, name, r, hs = [0.35, 0.8, 1.25]) => bodies.set(o, { name, r, hs });
  engine.onFrame(() => {
    if (++frameN % 6 || !ctx.lab) return;
    const solids = []; for (const r of [ctx.lab.root, ctx.corridorRoot].filter(x => x && x.visible)) r.traverse(o => { if (o.isMesh && /^(LAB_static|LAB_detail|CORR_)/.test(o.name)) solids.push(o); });
    for (const [o, b] of bodies) {
      if (!shown(o) || Math.abs(o.rotation.x) > 0.5) continue;          // a lying patient rests on the bed by design
      o.getWorldPosition(C);
      if (!isClear(ctx, C, b.r * 0.8, [])) {           // inside furniture (seen from above)
        const key = `${b.name}|${game.s.chapter}|${Math.round(C.x * 5)}|${Math.round(C.z * 5)}|in`;
        if (!seenHit.has(key)) { seenHit.add(key); ctx.collisionAudit.push({ name: b.name, chapter: game.s.chapter, x: +C.x.toFixed(2), z: +C.z.toFixed(2), inside: true }); }
      }
      for (const h of b.hs) for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        rcB.set(new THREE.Vector3(C.x, h, C.z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a))); rcB.far = b.r;
        const hit = rcB.intersectObjects(solids, false)[0];
        if (!hit) continue;
        const key = `${b.name}|${game.s.chapter}|${Math.round(C.x * 5)}|${Math.round(C.z * 5)}`;
        if (!seenHit.has(key)) { seenHit.add(key); ctx.collisionAudit.push({ name: b.name, chapter: game.s.chapter, x: +C.x.toFixed(2), z: +C.z.toFixed(2), h, mesh: hit.object.name }); }
      }
    }
  });
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return !!o.parent; };
  engine.onAfterRender(() => {
    // a jump = an isolated one-frame step: still before, ≥ 6 cm in one frame, still after (animations ramp up and down)
    const dark = engine.fadeLevel() >= 0.9;
    for (const [o, t] of tracked) {
      const vis = shown(o); o.getWorldPosition(P);
      const d = vis && t.vis && t.last && !dark ? P.distanceTo(t.last) : 0;
      if (t.spike && d < 0.004) {
        const key = `${t.name}|${game.s.chapter}`;
        if (!seenJump.has(key)) { seenJump.add(key); ctx.motionAudit.push({ name: t.name, chapter: game.s.chapter, dist: Math.round(t.spike * 100) / 100 }); }
      }
      t.spike = d >= 0.06 && (t.prevD ?? 0) < 0.004 ? d : 0;
      t.prevD = d;
      t.last = (t.last || new THREE.Vector3()).copy(P); t.vis = vis;
    }
  });
}
const saved = !params.has('only') && !params.has('fresh') ? storage.get(SAVE_KEY) : null;
if (TEST) window.__ctx = ctx;
// teacher demo (?demo): "next stage" — a corner button on the desktop, B / Y on the controllers in the headset, key M.
// The film's own skip comes first; otherwise the chapter ends at once and its results are filled in (main → skipFill).
if (ctx.demo) {
  ctx.demoSkip = () => {
    const film = document.getElementById('skip');
    if (film && !film.hidden) { film.click(); return; }
    if (ctx.scope && !ctx.scope.aborted) { audio.sfx('click'); ctx.scope.skip(); }
  };
  const b = document.createElement('button');
  b.className = 'btn alt'; b.type = 'button'; b.id = 'demoSkip'; b.textContent = '⏭ לשלב הבא';
  b.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:7;font-size:15px;padding:8px 16px';
  b.addEventListener('click', e => { e.stopPropagation(); ctx.demoSkip(); });
  document.body.append(b);
  addEventListener('keydown', e => { if (e.code === 'KeyM') ctx.demoSkip(); });
  let latch = false;
  engine.onFrame(() => {
    const ses = engine.renderer.xr.getSession?.(); if (!ses) return;
    const down = [...ses.inputSources].some(src => src.gamepad?.buttons[5]?.pressed);   // B (right) / Y (left)
    if (down && !latch) ctx.demoSkip();
    latch = down;
  });
}
if (TEST && params.has('tour')) {          // screenshot tour: grab the frame after each new board has rendered twice
  window.__tour = []; let seen = 0, wait = 0;
  const select = input.select.bind(input); let q = Promise.resolve();      // auto clicks wait so each board stays on screen
  input.select = m => (q = q.then(() => new Promise(r => setTimeout(r, 1500))).then(() => select(m)));
  engine.onAfterRender(() => {
    if ((ctx.tourPending || 0) === seen) return;
    if (++wait < 2) return;
    wait = 0; seen = ctx.tourPending;
    window.__tour.push({ chapter: game.s.chapter, sub: document.getElementById('sub')?.hidden ? '' : document.getElementById('sub')?.textContent, img: engine.renderer.domElement.toDataURL('image/jpeg', 0.8) });
  });
}

const $ = id => document.getElementById(id);

/** The calm lab look for the current story state (after a game over or a resume). */
function resetAmbience() {
  const rescued = game.s.flags.rescued, intro = game.s.flags.introDone;
  ctx.mood.set({ light: rescued || !intro ? 1 : 0.85, gen: rescued || !intro ? 1 : 0.15, alarm: 0, flicker: 0 });
  engine.scene.backgroundIntensity = 1; audio.sfx('wind', 0);
}

async function boot() {
  const needIntro = (!saved?.chapter || saved.chapter === 'intro') && (!params.get('only') || params.get('only') === 'intro');
  if (needIntro && !params.has('novideo') && (!AUTO || params.has('video'))) ctx.introVideoSrc = createIntroVideo();   // preload while the lab loads
  ctx.lab = await loadLab(engine);
  for (const [n, o] of Object.entries(ctx.lab.props)) if (!/_\d+$/.test(n)) ctx.track?.(o, n);   // whole props, not their sub-meshes
  ctx.loco = createLocomotion(engine, input);
  // robot station: step back and aim between the robot bench and the graph wall so both fit in view
  const st = ctx.lab.stationNodes.robot; st.position.x = 1.1; st.position.z = 0.55;
  st.userData.yaw = Math.atan2(-(3.5 - 1.1), -(0.75 - 0.55));
  ctx.lab.discs.robot.position.x = 1.1; ctx.lab.discs.robot.position.z = 0.55;
  for (const [id, node] of Object.entries(ctx.lab.stationNodes)) ctx.loco.addStation(id, node, ctx.lab.discs[id]);
  await ctx.loco.goTo('bench', { fade: false });
  ctx.app = createApparatus(ctx);
  ctx.robi = createRobi(ctx);
  ctx.mood = createMood(ctx);
  createLabSigns(ctx);
  ctx.notebook = createNotebook(ctx);
  ctx.robi.placeNear(new THREE.Vector3(0, 0, -1.42), new THREE.Vector3(1.0, 0, 0.45), { instant: true });
  await ui.fontsReady;
  $('enter').disabled = false; $('enter').textContent = 'כניסה במחשב';
  if (saved?.chapter && CH[saved.chapter] && saved.chapter !== 'hypothesis') {
    $('resumeNote').hidden = false;
    $('resumeNote').firstChild.textContent = `נמצאה שמירה: ממשיכים מהפרק „${CH_NAMES[saved.chapter]}”. `;
  }
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) $('enterVR').hidden = false;
}

async function start(vr) {
  $('boot').hidden = true;
  audio.unlock();
  if (!ctx.started) primeIntroVideo(ctx.introVideoSrc);   // inside the click: lets the film play with sound later
  if (vr) {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await engine.renderer.xr.setSession(session);
      session.addEventListener('end', () => { $('boot').hidden = false; });
    } catch (e) { console.warn('VR session refused', e); $('boot').hidden = false; return; }
  } else if (ctx.started) {
    return;                       // back from VR to the desktop view: the game is already running
  } else {
    $('hint').hidden = false;
    $('hint').textContent = 'גוררים כדי להסתכל · לחיצה כפולה לנעילת עכבר · W A S D';
    setTimeout(() => { $('hint').hidden = true; }, 6000);
  }
  if (ctx.started) return;        // re-entering VR after the headset slept: never start a second game
  ctx.started = true;
  window.__runs = (window.__runs || 0) + 1;
  ui.wristMeter(game);
  ctx.ready = true;
  if (params.has('uidemo')) return uiDemo();
  if (params.has('fx')) return fxDemo(params.get('fx'));
  if (params.has('trialdemo')) return trialDemo();
  if (params.has('handdemo')) return handDemo();
  if (params.has('nogame')) return;     // engine-only tests
  runGame().catch(err => { console.error(err); });
}

async function runGame() {
  const only = params.get('only');
  let list = only ? [only] : CHAPTERS.filter(id => CH[id]);
  if (!only && saved?.chapter && CH[saved.chapter] && game.loadSave()) {
    list = list.slice(list.indexOf(saved.chapter));
    game.spend(0);                 // refresh the O2 meter with the saved value
    resetAmbience();
    if (game.s.flags.goggles) ctx.lab.props.P_goggles.visible = false;
  }
  if (only) seedFor(only);
  for (const id of list) await runChapter(id);
  window.__gameDone = true;
}

// test helper: state a chapter expects when run alone (?only=<id>)
function seedFor(id) {
  const order = CHAPTERS.indexOf(id);
  if (order > CHAPTERS.indexOf('intro')) { game.s.flags.introDone = true; ctx.mood.set({ light: 0.85, gen: 0.15 }); }
  if (order > CHAPTERS.indexOf('bench')) {
    game.s.hypothesis ??= 'peak'; game.s.flags.goggles = true; game.s.flags.notebook = true;
    game.s.hypSentence ??= { ...DEFAULT_SENTENCE };
    // two hand temperatures × three repeats; ?handUnmixed=T / ?handLeak=T make the 2nd repeat there a kept deviating reading
    const unmixedAt = Number(params.get('handUnmixed')) || null, leakAt = Number(params.get('handLeak')) || null;
    for (const [T, vs] of [[20, [11, 11.5, 10.5]], [40, [40.5, 41.5, 39.5]]]) vs.forEach((v, i) => {
      const um = T === unmixedAt && i === 1, lk = T === leakAt && i === 1;
      game.addTrial(T, { volume: um ? Math.round(v * 0.6 * 2) / 2 : lk ? Math.round(v * 0.55 * 2) / 2 : v, by: 'student', read: 'student', mixed: !um,
        ...(um ? { meta: 'unmixed' } : lk ? { meta: 'leak' } : {}) });
    });
  }
  if (order > CHAPTERS.indexOf('robot')) {
    // robot temperatures 10/30/50; one unmixed robot reading at 30
    const data = { 10: [5.5, 5, 6], 30: [22, 21.5, 13], 50: [31, 30, 32.5] };
    game.s.plan = [10, 20, 30, 40, 50];
    for (const [T, vs] of Object.entries(data)) vs.forEach((v, i) => game.addTrial(Number(T), { volume: v, by: 'robot', read: 'auto', ...(T === '30' && i === 2 ? { meta: 'unmixed', mixed: false } : {}) }));
  }
}

async function runChapter(id) {
  for (;;) {
    game.setChapter(id);
    const scope = createScope(ctx); ctx.scope = scope;
    if (TEST) setTimeout(() => {
      const { renderer, scene, camera } = engine;
      renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera);
      (window.__budget ||= {})[id] = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
      renderer.info.autoReset = true;
    }, 1500);
    // let a failure animation (ctx.pendingFx) finish before the chapter is torn down
    const offOver = game.on('gameover', () => setTimeout(async () => { await ctx.pendingFx; scope.abort(); }, 0));
    try {
      await CH[id].run(ctx, scope);
      offOver(); scope.cleanup();
      window.__chapterDone = id;
      return;
    } catch (e) {
      offOver(); scope.cleanup();
      if (!(e instanceof Abort)) throw e;
      if (scope.skipped) {                     // teacher demo: the chapter counts as played, its results filled in
        audio.stop?.(); ctx.app.clearFx(); ctx.app.reset(); ctx.app.hint(null);
        skipFill(game, id, makeRng(game.s.seed * 13 + CHAPTERS.indexOf(id)));
        if (id === 'intro') ctx.mood.set({ light: 0.85, gen: 0.15 });
        ctx.graph?.update?.();
        window.__chapterDone = id;
        return;
      }
    }
    await gameOverPanel();
    game.restoreCheckpoint();
    ctx.app.clearFx(); ctx.app.reset();
  }
}

async function gameOverPanel() {
  window.__gameOver = (window.__gameOver || 0) + 1;
  // the base goes dark: lights out, red alarm, the commander's last call
  const before = { ...ctx.mood.state };
  audio.sfx('alarm');
  await Promise.all([ctx.mood.to('light', 0.12, 1200), ctx.mood.to('alarm', 1, 600), ctx.mood.to('gen', 0, 1200)]);
  await audio.say('go_1');
  const p = ui.panel({ w: 0.8, h: 0.34, draw(g, W, H) {
    ui.rr(g, 6, 6, W - 12, H - 12, 30); g.fillStyle = 'rgba(40,8,6,0.94)'; g.fill(); g.lineWidth = 8; g.strokeStyle = ui.C.bad; g.stroke();
    g.fillStyle = ui.C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${H * 0.26}px ${ui.FONT}`; g.fillText('החמצן אזל', W / 2, H * 0.36);
    g.font = `500 ${H * 0.13}px ${ui.FONT}`; g.fillStyle = ui.C.muted; g.fillText('הבסיס בחושך. נחזור לתחילת הפרק ונתקן.', W / 2, H * 0.68);
  } });
  ui.inFront(p.mesh, 1.3, -0.05);
  const btn = ui.button3d('חזרה לנקודת השמירה', () => {}, { w: 0.44, h: 0.1 });
  ui.inFront(btn.mesh, 1.28, 0.22);
  const s = createScope(ctx);
  audio.say('gameover');
  await s.waitSelect(btn.mesh);
  p.dispose(); btn.dispose();
  await engine.fade(1, 400);
  resetAmbience();
  await engine.fade(0, 600);
}

function uiDemo() {
  const card = ui.card({ w: 0.32, h: 0.38, label: 'יש טמפרטורה מיטבית', onSelect: c => { c.setState('sel'); window.__uiCardState = 'sel'; },
    icon: (g, x, y, w, h) => { g.strokeStyle = ui.C.oxy; g.lineWidth = 10; g.beginPath(); g.moveTo(x, y + h); g.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y + h); g.stroke(); } });
  ui.inFront(card.mesh, 1.2, 0.05, -0.2);
  const btn = ui.button3d('המשך', () => audio.sfx('ok'));
  ui.inFront(btn.mesh, 1.2, 0.35, 0.25);
  audio.say('c1_hello');
  game.spend(45);
}

async function fxDemo(id) {
  const app = ctx.app;
  if (id === 'sealedBlast') { await app.pour('3'); await app.addYeast(); await app.setStopper('sealed'); }
  if (id === 'elephantToothpaste' || id === 'acidMelt') { await app.pour(id === 'acidMelt' ? '30' : '3'); }
  ctx.robi.face('oops');
  const shot = app.fx[id]();
  window.__fxMid = true;
  await shot;
  window.__fxDone = true;
}

async function trialDemo() {
  const app = ctx.app;
  await app.goggles();
  await app.setBath(37, 1500); await app.fillCylinder(); await app.pour('3'); await app.addYeast(); await app.stir();
  await app.setStopper('tube'); window.__running = true; await app.runTrial(34, 5);
  window.__fxDone = true;
}

// test route: the bench tools are live for the hand; every action is accepted (desktop drag / pour tests)
async function handDemo() {
  const { createHandling } = await import('./lab/handling.js');
  ctx.app.goggles();
  const hands = createHandling(ctx, ctx.app, { onAction: async () => ({ ok: true }) });
  hands.enable(true);
  ctx.hands = hands;
  window.__handReady = true;
}

$('enter').addEventListener('click', () => start(false));
$('enterVR').addEventListener('click', () => start(true));
boot().catch(err => { console.error(err); $('enter').textContent = 'שגיאה בטעינה'; });
