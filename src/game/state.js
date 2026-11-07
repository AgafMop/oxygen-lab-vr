// Game state: oxygen, trials, score, decisions, checkpoints, events.
import { O2_START, TRIAL_COST, PENALTY, MISTAKE_SCORE, PLAN_MIN, PLAN_MAX, SAVE_KEY } from './config.js';

const fresh = seed => ({
  seed, chapter: null, o2: O2_START, score: 0, hypothesis: null, plan: [], trials: {},
  badges: [], mistakes: [], flags: {}, over: false,
});

const clone = o => JSON.parse(JSON.stringify(o));

export function createGame({ seed, storage }) {
  const listeners = {};
  const emit = (evt, data) => (listeners[evt] || []).forEach(fn => fn(data));
  let checkpoint = null;

  const game = {
    s: fresh(seed),

    on(evt, fn) { (listeners[evt] ||= []).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; },

    spend(min) {
      if (game.s.over) return;
      game.s.o2 = Math.max(0, game.s.o2 - min);
      emit('o2', game.s.o2);
      if (game.s.o2 <= 0) { game.s.over = true; game.s.flags.hadGameOver = true; emit('gameover'); }
    },

    penalize(key) {
      game.s.mistakes.push(key);
      game.s.score -= MISTAKE_SCORE;
      game.spend(PENALTY[key] ?? 0);
    },

    addScore(n) { game.s.score += n; emit('score', game.s.score); },

    /** Scientific judgement call (disqualify, outlier cause, ...). */
    markDecision(ok) {
      if (ok) game.addScore(100); else game.s.flags.decisionWrong = true;
    },

    award(badge) { if (!game.s.badges.includes(badge)) game.s.badges.push(badge); },

    addTrial(T, trial) {
      (game.s.trials[T] ||= []).push({ valid: true, ...trial });
      emit('trial', { T, index: game.s.trials[T].length - 1 });
      game.spend(TRIAL_COST);
    },

    disqualify(T, i, reason) {
      const t = game.s.trials[T]?.[i];
      if (!t) return;
      t.valid = false; t.reason = reason;
      emit('trial', { T, index: i });
    },

    setChapter(id) {
      game.s.chapter = id;
      checkpoint = clone(game.s);
      storage?.set(SAVE_KEY, checkpoint);
      emit('chapter', id);
    },

    restoreCheckpoint() {
      const snap = checkpoint ?? storage?.get(SAVE_KEY);
      if (!snap) { game.s.over = false; return; }
      const hadGameOver = game.s.flags.hadGameOver || snap.flags?.hadGameOver;
      game.s = clone(snap);
      game.s.over = false;
      if (hadGameOver) game.s.flags.hadGameOver = true;
      emit('o2', game.s.o2);
    },

    /** Load a saved checkpoint from storage. Returns whether one existed. */
    loadSave() {
      const snap = storage?.get(SAVE_KEY);
      if (!snap || !snap.chapter) return false;
      checkpoint = snap;
      game.s = clone(snap);
      return true;
    },

    planFeedback(plan) {
      if (plan.length < PLAN_MIN) return { ok: false, msg: 'few' };
      if (plan.length > PLAN_MAX) return { ok: false, msg: 'many' };
      if (plan.every(t => t <= 35) || plan.every(t => t >= 45)) return { ok: false, msg: 'oneSided' };
      return { ok: true, msg: null };
    },

    finalScore() {
      const s = game.s;
      let stars = 1;
      if (!s.flags.hadGameOver) stars = 2;
      if (stars === 2 && s.mistakes.length === 0 && !s.flags.decisionWrong) stars = 3;
      const score = Math.max(0, s.score + Math.round(s.o2) * 2 + s.badges.length * 100);
      return { score, stars, badges: [...s.badges] };
    },
  };
  return game;
}
