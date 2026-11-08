// Chapter 6: the life corridor — the same enzyme in the clinic, the kitchen, first aid and the laundry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { TUNE } from '../lab/labScene.js';
import { createFigure } from '../lab/crew.js';
import { boardAtStation } from './kit.js';

const CASES = [
  { id: 'fever', answers: [['האנזימים בגוף משנים צורה', true], ['הדם מתחיל לרתוח', false], ['הלב מתעייף מהר', false]], pose: 'lying' },
  { id: 'bread', answers: [['החום שינה את צורת האנזימים בשמרים', true], ['חסר סוכר בבצק', false], ['מים רותחים כבדים מדי', false]], pose: 'stand' },
  { id: 'wound', answers: [['קטלאז בתאי הגוף מפרק את מי החמצן', true], ['מי החמצן רותחים על העור', false], ['חיידקים מתפוצצים', false]], pose: 'stand' },
  { id: 'wash', answers: [['האנזימים באבקה יאבדו את צורתם', true], ['האבקה לא תימס במים חמים', false], ['הבגדים יתייבשו מהר מדי', false]], pose: 'stand' },
];

let corridor = null;
async function loadCorridor(ctx) {
  if (corridor) return corridor;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [g, lm] = await Promise.all([loader.loadAsync('assets/corridor.glb'), new THREE.TextureLoader().loadAsync('assets/corridor_lightmap.webp')]);
  lm.flipY = false; lm.channel = 1; lm.colorSpace = THREE.SRGBColorSpace;
  const nodes = {};
  g.scene.traverse(o => {
    if (/^(ST_|A_|TP_)/.test(o.name)) nodes[o.name] = o;
    if (!o.isMesh) return;
    let p = o; while (p && !p.name.startsWith('CORR_')) p = p.parent;
    const m = o.material;
    if (p?.name.replace(/_\d+$/, '') === 'CORR_static') { m.lightMap = lm; m.lightMapIntensity = TUNE.lightMapIntensity; m.envMapIntensity = TUNE.staticEnv; }
    else m.envMapIntensity = TUNE.detailEnv;
  });
  ctx.engine.scene.add(g.scene); ctx.corridorRoot = g.scene;
  corridor = { root: g.scene, nodes };
  ctx.loco.addStation('corr', nodes.ST_corr, nodes.TP_corr);
  for (let i = 1; i <= 4; i++) ctx.loco.addStation(`case${i}`, nodes[`ST_case${i}`], nodes[`TP_case${i}`]);
  return corridor;
}

export async function run(ctx, scope) {
  const { loco, robi, game, audio, ui, input, engine } = ctx;
  let cor;
  try { cor = await scope.guard(loadCorridor(ctx)); }
  catch (e) { if (scope.aborted) throw e; console.warn('corridor failed to load', e); return; }
  cor.root.visible = true;
  loco.setArea?.({ x0: 18.9, x1: 21.1, z0: 0.3, z1: 10.8, blocks: [] });
  scope.add(() => loco.setArea?.(null));
  // Robi crosses to the corridor while the screen is dark, together with the student
  await engine.fade(1, 250);
  await loco.goTo('corr', { fade: false });
  robi.placeNear(loco.stations.corr.pos, new THREE.Vector3(0.6, 0, 0.9), { instant: true });
  await engine.nextFrame();
  await engine.fade(0, 300);
  await scope.say('c6_intro');

  let firstTryCorrect = 0;
  for (const [i, cs] of CASES.entries()) {
    const sid = `case${i + 1}`;
    await loco.goTo(sid);
    const s = loco.stations[sid];
    const a = cor.nodes[`A_case${i + 1}`].getWorldPosition(new THREE.Vector3());
    robi.placeNear(s.pos, new THREE.Vector3(0, 0, -0.7));
    const fig = scope.add(createFigure(ctx, { tint: i % 2 ? 0xe7efe9 : 0xefe7df }));
    if (cs.pose === 'lying') {
      // on the mattress (bed centred on the anchor, pillow toward -z): feet at +0.85, lying on the back
      fig.show(new THREE.Vector3(a.x, 0.88, a.z + 0.85), null);
      fig.root.rotation.set(-Math.PI / 2, 0, 0);
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.0), new THREE.MeshStandardMaterial({ color: 0x9fc3d6, roughness: 0.9 }));
      blanket.position.set(a.x, 0.97, a.z + 0.38); engine.scene.add(blanket);
      const breathe = engine.onFrame(() => { blanket.position.y = 0.97 + Math.sin(performance.now() * 0.0025) * 0.004; });
      scope.add(() => { breathe(); engine.scene.remove(blanket); blanket.geometry.dispose(); blanket.material.dispose(); ctx.patientVisible = false; });
      ctx.patientVisible = true;
    } else fig.show(new THREE.Vector3(a.x, 0, a.z + 0.55), s.pos);
    await scope.say(`c6_${cs.id}_q`);
    const b = boardAtStation(ctx, scope, sid, { dist: 0.75, height: 1.15 });
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    let first = true, done;
    const answered = new Promise(r => { done = r; });
    const cards = order.map((k, j) => {
      const [label, ok] = cs.answers[k];
      const c = scope.add(ui.card({ w: 0.42, h: 0.085, label, onSelect: cc => {
        if (cc.state === 'right') return;
        if (ok) { cc.setState('right'); audio.sfx('ok'); done(); }
        else { cc.setState('wrong'); audio.sfx('no'); first = false; audio.say('c6_wrong'); }
      } }));
      c.mesh.position.set(0, 0.1 - j * 0.1, 0.01); b.add(c.mesh);
      return c;
    });
    if (ctx.auto) setTimeout(() => input.select(cards[order.indexOf(0)].mesh), 60);
    await scope.guard(answered);
    if (first) firstTryCorrect++;
    if (first) game.addScore(100);   // comprehension, not a lab decision: bonus only, no star penalty
    robi.face('wow');
    await scope.say(`c6_${cs.id}_why`);
    robi.face('happy');
    cards.forEach(c => c.dispose()); fig.dispose();
  }
  if (firstTryCorrect >= 3) game.award('lifeScience');
  await scope.say('c6_done');
  loco.setArea?.(null);
  await loco.goTo('bench');
  cor.root.visible = false;
}
