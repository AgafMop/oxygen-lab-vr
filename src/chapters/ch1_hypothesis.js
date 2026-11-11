// Chapter 1: briefing, learn to teleport, write the research hypothesis, pick the graph that matches it, sort the variables.
import * as THREE from 'three';
import { boardAtStation, row, ICON, slab, paintBoard } from './kit.js';
import { IV, DV, UPDOWN, EFFECT, RIGHT_IV, RIGHT_DV, SHAPES, shapeOf, sentenceText } from '../game/hypothesis.js';

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

  // ---- the research hypothesis as a sentence: "when ___ rises/falls, ___ will rise/fall/rise then fall/not change" ----
  await writeHypothesis(ctx, scope);

  // ---- which graph matches the sentence ----
  await pickGraph(ctx, scope);

  // ---- variables: what changes, what is measured, what stays the same ----
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.78, height: 1.3 });
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
      shake(ctx, scope, [bc.mesh], 0.01);
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

/** A short side-to-side shake (a "no"), back to the start position. */
function shake(ctx, scope, meshes, amp = 0.008) {
  const x0 = meshes.map(m => m.position.x); let t = 0;
  const off = ctx.engine.onFrame(dt => {
    t += dt;
    meshes.forEach((m, k) => { m.position.x = x0[k] + Math.sin(t * 50) * amp * Math.max(0, 1 - t * 3); });
    if (t > 0.4) { off(); meshes.forEach((m, k) => { m.position.x = x0[k]; }); }
  });
  scope.add(off);
}

// ---------- painters ----------
const SHADOW = g => { g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 12; g.shadowOffsetY = 6; };
function gloss(g, rr, x, y, w, h, r) {
  g.save(); rr(g, x, y, w, h, r); g.clip();
  const gl = g.createLinearGradient(0, y, 0, y + h * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.3)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(x, y, w, h * 0.55); g.restore();
}
const vgrad = (g, y, h, a, b) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
/** A round "change" arrow: the language-free sign that clicking swaps the word. */
function cycleIcon(g, cx, cy, r, color) {
  g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = r * 0.34; g.lineCap = 'round';
  const a0 = -Math.PI * 0.2, a1 = Math.PI * 1.35;
  g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1), tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1), s = r * 0.62;
  g.beginPath(); g.moveTo(ex + tx * s, ey + ty * s); g.lineTo(ex - nx * s * 0.75, ey - ny * s * 0.75); g.lineTo(ex + nx * s * 0.75, ey + ny * s * 0.75); g.closePath(); g.fill();
  g.restore();
}
function bulbIcon(g, cx, cy, r) {
  g.save();
  const glow = g.createRadialGradient(cx, cy - r * 0.2, 0, cx, cy - r * 0.2, r * 1.9);
  glow.addColorStop(0, 'rgba(255,200,87,0.5)'); glow.addColorStop(1, 'rgba(255,200,87,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy - r * 0.2, r * 1.9, 0, 7); g.fill();
  g.fillStyle = '#FFC857'; g.beginPath(); g.arc(cx, cy - r * 0.25, r * 0.72, Math.PI * 0.78, Math.PI * 2.22);
  g.lineTo(cx + r * 0.3, cy + r * 0.52); g.lineTo(cx - r * 0.3, cy + r * 0.52); g.closePath(); g.fill();
  g.fillStyle = '#FFF3C9'; g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.45, r * 0.18, 0, 7); g.fill();
  g.fillStyle = '#C9D4E6'; g.fillRect(cx - r * 0.32, cy + r * 0.6, r * 0.64, r * 0.15); g.fillRect(cx - r * 0.26, cy + r * 0.81, r * 0.52, r * 0.15);
  g.restore();
}
function checkIcon(g, cx, cy, r, color) {
  g.save(); g.strokeStyle = color; g.lineWidth = r * 0.36; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx - r * 0.7, cy); g.lineTo(cx - r * 0.2, cy + r * 0.5); g.lineTo(cx + r * 0.75, cy - r * 0.55); g.stroke(); g.restore();
}

// Slot colours: the variables teal, the directions amber.
const THEME = { v: { a: '#38C2B9', b: '#1B7A75', edge: '#7DEBE3' }, d: { a: '#F49A57', b: '#C4532A', edge: '#FFC79A' } };

async function writeHypothesis(ctx, scope) {
  const { ui, game, audio, input, engine } = ctx;
  await scope.say('c1_claim');
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.78, height: 1.3 });
  const ppm = 1400, vd = 0.8, min = ui.minPx(ppm, vd), HEAD = 0.11;
  // the board: a solid slab, a header with a light bulb, title and how-to, and an inset where the sentence sits
  slab(ctx, scope, b, { w: 0.78, h: 0.5, ppm, viewDist: vd, name: 'hypBoard', draw(g, W, H) {
    const head = HEAD * ppm, iconX = W - 0.05 * ppm, tw = W - 0.1 * ppm - 40;
    paintBoard(g, W, H, head);
    bulbIcon(g, iconX, head / 2, 0.026 * ppm);
    g.fillStyle = '#FFFFFF'; ui.fitText(g, 'השערת המחקר', { x: 40, y: 12, w: tw, h: head * 0.54, maxPx: 62, minPx: min, align: 'right', font: ui.FONT });
    g.fillStyle = '#A9C3E0'; ui.fitText(g, 'לחצו על משבצת כדי להחליף מילה', { x: 40, y: head * 0.57, w: tw, h: head * 0.36, maxPx: 34, minPx: min, align: 'right', weight: 500, font: ui.FONT });
    const top = head + 0.018 * ppm, bot = H - 0.118 * ppm;
    ui.rr(g, 28, top, W - 56, bot - top, 28); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke();
  } });
  const words = (text, w) => scope.add(ui.panel({ w, h: 0.08, ppm, viewDist: vd, name: 'hypWord', draw(g, W, H) {
    g.fillStyle = '#EEF2F8'; ui.fitText(g, text, { x: 2, y: 6, w: W - 4, h: H - 26, maxPx: 52, minPx: min, font: ui.FONT });
  } }));
  const slot = (options, w, kind) => {
    let i = -1, hover = false, wrong = false, locked = false;
    const T = THEME[kind];
    const p = scope.add(ui.panel({ w, h: 0.08, ppm, viewDist: vd, name: 'hypSlot', draw(g, W, H) {
      const pad = 14, x = pad, y = pad - 5, w2 = W - 2 * pad, h2 = H - 2 * pad, r = h2 * 0.3, filled = i >= 0, hot = hover && !locked;
      g.save(); SHADOW(g); ui.rr(g, x, y, w2, h2, r);
      g.fillStyle = wrong ? vgrad(g, y, h2, '#F0675C', '#A82F27') : filled ? vgrad(g, y, h2, hot ? T.edge : T.a, T.b) : hot ? '#1C2E4E' : '#121E36';
      g.fill(); g.restore();
      if (filled || wrong) gloss(g, ui.rr, x, y, w2, h2, r);
      ui.rr(g, x, y, w2, h2, r);
      g.lineWidth = hot ? 7 : 4; g.strokeStyle = wrong ? '#FFC2BC' : hot ? '#FFFFFF' : filled ? T.edge : T.a;
      if (!filled && !wrong) g.setLineDash([14, 10]); g.stroke(); g.setLineDash([]);
      const ic = h2 * 0.19, icx = x + 18 + ic, icy = y + h2 * 0.42;
      if (!locked) cycleIcon(g, icx, icy, ic, filled || wrong ? 'rgba(255,255,255,0.9)' : T.a);
      const tx = locked ? x + 16 : icx + ic + 12;
      g.fillStyle = filled || wrong ? '#FFFFFF' : T.a;
      ui.fitText(g, filled ? options[i] : 'בחרו', { x: tx, y: y + 4, w: x + w2 - 16 - tx, h: h2 * 0.66, maxPx: 46, minPx: min, weight: filled ? 700 : 600, font: ui.FONT });
      // one dot per word: which of the words is showing
      const gap = 20, cx0 = x + w2 / 2 + (options.length - 1) * gap / 2, dy = y + h2 - 13;
      options.forEach((_, k) => { g.beginPath(); g.arc(cx0 - k * gap, dy, 5.5, 0, 7); g.fillStyle = k === i ? '#FFFFFF' : filled || wrong ? 'rgba(255,255,255,0.38)' : 'rgba(159,176,200,0.45)'; g.fill(); });
    } }));
    const api = { mesh: p.mesh, dispose: () => p.dispose(), get i() { return i; }, get word() { return options[i]; },
      set wrong(v) { wrong = v; p.redraw(); }, lock() { locked = true; hover = false; p.redraw(); input.setTargetEnabled(p.mesh, false); },
      next() { i = (i + 1) % options.length; wrong = false; p.redraw(); } };
    input.register(p.mesh, { noHighlight: true, onHover: on => { hover = on; p.redraw(); }, onSelect: () => { if (locked) return; api.next(); audio.sfx('click'); refresh(); } });
    return api;
  };
  const A = slot(IV, 0.26, 'v'), B = slot(UPDOWN, 0.15, 'd'), Cs = slot(DV, 0.26, 'v'), D = slot(EFFECT, 0.25, 'd');
  row(b, [words('כאשר', 0.1), A, B, words(',', 0.02)], { y: 0.05, gap: 0.012, z: 0.008 });
  row(b, [Cs, D, words('.', 0.02)], { y: -0.055, gap: 0.012, z: 0.008 });

  // the confirm button: solid grey until the sentence is complete, then orange and gently breathing
  let enabled = false, hoverB = false, done = false, press = null, pressed = false;
  const okP = scope.add(ui.panel({ w: 0.36, h: 0.078, ppm, viewDist: vd, name: 'hypOk', draw(g, W, H) {
    const pad = 12, x = pad, y = pad - 4, w2 = W - 2 * pad, h2 = H - 2 * pad, r = h2 / 2, live = enabled || done;
    g.save(); if (live) SHADOW(g); ui.rr(g, x, y, w2, h2, r);
    g.fillStyle = done ? vgrad(g, y, h2, '#4CD38E', '#23874F') : enabled ? vgrad(g, y, h2, hoverB ? '#FFB07A' : '#F48C4E', '#C9502A') : '#232E45';
    g.fill(); g.restore();
    if (live) gloss(g, ui.rr, x, y, w2, h2, r);
    ui.rr(g, x, y, w2, h2, r); g.lineWidth = hoverB && enabled ? 7 : 3;
    g.strokeStyle = !live ? '#34405A' : hoverB ? '#FFFFFF' : 'rgba(255,255,255,0.4)'; g.stroke();
    const ic = h2 * 0.22, icx = x + w2 - h2 * 0.55;
    if (live) checkIcon(g, icx, y + h2 / 2, ic, '#FFFFFF');
    g.fillStyle = live ? '#FFFFFF' : '#8390A8';
    const label = done ? 'נרשם!' : enabled ? 'זו ההשערה שלי' : 'השלימו את המשפט';
    ui.fitText(g, label, { x: x + h2 * 0.45, y: y + 4, w: w2 - h2 * (live ? 1.5 : 0.9), h: h2 - 8, maxPx: 42, minPx: min, font: ui.FONT });
  } }));
  okP.mesh.position.set(0, -0.19, 0.008); b.add(okP.mesh);
  const ok = { mesh: okP.mesh, get enabled() { return enabled; },
    setEnabled(v) { enabled = v; okP.redraw(); input.setTargetEnabled(okP.mesh, v); } };
  input.register(okP.mesh, { noHighlight: true, onSelect: () => { if (!enabled) return; if (press) press(); else pressed = true; }, onHover: on => { hoverB = on; okP.redraw(); } });
  ok.setEnabled(false);
  let tt = 0;
  scope.add(engine.onFrame(dt => {
    tt += dt;
    okP.mesh.scale.setScalar(enabled && !hoverB ? 1 + 0.025 * Math.sin(tt * 4) : 1);
  }));
  // a press while Robi is still talking counts too
  const waitPress = () => scope.guard(pressed ? (pressed = false, Promise.resolve()) : new Promise(res => { press = () => { press = null; res(); }; }));
  ctx.hypBoard = { A, B, C: Cs, D, ok };      // tests drive the slots directly
  function refresh() { ok.setEnabled([A, B, Cs, D].every(x => x.i >= 0)); }

  await scope.say('c1_sentence');
  // auto: temperature rises → oxygen rises, then falls
  const autoFill = () => {
    for (const [x, want] of [[A, RIGHT_IV], [B, 'תעלה'], [Cs, RIGHT_DV], [D, 'תעלה ואז תרד']]) while (x.word !== want) input.select(x.mesh);
    setTimeout(() => input.select(ok.mesh), 60);
  };
  if (ctx.auto) autoFill();
  for (;;) {
    await waitPress();
    const badA = A.word !== RIGHT_IV, badC = Cs.word !== RIGHT_DV;
    if (!badA && !badC) break;
    audio.sfx('no'); A.wrong = badA; Cs.wrong = badC;
    shake(ctx, scope, [badA && A, badC && Cs].filter(Boolean).map(x => x.mesh));
    await scope.say('c1_sentence_var');
    if (ctx.auto) autoFill();
  }
  game.s.hypSentence = { iv: A.word, ivDir: B.word, dv: Cs.word, dvDir: D.word, text: sentenceText(A.word, B.word, Cs.word, D.word) };
  audio.sfx('ok');
  done = true; ok.setEnabled(false);
  [A, B, Cs, D].forEach(x => x.lock());
  await scope.say('c1_sentence_done');
  [A, B, Cs, D, okP].forEach(x => x.dispose());   // detached targets would still catch the ray
  b.parent?.remove(b);                      // the graph question opens in the same place
}

async function pickGraph(ctx, scope) {
  const { ui, game, audio, input } = ctx;
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.78, height: 1.3 });
  const ppm = 1400, vd = 0.8, min = ui.minPx(ppm, vd), HEAD = 0.1, hs = game.s.hypSentence;
  slab(ctx, scope, b, { w: 0.9, h: 0.52, ppm, viewDist: vd, name: 'graphQ', draw(g, W, H) {
    const head = HEAD * ppm;
    paintBoard(g, W, H, head);
    g.fillStyle = '#FFFFFF'; ui.fitText(g, 'איזה גרף מתאים להשערה שבחרתם?', { x: 40, y: 12, w: W - 80, h: head - 24, maxPx: 58, minPx: min, font: ui.FONT });
    if (!hs) return;
    // the student's sentence, quoted under the header
    const y = head + 0.02 * ppm, h = 0.062 * ppm;
    ui.rr(g, 40, y, W - 80, h, h / 2); g.fillStyle = 'rgba(60,196,188,0.16)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(60,196,188,0.65)'; g.stroke();
    g.fillStyle = '#EEF2F8'; ui.fitText(g, `ההשערה שלכם: ${hs.text}`, { x: 70, y: y + 6, w: W - 140, h: h - 12, maxPx: 40, minPx: min, weight: 500, font: ui.FONT });
  } });
  const want = hs ? shapeOf(hs) : null;
  let pick = null;
  const cards = SHAPES.map(([id, label]) => scope.add(ui.card({ w: 0.19, h: 0.25, label, icon: ICON.graph(id), name: 'graph', onSelect: c => pick?.({ id, c }) })));
  row(b, cards, { y: -0.075, gap: 0.025, z: 0.008 });
  ctx.graphBoard = { cards, want };
  const next = () => new Promise(res => { pick = res; });
  const autoPick = () => setTimeout(() => input.select(cards[SHAPES.findIndex(s => s[0] === (want || 'peak'))].mesh), 60);
  let picked = next();                       // a card picked while Robi is still asking counts
  const asked = scope.say('c1_hyp');
  if (ctx.auto) asked.then(autoPick, () => {});
  for (;;) {
    const { id, c } = await scope.guard(picked);
    pick = null;
    await asked;
    if (!want || id === want) {
      game.s.hypothesis = id;
      c.setState('sel'); audio.sfx('ok');
      for (const o of cards) if (o !== c) o.setState('off');
      break;
    }
    c.setState('wrong'); audio.sfx('no'); shake(ctx, scope, [c.mesh]);
    await scope.say('c1_hyp_wrong');
    c.setState('idle');
    picked = next();
    if (ctx.auto) autoPick();
  }
  await scope.say('c1_hyp_done');
  cards.forEach(c => c.dispose());
  b.parent?.remove(b);
}
