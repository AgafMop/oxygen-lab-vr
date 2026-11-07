// Chapter 1: briefing, learn to teleport, pick a hypothesis graph, sort the variables.
import * as THREE from 'three';
import { boardAtStation, row, ICON } from './kit.js';

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio } = ctx;
  await loco.goTo('entry', { fade: false });
  const entry = loco.stations.entry.pos;
  robi.placeNear(entry, new THREE.Vector3(-0.2, 0, -0.9));
  robi.face('happy');

  if (!game.s.flags.introDone) {        // the opening already covers the briefing
    await scope.say('c1_commander');
    await scope.say('c1_azoulay');
    await scope.say('c1_commander2');
  }
  robi.gesture('wave');
  await scope.say('c1_hello');

  // learn to teleport: go to the bench
  const disc = loco.stations.bench.disc;
  const pulse = ctx.engine.onFrame(() => { disc.scale.setScalar(1 + 0.12 * Math.sin(performance.now() * 0.006)); });
  scope.add(() => { pulse(); disc.scale.setScalar(1); });
  await scope.say('c1_move');
  if (ctx.auto) loco.goTo('bench');
  await scope.guard(new Promise(res => { const off = ctx.engine.onFrame(() => { if (loco.current === 'bench') { off(); res(); } }); scope.add(off); }));
  pulse(); disc.scale.setScalar(1);
  robi.placeNear(new THREE.Vector3(0, 0, -1.42), new THREE.Vector3(1.0, 0, 0.45));

  // ---- hypothesis ----
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.78, height: 1.3 });
  const shapes = [['rise', 'כמה שיותר חם'], ['peak', 'עולה ואז יורד'], ['flat', 'לא משתנה']];
  let pick;
  const picked = new Promise(res => { pick = res; });
  const cards = shapes.map(([id, label]) => scope.add(ui.card({ w: 0.26, h: 0.3, label, icon: ICON.graph(id), onSelect: c => pick({ id, c }) })));
  row(b, cards, { y: 0 });
  await scope.say('c1_hyp');
  if (ctx.auto) ctx.input.select(cards[1].mesh);
  const { id, c } = await scope.guard(picked);
  game.s.hypothesis = id;
  c.setState('sel'); audio.sfx('ok');
  for (const o of cards) if (o !== c) o.setState('off');
  await scope.say('c1_hyp_done');
  for (const o of cards) o.dispose();

  // ---- variables: what changes, what is measured, what stays the same ----
  const items = [
    ['thermometer', 'טמפרטורה', 'change'], ['cylinder', 'נפח החמצן', 'measure'], ['bottle', 'מי חמצן', 'same'],
    ['spoon', 'כמות שמרים', 'same'], ['timer', 'זמן', 'same'],
  ];
  const bins = [['change', 'משנים', '#E8643A'], ['measure', 'מודדים', '#3CC4BC'], ['same', 'קבוע', '#9FB0C8']];
  let selected = null, firstTry = true, left = items.length, onDone;
  const done = new Promise(res => { onDone = res; });
  const itemCards = items.map(([icon, label, want]) => {
    const card = scope.add(ui.card({ w: 0.16, h: 0.2, label, icon: ICON[icon], fs: 26, onSelect: cc => {
      if (cc.state === 'right') return;
      if (selected && selected.card.state !== 'right') selected.card.setState('idle');
      selected = { card: cc, want }; cc.setState('sel'); audio.sfx('click');
    } }));
    return card;
  });
  const binCards = bins.map(([kind, label, color]) => scope.add(ui.card({ w: 0.26, h: 0.17, icon: ICON.bin(label, color), onSelect: async bc => {
    if (!selected) return;
    if (selected.want === kind) {
      selected.card.setState('right'); audio.sfx('ok');
      const m = selected.card.mesh; m.position.set(bc.mesh.position.x + (Math.random() - 0.5) * 0.1, bc.mesh.position.y - 0.16, 0.02); m.scale.setScalar(0.55);
      selected = null;
      if (--left === 0) onDone();
    } else {
      firstTry = false; audio.sfx('no');
      const x0 = bc.mesh.position.x;
      let t = 0; const off = ctx.engine.onFrame(dt => { t += dt; bc.mesh.position.x = x0 + Math.sin(t * 50) * 0.01 * Math.max(0, 1 - t * 3); if (t > 0.4) { off(); bc.mesh.position.x = x0; } });
      ctx.audio.say('c1_vars_wrong');
    }
  } })));
  row(b, itemCards, { y: 0.14 });
  row(b, binCards, { y: -0.1 });
  await scope.say('c1_vars');
  if (ctx.auto) {
    for (const [i, [, , want]] of items.entries()) {
      ctx.input.select(itemCards[i].mesh);
      ctx.input.select(binCards[bins.findIndex(x => x[0] === want)].mesh);
    }
  }
  await scope.guard(done);
  game.s.flags.varsFirstTry = firstTry;
  if (firstTry) game.markDecision(true);
  robi.face('wow');
  await scope.say('c1_vars_done');
  robi.face('happy');
}
