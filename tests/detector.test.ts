import { describe, expect, it } from 'vitest';
import { FACES, SOLVED } from '../src/cube/facelets';
import { applyAlg } from '../src/cube/moves';
import { detectFaces } from '../src/vision/detector';
import { poseFacing, renderCube } from '../src/vision/raster';
import { rotateGrid } from '../src/vision/faceAssembler';
import { randomAlg } from './helpers';

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** Facelet ids under each detected cell center, from the renderer's id buffer (ground truth). */
function idsAt(img: ReturnType<typeof renderCube>, centers: [number, number][]) {
  return centers.map(([x, y]) => img.ids[Math.round(y) * img.width + Math.round(x)]);
}

/** True if ids are exactly one face's facelets in a rotated (never mirrored or sheared) reading order. */
function isRotatedFace(ids: number[]): boolean {
  const face = Math.floor(ids[4] / 9);
  if (ids[4] !== face * 9 + 4) return false;
  const truth = Array.from({ length: 9 }, (_, i) => face * 9 + i);
  return [0, 1, 2, 3].some((k) => rotateGrid(truth, k).every((v, i) => v === ids[i]));
}

/**
 * A face found from stickers is used directly, so it must be right. A face found from corner holes is
 * only a hypothesis checked against the expected center color (guided scan): just counted here.
 */
function checkFace(img: ReturnType<typeof renderCube>, f: { centers: [number, number][]; fromHoles?: boolean; alternatives?: { centers: [number, number][] }[] }, s: number): boolean {
  const right = [f, ...(f.alternatives ?? [])].some((o) => isRotatedFace(idsAt(img, o.centers)));
  if (!f.fromHoles) expect(isRotatedFace(idsAt(img, f.centers)), `pose ${s}: wrong grid`).toBe(true);
  return right;
}

describe('free detector on rendered perspective scenes', () => {
  for (let s = 1; s <= 120; s++) {
    it(`pose #${s}`, () => {
      const state = applyAlg(SOLVED, randomAlg(25, s * 13));
      const face = FACES[s % 6];
      const tilt: [number, number, number] = [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 1.2];
      const z = 9 + rnd() * 8; // distance: the cube can be small in the frame
      const pos: [number, number, number] = [(rnd() - 0.5) * z * 0.45, (rnd() - 0.5) * z * 0.3, z];
      const img = renderCube(state, poseFacing(face, tilt, pos), { seed: s, tint: [1, 0.85 + rnd() * 0.15, 0.6 + rnd() * 0.3] });
      const { faces } = detectFaces(img);
      // Every detected face must be geometrically right: a wrong grid would poison the scan.
      for (const f of faces) checkFace(img, f, s);
      // The face turned toward the camera must be found.
      const frontal = faces.some((f) => Math.floor(idsAt(img, f.centers)[4] / 9) === FACES.indexOf(face));
      expect(frontal, `pose ${s}: frontal face not found (${faces.length} faces)`).toBe(true);
    });
  }
});

describe('fixed guide fallback', () => {
  it('reads a face that fills the guide, ignores an empty scene', async () => {
    const { readGuide } = await import('../src/vision/guide');
    const img = renderCube(SOLVED, poseFacing('F', [0, 0, 0], [0, 0, 8.5]), { glare: false, clutter: false, width: 480, height: 360 });
    const f = readGuide(img);
    expect(f).not.toBeNull();
    const empty = renderCube(SOLVED, poseFacing('F', [0, 0, 0], [0, 0, 200]), { glare: false, clutter: false });
    expect(readGuide(empty)).toBeNull();
  });
});

describe('stickerless cube: same-colored neighbors merge, corner holes remain', () => {
  it('finds faces of a SOLVED stickerless cube (every face is one blob)', () => {
    let found = 0, holeOk = 0, holeTotal = 0;
    for (let s = 1; s <= 12; s++) {
      const face = FACES[s % 6];
      const img = renderCube(SOLVED, poseFacing(face, [(s % 3 - 1) * 0.2, (s % 4 - 1.5) * 0.15, s * 0.3], [(s % 5 - 2) * 0.5, 0, 10 + (s % 4)]), { seed: s, stickerless: true, glare: false });
      const { faces } = detectFaces(img);
      for (const f of faces) holeOk += checkFace(img, f, s) ? 1 : 0, holeTotal++;
      if (faces.some((f) => [f, ...(f.alternatives ?? [])].some((o) => idsAt(img, o.centers)[4] === FACES.indexOf(face) * 9 + 4))) found++;
    }
    expect(found).toBeGreaterThanOrEqual(11);
    expect(holeOk / holeTotal).toBeGreaterThanOrEqual(0.9);
  });
  it('finds faces of scrambled stickerless cubes', () => {
    let found = 0, holeOk = 0, holeTotal = 0;
    for (let s = 1; s <= 24; s++) {
      const state = applyAlg(SOLVED, randomAlg(25, s * 17));
      const face = FACES[s % 6];
      const img = renderCube(state, poseFacing(face, [(s % 3 - 1) * 0.2, (s % 4 - 1.5) * 0.15, s * 0.3], [(s % 5 - 2) * 0.5, 0, 10 + (s % 4)]), { seed: s, stickerless: true });
      const { faces } = detectFaces(img);
      for (const f of faces) holeOk += checkFace(img, f, s) ? 1 : 0, holeTotal++;
      if (faces.some((f) => [f, ...(f.alternatives ?? [])].some((o) => idsAt(img, o.centers)[4] === FACES.indexOf(face) * 9 + 4))) found++;
    }
    expect(found).toBeGreaterThanOrEqual(16); // per single frame; a scan follows each face over several frames
    expect(holeOk / holeTotal).toBeGreaterThanOrEqual(0.85);
  });
});
