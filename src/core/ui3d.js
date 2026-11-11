// Canvas-texture UI in 3D: panels, cards, buttons; subtitles; O2 wrist meter (DOM HUD on desktop).
import * as THREE from 'three';
import { SPEAKERS } from '../game/script.js';
import { fitText as fitRaw } from './textFit.js';

export const C = {
  bg: 'rgba(12,18,30,0.92)', bg2: '#16233A', ink: '#EEF2F8', muted: '#9FB0C8', mars: '#E8643A',
  oxy: '#3CC4BC', good: '#38B979', bad: '#E85A4F', line: '#2A3A55', sel: '#1E4B57',
};
export const FONT = 'Heebo, "Segoe UI", sans-serif';

export function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Draw RTL text wrapped to maxW. Returns the y after the last line. */
export function wrapText(g, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

/** Smallest readable font size (px) on a panel: letter height ≈ 1° at the viewing distance. */
export const minPx = (ppm, viewDist = 0.8) => Math.ceil(0.0175 * viewDist / 0.72 * ppm);

export function createUI(engine, input, { audit = false } = {}) {
  const textAudit = [], seen = new Set();
  // fitText that also reports a box it could not fit at the minimum size (audit only)
  function fitText(g, text, opts) {
    const r = fitRaw(g, text, opts);
    if (!r.fits) g.__misfit?.(text);
    return r;
  }
  function watchText(g, c, { name, ppm, viewDist, realWorld }) {
    g.__misfit = text => {
      const key = `${name}|${text}|box`;
      if (seen.has(key)) return; seen.add(key);
      textAudit.push({ name, text: String(text), px: 0, ppm, viewDist, overflow: true, small: false, need: minPx(ppm, viewDist), box: true });
    };
    const raw = g.fillText.bind(g);
    g.fillText = (text, x, y, maxW) => {
      raw(text, x, y, maxW);
      const s = String(text); if (!s.trim()) return;
      const px = Number((g.font.match(/([\d.]+)px/) || [])[1]) || 10;
      const m = g.measureText(s), w = maxW ? Math.min(m.width, maxW) : m.width;
      const rtl = g.direction !== 'ltr', al = g.textAlign;
      const side = al === 'start' ? (rtl ? 'right' : 'left') : al === 'end' ? (rtl ? 'left' : 'right') : al;
      const x0 = side === 'center' ? x - w / 2 : side === 'left' ? x : x - w;
      const asc = m.actualBoundingBoxAscent ?? px * 0.8, desc = m.actualBoundingBoxDescent ?? px * 0.2;
      const W = c.width, H = c.height, T = g.getTransform();
      const pts = [[x0, y - asc], [x0 + w, y - asc], [x0, y + desc], [x0 + w, y + desc]].map(([a, b]) => [T.a * a + T.c * b + T.e, T.b * a + T.d * b + T.f]);
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      const overflow = Math.min(...xs) < W * 0.02 - 1 || Math.max(...xs) > W * 0.98 + 1 || Math.min(...ys) < -1 || Math.max(...ys) > H + 1;
      const epx = px * Math.hypot(T.a, T.b);
      const small = !realWorld && epx < minPx(ppm, viewDist) - 0.5;
      if (!overflow && !small) return;
      const key = `${name}|${s}|${overflow}|${small}`;
      if (seen.has(key)) return; seen.add(key);
      textAudit.push({ name, text: s, px: Math.round(epx * 10) / 10, ppm, viewDist, overflow, small, need: minPx(ppm, viewDist) });
    };
  }

  const { scene, camera, renderer } = engine;
  const fontsReady = Promise.race([
    document.fonts?.load ? Promise.all([document.fonts.load('700 40px Heebo'), document.fonts.load('500 40px Heebo')]).catch(() => {}) : Promise.resolve(),
    new Promise(r => setTimeout(r, 3000)),
  ]);

  function panel({ w, h, draw, ppm = 900, depthTest = true, viewDist = 0.8, name = 'panel', realWorld = false }) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * ppm); c.height = Math.round(h * ppm);
    const g = c.getContext('2d');
    if (audit) watchText(g, c, { name, ppm, viewDist, realWorld });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest, toneMapped: false }));
    const p = {
      mesh, canvas: c, g, W: c.width, H: c.height,
      redraw(...args) { g.clearRect(0, 0, c.width, c.height); g.direction = 'rtl'; draw?.(g, c.width, c.height, ...args); tex.needsUpdate = true; },
      dispose() { mesh.parent?.remove(mesh); tex.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); input.unregister(mesh); },
    };
    p.redraw(); fontsReady.then(() => p.redraw());
    return p;
  }

  /** Selectable card with an optional icon painter. states: idle | sel | right | wrong | off */
  function card({ w = 0.3, h = 0.36, label = '', icon, onSelect, fs, ppm = Math.max(900, Math.round(220 / Math.min(w, h))), viewDist = 0.8, name = 'card' }) {
    let state = 'idle', hover = false;
    const p = panel({
      w, h, ppm, viewDist, name: `${name}:${label}`, draw(g, W, H) {
        const fill = { sel: C.sel, right: '#1C4D36', wrong: '#5A2420' }[state] || C.bg2;
        const stroke = { sel: C.oxy, right: C.good, wrong: C.bad }[state] || (hover ? C.ink : C.line);
        rr(g, 6, 6, W - 12, H - 12, 28); g.fillStyle = fill; g.fill();      // the card itself stays opaque when dimmed
        g.globalAlpha = state === 'off' ? 0.35 : 1;
        g.lineWidth = hover ? 12 : 7; g.strokeStyle = stroke; g.stroke();
        const labelH = !label ? 0 : icon ? Math.min(H * 0.26, 110) : H;
        if (icon) { g.save(); icon(g, 30, 30, W - 60, H - 60 - labelH); g.restore(); }
        if (label) {
          g.fillStyle = C.ink;
          const f = fs || Math.round(icon ? Math.min(labelH * 0.55, W / 7) : H * 0.42);
          const box = icon ? { x: 24, y: H - labelH - 30, w: W - 48, h: labelH + 12 } : { x: 24, y: 16, w: W - 48, h: H - 32 };
          fitText(g, label, { ...box, maxPx: f, minPx: minPx(ppm, viewDist), font: FONT });
        }
        g.globalAlpha = 1;
      },
    });
    const api = {
      ...p,
      get state() { return state; },
      setState(s) { state = s; p.redraw(); input.setTargetEnabled(p.mesh, s !== 'off'); },
    };
    if (onSelect) input.register(p.mesh, { onSelect: () => onSelect(api), onHover: on => { hover = on; p.redraw(); }, noHighlight: true });
    return api;
  }

  function button3d(label, onSelect, { style = 'primary', w = 0.36, h = 0.1, viewDist = 0.8 } = {}) {
    let hover = false, enabled = true;
    const ppm = Math.max(900, Math.round(200 / h));
    const p = panel({
      w, h, ppm, viewDist, name: `button:${label}`, draw(g, W, H) {
        // disabled: a solid grey button (never see-through)
        rr(g, 4, 4, W - 8, H - 8, H / 3);
        g.fillStyle = !enabled ? '#252F43' : style === 'primary' ? C.mars : C.bg2; g.fill();
        g.lineWidth = hover && enabled ? 8 : 4; g.strokeStyle = !enabled ? '#36425B' : hover ? C.ink : (style === 'primary' ? C.mars : C.line); g.stroke();
        g.fillStyle = enabled ? '#fff' : '#7F8BA3';
        fitText(g, label, { x: H * 0.3, y: H * 0.1, w: W - H * 0.6, h: H * 0.8, maxPx: Math.round(H * 0.42), minPx: minPx(ppm, viewDist), font: FONT });
      },
    });
    input.register(p.mesh, { onSelect: () => enabled && onSelect(), onHover: on => { hover = on; p.redraw(); }, noHighlight: true });
    return { ...p, setEnabled(v) { enabled = v; p.redraw(); input.setTargetEnabled(p.mesh, v); } };
  }

  /** Place `mesh` at `dist` in front of the head, facing it. */
  function inFront(mesh, dist = 1.4, down = 0.1, side = 0) {
    const head = engine.headPosition(new THREE.Vector3());
    const cam = camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    mesh.position.copy(head).addScaledVector(fwd, dist).addScaledVector(right, side); mesh.position.y -= down;
    mesh.lookAt(head.x, mesh.position.y, head.z);
    if (!mesh.parent) scene.add(mesh);
  }

  // ---- subtitles: DOM on desktop, lerp-followed panel in XR ----
  const subEl = document.getElementById('sub');
  const subPanel = panel({ w: 1.1, h: 0.27, ppm: 800, depthTest: false, viewDist: 1.6, name: 'subtitles', draw(g, W, H, speaker, text) {
    if (!text) return;
    rr(g, 4, 4, W - 8, H - 8, 30); g.fillStyle = 'rgba(8,12,20,0.82)'; g.fill();
    g.textAlign = 'right'; g.textBaseline = 'top';
    g.font = `700 40px ${FONT}`; g.fillStyle = SPEAKERS[speaker]?.color || C.oxy; g.fillText(SPEAKERS[speaker]?.name || '', W - 34, 16);
    g.fillStyle = C.ink; fitText(g, text, { x: 34, y: 66, w: W - 68, h: H - 80, maxPx: 44, minPx: minPx(800, 1.6), weight: 500, align: 'right', valign: 'top', font: FONT });
  } });
  subPanel.mesh.renderOrder = 9000; subPanel.mesh.visible = false; subPanel.mesh.userData.ui = true; scene.add(subPanel.mesh);
  let subTimer = 0;
  const target = new THREE.Vector3(), q = new THREE.Quaternion();
  engine.onFrame(dt => {
    if (subTimer > 0 && (subTimer -= dt) <= 0) { subPanel.mesh.visible = false; if (subEl) subEl.hidden = true; }
    if (!engine.isXR() || !subPanel.mesh.visible) return;
    const cam = camera;
    const head = cam.getWorldPosition(target.clone());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(q));
    target.copy(head).addScaledVector(fwd, 1.4); target.y = head.y - 0.3;          // a little below the gaze, always in view
    subPanel.mesh.position.lerp(target, Math.min(1, dt * 5));
    subPanel.mesh.lookAt(head);
  });
  const subtitles = {
    show(speaker, text, ms = 3000) {
      subTimer = ms / 1000;
      if (engine.isXR()) { subPanel.redraw(speaker, text); subPanel.mesh.visible = true; }
      else if (subEl) {
        subEl.hidden = false;
        const b = document.createElement('b');
        b.style.color = SPEAKERS[speaker]?.color || C.oxy;
        b.textContent = (SPEAKERS[speaker]?.name || '') + ' ';
        subEl.replaceChildren(b, document.createTextNode(text));
      }
    },
    hide() { subTimer = 0.0001; },
  };

  // ---- O2 meter: DOM HUD on desktop, panel on the left controller in XR ----
  const hud = document.getElementById('o2');
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const wrist = panel({ w: 0.13, h: 0.05, ppm: 2000, viewDist: 0.45, name: 'wrist', draw(g, W, H, o2 = 360) {
    rr(g, 2, 2, W - 4, H - 4, 18); g.fillStyle = 'rgba(8,12,20,0.88)'; g.fill();
    g.direction = 'ltr'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `700 46px ${FONT}`; g.fillStyle = o2 < 60 ? C.bad : C.oxy; g.fillText(`O₂ ${fmt(o2)}`, 18, H * 0.38);
    g.fillStyle = C.line; g.fillRect(18, H * 0.72, W - 36, 12); g.fillStyle = o2 < 60 ? C.bad : C.mars; g.fillRect(18, H * 0.72, (W - 36) * Math.max(0, o2 / 360), 12);
  } });
  wrist.mesh.rotation.set(-Math.PI / 2.4, 0, 0); wrist.mesh.position.set(0, 0.03, 0.06);
  function wristMeter(game) {
    const update = o2 => {
      wrist.redraw(o2);
      if (hud) { hud.hidden = false; hud.querySelector('b').textContent = fmt(o2); hud.querySelector('i').style.width = `${Math.max(0, o2 / 360) * 100}%`; hud.classList.toggle('low', o2 < 60); }
    };
    game.on('o2', update); update(game.s.o2);
    const left = input.pointers.find(p => p.handedness === 'left') || input.pointers[0];
    left.grip.add(wrist.mesh);
    for (const p of input.pointers) p.ctrl.addEventListener('connected', e => { if (e.data.handedness === 'left') p.grip.add(wrist.mesh); });
    return { update };
  }

  return { panel, card, button3d, inFront, subtitles, wristMeter, C, FONT, rr, wrapText, fitText, minPx, fontsReady, textAudit };
}
