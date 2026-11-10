// Chapter 3 story events: Azoulay sets the generator to 60, a leaking stopper, and the dust storm hitting mid-trial.
import * as THREE from 'three';
import { createFigure } from '../lab/crew.js';
import { createStorm } from '../fx/storm.js';
import { boardAtStation } from './kit.js';
import { makeTween } from '../core/tween.js';

/** Two-button decision on a board in front of the robot station. Resolves true for the first (honest) choice. */
export async function decide(ctx, scope, [yesLabel, noLabel], { station = 'robot', place = { dist: 0.72, height: 1.22, side: 0.12 } } = {}) {
  const b = boardAtStation(ctx, scope, station, place);   // robot station default: clear of Robi's face
  let onPick = () => {};
  const yes = scope.add(ctx.ui.button3d(yesLabel, () => onPick(true), { w: 0.3, h: 0.08 }));
  const no = scope.add(ctx.ui.button3d(noLabel, () => onPick(false), { style: 'ghost', w: 0.3, h: 0.08 }));
  yes.mesh.position.set(0.17, 0, 0.01); no.mesh.position.set(-0.17, 0, 0.01); b.add(yes.mesh, no.mesh);
  const v = await scope.guard(new Promise(r => { onPick = r; if (ctx.auto) setTimeout(() => ctx.input.select(yes.mesh), 60); }));
  yes.dispose(); no.dispose();
  return v;
}

/** Where Azoulay stands to work the generator console: in front of the dial (toward the room), facing it. */
export function consoleSpot(ctx) {
  const dial = ctx.lab.props.P_generatorDial.getWorldPosition(new THREE.Vector3());
  const st = ctx.loco.stations.generator.pos;
  const toRoom = new THREE.Vector3(st.x - dial.x, 0, st.z - dial.z).normalize();
  const side = new THREE.Vector3(-toRoom.z, 0, toRoom.x);
  return { pos: new THREE.Vector3(dial.x, 0, dial.z).addScaledVector(toRoom, 0.48).addScaledVector(side, 0.12), look: new THREE.Vector3(dial.x, 0, dial.z) };
}

export async function azoulayScene(ctx, scope) {
  const { loco, mood, lab, audio, engine } = ctx;
  const tween = makeTween(engine, ctx.animSpeed ?? (ctx.auto ? 8 : 1));
  await loco.goTo('generator');
  const st = loco.stations.generator.pos;
  const az = scope.add(createFigure(ctx, { female: true }));
  const cmd = scope.add(createFigure(ctx, { hologram: true }));
  az.show(new THREE.Vector3(st.x - 1.5, 0, st.z + 1.6), st);
  ctx.storyPhase = 'azoulay';
  await scope.say('azoulay_1');
  const spot = consoleSpot(ctx);
  await az.walkTo(spot.pos, { lookAt: spot.look });
  const dial = lab.props.P_generatorDial;
  await Promise.all([az.gesture('dial'), tween(900, k => { dial.rotation.z = -k * Math.PI * 1.5; })]);
  audio.say('azoulay_2');
  await mood.to('gen', 0.02, 1800);              // too hot: the generator's enzymes stop working
  audio.sfx('alarm'); mood.set({ alarm: 1 });
  cmd.show(new THREE.Vector3(st.x - 1.5, 0, st.z + 1.0), st);
  if (ctx.params.has('hold')) await scope.guard(new Promise(r => setTimeout(r, 4000)));
  await scope.say('azoulay_3');
  await az.turnTo(st); await az.gesture('shrug');
  await scope.say('azoulay_4');
  await scope.say('azoulay_5');
  ctx.game.note('ד״ר אזולאי כיוונה את המחולל ל-60° בלי לבדוק, והחמצן צנח!');
  await Promise.all([tween(700, k => { dial.rotation.z = -Math.PI * 1.5 * (1 - k); }), mood.to('gen', 0.15, 1500), mood.to('alarm', 0, 1500)]);
  az.dispose(); cmd.dispose();
  ctx.storyPhase = null;
  await loco.goTo('robot');
}

/** Orange leak bubbles escaping the robot flask's stopper while `p` runs. */
export function leakFx(ctx, scope, flask, { subtle = false } = {}) {
  const { engine } = ctx;
  const N = subtle ? 14 : 60, rate = subtle ? 0.12 : 0.6, size = subtle ? 0.6 : 1;   // subtle: a few clear bubbles you only see if you look
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: subtle ? 0xdff6ff : 0xff9a4a, transparent: true, opacity: subtle ? 0.6 : 0.85 }), N);
  mesh.frustumCulled = false; engine.scene.add(mesh); scope.add(mesh);
  const P = [], M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const mouth = flask.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
  const off = engine.onFrame(dt => {
    if (P.length < N && Math.random() < rate) P.push({ p: mouth.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12), s: (0.004 + Math.random() * 0.004) * size, age: 0 });
    for (let i = P.length - 1; i >= 0; i--) { const b = P[i]; b.age += dt; b.p.addScaledVector(b.v, dt); if (b.age > 1.4) P.splice(i, 1); }
    mesh.count = P.length; mesh.visible = P.length > 0;
    P.forEach((b, i) => { M4.compose(b.p, Q, S.setScalar(b.s)); mesh.setMatrixAt(i, M4); });
    if (P.length) mesh.instanceMatrix.needsUpdate = true;
  });
  scope.add(off);
  return () => { off(); engine.scene.remove(mesh); };
}

/** The storm hits the base: window darkens with a dust wall, lights flicker to emergency red. Returns a `clear()` fn. */
export async function stormHits(ctx, scope) {
  const { engine, mood, audio } = ctx;
  const storm = createStorm(ctx, { center: new THREE.Vector3(0, 0, 0), azimuth: Math.PI, arc: 1.6, particles: false });   // no dust inside the lab
  scope.add(storm);
  storm.state.radius = 120; storm.state.height = 70;
  ctx.storyPhase = 'storm';
  audio.sfx('rumble'); audio.sfx('wind', 0.7);
  scope.add(() => { audio.sfx('wind', 0); engine.scene.backgroundIntensity = 1; });
  const sky = (to, ms) => new Promise(res => { const from = engine.scene.backgroundIntensity; let k = 0; const o = engine.onFrame(dt => { k = Math.min(1, k + dt * 1000 / Math.max(1, ms / (ctx.animSpeed ?? (ctx.auto ? 8 : 1)))); engine.scene.backgroundIntensity = from + (to - from) * k; if (k >= 1) { o(); res(); } }); });
  await Promise.all([storm.fadeIn(800), storm.approach(3500, 10), sky(0.3, 3000)]);
  mood.set({ flicker: 0.6 }); audio.sfx('alarm');
  await Promise.all([mood.to('light', 0.4, 900), mood.to('alarm', 1, 900)]);
  if (ctx.params.has('hold')) await scope.guard(new Promise(r => setTimeout(r, 4000)));
  await scope.say('storm_1');
  return async () => {
    audio.sfx('wind', 0);
    await Promise.all([storm.clear(1500), sky(1, 2000), mood.to('light', 0.85, 1500), mood.to('alarm', 0, 1500), mood.to('flicker', 0, 800)]);
    storm.dispose();
    ctx.storyPhase = null;
  };
}
