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

test('planFeedback', () => {
  const g = newGame();
  assert.equal(g.planFeedback([10, 20, 30, 35, 15]).msg, 'oneSided');
  assert.equal(g.planFeedback([45, 50, 55, 60, 65]).msg, 'oneSided');
  assert.equal(g.planFeedback([10, 20]).msg, 'few');
  assert.deepEqual(g.planFeedback([10, 25, 37, 45, 60]), { ok: true, msg: null });
  assert.equal(g.planFeedback([5, 10, 20, 30, 37, 45, 55, 65]).msg, 'many');
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
