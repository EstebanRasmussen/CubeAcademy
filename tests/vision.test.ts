import { describe, expect, it } from 'vitest';
import { FACES, FACE_COLOR, Face, SOLVED, faceOf } from '../src/cube/facelets';
import { applyAlg } from '../src/cube/moves';
import { rgbToLab, labToRgb, Lab } from '../src/vision/color';
import { hungarian } from '../src/vision/colorClassifier';
import { assembleCube, rotateGrid } from '../src/vision/faceAssembler';
import { finishScanLabs } from '../src/vision/session';
import { randomAlg } from './helpers';

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// Warm, dim light: red and orange end up close together.
const BASE: Record<string, [number, number, number]> = {
  white: [200, 190, 160], yellow: [215, 185, 30], green: [30, 130, 60],
  blue: [30, 60, 140], red: [175, 45, 35], orange: [210, 90, 30],
};

function noisyLab(color: string): Lab {
  const [r, g, b] = BASE[color].map((v) => Math.max(0, Math.min(255, Math.round(v * (0.85 + rnd() * 0.25) + (rnd() - 0.5) * 16))));
  return rgbToLab(r, g, b);
}

describe('color', () => {
  it('lab round-trip', () => {
    expect(labToRgb(rgbToLab(10, 200, 99))).toEqual([10, 200, 99]);
  });
  it('hungarian solves a small assignment', () => {
    expect(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]])).toEqual([1, 0, 2]);
  });
});

describe('scan pipeline (synthetic)', () => {
  for (let s = 1; s <= 40; s++) {
    it(`reconstructs scrambled cube #${s} from rotated, shuffled, noisy faces`, () => {
      const state = applyAlg(SOLVED, randomAlg(25, s * 31));
      const order = [...FACES].sort(() => rnd() - 0.5);
      const shown = order.map((f) => {
        const grid = rotateGrid([...faceOf(state, f)] as Face[], Math.floor(rnd() * 4));
        return grid.map((l) => noisyLab(FACE_COLOR[l]));
      });
      const res = finishScanLabs(shown).assembled;
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.state).toBe(state);
    });
  }

  it('solved cube is not ambiguous', () => {
    const faces = Object.fromEntries(FACES.map((f) => [f, { colors: Array(9).fill(FACE_COLOR[f]) }]));
    const res = assembleCube(faces);
    expect(res.ok && res.state).toBe(SOLVED);
  });
});
