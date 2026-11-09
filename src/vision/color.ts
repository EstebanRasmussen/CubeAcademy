/** sRGB → CIELAB (D65) and color distances. */

export type Lab = [number, number, number];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
/** sRGB byte → linear light (0..1). */
export const LIN_LUT = new Float32Array(256).map((_, i) => lin(i));

/** Linear RGB, each channel 0..1 (white balance is applied in this space). */
export type Rgb = [number, number, number];

const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);

export function rgbToLab(r: number, g: number, b: number): Lab {
  return linearToLab([LIN_LUT[r], LIN_LUT[g], LIN_LUT[b]]);
}

export function linearToLab([R, G, B]: Rgb): Lab {
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29));
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const B = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const g = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  };
  return [g(R), g(G), g(B)];
}

/** ΔE76 with slightly reduced lightness weight: lighting changes L more than hue, but L still separates red from orange. */
export function colorDist(p: Lab, q: Lab, lWeight = 0.75): number {
  const dl = (p[0] - q[0]) * lWeight;
  return Math.hypot(dl, p[1] - q[1], p[2] - q[2]);
}

export function deltaE(p: Lab, q: Lab): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
