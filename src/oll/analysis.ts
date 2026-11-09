/** Derived OLL data: patterns, classification of states. */

import { FaceletState, SOLVED } from '../cube/facelets';
import { applyMoves } from '../cube/moves';
import { Move, invertAlg, parseAlg } from '../cube/notation';
import { normalizeOrientation } from '../cube/orient';
import { OLL_CASES } from './cases';

const SIDE_STARTS = [9, 18, 36, 45]; // R F L B

/** First two layers solved (centers assumed canonical). */
export function isF2LSolved(s: FaceletState): boolean {
  for (let i = 27; i < 36; i++) if (s[i] !== 'D') return false;
  for (const start of SIDE_STARTS) {
    const center = s[start + 4];
    for (let k = 3; k < 9; k++) if (s[start + k] !== center) return false;
  }
  return true;
}

export function isLLOriented(s: FaceletState): boolean {
  for (let i = 0; i < 9; i++) if (s[i] !== 'U') return false;
  return true;
}

/**
 * 21 bits: the 9 U stickers then the top rows of F, R, B, L (each read left→right from outside),
 * '1' where the sticker shows the U color.
 */
export function ollMask(s: FaceletState): string {
  const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 18, 19, 20, 9, 10, 11, 45, 46, 47, 36, 37, 38];
  return idx.map((i) => (s[i] === 'U' ? '1' : '0')).join('');
}

const U_TURNS: Move[][] = [[], parseAlg('U'), parseAlg('U2'), parseAlg("U'")];

/** AUF-independent key of the orientation pattern. */
export function ollKey(s: FaceletState): string {
  return U_TURNS.map((t) => ollMask(applyMoves(s, t))).sort()[0];
}

/** State reached from solved by applying the inverse algorithm, normalized to canonical centers. */
export function caseStateFromAlg(alg: string): FaceletState {
  return normalizeOrientation(applyMoves(SOLVED, invertAlg(parseAlg(alg)))).state;
}

const KEY_TO_ID = new Map<string, number>();
for (const c of OLL_CASES) KEY_TO_ID.set(ollKey(caseStateFromAlg(c.alg)), c.id);

/**
 * Classifies a state: null if F2L is not solved, 0 if the last layer is already oriented,
 * otherwise the OLL case id.
 */
export function classifyOll(s: FaceletState): number | null {
  if (!isF2LSolved(s)) return null;
  if (isLLOriented(s)) return 0;
  return KEY_TO_ID.get(ollKey(s)) ?? null;
}

/** True if the state is exactly the given case in the standard angle of `alg`. */
export function isCaseInAngle(s: FaceletState, alg: string): boolean {
  return isF2LSolved(s) && ollMask(s) === ollMask(caseStateFromAlg(alg));
}
