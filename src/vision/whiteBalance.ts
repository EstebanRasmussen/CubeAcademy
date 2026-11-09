/**
 * Dynamic white balance. A Rubik's cube carries its own reference: the white face.
 * The center with the lowest chroma (among the brighter ones) is taken as white; per-channel gains
 * in linear RGB make it neutral, which removes the color cast of warm/cold lights before classifying.
 */

import { Lab, Rgb, linearToLab } from './color';

export type Gains = Rgb;
export const NO_GAINS: Gains = [1, 1, 1];

export function applyGains(rgb: Rgb, g: Gains): Rgb {
  return [Math.min(1, rgb[0] * g[0]), Math.min(1, rgb[1] * g[1]), Math.min(1, rgb[2] * g[2])];
}

export function labOf(rgb: Rgb, g: Gains = NO_GAINS): Lab {
  return linearToLab(applyGains(rgb, g));
}

/** Saturation relative to lightness: a dark blue has low chroma only because it is dark. */
const saturation = (lab: Lab) => Math.hypot(lab[1], lab[2]) / Math.max(lab[0], 10);

/**
 * Gray-world on a single reference: gains that turn `white` neutral while keeping its luminance,
 * clamped so a misidentified reference can't distort colors wildly.
 */
export function gainsFromWhite(white: Rgb): Gains {
  const y = 0.2126 * white[0] + 0.7152 * white[1] + 0.0722 * white[2];
  const clamp = (v: number) => Math.max(0.5, Math.min(2.2, v));
  return [clamp(y / Math.max(1e-4, white[0])), clamp(y / Math.max(1e-4, white[1])), clamp(y / Math.max(1e-4, white[2]))];
}

/**
 * Picks the white center among the given centers: brightness in the upper half and lowest chroma.
 * Returns null when no plausible white is present (e.g. the white face hasn't been seen yet).
 */
export function findWhite(centers: readonly Rgb[]): number | null {
  if (!centers.length) return null;
  const labs = centers.map((c) => linearToLab(c));
  const Ls = labs.map((l) => l[0]).sort((a, b) => a - b);
  const medianL = Ls[Math.floor(Ls.length / 2)];
  let best = -1;
  let bestC = Infinity;
  labs.forEach((l, i) => {
    if (l[0] < Math.min(medianL, 45)) return;
    const c = saturation(l);
    if (c < bestC) {
      bestC = c;
      best = i;
    }
  });
  // Under strong colored light white can reach high chroma, but yellow/orange are far more saturated.
  if (best < 0 || bestC > 1) return null;
  // White must stand out clearly: a pastel yellow is the least saturated color until white is seen,
  // and taking it as the reference would wash all yellows out.
  // compare only with bright centers: white is always among the brightest, and a dark blue has an unreliable saturation
  const others = labs.filter((l, i) => i !== best && l[0] > 0.6 * labs[best][0]).map(saturation);
  if (others.length && bestC > 0.75 * Math.min(...others)) return null;
  return best;
}

export function estimateGains(centers: readonly Rgb[]): Gains {
  const w = findWhite(centers);
  return w === null ? NO_GAINS : gainsFromWhite(centers[w]);
}
