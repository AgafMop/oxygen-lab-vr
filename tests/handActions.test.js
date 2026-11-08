import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiltOf, pourRate, createStir, near } from '../src/game/handActions.js';

const deg = d => d * Math.PI / 180;
const upAt = d => ({ x: Math.sin(deg(d)), y: Math.cos(deg(d)), z: 0 });   // a bottle's local up after tilting d degrees

test('tilt is the angle between the prop up axis and world up', () => {
  assert.ok(Math.abs(tiltOf(upAt(0))) < 1e-9);
  assert.ok(Math.abs(tiltOf(upAt(90)) - deg(90)) < 1e-9);
});

test('no pouring below 60 degrees', () => {
  assert.equal(pourRate(deg(30), 0).rate, 0);
  assert.equal(pourRate(deg(55), 0).rate, 0);
});

test('pouring over the mouth fills, away from it spills', () => {
  const over = pourRate(deg(90), 0.02);
  assert.ok(over.rate > 0); assert.equal(over.over, true);
  const off = pourRate(deg(90), 0.1);
  assert.ok(off.rate > 0); assert.equal(off.over, false);
});

test('three full turns inside the flask complete the stir', () => {
  const s = createStir(); let p = 0;
  for (let i = 0; i <= 3 * 36; i++) p = s.feed(deg(i * 10), true);
  assert.ok(p >= 1);
});

test('turning outside the flask does not count', () => {
  const s = createStir(); let p = 0;
  for (let i = 0; i <= 3 * 36; i++) p = s.feed(deg(i * 10), false);
  assert.equal(p, 0);
});

test('a small wobble does not finish the stir', () => {
  const s = createStir(); let p = 0;
  for (let i = 0; i < 50; i++) p = s.feed(deg(i % 2 ? 10 : -10), true);
  assert.ok(p < 0.5, `wobble progress ${p}`);
});

test('angle wrap from 350 to 10 counts 20 degrees', () => {
  const s = createStir();
  s.feed(deg(350), true);
  const p = s.feed(deg(10), true);
  assert.ok(Math.abs(p - 20 / 1080) < 1e-6, `progress ${p}`);
});

test('near is a distance check', () => {
  assert.equal(near({ x: 0, y: 0, z: 0 }, { x: 0.03, y: 0, z: 0.03 }, 0.05), true);
  assert.equal(near({ x: 0, y: 0, z: 0 }, { x: 0.05, y: 0, z: 0.05 }, 0.05), false);
});
