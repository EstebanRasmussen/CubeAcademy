/**
 * Setup computation: the shortest move sequence that brings the current cube into a given OLL case,
 * in the angle expected by the algorithm.
 */

import { FaceletState } from '../cube/facelets';
import { applyMoves } from '../cube/moves';
import { Move, htmLength, invertAlg, parseAlg, simplify } from '../cube/notation';
import { CubieCube, cubieToFacelets, faceletsToCubie, identityCubie, inverse, multiply, permParity } from '../cube/cubie';
import { classifyOll, isCaseInAngle, isF2LSolved, isLLOriented } from './analysis';

export type SetupMethod = 'inverse' | 'solve-then-inverse' | 'kociemba' | 'already';

export interface SetupResult {
  moves: Move[];
  method: SetupMethod;
}

/** Inverse of the algorithm, dropping leading U turns (they do not change an oriented last layer). */
export function inverseSetup(targetAlg: string): Move[] {
  const inv = simplify(invertAlg(parseAlg(targetAlg)));
  let k = 0;
  while (k < inv.length && inv[k].letter === 'U') k++;
  return inv.slice(k);
}

/** Strategy A: F2L solved and last layer oriented. */
export function setupFromOriented(state: FaceletState, targetAlg: string): SetupResult | null {
  if (!isF2LSolved(state) || !isLLOriented(state)) return null;
  return { moves: inverseSetup(targetAlg), method: 'inverse' };
}

const AUFS: Move[][] = [[], parseAlg('U'), parseAlg('U2'), parseAlg("U'")];

/** Strategy A2: F2L solved, some other OLL case → solve it with its algorithm, then inverse setup. */
export function setupFromF2L(
  state: FaceletState,
  targetAlg: string,
  algFor: (caseId: number) => string,
): SetupResult | null {
  const id = classifyOll(state);
  if (id === null || id === 0) return null;
  const alg = algFor(id);
  for (const auf of AUFS) {
    const s = applyMoves(state, auf);
    if (isCaseInAngle(s, alg)) {
      const moves = simplify([...auf, ...parseAlg(alg), ...inverseSetup(targetAlg)]);
      return { moves, method: 'solve-then-inverse' };
    }
  }
  return null;
}

/** All 288 states with F2L solved and the last layer oriented (any permutation). */
export function orientedLLStates(): CubieCube[] {
  const perms4: number[][] = [];
  const rec = (cur: number[]) => {
    if (cur.length === 4) return perms4.push(cur.slice());
    for (let i = 0; i < 4; i++) if (!cur.includes(i)) rec([...cur, i]);
  };
  rec([]);
  const out: CubieCube[] = [];
  for (const cp of perms4) {
    for (const ep of perms4) {
      if (permParity(cp) !== permParity(ep)) continue;
      const c = identityCubie();
      c.cp.splice(0, 4, ...cp);
      c.ep.splice(0, 4, ...ep);
      out.push(c);
    }
  }
  return out;
}

/** Solves a facelet state; returns null if no solution within maxDepth. */
export type SolveFn = (facelets: FaceletState, maxDepth: number) => string | null;

export interface KociembaOptions {
  budgetMs?: number;
  now?: () => number;
}

/**
 * Strategy B (any valid state): try candidate targets T = P · inv(alg) for every oriented LL state P
 * and keep the shortest solution M of C·M = T, found by solving S = T⁻¹·C.
 */
export function setupKociemba(
  state: FaceletState,
  targetAlg: string,
  solve: SolveFn,
  opts: KociembaOptions = {},
): SetupResult | null {
  const now = opts.now ?? (() => performance.now());
  const deadline = now() + (opts.budgetMs ?? 1500);
  const parsed = faceletsToCubie(state);
  if (!parsed.ok) return null;
  const C = parsed.cube;
  const setupState = faceletsToCubie(applyMoves(cubieToFacelets(identityCubie()), inverseSetup(targetAlg)));
  if (!setupState.ok) return null;
  const invAlgCubie = setupState.cube;

  // Rank candidates by how many pieces already match, so promising ones are tried first.
  const candidates = orientedLLStates().map((P) => {
    const T = multiply(P, invAlgCubie);
    const S = multiply(inverse(T), C);
    let score = 0;
    for (let i = 0; i < 8; i++) if (S.cp[i] === i && S.co[i] === 0) score++;
    for (let i = 0; i < 12; i++) if (S.ep[i] === i && S.eo[i] === 0) score++;
    return { S, score };
  });
  candidates.sort((a, b) => b.score - a.score);

  // cubejs is fast at depth 22 (~10-150 ms) but can take tens of seconds when forced below ~21,
  // so instead of tightening the depth we try as many candidate targets as the time budget allows.
  let best: Move[] | null = null;
  for (const { S } of candidates) {
    if (best && now() > deadline) break;
    const sol = solve(cubieToFacelets(S), 22);
    if (sol === null) continue;
    const moves = parseAlg(sol);
    if (!isCaseInAngle(applyMoves(state, moves), targetAlg)) continue; // defensive check
    if (!best || htmLength(moves) < htmLength(best)) best = moves;
  }
  return best ? { moves: best, method: 'kociemba' } : null;
}

/** Fast strategies only (no solver). */
export function quickSetup(
  state: FaceletState,
  targetAlg: string,
  algFor: (caseId: number) => string,
): SetupResult | null {
  if (isCaseInAngle(state, targetAlg)) return { moves: [], method: 'already' };
  return setupFromOriented(state, targetAlg) ?? setupFromF2L(state, targetAlg, algFor);
}

export function bestSetup(...results: (SetupResult | null)[]): SetupResult | null {
  let best: SetupResult | null = null;
  for (const r of results) if (r && (!best || htmLength(r.moves) < htmLength(best.moves))) best = r;
  return best;
}
