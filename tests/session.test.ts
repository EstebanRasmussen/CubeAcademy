import { describe, expect, it } from 'vitest';
import { FACES, SOLVED } from '../src/cube/facelets';
import { applyAlg } from '../src/cube/moves';
import { detectFaces } from '../src/vision/detector';
import { PASTEL_RGB, SceneOptions, poseFacing, renderCube } from '../src/vision/raster';
import { ScanSession, ScanResult } from '../src/vision/session';
import { randomAlg } from './helpers';

function scan(state: string, seed: number, tint: [number, number, number], extra: Partial<SceneOptions> = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const session = new ScanSession();
  let result: ScanResult | null = null;
  const order = [...FACES].sort(() => rnd() - 0.5);
  let frames = 0;
  for (const face of order) {
    // the cube drifts and turns while a face is shown: no holding still
    const base: [number, number, number] = [(rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 1.5];
    const z = 9 + rnd() * 6;
    for (let k = 0; k < 4; k++) {
      const tilt: [number, number, number] = [base[0] + k * 0.04, base[1] - k * 0.05, base[2] + k * 0.03];
      const pos: [number, number, number] = [(rnd() - 0.5) * 2 + k * 0.15, (rnd() - 0.5) * 1.5, z];
      const img = renderCube(state, poseFacing(face, tilt, pos), { seed: seed * 100 + frames++, tint, ...extra });
      for (const ev of session.push(detectFaces(img).faces)) if (ev.type === 'complete') result = ev.result;
    }
  }
  return { result, session };
}

describe('scan session end-to-end (rendered frames → state)', () => {
  const tints: [number, number, number][] = [[1, 1, 1], [1, 0.88, 0.65], [0.8, 0.9, 1], [1, 0.8, 0.5], [1, 0.72, 0.38], [0.7, 0.85, 1]];
  for (let n = 1; n <= 18; n++) {
    it(`scan #${n} (light ${tints[n % 6].join('/')})`, () => {
      const state = applyAlg(SOLVED, randomAlg(25, n * 101));
      const { result, session } = scan(state, n, tints[n % 6]);
      expect(session.captured.length, 'faces captured').toBe(6);
      expect(result?.assembled.ok, result && !result.assembled.ok ? result.assembled.message : '').toBe(true);
      if (result?.assembled.ok) expect(result.assembled.state).toBe(state);
    });
  }
  it('solved cube under warm light (orange vs yellow faces are not merged)', () => {
    const { result, session } = scan(SOLVED, 99, [1, 0.8, 0.5]);
    expect(session.captured.length).toBe(6);
    expect(result?.assembled.ok && result.assembled.state).toBe(SOLVED);
  });
});

describe('pastel stickerless cube, different light on every face (like the real video)', () => {
  const tints: [number, number, number][] = [[1, 1, 1], [0.85, 0.92, 1], [1, 0.88, 0.7], [0.9, 1, 0.95]];
  // Casts up to ±15% per channel and per face (stronger than measured on the real video):
  // a few extreme combinations are expected to need a manual correction, but never a WRONG cube.
  it('reads ≥ 90% of 24 scans exactly and never returns a wrong valid cube', () => {
    let exact = 0;
    for (let n = 1; n <= 24; n++) {
      const state = applyAlg(SOLVED, randomAlg(25, n * 211));
      const { result, session } = scan(state, 50 + n, tints[n % 4], { palette: PASTEL_RGB, faceLight: 0.6, lightSeed: n });
      expect(session.captured.length, `scan ${n}: faces captured`).toBe(6);
      if (result?.assembled.ok) {
        expect(result.assembled.state, `scan ${n}: a valid but wrong cube`).toBe(state);
        exact++;
      }
    }
    console.log(`pastel: ${exact}/24 read exactly`);
    expect(exact).toBeGreaterThanOrEqual(22);
  }, 120000);
});

describe('guided scan: the user says which face is shown', () => {
  it('reads stickerless pastel cubes with merged same-colored pieces, shown in the guided order', async () => {
    const { GUIDED_ORDER } = await import('../src/vision/session');
    const { COLOR_FACE } = await import('../src/cube/facelets');
    let exact = 0;
    for (let n = 1; n <= 10; n++) {
      const state = applyAlg(SOLVED, randomAlg(25, n * 307));
      let s = n;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const session = new ScanSession();
      session.guided = true;
      session.reset();
      let result: ScanResult | null = null;
      let frames = 0;
      for (const color of GUIDED_ORDER) {
        const face = COLOR_FACE[color];
        const base: [number, number, number] = [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 1.5];
        const start: [number, number] = [(rnd() - 0.5) * 2, (rnd() - 0.5) * 1.5];
        for (let k = 0; k < 12; k++) { // under a second at 15 fps
          const tilt: [number, number, number] = [base[0] + k * 0.015, base[1] - k * 0.015, base[2]];
          const img = renderCube(state, poseFacing(face, tilt, [start[0] + k * 0.04, start[1] - k * 0.03, 10]) /* smooth hand drift */, {
            seed: n * 100 + frames++, palette: PASTEL_RGB, stickerless: true, faceLight: 0.4, lightSeed: n,
          });
          for (const ev of session.push(detectFaces(img).faces)) if (ev.type === 'complete') result = ev.result;
        }
      }
      if (result?.assembled.ok) {
        expect(result.assembled.state, `scan ${n}: a valid but wrong cube`).toBe(state);
        exact++;
      }
    }
    console.log(`guided stickerless: ${exact}/10 read exactly`);
    // Synthetic faces are held < 1 s each with a fixed angle: some scans stop on a face that is never
    // found (in the app: tilt the cube a little). What must never happen is a wrong cube (checked above).
    expect(exact).toBeGreaterThanOrEqual(4);
  }, 120000);
});
