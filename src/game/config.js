// Tunable game constants (spec §7, plan Global Constraints).
export const O2_START = 360;          // game-minutes of oxygen
export const TRIAL_COST = 15;         // game-minutes per trial
export const PENALTY = { noGoggles: 10, sealedStopper: 15, excessYeast: 15, boiling: 15 };
export const MISTAKE_SCORE = 50;
export const PLAN_MIN = 5;
export const PLAN_MAX = 7;
export const SLIDER = { min: 5, max: 70, step: 5 };
export const FIRST_TEMP = 37;
export const CHAPTERS = ['hypothesis', 'bench', 'robot', 'graph', 'end'];
export const SAVE_KEY = 'oxylab.v1';
