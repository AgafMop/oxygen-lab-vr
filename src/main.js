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
