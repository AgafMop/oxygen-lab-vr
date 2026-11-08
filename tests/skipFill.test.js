import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { createStorage } from '../src/game/storage.js';
import { makeRng } from '../src/game/model.js';
import { skipFill } from '../src/game/skipFill.js';

const memBackend = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const newGame = () => createGame({ seed: 3, storage: createStorage(memBackend()) });

test('skipping the bench records two temperatures × three student readings, free of oxygen', () => {
  const g = newGame(), o2 = g.s.o2;
  skipFill(g, 'bench', makeRng(1));
  assert.ok(g.handDone());
  assert.deepEqual(g.handTemps(), [20, 40]);
  assert.equal(g.s.o2, o2);
  assert.equal(g.s.flags.goggles, true);
});

test('skipping the bench mid-way keeps the student\'s own temperature and readings', () => {
  const g = newGame();
  g.addTrial(30, { volume: 22, by: 'student', read: 'student' }, { free: true });
  skipFill(g, 'bench', makeRng(1));
  assert.ok(g.handDone());
  assert.ok(g.handTemps().includes(30));
  assert.equal(g.s.trials[30][0].volume, 22);
  assert.equal(g.s.trials[30].filter(t => t.by === 'student' && t.valid).length, 3);
});

test('skipping the robot gives a plan that covers cold and hot with three readings each', () => {
  const g = newGame();
  skipFill(g, 'bench', makeRng(1));
  skipFill(g, 'robot', makeRng(2));
  assert.ok(g.s.plan.length >= 5);
  assert.ok(g.planFeedback(g.s.plan.filter(t => !g.handTemps().includes(t))).ok);
  for (const T of g.s.plan) assert.ok(g.s.trials[T].filter(t => t.valid).length >= 3, `T=${T}`);
});

test('skipping intro and hypothesis sets what the next chapters read', () => {
  const g = newGame();
  skipFill(g, 'intro', makeRng(1)); skipFill(g, 'hypothesis', makeRng(1));
  assert.equal(g.s.flags.introDone, true);
  assert.equal(g.s.hypothesis, 'peak');
});
