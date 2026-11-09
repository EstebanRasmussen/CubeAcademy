/**
 * Sticker color classification.
 *
 * - Naming is relative, never absolute: white is the least saturated center, the other five are named
 *   by the order of their hues around the color wheel (red < orange < yellow < green < blue). This holds
 *   for any cube palette (pastel/neon stickerless included) and any light temperature.
 * - The 6 centers calibrate the colors: stickers are compared with colors measured under the same light.
 * - Global constraint: exactly 9 stickers per color, solved as a balanced assignment (Hungarian).
 * - Per-face illumination: every face gets its own color cast and linear gradient (screen reflections,
 *   a face turned toward a lamp, shadows), estimated robustly from all 9 cells and removed iteratively.
 */

import { COLOR_NAMES, ColorName } from '../cube/facelets';
import { Lab, Rgb, colorDist, linearToLab } from './color';

/** Expected hue angles (degrees, CIELAB) of the chromatic colors after white balance. */
const EXPECTED_HUE: Record<Exclude<ColorName, 'white'>, number> = {
  red: 30,
  orange: 58,
  yellow: 100,
  green: 150,
  blue: 280,
};
const HUE_ORDER: Exclude<ColorName, 'white'>[] = ['red', 'orange', 'yellow', 'green', 'blue'];

export const chroma = (l: Lab) => Math.hypot(l[1], l[2]);
/** Chroma relative to lightness: separates a dark saturated blue from a light neutral white. */
export const saturation = (l: Lab) => chroma(l) / Math.max(l[0], 10);
export const hueDeg = (l: Lab) => ((Math.atan2(l[2], l[1]) * 180) / Math.PI + 360) % 360;
const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Learned (white-balanced) Lab of each color from successful scans: refines live hints. */
let CALIBRATION: Partial<Record<ColorName, Lab>> = {};

export function setPrototypes(p: Partial<Record<ColorName, Lab>> | undefined) {
  CALIBRATION = { ...(p ?? {}) };
}

/** Mean color of each class from a successful scan, blended with the existing calibration. */
export function learnPrototypes(faces: readonly Lab[][], colors: readonly ColorName[][], weight = 0.5): Record<ColorName, Lab> {
  const out = {} as Record<ColorName, Lab>;
  for (const name of COLOR_NAMES) {
    const members: Lab[] = [];
    colors.forEach((row, f) => row.forEach((c, i) => c === name && members.push(faces[f][i])));
    const mean = [0, 1, 2].map((k) => members.reduce((a, m) => a + m[k], 0) / Math.max(1, members.length)) as Lab;
    const prev = CALIBRATION[name];
    out[name] = prev ? (prev.map((v, k) => v * (1 - weight) + mean[k] * weight) as Lab) : mean;
  }
  return out;
}

/** Live, single-color name (used for feedback only; the final result is decided jointly). */
export function nearestPrototype(lab: Lab): ColorName {
  const cal = Object.entries(CALIBRATION) as [ColorName, Lab][];
  if (cal.length === 6) {
    let best: ColorName = 'white';
    let bd = Infinity;
    for (const [name, ref] of cal) {
      const d = colorDist(lab, ref);
      if (d < bd) {
        bd = d;
        best = name;
      }
    }
    return best;
  }
  if (saturation(lab) < 0.22) return 'white';
  const h = hueDeg(lab);
  let best: ColorName = 'red';
  let bd = Infinity;
  for (const name of HUE_ORDER) {
    const d = angDiff(h, EXPECTED_HUE[name]);
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

/**
 * Could this (white-balanced) color be the given sticker color? Loose on purpose: used in the guided scan
 * to reject the wrong face (a yellow shown while white is expected), not to name colors.
 */
export function plausibleColor(lab: Lab, name: ColorName, uncalibrated = false): boolean {
  const sat = saturation(lab);
  // before white balance (white is the first face asked) a warm light can tint white a lot
  if (name === 'white') return sat < (uncalibrated ? 0.65 : 0.3);
  return sat >= 0.1 && angDiff(hueDeg(lab), EXPECTED_HUE[name]) < 28;
}

/**
 * Names 6 distinct centers jointly: white = lowest chroma; the other five keep their circular hue order
 * and the rotation of that order closest to the expected hues is chosen.
 */
export function nameCenters(centers: readonly Lab[]): ColorName[] {
  const names = new Array<ColorName>(6);
  // white: the least saturated among the bright centers (a dark blue can look unsaturated)
  const maxL = Math.max(...centers.map((c) => c[0]));
  let white = -1;
  centers.forEach((c, i) => {
    if (c[0] < 0.55 * maxL) return;
    if (white < 0 || saturation(c) < saturation(centers[white])) white = i;
  });
  names[white] = 'white';
  const rest = centers.map((c, i) => ({ i, h: hueDeg(c) })).filter((x) => x.i !== white);
  rest.sort((a, b) => a.h - b.h);
  let bestShift = 0;
  let bestCost = Infinity;
  for (let s = 0; s < 5; s++) {
    let cost = 0;
    for (let k = 0; k < 5; k++) cost += angDiff(rest[(k + s) % 5].h, EXPECTED_HUE[HUE_ORDER[k]]);
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = s;
    }
  }
  for (let k = 0; k < 5; k++) names[rest[(k + bestShift) % 5].i] = HUE_ORDER[k];
  return names;
}

function permutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}
const COLOR_PERMS = permutations(COLOR_NAMES);

/**
 * All 720 ways of naming the 6 centers, best first. Cost: white should be the least saturated bright
 * center, every other center close to its expected hue. Used when the best naming gives an impossible
 * cube: the cube's own constraints pick the right one among the plausible alternatives.
 */
export function rankNamings(centers: readonly Lab[], limit = 24): ColorName[][] {
  const maxL = Math.max(...centers.map((c) => c[0]));
  const scored = COLOR_PERMS.map((p) => {
    let cost = 0;
    p.forEach((name, i) => {
      const c = centers[i];
      const sat = saturation(c);
      if (name === 'white') cost += 80 * sat + (c[0] < 0.55 * maxL ? 60 : 0);
      else cost += angDiff(hueDeg(c), EXPECTED_HUE[name]) + (sat < 0.12 ? 40 : 0);
    });
    return { p, cost };
  });
  scored.sort((a, b) => a.cost - b.cost);
  return scored.slice(0, limit).map((s) => s.p.slice());
}

/** Hungarian algorithm (min-cost perfect matching) on a square cost matrix. Returns assignment row → col. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const ans = new Array<number>(n);
  for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
  return ans;
}

export interface Classification {
  /** color of each sticker [face][cell] */
  colors: ColorName[][];
  /** 0..1, low = doubtful */
  confidence: number[][];
}

/** Balanced assignment of 54 stickers to the 6 classes (centers pinned). Returns class index per sticker. */
function assignBalanced(flat: readonly Lab[], refs: readonly Lab[]): number[] {
  const cost = flat.map((lab) => {
    const row: number[] = [];
    for (let k = 0; k < 6; k++) {
      const d = colorDist(lab, refs[k]);
      for (let r = 0; r < 9; r++) row.push(d);
    }
    return row;
  });
  for (let f = 0; f < 6; f++) {
    const i = f * 9 + 4;
    cost[i] = cost[i].map((_, j) => (Math.floor(j / 9) === f ? 0 : 1e6));
  }
  return hungarian(cost).map((j) => Math.floor(j / 9));
}

function classMeans(flat: readonly Lab[], assign: readonly number[], faces: readonly Lab[][]): Lab[] {
  const out: Lab[] = [];
  for (let k = 0; k < 6; k++) {
    const members = flat.filter((_, i) => assign[i] === k);
    const mean: Lab = [0, 0, 0];
    for (const m of members) for (let q = 0; q < 3; q++) mean[q] += m[q] / members.length;
    // keep the center as an anchor
    out.push(mean.map((v, q) => 0.5 * v + 0.5 * faces[k][4][q]) as Lab);
  }
  return out;
}

function finalize(flat: readonly Lab[], assign: readonly number[], refs: readonly Lab[], names: readonly ColorName[]): Classification {
  const colors: ColorName[][] = [];
  const confidence: number[][] = [];
  for (let f = 0; f < 6; f++) {
    colors.push([]);
    confidence.push([]);
    for (let c = 0; c < 9; c++) {
      const i = f * 9 + c;
      const k = assign[i];
      const d = colorDist(flat[i], refs[k]);
      let second = Infinity;
      for (let q = 0; q < 6; q++) if (q !== k) second = Math.min(second, colorDist(flat[i], refs[q]));
      colors[f].push(names[k]);
      confidence[f].push(Math.max(0, Math.min(1, (second - d) / Math.max(1, second))));
    }
  }
  return { colors, confidence };
}

/**
 * @param faces 6 faces × 9 Lab samples (center at index 4)
 */
export function classifyStickers(faces: readonly Lab[][]): Classification {
  const names = nameCenters(faces.map((f) => f[4]));
  let refs: Lab[] = faces.map((f) => f[4]);
  const flat = faces.flat();
  let assign: number[] = [];
  for (let iter = 0; iter < 3; iter++) {
    assign = assignBalanced(flat, refs);
    refs = classMeans(flat, assign, faces);
  }
  return finalize(flat, assign, refs, names);
}

// ---------------------------------------------------------------------------- per-face illumination

export interface FaceIllumination {
  /** log-gain per channel at the face center */
  a: Rgb;
  /** log-gain gradient per channel along the grid columns (u) and rows (v), per cell step */
  gu: Rgb;
  gv: Rgb;
}

const CELL_UV = Array.from({ length: 9 }, (_, i) => [(i % 3) - 1, Math.floor(i / 3) - 1]);

/** Weighted least squares for y ≈ a + b·u + c·v over the given cells. */
function fitPlane(y: number[], cells: number[]): [number, number, number] {
  // normal equations 3×3
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const r = [0, 0, 0];
  for (const i of cells) {
    const x = [1, CELL_UV[i][0], CELL_UV[i][1]];
    for (let p = 0; p < 3; p++) {
      r[p] += x[p] * y[i];
      for (let q = 0; q < 3; q++) A[p][q] += x[p] * x[q];
    }
  }
  // tiny ridge for stability
  for (let p = 1; p < 3; p++) A[p][p] += 0.5;
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-9) return [0, 0, 0];
  const sol: number[] = [];
  for (let k = 0; k < 3; k++) {
    const M = A.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)));
    sol.push(det(M) / D);
  }
  return sol as [number, number, number];
}

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/**
 * Estimates each face's illumination from the ratio between its cells and the class references,
 * robustly (the 2 worst cells are dropped) and with bounded color cast and gradient.
 */
function fitIllumination(rgb: readonly Rgb[][], assign: readonly number[], refsRgb: readonly Rgb[]): FaceIllumination[] {
  const out: FaceIllumination[] = rgb.map((face, f) => {
    const a: number[] = [], gu: number[] = [], gv: number[] = [];
    for (let c = 0; c < 3; c++) {
      const y = face.map((p, i) => Math.log(Math.max(1e-4, p[c]) / Math.max(1e-4, refsRgb[assign[f * 9 + i]][c])));
      let cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      let sol = fitPlane(y, cells);
      // robust: drop the two worst residuals (a misclassified or glared cell) and refit
      const res = cells.map((i) => Math.abs(y[i] - (sol[0] + sol[1] * CELL_UV[i][0] + sol[2] * CELL_UV[i][1])));
      cells = cells.filter((i) => res[i] < [...res].sort((p, q) => q - p)[1]);
      if (cells.length >= 6) sol = fitPlane(y, cells);
      a.push(sol[0]);
      gu.push(clamp(sol[1], 0.3));
      gv.push(clamp(sol[2], 0.3));
    }
    // brightness is free; the color cast (difference between channels) is bounded
    const mean = (a[0] + a[1] + a[2]) / 3;
    const aa = a.map((v) => mean + clamp(v - mean, 0.22)) as Rgb;
    return { a: aa, gu: gu as Rgb, gv: gv as Rgb };
  });
  // anchor: the average face keeps the global white balance
  for (let c = 0; c < 3; c++) {
    const m = out.reduce((s, o) => s + o.a[c], 0) / out.length;
    out.forEach((o) => (o.a[c] -= m));
  }
  return out;
}

export function correctFace(face: readonly Rgb[], ill: FaceIllumination): Rgb[] {
  return face.map((p, i) => {
    const [u, v] = CELL_UV[i];
    return p.map((x, c) => Math.min(1, x / Math.exp(ill.a[c] + ill.gu[c] * u + ill.gv[c] * v))) as Rgb;
  });
}

function medianRgb(ps: readonly Rgb[]): Rgb {
  const med = (a: number[]) => {
    const s = a.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return [0, 1, 2].map((c) => med(ps.map((p) => p[c]))) as Rgb;
}

export interface IlluminationResult {
  classification: Classification;
  /** corrected colors, Lab */
  labs: Lab[][];
  illumination: FaceIllumination[];
}

/**
 * Joint estimation of colors and per-face illumination (alternating, like EM):
 * classify → class references → fit each face's cast + gradient → correct → classify again.
 * @param rgb 6 faces × 9 white-balanced linear RGB samples
 */
export function classifyWithIllumination(rgb: readonly Rgb[][], iterations = 4): IlluminationResult {
  let corrected = rgb.map((f) => f.slice());
  let illumination: FaceIllumination[] = rgb.map(() => ({ a: [0, 0, 0], gu: [0, 0, 0], gv: [0, 0, 0] }));
  let labs = corrected.map((f) => f.map(linearToLab));
  let cls = classifyStickers(labs);
  for (let it = 0; it < iterations; it++) {
    // class index per sticker (index of the face whose center has that color)
    const names = cls.colors.map((r) => r[4]);
    const assign = cls.colors.flat().map((c) => names.indexOf(c));
    const refsRgb: Rgb[] = [];
    for (let k = 0; k < 6; k++) refsRgb.push(medianRgb(corrected.flat().filter((_, i) => assign[i] === k)));
    // fit on the ORIGINAL samples against references measured on the corrected ones
    illumination = fitIllumination(rgb, assign, refsRgb);
    corrected = rgb.map((f, k) => correctFace(f, illumination[k]));
    labs = corrected.map((f) => f.map(linearToLab));
    cls = classifyStickers(labs);
  }
  return { classification: cls, labs, illumination };
}
