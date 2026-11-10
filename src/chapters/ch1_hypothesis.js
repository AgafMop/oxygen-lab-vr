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

  // ---- the research hypothesis as a sentence: "when ___ rises/falls, ___ will rise/fall/not change" ----
  await writeHypothesis(ctx, scope);

  // ---- hypothesis as a graph shape ----
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.78, height: 1.3 });
  const shapes = [['rise', 'כמה שיותר חם'], ['peak', 'עולה ואז יורד'], ['flat', 'לא משתנה']];
  let pick;
  const picked = new Promise(res => { pick = res; });
  const cards = shapes.map(([id, label]) => scope.add(ui.card({ w: 0.26, h: 0.3, label, icon: ICON.graph(id), onSelect: c => pick({ id, c }) })));
  row(b, cards, { y: 0 });
  if (game.s.hypSentence) {
    const mine = scope.add(ui.panel({ w: 0.86, h: 0.06, ppm: 1400, viewDist: 0.8, name: 'hypMine', draw(g, W, H) {
      ui.rr(g, 2, 2, W - 4, H - 4, 20); g.fillStyle = ui.C.bg; g.fill();
      g.fillStyle = ui.C.ink; ui.fitText(g, `ההשערה שלכם: ${game.s.hypSentence.text}`, { x: 20, y: 4, w: W - 40, h: H - 8, maxPx: 46, minPx: ui.minPx(1400, 0.8), weight: 500, font: ui.FONT });
    } }));
    mine.mesh.position.set(0, 0.2, 0.01); b.add(mine.mesh);
  }
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
  const placed = {};
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
      // sorted cards line up side by side under their bin (three constants never pile up)
      const n = items.filter(x => x[2] === kind).length, k = placed[kind] = (placed[kind] ?? -1) + 1;
      const m = selected.card.mesh; m.scale.setScalar(0.5);
      m.position.set(bc.mesh.position.x + (k - (n - 1) / 2) * 0.086, bc.mesh.position.y - 0.155, 0.02);
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

// Sentence slots cycle through their words on each click (no typing, one hand). The variables have a right answer
// (we test Dr. Azoulay's claim: temperature → oxygen); the directions are the student's own prediction.
const IV = ['כמות השמרים', 'הטמפרטורה', 'כמות מי החמצן'];
const DV = ['כמות השמרים', 'כמות החמצן', 'כמות מי החמצן'];
const UPDOWN = ['תעלה', 'תרד'];
const EFFECT = ['תעלה', 'תרד', 'לא תשתנה'];

async function writeHypothesis(ctx, scope) {
  const { ui, game, audio, input, engine } = ctx;
  await scope.say('c1_claim');
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.78, height: 1.3 });
  const ppm = 1400, vd = 0.8, min = ui.minPx(ppm, vd);
  const words = (text, w, h = 0.085, color = ui.C.ink, px = 52) => scope.add(ui.panel({ w, h, ppm, viewDist: vd, name: 'hypWord', draw(g, W, H) {
    g.fillStyle = color; ui.fitText(g, text, { x: 4, y: 4, w: W - 8, h: H - 8, maxPx: px, minPx: min, font: ui.FONT });
  } }));
  const slot = (options, w) => {
    let i = -1, hover = false, wrong = false;
    const p = scope.add(ui.panel({ w, h: 0.085, ppm, viewDist: vd, name: 'hypSlot', draw(g, W, H) {
      ui.rr(g, 5, 5, W - 10, H - 10, 22);
      g.fillStyle = wrong ? '#5A2420' : i < 0 ? ui.C.bg : ui.C.sel; g.fill();
      g.lineWidth = hover ? 10 : 6; g.strokeStyle = wrong ? ui.C.bad : hover ? ui.C.ink : i < 0 ? ui.C.line : ui.C.oxy;
      if (i < 0) g.setLineDash([16, 12]); g.stroke(); g.setLineDash([]);
      g.fillStyle = i < 0 ? ui.C.muted : ui.C.ink;
      ui.fitText(g, i < 0 ? 'בחרו' : options[i], { x: 18, y: 8, w: W - 36, h: H * 0.62, maxPx: 50, minPx: min, font: ui.FONT });
      // one dot per word: which of the words is showing (language-free hint that clicking changes it)
      const r = 7, gap = 24, x0 = W / 2 + (options.length - 1) * gap / 2;
      options.forEach((_, k) => { g.beginPath(); g.arc(x0 - k * gap, H - 22, r, 0, Math.PI * 2); g.fillStyle = k === i ? ui.C.oxy : ui.C.line; g.fill(); });
    } }));
    const api = { mesh: p.mesh, get i() { return i; }, get word() { return options[i]; },
      set wrong(v) { wrong = v; p.redraw(); }, next() { i = (i + 1) % options.length; wrong = false; p.redraw(); } };
    input.register(p.mesh, { noHighlight: true, onHover: on => { hover = on; p.redraw(); }, onSelect: () => { api.next(); audio.sfx('click'); refresh(); } });
    scope.add(() => input.unregister(p.mesh));
    return api;
  };
  const A = slot(IV, 0.25), B = slot(UPDOWN, 0.13), Cs = slot(DV, 0.25), D = slot(EFFECT, 0.17);
  const back = scope.add(ui.panel({ w: 0.7, h: 0.45, ppm: 600, viewDist: vd, name: 'hypBack', draw(g, W, H) {
    ui.rr(g, 4, 4, W - 8, H - 8, 30); g.fillStyle = ui.C.bg; g.fill(); g.lineWidth = 4; g.strokeStyle = ui.C.line; g.stroke();
  } }));
  back.mesh.position.set(0, 0.01, -0.004); b.add(back.mesh);
  const title = words('השערת המחקר', 0.5, 0.07, ui.C.oxy, 56);
  title.mesh.position.set(0, 0.17, 0.01); b.add(title.mesh);
  row(b, [words('כאשר', 0.1), A, B, words(',', 0.02)], { y: 0.07, gap: 0.015 });
  row(b, [Cs, D, words('.', 0.02)], { y: -0.035, gap: 0.015 });
  let press = null;
  const waitPress = () => scope.guard(new Promise(res => { press = res; }));
  const ok = scope.add(ui.button3d('זו ההשערה שלי', () => press?.(), { w: 0.3, h: 0.075, viewDist: vd }));
  ok.mesh.position.set(0, -0.15, 0.01); b.add(ok.mesh); ok.setEnabled(false);
  ctx.hypBoard = { A, B, C: Cs, D, ok };      // tests drive the slots directly
  function refresh() { ok.setEnabled([A, B, Cs, D].every(x => x.i >= 0)); }
  await scope.say('c1_sentence');
  if (ctx.auto) {        // temperature rises → oxygen rises (Dr. Azoulay's own claim)
    for (const [x, n] of [[A, 2], [B, 1], [Cs, 2], [D, 1]]) for (let k = 0; k < n; k++) input.select(x.mesh);
    setTimeout(() => input.select(ok.mesh), 60);
  }
  for (;;) {
    await waitPress();
    const badA = A.word !== 'הטמפרטורה', badC = Cs.word !== 'כמות החמצן';
    if (!badA && !badC) break;
    audio.sfx('no'); A.wrong = badA; Cs.wrong = badC;
    const shake = [badA && A, badC && Cs].filter(Boolean).map(x => x.mesh);
    const x0 = shake.map(m => m.position.x); let t = 0;
    const off = engine.onFrame(dt => { t += dt; shake.forEach((m, k) => { m.position.x = x0[k] + Math.sin(t * 50) * 0.008 * Math.max(0, 1 - t * 3); }); if (t > 0.4) { off(); shake.forEach((m, k) => { m.position.x = x0[k]; }); } });
    scope.add(off);
    await scope.say('c1_sentence_var');
    if (ctx.auto) { while (A.word !== 'הטמפרטורה') input.select(A.mesh); while (Cs.word !== 'כמות החמצן') input.select(Cs.mesh); setTimeout(() => input.select(ok.mesh), 60); }
  }
  game.s.hypSentence = { iv: A.word, ivDir: B.word, dv: Cs.word, dvDir: D.word, text: `כאשר ${A.word} ${B.word}, ${Cs.word} ${D.word}.` };
  audio.sfx('ok'); ok.setEnabled(false);
  [A, B, Cs, D].forEach(x => input.setTargetEnabled(x.mesh, false));
  await scope.say('c1_sentence_done');
  b.parent?.remove(b);                      // the graph question opens in the same place
}
