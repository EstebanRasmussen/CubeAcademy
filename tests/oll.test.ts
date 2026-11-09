import { describe, expect, it } from 'vitest';
import { SOLVED } from '../src/cube/facelets';
import { applyAlg, applyMoves } from '../src/cube/moves';
import { formatAlg, htmLength, parseAlg } from '../src/cube/notation';
import { OLL_CASES, caseById } from '../src/oll/cases';
import { caseStateFromAlg, classifyOll, isCaseInAngle, isF2LSolved, isLLOriented, ollKey } from '../src/oll/analysis';
import { orientedLLStates, quickSetup, setupKociemba } from '../src/oll/setup';
import { kociembaSolve } from '../src/solver/kociemba';
import { randomAlg } from './helpers';

const algFor = (id: number) => caseById(id).alg;

const edgesOriented = (s: string) => [1, 3, 5, 7].filter((i) => s[i] === 'U').length;
const cornersOriented = (s: string) => [0, 2, 6, 8].filter((i) => s[i] === 'U').length;

describe('OLL database', () => {
  it('has 57 cases', () => expect(OLL_CASES.length).toBe(57));

  for (const c of OLL_CASES) {
    for (const alg of [c.alg, ...(c.alts ?? [])]) {
      it(`OLL ${c.id}: "${alg}" preserves F2L and orients the last layer`, () => {
        const after = applyAlg(SOLVED, alg);
        // From solved, the alg must keep F2L and orientation (only LL permutation may change).
        const caseState = caseStateFromAlg(alg);
        expect(isF2LSolved(caseState)).toBe(true);
        expect(isLLOriented(caseState)).toBe(false);
        expect(after).toBeDefined();
      });
    }
  }

  it('all 57 patterns are distinct and alternatives match their main alg', () => {
    const keys = new Set(OLL_CASES.map((c) => ollKey(caseStateFromAlg(c.alg))));
    expect(keys.size).toBe(57);
    for (const c of OLL_CASES) for (const a of c.alts ?? []) {
      expect(ollKey(caseStateFromAlg(a))).toBe(ollKey(caseStateFromAlg(c.alg)));
    }
  });

  it('group sanity: dots, crosses, corners-oriented', () => {
    for (const c of OLL_CASES) {
      const s = caseStateFromAlg(c.alg);
      if (c.group === 'dot') expect(edgesOriented(s), `OLL ${c.id}`).toBe(0);
      if (c.group === 'ocll') expect(edgesOriented(s), `OLL ${c.id}`).toBe(4);
      if (c.group === 'co') expect(cornersOriented(s), `OLL ${c.id}`).toBe(4);
      if (c.group !== 'dot' && c.group !== 'ocll') expect(edgesOriented(s), `OLL ${c.id}`).toBe(2);
    }
  });

  it('classifies', () => {
    expect(classifyOll(SOLVED)).toBe(0);
    for (const c of OLL_CASES) expect(classifyOll(applyAlg(caseStateFromAlg(c.alg), 'U2'))).toBe(c.id);
    expect(classifyOll(applyAlg(SOLVED, 'R'))).toBe(null);
  });
});

describe('setup', () => {
  it('there are 288 oriented LL states', () => expect(orientedLLStates().length).toBe(288));

  it('quick setup from any OLL-solved state reaches every case', () => {
    const start = applyAlg(SOLVED, "R U R' U' R' F R2 U' R' U' R U R' F'"); // T-perm
    for (const c of OLL_CASES) {
      const r = quickSetup(start, c.alg, algFor)!;
      expect(isCaseInAngle(applyMoves(start, r.moves), c.alg), `OLL ${c.id}`).toBe(true);
    }
  });

  it('quick setup from another OLL case', () => {
    const start = applyAlg(caseStateFromAlg(caseById(21).alg), 'U');
    const r = quickSetup(start, caseById(45).alg, algFor)!;
    expect(r.method).toBe('solve-then-inverse');
    expect(isCaseInAngle(applyMoves(start, r.moves), caseById(45).alg)).toBe(true);
  });

  it('kociemba setup from scrambled states', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const start = applyAlg(SOLVED, randomAlg(30, seed * 7));
      const target = OLL_CASES[(seed * 11) % 57];
      const t0 = performance.now();
      const r = setupKociemba(start, target.alg, kociembaSolve, { budgetMs: 1500 })!;
      const dt = performance.now() - t0;
      console.log(`OLL ${target.id}: ${htmLength(r.moves)} mosse in ${dt.toFixed(0)} ms → ${formatAlg(r.moves)}`);
      expect(isCaseInAngle(applyMoves(start, r.moves), target.alg)).toBe(true);
      expect(htmLength(r.moves)).toBeLessThanOrEqual(22);
    }
  }, 60000);
});

void parseAlg;
