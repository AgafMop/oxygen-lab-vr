import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatedRigOffset } from '../src/core/seated.js';

test('seated rig offset puts the bench top 0.45 m below the eye', () => {
  assert.ok(Math.abs(seatedRigOffset(1.2) - -0.03) < 0.001);
  assert.ok(Math.abs(seatedRigOffset(1.0) - 0.17) < 0.001);
});

test('seated rig offset is clamped for absurd tracking heights', () => {
  assert.equal(seatedRigOffset(0.1), 0.6);
  assert.equal(seatedRigOffset(2.5), -0.6);
});
