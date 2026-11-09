/**
 * Free cube-face detector: finds faces anywhere in the frame, at any distance and in perspective.
 *
 * 1. Light 3×3 blur, color-gradient edges and a dark mask (the black plastic between stickers).
 * 2. Connected components of the remaining pixels → sticker candidates (size, compactness, shape, uniformity).
 * 3. Lattice search: from each candidate, two neighbor displacements form a basis; candidates that fall on
 *    integer coordinates of that basis within a 3×3 window are inliers. Shape similarity keeps faces apart.
 * 4. A homography grid → image is fitted on the inliers and refined, so missing stickers (glare, two
 *    same-colored stickers merged) don't matter: all 9 cells are sampled through the homography.
 * 5. Repeated after removing the inliers, so up to 3 visible faces are read in one frame.
 */

import { LIN_LUT, Lab, Rgb, linearToLab } from './color';
import { Mat3, Pt, applyH, fitHomography, invertH } from './homography';

export interface RawImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface Candidate {
  x: number;
  y: number;
  area: number;
  /** covariance normalized by sqrt(det): shape descriptor (identity for a square seen frontally) */
  shape: [number, number, number];
}

export interface DetectedFace {
  /** outer corners in image pixels, in grid order (0,0) (2,0) (2,2) (0,2) */
  corners: Pt[];
  /** 9 cell centers in image pixels, row-major as seen by the camera */
  centers: Pt[];
  /** 9 colors in linear RGB (median of a patch around each cell center) */
  rgb: Rgb[];
  /** same colors as Lab, without white balance */
  lab: Lab[];
  /** number of stickers actually detected as candidates (5..9) */
  inliers: number;
  /** 0..1: 1 = seen frontally, low = strong perspective */
  frontal: number;
  /** approximate sticker pitch in pixels */
  pitch: number;
  /** per-cell spread (ΔE): high = glare, a finger or an edge over that cell in this frame */
  spread: number[];
  /**
   * Set when the grid placement is uncertain (a face found from corner holes can be off by one cell):
   * the other plausible readings. Without knowing which face is shown, such a face is not used.
   */
  alternatives?: Omit<DetectedFace, 'H' | 'alternatives'>[];
  /** found from corner holes (weaker cue): used only when the shown face is known (guided scan) */
  fromHoles?: boolean;
  H: Mat3;
}

export interface DetectOptions {
  edgeThreshold: number;
  maxFaces: number;
  /** radius (px) of the black-hat filter that finds thin dark gaps */
  gapRadius: number;
  /** minimum darkness (0..255) of a gap relative to its surroundings */
  gapContrast: number;
  /** spread (ΔE) above which a cell is unreliable in this frame; faces with more than 3 such cells are dropped */
  maxCellSpread: number;
  /** min number of the 12 inner borders that must be darker than their cells */
  minDarkGaps: number;
  /** drop lattice members whose shape/area disagree with the homography */
  pruneShape: boolean;
  /** min score (dark intersections + dark border points, out of 28) of a face found from corner holes */
  minHoleScore: number;
}

const DEFAULTS: DetectOptions = { edgeThreshold: 11, maxFaces: 3, gapRadius: 3, gapContrast: 22, maxCellSpread: 14, minDarkGaps: 0, pruneShape: true, minHoleScore: 13 };

/** Counts the 12 inner borders between cells that are clearly darker than the two cells (the plastic). */
export function darkGaps(img: RawImage, H: Mat3, lab: readonly Lab[]): number {
  const { data, width: w, height: h } = img;
  const lum = (x: number, y: number) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return 100;
    const i = (py * w + px) * 4;
    return linearToLab([LIN_LUT[data[i]], LIN_LUT[data[i + 1]], LIN_LUT[data[i + 2]]])[0];
  };
  let dark = 0;
  for (let v = 0; v < 3; v++)
    for (let u = 0; u < 3; u++)
      for (const [du, dv] of [[1, 0], [0, 1]]) {
        if (u + du > 2 || v + dv > 2) continue;
        const a = lab[v * 3 + u][0], b = lab[(v + dv) * 3 + u + du][0];
        let min = Infinity;
        // walk across the border (the gap may not be exactly at the half cell)
        for (let t = 0.3; t <= 0.701; t += 0.05) {
          const [x, y] = applyH(H, u + du * t, v + dv * t);
          min = Math.min(min, lum(x, y));
        }
        const ref = Math.min(a, b);
        if (min < ref - Math.max(4, 0.07 * ref)) dark++;
      }
  return dark;
}

/** Running max over a window of radius r on a 1-D line (van Herk / Gil-Werman, O(1) per sample). */
function lineMax(inp: Float32Array, out: Float32Array, n: number, r: number, g: Float32Array, hh: Float32Array) {
  const k = 2 * r + 1;
  for (let i = 0; i < n; i++) g[i] = i % k === 0 ? inp[i] : g[i - 1] > inp[i] ? g[i - 1] : inp[i];
  for (let i = n - 1; i >= 0; i--) hh[i] = i === n - 1 || (i + 1) % k === 0 ? inp[i] : hh[i + 1] > inp[i] ? hh[i + 1] : inp[i];
  for (let i = 0; i < n; i++) {
    const a = hh[i - r < 0 ? 0 : i - r], b = g[i + r > n - 1 ? n - 1 : i + r];
    out[i] = a > b ? a : b;
  }
}

/** Separable max (dilate) or min (erode) filter with a square window of radius r. */
function morph(src: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const n = Math.max(w, h);
  const inp = new Float32Array(n), res = new Float32Array(n), g = new Float32Array(n), hh = new Float32Array(n);
  const sign = max ? 1 : -1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) inp[x] = sign * src[row + x];
    lineMax(inp, res, w, r, g, hh);
    for (let x = 0; x < w; x++) tmp[row + x] = res[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) inp[y] = tmp[y * w + x];
    lineMax(inp, res, h, r, g, hh);
    for (let y = 0; y < h; y++) out[y * w + x] = sign * res[y];
  }
  return out;
}

function boxBlur(src: RawImage): Float32Array[] {
  const { width: w, height: h, data } = src;
  const out = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  const tmp = new Float32Array(w * h);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
        tmp[row + x] = (data[(row + x0) * 4 + c] + data[(row + x) * 4 + c] + data[(row + x1) * 4 + c]) / 3;
      }
    }
    const o = out[c];
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
      for (let x = 0; x < w; x++) o[y * w + x] = (tmp[y0 * w + x] + tmp[y * w + x] + tmp[y1 * w + x]) / 3;
    }
  }
  return out;
}

/** Pixels that may belong to a sticker: bright enough, not on an edge, not on a thin dark gap. */
export function computeMask(img: RawImage, options: Partial<DetectOptions> = {}): { mask: Uint8Array; R: Float32Array; G: Float32Array; B: Float32Array } {
  const opts = { ...DEFAULTS, ...options };
  const { width: w, height: h } = img;
  const N = w * h;
  const [R, G, B] = boxBlur(img);

  // Adaptive dark threshold from the brightness distribution.
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) hist[Math.min(255, Math.max(R[i], G[i], B[i]) | 0)]++;
  let acc = 0, p85 = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= N * 0.85) {
      p85 = v;
      break;
    }
  }
  const darkT = Math.max(28, p85 * 0.3);

  // Black-hat on brightness (closing − image): thin dark lines such as the plastic between pieces
  // of a stickerless cube stand out regardless of the colors on either side, so two adjacent
  // same-colored pieces don't merge into one blob.
  const V = new Float32Array(N);
  for (let i = 0; i < N; i++) V[i] = Math.max(R[i], G[i], B[i]);
  const closing = morph(morph(V, w, h, opts.gapRadius, true), w, h, opts.gapRadius, false);

  const mask = new Uint8Array(N);
  const T = opts.edgeThreshold;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const bright = V[i];
      if (bright < darkT) continue;
      if (closing[i] - bright > Math.max(opts.gapContrast, 0.22 * closing[i])) continue;
      const gx = Math.max(Math.abs(R[i + 1] - R[i - 1]), Math.abs(G[i + 1] - G[i - 1]), Math.abs(B[i + 1] - B[i - 1]));
      const gy = Math.max(Math.abs(R[i + w] - R[i - w]), Math.abs(G[i + w] - G[i - w]), Math.abs(B[i + w] - B[i - w]));
      if (Math.max(gx, gy) / 2 < T) mask[i] = 1;
    }
  return { mask, R, G, B };
}

/** Finds sticker-like regions. */
export function findCandidates(img: RawImage, options: Partial<DetectOptions> = {}): Candidate[] {
  const opts = { ...DEFAULTS, ...options };
  const { width: w, height: h } = img;
  const N = w * h;
  const { mask, R, G, B } = computeMask(img, opts);

  // Connected components (union-find, 4-connectivity).
  const parent = new Int32Array(N).fill(-1);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      parent[i] = i;
      if (x > 0 && mask[i - 1]) {
        const a = find(i - 1), b = find(i);
        if (a !== b) parent[b] = a;
      }
      if (y > 0 && mask[i - w]) {
        const a = find(i - w), b = find(i);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }

  interface Acc { n: number; sx: number; sy: number; sxx: number; syy: number; sxy: number; sc: number[]; scc: number[]; border: boolean }
  const comps = new Map<number, Acc>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const r = find(i);
      let a = comps.get(r);
      if (!a) comps.set(r, (a = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, sc: [0, 0, 0], scc: [0, 0, 0], border: false }));
      a.n++;
      a.sx += x;
      a.sy += y;
      a.sxx += x * x;
      a.syy += y * y;
      a.sxy += x * y;
      const c = [R[i], G[i], B[i]];
      for (let k = 0; k < 3; k++) {
        a.sc[k] += c[k];
        a.scc[k] += c[k] * c[k];
      }
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) a.border = true;
    }

  const minA = Math.max(25, N * 0.00035);
  const maxA = N * 0.06;
  const out: Candidate[] = [];
  for (const a of comps.values()) {
    if (a.n < minA || a.n > maxA || a.border) continue;
    const mx = a.sx / a.n, my = a.sy / a.n;
    const cxx = a.sxx / a.n - mx * mx, cyy = a.syy / a.n - my * my, cxy = a.sxy / a.n - mx * my;
    const det = cxx * cyy - cxy * cxy;
    if (det <= 0) continue;
    // A parallelogram of area A has det(Σ) = (A/12)²: compactness ≈ 1 for squares in any perspective.
    const compact = a.n / (12 * Math.sqrt(det));
    if (compact < 0.72 || compact > 1.25) continue;
    const tr = cxx + cyy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l2 <= 0 || l1 / l2 > 9) continue;
    let std = 0;
    for (let k = 0; k < 3; k++) std = Math.max(std, Math.sqrt(Math.max(0, a.scc[k] / a.n - (a.sc[k] / a.n) ** 2)));
    if (std > 24) continue;
    const s = Math.sqrt(det);
    out.push({ x: mx, y: my, area: a.n, shape: [cxx / s, cxy / s, cyy / s] });
  }
  return out;
}

const shapeDiff = (a: Candidate, b: Candidate) =>
  Math.hypot(a.shape[0] - b.shape[0], 2 * (a.shape[1] - b.shape[1]), a.shape[2] - b.shape[2]);

interface LatticeFit {
  members: Map<string, number>; // "c,r" → candidate index
  H: Mat3;
}

function key(c: number, r: number) {
  return `${c},${r}`;
}

/** Best 3×3 lattice through candidate `i`. */
function latticeFrom(i: number, C: Candidate[], used: Set<number>): { members: Map<string, number>; score: number; len: number } | null {
  const ci = C[i];
  const side = Math.sqrt(ci.area);
  const similar = (j: number) =>
    !used.has(j) && C[j].area / ci.area > 0.35 && C[j].area / ci.area < 2.9 && shapeDiff(C[j], ci) < 0.75;
  const nbrs = C.map((c, j) => ({ j, d: Math.hypot(c.x - ci.x, c.y - ci.y) }))
    .filter(({ j, d }) => j !== i && d > 0.9 * side && d < 2.3 * side && similar(j))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  let best: { members: Map<string, number>; score: number; len: number } | null = null;
  for (let a = 0; a < nbrs.length; a++)
    for (let b = a + 1; b < nbrs.length; b++) {
      let d1: Pt = [C[nbrs[a].j].x - ci.x, C[nbrs[a].j].y - ci.y];
      let d2: Pt = [C[nbrs[b].j].x - ci.x, C[nbrs[b].j].y - ci.y];
      // Lagrange–Gauss reduction: a diagonal and a side span the same lattice but give a sheared grid.
      // The reduced (shortest, most orthogonal) basis is the true one for a square grid.
      for (let it = 0; it < 4; it++) {
        if (Math.hypot(...d2) < Math.hypot(...d1)) [d1, d2] = [d2, d1];
        const mu = Math.round((d1[0] * d2[0] + d1[1] * d2[1]) / (d1[0] ** 2 + d1[1] ** 2));
        if (mu === 0) break;
        d2 = [d2[0] - mu * d1[0], d2[1] - mu * d1[1]];
      }
      let cross = d1[0] * d2[1] - d1[1] * d2[0];
      const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
      if (l1 < 0.85 * side || l2 < 0.85 * side) continue;
      // The sticker's own shape must agree with the grid axes: a square sticker mapped by the local
      // affine map B = [d1 d2] has covariance ∝ B·Bᵀ. A sheared grid predicts a very different shape.
      const detB = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]);
      const pred: [number, number, number] = [
        (d1[0] ** 2 + d2[0] ** 2) / detB,
        (d1[0] * d1[1] + d2[0] * d2[1]) / detB,
        (d1[1] ** 2 + d2[1] ** 2) / detB,
      ];
      if (Math.hypot(pred[0] - ci.shape[0], 2 * (pred[1] - ci.shape[1]), pred[2] - ci.shape[2]) > 0.6) continue;
      if (Math.abs(cross) < 0.45 * l1 * l2 || l1 / l2 > 2 || l2 / l1 > 2) continue;
      // Keep reading order (x right, y down): d1 = column axis, d2 = row axis, positive orientation.
      if (cross < 0) {
        [d1, d2] = [d2, d1];
        cross = -cross;
      }
      const inv = [d2[1] / cross, -d2[0] / cross, -d1[1] / cross, d1[0] / cross];
      const pts = new Map<string, { j: number; err: number }>();
      C.forEach((c, j) => {
        if (j !== i && !similar(j)) return;
        const dx = c.x - ci.x, dy = c.y - ci.y;
        const gu = inv[0] * dx + inv[1] * dy, gv = inv[2] * dx + inv[3] * dy;
        const ru = Math.round(gu), rv = Math.round(gv);
        const err = Math.hypot(gu - ru, gv - rv);
        if (Math.abs(ru) > 2 || Math.abs(rv) > 2 || err > 0.3) return;
        const k = key(ru, rv);
        const prev = pts.get(k);
        if (!prev || err < prev.err) pts.set(k, { j, err });
      });
      // Best 3×3 window containing the seed.
      for (let ou = -2; ou <= 0; ou++)
        for (let ov = -2; ov <= 0; ov++) {
          const members = new Map<string, number>();
          for (const [k, { j }] of pts) {
            const [u, v] = k.split(',').map(Number);
            if (u >= ou && u <= ou + 2 && v >= ov && v <= ov + 2) members.set(key(u - ou, v - ov), j);
          }
          const len = l1 + l2;
          if (!best || members.size > best.score || (members.size === best.score && len < best.len)) {
            best = { members, score: members.size, len };
          }
        }
    }
  return best;
}

function fitMembers(members: Map<string, number>, C: Candidate[]): Mat3 | null {
  const src: Pt[] = [], dst: Pt[] = [];
  for (const [k, j] of members) {
    const [u, v] = k.split(',').map(Number);
    src.push([u, v]);
    dst.push([C[j].x, C[j].y]);
  }
  return fitHomography(src, dst);
}

/** Re-assigns candidates to cells through the homography, then refits. */
function refine(fit: LatticeFit, C: Candidate[], used: Set<number>, seedArea: number): LatticeFit {
  let cur = fit;
  for (let it = 0; it < 2; it++) {
    const Hinv = invertH(cur.H);
    if (!Hinv) break;
    const members = new Map<string, { j: number; err: number }>();
    C.forEach((c, j) => {
      if (used.has(j) || c.area / seedArea < 0.3 || c.area / seedArea > 3.2) return;
      const [gu, gv] = applyH(Hinv, c.x, c.y);
      const ru = Math.round(gu), rv = Math.round(gv);
      const err = Math.hypot(gu - ru, gv - rv);
      if (ru < 0 || ru > 2 || rv < 0 || rv > 2 || err > 0.25) return;
      const k = key(ru, rv);
      const prev = members.get(k);
      if (!prev || err < prev.err) members.set(k, { j, err });
    });
    const m = new Map([...members].map(([k, v]) => [k, v.j]));
    if (m.size < cur.members.size) break;
    const H = fitMembers(m, C);
    if (!H) break;
    cur = { members: m, H };
  }
  return cur;
}

/**
 * Every member must look like a sticker of THIS plane: its shape and area must match what the
 * homography predicts at its cell. Stickers of an adjacent face (seen with another perspective)
 * that happen to fall on lattice points are removed; the fit is then recomputed.
 */
function pruneByShape(fit: LatticeFit, C: Candidate[]): LatticeFit {
  const keep = new Map<string, number>();
  for (const [k, j] of fit.members) {
    const [u, v] = k.split(',').map(Number);
    const [ax, ay] = applyH(fit.H, u - 0.5, v), [bx, by] = applyH(fit.H, u + 0.5, v);
    const [cx, cy] = applyH(fit.H, u, v - 0.5), [dx, dy] = applyH(fit.H, u, v + 0.5);
    const J = [bx - ax, by - ay, dx - cx, dy - cy]; // columns: d/du, d/dv
    const det = Math.abs(J[0] * J[3] - J[1] * J[2]);
    if (det <= 0) continue;
    const pred = [(J[0] ** 2 + J[2] ** 2) / det, (J[0] * J[1] + J[2] * J[3]) / det, (J[1] ** 2 + J[3] ** 2) / det];
    const s = C[j].shape;
    const shapeErr = Math.hypot(pred[0] - s[0], 2 * (pred[1] - s[1]), pred[2] - s[2]);
    const fill = C[j].area / det; // sticker area relative to its cell
    if (shapeErr > 0.55 || fill < 0.3 || fill > 1.15) continue;
    keep.set(k, j);
  }
  if (keep.size === fit.members.size) return fit;
  const H = keep.size >= 4 ? fitMembers(keep, C) : null;
  return H ? { members: keep, H } : { members: keep, H: fit.H };
}

function spans(members: Map<string, number>): boolean {
  const us = new Set<number>(), vs = new Set<number>();
  for (const k of members.keys()) {
    const [u, v] = k.split(',').map(Number);
    us.add(u);
    vs.add(v);
  }
  return us.has(0) && us.has(2) && vs.has(0) && vs.has(2);
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Perspective-correct color sampling of the 9 cells (glare-rejecting median in linear RGB). */
export function sampleCells(img: RawImage, H: Mat3, radius = 0.27, steps = 7): Rgb[] {
  return sampleCellsWithSpread(img, H, radius, steps).rgb;
}

/** Same as sampleCells, plus each cell's spread (median ΔE from its median color): high = not a sticker. */
export function sampleCellsWithSpread(img: RawImage, H: Mat3, radius = 0.27, steps = 7): { rgb: Rgb[]; spread: number[] } {
  const { data, width: w, height: h } = img;
  const out: Rgb[] = [];
  const spread: number[] = [];
  for (let v = 0; v < 3; v++)
    for (let u = 0; u < 3; u++) {
      const ch: number[][] = [[], [], []];
      const glare: number[][] = [[], [], []];
      // The center piece may carry a logo (GAN and most speedcubes): sample a ring around it instead.
      const offsets: Pt[] = [];
      if (u === 1 && v === 1)
        for (const rr of [0.3, 0.37]) for (let t = 0; t < 16; t++) offsets.push([rr * Math.cos((t * Math.PI) / 8), rr * Math.sin((t * Math.PI) / 8)]);
      else
        for (let a = 0; a < steps; a++)
          for (let b = 0; b < steps; b++) offsets.push([-radius + (2 * radius * a) / (steps - 1), -radius + (2 * radius * b) / (steps - 1)]);
      for (const [du, dv] of offsets) {
          const [x, y] = applyH(H, u + du, v + dv);
          const px = Math.round(x), py = Math.round(y);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const i = (py * w + px) * 4;
          const isGlare = data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
          for (let k = 0; k < 3; k++) (isGlare ? glare : ch)[k].push(LIN_LUT[data[i + k]]);
        }
      const use = ch[0].length >= glare[0].length * 0.3 ? ch : [0, 1, 2].map((k) => ch[k].concat(glare[k]));
      const m: Rgb = [median(use[0]), median(use[1]), median(use[2])];
      out.push(m);
      const ml = linearToLab(m);
      const devs = use[0].map((_, q) => {
        const l = linearToLab([use[0][q], use[1][q], use[2][q]]);
        return Math.hypot(l[0] - ml[0], l[1] - ml[1], l[2] - ml[2]);
      });
      spread.push(median(devs));
    }
  return { rgb: out, spread };
}

function quadMetrics(c: Pt[]): number {
  const side = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const s = [side(c[0], c[1]), side(c[1], c[2]), side(c[2], c[3]), side(c[3], c[0])];
  const d = [side(c[0], c[2]), side(c[1], c[3])];
  return Math.min(Math.min(...s) / Math.max(...s), Math.min(...d) / Math.max(...d));
}

export function detectFaces(img: RawImage, options: Partial<DetectOptions> = {}): { faces: DetectedFace[]; candidates: Candidate[] } {
  const opts = { ...DEFAULTS, ...options };
  const C = findCandidates(img, opts);
  const used = new Set<number>();
  const faces: DetectedFace[] = [];
  for (let attempt = 0; attempt < 8 && faces.length < opts.maxFaces; attempt++) {
    let best: { fit: LatticeFit; seed: number } | null = null;
    let bestScore = 0;
    let bestLen = Infinity;
    for (let i = 0; i < C.length; i++) {
      if (used.has(i)) continue;
      const l = latticeFrom(i, C, used);
      if (!l || l.score < 4) continue;
      if (l.score > bestScore || (l.score === bestScore && l.len < bestLen)) {
        const H = fitMembers(l.members, C);
        if (!H) continue;
        best = { fit: { members: l.members, H }, seed: i };
        bestScore = l.score;
        bestLen = l.len;
      }
    }
    if (!best) break;
    const refined = refine(best.fit, C, used, C[best.seed].area);
    const fit = opts.pruneShape ? pruneByShape(refined, C) : refined;
    if (fit.members.size < 5 || !spans(fit.members)) {
      // Not a full face: don't try this seed's stickers again.
      for (const j of best.fit.members.values()) used.add(j);
      continue;
    }
    for (const j of fit.members.values()) used.add(j);
    const H = fit.H;
    const corners: Pt[] = [applyH(H, -0.5, -0.5), applyH(H, 2.5, -0.5), applyH(H, 2.5, 2.5), applyH(H, -0.5, 2.5)];
    const centers: Pt[] = [];
    for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) centers.push(applyH(H, u, v));
    const { rgb, spread } = sampleCellsWithSpread(img, H);
    const pitch = Math.hypot(centers[2][0] - centers[0][0], centers[2][1] - centers[0][1]) / 2;
    // Validation on the real image: every cell (except possibly the logo center) must be a uniform
    // patch, and most borders between cells must be dark plastic. A grid that slipped off the cube
    // (onto a hand, the background or across two faces) fails one of the two.
    const lab = rgb.map(linearToLab);
    if (spread.filter((s, k) => k !== 4 && s > opts.maxCellSpread).length > 3) continue;
    if (darkGaps(img, H, lab) < opts.minDarkGaps) continue;
    faces.push({ corners, centers, rgb, lab: rgb.map(linearToLab), inliers: fit.members.size, frontal: quadMetrics(corners), pitch, spread, H });
  }
  if (faces.length < opts.maxFaces) {
    for (const f of facesFromHoles(img, findHoles(img, opts), faces, opts, C)) {
      if (faces.length >= opts.maxFaces) break;
      faces.push(f);
    }
  }
  return { faces, candidates: C };
}

// ---------------------------------------------------------------------------- corner holes

export interface Hole {
  x: number;
  y: number;
  area: number;
}

/**
 * Dark diamond-shaped holes where four rounded stickerless pieces meet. Two adjacent pieces of the
 * same color touch without a visible gap (5 reds become one blob), but these holes stay: the four
 * inner ones of a face sit exactly on the grid intersections.
 */
export function findHoles(img: RawImage, options: Partial<DetectOptions> = {}): Hole[] {
  const opts = { ...DEFAULTS, ...options };
  const { width: w, height: h } = img;
  const N = w * h;
  const { mask, R, G, B } = computeMask(img, opts);
  const V = new Float32Array(N);
  for (let i = 0; i < N; i++) V[i] = Math.max(R[i], G[i], B[i]);
  const r = Math.max(6, Math.round(w / 70)); // holes grow with the cube: a wide window keeps their center dark
  const closing = morph(morph(V, w, h, r, true), w, h, r, false);
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (closing[i] - V[i] > Math.max(40, 0.45 * closing[i])) dark[i] = 1;
  // a blurred diamond can split into fragments: join them with a 1-px dilation
  const grown = new Uint8Array(N);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (dark[i] || dark[i - 1] || dark[i + 1] || dark[i - w] || dark[i + w]) grown[i] = 1;
    }
  dark.set(grown);

  // connected components of dark pixels (union-find)
  const parent = new Int32Array(N).fill(-1);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dark[i]) continue;
      parent[i] = i;
      if (x > 0 && dark[i - 1]) parent[find(i)] = find(i - 1);
      if (y > 0 && dark[i - w]) parent[find(i)] = find(i - w);
    }
  const acc = new Map<number, { n: number; sx: number; sy: number; x0: number; x1: number; y0: number; y1: number }>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dark[i]) continue;
      const k = find(i);
      let a = acc.get(k);
      if (!a) acc.set(k, (a = { n: 0, sx: 0, sy: 0, x0: x, x1: x, y0: y, y1: y }));
      a.n++;
      a.sx += x;
      a.sy += y;
      a.x0 = Math.min(a.x0, x);
      a.x1 = Math.max(a.x1, x);
      a.y0 = Math.min(a.y0, y);
      a.y1 = Math.max(a.y1, y);
    }
  const out: Hole[] = [];
  const minA = Math.max(4, N * 0.00002), maxA = N * 0.004;
  for (const a of acc.values()) {
    if (a.n < minA || a.n > maxA) continue;
    const bw = a.x1 - a.x0 + 1, bh = a.y1 - a.y0 + 1;
    if (a.x0 <= 1 || a.y0 <= 1 || a.x1 >= w - 2 || a.y1 >= h - 2) continue;
    if (a.n / (bw * bh) < 0.25 || Math.max(bw, bh) / Math.min(bw, bh) > 3.5) continue;
    const cx = a.sx / a.n, cy = a.sy / a.n;
    // enclosed by colored pieces: a ring around the hole is mostly sticker-like pixels
    const rr = 0.9 * Math.max(bw, bh) + 2;
    let inside = 0, total = 0;
    for (let t = 0; t < 24; t++) {
      const px = Math.round(cx + rr * Math.cos((t * Math.PI) / 12)), py = Math.round(cy + rr * Math.sin((t * Math.PI) / 12));
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      total++;
      if (mask[py * w + px]) inside++;
    }
    if (!total || inside / total < 0.6) continue;
    out.push({ x: cx, y: cy, area: a.n });
  }
  return out;
}

/**
 * How many of the 12 outer border points of the grid lie on a dark edge (the plastic around the face).
 * A grid shifted by half a cell has a border running through the middle of pieces instead.
 */
export function outerDarkEdges(img: RawImage, H: Mat3, lab: readonly Lab[]): number {
  const { data, width: w, height: h } = img;
  const lum = (x: number, y: number) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return 0;
    const i = (py * w + px) * 4;
    return linearToLab([LIN_LUT[data[i]], LIN_LUT[data[i + 1]], LIN_LUT[data[i + 2]]])[0];
  };
  let dark = 0;
  for (let c = 0; c < 3; c++)
    for (const [u, v, du, dv, cell] of [
      [-0.5, c, 1, 0, c * 3],
      [2.5, c, 1, 0, c * 3 + 2],
      [c, -0.5, 0, 1, c],
      [c, 2.5, 0, 1, 6 + c],
    ] as const) {
      let min = Infinity;
      for (let t = -0.2; t <= 0.201; t += 0.04) {
        const [x, y] = applyH(H, u + du * t, v + dv * t);
        min = Math.min(min, lum(x, y));
      }
      if (min < 0.75 * lab[cell][0]) dark++;
    }
  return dark;
}

/** How many of the 16 grid intersections (corners of the 9 cells) are darker than the cells around them. */
export function darkIntersections(img: RawImage, H: Mat3, lab: readonly Lab[]): number {
  const { data, width: w, height: h } = img;
  const lum = (x: number, y: number) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return 100;
    const i = (py * w + px) * 4;
    return linearToLab([LIN_LUT[data[i]], LIN_LUT[data[i + 1]], LIN_LUT[data[i + 2]]])[0];
  };
  let dark = 0;
  for (const iu of [-0.5, 0.5, 1.5, 2.5])
    for (const iv of [-0.5, 0.5, 1.5, 2.5]) {
      let ref = Infinity;
      for (const [cu, cv] of [[iu - 0.5, iv - 0.5], [iu + 0.5, iv - 0.5], [iu - 0.5, iv + 0.5], [iu + 0.5, iv + 0.5]])
        if (cu >= 0 && cu <= 2 && cv >= 0 && cv <= 2) ref = Math.min(ref, lab[cv * 3 + cu][0]);
      let min = Infinity;
      for (const [a, b] of [[0, 0], [0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1], [0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) {
        const [x, y] = applyH(H, iu + a, iv + b);
        min = Math.min(min, lum(x, y));
      }
      if (min < 0.7 * ref) dark++;
    }
  return dark;
}

/** Fraction of the face area that is dark plastic: small on a stickerless face (holes and thin lines only). */
function darkFraction(img: RawImage, H: Mat3, lab: readonly Lab[]): number {
  const { data, width: w, height: h } = img;
  const ref = [...lab].map((l) => l[0]).sort((a, b) => a - b)[4];
  let dark = 0, n = 0;
  for (let a = 0; a < 15; a++)
    for (let b = 0; b < 15; b++) {
      const [x, y] = applyH(H, -0.45 + (2.9 * a) / 14, -0.45 + (2.9 * b) / 14);
      const px = Math.round(x), py = Math.round(y);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = (py * w + px) * 4;
      n++;
      if (linearToLab([LIN_LUT[data[i]], LIN_LUT[data[i + 1]], LIN_LUT[data[i + 2]]])[0] < 0.5 * ref) dark++;
    }
  return n ? dark / n : 1;
}

/** Grid shifted by (du, dv) cells: G(u, v) = H(u + du, v + dv). */
function translateGrid(H: Mat3, du: number, dv: number): Mat3 {
  const T = [1, 0, du, 0, 1, dv, 0, 0, 1];
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = H[r * 3] * T[c] + H[r * 3 + 1] * T[3 + c] + H[r * 3 + 2] * T[6 + c];
  return out;
}

function insideQuad(q: Pt[], p: Pt): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** Faces from 4 holes forming a parallelogram (the inner grid intersections 0.5–1.5). */
function facesFromHoles(img: RawImage, holes: Hole[], existing: DetectedFace[], opts: DetectOptions, stickers: Candidate[] = []): DetectedFace[] {
  const out: DetectedFace[] = [];
  const usedHoles = new Set<number>();
  for (let i = 0; i < holes.length; i++) {
    if (usedHoles.has(i)) continue;
    const p = holes[i];
    const sp = Math.sqrt(p.area);
    const nb = holes
      .map((h, j) => ({ j, d: Math.hypot(h.x - p.x, h.y - p.y) }))
      .filter(({ j, d }) => j !== i && !usedHoles.has(j) && d > 2.5 * sp && d < 12 * sp && holes[j].area / p.area < 3 && p.area / holes[j].area < 3)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    let found: DetectedFace | null = null;
    let quad: number[] = [];
    for (let a = 0; a < nb.length && !found; a++)
      for (let b = a + 1; b < nb.length && !found; b++) {
        let q = holes[nb[a].j], r = holes[nb[b].j];
        let d1: Pt = [q.x - p.x, q.y - p.y], d2: Pt = [r.x - p.x, r.y - p.y];
        let cross = d1[0] * d2[1] - d1[1] * d2[0];
        const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
        if (Math.abs(cross) < 0.6 * l1 * l2 || l1 / l2 > 1.4 || l2 / l1 > 1.4) continue;
        let qi = nb[a].j, ri = nb[b].j;
        if (cross < 0) {
          [d1, d2] = [d2, d1];
          [q, r] = [r, q];
          [qi, ri] = [ri, qi];
          cross = -cross;
        }
        const sx = p.x + d1[0] + d2[0], sy = p.y + d1[1] + d2[1];
        const tol = 0.25 * Math.min(l1, l2);
        const si = holes.findIndex((h, j) => j !== i && j !== qi && j !== ri && Math.hypot(h.x - sx, h.y - sy) < tol);
        if (si < 0) continue;
        const s = holes[si];
        // a quad of diagonal neighbors (spacing √2) has another hole at its center or mid-sides: not a unit cell
        const mids: Pt[] = [[p.x + (d1[0] + d2[0]) / 2, p.y + (d1[1] + d2[1]) / 2], [p.x + d1[0] / 2, p.y + d1[1] / 2], [p.x + d2[0] / 2, p.y + d2[1] / 2], [s.x - d1[0] / 2, s.y - d1[1] / 2], [s.x - d2[0] / 2, s.y - d2[1] / 2]];
        if (holes.some((hh) => mids.some(([mx, my]) => Math.hypot(hh.x - mx, hh.y - my) < tol))) continue;
        const H0 = fitHomography(
          [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]],
          [[p.x, p.y], [q.x, q.y], [s.x, s.y], [r.x, r.y]],
        );
        if (!H0) continue;
        // The 4 holes must be the INNER intersections of the face. On a stickerless cube the border
        // intersections merge with the dark outline, so if another hole sits next to this quad on the
        // same lattice, the quad could be a border square of a shifted face: ambiguous, not used.
        const Hinv0 = invertH(H0);
        if (!Hinv0) continue;
        const neighbor = holes.some((hh, j) => {
          if (j === i || j === qi || j === ri || j === si) return false;
          const [gu, gv] = applyH(Hinv0, hh.x, hh.y);
          const iu = Math.round(gu - 0.5), iv = Math.round(gv - 0.5);
          if (Math.hypot(gu - 0.5 - iu, gv - 0.5 - iv) > 0.25) return false;
          return iu >= -1 && iu <= 2 && iv >= -1 && iv <= 2;
        });
        if (neighbor) continue;
        const options: { face: DetectedFace; score: number }[] = [];
        for (let du = 0; du <= 0; du++)
          for (let dv = 0; dv <= 0; dv++) {
            const H = translateGrid(H0, du, dv);
            const corners: Pt[] = [applyH(H, -0.5, -0.5), applyH(H, 2.5, -0.5), applyH(H, 2.5, 2.5), applyH(H, -0.5, 2.5)];
            if (corners.some(([x, y]) => x < 0 || y < 0 || x >= img.width || y >= img.height)) continue;
            // holes are a weaker cue than stickers: only fairly frontal views
            if (quadMetrics(corners) < 0.7) continue;
            const centers: Pt[] = [];
            for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) centers.push(applyH(H, u, v));
            // no overlap with faces already found (by stickers or by other holes)
            if ([...existing, ...out].some((f) => centers.some((c) => insideQuad(f.corners, c)))) continue;
            // every isolated sticker inside the face must sit at the center of a cell
            const Hi = invertH(H);
            if (!Hi) continue;
            const disagree = stickers.some((c) => {
              if (!insideQuad(corners, [c.x, c.y])) return false;
              const [gu, gv] = applyH(Hi, c.x, c.y);
              // two same-colored pieces merged into one blob are centered between cells: only single pieces count
              const [ax, ay] = applyH(H, gu - 0.5, gv), [bx, by] = applyH(H, gu + 0.5, gv);
              const [cx, cy] = applyH(H, gu, gv - 0.5), [dx, dy] = applyH(H, gu, gv + 0.5);
              const cellArea = Math.abs((bx - ax) * (dy - cy) - (by - ay) * (dx - cx));
              if (c.area > 1.2 * cellArea) return false;
              return Math.hypot(gu - Math.round(gu), gv - Math.round(gv)) > 0.3;
            });
            if (disagree) continue;
            const { rgb, spread } = sampleCellsWithSpread(img, H);
            const lab = rgb.map(linearToLab);
            if (spread.filter((sv, k) => k !== 4 && sv > opts.maxCellSpread).length > 3) continue;
            if (lab.some((l) => l[0] < 15)) continue;
            if (darkFraction(img, H, lab) > 0.2) continue;
            // every intersection of a stickerless face is dark (inner hole, border notch or outline corner);
            // a placement shifted off the face has a row of intersections on the background
            const score = darkIntersections(img, H, lab) + outerDarkEdges(img, H, lab) + (du === 0 && dv === 0 ? 1 : 0);
            const pitch = Math.hypot(centers[2][0] - centers[0][0], centers[2][1] - centers[0][1]) / 2;
            options.push({ face: { corners, centers, rgb, lab, inliers: 6, frontal: quadMetrics(corners), pitch, spread, H }, score });
          }
        options.sort((x, y) => y.score - x.score);
        if (!options.length || options[0].score < opts.minHoleScore) continue;
        found = options[0].face;
        found.fromHoles = true;
        // Close runner-ups: the placement is uncertain (a shift by one cell keeps all local structure).
        // They are kept so that a known center color can decide; without it the face is not used.
        const close = options.slice(1).filter((o) => o.score >= options[0].score - 2 && o.score >= opts.minHoleScore - 2);
        if (close.length) found.alternatives = close.map(({ face: { H: _h, ...rest } }) => rest);
        quad = [i, qi, ri, si];
      }
    if (found) {
      quad.forEach((k) => usedHoles.add(k));
      out.push(found);
    }
  }
  return out;
}
