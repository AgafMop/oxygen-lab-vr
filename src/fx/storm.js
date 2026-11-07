// Dust storm: a towering curved wall of billowing dust (noise shader) that rolls in, plus streaming dust and a brown-out overlay.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FRAG = `
uniform float uTime; uniform float uOpacity; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec2 p = vec2(vUv.x * 9.0, vUv.y * 3.0);
  float b = fbm(p + vec2(uTime*0.05, -uTime*0.12)) ;
  float top = 0.55 + 0.35 * fbm(vec2(vUv.x*6.0 + uTime*0.03, uTime*0.05));
  float body = smoothstep(top, top - 0.25, vUv.y);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec3 dark = vec3(0.22,0.10,0.05), lit = vec3(0.72,0.38,0.2);
  vec3 col = mix(dark, lit, b * (0.4 + 0.6 * vUv.y));
  gl_FragColor = vec4(col, body * edge * (0.75 + 0.25*b) * uOpacity);
}`;

export function createStorm(ctx, { center, azimuth = Math.PI * 0.6, arc = Math.PI * 0.9 } = {}) {
  const { engine } = ctx;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } } });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true, azimuth - arc / 2, arc);
  geo.translate(0, 0.5, 0);
  const wall = new THREE.Mesh(geo, mat);
  wall.position.copy(center); wall.renderOrder = -1; wall.frustumCulled = false;
  engine.scene.add(wall);

  // streaming dust near the viewer
  const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { seed[i] = Math.random(); pos.set([(Math.random() - 0.5) * 40, Math.random() * 8, (Math.random() - 0.5) * 40], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: 0xc98a5a, size: 0.06, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(pg, pm); pts.position.copy(center); pts.frustumCulled = false; engine.scene.add(pts);

  // brown-out overlay on the camera
  const ov = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0x5a2e16, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  ov.position.z = -0.11; ov.renderOrder = 9600; engine.camera.add(ov);

  const st = { radius: 340, height: 120, dust: 0, brown: 0, wind: new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).multiplyScalar(-14) };
  let t = 0;
  const off = engine.onFrame(dt => {
    t += dt; mat.uniforms.uTime.value = t;
    wall.scale.set(st.radius, st.height, st.radius);
    pm.opacity = st.dust * 0.8;
    const a = pg.attributes.position.array;
    for (let i = 0; i < N; i++) {
      a[i * 3] += st.wind.x * dt * (0.6 + seed[i]); a[i * 3 + 2] += st.wind.z * dt * (0.6 + seed[i]);
      if (Math.abs(a[i * 3]) > 20 || Math.abs(a[i * 3 + 2]) > 20) { a[i * 3] = -Math.sign(st.wind.x || 1) * 19.5 + (Math.random() - 0.5) * 2; a[i * 3 + 2] = (Math.random() - 0.5) * 40; }
    }
    pg.attributes.position.needsUpdate = true;
    ov.material.opacity = st.brown; ov.visible = st.brown > 0.01;
  });

  const tween = (fn, ms) => new Promise(res => { let k = 0; const o = engine.onFrame(dt => { k = Math.min(1, k + dt * 1000 / Math.max(1, ms / (ctx.auto ? 8 : 1))); fn(k); if (k >= 1) { o(); res(); } }); });
  return {
    state: st,
    async fadeIn(ms = 1500) { await tween(k => { mat.uniforms.uOpacity.value = k; }, ms); },
    /** Roll the wall from far away to `toRadius` metres. */
    async approach(ms = 15000, toRadius = 40) { const r0 = st.radius, h0 = st.height; await tween(k => { const e = k * k; st.radius = r0 + (toRadius - r0) * e; st.height = h0 + (60 - h0) * e; st.dust = Math.max(st.dust, e * 0.6); }, ms); },
    async hit(ms = 2500) { await tween(k => { st.radius = 40 - 38 * k; st.dust = 0.6 + 0.4 * k; st.brown = 0.85 * k; }, ms); },
    async clear(ms = 1500) { await tween(k => { st.brown = 0.85 * (1 - k); mat.uniforms.uOpacity.value = 1 - k; st.dust = 1 - k; }, ms); },
    dispose() { off(); engine.scene.remove(wall, pts); engine.camera.remove(ov); geo.dispose(); mat.dispose(); pg.dispose(); pm.dispose(); },
  };
}
