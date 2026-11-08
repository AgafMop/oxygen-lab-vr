// Live table + scatter/mean graph on the east-wall screen. Temperature axis grows to the right.
import * as THREE from 'three';
import { mean } from '../game/model.js';

const PLOT = { x0: 0.1, x1: 0.56, y0: 0.15, y1: 0.84, tMax: 70, vMax: 50 };

export function createGraphWall(ctx, anchor) {
  const { ui, game, input } = ctx;
  const w = anchor.userData.w ?? 2.26, h = anchor.userData.h ?? 1.31;
  let hi = null, pickT = null, pickCb = null;
  const valid = T => (game.s.trials[T] || []).filter(t => t.valid);
  const means = () => Object.fromEntries(Object.keys(game.s.trials).map(T => [T, mean(valid(T).map(t => t.volume))]));

  const p = ui.panel({ w, h, ppm: 700, viewDist: 2.5, name: 'graphWall', draw(g, W, H) {
    g.fillStyle = '#0a1620'; g.fillRect(0, 0, W, H);
    const C = ui.C, F = ui.FONT;
    const X = T => W * (PLOT.x0 + (PLOT.x1 - PLOT.x0) * T / PLOT.tMax), Y = v => H * (PLOT.y1 - (PLOT.y1 - PLOT.y0) * v / PLOT.vMax);
    // title
    g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = C.ink; g.font = `800 ${H * 0.066}px ${F}`;
    g.fillText('כמה חמצן נוצר בדקה, בכל טמפרטורה', W * 0.97, H * 0.065);
    // axes (math convention)
    g.strokeStyle = '#4a5d7a'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(0), Y(PLOT.vMax)); g.lineTo(X(0), Y(0)); g.lineTo(X(PLOT.tMax), Y(0)); g.stroke();
    const AX = Math.ceil(ui.minPx(700, 2.5) * 1.08);
    g.direction = 'ltr'; g.fillStyle = C.muted; g.font = `600 ${AX}px ${F}`; g.textAlign = 'center';
    for (let T = 0; T <= 70; T += 10) { g.fillText(String(T), X(T), Y(0) + H * 0.045); g.fillRect(X(T) - 1, Y(0), 2, 10); }
    g.textAlign = 'right';
    for (let v = 0; v <= 50; v += 10) { g.fillText(String(v), X(0) - 12, Y(v)); g.fillStyle = 'rgba(74,93,122,0.35)'; g.fillRect(X(0), Y(v), X(70) - X(0), 1); g.fillStyle = C.muted; }
    g.direction = 'rtl'; g.textAlign = 'center'; g.font = `600 ${AX}px ${F}`;
    g.fillText('טמפרטורה (מעלות)', (X(0) + X(70)) / 2, Y(0) + H * 0.105);
    g.fillStyle = '#4a5d7a'; g.beginPath(); g.moveTo(X(70) + 26, Y(0)); g.lineTo(X(70) + 4, Y(0) - 11); g.lineTo(X(70) + 4, Y(0) + 11); g.fill();
    g.beginPath(); g.moveTo(X(0), Y(50) - 26); g.lineTo(X(0) - 11, Y(50) - 4); g.lineTo(X(0) + 11, Y(50) - 4); g.fill(); g.fillStyle = C.muted;
    g.save(); g.translate(X(0) - W * 0.062, (Y(0) + Y(50)) / 2); g.rotate(-Math.PI / 2); g.fillText('מ״ל חמצן בדקה', 0, 0); g.restore();
    // pick column highlight
    if (pickT != null) { g.fillStyle = 'rgba(60,196,188,0.18)'; g.fillRect(X(pickT) - W * 0.018, Y(50), W * 0.036, Y(0) - Y(50)); }
    // mean line
    const ms = means(), Ts = Object.keys(ms).map(Number).filter(T => ms[T] != null).sort((a, b) => a - b);
    g.strokeStyle = C.mars; g.lineWidth = 7; g.beginPath(); Ts.forEach((T, i) => (i ? g.lineTo : g.moveTo).call(g, X(T), Y(ms[T]))); g.stroke();
    // dots
    for (const [Ts_, list] of Object.entries(game.s.trials)) {
      const T = Number(Ts_);
      list.forEach((t, i) => {
        const x = X(T) + (i - 1) * W * 0.006, y = Y(t.volume);
        if (t.valid) { g.fillStyle = C.oxy; g.beginPath(); g.arc(x, y, H * 0.011, 0, 7); g.fill(); }
        else { g.strokeStyle = C.bad; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 10, y - 10); g.lineTo(x + 10, y + 10); g.moveTo(x + 10, y - 10); g.lineTo(x - 10, y + 10); g.stroke(); }
        if (hi && hi.temp === T && hi.index === i) { g.strokeStyle = '#ffd166'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, H * 0.03, 0, 7); g.stroke(); }
      });
      if (ms[T] != null) { g.fillStyle = C.mars; g.fillRect(X(T) - 14, Y(ms[T]) - 3, 28, 6); }
    }
    // table (right side)
    const tx = W * 0.58, tw = W * 0.38, rows = Object.keys(game.s.trials).map(Number).sort((a, b) => a - b);
    const CW = [0.21, 0.18, 0.18, 0.18, 0.25].map(k => k * tw), cx = i => tx + tw - CW.slice(0, i).reduce((a, b) => a + b, 0) - CW[i] / 2;
    g.direction = 'rtl'; g.font = `700 ${AX}px ${F}`; g.fillStyle = C.muted; g.textAlign = 'center';
    const cols = ['מעלות', '1', '2', '3', 'ממוצע'];
    cols.forEach((c, i) => g.fillText(c, cx(i), H * 0.17));
    const rh = Math.min(H * 0.085, (H * 0.76) / Math.max(1, rows.length));
    rows.forEach((T, r) => {
      const y = H * 0.17 + rh * (r + 1);
      g.fillStyle = r % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; g.fillRect(tx, y - rh * 0.5, tw, rh);
      g.font = `600 ${Math.max(AX, rh * 0.55)}px ${F}`;
      const cells = [String(T), ...[0, 1, 2].map(i => game.s.trials[T][i]), ms[T] != null ? ms[T].toFixed(1) : ''];
      cells.forEach((c, i) => {
        const x = cx(i), cw = CW[i];
        if (c && typeof c === 'object') { g.fillStyle = c.valid ? C.ink : C.bad; g.fillText(String(c.volume), x, y); if (!c.valid) g.fillRect(x - cw * 0.3, y - 3, cw * 0.6, 4); }
        else { g.fillStyle = i === 4 ? C.mars : C.ink; g.fillText(c || '', x, y); }
      });
    });
  } });
  p.mesh.position.copy(anchor.getWorldPosition(new THREE.Vector3()));
  p.mesh.rotation.y = anchor.userData.yaw ?? -Math.PI / 2;
  p.mesh.translateZ(0.004);
  ctx.engine.scene.add(p.mesh);
  const offTrial = game.on('trial', () => p.redraw());

  const strips = [];
  return {
    mesh: p.mesh,
    update: () => p.redraw(),
    highlight(temp, index) { hi = temp == null ? null : { temp, index }; p.redraw(); },
    /** Selectable columns for each measured temperature. */
    pickMode(on, onPick) {
      for (const s of strips.splice(0)) { input.unregister(s); p.mesh.remove(s); }
      pickT = null; pickCb = onPick; p.redraw();
      if (!on) return;
      for (const T of Object.keys(game.s.trials).map(Number)) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.04, h * (PLOT.y1 - PLOT.y0)), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        s.position.set(-w / 2 + w * (PLOT.x0 + (PLOT.x1 - PLOT.x0) * T / PLOT.tMax), h / 2 - h * (PLOT.y0 + PLOT.y1) / 2, 0.005);
        s.userData.T = T;
        input.register(s, { noHighlight: true, onHover: v => { pickT = v ? T : (pickT === T ? null : pickT); p.redraw(); }, onSelect: () => pickCb?.(T) });
        p.mesh.add(s); strips.push(s);
      }
      return strips;
    },
    dispose() { offTrial(); this.pickMode(false); p.dispose(); },
  };
}
