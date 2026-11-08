// Lab mood: overall light level, red alarm pulsing, generator glow, flicker. Used by intro, storm, game over, rescue.
import * as THREE from 'three';
import { TUNE } from '../lab/labScene.js';
import { createFlicker } from './flicker.js';

export function createMood(ctx) {
  const { engine, lab } = ctx;
  const statics = [], leds = [];
  lab.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.lightMap) statics.push(m);
      if (m.emissiveIntensity > 0 && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.3 && !m.lightMap) leds.push([m, m.emissiveIntensity]);
    }
  });
  const alarmMats = new Set(); lab.alarms.forEach(a => a.traverse(o => o.isMesh && alarmMats.add(o.material)));
  alarmMats.forEach(m => { m.emissive = new THREE.Color(0xff1a0a); m.emissiveIntensity = 0; });
  const liquid = lab.props.P_generatorLiquid;
  const liqMats = []; liquid.traverse(o => o.isMesh && liqMats.push([o.material, Math.min(1.1, o.material.emissiveIntensity || 1)]));   // teal, not blown to white

  const state = { light: 1, alarm: 0, gen: 1, flicker: 0 };
  let t = 0;
  const flickerAt = (f => () => f(t, state.flicker))(createFlicker());
  engine.onFrame(dt => {
    t += dt;
    const fl = flickerAt();
    const L = state.light * fl;
    for (const m of statics) m.lightMapIntensity = TUNE.lightMapIntensity * L;
    for (const [m, base] of leds) m.emissiveIntensity = base * L;
    const pulse = state.alarm * (0.5 + 0.5 * Math.sin(t * 6));
    alarmMats.forEach(m => { m.emissiveIntensity = 4 * pulse; });
    lab.alarmLight.intensity = 6 * pulse;
    for (const [m, base] of liqMats) m.emissiveIntensity = base * state.gen * (0.85 + 0.15 * Math.sin(t * 3));
    liquid.visible = state.gen > 0.02;
  });

  const tween = (key, to, ms) => new Promise(res => {
    const from = state[key]; let k = 0;
    const off = engine.onFrame(dt => { k = Math.min(1, k + (dt * 1000) / Math.max(1, ms / (ctx.animSpeed ?? (ctx.auto ? 8 : 1)))); state[key] = from + (to - from) * k; if (k >= 1) { off(); res(); } });
  });
  return { state, to: tween, set(o) { Object.assign(state, o); } };
}
