// Hand-action math for physical lab handling (pure; vectors are plain {x, y, z}).

const POUR_MIN = 60 * Math.PI / 180;   // a bottle starts pouring past ~60°
const MOUTH_R = 0.06;                  // spout within 6 cm (horizontal) of the flask mouth counts as "over it"
const STIR_TURNS = 3;

/** Angle (rad) between a prop's world up axis and world up. */
export function tiltOf(up) {
  const len = Math.hypot(up.x, up.y, up.z) || 1;
  return Math.acos(Math.max(-1, Math.min(1, up.y / len)));
}

/** Flow while tilted: ml per second, and whether the stream lands in the flask mouth. */
export function pourRate(tilt, horizDist) {
  if (tilt < POUR_MIN) return { rate: 0, over: false };
  const k = Math.min(1, (tilt - POUR_MIN) / (Math.PI / 2 - POUR_MIN) + 0.35);
  return { rate: 14 * k, over: horizDist <= MOUTH_R };
}

/** Stir progress from the rod tip's angle around the flask axis: only travel while inside counts; 3 turns = 1. */
export function createStir() {
  let last = null, travel = 0;
  return {
    feed(angle, inside) {
      if (inside && last != null) {
        let d = angle - last;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        travel += d;                              // signed: a back-and-forth wobble cancels out
      }
      last = inside ? angle : null;
      return Math.min(1, Math.max(0, Math.abs(travel) / (2 * Math.PI * STIR_TURNS)));
    },
    reset() { last = null; travel = 0; },
  };
}

export function near(a, b, r) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < r;
}
