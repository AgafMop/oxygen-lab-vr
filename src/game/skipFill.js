// Teacher demo: skipping a chapter leaves the game state as if it had been played — the measurements are recorded
// (from the same science model), so every later chapter has what it needs.
import { robotValues } from './model.js';
import { HAND_TEMP_COUNT, HAND_REPEATS } from './config.js';

const HAND_DEFAULT = [20, 40, 30, 50];
const ROBOT_DEFAULT = [10, 30, 50, 60, 70];

const validBy = (game, T, by) => (game.s.trials[T] || []).filter(t => t.valid && (!by || t.by === by));

/** Fill in what chapter `id` would have produced. Never removes or changes anything already recorded. */
export function skipFill(game, id, rng) {
  const s = game.s;
  if (id === 'intro') s.flags.introDone = true;
  if (id === 'hypothesis') {
    s.hypothesis ??= 'peak';
    s.hypSentence ??= { iv: 'הטמפרטורה', ivDir: 'תעלה', dv: 'כמות החמצן', dvDir: 'תעלה', text: 'כאשר הטמפרטורה תעלה, כמות החמצן תעלה.' };
  }
  if (id === 'bench') {
    s.flags.goggles = true; s.flags.notebook = true;
    const temps = game.handTemps();
    for (const T of HAND_DEFAULT) if (temps.length < HAND_TEMP_COUNT && !temps.includes(T)) temps.push(T);
    for (const T of temps.slice(0, HAND_TEMP_COUNT)) {
      const need = HAND_REPEATS - validBy(game, T, 'student').length;
      if (need <= 0) continue;
      const { vals } = robotValues(T, rng);
      for (const v of vals.slice(0, need)) game.addTrial(T, { volume: v, by: 'student', read: 'student', mixed: true }, { free: true });
    }
  }
  if (id === 'robot') {
    const hand = game.handTemps();
    const plan = new Set([...(s.plan || []), ...hand]);
    for (const T of ROBOT_DEFAULT) if (plan.size < hand.length + 3 && !plan.has(T)) plan.add(T);
    s.plan = [...plan].sort((a, b) => a - b);
    for (const T of s.plan) {
      const need = 3 - validBy(game, T).length;
      if (need <= 0) continue;
      const { vals } = robotValues(T, rng);
      for (const v of vals.slice(0, need)) game.addTrial(T, { volume: v, by: 'robot', read: 'auto' }, { free: true });
    }
  }
}
