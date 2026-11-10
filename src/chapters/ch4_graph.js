// Chapter 4: spot the outlier, decide to disqualify, find the peak, zoom into the enzyme.
import { findOutliers, mean, bestTemp } from '../game/model.js';
import { createGraphWall } from '../ui/graphWall.js';
import { playEnzymeZoom } from '../fx/enzymeZoom.js';
import { boardAtStation } from './kit.js';

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, input, lab } = ctx;
  ctx.graph ??= createGraphWall(ctx, lab.anchors.A_graphWall);
  const graph = ctx.graph;
  graph.update();
  if (loco.current !== 'robot') await loco.goTo('robot');

  const vals = () => Object.fromEntries(Object.entries(game.s.trials).map(([T, l]) => [T, l.filter(t => t.valid).map(t => t.volume)]));

  // ---- 1+2. every real "forgot to stir" outlier (the student's own first): explain it, then keep or disqualify ----
  const detected = findOutliers(vals());
  const validIdx = (T, i) => game.s.trials[T].slice(0, i + 1).filter(t => t.valid).length - 1;   // index among valid values
  const flaggedAll = Object.entries(game.s.trials)
    .flatMap(([T, l]) => l.map((t, i) => ({ temp: Number(T), index: i, t })))
    .filter(x => x.t.valid && (x.t.meta === 'unmixed' || x.t.meta === 'leak') && detected.some(o => o.temp === x.temp && o.index === validIdx(x.temp, x.index)))
    .sort((p, q) => (p.t.by === 'student' ? -1 : 0) - (q.t.by === 'student' ? -1 : 0));
  let firstCause = true, keptAny = false;
  for (const flagged of flaggedAll) {
    graph.highlight(flagged.temp, flagged.index);
    robi.face('think');
    await scope.say('c4_outlier');
    const b = boardAtStation(ctx, scope, 'robot', { dist: 0.75, height: 1.05, side: -0.15 });
    const isLeak = flagged.t.meta === 'leak';
    const causes = [['לא ערבבו', !isLeak], ['דליפה', isLeak], ['רעש רגיל', false]];
    let wrongHere = false, resolve;
    const ok = new Promise(r => { resolve = r; });
    const cards = causes.map(([label, right], i) => {
      const c = scope.add(ui.card({ w: 0.17, h: 0.09, label, onSelect: cc => {
        if (cc.state === 'right') return;
        if (right) { cc.setState('right'); audio.sfx('ok'); resolve(); }
        else { cc.setState('wrong'); audio.sfx('no'); if (!wrongHere) game.markDecision(false); wrongHere = true; firstCause = false; audio.say('c4_outlier_no'); }
      } }));
      c.mesh.position.set((1 - i) * 0.19, 0, 0.01); b.add(c.mesh);
      return c;
    });
    if (ctx.auto) setTimeout(() => input.select(cards[causes.findIndex(c => c[1])].mesh), 60);
    await scope.guard(ok);
    if (!wrongHere) game.markDecision(true);
    robi.face('oops'); robi.gesture('shrug');
    await scope.say(isLeak ? 'leak_ok' : flagged.t.by === 'student' ? 'c2_stir' : 'c4_outlier_ok');
    cards.forEach(c => c.dispose());

    // a real choice: disqualifying is honest; keeping it costs the decision and visibly bends the mean
    robi.face('think');
    await scope.say('c4_disq');
    let onDecide = () => {};
    const disq = scope.add(ui.button3d('לפסול', () => onDecide(true), { w: 0.2, h: 0.08 }));
    const keep = scope.add(ui.button3d('להשאיר', () => onDecide(false), { style: 'ghost', w: 0.2, h: 0.08 }));
    disq.mesh.position.set(0.12, 0, 0.01); keep.mesh.position.set(-0.12, 0, 0.01); b.add(disq.mesh, keep.mesh);
    const v = await scope.guard(new Promise(r => { onDecide = r; if (ctx.auto) setTimeout(() => input.select(disq.mesh), 60); }));
    graph.highlight(null);
    if (v) { game.disqualify(flagged.temp, flagged.index, flagged.t.meta); game.markDecision(true); audio.sfx('ok'); robi.face('happy'); await scope.say('c4_disq_ok'); }
    else { keptAny = true; game.markDecision(false); audio.sfx('no'); robi.face('think'); await scope.say('c4_keep'); }
    disq.dispose(); keep.dispose();
  }
  if (flaggedAll.length && firstCause && !keptAny) game.award('detective');

  // ---- 3. where is the peak? ----
  const means = Object.fromEntries(Object.entries(vals()).map(([T, v]) => [T, mean(v)]));
  const best = bestTemp(means);
  await scope.say('c4_peak');
  let firstPeak = true, resolveP;
  const peaked = new Promise(r => { resolveP = r; });
  const strips = graph.pickMode(true, T => {
    if (Math.abs(T - best) <= 5) { audio.sfx('ok'); resolveP(T); }
    else { audio.sfx('no'); if (firstPeak) game.markDecision(false); firstPeak = false; audio.say('c4_peak_no'); }
  });
  scope.add(() => graph.pickMode(false));
  if (ctx.auto) setTimeout(() => input.select(strips.find(s => s.userData.T === best)), 60);
  const chosen = await scope.guard(peaked);
  graph.pickMode(false);
  game.s.peakPick = chosen;
  game.note(`בגרף: הכי הרבה חמצן בסביבות ${chosen}°.`);
  if (firstPeak) game.markDecision(true);
  robi.face('wow');
  await scope.say('c4_peak_ok');
  robi.face('happy');

  // ---- 4. inside the enzyme ----
  const ok = await playEnzymeZoom(ctx, scope);
  game.markDecision(ok);
  if (game.s.hypothesis === 'peak') game.award('scienceSense');
}
