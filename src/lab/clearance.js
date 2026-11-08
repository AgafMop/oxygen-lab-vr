// Keep characters out of walls and furniture: clear-spot search and detour paths, using short horizontal rays
// against the room (and the corridor when loaded).
import * as THREE from 'three';

const rc = new THREE.Raycaster();
// only the built room (LAB_static / LAB_detail / CORR_*): never Robi, the crew or the movable props
let cache = null, cacheKey = '';
const solids = ctx => {
  const roots = [ctx.lab?.root, ctx.corridorRoot].filter(o => o && o.visible), key = roots.map(r => r.uuid).join();
  if (key === cacheKey) return cache;
  cache = []; cacheKey = key;
  for (const r of roots) r.traverse(o => { if (o.isMesh && /^(LAB_static|LAB_detail|CORR_)/.test(o.name)) cache.push(o); });
  return cache;
};

/** True when a body of radius r standing at pos (floor point) touches nothing at the given heights. */
export function isClear(ctx, pos, r, heights) {
  const S = solids(ctx);
  // standing inside furniture: from above, the first surface under the body must be the floor (rays from inside miss walls)
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    rc.set(new THREE.Vector3(pos.x + dx, 1.45, pos.z + dz), new THREE.Vector3(0, -1, 0)); rc.far = 1.6;
    const h = rc.intersectObjects(S, false)[0];
    if (!h || h.point.y > 0.12) return false;          // no floor under it = outside the room
  }
  for (const h of heights) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    rc.set(new THREE.Vector3(pos.x, h, pos.z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a))); rc.far = r;
    if (rc.intersectObjects(S, false).length) return false;
  }
  return true;
}

/** The nearest clear floor point to `pos` (rings of 0.15 m, up to 1.2 m); `pos` itself when clear or nothing is found. */
export function clearSpot(ctx, pos, r, heights) {
  if (isClear(ctx, pos, r, heights)) return pos.clone();
  for (let ring = 1; ring <= 8; ring++) {
    const d = ring * 0.15, n = 8 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, p = new THREE.Vector3(pos.x + Math.sin(a) * d, pos.y, pos.z + Math.cos(a) * d);
      if (isClear(ctx, p, r, heights)) return p;
    }
  }
  return pos.clone();
}

/** A clear straight path from a to b (sampled every 0.12 m)? */
export function pathClear(ctx, a, b, r, heights) {
  const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.12));
  for (let i = 1; i < n; i++) if (!isClear(ctx, new THREE.Vector3().lerpVectors(a, b, i / n), r, heights)) return false;
  return true;
}

/** Waypoints from a to b: direct when clear, else around the obstacle via one detour point; null when none works. */
export function route(ctx, a, b, r, heights) {
  if (pathClear(ctx, a, b, r, heights)) return [b];
  const mid = new THREE.Vector3().lerpVectors(a, b, 0.5), dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const corners = [new THREE.Vector3(a.x, a.y, b.z), new THREE.Vector3(b.x, a.y, a.z)];
  for (const off of [0.6, -0.6, 1.0, -1.0, 1.5, -1.5]) corners.push(mid.clone().addScaledVector(side, off));
  for (const c of corners) if (isClear(ctx, c, r, heights) && pathClear(ctx, a, c, r, heights) && pathClear(ctx, c, b, r, heights)) return [c, b];
  return null;
}
