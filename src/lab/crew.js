// Suited crew figures (Azoulay, crew in the corridor) and the commander hologram. No faces: dark visors.
import * as THREE from 'three';
import { makeTween, ease } from '../core/tween.js';

export function createFigure(ctx, { hologram = false, tint = null } = {}) {
  const { engine, lab } = ctx;
  const tween = makeTween(engine, ctx.auto ? 8 : 1);
  const root = lab.crewScene.clone(true);
  const N = {}; root.traverse(o => { const k = o.name.replace(/_\d+$/, ''); if (o.name.startsWith('C_') && !N[k]) N[k] = o; });  // parent group wins over its _1/_2 primitives
  const fig = N.C_root || root;
  const holo = new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = hologram ? holo : o.material.clone();
    if (!hologram) o.material.envMapIntensity = 1.0;
    if (tint && !hologram && o.material.name === 'M_suit') o.material.color.set(tint);
  });
  let pad = null;
  if (hologram) {
    pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.01; root.add(pad);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 0.95; root.add(beam);
  }
  root.visible = false;
  engine.scene.add(root);

  let walking = 0, t = 0;
  const off = engine.onFrame(dt => {
    t += dt;
    if (hologram) holo.opacity = 0.34 + 0.08 * Math.sin(t * 9) + (Math.random() < 0.02 ? -0.25 : 0);
    if (walking) {
      const s = Math.sin(t * 7) * 0.5 * walking;
      N.C_legL.rotation.x = s; N.C_legR.rotation.x = -s; N.C_armL.rotation.x = -s * 0.6; N.C_armR.rotation.x = s * 0.6;
    } else if (!hologram) N.C_torso.rotation.z = Math.sin(t * 1.3) * 0.01;
  });

  const faceTo = (p) => { root.lookAt(p.x, root.position.y, p.z); };
  return {
    root, parts: N,
    show(pos, lookAt) { root.position.copy(pos); if (lookAt) faceTo(lookAt); root.visible = true; },
    hide() { root.visible = false; },
    faceTo,
    async walkTo(to, { speed = 0.9, lookAt } = {}) {
      const from = root.position.clone(); const d = from.distanceTo(to);
      faceTo(to); walking = 1;
      await tween((d / speed) * 1000, k => root.position.lerpVectors(from, to, k), ease.linear);
      walking = 0; for (const k of ['C_legL', 'C_legR', 'C_armL', 'C_armR']) N[k].rotation.x = 0;
      if (lookAt) faceTo(lookAt);
    },
    async gesture(kind) {
      const A = N.C_armR, H = N.C_head, T = N.C_torso;
      if (kind === 'dial') {
        await tween(400, k => { A.rotation.x = -1.25 * k; });
        await tween(900, k => { A.rotation.y = Math.sin(k * Math.PI * 2) * 0.5; }, ease.linear);
        await tween(400, k => { A.rotation.x = -1.25 * (1 - k); A.rotation.y = 0; });
      } else if (kind === 'point') {
        await tween(350, k => { A.rotation.x = -1.4 * k; });
        await ctx.audio.wait(800);
        await tween(350, k => { A.rotation.x = -1.4 * (1 - k); });
      } else if (kind === 'shrug') {
        await tween(300, k => { N.C_armL.rotation.z = -0.5 * k; A.rotation.z = 0.5 * k; H.rotation.z = 0.15 * k; });
        await ctx.audio.wait(600);
        await tween(300, k => { N.C_armL.rotation.z = -0.5 * (1 - k); A.rotation.z = 0.5 * (1 - k); H.rotation.z = 0.15 * (1 - k); });
      } else if (kind === 'slump') {
        await tween(700, k => { H.rotation.x = 0.45 * k; T.rotation.x = 0.12 * k; });
      } else if (kind === 'unslump') {
        await tween(500, k => { H.rotation.x = 0.45 * (1 - k); T.rotation.x = 0.12 * (1 - k); });
      }
    },
    dispose() { off(); engine.scene.remove(root); },
  };
}
