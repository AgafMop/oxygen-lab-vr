// Chapter 5: set the backup generator to the temperature the student's own data says is best — and save the base.
import * as THREE from 'three';
import { mean, bestTemp, trueRate } from '../game/model.js';
import { createFigure } from '../lab/crew.js';
import { boardAtStation } from './kit.js';
import { consoleSpot } from './ch3_events.js';
import { makeTween } from '../core/tween.js';

const DIAL = [20, 25, 30, 35, 40, 45, 50, 55, 60];

export async function run(ctx, scope) {
  const { loco, robi, game, audio, ui, input, mood, lab, engine } = ctx;
  const tween = makeTween(engine, ctx.animSpeed ?? (ctx.auto ? 8 : 1));
  await loco.goTo('generator');
  const st = loco.stations.generator.pos;
  robi.placeNear(st, new THREE.Vector3(-0.3, 0, 1.0));
  const azoulay = scope.add(createFigure(ctx, { female: true }));
  const commander = scope.add(createFigure(ctx, { hologram: true }));
  const spot = consoleSpot(ctx);
  azoulay.show(spot.pos, spot.look);
  commander.show(new THREE.Vector3(st.x - 1.5, 0, st.z + 1.0), st);
  mood.set({ alarm: 0.35 });

  // generator bubbles (inside the glass column)
  const gpos = lab.anchors.A_generator.getWorldPosition(new THREE.Vector3());
  const NB = 90, bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8fff8, transparent: true, opacity: 0.7 }), NB);
  bub.frustumCulled = false; engine.scene.add(bub); scope.add(() => { engine.scene.remove(bub); bub.dispose(); });
  const B = Array.from({ length: NB }, () => ({ p: new THREE.Vector3(), s: 0 }));
  const reset = b => { const a = Math.random() * 6.28, r = Math.random() * 0.36; b.p.set(gpos.x + Math.cos(a) * r, 0.25 + Math.random() * 0.2, gpos.z + Math.sin(a) * r); b.s = 0.01 + Math.random() * 0.02; };
  B.forEach(reset);
  let flow = 0;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const offB = engine.onFrame(dt => {
    const n = Math.round(NB * flow);
    bub.count = n; bub.visible = n > 0;
    for (let i = 0; i < n; i++) { const b = B[i]; b.p.y += dt * (0.3 + flow * 0.5); if (b.p.y > 1.7) reset(b); M4.compose(b.p, Q, S.setScalar(b.s)); bub.setMatrixAt(i, M4); }
    if (n) bub.instanceMatrix.needsUpdate = true;
  });
  scope.add(offB);

  const means = Object.fromEntries(Object.entries(game.s.trials).map(([T, l]) => [T, mean(l.filter(t => t.valid).map(t => t.volume))]));
  const best = bestTemp(means) ?? 40;

  await scope.say('c5_go');
  await scope.say('c5_pick');
  const b = boardAtStation(ctx, scope, 'generator', { dist: 0.7, height: 1.1 });
  let first = true, onPick = () => {};
  const chips = DIAL.map((t, i) => {
    const c = scope.add(ui.card({ w: 0.075, h: 0.065, label: `${t}°`, onSelect: () => onPick(t) }));
    c.mesh.position.set(-(DIAL.length / 2 - i - 0.5) * 0.085, 0, 0.01); b.add(c.mesh);
    return c;
  });
  const dial = lab.props.P_generatorDial;
  let strength = 1;
  for (;;) {
    const T = await scope.guard(new Promise(r => { onPick = r; if (ctx.auto) setTimeout(() => input.select(chips[DIAL.indexOf(DIAL.reduce((a, c) => Math.abs(c - best) < Math.abs(a - best) ? c : a))].mesh), 60); }));
    chips.forEach(c => c.setState(c.mesh === chips[DIAL.indexOf(T)].mesh ? 'sel' : 'idle'));
    audio.sfx('click');
    strength = Math.min(1, trueRate(T) / trueRate(44));   // against the real optimum: data bent by a kept outlier shows
    azoulay.gesture('dial');
    await tween(900, k => { dial.rotation.z = -k * (T / 60) * Math.PI * 1.5; });
    await Promise.all([mood.to('gen', 0.15 + 0.85 * strength, 1500), tween(1500, k => { flow = strength * k; })]);
    if (Math.abs(T - best) <= 5) break;
    if (first) game.markDecision(false);
    first = false;
    audio.sfx('no');
    await scope.say('c5_weak');
  }
  if (first) game.markDecision(true);
  game.note(`כיוונו את המחולל לפי הגרף, והבסיס ניצל!`);
  chips.forEach(c => c.dispose());
  audio.sfx('win');
  await Promise.all([mood.to('alarm', 0, 1200), mood.to('light', 1, 1500), mood.to('gen', 0.15 + 0.85 * strength, 1500)]);
  robi.face('wow');
  await scope.say('c5_ok');
  azoulay.gesture('slump');
  await scope.say('c5_azoulay');
  azoulay.gesture('unslump');
  await scope.say('c5_commander');
  game.s.flags.rescued = true;
  game.s.o2 = Math.min(360, game.s.o2 + 90); game.spend(0);     // the generator refills the base reserve
  robi.face('happy');
  await scope.wait(ctx.auto ? 30 : 800);
  flow = 0.6;
}
