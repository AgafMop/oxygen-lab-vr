// Stations + teleport, snap turn, optional smooth move, recenter, seated height; desktop WASD + mouse look.
import * as THREE from 'three';
import { seatedRigOffset, BENCH_TOP, SEAT_GAP } from './seated.js';

const ROOM = { x0: -3.7, x1: 3.7, z0: -2.7, z1: 2.7 };
// floor-plan obstacles in three coords (x0, x1, z0, z1)
const BLOCKS = [[-1.25, 1.25, -1.9, -0.95], [2.5, 3.35, -1.35, 0.25], [3.45, 4, -2.9, -1.1], [0.2, 2.6, 2.4, 3]];
const DESK_EYE = BENCH_TOP + SEAT_GAP;

export function createLocomotion(engine, input) {
  const { rig, camera, renderer } = engine;
  const stations = {};
  let current = null, smooth = false, turnLatch = false, yaw = 0, pitch = -0.12;
  const keys = new Set();
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');

  camera.position.set(0, DESK_EYE, 0);
  camera.rotation.order = 'YXZ';

  function headLocal() {
    if (!engine.isXR()) return { x: 0, z: 0, yaw: 0 };
    const xrCam = renderer.xr.getCamera();
    // pose of the head relative to the rig
    const inv = rig.matrixWorld.clone().invert();
    const m = xrCam.matrixWorld.clone().premultiply(inv);
    v.setFromMatrixPosition(m); q.setFromRotationMatrix(m); e.setFromQuaternion(q, 'YXZ');
    return { x: v.x, y: v.y, z: v.z, yaw: e.y };
  }

  function place(pos, targetYaw) {
    const h = headLocal();
    const rigYaw = targetYaw - h.yaw;
    rig.rotation.set(0, rigYaw, 0);
    const off = new THREE.Vector3(h.x, 0, h.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rigYaw);
    rig.position.x = pos.x - off.x;
    rig.position.z = pos.z - off.z;
    if (!engine.isXR()) { yaw = 0; camera.rotation.set(pitch, 0, 0); }
  }

  function calibrateHeight() {
    const h = headLocal();
    if (h.y) rig.position.y = seatedRigOffset(h.y);
  }

  const loco = {
    stations,
    get current() { return current; },
    addStation(id, node, disc) {
      const p = node.getWorldPosition(new THREE.Vector3());
      stations[id] = { pos: p, yaw: node.userData.yaw ?? 0, disc };
      if (disc) input.register(disc, { onSelect: () => loco.goTo(id), noHighlight: false });
    },
    async goTo(id, { fade = true } = {}) {
      const s = stations[id];
      if (!s) throw new Error(`no station ${id}`);
      if (fade) await engine.fade(1, 180);
      place(s.pos, s.yaw);
      current = id;
      for (const [k, st] of Object.entries(stations)) if (st.disc) st.disc.visible = k !== id;
      if (fade) await engine.fade(0, 220);
    },
    recenter() {
      calibrateHeight();
      if (current) place(stations[current].pos, stations[current].yaw);
    },
    setSmooth(on) { smooth = on; },
    get smooth() { return smooth; },
  };

  renderer.xr.addEventListener('sessionstart', () => {
    let n = 0;
    const off = engine.onFrame(() => { if (++n === 30) { off(); loco.recenter(); } });
  });
  renderer.xr.addEventListener('sessionend', () => { rig.position.y = 0; camera.position.set(0, DESK_EYE, 0); });

  // ---- desktop controls ----
  const canvas = renderer.domElement;
  addEventListener('keydown', ev => {
    keys.add(ev.code);
    const n = { Digit1: 'entry', Digit2: 'bench', Digit3: 'robot', Digit4: 'generator' }[ev.code];
    if (n && stations[n] && !engine.isXR()) loco.goTo(n);
  });
  addEventListener('keyup', ev => keys.delete(ev.code));
  canvas.addEventListener('dblclick', () => { if (!engine.isXR() && canvas.requestPointerLock) canvas.requestPointerLock(); });
  let drag = null;
  canvas.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, moved: 0 }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', ev => {
    if (engine.isXR()) return;
    let dx = 0, dy = 0;
    if (input.mouse.locked) { dx = ev.movementX; dy = ev.movementY; }
    else if (drag && ev.buttons) { dx = ev.clientX - drag.x; dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; }
    yaw -= dx * 0.0035; pitch = Math.max(-1.2, Math.min(1.1, pitch - dy * 0.0035));
  });

  function blocked(x, z) {
    if (x < ROOM.x0 || x > ROOM.x1 || z < ROOM.z0 || z > ROOM.z1) return true;
    return BLOCKS.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  }
  function move(dx, dz) {
    const nx = rig.position.x + dx, nz = rig.position.z + dz;
    if (!blocked(nx, rig.position.z)) rig.position.x = nx;
    if (!blocked(rig.position.x, nz)) rig.position.z = nz;
  }

  engine.onFrame(dt => {
    if (!engine.isXR()) {
      rig.rotation.y += yaw; yaw = 0;
      camera.rotation.set(pitch, 0, 0);
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if (f || s) {
        const a = rig.rotation.y, sp = 1.6 * dt;
        move((-Math.sin(a) * f + Math.cos(a) * s) * sp, (-Math.cos(a) * f - Math.sin(a) * s) * sp);
      }
      return;
    }
    const session = renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp || gp.axes.length < 4) continue;
      const ax = gp.axes[2], ay = gp.axes[3];
      if (src.handedness === 'right') {
        if (!turnLatch && Math.abs(ax) > 0.7) {
          turnLatch = true;
          const head = engine.headPosition(new THREE.Vector3());
          const ang = -Math.sign(ax) * Math.PI / 6;
          rig.position.sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(head);
          rig.rotation.y += ang;
        } else if (Math.abs(ax) < 0.3) turnLatch = false;
        if (gp.buttons[3]?.pressed && !loco.__rc) { loco.__rc = true; loco.recenter(); }
        if (!gp.buttons[3]?.pressed) loco.__rc = false;
      } else if (src.handedness === 'left' && smooth && (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15)) {
        const h = new THREE.Euler().setFromQuaternion(renderer.xr.getCamera().getWorldQuaternion(q), 'YXZ').y;
        const sp = 1.4 * dt;
        move((Math.cos(h) * ax + Math.sin(h) * ay) * sp, (-Math.sin(h) * ax + Math.cos(h) * ay) * sp);
      }
    }
  });

  return loco;
}
