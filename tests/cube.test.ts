import { describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import { SOLVED } from '../src/cube/facelets';
import { applyAlg, applyMoves } from '../src/cube/moves';
import { formatAlg, invertAlg, parseAlg, simplify } from '../src/cube/notation';
import { cubieToFacelets, faceletsToCubie, inverse, multiply } from '../src/cube/cubie';
import { ROTATIONS, normalizeOrientation } from '../src/cube/orient';
import { randomAlg } from './helpers';


describe('notation', () => {
  it('parses and formats', () => {
    expect(formatAlg(parseAlg("R U2 R' Rw u2' (F)"))).toBe("R U2 R' r u2 F");
  });
  it('inverts', () => {
    expect(formatAlg(invertAlg(parseAlg("R U R' F2")))).toBe("F2 R U' R'");
  });
  it('simplifies', () => {
    expect(formatAlg(simplify(parseAlg("R R U U' R2 R")))).toBe('R');
    expect(formatAlg(simplify(parseAlg("R U U U F F'")))).toBe("R U'");
  });
});

describe('moves', () => {
  it('quarter turns have order 4', () => {
    for (const l of 'URFDLBMESxyzurfdlb') {
      expect(applyAlg(SOLVED, `${l} ${l} ${l} ${l}`)).toBe(SOLVED);
      expect(applyAlg(SOLVED, l)).not.toBe(SOLVED);
    }
  });
  it('sexy move has order 6', () => {
    const sexy = "R U R' U' ";
    expect(applyAlg(SOLVED, sexy.repeat(6))).toBe(SOLVED);
    expect(applyAlg(SOLVED, sexy.repeat(3))).not.toBe(SOLVED);
  });
  it('alg followed by inverse is identity', () => {
    const alg = parseAlg(randomAlg(40) + " r M' x y' S E f2 b' d l");
    expect(applyMoves(applyMoves(SOLVED, alg), invertAlg(alg))).toBe(SOLVED);
  });
  it('matches cubejs on face turns', () => {
    for (let seed = 1; seed < 20; seed++) {
      const alg = randomAlg(25, seed);
      expect(applyAlg(SOLVED, alg)).toBe(new Cube().move(alg).asString());
    }
  });
  it('wide moves and slices are consistent', () => {
    expect(applyAlg(SOLVED, 'r')).toBe(applyAlg(SOLVED, "R M'"));
    expect(applyAlg(SOLVED, 'x')).toBe(applyAlg(SOLVED, "R M' L'"));
    expect(applyAlg(SOLVED, 'y')).toBe(applyAlg(SOLVED, "U E' D'"));
    expect(applyAlg(SOLVED, 'z')).toBe(applyAlg(SOLVED, "F S B'"));
  });
});

describe('cubie', () => {
  it('round-trips and validates', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = applyAlg(SOLVED, randomAlg(30, seed));
      const r = faceletsToCubie(s);
      expect(r.ok).toBe(true);
      if (r.ok) expect(cubieToFacelets(r.cube)).toBe(s);
    }
  });
  it('detects twisted corner, flipped edge and swapped pieces', () => {
    const s = [...SOLVED];
    [s[8], s[9], s[20]] = [s[9], s[20], s[8]];
    expect(faceletsToCubie(s.join('')).ok).toBe(false);
    const e = [...SOLVED];
    [e[5], e[10]] = [e[10], e[5]];
    expect(faceletsToCubie(e.join('')).ok).toBe(false);
  });
  it('multiply matches move composition', () => {
    const a = applyAlg(SOLVED, randomAlg(20, 3));
    const b = applyAlg(SOLVED, randomAlg(20, 4));
    const ab = applyAlg(SOLVED, randomAlg(20, 3) + ' ' + randomAlg(20, 4));
    const ca = faceletsToCubie(a);
    const cb = faceletsToCubie(b);
    if (!ca.ok || !cb.ok) throw new Error();
    expect(cubieToFacelets(multiply(ca.cube, cb.cube))).toBe(ab);
    expect(cubieToFacelets(multiply(ca.cube, inverse(ca.cube)))).toBe(SOLVED);
  });
});

describe('orientation', () => {
  it('has 24 rotations', () => expect(ROTATIONS.length).toBe(24));
  it('normalizes a rotated state', () => {
    const s = applyAlg(SOLVED, randomAlg(15, 9));
    const rotated = applyAlg(s, "x y2 z'");
    expect(normalizeOrientation(rotated).state).toBe(s);
  });
});
