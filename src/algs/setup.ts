/**
 * Generic setup: the shortest move sequence that brings the current cube into a case of any set, in
 * the angle its algorithm expects. Same strategies as the OLL trainer, generalized through patterns:
 *  A.  the cube looks solved for this set (up to a U turn) → inverse of the algorithm;
 *  A2. the cube is another case of the same set → its algorithm, then A;
 *  B.  anything else → Kociemba towards every state that has the case's pattern (in the worker).
 */

import { FaceletState, SOLVED } from '../cube/facelets';
import { applyMoves } from '../cube/moves';
import { Move, htmLength, invertAlg, parseAlg, simplify } from '../cube/notation';
import { cubieToFacelets, faceletsToCubie, inverse, multiply } from '../cube/cubie';
import { normalizeOrientation } from '../cube/orient';
import { PatternKind, pattern, solvedLike } from './pattern';
import type { SolveFn } from '../oll/setup';

export type SetupMethod = 'inverse' | 'solve-then-inverse' | 'kociemba' | 'already';
export interface SetupResult {
  moves: Move[];
  method: SetupMethod;
}

const AUF: Move[][] = [[], parseAlg('U'), parseAlg('U2'), parseAlg("U'")];

const AXIS_MAP: Record<'x' | 'y' | 'z', Record<string, string>> = {
  // after the rotation, the face now in position K was previously in position map[K]
  x: { U: 'F', F: 'D', D: 'B', B: 'U', R: 'R', L: 'L' },
  y: { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' },
  z: { U: 'L', L: 'D', D: 'R', R: 'U', F: 'F', B: 'B' },
};

/**
 * Rewrites an algorithm without whole-cube rotations (x y z): every later move is renamed to the face
 * it really turns. The result has the same effect up to a final re-orientation of the whole cube.
 */
export function unrotate(moves: readonly Move[]): Move[] {
  // frame[K] = physical face currently at position K
  let frame: Record<string, string> = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };
  const out: Move[] = [];
  for (const m of moves) {
    if (m.letter === 'x' || m.letter === 'y' || m.letter === 'z') {
      for (let k = 0; k < m.amount; k++) {
        const map = AXIS_MAP[m.letter];
        const next: Record<string, string> = {};
        for (const K of Object.keys(frame)) next[K] = frame[map[K]];
        frame = next;
      }
      continue;
    }
    const upper = m.letter.toUpperCase();
    if ('URFDLB'.includes(upper)) {
      const phys = frame[upper];
      out.push({ letter: (m.letter === upper ? phys : phys.toLowerCase()) as Move['letter'], amount: m.amount });
    } else out.push({ ...m }); // slices: kept (rare in setups)
  }
  return out;
}

export function caseState(alg: string): FaceletState {
  // rotations removed first: the user holds the case in the standard orientation and the algorithm
  // (with its rotations) must solve it from there
  return normalizeOrientation(applyMoves(SOLVED, invertAlg(unrotate(parseAlg(alg))))).state;
}

/** Normalized state after the moves (wide moves and rotations re-oriented). */
const after = (state: FaceletState, moves: readonly Move[]) => normalizeOrientation(applyMoves(state, moves)).state;

export function inCase(state: FaceletState, kind: PatternKind, alg: string): boolean {
  return pattern(state, kind) === pattern(caseState(alg), kind);
}

/** Patterns of a case in every pre/post U angle. */
export function caseVariants(kind: PatternKind, alg: string): Set<string> {
  const inv = invertAlg(unrotate(parseAlg(alg)));
  const out = new Set<string>();
  for (const a of AUF) for (const b of AUF) out.add(pattern(after(SOLVED, [...a, ...inv, ...b]), kind));
  return out;
}

/** The inverse used as a setup: rotation-free, leading U turns kept only if they matter. */
function inverseCandidates(alg: string): Move[][] {
  const inv = simplify(invertAlg(unrotate(parseAlg(alg))));
  let k = 0;
  while (k < inv.length && inv[k].letter === 'U') k++;
  return k ? [inv, inv.slice(k)] : [inv];
}

function shortest(list: (Move[] | null)[]): Move[] | null {
  let best: Move[] | null = null;
  for (const m of list) if (m && (!best || htmLength(m) < htmLength(best))) best = m;
  return best;
}

function fromSolvedLike(state: FaceletState, kind: PatternKind, alg: string, target: string): Move[] | null {
  const found: Move[][] = [];
  for (const a of AUF) for (const inv of inverseCandidates(alg)) {
    const m = simplify([...a, ...inv]);
    if (pattern(after(state, m), kind) === target) found.push(m);
  }
  return shortest(found);
}

export interface SetCase {
  alg: string;
  kind: PatternKind;
}

/** Instant strategies (no solver). `others`: the other cases of the set, with the user's algorithms. */
export function quickSetupFor(state: FaceletState, kind: PatternKind, alg: string, others: readonly SetCase[]): SetupResult | null {
  const target = pattern(caseState(alg), kind);
  if (pattern(state, kind) === target) return { moves: [], method: 'already' };
  const direct = fromSolvedLike(state, kind, alg, target);
  if (direct) return { moves: direct, method: 'inverse' };
  // another case of the set, in some angle: execute its algorithm, then the inverse
  const found: Move[][] = [];
  for (const o of others) {
    const variants = caseVariants(o.kind, o.alg);
    const oMoves = unrotate(parseAlg(o.alg));
    for (const b of AUF) {
      const s1 = applyMoves(state, b);
      if (!variants.has(pattern(s1, o.kind))) continue;
      const n = normalizeOrientation(applyMoves(s1, oMoves));
      if (n.rotation.length) continue; // re-grip in the middle: not worth it
      const rest = fromSolvedLike(n.state, kind, alg, target);
      if (rest) found.push(simplify([...b, ...oMoves, ...rest]));
    }
  }
  const best = shortest(found);
  return best ? { moves: best, method: 'solve-then-inverse' } : null;
}

export interface KociembaOptions {
  budgetMs?: number;
  now?: () => number;
}

/** Strategy B: Kociemba towards every state T = P · inv(alg), P looking solved under the pattern. */
export function kociembaSetupFor(state: FaceletState, kind: PatternKind, alg: string, solve: SolveFn, opts: KociembaOptions = {}): SetupResult | null {
  const now = opts.now ?? (() => performance.now());
  const deadline = now() + (opts.budgetMs ?? 1500);
  const parsed = faceletsToCubie(state);
  if (!parsed.ok) return null;
  const C = parsed.cube;
  // the case reached from solved (normalized: rotations and wide moves re-oriented away)
  const inv = faceletsToCubie(caseState(alg));
  if (!inv.ok) return null;
  const target = pattern(caseState(alg), kind);
  const candidates = solvedLike(kind).map((P) => {
    const S = multiply(inverse(multiply(P, inv.cube)), C);
    let score = 0;
    for (let i = 0; i < 8; i++) if (S.cp[i] === i && S.co[i] === 0) score++;
    for (let i = 0; i < 12; i++) if (S.ep[i] === i && S.eo[i] === 0) score++;
    return { S, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  let best: Move[] | null = null;
  for (const { S } of candidates) {
    if (best && now() > deadline) break;
    if (now() > deadline + 4000) break; // hard stop
    const sol = solve(cubieToFacelets(S), 22);
    if (sol === null) continue;
    const moves = parseAlg(sol);
    if (pattern(after(state, moves), kind) !== target) continue; // defensive
    if (!best || htmLength(moves) < htmLength(best)) best = moves;
  }
  return best ? { moves: best, method: 'kociemba' } : null;
}
