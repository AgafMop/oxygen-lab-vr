import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { createProcedure } from '../src/game/procedure.js';
import { makeRng } from '../src/game/model.js';

const setup = (opts = {}) => {
  const game = createGame({ seed: 1 });
  const p = createProcedure({ game, rng: makeRng(5), trialIndex: 0, goggles: true, requiredTemp: 37, ...opts });
  return { game, p };
};
const upTo = (p, last) => {
  const seq = [{ type: 'dial', temp: 37 }, { type: 'fillCylinder' }, { type: 'pour', bottle: '3' }, { type: 'yeast' }, { type: 'stir' }, { type: 'stopper', kind: 'tube' }, { type: 'timer' }];
  for (const a of seq) { const r = p.act(a); if (a.type === last) return r; }
};

test('happy path records one valid student trial at 37', () => {
  const { game, p } = setup();
  upTo(p, 'timer');
  assert.equal(p.step, 'read');
  const r = p.act({ type: 'read', ml: p.volume });
  assert.equal(r.ok, true);
  assert.equal(r.done.valid, true);
  assert.equal(game.s.trials[37].length, 1);
  assert.equal(game.s.o2, 345);
});

test('a wrong reading can be retried and never changes the volume', () => {
  const { game, p } = setup();
  upTo(p, 'timer');
  const v = p.volume;
  assert.equal(p.act({ type: 'read', ml: v + 5 }).ok, false);
  assert.equal(game.s.flags.wrongRead, true);
  assert.equal(p.act({ type: 'read', ml: v + 1 }).ok, true);
  assert.equal(game.s.trials[37][0].volume, v);
});

test('pouring without goggles splashes and keeps the step', () => {
  const { game, p } = setup({ goggles: false });
  p.act({ type: 'dial', temp: 37 }); p.act({ type: 'fillCylinder' });
  const r = p.act({ type: 'pour', bottle: '3' });
  assert.equal(r.fail, 'splash');
  assert.equal(p.step, 'pour');
  assert.equal(game.s.o2, 350);
  p.act({ type: 'goggles' });
  assert.equal(p.act({ type: 'pour', bottle: '3' }).ok, true);
});

test('30% peroxide melts the bench: immediate game over', () => {
  const { game, p } = setup();
  p.act({ type: 'dial', temp: 37 }); p.act({ type: 'fillCylinder' });
  assert.equal(p.act({ type: 'pour', bottle: '30' }).fail, 'acidMelt');
  assert.equal(game.s.over, true);
});

test('dial at 90 boils the bath, costs oxygen, back to dial', () => {
  const { game, p } = setup();
  const r = p.act({ type: 'dial', temp: 90 });
  assert.equal(r.fail, 'boil');
  assert.equal(game.s.o2, 345);
  assert.equal(p.step, 'dial');
  assert.ok(game.s.mistakes.includes('boiling'));
});

test('dialing a temperature other than the required one is refused', () => {
  const { p } = setup();
  assert.equal(p.act({ type: 'dial', temp: 20 }).ok, false);
  assert.equal(p.step, 'dial');
});

test('three spoons of yeast: elephant toothpaste, invalid trial', () => {
  const { game, p } = setup();
  upTo(p, 'yeast'); p.act({ type: 'yeast' }); p.act({ type: 'yeast' });
  const r = p.act({ type: 'stir' });
  assert.equal(r.fail, 'elephantToothpaste');
  assert.equal(r.done.valid, false);
  assert.equal(game.s.trials[37][0].reason, 'excessYeast');
  assert.equal(game.s.o2, 360 - 15 - 15);
});

test('sealed stopper blasts, penalizes and returns to pour', () => {
  const { game, p } = setup();
  upTo(p, 'stir');
  const r = p.act({ type: 'stopper', kind: 'sealed' });
  assert.equal(r.fail, 'sealedBlast');
  assert.equal(p.step, 'pour');
  assert.equal(game.s.o2, 345);
});

test('timer without filling the cylinder gives an invalid trial', () => {
  const { game, p } = setup();
  p.act({ type: 'dial', temp: 37 });
  p.act({ type: 'pour', bottle: '3' }); p.act({ type: 'yeast' }); p.act({ type: 'stir' }); p.act({ type: 'stopper', kind: 'tube' });
  const r = p.act({ type: 'timer' });
  assert.equal(r.fail, 'cylinderNotFilled');
  assert.equal(r.done.valid, false);
  assert.equal(game.s.trials[37][0].reason, 'cylinder');
});

test('stopper without stirring is allowed but unmixed', () => {
  const { game, p } = setup();
  upTo(p, 'yeast');
  assert.equal(p.act({ type: 'stopper', kind: 'tube' }).ok, true);
  p.act({ type: 'timer' }); p.act({ type: 'read', ml: p.volume });
  assert.equal(game.s.trials[37][0].mixed, false);
});

test('out-of-order timer is refused and changes nothing', () => {
  const { p } = setup();
  assert.equal(p.act({ type: 'timer' }).ok, false);
  assert.equal(p.step, 'dial');
});

test('double stir is idempotent', () => {
  const { p } = setup();
  upTo(p, 'stir');
  assert.equal(p.act({ type: 'stir' }).ok, true);
  assert.equal(p.step, 'stopper');
});

test('hint level fades over the three trials', () => {
  const g = createGame({ seed: 1 });
  const lv = i => createProcedure({ game: g, rng: makeRng(1), trialIndex: i, goggles: true, requiredTemp: 37 }).hint().level;
  assert.deepEqual([0, 1, 2].map(lv), ['full', 'highlight', 'none']);
  assert.equal(createProcedure({ game: g, rng: makeRng(1), trialIndex: 0, goggles: false, requiredTemp: 37 }).hint().target, 'A_goggleRack');
});

test('review F8: the student\'s unstirred trial is tagged as an unmixed outlier candidate', () => {
  const { game, p } = setup();
  upTo(p, 'yeast');
  p.act({ type: 'stopper', kind: 'tube' }); p.act({ type: 'timer' }); p.act({ type: 'read', ml: p.volume });
  assert.equal(game.s.trials[37][0].meta, 'unmixed');
});
