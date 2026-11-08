// End: hypothesis vs. discovery, score count-up, stars, badges, play again.
import { mean } from '../game/model.js';
import { boardAtStation, ICON } from './kit.js';

export const BADGES = {
  scientistHands: ['ידיים של מדען', 'בלי פשלות על השולחן'],
  preciseReader: ['קוראים מדויקים', 'כל הקריאות נכונות בניסיון ראשון'],
  detective: ['בלשי מעבדה', 'זיהו מה קרה למדידה החריגה'],
  scienceSense: ['חוש מדעי', 'ההשערה התאימה לתוצאות'],
  o2Keepers: ['שומרי חמצן', 'נשארו לפחות 45 דקות חמצן'],
  stormCalm: ['קור רוח בסערה', 'פסלו ניסוי שנפגע בסופה'],
  lifeScience: ['מדע בחיים', '3 תשובות נכונות במסדרון'],
};
const BENCH_MISTAKES = ['noGoggles', 'sealedStopper', 'excessYeast', 'boiling'];

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, input, storage } = ctx;
  if (!game.s.mistakes.some(m => BENCH_MISTAKES.includes(m))) game.award('scientistHands');
  if (!game.s.flags.wrongRead) game.award('preciseReader');
  if (game.s.o2 >= 45) game.award('o2Keepers');   // reachable with a lean plan even after both honest story redos
  const final = game.finalScore();
  window.__final = final;
  storage?.set('oxylab.v1', null);   // finished: next visit starts fresh

  ctx.app.reset(); ctx.app.clearFx();
  await loco.goTo('bench');
  robi.face('happy');
  audio.sfx('win');
  await scope.say('end_commander');

  // hypothesis vs. what the data showed
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.9, height: 1.42 });
  const ms = Object.entries(game.s.trials).map(([T, l]) => [Number(T), mean(l.filter(t => t.valid).map(t => t.volume))]).filter(([, m]) => m != null).sort((a, c) => a[0] - c[0]);
  const real = (g, x, y, w, h) => {
    g.strokeStyle = '#7f93b0'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + 10, y); g.lineTo(x + 10, y + h); g.lineTo(x + w, y + h); g.stroke();
    const X = T => x + 20 + (w - 30) * T / 70, Y = v => y + h - 10 - (h - 20) * v / 50;
    g.strokeStyle = '#E8643A'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); ms.forEach(([T, m], i) => (i ? g.lineTo : g.moveTo).call(g, X(T), Y(m))); g.stroke();
  };
  const hyp = scope.add(ui.card({ w: 0.26, h: 0.3, label: 'מה חשבתם', icon: ICON.graph(game.s.hypothesis || 'flat') }));
  const got = scope.add(ui.card({ w: 0.26, h: 0.3, label: 'מה גיליתם', icon: real }));
  hyp.mesh.position.set(0.16, 0.06, 0.01); got.mesh.position.set(-0.16, 0.06, 0.01); b.add(hyp.mesh, got.mesh);
  await scope.say('end_compare');

  // score + stars + badges
  let shown = 0;
  const score = scope.add(ui.panel({ w: 0.92, h: 0.52, name: 'endScore', draw(g, W, H) {
    ui.rr(g, 6, 6, W - 12, H - 12, 30); g.fillStyle = 'rgba(12,18,30,0.94)'; g.fill(); g.lineWidth = 6; g.strokeStyle = ui.C.good; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillStyle = '#ffd166'; g.font = `800 ${H * 0.13}px ${ui.FONT}`; g.fillText('★'.repeat(final.stars) + '☆'.repeat(3 - final.stars), W / 2, H * 0.11);
    g.fillStyle = ui.C.ink; g.font = `800 ${H * 0.1}px ${ui.FONT}`; g.fillText(`${Math.round(shown)} נקודות`, W / 2, H * 0.25);
    // badges: two columns, earned ones bright — name + what earned it
    const ids = Object.keys(BADGES), colW = (W - 60) / 2, rowH = (H * 0.64) / Math.ceil(ids.length / 2), min = ui.minPx(900);
    ids.forEach((id, i) => {
      const on = final.badges.includes(id), col = i % 2, r = Math.floor(i / 2);
      const x = W - 30 - colW * (col + 1), y = H * 0.33 + rowH * r;
      g.globalAlpha = on ? 1 : 0.35;
      g.fillStyle = on ? ui.C.oxy : '#3a4c6a'; g.beginPath(); g.arc(x + colW - rowH * 0.42, y + rowH / 2, rowH * 0.3, 0, 7); g.fill();
      g.fillStyle = '#041015'; g.font = `800 ${rowH * 0.36}px ${ui.FONT}`; g.textAlign = 'center'; g.fillText(on ? '✓' : '·', x + colW - rowH * 0.42, y + rowH / 2);
      const tx = { x: x + 8, w: colW - rowH * 0.9 - 12 };
      g.fillStyle = ui.C.ink; ui.fitText(g, BADGES[id][0], { ...tx, y: y + rowH * 0.04, h: rowH * 0.48, maxPx: rowH * 0.42, minPx: min, align: 'right', font: ui.FONT });
      g.fillStyle = ui.C.muted; ui.fitText(g, BADGES[id][1], { ...tx, y: y + rowH * 0.5, h: rowH * 0.46, maxPx: rowH * 0.34, minPx: min, weight: 500, align: 'right', font: ui.FONT });
      g.globalAlpha = 1;
    });
  } }));
  score.mesh.position.set(0, -0.33, 0.02); b.add(score.mesh);
  await scope.guard(new Promise(res => {
    const off = ctx.engine.onFrame(dt => { shown = Math.min(final.score, shown + Math.max(1, final.score) * dt * (ctx.auto ? 8 : 0.8)); score.redraw(); if (shown >= final.score) { off(); res(); } });
    scope.add(off);
  }));

  await scope.say('end_new');
  const again = scope.add(ui.button3d('משימה חדשה עם נתונים חדשים', () => restart(true), { w: 0.6, h: 0.09 }));
  const same = scope.add(ui.button3d('מהתחלה', () => restart(false), { style: 'ghost', w: 0.24, h: 0.09 }));
  again.mesh.position.set(0.12, -0.66, 0.03); same.mesh.position.set(-0.33, -0.66, 0.03); b.add(again.mesh, same.mesh);
  if (ctx.auto) return;
  await scope.guard(new Promise(() => {}));   // stay on the end screen until a button reloads the page

  function restart(fresh) {
    storage?.set('oxylab.v1', null);
    const q = new URLSearchParams(location.search);
    q.delete('only'); q.set('seed', fresh ? String(Date.now() % 100000) : String(game.s.seed));
    location.search = q.toString();
  }
}
