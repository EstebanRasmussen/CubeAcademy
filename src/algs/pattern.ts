/**
 * What a case "is": a pattern of the cube where some pieces must be exactly in place, some only
 * oriented (their U-color sticker up or not), and some don't matter. Two states are the same case in
 * the same angle when their patterns are equal.
 */

import { FaceletState, SOLVED } from '../cube/facelets';
import { CORNER_COLORS, CORNER_FACELETS, CubieCube, EDGE_COLORS, EDGE_FACELETS, cubieToFacelets, identityCubie, permParity } from '../cube/cubie';

export type PieceMode = 'exact' | 'orient' | 'ignore';

/**
 * - oll: first two layers exact, last layer only oriented
 * - eo:  like oll, last-layer corners ignored (2-look OLL, first look)
 * - cp:  first two layers + last-layer corners exact, last-layer edges only oriented (2-look PLL, first look)
 * - pll: everything exact
 * - f2l: everything exact except the last layer, ignored
 */
export type PatternKind = 'oll' | 'eo' | 'cp' | 'pll' | 'f2l';

const key = (letters: string) => letters.split('').sort().join('');

function modeFor(kind: PatternKind, letters: readonly string[]): PieceMode {
  if (!letters.includes('U')) return 'exact';
  const corner = letters.length === 3;
  switch (kind) {
    case 'oll': return 'orient';
    case 'eo': return corner ? 'ignore' : 'orient';
    case 'cp': return corner ? 'exact' : 'orient';
    case 'pll': return 'exact';
    case 'f2l': return 'ignore';
  }
}

const MODES = new Map<PatternKind, Map<string, PieceMode>>();
for (const kind of ['oll', 'eo', 'cp', 'pll', 'f2l'] as PatternKind[]) {
  const m = new Map<string, PieceMode>();
  for (const c of CORNER_COLORS) m.set(key(c.join('')), modeFor(kind, c));
  for (const e of EDGE_COLORS) m.set(key(e.join('')), modeFor(kind, e));
  MODES.set(kind, m);
}

export function pattern(state: FaceletState, kind: PatternKind): string {
  const modes = MODES.get(kind)!;
  const out = state.split('');
  const apply = (idx: readonly number[]) => {
    const mode = modes.get(key(idx.map((i) => state[i]).join(''))) ?? 'exact';
    if (mode === 'exact') return;
    for (const i of idx) out[i] = mode === 'ignore' ? '-' : state[i] === 'U' ? 'U' : 'x';
  };
  CORNER_FACELETS.forEach(apply);
  EDGE_FACELETS.forEach(apply);
  return out.join('');
}

const permutations4 = (): number[][] => {
  const out: number[][] = [];
  const rec = (cur: number[]) => {
    if (cur.length === 4) return void out.push(cur.slice());
    for (let i = 0; i < 4; i++) if (!cur.includes(i)) rec([...cur, i]);
  };
  rec([]);
  return out;
};

const SOLVED_LIKE = new Map<PatternKind, CubieCube[]>();

/** All states that look solved under the pattern (they differ only in ignored/orientation-free pieces). */
export function solvedLike(kind: PatternKind): CubieCube[] {
  const cached = SOLVED_LIKE.get(kind);
  if (cached) return cached;
  const target = pattern(SOLVED, kind);
  const perms = permutations4();
  const cos: number[][] = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) cos.push([a, b, c, (6 - a - b - c) % 3]);
  const eos: number[][] = [];
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) eos.push([a, b, c, (a + b + c) % 2]);
  const out: CubieCube[] = [];
  for (const cp of perms) for (const ep of perms) {
    if (permParity(cp) !== permParity(ep)) continue;
    for (const co of kind === 'eo' || kind === 'f2l' ? cos : [[0, 0, 0, 0]])
      for (const eo of kind === 'f2l' ? eos : [[0, 0, 0, 0]]) {
        const c = identityCubie();
        c.cp.splice(0, 4, ...cp);
        c.co.splice(0, 4, ...co);
        c.ep.splice(0, 4, ...ep);
        c.eo.splice(0, 4, ...eo);
        if (pattern(cubieToFacelets(c), kind) === target) out.push(c);
      }
  }
  SOLVED_LIKE.set(kind, out);
  return out;
}
