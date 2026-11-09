/** Planar homography (perspective transform) between grid coordinates and image pixels. */

export type Mat3 = Float64Array; // row-major 3×3
export type Pt = [number, number];

/** Solves A x = b (n×n) in place with partial pivoting. Returns null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const k = A[r][c] / A[c][c];
      for (let q = c; q < n; q++) A[r][q] -= k * A[c][q];
      b[r] -= k * b[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let q = r + 1; q < n; q++) s -= A[r][q] * x[q];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * Least-squares homography mapping src → dst (≥4 points, not all collinear).
 * dst is normalized internally for numerical stability.
 */
export function fitHomography(src: readonly Pt[], dst: readonly Pt[]): Mat3 | null {
  const n = src.length;
  if (n < 4) return null;
  let mx = 0, my = 0;
  for (const [x, y] of dst) {
    mx += x / n;
    my += y / n;
  }
  let s = 0;
  for (const [x, y] of dst) s += Math.hypot(x - mx, y - my) / n;
  s = s || 1;
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const Atb = new Array<number>(8).fill(0);
  const add = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let i = 0; i < n; i++) {
    const [u, v] = src[i];
    const x = (dst[i][0] - mx) / s;
    const y = (dst[i][1] - my) / s;
    add([u, v, 1, 0, 0, 0, -u * x, -v * x], x);
    add([0, 0, 0, u, v, 1, -u * y, -v * y], y);
  }
  const h = solve(AtA, Atb);
  if (!h) return null;
  // Denormalize: H = T⁻¹ · Hn, with T = scale 1/s and translate -m.
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const H = new Float64Array(9);
  for (let c = 0; c < 3; c++) {
    H[c] = s * Hn[c] + mx * Hn[6 + c];
    H[3 + c] = s * Hn[3 + c] + my * Hn[6 + c];
    H[6 + c] = Hn[6 + c];
  }
  return H;
}

export function applyH(H: Mat3, u: number, v: number): Pt {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

export function invertH(H: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return new Float64Array(inv.map((v) => v / det));
}
