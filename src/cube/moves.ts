/** Move application on facelet states. Permutations are derived from 3D geometry. */

import { FaceletState, GEOMETRY, Vec3, faceletIndexAt, SOLVED } from './facelets';
import { Move, MoveLetter, parseAlg } from './notation';

type Axis = 0 | 1 | 2;

interface MoveDef {
  axis: Axis;
  layers: number[];
  /** sign of a clockwise quarter turn as a right-handed rotation around +axis */
  sign: 1 | -1;
}

const ALL = [-1, 0, 1];

export const MOVE_DEFS: Record<MoveLetter, MoveDef> = {
  R: { axis: 0, layers: [1], sign: -1 },
  L: { axis: 0, layers: [-1], sign: 1 },
  U: { axis: 1, layers: [1], sign: -1 },
  D: { axis: 1, layers: [-1], sign: 1 },
  F: { axis: 2, layers: [1], sign: -1 },
  B: { axis: 2, layers: [-1], sign: 1 },
  M: { axis: 0, layers: [0], sign: 1 },
  E: { axis: 1, layers: [0], sign: 1 },
  S: { axis: 2, layers: [0], sign: -1 },
  r: { axis: 0, layers: [1, 0], sign: -1 },
  l: { axis: 0, layers: [-1, 0], sign: 1 },
  u: { axis: 1, layers: [1, 0], sign: -1 },
  d: { axis: 1, layers: [-1, 0], sign: 1 },
  f: { axis: 2, layers: [1, 0], sign: -1 },
  b: { axis: 2, layers: [-1, 0], sign: 1 },
  x: { axis: 0, layers: ALL, sign: -1 },
  y: { axis: 1, layers: ALL, sign: -1 },
  z: { axis: 2, layers: ALL, sign: -1 },
};

/** Rotate an integer vector by sign*90° around the given axis (right-handed). */
export function rotateVec(v: Vec3, axis: Axis, sign: 1 | -1): Vec3 {
  const [x, y, z] = v;
  if (axis === 0) return sign > 0 ? [x, -z, y] : [x, z, -y];
  if (axis === 1) return sign > 0 ? [z, y, -x] : [-z, y, x];
  return sign > 0 ? [-y, x, z] : [y, -x, z];
}

/** perm[j] = i means: after the move, facelet j holds what facelet i held before. */
function quarterPerm(def: MoveDef): number[] {
  const perm = new Array<number>(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  GEOMETRY.forEach((g, i) => {
    if (!def.layers.includes(g.pos[def.axis])) return;
    const j = faceletIndexAt(rotateVec(g.pos, def.axis, def.sign), rotateVec(g.normal, def.axis, def.sign));
    perm[j] = i;
  });
  return perm;
}

function compose(p: number[], q: number[]): number[] {
  // apply p then q
  return q.map((i) => p[i]);
}

const PERMS = new Map<string, number[]>();
for (const letter of Object.keys(MOVE_DEFS) as MoveLetter[]) {
  const q1 = quarterPerm(MOVE_DEFS[letter]);
  const q2 = compose(q1, q1);
  const q3 = compose(q2, q1);
  PERMS.set(letter + 1, q1);
  PERMS.set(letter + 2, q2);
  PERMS.set(letter + 3, q3);
}

export function applyMove(state: FaceletState, move: Move): FaceletState {
  const perm = PERMS.get(move.letter + move.amount)!;
  let out = '';
  for (let j = 0; j < 54; j++) out += state[perm[j]];
  return out;
}

export function applyMoves(state: FaceletState, moves: readonly Move[]): FaceletState {
  return moves.reduce(applyMove, state);
}

export function applyAlg(state: FaceletState, alg: string): FaceletState {
  return applyMoves(state, parseAlg(alg));
}

export function stateFromAlg(alg: string): FaceletState {
  return applyAlg(SOLVED, alg);
}
