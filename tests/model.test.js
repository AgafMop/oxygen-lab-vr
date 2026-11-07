import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trueRate, makeRng, sampleTrial, mean, findOutliers, bestTemp } from '../src/game/model.js';

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

test('unmixed trials are about 70% of mixed', () => {
  const r1 = makeRng(3), r2 = makeRng(3);
  const avg = f => { let s = 0; for (let i = 0; i < 300; i++) s += f(); return s / 300; };
  const mixed = avg(() => sampleTrial(40, r1));
  const unmixed = avg(() => sampleTrial(40, r2, { mixed: false }));
  assert.ok(Math.abs(unmixed / mixed - 0.7) < 0.07, `ratio=${unmixed / mixed}`);
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
  const cold = robotValues(5, rng, 1);
  assert.equal(cold.outIdx, null);
  assert.deepEqual(findOutliers({ 5: cold.vals }), []);
  const warm = robotValues(40, rng, 2);
  assert.equal(warm.outIdx, 2);
  assert.deepEqual(findOutliers({ 40: warm.vals }), [{ temp: 40, index: 2 }]);
  const plain = robotValues(30, rng, null);
  assert.equal(plain.outIdx, null);
  assert.deepEqual(findOutliers({ 30: plain.vals }), []);
});
