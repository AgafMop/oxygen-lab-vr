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
  const rate = trueRate(T);
  let v = rate * (1 + 0.06 * gauss(rng));
  if (!mixed) v = Math.min(0.6 * v, rate - 4);     // yeast left in a clump: clearly less gas
  if (leak) v = Math.min(0.5 * v, rate - 4.5);      // gas escaping at the tube joint: clearly less (detectable wherever the enzyme works)
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

/** Three robot readings at T. If outI is given, try to make that reading a detectable "forgot to stir" outlier.
 *  Returns {vals, outIdx} — outIdx is null unless findOutliers flags exactly that reading; never a spurious outlier. */
export function robotValues(T, rng, outI = null) {
  for (let tries = 0; tries < 20; tries++) {
    const vals = [0, 1, 2].map(i => sampleTrial(T, rng, { mixed: i !== outI }));
    if (outI != null) {
      const md = [...vals].sort((a, b) => a - b)[1];
      if (!findOutliers({ [T]: vals }).some(o => o.index === outI)) vals[outI] = Math.round(md * 0.5 * 2) / 2;
      const f = findOutliers({ [T]: vals });
      if (f.length === 1 && f[0].index === outI) return { vals, outIdx: outI };
      if (f.length === 0) { const plain = [0, 1, 2].map(() => sampleTrial(T, rng)); if (!findOutliers({ [T]: plain }).length) return { vals: plain, outIdx: null }; }
    } else if (!findOutliers({ [T]: vals }).length) return { vals, outIdx: null };
  }
  const v = Math.round(trueRate(T) * 2) / 2;
  return { vals: [v, v, v], outIdx: null };
}

/** Two robot readings at T that complete a student's single reading `studentVal`.
 *  unmixed → the student's reading becomes the only outlier whenever that is possible (studentOut: true);
 *  otherwise no reading is flagged. Rejection-sampled from the normal model. */
export function completeValues(T, rng, studentVal, unmixed) {
  const ok = vals => {
    const f = findOutliers({ [T]: [studentVal, ...vals] });
    return unmixed ? f.length === 1 && f[0].index === 0 : f.length === 0;
  };
  for (let tries = 0; tries < 40; tries++) {
    const vals = [sampleTrial(T, rng), sampleTrial(T, rng)];
    if (ok(vals)) return { vals, studentOut: unmixed };
  }
  const r = Math.round(trueRate(T) * 2) / 2;
  const vals = unmixed ? [r, r] : [studentVal, studentVal];
  return { vals, studentOut: unmixed && ok(vals) };
}

/** A still-valid student reading tagged unmixed/leak is flagged among its temperature's valid readings (chapter 4 will walk it). */
export function studentOutlierShown(trialsByT) {
  return Object.entries(trialsByT).some(([T, list]) => {
    const vl = list.filter(t => t.valid);
    return findOutliers({ [T]: vl.map(t => t.volume) }).some(o => vl[o.index].by === 'student' && (vl[o.index].meta === 'unmixed' || vl[o.index].meta === 'leak'));
  });
}
/** Where the built-in leak goes: the first hand temperature, unless the enzyme is too slow there to show it (then the second). */
export function leakTemp(first, second) {
  const shows = T => T != null && trueRate(T) >= 3.5;
  return shows(first) ? first : shows(second) ? second : null;
}
