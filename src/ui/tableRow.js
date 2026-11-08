// One wall-table row: the valid readings (up to three), how many were struck out, and the mean of the valid ones.
import { mean } from '../game/model.js';

export function tableRow(list) {
  const valid = list.filter(t => t.valid).map(t => t.volume);
  return { cells: valid.slice(0, 3), struck: list.length - valid.length, mean: mean(valid) };
}
