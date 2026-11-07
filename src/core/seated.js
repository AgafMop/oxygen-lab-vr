// Pure seated-height math (no three.js import so Node can test it).
export const SEAT_GAP = 0.45;     // eye height above the bench top for a seated student
export const BENCH_TOP = 0.72;

/** Rig Y offset so the bench top sits SEAT_GAP below the tracked eye height. */
export function seatedRigOffset(eyeY, benchTopY = BENCH_TOP) {
  const off = benchTopY + SEAT_GAP - eyeY;
  return Math.max(-0.6, Math.min(0.6, Math.round(off * 1000) / 1000));
}
