import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notebookPages, iso } from '../src/game/notebook.js';

const base = () => ({ trials: {}, flags: {}, notes: [], hypothesis: null });

test('a fresh notebook has the hypothesis page and the protocol', () => {
  const p = notebookPages(base());
  assert.deepEqual(p.map(x => x.title), ['השערת המחקר', 'מהלך הניסוי']);
  assert.ok(p[0].lines.some(l => l.includes('עוד לא נכתבה')));
});

test('results table: rows by temperature, disqualified readings struck and explained, average of valid only', () => {
  const s = base();
  s.hypSentence = { text: 'כאשר הטמפרטורה תעלה, כמות החמצן תעלה.' };
  s.trials = { 40: [{ volume: 40, valid: true, by: 'student' }, { volume: 20, valid: false, reason: 'leak', by: 'student' }, { volume: 42, valid: true, by: 'student' }],
    10: [{ volume: 5, valid: true, by: 'robot' }] };
  const t = notebookPages(s).find(x => x.kind === 'table');
  assert.deepEqual(t.rows.map(r => r.T), [10, 40]);
  assert.equal(t.rows[1].avg, '41');
  assert.equal(t.rows[1].vals[1].ok, false);
  assert.equal(t.rows[0].who, 'רובי');
  assert.match(t.foot, /דליפה/);
  assert.ok(notebookPages(s)[0].lines.some(l => l.includes('תעלה')));
});

test('log pages hold at most 7 notes; the conclusion appears once the peak is found', () => {
  const s = base();
  s.notes = Array.from({ length: 9 }, (_, i) => `n${i}`);
  let p = notebookPages(s);
  assert.equal(p.filter(x => x.title === 'יומן המעבדה').length, 2);
  assert.ok(!p.some(x => x.title === 'מסקנה'));
  s.peakPick = 40;
  p = notebookPages(s);
  assert.equal(p.at(-1).title, 'מסקנה');
});

test('numbers with units are bidi-isolated', () => {
  assert.equal(iso('ב-40°'), 'ב-⁦40°⁩');
});

import { shapeOf, DEFAULT_SENTENCE } from '../src/game/hypothesis.js';

test('the graph a hypothesis sentence describes (oxygen against rising temperature)', () => {
  assert.equal(shapeOf({ ivDir: 'תעלה', dvDir: 'תעלה' }), 'rise');
  assert.equal(shapeOf({ ivDir: 'תרד', dvDir: 'תרד' }), 'rise');
  assert.equal(shapeOf({ ivDir: 'תעלה', dvDir: 'תרד' }), 'fall');
  assert.equal(shapeOf({ ivDir: 'תרד', dvDir: 'תעלה' }), 'fall');
  assert.equal(shapeOf({ ivDir: 'תעלה', dvDir: 'תעלה ואז תרד' }), 'peak');
  assert.equal(shapeOf({ ivDir: 'תרד', dvDir: 'לא תשתנה' }), 'flat');
  assert.equal(DEFAULT_SENTENCE.text, 'כאשר הטמפרטורה תעלה, כמות החמצן תעלה ואז תרד.');
  assert.equal(shapeOf(DEFAULT_SENTENCE), 'peak');
});
