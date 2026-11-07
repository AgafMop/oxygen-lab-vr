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

  // ---- 1. the outlier ----
  const flagged = Object.entries(game.s.trials).flatMap(([T, l]) => l.map((t, i) => ({ temp: Number(T), index: i, t }))).find(x => x.t.meta === 'unmixed' && x.t.valid)
    ?? findOutliers(vals())[0];
  if (flagged) {
    graph.highlight(flagged.temp, flagged.index);
    robi.face('think');
    await scope.say('c4_outlier');
    const b = boardAtStation(ctx, scope, 'robot', { dist: 0.75, height: 1.05, side: -0.15 });
    const causes = [['לא ערבבו', true], ['דליפה', false], ['רעש רגיל', false]];
    let first = true, resolve;
    const ok = new Promise(r => { resolve = r; });
    const cards = causes.map(([label, right], i) => {
      const c = scope.add(ui.card({ w: 0.17, h: 0.09, label, onSelect: cc => {
        if (right) { cc.setState('right'); audio.sfx('ok'); resolve(); }
        else { cc.setState('wrong'); audio.sfx('no'); if (first) game.markDecision(false); first = false; audio.say('c4_outlier_no'); }
      } }));
      c.mesh.position.set((1 - i) * 0.19, 0, 0.01); b.add(c.mesh);
      return c;
    });
    if (ctx.auto) setTimeout(() => input.select(cards[0].mesh), 60);
    await scope.guard(ok);
    if (first) { game.award('detective'); game.markDecision(true); }
    robi.face('oops'); robi.gesture('shrug');
    await scope.say('c4_outlier_ok');
    cards.forEach(c => c.dispose());

    // ---- 2. disqualify or keep? ----
    robi.face('think');
    await scope.say('c4_disq');
    let keptOnce = false, onDecide = () => {};
    const disq = scope.add(ui.button3d('לפסול', () => onDecide(true), { w: 0.2, h: 0.08 }));
    const keep = scope.add(ui.button3d('להשאיר', () => onDecide(false), { style: 'ghost', w: 0.2, h: 0.08 }));
    disq.mesh.position.set(0.12, 0, 0.01); keep.mesh.position.set(-0.12, 0, 0.01); b.add(disq.mesh, keep.mesh);
    for (;;) {
      const v = await scope.guard(new Promise(r => { onDecide = r; if (ctx.auto) setTimeout(() => input.select(disq.mesh), 60); }));
      if (v) break;
      if (!keptOnce) { keptOnce = true; game.markDecision(false); }
      audio.sfx('no');
      await scope.say('c4_keep');   // the highlighted dot is still pulling the mean line down
    }
    game.disqualify(flagged.temp, flagged.index, 'unmixed');
    if (!keptOnce) game.markDecision(true);
    audio.sfx('ok'); robi.face('happy');
    graph.highlight(null);
    await scope.say('c4_disq_ok');
    disq.dispose(); keep.dispose();
  }

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
  if (firstPeak) game.markDecision(true);
  robi.face('wow');
  await scope.say('c4_peak_ok');
  robi.face('happy');

  // ---- 4. inside the enzyme ----
  const ok = await playEnzymeZoom(ctx, scope);
  game.markDecision(ok);
  if (game.s.hypothesis === 'peak') game.award('scienceSense');
}
