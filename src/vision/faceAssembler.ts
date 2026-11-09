import { t } from '../i18n';
/**
 * Assembles 6 scanned faces into a cube state. The center tells which face it is, but not how it
 * was rotated in front of the camera: every combination of the 4 rotations per face is tried and only
 * the ones yielding a physically valid cube are kept.
 */

import { COLOR_FACE, ColorName, FACES, Face, FaceletState } from '../cube/facelets';
import { faceletsToCubie } from '../cube/cubie';

export interface ScannedFace {
  /** 9 colors, row-major as seen by the camera (unmirrored) */
  colors: ColorName[];
}

/** Rotate a 3×3 grid clockwise k times. */
export function rotateGrid<T>(g: readonly T[], k: number): T[] {
  let cur = g.slice();
  for (let n = 0; n < ((k % 4) + 4) % 4; n++) {
    const next = new Array<T>(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) next[r * 3 + c] = cur[(2 - c) * 3 + r];
    cur = next;
  }
  return cur;
}

export type AssembleResult =
  | { ok: true; state: FaceletState; rotations: Record<Face, number> }
  | { ok: false; reason: 'missing' | 'invalid' | 'ambiguous'; message: string; candidates?: FaceletState[] };

export function assembleCube(faces: Partial<Record<Face, ScannedFace>>): AssembleResult {
  for (const f of FACES) if (!faces[f]) return { ok: false, reason: 'missing', message: t('asm.missing', { face: f }) };
  const letters: Record<Face, Face[]> = {} as Record<Face, Face[]>;
  for (const f of FACES) letters[f] = faces[f]!.colors.map((c) => COLOR_FACE[c]);

  const rotated: Record<Face, string[]> = {} as Record<Face, string[]>;
  for (const f of FACES) rotated[f] = [0, 1, 2, 3].map((k) => rotateGrid(letters[f], k).join(''));

  const found = new Map<FaceletState, Record<Face, number>>();
  const ks = [0, 0, 0, 0, 0, 0];
  for (let combo = 0; combo < 4096; combo++) {
    for (let i = 0; i < 6; i++) ks[i] = (combo >> (2 * i)) & 3;
    const state = FACES.map((f, i) => rotated[f][ks[i]]).join('');
    if (found.has(state)) continue;
    if (faceletsToCubie(state).ok) {
      found.set(state, Object.fromEntries(FACES.map((f, i) => [f, ks[i]])) as Record<Face, number>);
    }
  }
  if (found.size === 1) {
    const [[state, rotations]] = [...found.entries()];
    return { ok: true, state, rotations };
  }
  if (found.size === 0) {
    return {
      ok: false,
      reason: 'invalid',
      message: t('asm.invalid'),
    };
  }
  // Several valid readings (rare): prefer the one matching the suggested holding
  // (side faces with yellow up, yellow face with blue up, white face with green up) = rotation 0.
  const scored = [...found.entries()]
    .map(([state, rotations]) => ({ state, rotations, score: FACES.filter((f) => rotations[f] === 0).length }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score > scored[1].score) return { ok: true, state: scored[0].state, rotations: scored[0].rotations };
  return {
    ok: false,
    reason: 'ambiguous',
    message: t('asm.ambiguous'),
    candidates: scored.map((s) => s.state),
  };
}
