/**
 * Scan session (no DOM): turns per-frame face detections into 6 captured faces and a cube state.
 *
 * - Faces are tracked across frames (position + colors, any rotation), so the cube can move:
 *   a face is captured after a few consistent frames, not after holding still.
 * - Captured faces are identified by their whole 9-sticker pattern (min over rotations), never by
 *   the center alone, so similar centers (orange/yellow, red/orange) are never merged.
 * - White balance is estimated from the white center as soon as it has been seen.
 */

import { COLOR_FACE, ColorName, Face } from '../cube/facelets';
import { Lab, Rgb, colorDist, deltaE, linearToLab } from './color';
import { Classification, classifyStickers, classifyWithIllumination, learnPrototypes, nearestPrototype, plausibleColor, rankNamings } from './colorClassifier';
import { AssembleResult, ScannedFace, assembleCube, rotateGrid } from './faceAssembler';
import { DetectedFace } from './detector';

export type FaceObservation = Pick<DetectedFace, 'centers' | 'rgb' | 'frontal' | 'inliers' | 'pitch'> & {
  spread?: number[];
  alternatives?: FaceObservation[];
  fromHoles?: boolean;
};
import { Pt } from './homography';
import { Gains, NO_GAINS, applyGains, estimateGains, gainsFromWhite, labOf } from './whiteBalance';

export interface CapturedFace {
  rgb: Rgb[];
  /** the color of this face's center, when the user said which face was shown (guided scan) */
  label?: ColorName;
}

/** Order suggested by the guided scan: a natural tour of the cube. */
export const GUIDED_ORDER: ColorName[] = ['white', 'green', 'red', 'blue', 'orange', 'yellow'];

export interface ScanResult {
  classification: Classification;
  faces: Record<Face, ScannedFace>;
  assembled: AssembleResult;
  /** white-balanced Lab of every sticker (for calibration learning) */
  labs: Lab[][];
  gains: Gains;
}

/** Mean ΔE between two 3×3 patterns, minimized over the 4 rotations of `a`. */
export function patternDistance(a: readonly Lab[], b: readonly Lab[]): { d: number; k: number } {
  let best = { d: Infinity, k: 0 };
  for (let k = 0; k < 4; k++) {
    const r = rotateGrid(a, k);
    let s = 0;
    for (let i = 0; i < 9; i++) s += deltaE(r[i], b[i]);
    if (s / 9 < best.d) best = { d: s / 9, k };
  }
  return best;
}

export function assembleFromColors(classification: Classification, labs: Lab[][] = [], gains: Gains = NO_GAINS): ScanResult {
  const faces = {} as Record<Face, ScannedFace>;
  classification.colors.forEach((colors) => (faces[COLOR_FACE[colors[4]]] = { colors }));
  return { classification, faces, assembled: assembleCube(faces), labs, gains };
}

/**
 * Uses the cube's own constraints to fix misreads: swaps the colors of pairs among the least
 * confident stickers (keeping 9 per color) until the cube becomes valid.
 */
export function repairScan(result: ScanResult, candidates = 10): ScanResult | null {
  const { classification } = result;
  const cells: { f: number; c: number; conf: number }[] = [];
  classification.confidence.forEach((row, f) => row.forEach((conf, c) => c !== 4 && cells.push({ f, c, conf })));
  cells.sort((a, b) => a.conf - b.conf);
  const weak = cells.slice(0, candidates);
  for (let i = 0; i < weak.length; i++)
    for (let j = i + 1; j < weak.length; j++) {
      const a = weak[i], b = weak[j];
      const ca = classification.colors[a.f][a.c], cb = classification.colors[b.f][b.c];
      if (ca === cb) continue;
      const colors = classification.colors.map((r) => r.slice());
      colors[a.f][a.c] = cb;
      colors[b.f][b.c] = ca;
      const r = assembleFromColors({ colors, confidence: classification.confidence }, result.labs, result.gains);
      if (r.assembled.ok) return r;
    }
  return null;
}

/** White balance → balanced classification → rotation-agnostic assembly → automatic repair. */
export function finishScanLabs(labs: Lab[][], gains: Gains = NO_GAINS): ScanResult {
  const classification = classifyStickers(labs);
  const result = assembleFromColors(classification, labs, gains);
  if (result.assembled.ok) return result;
  return repairScan(result) ?? result;
}

export function finishScan(captured: readonly CapturedFace[]): ScanResult {
  const gains = gainsFor(captured);
  const balanced = captured.map((c) => c.rgb.map((p) => applyGains(p, gains)));
  // Global white balance first, then each face's own cast and gradient, jointly with the colors.
  const { classification, labs } = classifyWithIllumination(balanced);
  const labels = captured.map((c) => c.label);
  if (labels.every((l) => l) && new Set(labels).size === 6) {
    // Guided scan: the user said which face was which, so the names are known, not guessed.
    const current = classification.colors.map((r) => r[4]);
    const colors = classification.colors.map((row) => row.map((c) => labels[current.indexOf(c)]!));
    const r = assembleFromColors({ colors, confidence: classification.confidence }, labs, gains);
    return r.assembled.ok ? r : (repairScan(r) ?? r);
  }
  return resolveNaming(classification, labs, gains);
}

/** White balance: from the face the user labeled white if any, otherwise estimated from the centers. */
function gainsFor(captured: readonly CapturedFace[]): Gains {
  const white = captured.find((c) => c.label === 'white');
  return white ? gainsFromWhite(white.rgb[4]) : estimateGains(captured.map((c) => c.rgb[4]));
}

/**
 * The grouping of stickers into 6 classes doesn't depend on the color names; the names do. If the
 * most plausible naming gives an impossible cube, the next plausible ones are tried (strong lighting
 * can make a pastel yellow look almost white), then the automatic repair.
 */
function resolveNaming(classification: Classification, labs: Lab[][], gains: Gains): ScanResult {
  const current = classification.colors.map((r) => r[4]);
  let first: ScanResult | null = null;
  for (const names of rankNamings(labs.map((f) => f[4]))) {
    const colors = classification.colors.map((row) => row.map((c) => names[current.indexOf(c)]));
    const r = assembleFromColors({ colors, confidence: classification.confidence }, labs, gains);
    first ??= r;
    if (r.assembled.ok) return r;
  }
  const base = first ?? assembleFromColors(classification, labs, gains);
  return repairScan(base) ?? base;
}

/** Learned prototypes from a successful scan (static calibration that improves over time). */
export function calibrationFrom(result: ScanResult): Record<ColorName, Lab> {
  return learnPrototypes(result.labs, result.classification.colors);
}

interface Track {
  sum: Rgb[]; // accumulated, aligned to the first seen orientation (all samples)
  good: Rgb[]; // accumulated samples where the cell was clean (no glare, finger or edge)
  goodN: number[];
  /** least disturbed sample of each cell, used when a cell was never clean */
  best: { rgb: Rgb; spread: number }[];
  n: number;
  last: Lab[];
  center: Pt;
  pitch: number;
  lastFrame: number;
  captured: boolean;
  /** frames where the face was seen through its stickers (a certain grid), not only through corner holes */
  certain: number;
  /** tracks built from corner holes and from stickers are kept apart: a shifted hole grid can look similar */
  fromHoles: boolean;
}

export type SessionEvent =
  | { type: 'capture'; index: number; replaced: boolean; hint: ColorName }
  | { type: 'complete'; result: ScanResult };

export interface SessionOptions {
  /** consecutive consistent frames before capture */
  frames: number;
  /** minimum frontal score of a face to be captured */
  minFrontal: number;
  /** max mean ΔE between frames of the same tracked face */
  trackDelta: number;
  /** max mean ΔE for two captures to be the same face */
  sameFace: number;
  /** a cell is clean in a frame if its spread is below this */
  cleanSpread: number;
}

export const DEFAULT_SESSION: SessionOptions = { frames: 3, minFrontal: 0.5, trackDelta: 16, sameFace: 13, cleanSpread: 9 };

export class ScanSession {
  captured: CapturedFace[] = [];
  gains: Gains = NO_GAINS;
  /** guided scan: the face the user is showing (its center color), or null for fully automatic */
  expected: ColorName | null = null;
  /** guided scan: after each capture, move on to the next face in GUIDED_ORDER */
  guided = false;
  private tracks: Track[] = [];
  private frame = 0;
  private opts: SessionOptions;

  constructor(opts: Partial<SessionOptions> = {}) {
    this.opts = { ...DEFAULT_SESSION, ...opts };
  }

  reset() {
    this.captured = [];
    this.gains = NO_GAINS;
    this.tracks = [];
    if (this.guided) this.expected = GUIDED_ORDER[0];
  }

  /** Faces already labeled by the user (guided scan). */
  labeled(): ColorName[] {
    return this.captured.map((c) => c.label).filter((l): l is ColorName => !!l);
  }

  /**
   * Live references measured on labeled centers, under the current light: the scan calibrates itself
   * while it goes, and later faces are read against what was just seen.
   */
  private liveRefs(): [ColorName, Lab][] {
    return this.captured.filter((c) => c.label).map((c) => [c.label!, labOf(c.rgb[4], this.gains)] as [ColorName, Lab]);
  }

  /** Live provisional name of a color (white-balanced with what is known so far). */
  hint(rgb: Rgb): ColorName {
    const lab = labOf(rgb, this.gains);
    const refs = this.liveRefs();
    const rule = nearestPrototype(lab);
    if (!refs.length) return rule;
    let best: [ColorName, number] = [refs[0][0], Infinity];
    for (const [name, ref] of refs) {
      const d = colorDist(lab, ref);
      if (d < best[1]) best = [name, d];
    }
    // close to a color measured on this cube under this light: trust it; otherwise the generic rule
    if (best[1] < 14) return best[0];
    return refs.some(([n]) => n === rule) ? best[0] : rule;
  }

  /** Progress (0..1) of each detected face toward capture, in the order given to the last push. */
  lastProgress: number[] = [];

  push(faces: readonly FaceObservation[]): SessionEvent[] {
    this.frame++;
    const events: SessionEvent[] = [];
    this.lastProgress = [];
    // In a guided scan only the face turned toward the camera is the one the user means.
    const prominent = this.expected ? Math.max(-1, ...faces.map((x) => x.frontal * x.pitch)) : -1;
    for (const f0 of faces) {
      const f = this.resolveAlternatives(f0);
      if (!f || f.frontal < this.opts.minFrontal || f.inliers < 5 || (this.expected && f0.frontal * f0.pitch < prominent)) {
        this.lastProgress.push(0);
        continue;
      }
      const lab = f.rgb.map(linearToLab);
      const center: Pt = [f.centers[4][0], f.centers[4][1]];
      let track: Track | undefined;
      let k = 0;
      for (const t of this.tracks) {
        if (t.lastFrame < this.frame - 2) continue;
        const dist = Math.hypot(center[0] - t.center[0], center[1] - t.center[1]);
        if (dist > 2.5 * Math.max(t.pitch, f.pitch)) continue;
        // a stickers grid and a holes grid are the same reading only if they sit in the same place
        // (a holes grid shifted by one cell can have similar colors)
        if (t.fromHoles !== !!f.fromHoles && dist > 0.45 * Math.max(t.pitch, f.pitch)) continue;
        const pd = patternDistance(lab, t.last);
        if (pd.d < this.opts.trackDelta) {
          track = t;
          k = pd.k;
          break;
        }
      }
      if (!track) {
        track = { sum: f.rgb.map(() => [0, 0, 0] as Rgb), good: f.rgb.map(() => [0, 0, 0] as Rgb), goodN: f.rgb.map(() => 0), best: f.rgb.map(() => ({ rgb: [0, 0, 0] as Rgb, spread: Infinity })), n: 0, last: lab, center, pitch: f.pitch, lastFrame: this.frame, captured: false, certain: 0, fromHoles: !!f.fromHoles };
        this.tracks.push(track);
      }
      const aligned = rotateGrid(f.rgb, k);
      const spread = rotateGrid(f.spread ?? f.rgb.map(() => 0), k);
      aligned.forEach((p, i) => {
        const clean = spread[i] <= this.opts.cleanSpread || i === 4; // the center may carry a logo
        for (let c = 0; c < 3; c++) {
          track!.sum[i][c] += p[c];
          if (clean) track!.good[i][c] += p[c];
        }
        if (clean) track!.goodN[i]++;
        if (spread[i] < track!.best[i].spread) track!.best[i] = { rgb: p, spread: spread[i] };
      });
      track.n++;
      if (!f.fromHoles) track.certain++;
      track.last = rotateGrid(lab, k);
      track.center = center;
      track.pitch = f.pitch;
      track.lastFrame = this.frame;
      this.lastProgress.push(track.captured ? 1 : Math.min(1, track.n / (track.certain > 0 ? this.opts.frames : this.opts.frames + 2)));
      // a face seen only through corner holes needs a longer consistent run before it is trusted
      const needed = track.certain > 0 ? this.opts.frames : this.opts.frames + 2;
      if (!track.captured && track.n >= needed) {
        track.captured = true;
        const t = track;
        // clean samples averaged; a cell never seen clean (persistent glare) takes its least disturbed sample
        const rgb = t.sum.map((_, i) => (t.goodN[i] ? (t.good[i].map((v) => v / t.goodN[i]) as Rgb) : t.best[i].rgb));
        const ev = this.capture(rgb, this.expected ?? undefined);
        if (ev) events.push(...ev);
      }
    }
    this.tracks = this.tracks.filter((t) => t.lastFrame >= this.frame - 2);
    return events;
  }

  /**
   * A face found from corner holes may be off by one cell; its alternatives differ in which piece is
   * at the center. Knowing the expected center color decides; without it the face is not used.
   */
  private resolveAlternatives(f: FaceObservation): FaceObservation | null {
    const options = [f, ...(f.alternatives ?? [])];
    if (!this.expected) return f.fromHoles || f.alternatives?.length ? null : f;
    // guided: the face shown must have a center that can be the expected color
    const matching = options.filter((x) => this.fitsExpected(x.rgb[4]));
    return matching.length === 1 ? matching[0] : null;
  }

  private fitsExpected(center: Rgb): boolean {
    if (!this.expected) return true;
    const lab = labOf(center, this.gains);
    // a color already labeled on this cube and close to this center is not the expected one
    const taken = this.liveRefs().find(([n, ref]) => n !== this.expected && colorDist(lab, ref) < 10);
    const uncalibrated = !this.captured.some((c) => c.label === 'white');
    return !taken && plausibleColor(lab, this.expected, uncalibrated);
  }

  /** Adds (or replaces) a face. Exposed for the fixed-guide mode and tests. */
  capture(rgb: Rgb[], label?: ColorName): SessionEvent[] {
    const lab = rgb.map(linearToLab);
    let match = label ? this.captured.findIndex((c) => c.label === label) : -1;
    let best = Infinity;
    if (!label) this.captured.forEach((c, i) => {
      if (c.label) return;
      const pd = patternDistance(lab, c.rgb.map(linearToLab));
      const centerD = deltaE(lab[4], linearToLab(c.rgb[4]));
      if (pd.d < this.opts.sameFace && centerD < this.opts.sameFace && pd.d < best) {
        best = pd.d;
        match = i;
      }
    });
    if (match < 0 && this.captured.length >= 6) return [];
    if (match >= 0) this.captured[match] = { rgb, label };
    else this.captured.push({ rgb, label });
    this.gains = gainsFor(this.captured);
    const index = match >= 0 ? match : this.captured.length - 1;
    const events: SessionEvent[] = [{ type: 'capture', index, replaced: match >= 0, hint: label ?? this.hint(rgb[4]) }];
    if (label && this.guided) {
      const done = new Set(this.labeled());
      this.expected = GUIDED_ORDER.find((c) => !done.has(c)) ?? null;
      // the face just captured must not be captured again under the next label
      this.tracks.forEach((t) => (t.captured = true));
    }
    if (this.captured.length === 6) events.push({ type: 'complete', result: finishScan(this.captured) });
    return events;
  }
}
