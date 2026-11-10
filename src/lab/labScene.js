// Loads the Blender-built lab, props and Robi; lightmap, environment, Mars view, dust.
import * as THREE from 'three';
import { glassify } from './looks.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const TUNE = {
  lightMapIntensity: 2 * Math.PI * 0.22,  // bake saved at 0.5 scale; tuned by eye (ACES)
  staticEnv: 0.08, detailEnv: 0.55, propEnv: 0.9, exposure: 1.0,
};

// where each prop sits (anchor + offset in three coords, metres)
const PLACE = {
  P_bath: ['A_bath'], P_flask: ['A_flask'], P_trough: ['A_trough'], P_cylinder: ['A_cylinder'],
  P_stand: ['A_trough', [-0.2, 0, 0.02]], P_thermometer: ['A_bath', [0.12, 0.02, 0.07]],
  // bottles pulled toward the centre, side by side just right of the bath's back corner (clear of its rim) so both read on desktop
  P_bottle3: ['A_bottle3', [-0.18, 0, -0.32]], P_bottle30: ['A_bottle30', [-0.2, 0, -0.08]], P_yeastJar: ['A_yeastJar'], P_spoon: ['A_spoon'],
  P_rod: ['A_rod'], P_stopperTube: ['A_stopperTube'], P_stopperSealed: ['A_stopperSealed'], P_timer: ['A_timer'],
  P_goggles: ['A_goggleRack', [0.08, 0.02, 0]],        // on the rack, where the line sends the student (highlighted while needed)
  P_generatorTank: ['A_generator'], P_generatorGlass: ['A_generator'], P_generatorLiquid: ['A_generator'],
  P_generatorConsole: ['A_generator', [1.45, 0, 0.85], Math.PI / 2 + 0.5],   // beside the window, not in front of it
};

export async function loadLab(engine, base = 'assets/') {
  const { scene, renderer } = engine;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();
  const [lab, props, robi, lightmap, pano, crew, crewF] = await Promise.all([
    loader.loadAsync(base + 'lab.glb'), loader.loadAsync(base + 'props.glb'), loader.loadAsync(base + 'robi.glb'),
    texLoader.loadAsync(base + 'lab_lightmap.webp'), texLoader.loadAsync(base + 'mars_pano.webp'),
    loader.loadAsync(base + 'crew.glb'), loader.loadAsync(base + 'crew_f.glb'),
  ]);

  // ---- environment & background ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pano.mapping = THREE.EquirectangularReflectionMapping;
  pano.colorSpace = THREE.SRGBColorSpace;
  scene.background = pano;
  scene.backgroundRotation.set(0, Math.PI / 2, 0);
  scene.backgroundIntensity = 1.0;

  // ---- lab ----
  lightmap.flipY = false;
  lightmap.channel = 1;
  lightmap.colorSpace = THREE.SRGBColorSpace;
  const root = lab.scene;
  const anchors = {}, stationNodes = {}, discs = {}, screens = {}, alarms = [];
  root.traverse(o => {
    if (o.name.startsWith('A_')) anchors[o.name] = o;
    else if (o.name.startsWith('ST_')) stationNodes[o.name.slice(3)] = o;
    else if (o.name.startsWith('TP_')) discs[o.name.slice(3)] = o;
    else if (o.name.startsWith('SCR_')) screens[o.name.slice(4)] = o;
    else if (o.name.startsWith('FX_alarm')) alarms.push(o);
    if (!o.isMesh) return;
    let p = o; while (p && !p.name.startsWith('LAB_')) p = p.parent;
    const group = p?.name.replace(/_\d+$/, '');   // multi-material meshes split into LAB_static_1, _2 …
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (group === 'LAB_static') {
        m.lightMap = lightmap; m.lightMapIntensity = TUNE.lightMapIntensity; m.envMapIntensity = TUNE.staticEnv;
      } else if (group === 'LAB_detail') m.envMapIntensity = TUNE.detailEnv;
    }
  });
  scene.add(root);

  // window glass (subtle reflection over the Mars view)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.8), new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.07, envMapIntensity: 1.2, depthWrite: false }));
  glass.position.set(0, 1.85, -2.96);
  scene.add(glass);

  // ---- props ----
  const P = {};
  props.scene.traverse(o => { if (o.name.startsWith('P_')) P[o.name] = o; });
  const subs = [];
  for (const [name, o] of Object.entries(P)) {
    o.traverse(m => {
      if (!m.isMesh) return;
      m.material.envMapIntensity = TUNE.propEnv;
      if (o.userData.glass) Object.assign(m.material, {
        transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8 });
      if (o.userData.glass) glassify(m.material);
      if (o.userData.glass) m.renderOrder = 2;
    });
    if (o.userData.parent) { subs.push(o); continue; }
    const pl = PLACE[name];
    if (!pl) continue;
    const a = anchors[pl[0]];
    a.add(o);
    o.position.set(...(pl[1] || [0, 0, 0]));
    o.rotation.set(0, pl[2] || 0, 0);
  }
  for (const o of subs) {
    const parent = P[o.userData.parent];
    if (!parent) continue;
    parent.add(o);
    o.position.fromArray(o.userData.offset3);
  }

  // ---- Robi ----
  const R = {};
  robi.scene.traverse(o => { if (o.name.startsWith('R_')) R[o.name] = o; o.isMesh && (o.material.envMapIntensity = 1.0); });
  const robiRoot = R.R_root;
  robiRoot.position.set(1.0, 0, -0.97);          // starts beside the student's bench (clear floor)
  scene.add(robiRoot);
  const face = stationNodes.robot.getWorldPosition(new THREE.Vector3()); face.y = 0;
  robiRoot.lookAt(face);

  // red alarm light: added at load (intensity 0) so turning it on later doesn't recompile every shader
  const alarmLight = new THREE.PointLight(0xff2a14, 0, 14, 1.4);
  alarmLight.position.set(0, 2.6, 0);
  scene.add(alarmLight);

  // ---- dust motes ----
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 7.4, Math.random() * 2.8 + 0.1, (Math.random() - 0.5) * 5.6], i * 3);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd8b0, size: 0.012, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(dust);
  engine.onFrame(dt => {
    const a = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { a[i * 3 + 1] += dt * 0.015 * Math.sin(i + performance.now() * 0.0002); }
    dustGeo.attributes.position.needsUpdate = true;
  });

  // safety goggles: a recognisable pair — curved tinted visor, dark frame, orange strap — standing up, facing the student
  if (P.P_goggles) {
    const G = P.P_goggles;
    G.children.forEach(c => { c.visible = false; });
    const pair = new THREE.Group();
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.44),
      glassify(new THREE.MeshStandardMaterial({ color: 0x7fdcd4, transparent: true, opacity: 0.6, roughness: 0.05, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }), { rim: 0.7 }));
    visor.scale.set(0.085, 0.07, 0.05);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.5 }));
    rim.scale.set(0.084, 0.046, 1); rim.position.z = 0.0;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 8, 48, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8643a, roughness: 0.6 }));
    strap.position.z = -0.01;                        // the strap arches up over the hook
    pair.add(visor, rim, strap);
    G.add(pair);
    G.updateWorldMatrix(true, false);
    pair.quaternion.copy(G.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));   // hanging upright on the rack (wall faces +x), visor toward the room
    pair.scale.setScalar(1.3 / G.getWorldScale(new THREE.Vector3()).x);
    pair.position.set(0, 0.03 / G.getWorldScale(new THREE.Vector3()).y, 0);
    G.userData.glass = false;
  }
  // the stirring rod: tinted, more solid glass so it reads on the white bench (clear glass all but vanished)
  P.P_rod?.traverse(o => { if (o.isMesh) {
    o.material = new THREE.MeshStandardMaterial({ color: 0x2c5566, transparent: true, opacity: 0.9, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.4 });
    o.renderOrder = 2; } });
  if (P.P_rod) { P.P_rod.scale.y *= 1.6; P.P_rod.scale.z *= 1.6; }      // thicker (it lies along its local x)
  return { root, anchors, stationNodes, discs, screens, alarms, props: P, robi: R, glass, dust, crewScene: crew.scene, crewFScene: crewF.scene, alarmLight };
}
