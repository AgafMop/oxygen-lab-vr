// Boot: engine → input → lab → locomotion. Chapters plug in from Task 10 on.
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createLocomotion } from './core/locomotion.js';
import { loadLab } from './lab/labScene.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const engine = createEngine(document.body);
const input = createInput(engine);
const ctx = { engine, input, ready: false, params };
if (TEST) window.__ctx = ctx;

const $ = id => document.getElementById(id);

async function boot() {
  ctx.lab = await loadLab(engine);
  ctx.loco = createLocomotion(engine, input);
  for (const [id, node] of Object.entries(ctx.lab.stationNodes)) ctx.loco.addStation(id, node, ctx.lab.discs[id]);
  await ctx.loco.goTo('bench', { fade: false });
  $('enter').disabled = false; $('enter').textContent = 'כניסה במחשב';
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) $('enterVR').hidden = false;
}

async function start(vr) {
  $('boot').hidden = true;
  if (vr) {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await engine.renderer.xr.setSession(session);
    session.addEventListener('end', () => { $('boot').hidden = false; });
  } else {
    $('hint').hidden = false;
    $('hint').textContent = 'גוררים כדי להסתכל · לחיצה כפולה לנעילת עכבר · W A S D';
  }
  ctx.ready = true;
}

$('enter').addEventListener('click', () => start(false));
$('enterVR').addEventListener('click', () => start(true));
boot().catch(err => { console.error(err); $('enter').textContent = 'שגיאה בטעינה'; });
