/**
 * Fingertrick suggestions for the standard home grip (thumbs on F, index fingers on U, right hand
 * doing R with the wrist). Heuristic, context-aware on the previous moves: this is what most
 * tutorials teach, not the only way.
 */

import { Move } from './notation';

/** Translation keys (see i18n): `ft.<key>`. */
export type FingerKey =
  | 'rWrist' | 'lWrist' | 'rWrist2' | 'lWrist2'
  | 'rIndex' | 'lIndex' | 'rIndex2' | 'lIndex2'
  | 'rThumb' | 'lThumb' | 'rRing' | 'lRing'
  | 'rIndexF' | 'lIndexF'
  | 'lRingM' | 'rotate' | 'regrip';

const isRight = (m: Move | undefined) => !!m && 'Rr'.includes(m.letter);
const isLeft = (m: Move | undefined) => !!m && 'Ll'.includes(m.letter);

export function fingerFor(moves: readonly Move[], i: number): FingerKey {
  const m = moves[i];
  const prev = moves[i - 1];
  const prime = m.amount === 3;
  const two = m.amount === 2;
  switch (m.letter) {
    case 'R': case 'r':
      return two ? 'rWrist2' : 'rWrist';
    case 'L': case 'l':
      return two ? 'lWrist2' : 'lWrist';
    case 'U': case 'u':
      // U2 is flicked by the hand that is free: after a left-hand move, with the left index
      if (two) return isLeft(prev) ? 'lIndex2' : 'rIndex2';
      return prime ? 'lIndex' : 'rIndex';
    case 'D': case 'd':
      return two ? 'lRing' : prime ? 'rRing' : 'lRing';
    case 'F': case 'f':
      // after R' the right index rests on F's top: F is pushed down by it; F' by the left thumb/index
      if (two) return 'rIndexF';
      if (!prime) return isRight(prev) ? 'rIndexF' : 'rThumb';
      return 'lThumb';
    case 'B': case 'b':
      return prime ? 'lRing' : 'rRing';
    case 'M':
      return 'lRingM';
    case 'E': case 'S':
      return 'regrip';
    case 'x': case 'y': case 'z':
      return 'rotate';
  }
}
