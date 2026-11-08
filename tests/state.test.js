import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { createStorage } from '../src/game/storage.js';

const memBackend = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const newGame = () => createGame({ seed: 1, storage: createStorage(memBackend()) });

test('new game starts with full oxygen', () => {
  assert.equal(newGame().s.o2, 360);
});

test('each trial costs 15 minutes', () => {
  const g = newGame();
  for (let i = 0; i < 3; i++) g.addTrial(37, { volume: 30, by: 'student' });
  assert.equal(g.s.o2, 315);
  assert.equal(g.s.trials[37].length, 3);
  assert.equal(g.s.trials[37][0].valid, true);
});

test('penalize subtracts oxygen and records the mistake', () => {
  const g = newGame();
  g.penalize('noGoggles');
  assert.equal(g.s.o2, 350);
  assert.ok(g.s.mistakes.includes('noGoggles'));
});

test('running out of oxygen emits gameover exactly once', () => {
  const g = newGame(); let n = 0;
  g.on('gameover', () => n++);
  g.spend(400); g.spend(10);
  assert.equal(n, 1);
  assert.equal(g.s.over, true);
});

test('restoreCheckpoint drops trials made after the chapter started', () => {
  const g = newGame();
  g.addTrial(37, { volume: 30, by: 'student' });
  g.setChapter('robot');
  g.addTrial(50, { volume: 10, by: 'robot' });
  g.addTrial(50, { volume: 11, by: 'robot' });
  g.spend(1000);
  g.restoreCheckpoint();
  assert.equal(g.s.trials[50], undefined);
  assert.equal(g.s.trials[37].length, 1);
  assert.equal(g.s.o2, 345);
  assert.equal(g.s.over, false);
  assert.equal(g.s.chapter, 'robot');
});

test('a throwing storage backend does not break saving or restoring', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const g = createGame({ seed: 1, storage: createStorage(bad) });
  assert.doesNotThrow(() => { g.setChapter('bench'); g.restoreCheckpoint(); g.loadSave(); });
});

test('a save survives into a new game on the same storage', () => {
  const st = createStorage(memBackend());
  const g = createGame({ seed: 1, storage: st });
  g.s.hypothesis = 'peak';
  g.setChapter('bench');
  const g2 = createGame({ seed: 2, storage: st });
  assert.equal(g2.loadSave(), true);
  assert.equal(g2.s.chapter, 'bench');
  assert.equal(g2.s.hypothesis, 'peak');
});

const withHand = (g, temps) => { for (const T of temps) g.addTrial(T, { volume: 10, by: 'student', read: 'student' }); return g; };

test('handTemps lists valid student temperatures', () => {
  const g = newGame();
  g.addTrial(20, { volume: 10, by: 'student' });
  g.addTrial(40, { volume: 10, by: 'student', valid: false, reason: 'cylinder' });
  g.addTrial(60, { volume: 3, by: 'student' });
  g.addTrial(30, { volume: 20, by: 'robot' });
  assert.deepEqual(g.handTemps(), [20, 60]);
});

test('planFeedback counts coverage with hand temps, cost with robot temps', () => {
  const g = withHand(newGame(), [20, 40, 60]);           // o2 now 315
  assert.equal(g.planFeedback([10, 50]).msg, 'few');
  assert.equal(g.planFeedback([5, 10, 15, 25, 30, 35]).msg, 'many');
  const f = g.planFeedback([10, 30, 50]);
  assert.equal(f.ok, true); assert.equal(f.cost, 165);
  g.s.o2 = 150;
  assert.equal(g.planFeedback([10, 30, 50]).msg, 'budget');
  const h = withHand(newGame(), [50, 60, 70]);
  assert.equal(h.planFeedback([45, 55, 65]).msg, 'oneSided');
  assert.equal(h.planFeedback([10, 45, 55]).ok, true);
});

test('free trials cost no oxygen', () => {
  const g = newGame();
  g.addTrial(20, { volume: 5, by: 'robot' }, { free: true });
  assert.equal(g.s.o2, 360);
  assert.equal(g.s.trials[20].length, 1);
});

test('a perfect run keeps oxygen and earns three stars', () => {
  const g = newGame();
  for (const T of [20, 30, 37, 45, 60]) for (let i = 0; i < 3; i++) g.addTrial(T, { volume: 10, by: 'robot' });
  g.markDecision(true);
  assert.equal(g.s.o2, 135);
  assert.equal(g.finalScore().stars, 3);
});

test('mistakes or a game over cost stars', () => {
  const g = newGame();
  g.penalize('boiling');
  assert.equal(g.finalScore().stars, 2);
  g.spend(1000); g.restoreCheckpoint();
  assert.equal(g.finalScore().stars, 1);
});

test('a wrong decision costs the third star', () => {
  const g = newGame();
  g.markDecision(false);
  assert.equal(g.finalScore().stars, 2);
});

test('review F4: a plan that costs more oxygen than is left is refused', () => {
  const g = withHand(newGame(), [20, 40, 60]);
  g.s.o2 = 150;                       // 3 robot temps × 3 × 15 + 30 = 165 > 150
  assert.equal(g.planFeedback([10, 30, 50]).msg, 'budget');
  g.s.o2 = 220;
  assert.equal(g.planFeedback([10, 30, 50]).ok, true);
  g.s.o2 = 210;
  assert.equal(g.planFeedback([10, 30, 45, 50]).msg, 'budget');   // 4×45 + 30 = 210 ≥ 210
});

test('review F4: a second game over in the same chapter opens the reserve tanks', () => {
  const g = newGame();
  g.s.o2 = 100; g.setChapter('robot');
  g.spend(500); g.restoreCheckpoint();
  assert.equal(g.s.o2, 100);
  g.spend(500); g.restoreCheckpoint();
  assert.ok(g.s.o2 >= 240, `o2=${g.s.o2}`);
});

test('review: a game over costs score', () => {
  const g = newGame();
  g.setChapter('bench'); g.spend(500); g.restoreCheckpoint();
  assert.ok(g.s.score <= -100);
});

test('review F5: a throwing localStorage getter does not break storage', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    let st;
    assert.doesNotThrow(() => { st = createStorage(); });
    assert.equal(st.get('x'), null);
    assert.doesNotThrow(() => st.set('x', 1));
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
  }
});

test('handDone needs two temperatures with three valid student trials each', () => {
  const g = newGame();
  const add = (T, n, valid = true) => { for (let i = 0; i < n; i++) g.addTrial(T, { volume: 10, by: 'student', valid }); };
  add(20, 2); add(40, 2);
  assert.equal(g.handDone(), false);
  add(20, 1); add(40, 1);
  assert.equal(g.handDone(), true);
  const h = newGame();
  const addH = (T, n, valid = true) => { for (let i = 0; i < n; i++) h.addTrial(T, { volume: 10, by: 'student', valid }); };
  addH(20, 3); addH(20, 1, false); addH(40, 3);
  assert.equal(h.handDone(), true);
});
