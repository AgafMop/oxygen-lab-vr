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
import * as ch1 from './chapters/ch1_hypothesis.js';
import * as ch2 from './chapters/ch2_bench.js';

const CH = { hypothesis: ch1, bench: ch2 };

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const AUTO = params.has('auto');

const engine = createEngine(document.body);
const input = createInput(engine);
const ui = createUI(engine, input);
const audio = createAudio(ui, { fast: AUTO });
const seed = Number(params.get('seed')) || (Date.now() % 100000);
const game = createGame({ seed, storage: createStorage() });
const ctx = { engine, input, ui, audio, game, ready: false, params, auto: AUTO, seed };
if (TEST) window.__ctx = ctx;

const $ = id => document.getElementById(id);

async function boot() {
  ctx.lab = await loadLab(engine);
  ctx.loco = createLocomotion(engine, input);
  for (const [id, node] of Object.entries(ctx.lab.stationNodes)) ctx.loco.addStation(id, node, ctx.lab.discs[id]);
  await ctx.loco.goTo('bench', { fade: false });
  ctx.app = createApparatus(ctx);
  ctx.robi = createRobi(ctx);
  ctx.robi.placeNear(new THREE.Vector3(0, 0, -1.42), new THREE.Vector3(1.0, 0, 0.45));
  await ui.fontsReady;
  $('enter').disabled = false; $('enter').textContent = 'כניסה במחשב';
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) $('enterVR').hidden = false;
}

async function start(vr) {
  $('boot').hidden = true;
  audio.unlock();
  if (vr) {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await engine.renderer.xr.setSession(session);
    session.addEventListener('end', () => { $('boot').hidden = false; });
  } else {
    $('hint').hidden = false;
    $('hint').textContent = 'גוררים כדי להסתכל · לחיצה כפולה לנעילת עכבר · W A S D';
    setTimeout(() => { $('hint').hidden = true; }, 6000);
  }
  ui.wristMeter(game);
  ctx.ready = true;
  if (params.has('uidemo')) return uiDemo();
  if (params.has('fx')) return fxDemo(params.get('fx'));
  if (params.has('trialdemo')) return trialDemo();
  runGame().catch(err => { console.error(err); });
}

async function runGame() {
  const only = params.get('only');
  const list = only ? [only] : CHAPTERS.filter(id => CH[id]);
  for (const id of list) await runChapter(id);
  window.__gameDone = true;
}

async function runChapter(id) {
  for (;;) {
    game.setChapter(id);
    const scope = createScope(ctx); ctx.scope = scope;
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
  audio.sfx('alarm');
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
}

function uiDemo() {
  const card = ui.card({ w: 0.32, h: 0.38, label: 'יש טמפרטורה מיטבית', onSelect: c => c.setState('sel'),
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
