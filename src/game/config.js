// Tunable game constants (spec §7, plan Global Constraints).
export const O2_START = 360;          // game-minutes of oxygen
export const TRIAL_COST = 15;         // game-minutes per trial
export const PENALTY = { noGoggles: 10, sealedStopper: 15, excessYeast: 15, boiling: 15 };
export const MISTAKE_SCORE = 50;
export const SLIDER = { min: 5, max: 70, step: 5 };
export const HAND_TEMPS = [10, 20, 30, 40, 50, 60, 70, 90];   // chips for the hands-on trials (90 = boil trap)
export const HAND_TEMP_COUNT = 2;      // the student measures two temperatures by hand...
export const HAND_REPEATS = 3;         // ...three valid repeats each
export const ROBOT_MIN = 3;            // extra temperatures the student gives the robot
export const ROBOT_MAX = 5;
export const CHAPTERS = ['intro', 'hypothesis', 'bench', 'robot', 'graph', 'rescue', 'life', 'end'];
export const SAVE_KEY = 'oxylab.v1';
