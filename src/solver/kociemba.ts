/** Thin wrapper over cubejs (Kociemba two-phase). Heavy: call init once, ideally in a worker. */

import Cube from 'cubejs';
import type { SolveFn } from '../oll/setup';

let ready = false;

export function initKociemba(): void {
  if (ready) return;
  Cube.initSolver();
  ready = true;
}

export const kociembaSolve: SolveFn = (facelets, maxDepth) => {
  initKociemba();
  const cube = Cube.fromString(facelets);
  if (cube.isSolved()) return '';
  try {
    return cube.solve(maxDepth);
  } catch {
    return null; // no solution within maxDepth
  }
};
