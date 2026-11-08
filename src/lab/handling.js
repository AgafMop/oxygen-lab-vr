// Physical handling of bench tools: pick up (XR grip / desktop press-drag / test virtual hand), pour by tilting,
// spoon yeast, stir in circles, plug the stopper, dip the cylinder. Emits the same procedure actions chapter 2 handles.
import * as THREE from 'three';
import { tiltOf, pourRate, createStir, near } from '../game/handActions.js';
import { makeTween, ease } from '../core/tween.js';

const UP = new THREE.Vector3(0, 1, 0);

export function createHandling(ctx, app, { onAction }) {
  const { engine, input, lab, audio } = ctx;
  const { scene } = engine;
  const P = lab.props;
  const tween = makeTween(engine, ctx.animSpeed ?? (ctx.auto ? 8 : 1));
  const realTween = makeTween(engine, 1);      // stirring circles keep real speed so each frame's angle step stays small
  const TOOLS = [
    { obj: P.P_bottle3, kind: 'pour', bottle: '3', len: 0.15 },
    { obj: P.P_bottle30, kind: 'pour', bottle: '30', len: 0.15 },
    { obj: P.P_spoon, kind: 'spoon', len: 0.0 },
    { obj: P.P_rod, kind: 'stir', len: 0.0 },
    { obj: P.P_stopperTube, kind: 'stopper', stopper: 'tube', len: 0 },
    { obj: P.P_stopperSealed, kind: 'stopper', stopper: 'sealed', len: 0 },
    { obj: P.P_cylinder, kind: 'cylinder', len: 0 },
  ].filter(t => t.obj);
  const byObj = new Map(TOOLS.map(t => [t.obj, t]));
  ctx.handLog = [];
  let enabled = false, held = null, hintSaid = false;

  // ---- visuals: pour stream, spoon heap, stir ring, target ghost ----
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 1, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.6, roughness: 0.1 }));
  stream.visible = false; scene.add(stream);
  const heap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.95 }));
  heap.scale.y = 0.5; heap.visible = false; P.P_spoon?.add(heap);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3cc4bc, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.065, 48, 1, 0, 0.001), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 50; ring.visible = false; scene.add(ring);
  const ghost = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 8, 40), new THREE.MeshBasicMaterial({ color: 0x9fe8e2, transparent: true, opacity: 0.6 }));
  ghost.rotation.x = Math.PI / 2; ghost.visible = false; scene.add(ghost);

  const wp = o => o.getWorldPosition(new THREE.Vector3());
  const mouth = () => app.flaskMouth();
  const horiz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const upOf = o => UP.clone().applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
  const targetOf = t => t.kind === 'spoon' ? (t.loaded ? mouth() : wp(app.jar).add(new THREE.Vector3(0, 0.08, 0)))
    : t.kind === 'cylinder' ? wp(app.props.trough).add(new THREE.Vector3(0, 0.06, 0)) : mouth();

  // ---- holders ----
  const dragHolder = new THREE.Object3D(); scene.add(dragHolder);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const rc = new THREE.Raycaster();
  let deskTilt = 0;

  function grab(obj, holder) {
    const t = byObj.get(obj);
    if (!enabled || !t || held) return false;
    held = { t, holder, stir: createStir(), tried: new Set(), started: performance.now() };
    t.loaded = false;
    app.remember(obj); obj.userData.moveId = (obj.userData.moveId || 0) + 1;   // grabbing cancels a return home in progress
    holder.attach(obj);
    ghost.visible = true;
    audio.sfx('click');
    return true;
  }
  async function release(sendHome = true) {
    if (!held) return;
    const { t } = held; held = null;
    stream.visible = false; ring.visible = false; ghost.visible = false;
    scene.attach(t.obj);
    if (sendHome) await app.goHome(t.obj);
  }

  // XR + desktop through input.js: grip/drag grabs, release on squeeze-end/pointer-up
  for (const t of TOOLS) {
    input.register(t.obj, {
      grabbable: true,
      onGrab: (obj, holder) => grab(obj, holder),
      onRelease: () => { if (held?.t.obj === t.obj) dropAt(); },
      onSelect: () => {                                    // a plain click: show what to do instead
        if (!enabled) return;
        app.hint(t.obj);
        if (!hintSaid) { hintSaid = true; audio.say('c2_grab_hint'); }
      },
    });
  }
  input.setDragHolder?.({
    holder: dragHolder,
    // the cursor picks a point at flask-mouth height (so "over the flask" is where the cursor is); the tool floats 10 cm above it
    begin: () => { plane.constant = -mouth().y; deskTilt = 0; },
    move: ray => {
      const p = new THREE.Vector3();
      if (!ray.intersectPlane(plane, p)) return;
      dragHolder.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
    },
  });

  // dropping: stopper/cylinder snap when close; everything else floats home
  async function dropAt() {
    const t = held?.t; if (!t) return;
    const pos = wp(t.obj);
    if (t.kind === 'stopper' && near(pos, mouth(), 0.06)) {
      await release(false);
      const r = await act({ type: 'stopper', kind: t.stopper }, true);
      if (!r?.ok) await app.goHome(t.obj);
      return;
    }
    if (t.kind === 'cylinder' && horiz(pos, wp(app.props.trough)) < 0.16) {
      await release(true);
      await act({ type: 'fillCylinder' });
      return;
    }
    await release(true);
  }

  async function act(a, physicalSnap = false) {
    ctx.handLog.push(a.type);
    return onAction(a, { physical: true, snap: physicalSnap });
  }

  // ---- per frame while holding ----
  engine.onFrame(dt => {
    if (!held) return;
    const { t, holder } = held, o = t.obj;
    const m = mouth(), pos = wp(o);
    ghost.position.copy(targetOf(t)); ghost.scale.setScalar(1 + 0.15 * Math.sin(performance.now() * 0.008));

    if (!engine.isXR() && holder === dragHolder) {
      // desktop: over the flask a bottle tips and pours, the rod dips in; elsewhere tools stay upright
      const over = horiz(wp(holder), m) < 0.07;
      const want = t.kind === 'pour' && over ? 1.9 : t.kind === 'spoon' && t.loaded && over ? 1.2 : 0;
      deskTilt += (want - deskTilt) * Math.min(1, dt * 4);
      if (t.kind === 'pour') { o.rotation.set(0, 0, deskTilt); o.position.set(t.len * Math.sin(deskTilt), 0.03 - t.len * Math.cos(deskTilt), 0); }  // pivot at the spout
      else if (t.kind === 'stir') { o.rotation.set(0, 0, Math.PI / 2); o.position.set(0, over ? -0.05 : 0.02, 0); }
      else { o.rotation.set(0, 0, deskTilt); o.position.set(0, -0.04, 0); }
    }

    if (t.kind === 'pour') {
      const up = upOf(o), tilt = tiltOf(up);
      const spout = pos.clone().addScaledVector(up, t.len);
      const r = pourRate(tilt, horiz(spout, m));
      if (r.rate > 0) {
        const floorY = r.over ? m.y - 0.02 : pos.y - 0.25;
        const h = Math.max(0.02, spout.y - floorY);
        stream.visible = true; stream.scale.y = h; stream.position.set(spout.x, spout.y - h / 2, spout.z);
        if (r.over) {
          if (!held.tried.has('pour')) {
            held.tried.add('pour');
            held.pourOk = null;
            act({ type: 'pour', bottle: t.bottle }).then(res => { if (held?.t === t) held.pourOk = !!res?.ok; });
          }
          if (held.pourOk) {
            const full = app.fillFlask(r.rate * dt / 20);       // the mark is 20 ml: stops by itself
            if (full) stream.visible = false;
          }
        }
      } else stream.visible = false;
    }

    if (t.kind === 'spoon') {
      if (!t.loaded && near(pos, wp(app.jar).add(new THREE.Vector3(0, 0.06, 0)), 0.07)) { t.loaded = true; heap.visible = true; audio.sfx('click'); }
      if (t.loaded && horiz(pos, m) < 0.06 && pos.y < m.y + 0.09) {
        t.loaded = false; heap.visible = false;
        app.dropYeast();
        act({ type: 'yeast' });
      }
    }

    if (t.kind === 'stir') {
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
      const a1 = pos.clone().addScaledVector(axis, 0.1), a2 = pos.clone().addScaledVector(axis, -0.1);
      const tip = a1.y < a2.y ? a1 : a2;                   // the rod lies along its local x, centred: the lower end stirs
      const inside = horiz(tip, m) < 0.045 && tip.y < m.y;
      const p = held.stir.feed(Math.atan2(tip.x - m.x, tip.z - m.z), inside);
      ring.visible = inside || p > 0; ring.position.set(m.x, m.y + 0.01, m.z);
      ring.geometry.dispose(); ring.geometry = new THREE.RingGeometry(0.055, 0.065, 48, 1, 0, Math.max(0.001, p * Math.PI * 2));
      app.stirTint(p);
      if (p >= 1 && !held.tried.has('stir')) { held.tried.add('stir'); act({ type: 'stir' }); release(true); }
    }

    if (t.kind === 'stopper' && holder !== dragHolder && near(pos, m, 0.04)) dropAt();      // XR: plugs on contact
    if (t.kind === 'cylinder' && holder !== dragHolder && horiz(pos, wp(app.props.trough)) < 0.12 && pos.y < wp(app.props.trough).y + 0.1) dropAt();
  });

  // ---- test driver: a virtual hand that moves tools along tweened paths (same code paths as a real hand) ----
  function virtualHand() {
    const h = new THREE.Object3D(); scene.add(h);
    return {
      async grab(obj) {
        h.position.copy(wp(obj)); h.quaternion.identity();
        if (!grab(obj, h)) throw new Error('grab refused');
        if (byObj.get(obj).kind === 'stir') { obj.rotation.set(0, 0, Math.PI / 2); obj.position.set(0, 0, 0); }   // rod held upright
      },
      moveTo(to, ms = 500) { const from = h.position.clone(); return tween(ms, k => h.position.lerpVectors(from, to, k), ease.inOut); },
      tilt(rad, ms = 400) { const r0 = h.rotation.z; return tween(ms, k => { h.rotation.z = r0 + (rad - r0) * k; }); },
      circle(center, turns = 3.3, ms = 1600, r = 0.02) {
        return realTween(ms, k => { const a = k * turns * Math.PI * 2; h.position.set(center.x + Math.sin(a) * r, center.y, center.z + Math.cos(a) * r); }, ease.linear);
      },
      async release() { if (held?.holder === h) await dropAt(); },
      get holding() { return held?.holder === h; },
    };
  }

  return {
    enable(v) { enabled = v; if (!v && held) release(true); },
    virtualHand,
    get held() { return held?.t.obj ?? null; },
    dispose() { if (held) release(false); for (const t of TOOLS) input.unregister(t.obj); scene.remove(stream, ring, ghost, dragHolder); input.setDragHolder?.(null); },
  };
}
