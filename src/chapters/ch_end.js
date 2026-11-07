// End: hypothesis vs. discovery, score count-up, stars, badges, play again.
import { mean } from '../game/model.js';
import { boardAtStation, ICON } from './kit.js';

export const BADGES = {
  scientistHands: ['ידיים של מדען', 'בלי פשלות על השולחן'],
  preciseReader: ['קוראים מדויקים', 'כל הקריאות נכונות בניסיון ראשון'],
  detective: ['בלשי מעבדה', 'זיהו מה קרה למדידה החריגה'],
  scienceSense: ['חוש מדעי', 'ההשערה התאימה לתוצאות'],
  o2Keepers: ['שומרי חמצן', 'נשארו לפחות 90 דקות חמצן'],
};
const BENCH_MISTAKES = ['noGoggles', 'sealedStopper', 'excessYeast', 'boiling'];

export async function run(ctx, scope) {
  const { ui, loco, robi, game, audio, input, storage } = ctx;
  if (!game.s.mistakes.some(m => BENCH_MISTAKES.includes(m))) game.award('scientistHands');
  if (!game.s.flags.wrongRead) game.award('preciseReader');
  if (game.s.o2 >= 90) game.award('o2Keepers');
  const final = game.finalScore();
  window.__final = final;
  storage?.set('oxylab.v1', null);   // finished: next visit starts fresh

  ctx.app.reset(); ctx.app.clearFx();
  await loco.goTo('bench');
  robi.face('happy');
  audio.sfx('win');
  await scope.say('end_commander');

  // hypothesis vs. what the data showed
  const b = boardAtStation(ctx, scope, 'bench', { dist: 0.85, height: 1.32 });
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
  const score = scope.add(ui.panel({ w: 0.9, h: 0.36, draw(g, W, H) {
    ui.rr(g, 6, 6, W - 12, H - 12, 30); g.fillStyle = 'rgba(12,18,30,0.94)'; g.fill(); g.lineWidth = 6; g.strokeStyle = ui.C.good; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillStyle = '#ffd166'; g.font = `800 ${H * 0.2}px ${ui.FONT}`; g.fillText('★'.repeat(final.stars) + '☆'.repeat(3 - final.stars), W / 2, H * 0.17);
    g.fillStyle = ui.C.ink; g.font = `800 ${H * 0.16}px ${ui.FONT}`; g.fillText(`${Math.round(shown)} נקודות`, W / 2, H * 0.4);
    const ids = Object.keys(BADGES), cw = (W - 40) / ids.length;
    ids.forEach((id, i) => {
      const on = final.badges.includes(id), cx = W - 20 - cw * (i + 0.5);
      g.globalAlpha = on ? 1 : 0.3;
      g.fillStyle = on ? ui.C.oxy : '#3a4c6a'; g.beginPath(); g.arc(cx, H * 0.62, H * 0.07, 0, 7); g.fill();
      g.fillStyle = '#041015'; g.font = `800 ${H * 0.08}px ${ui.FONT}`; g.fillText(on ? '✓' : '·', cx, H * 0.625);
      g.fillStyle = ui.C.ink; g.font = `700 ${H * 0.055}px ${ui.FONT}`; g.fillText(BADGES[id][0], cx, H * 0.78);
      g.fillStyle = ui.C.muted; g.font = `500 ${H * 0.033}px ${ui.FONT}`; g.fillText(BADGES[id][1], cx, H * 0.86);
      g.globalAlpha = 1;
    });
  } }));
  score.mesh.position.set(0, -0.26, 0.02); b.add(score.mesh);
  await scope.guard(new Promise(res => {
    const off = ctx.engine.onFrame(dt => { shown = Math.min(final.score, shown + Math.max(1, final.score) * dt * (ctx.auto ? 8 : 0.8)); score.redraw(); if (shown >= final.score) { off(); res(); } });
    scope.add(off);
  }));

  await scope.say('end_new');
  const again = scope.add(ui.button3d('משימה חדשה עם נתונים חדשים', () => restart(true), { w: 0.6, h: 0.09 }));
  const same = scope.add(ui.button3d('מהתחלה', () => restart(false), { style: 'ghost', w: 0.24, h: 0.09 }));
  again.mesh.position.set(0.12, -0.5, 0.03); same.mesh.position.set(-0.33, -0.5, 0.03); b.add(again.mesh, same.mesh);
  if (ctx.auto) return;
  await scope.guard(new Promise(() => {}));   // stay on the end screen until a button reloads the page

  function restart(fresh) {
    storage?.set('oxylab.v1', null);
    const q = new URLSearchParams(location.search);
    q.delete('only'); q.set('seed', fresh ? String(Date.now() % 100000) : String(game.s.seed));
    location.search = q.toString();
  }
}
