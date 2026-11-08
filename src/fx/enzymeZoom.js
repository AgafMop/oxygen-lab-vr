// "Inside the enzyme": the student shrinks into a yeast cell. Catalase is a folded protein chain with a glowing pocket;
// H2O2 molecules drift in, fit the pocket and split (bubble of O2). Heat speeds everything up — until the chain unfolds,
// the pocket disappears and the molecules bounce off. No text needed to see why the graph falls.
import * as THREE from 'three';
import { makeTween, lerp, ease } from '../core/tween.js';

const SHIFT = new THREE.Vector3(0, -60, 0);
const SEG = 220;

function foldedCurve(t) {            // compact (2,3) torus knot ≈ a globular folded protein
  const a = t * Math.PI * 2, p = 2, q = 3, r = 0.16 + 0.07 * Math.cos(q * a);
  return new THREE.Vector3(r * Math.cos(p * a), 0.07 * Math.sin(q * a) + 0.03 * Math.sin(7 * a), r * Math.sin(p * a) * 0.8);
}
function unfoldedCurve(t) {          // a long, loose chain
  return new THREE.Vector3((t - 0.5) * 1.7, 0.1 * Math.sin(t * 22) + 0.18 * Math.sin(t * 5), 0.04 * Math.cos(t * 17));
}

export async function playEnzymeZoom(ctx, scope) {
  const { engine, ui, audio, input } = ctx;
  const { scene } = engine;
  const tween = makeTween(engine, ctx.auto ? 8 : 1);
  const root = new THREE.Group();

  await scope.say('c4_zoom');
  await engine.fade(1, 600);
  audio.sfx('whoosh');

  // ---- enter the cell ----
  const saved = { bg: scene.background, fog: scene.fog, env: scene.environment };
  ctx.lab.root.visible = false;
  const hidden = []; scene.traverse(o => { if (o !== root && o.parent === scene && o !== engine.rig && o.visible && !o.userData.ui) { hidden.push(o); } });
  hidden.forEach(o => { o.visible = false; });
  scene.background = new THREE.Color(0x120a1c);
  scene.fog = new THREE.FogExp2(0x1a0f28, 0.35);
  ctx.loco.setOffset(SHIFT);
  scene.add(root);
  await engine.nextFrame(); await engine.nextFrame();

  const head = engine.headPosition(new THREE.Vector3());
  const yaw = new THREE.Euler().setFromQuaternion((engine.isXR() ? engine.renderer.xr.getCamera() : engine.camera).getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  root.position.copy(head).addScaledVector(fwd, 1.7); root.position.y -= 0.05;
  root.rotation.y = yaw;

  // cell interior dressing
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x5b3a7a, transparent: true, opacity: 0.25, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.6, 20, 14), blobMat);
    m.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, -1.5 - Math.random() * 3); root.add(m);
  }

  // protein chain (rebuilt every frame between folded/unfolded)
  const fold = [], unfold = [];
  for (let i = 0; i <= SEG; i++) { fold.push(foldedCurve(i / SEG)); unfold.push(unfoldedCurve(i / SEG)); }
  const pts = fold.map(p => p.clone());
  const curve = new THREE.CatmullRomCurve3(pts);
  const chainMat = new THREE.MeshStandardMaterial({ color: 0xc062d6, emissive: 0x3a1048, roughness: 0.35, metalness: 0.1 });
  const chain = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.035, 10, false), chainMat);
  root.add(chain);
  const pocket = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshBasicMaterial({ color: 0x5ff2e6, transparent: true, opacity: 0.85 }));
  pocket.position.set(0, 0, 0.17); root.add(pocket);
  let unfoldK = 0;
  function rebuild() {
    for (let i = 0; i <= SEG; i++) pts[i].lerpVectors(fold[i], unfold[i], unfoldK);
    chain.geometry.dispose(); chain.geometry = new THREE.TubeGeometry(curve, SEG, 0.035, 10, false);
    pocket.material.opacity = 0.85 * (1 - unfoldK); pocket.scale.setScalar(1 - 0.7 * unfoldK);
  }

  // H2O2 molecules: 2 O (red) + 2 H (white) per molecule, instanced
  const N = 26;
  const oMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0453a, roughness: 0.4 }), N * 2);
  const hMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 10, 6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }), N * 2);
  const bubMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.55, roughness: 0.05 }), 40);
  root.add(oMesh, hMesh, bubMesh);
  const spawn = m => {
    const a = Math.random() * Math.PI * 2, r = 1.1 + Math.random() * 0.5;
    m.p.set(Math.cos(a) * r, (Math.random() - 0.5) * 0.9, Math.sin(a) * r * 0.6 + 0.2);
    m.v.copy(m.p).multiplyScalar(-1).normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0)).normalize();
    m.rot = Math.random() * 6; m.bounce = 0;
  };
  const mols = Array.from({ length: N }, () => { const m = { p: new THREE.Vector3(), v: new THREE.Vector3() }; spawn(m); return m; });
  const bubbles = [];
  let speed = 0.25, hits = 0;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), E = new THREE.Euler();
  const off = engine.onFrame(dt => {
    const pk = pocket.position;
    mols.forEach((m, i) => {
      m.p.addScaledVector(m.v, dt * speed * 0.5); m.rot += dt * speed * 3;
      const d = m.p.distanceTo(pk);
      if (d < 0.11) {
        if (unfoldK < 0.5) {                     // fits: split → water + O2 bubble
          hits++; if (bubbles.length < 40) bubbles.push({ p: pk.clone().add(new THREE.Vector3(0, 0.05, 0.05)), s: 0.02, age: 0 });
          if (hits % 3 === 0) audio.sfx('pop');
          spawn(m);
        } else if (!m.bounce) { m.v.multiplyScalar(-1).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0.5)).normalize(); m.bounce = 1; }
      } else if (m.p.length() > 2.2) spawn(m);
      if (m.bounce && d > 0.4) m.bounce = 0;
      E.set(m.rot, m.rot * 0.7, 0); Q.setFromEuler(E);
      for (let k = 0; k < 2; k++) {
        V.set(k ? 0.028 : -0.028, 0, 0).applyQuaternion(Q).add(m.p); M4.compose(V, Q, S); oMesh.setMatrixAt(i * 2 + k, M4);
        V.set(k ? 0.06 : -0.06, k ? 0.03 : -0.03, 0).applyQuaternion(Q).add(m.p); M4.compose(V, Q, S); hMesh.setMatrixAt(i * 2 + k, M4);
      }
    });
    oMesh.instanceMatrix.needsUpdate = hMesh.instanceMatrix.needsUpdate = true;
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.age += dt; b.p.y += dt * 0.35; b.s = Math.min(0.06, b.s + dt * 0.03); if (b.age > 2.2) bubbles.splice(i, 1); }
    bubMesh.count = bubbles.length; bubMesh.visible = bubbles.length > 0;
    bubbles.forEach((b, i) => { M4.compose(b.p, Q.identity(), V.setScalar(b.s)); bubMesh.setMatrixAt(i, M4); });
    bubMesh.instanceMatrix.needsUpdate = true;
    chain.rotation.y += dt * 0.15 * (1 - unfoldK);
  });

  // thermometer gauge
  let T = 15;
  const gauge = ui.panel({ w: 0.42, h: 0.13, draw(g, W, H) {
    ui.rr(g, 4, 4, W - 8, H - 8, 24); g.fillStyle = 'rgba(8,12,20,0.85)'; g.fill();
    g.direction = 'ltr'; g.fillStyle = T > 50 ? ui.C.bad : T > 30 ? ui.C.mars : '#8fb8ff'; g.font = `800 ${H * 0.5}px ${ui.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${Math.round(T)}°C`, W * 0.25, H * 0.52);
    g.fillStyle = '#2a3a55'; g.fillRect(W * 0.45, H * 0.42, W * 0.48, H * 0.16);
    g.fillStyle = g.fillStyle = T > 50 ? ui.C.bad : T > 30 ? ui.C.mars : '#8fb8ff'; g.fillRect(W * 0.45, H * 0.42, W * 0.48 * Math.min(1, T / 70), H * 0.16);
  } });
  gauge.mesh.position.set(0, 0.4, 0.15); root.add(gauge.mesh);
  const setT = t => { T = t; gauge.redraw(); };

  await tween(900, k => { root.scale.setScalar(lerp(0.3, 1.15, k)); }, ease.out);
  await engine.fade(0, 600);

  // ---- phases ---- (?zoomhold keeps each phase on screen in tests)
  const hold = ms => ctx.params?.has('zoomhold') ? scope.guard(new Promise(r => setTimeout(r, 4000))) : scope.wait(ms);
  ctx.zoomPhase = 'cold';
  await scope.say('c4_cold'); await hold(2500);
  ctx.zoomPhase = 'warm';
  await tween(1500, k => { setT(lerp(15, 40, k)); speed = lerp(0.25, 1.1, k); });
  await scope.say('c4_warm'); await hold(2500);
  ctx.zoomPhase = 'hot';
  audio.sfx('sizzle');
  await tween(1500, k => { setT(lerp(40, 60, k)); speed = lerp(1.1, 1.5, k); });
  const r0 = chain.rotation.y % (Math.PI * 2);
  await tween(2600, k => { unfoldK = k; chain.rotation.y = r0 * (1 - k); rebuild(); }, ease.inOut);
  await scope.say('c4_hot'); await hold(0);
  await scope.say('c4_key');
  await scope.say('c4_key2');

  // ---- which picture explains the graph? ----
  const pic = kind => (g, x, y, w, h) => {
    g.strokeStyle = '#c062d6'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath();
    if (kind === 'unfold') { for (let i = 0; i <= 40; i++) { const t = i / 40; g.lineTo(x + t * w, y + h * 0.5 + Math.sin(t * 14) * h * 0.15); } g.stroke(); g.fillStyle = '#e0453a'; g.beginPath(); g.arc(x + w * 0.5, y + h * 0.15, 14, 0, 7); g.fill(); }
    else if (kind === 'evap') { g.strokeStyle = '#8fd0ff'; for (let i = 0; i < 3; i++) { g.moveTo(x + w * (0.25 + i * 0.25), y + h * 0.85); g.bezierCurveTo(x + w * (0.15 + i * 0.25), y + h * 0.6, x + w * (0.35 + i * 0.25), y + h * 0.4, x + w * (0.25 + i * 0.25), y + h * 0.15); } g.stroke(); }
    else { g.strokeStyle = '#bff8ff'; for (let i = 0; i < 5; i++) { g.moveTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + w * (0.5 + Math.cos(i * 1.25) * 0.45), y + h * (0.5 + Math.sin(i * 1.25) * 0.45)); } g.stroke(); }
  };
  const opts = [['unfold', 'הקטלאז משנה צורה ומי החמצן לא נכנסים', true], ['evap', 'מי החמצן מתאדים מהכוס', false], ['fast', 'הבועות זזות מהר מדי ובורחות', false]];
  let first = true, correctFirst = false, resolve;
  const answered = new Promise(r => { resolve = r; });
  await scope.say('c4_explain');
  const cards = opts.map(([kind, label, ok], i) => {
    const c = ui.card({ w: 0.3, h: 0.3, label, icon: pic(kind), fs: 24, onSelect: cc => {
      if (ok) { cc.setState('right'); audio.sfx('ok'); if (first) correctFirst = true; resolve(); }
      else { cc.setState('wrong'); audio.sfx('no'); first = false; }
    } });
    c.mesh.position.set((1 - i) * 0.34, -0.42, 0.25); root.add(c.mesh);
    return c;
  });
  if (ctx.auto) setTimeout(() => input.select(cards[0].mesh), 80);
  try {
    await scope.guard(answered);
    await scope.say('c4_explain_ok');
  } finally {
    // ---- back to the lab ----
    await engine.fade(1, 500);
    off(); cards.forEach(c => c.dispose()); gauge.dispose();
    scene.remove(root);
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    ctx.loco.setOffset(new THREE.Vector3());
    scene.background = saved.bg; scene.fog = saved.fog; scene.environment = saved.env;
    ctx.lab.root.visible = true; hidden.forEach(o => { o.visible = true; });
    ctx.zoomPhase = null;
    await engine.fade(0, 600);
  }
  return correctFirst;
}
