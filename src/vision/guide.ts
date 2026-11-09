/** Fixed-guide fallback: a centered 3×3 grid acts as a known homography (e.g. stickerless solved faces). */

import { DetectedFace, RawImage, darkGaps, sampleCellsWithSpread } from './detector';
import { linearToLab } from './color';
import { Pt } from './homography';

export interface GuideRect {
  x: number;
  y: number;
  size: number;
}

export function guideRect(width: number, height: number, fraction = 0.62): GuideRect {
  const size = Math.round(Math.min(width, height) * fraction);
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
}

/** Reads the guide; returns a face only if all 9 cells look like uniform stickers. */
export function readGuide(img: RawImage, maxSpread = 9): DetectedFace | null {
  const r = guideRect(img.width, img.height);
  const cell = r.size / 3;
  const H = new Float64Array([cell, 0, r.x + cell / 2, 0, cell, r.y + cell / 2, 0, 0, 1]);
  const { rgb, spread } = sampleCellsWithSpread(img, H, 0.25, 7);
  if (spread.some((s) => s > maxSpread)) return null;
  const lab = rgb.map(linearToLab);
  if (lab.some((l) => l[0] < 12)) return null;
  if (darkGaps(img, H, lab) < 8) return null; // a plain wall or a sheet of paper is not a cube face
  const centers: Pt[] = [];
  for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) centers.push([r.x + (u + 0.5) * cell, r.y + (v + 0.5) * cell]);
  const corners: Pt[] = [[r.x, r.y], [r.x + r.size, r.y], [r.x + r.size, r.y + r.size], [r.x, r.y + r.size]];
  return { corners, centers, rgb, lab, inliers: 9, frontal: 1, pitch: cell, spread, H };
}
