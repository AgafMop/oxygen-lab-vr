// Runtime looks that cost no extra passes on Quest: fresnel glass, liquid meniscus, foam texture, hologram shader.
import * as THREE from 'three';
import { createFlicker } from '../fx/flicker.js';

/** Glass: brighter, more opaque rim at grazing angles (fresnel) over the existing env reflection. */
export function glassify(mat, { rim = 0.55, tint = new THREE.Color(0.9, 0.97, 1.0) } = {}) {
  if (mat.userData.glassified) return mat;
  mat.userData.glassified = true;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uRim = { value: rim }; sh.uniforms.uTint = { value: tint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uTint;')
      .replace('#include <dithering_fragment>', `
        float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.4);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint, fres * uRim);
        gl_FragColor.a = clamp(gl_FragColor.a + fres * uRim, 0.0, 1.0);
        #include <dithering_fragment>`);
  };
  mat.needsUpdate = true;
  return mat;
}

/** A shallow curved disc for a liquid's surface (the meniscus), radius r. */
export function meniscus(r, color, opacity = 0.75) {
  const g = new THREE.CircleGeometry(r, 32);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), d = Math.hypot(x, y) / r; pos.setZ(i, -0.004 * (1 - d * d)); }   // dips in the middle, climbs the glass
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.05, metalness: 0, envMapIntensity: 1.2, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Foam: a canvas texture of packed bubbles with highlights. */
export function foamTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#efe8d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 11;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(240,232,214,0.6)'); gr.addColorStop(1, 'rgba(170,160,140,0.55)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Hologram: blue fresnel glow, moving scanlines, a slow photosensitivity-safe shimmer. */
export function hologramMaterial(engine) {
  const flick = createFlicker();
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uColor: { value: new THREE.Color(0x7fc8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; vN = normalize(normalMatrix * normal);
        vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform float uLevel; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.75 + 0.25 * smoothstep(0.3, 0.7, fract(vY * 60.0 - uTime * 0.6));
        float a = (0.12 + 0.55 * fres) * scan * uLevel;
        gl_FragColor = vec4(uColor * (0.6 + 0.9 * fres), a);
      }`,
  });
  let t = 0;
  const off = engine.onFrame(dt => { t += dt; m.uniforms.uTime.value = t; m.uniforms.uLevel.value = flick(t, 0.5); });
  m.userData.dispose = off;
  return m;
}
