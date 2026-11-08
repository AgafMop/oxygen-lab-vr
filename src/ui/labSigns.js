// Readable signs and live wall screens: bottle labels, goggles sign, base O2 screen, generator status screen.
import * as THREE from 'three';

export function createLabSigns(ctx) {
  const { ui, lab, game, engine, mood } = ctx;
  const F = ui.FONT, C = ui.C;
  const at = (mesh, pos, yaw) => { mesh.position.copy(pos); mesh.rotation.y = yaw; engine.scene.add(mesh); };

  // bottle labels (front of each bottle, facing the student)
  for (const [name, text, hazard] of [['P_bottle3', 'מי חמצן 3%', false], ['P_bottle30', 'מי חמצן 30%', true]]) {
    const p = ui.panel({ w: 0.07, h: 0.066, ppm: 5000, viewDist: 0.6, name: `label:${text}`, draw(g, W, H) {
      g.fillStyle = hazard ? '#f4d03f' : '#f2f2f2'; g.fillRect(0, 0, W, H);
      g.fillStyle = hazard ? '#a01010' : '#1b3a66'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const [name, pct] = text.split(' ').reduce((a, w, i, all) => i === all.length - 1 ? [a[0], w] : [(a[0] ? a[0] + ' ' : '') + w, a[1]], ['', '']);
      const rows = hazard ? [[name, 0.26], [pct, 0.3], ['⚠ מאכל!', 0.26]] : [[name, 0.3], [pct, 0.42]];
      const tot = rows.reduce((a, r) => a + r[1], 0); let y = (1 - tot) / 2 * H;
      for (const [t, k] of rows) { g.font = `800 ${H * k * 0.92}px ${F}`; g.fillText(t, W / 2, y + H * k / 2); y += H * k; }
    } });
    p.mesh.position.set(0, 0.055, 0.0385); lab.props[name].add(p.mesh);
  }

  if (lab.props.P_hazardDiamond) lab.props.P_hazardDiamond.visible = false;   // the yellow label carries the warning now

  // goggles sign above the rack (west wall, faces +x)
  const sign = ui.panel({ w: 0.86, h: 0.15, ppm: 1200, viewDist: 2.5, name: 'gogglesSign', draw(g, W, H) {
    g.fillStyle = '#f4d03f'; g.fillRect(0, 0, W, H); g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${H * 0.5}px ${F}`; g.fillText('🥽 חובה: משקפי מגן', W / 2, H / 2);
  } });
  at(sign.mesh, new THREE.Vector3(-3.845, 1.78, 2.0), Math.PI / 2);

  // base O2 screen by the door (south wall, faces -z toward the room)
  const door = lab.screens.door?.getWorldPosition(new THREE.Vector3());
  const o2s = ui.panel({ w: 0.5, h: 0.32, ppm: 1200, viewDist: 2.5, name: 'doorO2', draw(g, W, H, o2 = 360) {
    g.fillStyle = '#071318'; g.fillRect(0, 0, W, H);
    g.fillStyle = C.muted; g.textAlign = 'right'; g.textBaseline = 'middle'; g.font = `700 ${H * 0.2}px ${F}`; g.fillText('חמצן בבסיס', W - 24, H * 0.15);
    const k = Math.max(0, o2 / 360); g.fillStyle = '#1d2c3c'; g.fillRect(24, H * 0.33, W - 48, H * 0.14);
    g.fillStyle = k < 0.17 ? C.bad : C.oxy; g.fillRect(24, H * 0.33, (W - 48) * k, H * 0.14);
    g.direction = 'ltr'; g.textAlign = 'center'; g.fillStyle = C.ink; g.font = `800 ${H * 0.32}px ${F}`;
    g.fillText(`${String(Math.floor(o2 / 60)).padStart(2, '0')}:${String(Math.round(o2 % 60)).padStart(2, '0')}`, W / 2, H * 0.73);
  } });
  if (door) { at(o2s.mesh, door.add(new THREE.Vector3(0, 0, -0.006)), Math.PI); }
  game.on('o2', v => o2s.redraw(v)); o2s.redraw(game.s.o2);

  // generator status screen (west wall, faces +x)
  const gen = lab.screens.gen?.getWorldPosition(new THREE.Vector3());
  let last = -1;
  const gs = ui.panel({ w: 0.55, h: 0.38, ppm: 1100, viewDist: 2.5, name: 'genScreen', draw(g, W, H, k = 0) {
    g.fillStyle = '#071318'; g.fillRect(0, 0, W, H);
    g.fillStyle = C.muted; g.textAlign = 'right'; g.textBaseline = 'middle'; g.font = `700 ${H * 0.17}px ${F}`; g.fillText('מחולל גיבוי', W - 24, H * 0.13);
    g.fillStyle = k > 0.8 ? C.good : k > 0.3 ? C.mars : C.bad; g.font = `800 ${H * 0.2}px ${F}`;
    g.fillText(k > 0.8 ? 'תקין' : k > 0.3 ? 'חלש' : 'כמעט מושבת', W - 24, H * 0.38);
    for (let i = 0; i < 10; i++) { g.fillStyle = i / 10 < k ? (k > 0.8 ? C.good : C.mars) : '#1d2c3c'; g.fillRect(24 + i * (W - 48) / 10, H * 0.6, (W - 48) / 10 - 8, H * 0.28); }
  } });
  if (gen) at(gs.mesh, gen.add(new THREE.Vector3(0.006, 0, 0)), Math.PI / 2);
  engine.onFrame(() => { const k = Math.round(mood.state.gen * 20) / 20; if (k !== last) { last = k; gs.redraw(k); } });
}
