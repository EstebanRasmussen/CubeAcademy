import { describe, expect, it } from 'vitest';
import { SOLVED } from '../src/cube/facelets';
import { applyAlg, applyMoves } from '../src/cube/moves';
import { formatAlg, htmLength, parseAlg, segmentsOf } from '../src/cube/notation';
import { groupedNotation } from '../src/cube/triggers';
import { normalizeOrientation } from '../src/cube/orient';
import { BUILTIN_SETS, F2L_SET, OLL2_SET, PLL2_SET, PLL_SET, caseKind } from '../src/algs/sets';
import { pattern, solvedLike } from '../src/algs/pattern';
import { caseState, caseVariants, inCase, kociembaSetupFor, quickSetupFor, unrotate } from '../src/algs/setup';
import { isF2LSolved, isLLOriented } from '../src/oll/analysis';
import { kociembaSolve } from '../src/solver/kociemba';
import { randomAlg } from './helpers';

describe('notation: groups, repeats, conjugates, commutators, triggers', () => {
  const same = (a: string, b: string) => expect(formatAlg(parseAlg(a))).toBe(formatAlg(parseAlg(b)));
  it('expands', () => {
    same("(R U R' U')3", "R U R' U' R U R' U' R U R' U'");
    same("(R U)'", "U' R'");
    same('[R: U]', "R U R'");
    same('[R, U]', "R U R' U'");
    same("[F: [R, U]]", "F R U R' U' F'");
    same("[R U R', D]2", "R U R' D R U' R' D' R U R' D R U' R' D'");
    same("sexy sledge", "R U R' U' R' F R F'");
    same("Sune", "R U R' U R U2 R'");
    same("RUR'U'", "R U R' U'");
    same("R2' U3", "R2 U'");
    same("[R U R' U']", "R U R' U'");
    same("(sexy)2", "R U R' U' R U R' U'");
  });
  it('rejects bad input', () => {
    expect(() => parseAlg('R Q')).toThrow();
    expect(() => parseAlg('(R U')).toThrow();
    expect(() => parseAlg('[R U: ')).toThrow();
  });
  it('segments and grouped notation', () => {
    expect(segmentsOf("(R U R' U') sledge U").map((s) => [s.start, s.end, s.trigger])).toEqual([[0, 4, null], [4, 8, 'sledge']]);
    expect(groupedNotation(parseAlg("F R U R' U' R U R' U' F'"))).toBe("F (R U R' U')2 F'");
  });
  it('unrotate keeps the effect', () => {
    for (const alg of ["R' U R' U' y R' F' R2 U' R' U R' F R F", "x R' U R' D2 R U' R' D2 R2 x'", "y R U z' F x2 U"]) {
      const a = normalizeOrientation(applyAlg(SOLVED, alg)).state;
      const b = normalizeOrientation(applyMoves(SOLVED, unrotate(parseAlg(alg)))).state;
      expect(b, alg).toBe(a);
    }
  });
});

describe('algorithm sets', () => {
  for (const set of BUILTIN_SETS) {
    it(`${set.id}: every case is distinct and keeps what it must keep`, () => {
      const keys = new Set<string>();
      for (const c of set.cases) {
        const kind = caseKind(set, c);
        for (const alg of [c.alg, ...(c.alts ?? [])]) {
          const s = caseState(alg);
          expect(pattern(s, kind), `${set.id} ${c.id}: "${alg}" is solved`).not.toBe(pattern(SOLVED, kind));
          if (set.id !== 'f2l') expect(isF2LSolved(s), `${set.id} ${c.id}: F2L kept`).toBe(true);
          if (kind === 'pll') expect(isLLOriented(s), `${set.id} ${c.id}: LL oriented`).toBe(true);
          // the algorithm solves its case (under its pattern)
          expect(pattern(normalizeOrientation(applyAlg(s, alg)).state, kind), `${set.id} ${c.id} solves`).toBe(pattern(SOLVED, kind));
          if (alg !== c.alg) expect(caseVariants(kind, alg).has(pattern(caseState(c.alg), kind)), `${set.id} ${c.id} alt`).toBe(true);
        }
        const k = [...caseVariants(kind, c.alg)].sort()[0] + kind;
        expect(keys.has(k), `${set.id} ${c.id} duplicate`).toBe(false);
        keys.add(k);
      }
    });
  }
  it('sizes', () => {
    expect(PLL_SET.cases.length).toBe(21);
    expect(F2L_SET.cases.length).toBe(41);
    expect(OLL2_SET.cases.length).toBe(10);
    expect(PLL2_SET.cases.length).toBe(6);
  });
  it('F2L algorithms keep the cross and the other slots', () => {
    const otherSlots = [21, 24, 27, 30, 33, 36, 39, 42, 44, 45, 48, 51, 53, 28, 31, 34, 32, 30, 25];
    for (const c of F2L_SET.cases) {
      const s = caseState(c.alg);
      for (const i of [28, 30, 32, 34, 27, 33, 31, 25, 43, 52, 24, 44, 33, 42, 53, 50, 39, 41, 21]) expect(s[i], `F2L ${c.id} @${i}`).toBe(SOLVED[i]);
      void otherSlots;
    }
  });
  it('solved-like states', () => {
    expect(solvedLike('pll').length).toBe(1);
    expect(solvedLike('oll').length).toBe(288);
    expect(solvedLike('f2l').length).toBe(62208);
  });
});

describe('generic setup', () => {
  const others = (set: typeof PLL_SET) => set.cases.map((c) => ({ alg: c.alg, kind: caseKind(set, c) }));
  it('quick setup reaches every case of every set from solved and from another case', () => {
    for (const set of BUILTIN_SETS) {
      for (const c of set.cases) {
        const kind = caseKind(set, c);
        for (const start of [SOLVED, applyAlg(SOLVED, "U R U R' U' R' F R2 U' R' U' R U R' F' U2")]) {
          const r = quickSetupFor(start, kind, c.alg, others(set));
          expect(r, `${set.id} ${c.id}`).not.toBeNull();
          expect(inCase(normalizeOrientation(applyMoves(start, r!.moves)).state, kind, c.alg), `${set.id} ${c.id}`).toBe(true);
        }
      }
    }
  });
  it('quick setup from another PLL case', () => {
    const start = applyAlg(caseState(PLL_SET.cases[6].alg), 'U'); // T perm, turned
    const target = PLL_SET.cases[0];
    const r = quickSetupFor(start, 'pll', target.alg, others(PLL_SET))!;
    expect(r.method).not.toBe('kociemba');
    expect(inCase(normalizeOrientation(applyMoves(start, r.moves)).state, 'pll', target.alg)).toBe(true);
  });
  it('kociemba setup from scrambles, for PLL and F2L', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const start = applyAlg(SOLVED, randomAlg(30, seed * 13));
      for (const [set, k] of [[PLL_SET, seed * 5], [F2L_SET, seed * 7]] as const) {
        const c = set.cases[k % set.cases.length];
        const r = kociembaSetupFor(start, set.kind, c.alg, kociembaSolve, { budgetMs: 800 })!;
        expect(r, `${set.id} ${c.id}`).not.toBeNull();
        expect(inCase(normalizeOrientation(applyMoves(start, r.moves)).state, set.kind, c.alg)).toBe(true);
        expect(htmLength(r.moves)).toBeLessThanOrEqual(22);
      }
    }
  }, 60000);
});
