// Opening (in-engine): outside on Mars as the dust storm rolls in, then inside: alarms, dead generator, the crew.
import * as THREE from 'three';
import { createStorm } from '../fx/storm.js';
import { createFigure } from '../lab/crew.js';
import { createScope, Abort } from './kit.js';

const OUTSIDE = new THREE.Vector3(0, -200, 0);

const GROUND_FRAG = `
varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.1; a*=0.5; } return v; }
uniform float uDim;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float g = fbm(vW.xz * 0.35) * 0.6 + fbm(vW.xz * 3.0) * 0.4;
  vec3 col = mix(vec3(0.30,0.12,0.05), vec3(0.62,0.30,0.14), g) * uDim;
  vec3 haze = vec3(0.78,0.5,0.36) * uDim;
  col = mix(col, haze, smoothstep(0.35, 0.95, r));
  gl_FragColor = vec4(col, 1.0 - smoothstep(0.85, 1.0, r));
}`;

export async function run(ctx, scope) {
  const { engine, lab, audio, ui, game, input, storage } = ctx;
  const { scene } = engine;
  const hold = ms => ctx.params.has('hold') ? scope.guard(new Promise(r => setTimeout(r, 3500))) : scope.wait(ms);
  const seq = createScope(ctx);         // inner scope: "skip" aborts just the cinematic
  const outerAbort = () => seq.abort();
  scope.add(outerAbort);

  // ---- skip (after the first watch) ----
  let skipBtn = null;
  if (storage?.get('oxylab.introSeen')) {
    skipBtn = ui.button3d('דילוג על הפתיחה', () => seq.abort(), { style: 'ghost', w: 0.34, h: 0.08 });
    scope.add(skipBtn);
    const skipEl = document.getElementById('skip');
    if (skipEl) { skipEl.hidden = false; skipEl.onclick = () => seq.abort(); scope.add(() => { skipEl.hidden = true; }); }
  }

  // ---- outside ----
  const hidden = [lab.root, lab.robi.R_root, lab.glass, lab.dust].filter(Boolean);
  const out = new THREE.Group(); scene.add(out);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: GROUND_FRAG, transparent: true, depthWrite: true, uniforms: { uDim: { value: 1 } } }));
  ground.rotation.x = -Math.PI / 2; out.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 6), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7, metalness: 0.4 }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; out.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.15, 6), new THREE.MeshBasicMaterial({ color: 0xe8643a }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; out.add(ring);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e3018, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.7, 0), rockMat);
    const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 40;
    r.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); r.scale.y = 0.5; r.rotation.set(Math.random(), Math.random(), 0); out.add(r);
  }
  out.position.copy(OUTSIDE);
  let shifted = false;
  const restore = () => {
    if (shifted) { ctx.loco.setOffset(new THREE.Vector3()); shifted = false; }
    hidden.forEach(o => { o.visible = true; });
    scene.remove(out); scene.backgroundIntensity = 1;
    out.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    audio.sfx('wind', 0);
  };
  scope.add(restore);

  const storm = createStorm(ctx, { center: OUTSIDE.clone(), azimuth: Math.PI * 0.62 });
  scope.add(storm);
  const sky = (to, ms) => new Promise(res => { const from = scene.backgroundIntensity; let k = 0; const o = engine.onFrame(dt => { k = Math.min(1, k + dt * 1000 / Math.max(1, ms / (ctx.auto ? 8 : 1))); scene.backgroundIntensity = from + (to - from) * k; ground.material.uniforms.uDim.value = 0.35 + 0.65 * scene.backgroundIntensity; if (k >= 1) { o(); res(); } }); });

  // inside cast
  const azoulay = createFigure(ctx, { tint: 0xf0ece4 });
  const commander = createFigure(ctx, { hologram: true });
  scope.add(azoulay); scope.add(commander);

  try {
    await engine.fade(1, 10);
    hidden.forEach(o => { o.visible = false; });
    ctx.loco.setOffset(OUTSIDE.clone()); shifted = true;
    if (skipBtn) { ui.inFront(skipBtn.mesh, 1.2, 0.45); }
    ctx.introPhase = 'outside';
    audio.sfx('wind', 0.25);
    await engine.fade(0, 1500);
    await seq.guard(hold(1200));
    await seq.say('intro_1');
    ctx.introPhase = 'storm';
    await storm.fadeIn(1200);
    audio.sfx('wind', 0.6);
    await seq.guard(Promise.all([storm.approach(14000, 35), sky(0.45, 14000)]));
    await seq.guard(hold(0));
    audio.sfx('rumble'); audio.sfx('wind', 1);
    ctx.introPhase = 'hit';
    const sh = engine.onFrame(() => { engine.camera.position.x = (Math.random() - 0.5) * 0.02; });
    scope.add(sh);
    await seq.say('intro_2');
    await seq.guard(storm.hit(2500));
    sh(); engine.camera.position.x = 0;
    await engine.fade(1, 600);

    // ---- inside: alarms, dead generator ----
    restore(); storm.dispose();
    ctx.mood.set({ light: 0.3, alarm: 1, gen: 0, flicker: 0.4 });
    audio.sfx('alarm'); audio.sfx('sparks');
    await ctx.loco.goTo('generator', { fade: false });
    const st = ctx.loco.stations.generator.pos;
    azoulay.show(new THREE.Vector3(st.x - 1.45, 0, st.z - 0.95), st);
    commander.show(new THREE.Vector3(st.x - 1.5, 0, st.z + 1.0), st);
    ctx.introPhase = 'inside';
    await engine.fade(0, 900);
    await seq.say('intro_3');
    await seq.guard(hold(0));
    azoulay.gesture('point');
    await seq.say('intro_4');
    await seq.say('c1_azoulay');
    await seq.say('c1_commander2');
    ctx.mood.to('flicker', 0, 800); ctx.mood.to('alarm', 0, 1500); ctx.mood.to('light', 0.85, 1500); ctx.mood.to('gen', 0.15, 1500);
    await seq.say('intro_5');
  } catch (e) {
    if (!(e instanceof Abort) || scope.aborted) throw e;
    // skipped: jump straight to the lab state
  }
  restore();
  ctx.mood.set({ light: 0.85, alarm: 0, gen: 0.15, flicker: 0 });
  azoulay.hide(); commander.hide();
  game.s.flags.introDone = true;
  storage?.set('oxylab.introSeen', true);
  ctx.introPhase = 'done';
  await engine.fade(0, 300);
}
