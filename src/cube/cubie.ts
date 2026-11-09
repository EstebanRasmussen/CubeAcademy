import { t } from '../i18n';
/**
 * Cubie-level representation (Kociemba conventions), facelet ⇄ cubie conversion,
 * validation and group arithmetic.
 */

import { Face, FaceletState } from './facelets';

// Facelet indices, 0-based: U=0, R=9, F=18, D=27, L=36, B=45.
export const CORNER_FACELETS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];
export const EDGE_FACELETS: readonly (readonly [number, number])[] = [
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
  [1, 46], // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];
export const CORNER_COLORS: readonly (readonly [Face, Face, Face])[] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
export const EDGE_COLORS: readonly (readonly [Face, Face])[] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], ['D', 'R'], ['D', 'F'],
  ['D', 'L'], ['D', 'B'], ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];
export const CENTER_FACELETS = [4, 13, 22, 31, 40, 49];

export interface CubieCube {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

export function identityCubie(): CubieCube {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export type ValidationError =
  | { kind: 'length' }
  | { kind: 'centers' }
  | { kind: 'colorCount'; face: Face; count: number }
  | { kind: 'badCorner'; position: number }
  | { kind: 'badEdge'; position: number }
  | { kind: 'duplicateCorner' }
  | { kind: 'duplicateEdge' }
  | { kind: 'twist' }
  | { kind: 'flip' }
  | { kind: 'parity' };

export type ParseResult = { ok: true; cube: CubieCube } | { ok: false; error: ValidationError };

/** Converts a facelet state (with canonical centers) to cubies and validates it fully. */
export function faceletsToCubie(state: FaceletState): ParseResult {
  if (state.length !== 54) return { ok: false, error: { kind: 'length' } };
  if (CENTER_FACELETS.map((i) => state[i]).join('') !== 'URFDLB') return { ok: false, error: { kind: 'centers' } };
  for (const f of 'URFDLB' as unknown as Face[]) {
    const count = [...state].filter((c) => c === f).length;
    if (count !== 9) return { ok: false, error: { kind: 'colorCount', face: f, count } };
  }
  const cube = identityCubie();
  for (let i = 0; i < 8; i++) {
    const fl = CORNER_FACELETS[i];
    let ori = 0;
    while (ori < 3 && state[fl[ori]] !== 'U' && state[fl[ori]] !== 'D') ori++;
    if (ori === 3) return { ok: false, error: { kind: 'badCorner', position: i } };
    const c1 = state[fl[(ori + 1) % 3]];
    const c2 = state[fl[(ori + 2) % 3]];
    const c0 = state[fl[ori]];
    const j = CORNER_COLORS.findIndex((cc) => cc[0] === c0 && cc[1] === c1 && cc[2] === c2);
    if (j < 0) return { ok: false, error: { kind: 'badCorner', position: i } };
    cube.cp[i] = j;
    cube.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELETS[i];
    const j0 = EDGE_COLORS.findIndex((ec) => ec[0] === state[a] && ec[1] === state[b]);
    if (j0 >= 0) {
      cube.ep[i] = j0;
      cube.eo[i] = 0;
      continue;
    }
    const j1 = EDGE_COLORS.findIndex((ec) => ec[0] === state[b] && ec[1] === state[a]);
    if (j1 < 0) return { ok: false, error: { kind: 'badEdge', position: i } };
    cube.ep[i] = j1;
    cube.eo[i] = 1;
  }
  if (new Set(cube.cp).size !== 8) return { ok: false, error: { kind: 'duplicateCorner' } };
  if (new Set(cube.ep).size !== 12) return { ok: false, error: { kind: 'duplicateEdge' } };
  if (cube.co.reduce((a, b) => a + b, 0) % 3 !== 0) return { ok: false, error: { kind: 'twist' } };
  if (cube.eo.reduce((a, b) => a + b, 0) % 2 !== 0) return { ok: false, error: { kind: 'flip' } };
  if (permParity(cube.cp) !== permParity(cube.ep)) return { ok: false, error: { kind: 'parity' } };
  return { ok: true, cube };
}

export function cubieToFacelets(cube: CubieCube): FaceletState {
  const out: string[] = new Array(54);
  ['U', 'R', 'F', 'D', 'L', 'B'].forEach((f, i) => (out[CENTER_FACELETS[i]] = f));
  for (let i = 0; i < 8; i++) {
    const j = cube.cp[i];
    const ori = cube.co[i];
    for (let n = 0; n < 3; n++) out[CORNER_FACELETS[i][(n + ori) % 3]] = CORNER_COLORS[j][n];
  }
  for (let i = 0; i < 12; i++) {
    const j = cube.ep[i];
    const ori = cube.eo[i];
    for (let n = 0; n < 2; n++) out[EDGE_FACELETS[i][(n + ori) % 2]] = EDGE_COLORS[j][n];
  }
  return out.join('');
}

export function permParity(p: readonly number[]): number {
  let parity = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) parity ^= 1;
  return parity;
}

/** a then b (Kociemba multiply). */
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  return {
    cp: b.cp.map((p) => a.cp[p]),
    co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
    ep: b.ep.map((p) => a.ep[p]),
    eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
  };
}

export function inverse(a: CubieCube): CubieCube {
  const r = identityCubie();
  for (let i = 0; i < 8; i++) {
    r.cp[a.cp[i]] = i;
    r.co[a.cp[i]] = (3 - a.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[a.ep[i]] = i;
    r.eo[a.ep[i]] = a.eo[i];
  }
  return r;
}

export function describeError(e: ValidationError): string {
  return e.kind === 'colorCount' ? t('err.colorCount', { face: e.face, count: e.count }) : t('err.' + e.kind);
}
