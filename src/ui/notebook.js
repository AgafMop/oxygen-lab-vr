// The student's lab notebook: a closed notebook with a fixed home at each station — on the bench desk in a clear
// spot, elsewhere on a small stand beside the seat (it never turns with the student) — introduced by Robi after the
// first good measurement. A click opens it in front of the head, where it stays; it records the
// hypothesis, the variables, the protocol, the results table (disqualified readings struck through), a log of what
// happened and — once the graph is read — the conclusion. Pages are rebuilt from the game state, so nothing is lost.
import * as THREE from 'three';
import { BENCH_TOP } from '../core/seated.js';
import { layoutText } from '../core/textFit.js';

import { notebookPages, iso, fmt } from '../game/notebook.js';

const LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069);

export function createNotebook(ctx) {
  const { engine, ui, game, input, audio } = ctx;
  const PAPER = '#F3EEDF', INK = '#1E2B48', RULE = '#C9D4E6', RED = '#B8322A', BLUE = '#2B5BA8';
  let available = false, openG = null, page = 0, waiters = { open: [], close: [] };

  // ---- the closed notebook beside the student ----
  const book = new THREE.Group(); book.name = 'notebook';
  const cover = new THREE.MeshStandardMaterial({ color: 0x1f5b66, roughness: 0.7 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xf1ecdc, roughness: 0.9 });
  const part = (w, h, d, m, x, y) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, 0); book.add(o); return o; };
  part(0.16, 0.003, 0.215, cover, 0, 0.0095); part(0.16, 0.003, 0.215, cover, 0, -0.0095);   // covers
  part(0.152, 0.016, 0.207, paper, -0.002, 0);                                                 // the pages
  part(0.006, 0.022, 0.215, cover, 0.078, 0);                                                  // spine (RTL: right)
  const label = ui.panel({ w: 0.13, h: 0.17, ppm: 1600, viewDist: 0.7, name: 'notebookCover', draw(g, W, H) {
    g.fillStyle = '#1f5b66'; g.fillRect(0, 0, W, H);
    g.fillStyle = PAPER; ui.rr(g, W * 0.1, H * 0.12, W * 0.8, H * 0.42, 18); g.fill();
    g.fillStyle = INK; ui.fitText(g, 'מחברת מעבדה', { x: W * 0.14, y: H * 0.15, w: W * 0.72, h: H * 0.36, maxPx: 70, minPx: ui.minPx(1600, 0.7), font: ui.FONT });
    g.strokeStyle = PAPER; g.lineWidth = 8;                       // a pencil
    g.save(); g.translate(W / 2, H * 0.77); g.rotate(-0.6);
    g.fillStyle = '#E8B04A'; g.fillRect(-70, -12, 120, 24); g.fillStyle = '#E8643A'; g.fillRect(-90, -12, 20, 24);
    g.beginPath(); g.moveTo(50, -12); g.lineTo(80, 0); g.lineTo(50, 12); g.closePath(); g.fillStyle = '#F2D7A8'; g.fill(); g.restore();
  } });
  label.mesh.rotation.x = -Math.PI / 2; label.mesh.position.y = 0.0116; book.add(label.mesh);
  // a slim stand under it where there is no desk (it would float otherwise)
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a96a8, roughness: 0.4, metalness: 0.6 });
  const stand = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 12), metal);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.012, 24), metal);
  stand.add(pole, foot); book.add(stand);
  const rc = new THREE.Raycaster();
  function fitStand() {
    rc.set(new THREE.Vector3(book.position.x, book.position.y + 0.02, book.position.z), new THREE.Vector3(0, -1, 0)); rc.far = 2;
    const hit = rc.intersectObject(ctx.lab.root, true)[0];
    const gap = hit ? book.position.y - 0.011 - hit.point.y : book.position.y;
    stand.visible = gap > 0.04;
    if (!stand.visible) return;
    const h = gap; pole.scale.y = h; pole.position.y = -0.011 - h / 2; foot.position.y = -0.011 - h + 0.006;
  }
  book.visible = false;
  engine.scene.add(book);
  // fixed homes. Bench: front-left of the desk, in front of the trough and right of the timer (measured clear of every
  // prop: the desk spans z -1.04…-1.61, the trough starts at z -1.31, the stand foot at x -0.5, the timer at x -0.77).
  const HOMES = { bench: { x: -0.5, z: -1.17, yaw: 0.15 } };
  function homeFor(id) {
    if (HOMES[id]) return HOMES[id];
    const st = ctx.loco?.stations[id];
    if (!st) return null;
    const yaw = st.yaw, fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const p = st.pos.clone().addScaledVector(fwd, 0.42).addScaledVector(right, -0.36);   // beside the seat, on the left
    return { x: p.x, z: p.z, yaw: yaw + 0.35 };
  }
  let homeOf = null;
  function place() {
    const id = ctx.loco?.current, h = homeFor(id);
    homeOf = id;
    if (!h) return;
    book.position.set(h.x, BENCH_TOP + 0.011, h.z); book.rotation.set(0, h.yaw, 0);
    book.updateMatrixWorld(true);
    fitStand();
  }
  engine.onFrame(() => { if (book.visible && ctx.loco?.current !== homeOf) place(); });
  input.register(book, { noHighlight: true, onSelect: () => nb.toggle(),
    onHover: on => { cover.emissive.setRGB(on ? 0.12 : 0, on ? 0.3 : 0, on ? 0.3 : 0); } });

  // desktop: a HUD button and the B key
  const btn = document.createElement('button');
  btn.className = 'btn alt'; btn.type = 'button'; btn.id = 'notebookBtn'; btn.hidden = true; btn.textContent = '📓 מחברת (B)';
  btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:7;font-size:15px;padding:8px 16px';
  btn.addEventListener('click', e => { e.stopPropagation(); nb.toggle(); });
  document.body.append(btn);
  addEventListener('keydown', e => { if (e.code === 'KeyB' && available) nb.toggle(); });

  // ---- the open notebook ----
  const PW = 0.56, PH = 0.42, PPM = 1500, VD = 0.6, MIN = ui.minPx(PPM, VD);
  function drawPage(g, W, H) {
    const pages = notebookPages(game.s);
    page = Math.max(0, Math.min(page, pages.length - 1));
    const p = pages[page];
    g.fillStyle = PAPER; ui.rr(g, 0, 0, W, H, 24); g.fill();
    g.strokeStyle = RULE; g.lineWidth = 2;
    for (let y = 120; y < H - 50; y += 48) { g.beginPath(); g.moveTo(30, y); g.lineTo(W - 30, y); g.stroke(); }
    g.strokeStyle = '#E3A6A0'; g.lineWidth = 3; g.beginPath(); g.moveTo(W - 70, 20); g.lineTo(W - 70, H - 20); g.stroke();   // margin line (RTL: right)
    g.fillStyle = BLUE; ui.fitText(g, p.title, { x: 40, y: 22, w: W - 130, h: 70, maxPx: 52, minPx: MIN, align: 'right', font: ui.FONT });
    g.fillStyle = '#6B7890';
    ui.fitText(g, `${LRI}${page + 1} / ${pages.length}${PDI}`, { x: 30, y: H - 52, w: 160, h: 40, maxPx: 30, minPx: MIN, align: 'left', weight: 500, font: ui.FONT });
    const top = 100, bottom = H - 60, x = 40, w = W - 130;
    if (p.kind === 'lines') {
      const txts = p.lines.map((t, i) => iso(p.numbered ? `${i + 1}. ${t}` : p.bullets ? `• ${t}` : t));
      // flowing from the top at one size for the whole page: the largest size at which every line, wrapped, fits
      const measure = (str, px) => { g.font = `500 ${px}px ${ui.FONT}`; return g.measureText(str).width; };
      const LH = 1.15, gap = 0.45, avail = bottom - top;
      const plan = px => txts.map(t => layoutText({ text: t, w, h: 1e6, maxPx: px, minPx: px, lineH: LH, measure }).lines.length * px * LH);
      let px = 38;
      for (; px > MIN; px--) { const hs = plan(px); if (hs.reduce((a, b) => a + b, 0) + gap * px * (hs.length - 1) <= avail) break; }
      let y = top;
      plan(px).forEach((h, i) => {
        g.fillStyle = INK;
        ui.fitText(g, txts[i], { x, y, w, h, maxPx: px, minPx: MIN, align: 'right', valign: 'top', weight: 500, font: ui.FONT, lineH: LH });
        y += h + gap * px;
      });
    } else {
      const maxN = Math.max(3, ...p.rows.map(r => r.vals.length));
      const cols = [['טמפ׳', 110], ...Array.from({ length: maxN }, (_, i) => [`${i + 1}`, 0]), ['ממוצע', 120], ['מי מדד', 100]];
      const fixed = cols.reduce((a, c) => a + c[1], 0), each = (w - fixed) / maxN;
      cols.forEach(c => { if (!c[1]) c[1] = each; });
      const rows = p.rows.length + 1, foot = p.foot ? 56 : 0, lh = Math.min(52, (bottom - top - foot) / rows);
      const cell = (t, i, r, color = INK, strike = false) => {
        let cx = x + w; for (let k = 0; k < i; k++) cx -= cols[k][1];
        const cw = cols[i][1], cy = top + r * lh;
        g.fillStyle = color;
        const f = ui.fitText(g, iso(t), { x: cx - cw + 6, y: cy, w: cw - 12, h: lh, maxPx: Math.min(34, lh * 0.66), minPx: MIN, weight: r ? 500 : 700, font: ui.FONT });
        if (strike) { g.strokeStyle = RED; g.lineWidth = 4; const m = g.measureText(t).width; g.beginPath(); g.moveTo(cx - cw / 2 - m / 2 - 4, cy + lh / 2); g.lineTo(cx - cw / 2 + m / 2 + 4, cy + lh / 2); g.stroke(); }
        return f;
      };
      cols.forEach((c, i) => cell(c[0], i, 0, BLUE));
      p.rows.forEach((row, r) => {
        cell(`${row.T}°`, 0, r + 1);
        row.vals.forEach((v, i) => cell(fmt(v.v), i + 1, r + 1, v.ok ? INK : RED, !v.ok));
        cell(row.avg, maxN + 1, r + 1, '#1C6B4A');
        cell(row.who, maxN + 2, r + 1, '#6B7890');
      });
      if (p.foot) { g.fillStyle = RED; ui.fitText(g, iso(p.foot), { x, y: bottom - foot, w, h: foot, maxPx: 30, minPx: MIN, align: 'right', weight: 500, font: ui.FONT }); }
    }
  }

  let pagePanel = null, prevB = null, nextB = null;
  function redraw() {
    if (!openG) return;
    pagePanel.redraw();
    const n = notebookPages(game.s).length;
    prevB.setEnabled(page > 0); nextB.setEnabled(page < n - 1);
  }
  game.on('trial', redraw); game.on('note', redraw);

  function placeInFront(g) {
    const head = engine.headPosition(new THREE.Vector3());
    const d = engine.camera.getWorldDirection(new THREE.Vector3());
    const yaw = Math.atan2(-d.x, -d.z);
    g.position.set(head.x - Math.sin(yaw) * VD, head.y - 0.14, head.z - Math.cos(yaw) * VD);
    g.rotation.set(-0.18, yaw, 0, 'YXZ');            // tilted back a little, like a book held in the lap
    return yaw;
  }

  const nb = {
    get available() { return available; },
    get isOpen() { return !!openG; },
    get page() { return page; },
    pages: () => notebookPages(game.s),
    /** Shown from the moment Robi introduces it (flag survives saves). */
    sync() {
      available = !!game.s.flags.notebook && game.s.chapter !== 'intro';
      book.visible = available; btn.hidden = !available || engine.isXR();
      if (!available && openG) nb.close();
    },
    open(at = null) {
      if (openG || !available) return;
      const pages = notebookPages(game.s);
      page = at ?? Math.min(page, pages.length - 1);
      openG = new THREE.Group();
      pagePanel = ui.panel({ w: PW, h: PH, ppm: PPM, viewDist: VD, name: 'notebookPage', draw: drawPage });
      openG.add(pagePanel.mesh);
      input.register(pagePanel.mesh, { noHighlight: true, onSelect: () => nb.flip(1) });
      prevB = ui.button3d('▶ הקודם', () => nb.flip(-1), { style: 'alt', w: 0.14, h: 0.055, viewDist: VD });
      nextB = ui.button3d('הבא ◀', () => nb.flip(1), { style: 'alt', w: 0.14, h: 0.055, viewDist: VD });
      const closeB = ui.button3d('סגירה', () => nb.close(), { w: 0.14, h: 0.055, viewDist: VD });
      prevB.mesh.position.set(0.18, -PH / 2 - 0.04, 0.005); nextB.mesh.position.set(-0.18, -PH / 2 - 0.04, 0.005); closeB.mesh.position.set(0, -PH / 2 - 0.04, 0.005);
      openG.add(prevB.mesh, nextB.mesh, closeB.mesh);
      openG.userData.parts = [pagePanel, prevB, nextB, closeB];
      // always drawn over the lab: on desktop the bench props would otherwise cut through the page
      openG.userData.parts.forEach((p, i) => { p.mesh.material.depthTest = false; p.mesh.renderOrder = 30 + i; });
      placeInFront(openG);                         // opens where the student looks and stays there
      engine.scene.add(openG);
      audio.sfx('click');
      redraw();
      if (ctx.params?.has('tour')) ctx.tourPending = (ctx.tourPending || 0) + 1;
      waiters.open.splice(0).forEach(f => f());
    },
    close() {
      if (!openG) return;
      openG.userData.parts.forEach(p => p.dispose());
      engine.scene.remove(openG); openG = null;
      audio.sfx('click');
      waiters.close.splice(0).forEach(f => f());
    },
    toggle() { if (openG) nb.close(); else nb.open(); },
    flip(d) {
      const n = notebookPages(game.s).length, to = Math.max(0, Math.min(n - 1, page + d));
      if (to === page) return;
      page = to; audio.sfx('click'); redraw();
    },
    /** Robi shows the notebook once, a little into the experiment (after the first good measurement). */
    async introduce(scope) {
      if (game.s.flags.notebook) return;
      game.s.flags.notebook = true; nb.sync();
      ctx.app?.hint(book);
      scope.add(() => ctx.app?.hint(null));
      await scope.say('nb_intro');
      const opened = new Promise(r => waiters.open.push(r));
      if (ctx.auto) setTimeout(() => nb.open(), 200);
      await Promise.race([scope.say('nb_open').then(() => scope.guard(opened)), scope.guard(opened)]);
      ctx.app?.hint(null);
      page = Math.max(0, notebookPages(game.s).findIndex(p => p.kind === 'table')); redraw();
      await scope.say('nb_tip');
      const closed = new Promise(r => waiters.close.push(r));
      if (ctx.auto) setTimeout(() => nb.close(), 200);
      await scope.guard(closed);
    },
  };
  game.on('chapter', () => nb.sync());
  return nb;
}
