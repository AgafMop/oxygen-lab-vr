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
const ctx = { engine, input, ui, audio, game, storage, ready: false, params, auto: AUTO, seed };
const saved = !params.has('only') && !params.has('fresh') ? storage.get(SAVE_KEY) : null;
if (TEST) window.__ctx = ctx;
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
  ctx.robi.placeNear(new THREE.Vector3(0, 0, -1.42), new THREE.Vector3(1.0, 0, 0.45));
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
    game.s.hypothesis ??= 'peak'; game.s.flags.goggles = true;
    const unmixedAt = Number(params.get('handUnmixed')) || null;      // ?handUnmixed=40: the student forgot to stir there
    for (const [T, v] of [[20, 11], [40, 40.5], [60, 3.5]]) {
      const um = T === unmixedAt;
      game.addTrial(T, { volume: um ? Math.round(v * 0.6 * 2) / 2 : v, by: 'student', read: 'student', mixed: !um, ...(um ? { meta: 'unmixed' } : {}) });
    }
  }
  if (order > CHAPTERS.indexOf('robot')) {
    // robot completions at the hand temperatures + three new temperatures; one unmixed robot reading at 40
    const data = { 10: [5.5, 5, 6], 20: [10.5, 11.5], 30: [22, 21.5, 22.5], 40: [41, 25], 50: [31, 30, 32.5], 60: [4, 4.5] };
    game.s.plan = [10, 20, 30, 40, 50, 60];
    for (const [T, vs] of Object.entries(data)) vs.forEach((v, i) => game.addTrial(Number(T), { volume: v, by: 'robot', read: 'auto', ...(T === '40' && i === 1 ? { meta: 'unmixed', mixed: false } : {}) }));
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

$('enter').addEventListener('click', () => start(false));
$('enterVR').addEventListener('click', () => start(true));
boot().catch(err => { console.error(err); $('enter').textContent = 'שגיאה בטעינה'; });
