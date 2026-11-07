// Robi: hover-bob, glowing face with expressions, arm gestures, gliding moves that end facing the student.
import * as THREE from 'three';
import { makeTween, ease } from '../core/tween.js';

export function createRobi(ctx) {
  const { engine, lab } = ctx;
  const R = lab.robi;
  const root = R.R_root, head = R.R_head, armL = R.R_armL, armR = R.R_armR, thr = R.R_thruster;
  const tween = makeTween(engine, ctx.auto ? 8 : 1);

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

  const robi = {
    root,
    face(e) { expr = e; draw(); },
    async moveTo(target, { speed = 0.7 } = {}) {
      const to = target.isVector3 ? target.clone() : target.getWorldPosition(new THREE.Vector3());
      to.y = 0;
      const from = root.position.clone(); from.y = 0;
      const dist = from.distanceTo(to);
      if (dist < 0.01) return;
      const look = to.clone(); root.lookAt(look.x, root.position.y, look.z);
      await tween((dist / speed) * 1000, k => { root.position.x = from.x + (to.x - from.x) * k; root.position.z = from.z + (to.z - from.z) * k; });
      const head = engine.headPosition(new THREE.Vector3());
      const yaw0 = root.rotation.y;
      const tmp = root.clone(false); tmp.position.copy(root.position); tmp.lookAt(head.x, root.position.y, head.z);
      const yaw1 = tmp.rotation.y;
      await tween(400, k => { root.rotation.y = yaw0 + (yaw1 - yaw0) * k; });
    },
    /** Teleport next to a world point, facing the student. */
    placeNear(point, offset = new THREE.Vector3(0.6, 0, 0.2)) {
      root.position.set(point.x + offset.x, base.y, point.z + offset.z);
      const head = engine.headPosition(new THREE.Vector3());
      root.lookAt(head.x, root.position.y, head.z);
    },
    async gesture(kind) {
      if (kind === 'point') {
        await tween(350, k => { armR.rotation.x = -1.3 * k; }, ease.out);
        await ctx.audio.wait(700);
        await tween(350, k => { armR.rotation.x = -1.3 * (1 - k); });
      } else if (kind === 'wave') {
        await tween(300, k => { armR.rotation.z = 2.4 * k; });
        await tween(900, k => { armR.rotation.x = Math.sin(k * Math.PI * 4) * 0.35; }, ease.linear);
        await tween(300, k => { armR.rotation.z = 2.4 * (1 - k); armR.rotation.x = 0; });
      } else if (kind === 'shrug') {
        await tween(300, k => { armL.rotation.z = -0.7 * k; armR.rotation.z = 0.7 * k; head.rotation.z = 0.2 * k; });
        await ctx.audio.wait(500);
        await tween(300, k => { armL.rotation.z = -0.7 * (1 - k); armR.rotation.z = 0.7 * (1 - k); head.rotation.z = 0.2 * (1 - k); });
      }
    },
    setLooking(v) { looking = v; },
  };
  return robi;
}
