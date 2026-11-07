// Science model: catalase activity vs temperature (curve from the original lab).

/** ml O2 per minute at temperature T (°C). */
export function trueRate(T) {
  return 36 * Math.pow(2, (T - 37) / 10) / (1 + Math.exp((T - 48) / 3.2));
}

/** mulberry32 seeded PRNG → () => [0,1) */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One measured volume (ml, 0.5 steps, 0..50). */
export function sampleTrial(T, rng, { mixed = true, spoons = 1, leak = false } = {}) {
  let v = trueRate(T) * (1 + 0.06 * gauss(rng));
  if (!mixed) v *= 0.7;
  if (leak) v *= 0.55;
  v *= spoons;
  v = Math.min(50, Math.max(0, v));
  return Math.round(v * 2) / 2;
}

export function mean(vals) {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function median(vals) {
  const s = [...vals].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Values far from their temperature's median. */
export function findOutliers(byTemp) {
  const out = [];
  for (const [k, vals] of Object.entries(byTemp)) {
    if (vals.length < 3) continue;
    const md = median(vals);
    vals.forEach((v, i) => { if (Math.abs(v - md) > Math.max(3, 0.25 * md)) out.push({ temp: Number(k), index: i }); });
  }
  return out;
}

export function bestTemp(means) {
  let best = null;
  for (const [k, m] of Object.entries(means)) if (m != null && (best == null || m > means[best])) best = k;
  return best == null ? null : Number(best);
}
