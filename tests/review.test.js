import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentOutlierShown, leakTemp } from '../src/game/model.js';
import { tableRow } from '../src/ui/tableRow.js';

const t = (volume, extra = {}) => ({ volume, by: 'student', valid: true, ...extra });

test('review #2: a student outlier counts only if a tagged reading is really flagged', () => {
  // all three unmixed → nothing flagged → the robot must plant its own
  assert.equal(studentOutlierShown({ 20: [t(6, { meta: 'unmixed' }), t(6.5, { meta: 'unmixed' }), t(6, { meta: 'unmixed' })] }), false);
  // two unmixed, the good one is the flagged reading → not a tagged one → false
  assert.equal(studentOutlierShown({ 20: [t(6, { meta: 'unmixed' }), t(11, {}), t(6.5, { meta: 'unmixed' })] }), false);
  // a kept leak flagged among normal readings → true
  assert.equal(studentOutlierShown({ 20: [t(11), t(6, { meta: 'leak' }), t(11.5)] }), true);
  // a disqualified leak does not count
  assert.equal(studentOutlierShown({ 20: [t(11), t(6, { meta: 'leak', valid: false }), t(11.5), t(10.5)] }), false);
});

test('review #1: the built-in leak moves to the second temperature when the first cannot show it', () => {
  assert.equal(leakTemp(20, null), 20);
  assert.equal(leakTemp(70, null), null);       // second not chosen yet
  assert.equal(leakTemp(70, 30), 30);
  assert.equal(leakTemp(60, 20), 60);
});

test('review #4: the table row shows the valid readings and counts the struck ones', () => {
  const r = tableRow([t(12), t(6, { valid: false, reason: 'leak' }), t(11), t(10.5)]);
  assert.deepEqual(r.cells, [12, 11, 10.5]);
  assert.equal(r.struck, 1);
  assert.equal(r.mean.toFixed(2), (33.5 / 3).toFixed(2));
});
