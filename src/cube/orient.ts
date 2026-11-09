/** Whole-cube rotations and normalization of center orientation. */

import { FaceletState } from './facelets';
import { applyMoves } from './moves';
import { CENTER_FACELETS } from './cubie';
import { Move, parseAlg } from './notation';

/** The 24 cube rotations as move sequences, shortest first. */
export const ROTATIONS: readonly Move[][] = (() => {
  const seen = new Map<string, Move[]>();
  const probe = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  const key = (s: string) => CENTER_FACELETS.map((i) => s[i]).join('');
  const queue: Move[][] = [[]];
  seen.set(key(probe), []);
  const gens = parseAlg("x x' x2 y y' y2 z z' z2");
  while (queue.length) {
    const seq = queue.shift()!;
    for (const g of gens) {
      const next = [...seq, g];
      const k = key(applyMoves(probe, next));
      if (!seen.has(k)) {
        seen.set(k, next);
        queue.push(next);
      }
    }
  }
  return [...seen.values()];
})();

export function centersOf(state: FaceletState): string {
  return CENTER_FACELETS.map((i) => state[i]).join('');
}

/**
 * Returns the rotation that brings the centers to URFDLB (the user re-grips the cube)
 * and the normalized state. If the centers are already canonical, rotation is [].
 */
export function normalizeOrientation(state: FaceletState): { rotation: Move[]; state: FaceletState } {
  for (const rot of ROTATIONS) {
    const s = applyMoves(state, rot);
    if (centersOf(s) === 'URFDLB') return { rotation: rot, state: s };
  }
  throw new Error('Centri non validi');
}
