import { describe, expect, it } from 'vitest';
import { SOLVED } from '../src/cube/facelets';
import { applyAlg, applyMoves } from '../src/cube/moves';
import { htmLength } from '../src/cube/notation';
import { normalizeOrientation } from '../src/cube/orient';
import { solveBeginner } from '../src/guide/beginner';
import { randomAlg } from './helpers';

describe('beginner (layer by layer) guide', () => {
  it('solved cube: no moves', () => {
    expect(solveBeginner(SOLVED).every((s) => s.moves.length === 0)).toBe(true);
  });
  it('solves 30 random cubes, stage by stage', () => {
    let total = 0;
    const t0 = performance.now();
    for (let n = 1; n <= 30; n++) {
      const start = applyAlg(SOLVED, randomAlg(25, n * 97));
      const stages = solveBeginner(start);
      let cur = start;
      for (const st of stages) {
        cur = applyMoves(cur, st.moves);
        // every stage ends in the standard orientation (rotations undone)
        expect(normalizeOrientation(cur).rotation.length, `${n} ${st.id}`).toBe(0);
        const covered = st.segments.reduce((a, s) => a + s.end - s.start, 0);
        expect(covered, `${n} ${st.id} segments`).toBe(st.moves.length);
      }
      expect(cur, `cube ${n}`).toBe(SOLVED);
      total += stages.reduce((a, s) => a + htmLength(s.moves), 0);
    }
    console.log(`beginner: ${(total / 30).toFixed(0)} moves on average, ${((performance.now() - t0) / 30).toFixed(0)} ms per cube`);
  }, 120000);
});
