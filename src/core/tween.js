// Frame-driven tweens that resolve as Promises. `speed` (ctx.auto) shortens everything in tests.
export const ease = {
  linear: k => k,
  inOut: k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  out: k => 1 - Math.pow(1 - k, 3),
  outBack: k => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2),
};

export function makeTween(engine, speed = 1) {
  return function tween(ms, fn, e = ease.inOut) {
    const dur = Math.max(1, ms / (typeof speed === 'function' ? speed() : speed));
    return new Promise(res => {
      let t = 0;
      const off = engine.onFrame(dt => {
        t += dt * 1000;
        const k = Math.min(1, t / dur);
        fn(e(k), k);
        if (k >= 1) { off(); res(); }
      });
    });
  };
}

export const lerp = (a, b, k) => a + (b - a) * k;
