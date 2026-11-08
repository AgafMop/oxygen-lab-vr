// Renderer, scene, player rig, XR session, frame loop, fade.
import * as THREE from 'three';

export function createEngine(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFramebufferScaleFactor(1.0);
  renderer.xr.setFoveation(1);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 400);
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.add(camera);
  scene.add(rig);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // fade sphere around the head (works in XR and on desktop)
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), fadeMat);
  fadeMesh.renderOrder = 9999;
  fadeMesh.visible = false;
  camera.add(fadeMesh);

  const frameFns = new Set(), afterFns = new Set();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    for (const fn of frameFns) fn(dt);
    renderer.render(scene, camera);
    for (const fn of afterFns) fn();
  });

  const engine = {
    THREE, renderer, scene, camera, rig, clock,
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    /** Runs right after each render (the canvas still holds the frame). */
    onAfterRender(fn) { afterFns.add(fn); return () => afterFns.delete(fn); },
    isXR: () => renderer.xr.isPresenting,
    /** Animate the fade sphere to opacity `to` (0 clear, 1 black). */
    fade(to, ms = 250) {
      fadeMesh.visible = true;
      const from = fadeMat.opacity;
      return new Promise(res => {
        let t = 0;
        const off = engine.onFrame(dt => {
          t += dt * 1000;
          const k = Math.min(1, t / ms);
          fadeMat.opacity = from + (to - from) * k;
          if (k >= 1) { off(); if (to === 0) fadeMesh.visible = false; res(); }
        });
      });
    },
    /** Current fade-to-black level (0 clear … 1 black). */
    fadeLevel: () => (fadeMesh.visible ? fadeMat.opacity : 0),
    /** Resolves after the next rendered frame (XR head pose is one frame behind a rig move). */
    nextFrame() { return new Promise(r => { const off = engine.onFrame(() => { off(); r(); }); }); },
    /** World-space head position. */
    headPosition(target = new THREE.Vector3()) {
      return (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(target);
    },
  };
  return engine;
}
