import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutText } from '../src/core/textFit.js';

const measure = (s, px) => s.length * px * 0.5;

test('shrinks a long single word line until it fits', () => {
  const r = layoutText({ text: 'abcdefghij', w: 100, h: 50, maxPx: 40, minPx: 10, measure });
  assert.ok(r.px <= 20, `px ${r.px}`);
  assert.equal(r.fits, true);
  assert.equal(r.lines.length, 1);
});

test('wraps before shrinking below a readable size', () => {
  const r = layoutText({ text: 'aa bb cc dd ee ff', w: 60, h: 200, maxPx: 20, minPx: 16, measure });
  assert.ok(r.lines.length > 1);
  for (const l of r.lines) assert.ok(measure(l, r.px) <= 60, l);
  assert.ok(r.lines.length * r.px * 1.2 <= 200);
  assert.equal(r.fits, true);
});

test('never goes below minPx and reports misfit', () => {
  const r = layoutText({ text: 'x'.repeat(200), w: 50, h: 20, maxPx: 20, minPx: 12, measure });
  assert.equal(r.px, 12);
  assert.equal(r.fits, false);
});
