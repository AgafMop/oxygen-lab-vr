// Photosensitivity-safe flicker (WCAG 2.3.1: ≤3 flashes/s): soft 0.3 s dips, ≥0.5 s apart, at most 35% deep.
export function createFlicker(rand = Math.random) {
  let dipAt = -1, nextDip = 0;
  /** Brightness factor (0.65..1) at time t (seconds) for flicker amount 0..1. */
  return (t, amount) => {
    if (amount <= 0) return 1;
    if (t >= nextDip) { dipAt = t; nextDip = t + 0.5 + rand() * 1.2; }
    const k = (t - dipAt) / 0.3;
    return k >= 0 && k <= 1 ? 1 - 0.35 * Math.min(1, amount) * Math.sin(k * Math.PI) : 1;
  };
}
