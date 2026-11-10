// Game state: oxygen, trials, score, decisions, checkpoints, events.
import { O2_START, TRIAL_COST, PENALTY, MISTAKE_SCORE, ROBOT_MIN, ROBOT_MAX, SAVE_KEY, HAND_TEMP_COUNT, HAND_REPEATS } from './config.js';

const RESERVE_O2 = 240;      // emergency tanks after a second game over in the same chapter
const GAMEOVER_SCORE = 100;

const fresh = seed => ({
  seed, chapter: null, o2: O2_START, score: 0, hypothesis: null, plan: [], trials: {},
  badges: [], mistakes: [], flags: {}, notes: [], over: false,
});

const clone = o => JSON.parse(JSON.stringify(o));

export function createGame({ seed, storage }) {
  const listeners = {};
  const emit = (evt, data) => (listeners[evt] || []).forEach(fn => fn(data));
  let checkpoint = null;
  const overs = {};             // game overs per chapter (outlives checkpoint restores)

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

    /** A line in the student's lab notebook (src/ui/notebook.js). */
    note(text) { (game.s.notes ||= []).push(text); emit('note', text); },

    award(badge) { if (!game.s.badges.includes(badge)) game.s.badges.push(badge); },

    addTrial(T, trial, { free = false } = {}) {
      (game.s.trials[T] ||= []).push({ valid: true, ...trial });
      emit('trial', { T, index: game.s.trials[T].length - 1 });
      if (!free) game.spend(TRIAL_COST);
    },
    /** The hands-on part is complete: HAND_TEMP_COUNT temperatures with HAND_REPEATS valid student trials each. */
    handDone() {
      const full = game.handTemps().filter(T => game.s.trials[T].filter(t => t.by === 'student' && t.valid).length >= HAND_REPEATS);
      return full.length >= HAND_TEMP_COUNT;
    },
    /** Temperatures the student measured by hand (a valid student trial), ascending. */
    handTemps() {
      return Object.entries(game.s.trials).filter(([, l]) => l.some(t => t.by === 'student' && t.valid)).map(([T]) => Number(T)).sort((a, b) => a - b);
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
      const ch = snap.chapter;
      if (game.s.over) overs[ch] = (overs[ch] || 0) + 1;
      game.s = clone(snap);
      game.s.over = false;
      if (hadGameOver) game.s.flags.hadGameOver = true;
      game.s.score -= GAMEOVER_SCORE * (overs[ch] || 0);
      if ((overs[ch] || 0) >= 2 && game.s.o2 < RESERVE_O2) { game.s.o2 = RESERVE_O2; game.s.flags.reserveUsed = true; }
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

    /** Feedback on the robot's extra temperatures; coverage counts the hand temperatures too, cost only the robot's. */
    planFeedback(robotTemps) {
      if (robotTemps.length < ROBOT_MIN) return { ok: false, msg: 'few' };
      if (robotTemps.length > ROBOT_MAX) return { ok: false, msg: 'many' };
      const all = [...robotTemps, ...game.handTemps()];
      if (!all.some(t => t <= 35) || !all.some(t => t >= 45)) return { ok: false, msg: 'oneSided' };
      const cost = robotTemps.length * 3 * TRIAL_COST + 2 * TRIAL_COST;   // + a margin for redoing a spoiled trial
      if (cost >= game.s.o2) return { ok: false, msg: 'budget', cost };
      return { ok: true, msg: null, cost };
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
