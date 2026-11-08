// Wind outside the windows: sand grains carried sideways and soft dust wisps rolling over the ground.
// Not a storm, just moving air. Everything lives outside the lab's walls (seen through the windows);
// it hides while the corridor is shown. Cheap enough for Quest: one Points cloud + a few sprites.
import * as THREE from 'three';

export function createWind(ctx, { grains = 2200, wisps = 40 } = {}) {
  const { engine, lab } = ctx;
  const room = new THREE.Box3();
  lab.root.traverse(o => { if (o.isMesh && /^LAB_static/.test(o.name)) room.expandByObject(o); });
  if (room.isEmpty()) room.setFromObject(lab.root);
  const inside = room.clone().expandByScalar(0.6);
  const area = room.clone().expandByVector(new THREE.Vector3(12, 0, 12));     // a band around the lab, where the windows look
  area.min.y = 0; area.max.y = 5;
  const wind = new THREE.Vector3(2.2, 0, 0.7);            // m/s, from the west
  const rnd = (a, b) => a + Math.random() * (b - a);
  const spot = (p, anyX = true) => {
    for (let k = 0; k < 20; k++) {
      p.set(anyX ? rnd(area.min.x, area.max.x) : area.min.x, Math.pow(Math.random(), 1.8) * 3.5, rnd(area.min.z, area.max.z));
      if (!inside.containsPoint(p)) return p;
    }
    return p.set(area.min.x, 0.3, area.min.z);
  };

  // ---- grains ----
  const pos = new Float32Array(grains * 3), phase = new Float32Array(grains), v = new THREE.Vector3();
  for (let i = 0; i < grains; i++) { spot(v); pos.set([v.x, v.y, v.z], i * 3); phase[i] = Math.random() * 100; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const grainsMesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe6b483, size: 0.09, map: dot, transparent: true, opacity: 0.9, depthWrite: false }));
  grainsMesh.frustumCulled = false; grainsMesh.name = 'windGrains';

  // ---- wisps: big soft sprites rolling low over the ground ----
  const wispMat = new THREE.SpriteMaterial({ map: dot, color: 0xc98b5a, transparent: true, opacity: 0.12, depthWrite: false });
  const wispList = [];
  const group = new THREE.Group(); group.name = 'wind'; group.add(grainsMesh);
  for (let i = 0; i < wisps; i++) {
    const s = new THREE.Sprite(wispMat.clone());
    spot(s.position); s.position.y = rnd(0.2, 1.4);
    const sc = rnd(1.5, 4); s.scale.set(sc * 2, sc, 1);
    s.material.opacity = rnd(0.1, 0.22);
    s.userData = { speed: rnd(0.6, 1.1), ph: Math.random() * 10 };
    group.add(s); wispList.push(s);
  }
  // a windsock on a pole outside the main window: the clearest sign that the air is moving
  const sock = new THREE.Group();
  { const c = room.getCenter(new THREE.Vector3());
    sock.position.set(c.x + 1.5, 0, room.min.z - 4.5);
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 10), metal); pole.position.y = 1.6;
    const cloth = new THREE.MeshStandardMaterial({ color: 0xe8643a, roughness: 0.8, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.09, 1.3, 16, 4, true), cloth);
    cone.rotation.z = -Math.PI / 2; cone.position.x = 0.65;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.13, 0.3, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, side: THREE.DoubleSide }));
    band.rotation.z = -Math.PI / 2; band.position.x = 0.62;
    const arm = new THREE.Group(); arm.position.y = 3.15; arm.add(cone, band); arm.name = 'windsockArm';
    sock.add(pole, arm); sock.userData.arm = arm; }
  group.add(sock);
  engine.scene.add(group);

  let t = 0;
  const off = engine.onFrame(dt => {
    group.visible = !ctx.corridorRoot?.visible;
    if (!group.visible) return;
    t += dt;
    const gust = 0.75 + 0.35 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 1.3);   // the air swells and settles
    for (let i = 0; i < grains; i++) {
      const j = i * 3, ph = phase[i];
      pos[j] += (wind.x * gust + Math.sin(t * 1.7 + ph) * 0.4) * dt;
      pos[j + 1] += (Math.sin(t * 2.3 + ph * 1.3) * 0.25 - 0.05) * dt;
      pos[j + 2] += (wind.z * gust + Math.cos(t * 1.1 + ph) * 0.4) * dt;
      v.set(pos[j], pos[j + 1], pos[j + 2]);
      if (v.x > area.max.x || v.z > area.max.z || v.y < 0 || v.y > 5 || inside.containsPoint(v)) {
        spot(v, false); if (Math.random() < 0.5) { v.z = area.min.z; v.x = rnd(area.min.x, area.max.x); if (inside.containsPoint(v)) v.x = area.min.x; }
        pos[j] = v.x; pos[j + 1] = v.y; pos[j + 2] = v.z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    const arm = sock.userData.arm;                       // points downwind, droops when the air settles, flutters in gusts
    arm.rotation.y = -Math.atan2(wind.z, wind.x) + Math.sin(t * 1.9) * 0.12 * gust;
    arm.rotation.z = -0.55 * (1.15 - gust) + Math.sin(t * 7.3) * 0.04 * gust;
    for (const s of wispList) {
      const u = s.userData;
      s.position.x += wind.x * gust * u.speed * dt; s.position.z += wind.z * gust * u.speed * dt;
      s.position.y = Math.max(0.15, s.position.y + Math.sin(t * 0.5 + u.ph) * 0.05 * dt);
      s.material.rotation += 0.05 * dt;
      if (s.position.x > area.max.x || s.position.z > area.max.z || inside.containsPoint(s.position)) { spot(s.position, false); s.position.y = rnd(0.2, 1.4); }
    }
  });
  return { group, dispose() { off(); engine.scene.remove(group); } };
}
