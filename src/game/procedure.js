// Hands-on bench procedure: step machine + teaching failures (spec §6, pitfalls table).
import { sampleTrial } from './model.js';

const NEXT_TARGET = {
  dial: 'A_bath', fillCylinder: 'A_cylinder', pour: 'A_bottle3', yeast: 'A_yeastJar',
  stir: 'A_rod', stopper: 'A_stopperTube', timer: 'A_timer', read: 'A_cylinder',
};
const LEVELS = ['full', 'highlight', 'none'];
const NO = { ok: false };

export function createProcedure({ game, rng, trialIndex = 0, goggles = false, requiredTemp = 37 }) {
  let temp = null, filled = false, spoons = 0, stirred = false;

  const p = {
    step: 'dial',
    goggles,
    volume: null,
    trialIndex,

    hint() {
      const level = LEVELS[Math.min(trialIndex, 2)];
      const beforePour = ['dial', 'fillCylinder', 'pour'].includes(p.step);
      return { level, target: !p.goggles && beforePour ? 'A_goggleRack' : NEXT_TARGET[p.step] };
    },

    act(a) {
      switch (a.type) {
        case 'goggles': p.goggles = true; return { ok: true };

        case 'dial':
          if (p.step !== 'dial') return NO;
          if (a.temp >= 90) { game.penalize('boiling'); return { ok: false, fail: 'boil' }; }
          if (a.temp !== requiredTemp) return NO;
          temp = a.temp; p.step = 'fillCylinder'; return { ok: true };

        case 'fillCylinder':
          if (p.step !== 'fillCylinder') return NO;
          filled = true; p.step = 'pour'; return { ok: true };

        case 'pour':
          if (p.step !== 'pour' && p.step !== 'fillCylinder') return NO;
          if (!p.goggles) { game.penalize('noGoggles'); return { ok: false, fail: 'splash' }; }
          if (a.bottle === '30') { game.spend(game.s.o2); return { ok: false, fail: 'acidMelt' }; }
          p.step = 'yeast'; return { ok: true };

        case 'yeast':
          if (p.step !== 'yeast' && p.step !== 'stir') return NO;
          spoons++; p.step = 'stir'; return { ok: true };

        case 'stir':
          if (p.step === 'stopper' && stirred) return { ok: true };
          if (p.step !== 'stir') return NO;
          if (spoons >= 3) return toothpaste();
          stirred = true; p.step = 'stopper'; return { ok: true };

        case 'stopper':
          if (p.step !== 'stopper' && p.step !== 'stir') return NO;
          if (spoons >= 3) return toothpaste();
          if (a.kind === 'sealed') {
            game.penalize('sealedStopper');
            spoons = 0; stirred = false; p.step = 'pour';
            return { ok: false, fail: 'sealedBlast' };
          }
          p.step = 'timer'; return { ok: true };

        case 'timer':
          if (p.step !== 'timer') return NO;
          p.volume = sampleTrial(temp, rng, { mixed: stirred });
          if (!filled) return finish({ valid: false, reason: 'cylinder' }, 'cylinderNotFilled');
          p.step = 'read'; return { ok: true };

        case 'read':
          if (p.step !== 'read') return NO;
          if (Math.abs(a.ml - p.volume) > 1) { game.s.flags.wrongRead = true; return NO; }
          return finish({ valid: true });

        default: return NO;
      }
    },
  };

  function toothpaste() {
    game.penalize('excessYeast');
    p.volume = 0;
    return finish({ valid: false, reason: 'excessYeast' }, 'elephantToothpaste');
  }

  function finish({ valid, reason }, fail) {
    const trial = { volume: p.volume, by: 'student', read: 'student', valid, mixed: stirred };
    if (reason) trial.reason = reason;
    if (valid && !stirred) trial.meta = 'unmixed';   // may surface as an outlier in chapter 4
    game.addTrial(requiredTemp, trial);
    p.step = 'done';
    const done = { volume: p.volume, valid, ...(reason ? { reason } : {}) };
    return fail ? { ok: false, fail, done } : { ok: true, done };
  }

  return p;
}
