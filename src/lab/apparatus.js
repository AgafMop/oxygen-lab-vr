// Bench apparatus behaviour: liquids, thermometer, gas column, bubbles, tube, displays, failure FX.
// createApparatus(ctx, {at:'bench'}) drives the real props; {at:'robot'} builds a clone set on the robot bench.
import * as THREE from 'three';
import { foamTexture } from './looks.js';
import { makeTween, lerp, ease } from '../core/tween.js';

const GAS_TOP = 0.21;        // inner top of the inverted cylinder (m, local)
const ML_M = 0.19 / 50;      // metres of cylinder per ml
const BENCH_Y = 0.72;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, ...opts });
const tmat = (color, opacity, opts = {}) => mat(color, { transparent: true, opacity, depthWrite: false, ...opts });

export function createApparatus(ctx, { at = 'bench', speed = 1 } = {}) {
  const { engine, lab, ui, audio } = ctx;
  const { scene, camera } = engine;
  let tweenSpeed = speed;
  const tweenAt = makeTween(engine, 1);
  const anim = () => ctx.animSpeed ?? (ctx.auto ? 8 : 1);
  // fast robot runs speed tools up, but never so much that a move finishes in a frame or two (it would read as a jump)
  const tween = (ms, fn, e) => tweenAt(Math.max(ms / (anim() * tweenSpeed), 240 / anim()), fn, e);
  const P = lab.props;
  const wp = o => o.getWorldPosition(new THREE.Vector3());

  // ---------- which props: the real bench set, or a clone set on the robot bench ----------
  let flask, cyl, bath, trough, timer, thermo;
  let T;                                  // hand tools this set uses (real bench props, or clones on the robot bench)
  const group = new THREE.Group(); scene.add(group);
  if (at === 'bench') {
    ({ P_flask: flask, P_cylinder: cyl, P_bath: bath, P_trough: trough, P_timer: timer, P_thermometer: thermo } = P);
    T = { bottle3: P.P_bottle3, bottle30: P.P_bottle30, spoon: P.P_spoon, jar: P.P_yeastJar, rod: P.P_rod, stopperTube: P.P_stopperTube, stopperSealed: P.P_stopperSealed };
  } else {
    const base = wp(lab.anchors.A_robotBench);
    const put = (o, dx, dz) => { const c = o.clone(true); c.position.set(base.x + dx, base.y, base.z + dz); group.add(c); return c; };
    bath = put(P.P_bath, -0.05, -0.35); flask = put(P.P_flask, -0.05, -0.35); flask.position.y += 0.02;
    trough = put(P.P_trough, -0.05, 0.3); cyl = put(P.P_cylinder, -0.05, 0.3); cyl.position.y += 0.015;
    put(P.P_stand, -0.05, 0.52);
    for (const o of [bath, flask, trough, cyl]) o.rotation.y = Math.PI / 2;
    timer = null; thermo = put(P.P_thermometer, 0.05, -0.28);
    // Robi's own tools, lined up behind the flask so it visibly does every step
    T = { bottle3: put(P.P_bottle3, -0.2, -0.55), spoon: put(P.P_spoon, -0.05, -0.6), jar: put(P.P_yeastJar, 0.1, -0.58),
      rod: put(P.P_rod, 0.18, -0.5), stopperTube: put(P.P_stopperTube, 0.12, -0.4) };
    T.bottle30 = T.bottle3; T.stopperSealed = T.stopperTube;
    for (const o of Object.values(T)) ctx.track?.(o, 'robotTool');
    for (const o of [bath, flask, trough, cyl]) ctx.track?.(o, 'robotSet');
  }

  // ---------- liquids ----------
  const bathWater = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.25), tmat(0x4a8fd0, 0.42));
  bathWater.scale.y = 0.065; bathWater.position.y = 0.0425; bath.add(bathWater);
  const flaskLiq = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.042, 1, 32), tmat(0xbfe3ff, 0.55));
  flaskLiq.visible = false; flask.add(flaskLiq);
  const yeastLayer = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 32), mat(0xc9a86a, { roughness: 0.9 }));
  yeastLayer.position.y = 0.004; yeastLayer.visible = false; flask.add(yeastLayer);
  const foamTop = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.041, 0.006, 32), new THREE.MeshStandardMaterial({ map: foamTexture(), roughness: 0.9 }));
  foamTop.visible = false; flask.add(foamTop);
  const troughWater = new THREE.Mesh(new THREE.BoxGeometry(0.288, 0.075, 0.208), tmat(0x3d86c8, 0.38));
  troughWater.position.y = 0.04; trough.add(troughWater);
  const cylWater = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 1, 24), tmat(0x3d86c8, 0.5));
  const cylGas = new THREE.Mesh(new THREE.CylinderGeometry(0.0127, 0.0127, 1, 24), tmat(0xeafcff, 0.22));
  cyl.add(cylWater, cylGas);
  let gasMl = 0;
  function setGas(ml) {
    gasMl = Math.max(0, Math.min(50, ml));
    const gh = Math.max(0.0005, gasMl * ML_M);
    cylGas.scale.y = gh; cylGas.position.y = GAS_TOP - gh / 2;
    const wh = GAS_TOP - gh;
    cylWater.scale.y = wh; cylWater.position.y = wh / 2;
    cylWater.visible = wh > 0.002;
  }
  setGas(50); // starts full of air until filled

  // scale on the cylinder (0 at the closed top)
  const scale = ui.panel({ w: 0.032, h: 0.205, ppm: 5000, name: 'cylinderScale', realWorld: true, draw(g, W, H) {
    g.direction = 'ltr'; g.fillStyle = '#10202a'; g.font = `600 48px "IBM Plex Mono", monospace`; g.textBaseline = 'middle';
    const top = (0.205 - GAS_TOP + 0.005) / 0.205 * H + 30, step = (ML_M / 0.205) * H;
    for (let ml = 0; ml <= 50; ml++) {
      const y = top + ml * step;
      g.fillRect(0, y - 3, ml % 5 ? 40 : 70, ml % 5 ? 4 : 7);
      if (ml % 10 === 0) g.fillText(String(ml), 78, y);
    }
  } });
  scale.mesh.position.set(0, 0.105, 0.0148); cyl.add(scale.mesh);

  // thermometer column
  const thermoCol = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 8), new THREE.MeshBasicMaterial({ color: 0xe23b2a }));
  thermo.add(thermoCol);
  let bathTemp = 22;
  function setThermo(T) { bathTemp = T; const h = Math.max(0.01, (T / 100) * 0.23); thermoCol.scale.y = h; thermoCol.position.y = 0.012 + h / 2; }
  setThermo(22);

  // displays
  const tDisp = timer ? ui.panel({ w: 0.068, h: 0.026, ppm: 4000, viewDist: 0.6, name: 'timerDisplay', draw(g, W, H, s = 60) {
    g.fillStyle = '#0d1d18'; g.fillRect(0, 0, W, H); g.direction = 'ltr'; g.fillStyle = '#5fffc0';
    g.font = `700 ${H * 0.8}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`00:${String(Math.ceil(s)).padStart(2, '0')}`, W / 2, H / 2 + 4);
  } }) : null;
  if (tDisp) { tDisp.mesh.position.set(0, 0.035, 0.0262); timer.add(tDisp.mesh); }
  const bDisp = ui.panel({ w: 0.088, h: 0.044, ppm: 3000, viewDist: 0.6, name: 'bathDisplay', draw(g, W, H, t = 22, target = null) {
    g.fillStyle = '#0d1d18'; g.fillRect(0, 0, W, H); g.direction = 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffb36b'; g.font = `700 ${H * 0.46}px "IBM Plex Mono", monospace`; g.fillText(`${t.toFixed(1)}°`, W / 2, H * 0.34);
    if (target != null) { g.fillStyle = '#9fb0c8'; g.font = `600 ${H * 0.34}px "IBM Plex Mono", monospace`; g.fillText(`SET ${target}°`, W / 2, H * 0.78); }
  } });
  bDisp.mesh.position.set(-0.07, 0.042, -0.17 - 0.0005);
  bDisp.mesh.rotation.y = Math.PI; // the bath front faces the student (bath local -z after export? fixed below)
  bath.add(bDisp.mesh);
  // the bath's front panel is at Blender -Y → three +Z
  bDisp.mesh.position.z = 0.1705; bDisp.mesh.rotation.y = 0;

  // ---------- delivery tube ----------
  const flaskTopW = () => wp(flask).add(new THREE.Vector3(0, 0.15, 0));
  const tubeMesh = new THREE.Mesh(new THREE.BufferGeometry(), tmat(0xd8c9a8, 0.8, { roughness: 0.4 }));
  tubeMesh.visible = false; scene.add(tubeMesh);
  function buildTube() {
    const a = flaskTopW().add(new THREE.Vector3(0, 0.05, 0)), b = wp(cyl).add(new THREE.Vector3(0, 0.012, 0));
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 0.12;
    const edge = b.clone(); edge.y = wp(trough).y + 0.14; edge.x += (a.x - b.x) * 0.25;
    const curve = new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(0, 0.06, 0)), mid, edge, b.clone().add(new THREE.Vector3(0, 0.05, 0)), b]);
    tubeMesh.geometry.dispose(); tubeMesh.geometry = new THREE.TubeGeometry(curve, 64, 0.0035, 8, false);
  }

  // ---------- bubbles ----------
  const MAXB = 140;
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), tmat(0xffffff, 0.7, { roughness: 0.1 }), MAXB);
  bub.count = 0; bub.visible = false; bub.frustumCulled = false; scene.add(bub);
  const B = []; let bubRate = 0;
  const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();
  engine.onFrame(dt => {
    if (bubRate > 0) {
      const n = bubRate * dt;
      for (let i = 0; i < n + (Math.random() < n % 1 ? 1 : 0); i++) {
        if (B.length >= MAXB) break;
        const f = wp(flask), c = wp(cyl);
        if (Math.random() < 0.55) B.push({ p: f.add(new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.008, (Math.random() - 0.5) * 0.06)), top: f.y + 0.03, r: 0.0015 + Math.random() * 0.002 });
        else if (tubeMesh.visible || at === 'robot') B.push({ p: c.add(new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.01, (Math.random() - 0.5) * 0.01)), top: c.y + GAS_TOP - gasMl * ML_M, r: 0.002 + Math.random() * 0.002 });
      }
    }
    for (let i = B.length - 1; i >= 0; i--) { const b = B[i]; b.p.y += dt * 0.12; if (b.p.y >= b.top) B.splice(i, 1); }
    bub.count = B.length; bub.visible = B.length > 0;
    B.forEach((b, i) => { S.setScalar(b.r); M4.compose(b.p, Q, S); bub.setMatrixAt(i, M4); });
    if (B.length) bub.instanceMatrix.needsUpdate = true;
  });

  // ---------- generic particles (foam, steam, splash) ----------
  const MAXP = 500;
  const parts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0xf6f1e4, { roughness: 1 }), MAXP);
  parts.count = 0; parts.visible = false; parts.frustumCulled = false; scene.add(parts);
  const PS = [];
  function emit(n, fn) { for (let i = 0; i < n && PS.length < MAXP; i++) PS.push(fn(i)); }
  engine.onFrame(dt => {
    for (let i = PS.length - 1; i >= 0; i--) {
      const p = PS[i]; p.age += dt;
      if (p.age > p.life) { PS.splice(i, 1); continue; }
      p.v.y -= (p.g ?? 0) * dt; p.p.addScaledVector(p.v, dt);
      if (p.floor != null && p.p.y < p.floor) { p.p.y = p.floor; p.v.multiplyScalar(0.3); p.v.y = 0; }
      if (p.grow) p.s = Math.min(p.smax, p.s + p.grow * dt);
    }
    parts.count = PS.length; parts.visible = PS.length > 0;
    PS.forEach((p, i) => { S.setScalar(p.s); M4.compose(p.p, Q, S); parts.setMatrixAt(i, M4); });
    if (PS.length) parts.instanceMatrix.needsUpdate = true;
  });

  // camera overlays (splash red, goggles rim)
  function overlay(draw, z = -0.12) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 384; draw(c.getContext('2d'), 512, 384);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false }));
    m.position.z = z; m.renderOrder = 9500; m.visible = false; camera.add(m); return m;
  }
  const splashOv = overlay((g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
    gr.addColorStop(0, 'rgba(255,40,30,0.25)'); gr.addColorStop(1, 'rgba(160,0,0,0.95)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 4 + Math.random() * 14, 0, 7); g.fill(); }
  });
  const goggleOv = overlay((g, W, H) => {
    g.fillStyle = 'rgba(20,30,40,0.85)'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.47, H * 0.44, 0, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(232,100,58,0.6)'; g.lineWidth = 6; g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.47, H * 0.44, 0, 0, 7); g.stroke();
  }, -0.1);

  function shake(ms = 600, amp = 0.03) {
    if (engine.isXR()) return Promise.resolve();     // moving the world in a headset is a comfort risk
    const rig = engine.rig, base = rig.position.clone();
    return tween(ms, (k, raw) => { const a = amp * (1 - raw); rig.position.set(base.x + (Math.random() - 0.5) * a, base.y + (Math.random() - 0.5) * a, base.z + (Math.random() - 0.5) * a); }, ease.linear)
      .then(() => rig.position.copy(base));
  }

  // ---------- prop motion helpers ----------
  const home = new Map();
  function remember(o) { if (!home.has(o)) home.set(o, { parent: o.parent, pos: o.position.clone(), rot: o.rotation.clone() }); }
  async function arc(o, toWorld, ms = 700, lift = 0.12) {
    remember(o); scene.attach(o);
    o.userData.moveId = (o.userData.moveId || 0) + 1;          // a new move cancels a pending return home
    const from = o.position.clone();
    await tween(ms, k => { o.position.lerpVectors(from, toWorld, k); o.position.y += Math.sin(k * Math.PI) * lift; });
  }
  /** Back to its place: an arc home (instant only when asked, e.g. a reset hidden behind a fade). */
  function goHome(o, ms = 450) {
    const h = home.get(o); if (!h) return Promise.resolve();
    const toWorld = h.parent.localToWorld(h.pos.clone());
    scene.attach(o);
    const from = o.position.clone(), q0 = o.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(h.rot).premultiply(h.parent.getWorldQuaternion(new THREE.Quaternion()));
    const id = o.userData.moveId = (o.userData.moveId || 0) + 1;
    const done = () => { if (o.userData.moveId !== id) return; h.parent.attach(o); o.position.copy(h.pos); o.rotation.copy(h.rot); };
    if (!ms) { done(); return Promise.resolve(); }
    return tween(ms, k => { if (o.userData.moveId !== id) return; o.position.lerpVectors(from, toWorld, k); o.position.y += Math.sin(k * Math.PI) * 0.06; o.quaternion.slerpQuaternions(q0, q1, k); }).then(done);
  }

  const flaskMouth = () => wp(flask).add(new THREE.Vector3(0, 0.146, 0));

  const app = {
    group, props: { flask, cyl, bath, trough, timer, thermo },
    get bathTemp() { return bathTemp; },
    async setBath(target, ms = 4000) {
      const from = bathTemp;
      bDisp.redraw(from, target);
      await tween(ms, k => { const t = lerp(from, target, k); setThermo(t); bDisp.redraw(t, target); }, ease.out);
    },
    async fillCylinder() {
      audio.sfx('pour');
      const from = gasMl;
      await tween(900, k => setGas(lerp(from, 0, k)));
    },
    async pour(bottle) {
      const b = bottle === '30' ? T.bottle30 : T.bottle3;
      const m = flaskMouth().add(new THREE.Vector3(0.07, 0.09, 0));
      await arc(b, m, 600);
      audio.sfx('pour');
      flaskLiq.visible = true; flaskLiq.material.color.set(0xbfe3ff);
      await tween(1100, k => { b.rotation.z = lerp(0, 1.9, Math.min(1, k * 2)); const h = 0.022 * k; flaskLiq.scale.y = Math.max(0.0005, h); flaskLiq.position.y = h / 2 + 0.002; });
      await tween(400, k => { b.rotation.z = lerp(1.9, 0, k); });
      await goHome(b);
    },
    async addYeast() {
      const sp = T.spoon, jar = wp(T.jar);
      await arc(sp, jar.clone().add(new THREE.Vector3(0, 0.1, 0)), 450, 0.05);
      await arc(sp, flaskMouth().add(new THREE.Vector3(0, 0.03, 0)), 600);
      await tween(300, k => { sp.rotation.x = -1.4 * k; });
      yeastLayer.visible = true; yeastLayer.scale.y = Math.min(3, yeastLayer.scale.y + (yeastLayer.userData.n ? 1 : 0)); yeastLayer.userData.n = (yeastLayer.userData.n || 0) + 1;
      audio.sfx('click');
      await goHome(sp);
    },
    async stir() {
      const r = T.rod;
      await arc(r, flaskMouth().add(new THREE.Vector3(0, 0.02, 0)), 500);
      r.rotation.set(0, 0, Math.PI / 2 - 0.15);
      const c = r.position.clone();
      await tween(1400, k => { const a = k * Math.PI * 6; r.position.set(c.x + Math.cos(a) * 0.012, c.y - 0.06, c.z + Math.sin(a) * 0.012); }, ease.linear);
      yeastLayer.visible = false; flaskLiq.material.color.set(0xd9c39a); flaskLiq.material.opacity = 0.8;
      await goHome(r);
    },
    async setStopper(kind) {
      const s = kind === 'sealed' ? T.stopperSealed : T.stopperTube;
      await arc(s, flaskMouth().add(new THREE.Vector3(0, -0.012, 0)), 600);
      audio.sfx('pop');
      if (kind === 'tube') { buildTube(); tubeMesh.visible = true; }
      app.stopper = s;
    },
    /** Bubbles + gas column grows to `volume` over `seconds`; timer display counts down 60 s. */
    async runTrial(volume, seconds = 6) {
      audio.sfx('bubbles', true);
      foamTop.visible = true; foamTop.position.y = 0.024;
      const from = gasMl;
      bubRate = 20 + volume * 2;
      await tween(seconds * 1000, (k, raw) => { setGas(lerp(from, from + volume, raw)); tDisp?.redraw(60 * (1 - raw)); foamTop.scale.y = 1 + raw * 3; }, ease.linear);
      bubRate = 0; audio.sfx('bubbles', false);
    },
    gasMl: () => gasMl,
    // ---- physical handling hooks (src/lab/handling.js) ----
    flaskMouth,
    get jar() { return T.jar; },
    remember,
    /** Pour `dk` of the 20 ml mark into the flask; returns true once the mark is reached (it stops there). */
    fillFlask(dk) {
      const lvl = Math.min(1, (flaskLiq.userData.lvl || 0) + dk);
      flaskLiq.userData.lvl = lvl; flaskLiq.visible = true; flaskLiq.material.color.set(0xbfe3ff);
      const h = 0.022 * lvl; flaskLiq.scale.y = Math.max(0.0005, h); flaskLiq.position.y = h / 2 + 0.002;
      if (lvl >= 1 && !flaskLiq.userData.full) { flaskLiq.userData.full = true; audio.sfx('ok'); }
      return lvl >= 1;
    },
    flaskLevel: () => flaskLiq.userData.lvl || 0,
    dropYeast() {
      yeastLayer.visible = true; yeastLayer.scale.y = Math.min(3, yeastLayer.scale.y + (yeastLayer.userData.n ? 1 : 0)); yeastLayer.userData.n = (yeastLayer.userData.n || 0) + 1;
      audio.sfx('click');
    },
    /** Stir progress 0..1: the yeast clump spreads and the liquid turns cloudy. */
    stirTint(p) {
      if (!flaskLiq.visible || !yeastLayer.visible && p < 1) return;
      flaskLiq.material.color.setRGB(0.75 + 0.1 * p, 0.89 - 0.13 * p, 1 - 0.4 * p); flaskLiq.material.opacity = 0.55 + 0.25 * p;
      yeastLayer.scale.x = yeastLayer.scale.z = 1 - 0.6 * p;
      if (p >= 1) { yeastLayer.visible = false; flaskLiq.material.color.set(0xd9c39a); flaskLiq.material.opacity = 0.8; }
    },
    /** Robi's run: the robot-bench set really does every step (fast after the first one). */
    async robotRun({ fast = false } = {}) {
      const prev = tweenSpeed; tweenSpeed = fast ? 3.5 : 1.6;
      try { await app.pour('3'); await app.addYeast(); await app.stir(); await app.setStopper('tube'); } finally { tweenSpeed = prev; }
    },
    setSpeed(v) { tweenSpeed = v; },
    goHome,
    /** Robot shortcut: charged flask (peroxide + stirred yeast) with the tube connected. */
    robotPrep() {
      flaskLiq.visible = true; flaskLiq.material.color.set(0xd9c39a); flaskLiq.material.opacity = 0.8;
      flaskLiq.scale.y = 0.022; flaskLiq.position.y = 0.013; buildTube(); tubeMesh.visible = true;
    },
    emptyFlask() {
      flaskLiq.visible = false; flaskLiq.material.color.set(0xbfe3ff); flaskLiq.material.opacity = 0.55; flaskLiq.userData = {};
      yeastLayer.scale.set(1, 1, 1); yeastLayer.visible = false; yeastLayer.userData.n = 0; yeastLayer.scale.y = 1; foamTop.visible = false;
      tubeMesh.visible = false; if (app.stopper) goHome(app.stopper); app.stopper = null;
    },
    /** Pulse a prop's emissive to hint at it (null clears). */
    hint(obj) {
      if (app._hintOff) { app._hintOff(); app._hintOff = null; }
      if (!obj) return;
      const mats = [];
      obj.traverse(o => { if (o.isMesh && o.material.emissive) mats.push([o.material, (o.userData.__em || o.material.emissive).clone()]); });
      const off = engine.onFrame(() => { const k = 0.25 + 0.25 * Math.sin(performance.now() * 0.008); for (const [m] of mats) m.emissive.setRGB(0.24 * k * 2, 0.77 * k * 2, 0.74 * k * 2); });
      app._hintOff = () => { off(); for (const [m, e] of mats) m.emissive.copy(e); };
    },
    setGas,
    reset() {
      app.hint(null); setGas(50); flaskLiq.visible = false; flaskLiq.userData = {}; yeastLayer.scale.set(1, 1, 1); yeastLayer.visible = false; yeastLayer.userData.n = 0; yeastLayer.scale.y = 1; foamTop.visible = false;
      tubeMesh.visible = false; if (app.stopper) goHome(app.stopper); app.stopper = null; tDisp?.redraw(60); bubRate = 0;
    },
    async goggles() {
      const g = P.P_goggles;
      await arc(g, engine.headPosition(new THREE.Vector3()), 600, 0.05);
      g.visible = false; goggleOv.visible = true;
      await tween(300, k => { goggleOv.material.opacity = k * 0.9; });
      await tween(900, k => { goggleOv.material.opacity = 0.9 * (1 - k); });
      goggleOv.visible = false;
    },
    readingDraw(g, W, H, volume) {     // magnified view of the meniscus for the reading card
      g.fillStyle = '#dfe9f2'; g.fillRect(0, 0, W, H);
      const ppm = H / 12, mid = H / 2;
      g.fillStyle = 'rgba(61,134,200,0.55)'; g.fillRect(W * 0.25, mid, W * 0.5, H);
      g.fillStyle = 'rgba(234,252,255,0.6)'; g.fillRect(W * 0.25, 0, W * 0.5, mid);
      g.strokeStyle = '#2d6ea8'; g.lineWidth = 5; g.beginPath(); g.moveTo(W * 0.25, mid - 8); g.quadraticCurveTo(W / 2, mid + 14, W * 0.75, mid - 8); g.stroke();
      g.fillStyle = '#10202a'; g.direction = 'ltr'; g.font = `700 ${ppm * 1.1}px "IBM Plex Mono", monospace`; g.textBaseline = 'middle';
      const start = Math.floor(volume) - 6;
      for (let ml = start; ml <= start + 13; ml++) {
        const y = mid + (ml - volume) * ppm;
        if (ml < 0 || ml > 50) continue;
        g.fillRect(W * 0.25, y - 2, ml % 5 ? W * 0.08 : W * 0.15, ml % 5 ? 3 : 6);
        if (ml % 5 === 0 && y > ppm && y < H - ppm) g.fillText(String(ml), W * 0.42, y);
      }
    },
    // ---------- failure FX ----------
    fx: {
      async splash() {
        audio.sfx('sizzle'); splashOv.visible = true;
        await tween(200, k => { splashOv.material.opacity = k; });
        await tween(1500, k => { splashOv.material.opacity = 1 - k; });
        splashOv.visible = false;
      },
      async sealedBlast() {
        const s = app.stopper || P.P_stopperSealed;
        await tween(1300, (k, raw) => { s.position.y += Math.sin(performance.now() * 0.08) * 0.0008 * raw; }, ease.linear);
        audio.sfx('blast'); shake(700, 0.05);
        const m = flaskMouth();
        emit(160, () => ({ p: m.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6), g: 4, s: 0.008 + Math.random() * 0.012, life: 2.2, age: 0, floor: BENCH_Y + 0.005 }));
        const from = s.position.clone();
        await tween(500, k => { s.position.set(from.x, lerp(from.y, 2.95, k), from.z); s.rotation.x += 0.4; }, ease.out);
        await tween(700, k => { s.position.set(from.x + 0.4 * k, lerp(2.95, BENCH_Y + 0.01, k), from.z + 0.3 * k); s.rotation.z += 0.3; }, k => k * k);
        await ctx.audio.wait(600);
      },
      async elephantToothpaste() {
        audio.sfx('foam');
        const m = flaskMouth();
        let t = 0;
        let last = 0;
        await tween(2800, (k, raw) => {
          const n = Math.round((raw - last) * 420); last = raw; t = raw;
          emit(n, () => ({ p: m.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02)),
            v: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.25), g: 1.6,
            s: 0.014, grow: 0.05, smax: 0.06, life: 5, age: 0, floor: BENCH_Y + 0.025 }));
        }, ease.linear);
        await ctx.audio.wait(1500);
      },
      async acidMelt() {
        audio.sfx('sizzle'); audio.sfx('alarm');
        const at = wp(flask); at.y = BENCH_Y + 0.003;
        const burn = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1, transparent: true, opacity: 0.9 }));
        burn.rotation.x = -Math.PI / 2; burn.position.copy(at); burn.scale.setScalar(0.01); scene.add(burn);
        emit(120, () => ({ p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.02, (Math.random() - 0.5) * 0.2)), v: new THREE.Vector3(0, 0.15 + Math.random() * 0.2, 0), g: -0.05, s: 0.01, grow: 0.02, smax: 0.05, life: 3, age: 0 }));
        splashOv.visible = true;
        await tween(2600, k => { burn.scale.setScalar(0.01 + 0.24 * k); flask.position.y = -0.03 * k; flask.rotation.z = 0.25 * k; splashOv.material.opacity = 0.35 * Math.sin(k * Math.PI * 4) ** 2; });
        splashOv.visible = false;
        app._burn = burn;
      },
      async boil() {
        audio.sfx('boil');
        const c = wp(bath);
        await app.setBath(98, 1800);
        await tween(2500, () => {
          emit(3, () => ({ p: c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.07, (Math.random() - 0.5) * 0.2)), v: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.25 + Math.random() * 0.2, 0), g: -0.05, s: 0.01, grow: 0.025, smax: 0.04, life: 1.6, age: 0 }));
        }, ease.linear);
        await app.setBath(22, 600);
      },
      async cylinderNotFilled() {
        setGas(Math.max(gasMl, 28)); audio.sfx('no');
        const q = ui.panel({ w: 0.1, h: 0.1, draw(g, W, H) { g.fillStyle = '#E8643A'; g.font = `800 ${H * 0.9}px Heebo`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', W / 2, H / 2); } });
        q.mesh.position.copy(wp(cyl)).add(new THREE.Vector3(0, 0.3, 0)); scene.add(q.mesh);
        await tween(1600, k => { q.mesh.position.y += 0.0004; q.mesh.material.opacity = 1 - k * 0.3; });
        q.dispose();
      },
    },
    clearFx() {
      PS.length = 0; if (app._burn) { scene.remove(app._burn); app._burn = null; }
      flask.position.set(0, 0, 0); flask.rotation.set(0, 0, 0);
      if (P.P_stopperSealed) goHome(P.P_stopperSealed);
    },
  };
  return app;
}
