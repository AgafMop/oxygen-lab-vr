// The opening film on a big screen in a dark void (static viewpoint — comfortable seated), with subtitles.
// createIntroVideo() is called at boot so the file preloads; primeIntroVideo() runs inside the start click
// so later playback with sound is allowed; playIntroCinema() resolves 'ended' or 'unavailable' (→ in-engine intro).
import * as THREE from 'three';
import { INTRO_VIDEO, cueAt } from '../game/introVideo.js';
import { LINES } from '../game/script.js';

export function createIntroVideo() {
  const el = document.createElement('video');
  const src = el.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') ? INTRO_VIDEO.src.mp4
    : el.canPlayType('video/webm; codecs="vp9, opus"') ? INTRO_VIDEO.src.webm : null;
  if (!src) return null;
  el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.src = src;
  let state = 'loading';
  const ready = new Promise(res => {
    el.addEventListener('canplaythrough', () => { state = 'ready'; res(true); }, { once: true });
    el.addEventListener('error', () => { state = 'error'; res(false); }, { once: true });
  });
  el.load();
  return { el, ready, get state() { return state; } };
}

export function primeIntroVideo(video) {
  if (!video) return;
  const el = video.el; el.volume = 0;
  el.play()?.then(() => { if (video.inUse) return; el.pause(); el.currentTime = 0; el.volume = 1; }).catch(() => { if (!video.inUse) el.volume = 1; });
}

export async function playIntroCinema(ctx, seq, video, { loadTimeout = 15000, onShow = () => {} } = {}) {
  const { engine, ui, lab } = ctx;
  const { scene } = engine;
  const el = video.el;

  // wait for enough data (preloaded since boot); give up → in-engine opening
  if (video.state !== 'ready') {
    const ok = await seq.guard(Promise.race([video.ready, new Promise(r => setTimeout(() => r(false), loadTimeout))]));
    if (!ok) return 'unavailable';
  }

  const hidden = [lab.root, lab.robi?.R_root, lab.glass, lab.dust].filter(o => o && o.visible);
  const bg = scene.background, bgI = scene.backgroundIntensity;
  const tex = new THREE.VideoTexture(el); tex.colorSpace = THREE.SRGBColorSpace;
  const cinema = new THREE.Group();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.9), new THREE.MeshBasicMaterial({ color: 0x0c1c22, toneMapped: false }));
  frame.position.z = -0.01; cinema.add(frame, screen);
  let offCue = () => {}, offVis = () => {};
  const restore = () => {
    offCue(); offVis();
    try { el.pause(); } catch {}
    scene.remove(cinema); screen.geometry.dispose(); frame.geometry.dispose(); screen.material.dispose(); frame.material.dispose(); tex.dispose();
    scene.background = bg; scene.backgroundIntensity = bgI;
    hidden.forEach(o => { o.visible = true; });
    ui.subtitles.hide();
  };

  try {
    await engine.fade(1, 400);
    hidden.forEach(o => { o.visible = false; });
    scene.background = new THREE.Color(0x000000);
    await engine.nextFrame();
    ui.inFront(cinema, 3.0, 0.05);
    if (!engine.isXR()) {          // desktop: centre it on the (slightly pitched) view so it isn't keystoned
      const head = engine.headPosition(new THREE.Vector3());
      cinema.position.copy(head).addScaledVector(engine.camera.getWorldDirection(new THREE.Vector3()), 3.0);
      cinema.lookAt(head);
    }
    onShow();
    ctx.introPhase = 'video';
    ctx.introVideo = el;
    video.inUse = true;
    el.currentTime = 0; el.volume = 1;
    await el.play();
    await engine.fade(0, 600);

    let shown = null;
    offCue = engine.onFrame(() => {
      const c = cueAt(el.currentTime);
      if (c && c.id !== shown) { shown = c.id; const l = LINES[c.id]; ui.subtitles.show(l.speaker, l.text, (c.at + c.dur - el.currentTime) * 1000 + 300); }
      if (!c) shown = null;
    });
    // headset taken off / tab hidden: pause the film, resume when back
    const session = engine.renderer.xr.getSession?.();
    const onVis = () => { const away = document.hidden || (session && session.visibilityState !== 'visible'); if (away) el.pause(); else if (!el.ended) el.play().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis); session?.addEventListener('visibilitychange', onVis);
    offVis = () => { document.removeEventListener('visibilitychange', onVis); session?.removeEventListener('visibilitychange', onVis); };

    await seq.guard(new Promise(res => { if (el.ended) res(); else el.addEventListener('ended', res, { once: true }); }));
    await engine.fade(1, 500);
  } catch (e) {
    await engine.fade(1, 250);
    restore();
    if (e?.name === 'NotAllowedError' || e?.name === 'NotSupportedError') return 'unavailable';
    throw e;
  }
  restore();
  return 'ended';
}
