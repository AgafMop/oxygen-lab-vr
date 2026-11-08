import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trueRate, makeRng, sampleTrial, mean, findOutliers, bestTemp, completeValues } from '../src/game/model.js';

test('trueRate matches the original curve', () => {
  assert.ok(Math.abs(trueRate(37) - 34.9) <= 0.5, `rate(37)=${trueRate(37)}`);
  assert.ok(trueRate(60) < 5);
  let best = 5;
  for (let T = 5; T <= 70; T++) if (trueRate(T) > trueRate(best)) best = T;
  assert.ok(best >= 40 && best <= 45, `argmax=${best}`);
});

test('makeRng is deterministic per seed', () => {
  const a = makeRng(1), b = makeRng(1);
  const xs = Array.from({ length: 5 }, a), ys = Array.from({ length: 5 }, b);
  assert.deepEqual(xs, ys);
});

test('sampleTrial is noisy around the true rate, half-ml steps, clamped', () => {
  const rng = makeRng(7);
  const vals = Array.from({ length: 200 }, () => sampleTrial(40, rng));
  const m = vals.reduce((a, b) => a + b) / vals.length;
  assert.ok(Math.abs(m - trueRate(40)) / trueRate(40) < 0.1);
  for (const v of vals) { assert.ok(v >= 0 && v <= 50); assert.equal(v * 2, Math.round(v * 2)); }
});

test('unmixed trials are about 60% of mixed', () => {
  const r1 = makeRng(3), r2 = makeRng(3);
  const avg = f => { let s = 0; for (let i = 0; i < 300; i++) s += f(); return s / 300; };
  const mixed = avg(() => sampleTrial(40, r1));
  const unmixed = avg(() => sampleTrial(40, r2, { mixed: false }));
  assert.ok(Math.abs(unmixed / mixed - 0.6) < 0.07, `ratio=${unmixed / mixed}`);
});

test('mean handles empty', () => {
  assert.equal(mean([]), null);
  assert.equal(mean([1, 2, 3]), 2);
});

test('findOutliers flags a far value only', () => {
  assert.deepEqual(findOutliers({ 40: [30, 31, 18] }), [{ temp: 40, index: 2 }]);
  assert.deepEqual(findOutliers({ 40: [30, 31, 29.5] }), []);
});

test('bestTemp picks highest mean', () => {
  assert.equal(bestTemp({ 30: 20, 40: 33, 50: 12 }), 40);
});

import { robotValues } from '../src/game/model.js';

test('review F3: robotValues only marks an outlier that the detector really sees', () => {
  const rng = makeRng(9);
  const cold = robotValues(70, rng, 1);       // enzyme dead: a stirring mistake cannot show
  assert.equal(cold.outIdx, null);
  assert.deepEqual(findOutliers({ 70: cold.vals }), []);
  const warm = robotValues(40, rng, 2);
  assert.equal(warm.outIdx, 2);
  assert.deepEqual(findOutliers({ 40: warm.vals }), [{ temp: 40, index: 2 }]);
  const plain = robotValues(30, rng, null);
  assert.equal(plain.outIdx, null);
  assert.deepEqual(findOutliers({ 30: plain.vals }), []);
});

test('unmixed student reading is clearly low', () => {
  for (const T of [20, 40, 50]) for (let seed = 1; seed <= 50; seed++) {
    const v = sampleTrial(T, makeRng(seed), { mixed: false });
    assert.ok(v <= trueRate(T) - 3, `T=${T} seed=${seed}: ${v} vs rate ${trueRate(T).toFixed(1)}`);
  }
});

test('completeValues makes a student unmixed reading the only outlier', () => {
  for (const T of [10, 20, 30, 40, 50, 60]) for (let seed = 1; seed <= 30; seed++) {
    const rng = makeRng(seed * 31 + T);
    const s = sampleTrial(T, rng, { mixed: false });
    const { vals, studentOut } = completeValues(T, rng, s, true);
    assert.equal(vals.length, 2);
    assert.equal(studentOut, true, `T=${T} seed=${seed}: s=${s}`);
    assert.deepEqual(findOutliers({ [T]: [s, ...vals] }), [{ temp: T, index: 0 }], `T=${T} seed=${seed}: ${[s, ...vals]}`);
  }
});

test('completeValues never invents an outlier for a normal reading', () => {
  for (const T of [10, 20, 30, 40, 50, 60]) for (let seed = 1; seed <= 30; seed++) {
    const rng = makeRng(seed * 17 + T);
    const s = sampleTrial(T, rng);
    const { vals, studentOut } = completeValues(T, rng, s, false);
    assert.equal(studentOut, false);
    assert.deepEqual(findOutliers({ [T]: [s, ...vals] }), [], `T=${T} seed=${seed}: ${[s, ...vals]}`);
  }
});

test('review #1: a built-in leak is a detectable outlier at every chip temperature up to 60°', () => {
  for (const T of [10, 20, 30, 40, 50, 60]) for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed * 7 + T);
    const vals = [sampleTrial(T, rng), sampleTrial(T, rng, { leak: true }), sampleTrial(T, rng)];
    assert.ok(findOutliers({ [T]: vals }).some(o => o.index === 1), `T=${T} seed=${seed}: ${vals}`);
  }
});
