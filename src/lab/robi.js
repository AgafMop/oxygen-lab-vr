// Robi: hover-bob, glowing face with expressions, arm gestures, gliding moves that end facing the student.
import * as THREE from 'three';
import { makeTween, ease } from '../core/tween.js';
import { clearSpot, route } from './clearance.js';

const R_BODY = 0.18, R_HS = [0.45, 0.8];

export function createRobi(ctx) {
  const { engine, lab } = ctx;
  const R = lab.robi;
  const root = R.R_root, head = R.R_head, armL = R.R_armL, armR = R.R_armR, thr = R.R_thruster;
  const tween = makeTween(engine, ctx.animSpeed ?? (ctx.auto ? 8 : 1));

  // face screen (canvas) laid over R_face
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.125), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = 0.0035; R.R_face.add(face);
  let expr = 'happy', blink = 0;
  function draw() {
    g.fillStyle = '#041015'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = g.strokeStyle = '#5ff2e6'; g.lineWidth = 22; g.lineCap = 'round';
    const eye = (x) => {
      if (blink > 0) { g.beginPath(); g.moveTo(x - 46, 128); g.lineTo(x + 46, 128); g.stroke(); return; }
      switch (expr) {
        case 'happy': g.beginPath(); g.arc(x, 150, 50, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); break;
        case 'think': g.beginPath(); g.ellipse(x, 120, 30, x < 256 ? 40 : 18, 0, 0, 7); g.fill(); break;
        case 'oops': g.beginPath(); g.moveTo(x - 36, 92); g.lineTo(x + 36, 164); g.moveTo(x + 36, 92); g.lineTo(x - 36, 164); g.stroke(); break;
        case 'wow': g.beginPath(); g.arc(x, 128, 48, 0, 7); g.stroke(); g.beginPath(); g.arc(x, 128, 16, 0, 7); g.fill(); break;
        default: g.beginPath(); g.ellipse(x, 128, 30, 44, 0, 0, 7); g.fill();
      }
    };
    eye(170); eye(342);
    if (expr === 'wow') { g.beginPath(); g.ellipse(256, 215, 18, 22, 0, 0, 7); g.stroke(); }
    tex.needsUpdate = true;
  }
  draw();

  // idle: bob, thruster flicker, blink, gentle head look-at the player
  const base = { y: root.position.y };
  let t = 0, nextBlink = 2, looking = true;
  const headTarget = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  engine.onFrame(dt => {
    t += dt;
    root.position.y = base.y + Math.sin(t * 2.1) * 0.025;
    thr.scale.setScalar(0.9 + Math.random() * 0.2);
    if ((nextBlink -= dt) < 0) { blink = 0.12; nextBlink = 2 + Math.random() * 3; draw(); }
    if (blink > 0 && (blink -= dt) <= 0) draw();
    if (looking) {
      engine.headPosition(headTarget);
      const hp = head.getWorldPosition(new THREE.Vector3());
      m4.lookAt(headTarget, hp, new THREE.Vector3(0, 1, 0));
      tmpQ.setFromRotationMatrix(m4);
      const parentQ = head.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      tmpQ.premultiply(parentQ);
      head.quaternion.slerp(tmpQ, Math.min(1, dt * 3));
    }
  });

  let moveId = 0;
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  function turnTo(yaw, ms) {
    const y0 = root.rotation.y, d = wrap(yaw - y0);
    if (Math.abs(d) < 0.02) return Promise.resolve();
    root.rotation.x = 0; root.rotation.z = 0;
    return tween(ms * Math.min(1, Math.abs(d) / 1.2 + 0.3), k => { root.rotation.y = y0 + d * k; }, ease.inOut);
  }
  ctx.track?.(root, 'robi'); ctx.body?.(root, 'robi', 0.16, [0.45, 0.8]);
  const robi = {
    root,
    face(e) { expr = e; draw(); },
    /** Glide to a floor point: turn the short way, ease in and out with a slight lean, end facing the student. */
    async moveTo(target, { speed = 0.7 } = {}) {
      const to = target.isVector3 ? target.clone() : target.getWorldPosition(new THREE.Vector3());
      to.y = root.position.y;
      const id = ++moveId;
      // around furniture: the direct line when clear, else one detour corner; no clear route → hop (rare)
      const legs = route(ctx, root.position.clone(), to, R_BODY, R_HS) || [to];
      for (const leg of legs) {
        if (id !== moveId) return;
        const from = root.position.clone();
        const dx = leg.x - from.x, dz = leg.z - from.z, dist = Math.hypot(dx, dz);
        if (dist < 0.01) continue;
        await turnTo(Math.atan2(dx, dz), 350);
        await tween(Math.max(600, (dist / speed) * 1000), k => {
          if (id !== moveId) return;
          root.position.x = from.x + dx * k; root.position.z = from.z + dz * k;
          root.rotation.x = 0.14 * Math.sin(k * Math.PI);          // lean into the move
        }, ease.inOut);
        root.rotation.x = 0;
      }
      if (id !== moveId) return;
      const head = engine.headPosition(new THREE.Vector3());
      await turnTo(Math.atan2(head.x - root.position.x, head.z - root.position.z), 400);
    },
    /** Move next to a world point, facing the student: instant while hidden (fade/out of sight), a glide when seen. */
    placeNear(point, offset = new THREE.Vector3(0.6, 0, 0.2), { instant = false } = {}) {
      const to = clearSpot(ctx, new THREE.Vector3(point.x + offset.x, base.y, point.z + offset.z), R_BODY, R_HS);
      const far = root.position.distanceTo(to) > 3.5;              // another area (corridor, other end of the lab): arrive with the student
      if (!instant && !far && engine.fadeLevel() < 0.9 && root.visible && root.position.distanceTo(to) > 0.05) return robi.moveTo(to);
      moveId++;
      root.position.copy(to);
      const head = engine.headPosition(new THREE.Vector3());
      root.lookAt(head.x, root.position.y, head.z);
      return Promise.resolve();
    },
    async gesture(kind) {
      if (kind === 'point') {
        await tween(350, k => { armR.rotation.x = -1.3 * k; }, ease.out);
        await ctx.audio.wait(700);
        await tween(350, k => { armR.rotation.x = -1.3 * (1 - k); }, ease.inOut);
      } else if (kind === 'wave') {
        await tween(300, k => { armR.rotation.z = 2.4 * k; });
        await tween(900, k => { armR.rotation.x = Math.sin(k * Math.PI * 4) * 0.35; }, ease.linear);
        await tween(300, k => { armR.rotation.z = 2.4 * (1 - k); armR.rotation.x = 0; });
      } else if (kind === 'shrug') {
        await tween(300, k => { armL.rotation.z = -0.7 * k; armR.rotation.z = 0.7 * k; }, ease.out);
        await ctx.audio.wait(500);
        await tween(300, k => { armL.rotation.z = -0.7 * (1 - k); armR.rotation.z = 0.7 * (1 - k); }, ease.inOut);
      }
    },
    setLooking(v) { looking = v; },
  };
  return robi;
}
