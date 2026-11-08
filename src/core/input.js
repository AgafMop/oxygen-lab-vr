// Unified pointing: XR controller rays (trigger = select, grip = grab) and desktop mouse/crosshair.
import * as THREE from 'three';

const HOVER_EMISSIVE = new THREE.Color(0x3cc4bc);

export function createInput(engine) {
  const { renderer, scene, camera } = engine;
  const handlers = new Map();          // Object3D -> {onSelect, onHover, grabbable, onGrab, onRelease}
  const targets = [];
  const ray = new THREE.Raycaster();
  ray.far = 12;
  let enabled = true;
  const tmpM = new THREE.Matrix4();

  // ---- registration & hover highlight ----
  function ownMaterials(obj) {
    obj.traverse(o => {
      if (!o.isMesh || o.userData.__ownMat) return;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      o.userData.__ownMat = true;
    });
  }
  function setHover(obj, on) {
    const h = handlers.get(obj);
    if (!h || h.hovered === on) return;
    h.hovered = on;
    if (!h.noHighlight) obj.traverse(o => {
      if (!o.isMesh || !o.material.emissive) return;
      if (on) { o.userData.__em = o.material.emissive.clone(); o.material.emissive.lerp(HOVER_EMISSIVE, 0.45); }
      else if (o.userData.__em) o.material.emissive.copy(o.userData.__em);
    });
    h.onHover?.(on);
  }
  function findTarget(o) { while (o && !handlers.has(o)) o = o.parent; return o; }
  function pick() {
    const hits = ray.intersectObjects(targets, true);
    for (const h of hits) {
      let o = h.object, visible = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { visible = false; break; }
      if (!visible) continue;
      const t = findTarget(o);
      if (t && handlers.get(t).enabled !== false) return { obj: t, point: h.point, distance: h.distance };
    }
    return null;
  }

  // ---- XR controllers ----
  const pointers = [];
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x9fe8e2, transparent: true, opacity: 0.7 }));
    line.scale.z = 3;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ctrl.add(line);
    engine.rig.add(ctrl);
    scene.add(dot);
    const grip = renderer.xr.getControllerGrip(i);
    engine.rig.add(grip);
    const p = { ctrl, grip, line, dot, hover: null, grabbed: null, source: null, handedness: null };
    ctrl.addEventListener('connected', e => { p.source = e.data; p.handedness = e.data.handedness; });
    ctrl.addEventListener('disconnected', () => { p.source = null; });
    ctrl.addEventListener('selectstart', () => enabled && p.hover && select(p.hover));
    ctrl.addEventListener('squeezestart', () => enabled && p.hover && grab(p, p.hover));
    ctrl.addEventListener('squeezeend', () => release(p));
    pointers.push(p);
  }

  function pulse(p, v = 0.25, ms = 25) {
    try { p.source?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch { /* no haptics */ }
  }

  // ---- desktop mouse ----
  const mouse = { ndc: new THREE.Vector2(0, 0), hover: null, grabbed: null, locked: false };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', e => {
    if (!mouse.locked) mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('click', e => {
    const dragged = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    if (dragged || e.detail > 1) return;          // a look-drag or the 2nd click of a double-click is not a selection
    if (enabled && !engine.isXR() && mouse.hover) select(mouse.hover);
  });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
    if (mouse.locked) mouse.ndc.set(0, 0);
    document.body.classList.toggle('locked', mouse.locked);
  });
  addEventListener('keydown', e => {
    if (e.code !== 'KeyE' || engine.isXR()) return;
    if (mouse.grabbed) release(mouse); else if (mouse.hover) grab(mouse, mouse.hover, camera);
  });

  function select(obj) {
    const h = handlers.get(obj);
    if (!h || h.enabled === false) return;
    h.onSelect?.(obj);
  }
  function grab(p, obj, holder = p.ctrl) {
    const h = handlers.get(obj);
    if (!h?.grabbable || h.enabled === false) return;
    if ([...pointers, mouse].some(q => q.grabbed?.obj === obj)) return;      // already in the other hand
    if (h.onGrab) {                                    // the owner attaches (lab handling)
      if (h.onGrab(obj, holder) === false) return;
      p.grabbed = { obj, managed: true };
    } else { p.grabbed = { obj, parent: obj.parent }; holder.attach(obj); }
    if (p !== mouse) pulse(p, 0.45, 40);
  }
  function release(p) {
    if (!p.grabbed) return;
    const { obj, parent, managed } = p.grabbed;
    p.grabbed = null;
    if (!managed) parent.attach(obj);
    handlers.get(obj)?.onRelease?.(obj);
  }
  // desktop press-and-drag of grabbable props (a drag that starts elsewhere still looks around)
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (!enabled || engine.isXR() || !drag || mouse.locked || e.button !== 0) return;
    const obj = mouse.hover; if (!obj || !handlers.get(obj)?.grabbable) return;
    mouse.pending = { obj, x: e.clientX, y: e.clientY };          // a click, unless the mouse moves while pressed
  });
  addEventListener('pointermove', e => {
    const p = mouse.pending; if (!p || mouse.grabbed) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    mouse.pending = null;
    drag.begin(); ray.setFromCamera(mouse.ndc, camera); drag.move(ray.ray);
    grab(mouse, p.obj, drag.holder);
  });
  addEventListener('pointerup', () => { mouse.pending = null; if (mouse.grabbed?.managed) release(mouse); });

  // ---- per-frame hover ----
  engine.onFrame(() => {
    if (engine.isXR()) {
      for (const p of pointers) {
        const visible = !!p.source && p.source.targetRayMode !== 'gaze';
        p.line.visible = visible; p.dot.visible = false;
        if (!visible) continue;
        tmpM.identity().extractRotation(p.ctrl.matrixWorld);
        ray.ray.origin.setFromMatrixPosition(p.ctrl.matrixWorld);
        ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
        const hit = enabled ? pick() : null;
        const obj = hit?.obj ?? null;
        if (obj !== p.hover) { if (p.hover) setHover(p.hover, false); if (obj) { setHover(obj, true); pulse(p); } p.hover = obj; }
        p.line.scale.z = hit ? hit.distance : 3;
        if (hit) { p.dot.visible = true; p.dot.position.copy(hit.point); }
      }
    } else {
      ray.setFromCamera(mouse.ndc, camera);
      if (mouse.grabbed && drag) drag.move(ray.ray);
      const hit = enabled ? pick() : null;
      const obj = hit?.obj ?? null;
      if (obj !== mouse.hover) { if (mouse.hover) setHover(mouse.hover, false); if (obj) setHover(obj, true); mouse.hover = obj; }
      canvas.style.cursor = obj ? 'pointer' : 'default';
    }
  });

  return {
    register(obj, opts) {
      if (!handlers.has(obj)) targets.push(obj);
      handlers.set(obj, { ...opts, hovered: false });
      if (!opts.noHighlight) ownMaterials(obj);
      return obj;
    },
    unregister(obj) {
      if (!handlers.has(obj)) return;
      setHover(obj, false);
      handlers.delete(obj);
      targets.splice(targets.indexOf(obj), 1);
      for (const p of [...pointers, mouse]) if (p.hover === obj) p.hover = null;
    },
    setEnabled(v) { enabled = v; },
    setTargetEnabled(obj, v) { const h = handlers.get(obj); if (h) h.enabled = v; },
    /** Desktop drag holder for grabbable props: { holder, begin(), move(ray) } or null. */
    setDragHolder(d) { drag = d; },
    /** Programmatic select (auto-play tests). */
    select,
    hovered: () => mouse.hover ?? pointers.find(p => p.hover)?.hover ?? null,
    pointers, mouse,
  };
}
