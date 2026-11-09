/**
 * Software renderer of a cube in perspective (no DOM / WebGL): used by tests and by the simulated webcam.
 * Produces an RGBA image plus an id buffer (facelet index per pixel) as ground truth.
 */

import { Quaternion, Vector3 } from 'three';
import { FACE_COLOR, FaceletState, GEOMETRY, Face } from '../cube/facelets';
import { Pt } from './homography';
import { RawImage } from './detector';
import { labToRgb } from './color';

export const STICKER_RGB: Record<string, [number, number, number]> = {
  white: [222, 224, 220],
  yellow: [235, 210, 30],
  green: [20, 160, 80],
  blue: [25, 70, 175],
  red: [190, 25, 40],
  orange: [245, 105, 25],
};

/** Pastel/neon stickerless palette measured on a real cube (from Lab under neutral light). */
export const PASTEL_RGB: Record<string, [number, number, number]> = {
  white: labToRgb([88, 0, -3]),
  yellow: labToRgb([87, -14, 36]),
  green: labToRgb([62, -54, 28]),
  blue: labToRgb([36, 28, -62]),
  red: labToRgb([46, 41, 20]),
  orange: labToRgb([68, 24, 31]),
};

export interface Pose {
  /** cube → camera rotation */
  q: Quaternion;
  /** cube center in camera space (camera looks along +z, y up) */
  t: Vector3;
}

export interface SceneOptions {
  width: number;
  height: number;
  /** focal length in pixels */
  focal: number;
  /** per-channel multiplier in sRGB (light color) */
  tint: [number, number, number];
  noise: number;
  clutter: boolean;
  glare: boolean;
  seed: number;
  palette: Record<string, [number, number, number]>;
  /** 0..1: strength of a random color cast and light gradient different on every face */
  faceLight: number;
  /** seed of the per-face light (stable across frames, like a real room) */
  lightSeed: number;
  /** stickerless cube: adjacent pieces touch, only corner holes separate them */
  stickerless: boolean;
}

export const DEFAULT_SCENE: SceneOptions = {
  width: 480,
  height: 360,
  focal: 520,
  tint: [1, 0.93, 0.8],
  noise: 10,
  clutter: true,
  glare: true,
  seed: 1,
  palette: STICKER_RGB,
  faceLight: 0,
  lightSeed: 1,
  stickerless: false,
};

export interface RenderResult extends RawImage {
  ids: Int16Array;
  visible: { face: Face; facing: number }[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function fillPoly(img: RenderResult, pts: Pt[], rgb: number[], id = -2) {
  const { width: w, height: h, data, ids } = img;
  const minY = Math.max(0, Math.ceil(Math.min(...pts.map((p) => p[1])) - 0.5));
  const maxY = Math.min(h - 1, Math.floor(Math.max(...pts.map((p) => p[1])) - 0.5));
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length];
      if ((p[1] <= yc && q[1] > yc) || (q[1] <= yc && p[1] > yc)) xs.push(p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const x0 = Math.max(0, Math.ceil(xs[0] - 0.5)), x1 = Math.min(w - 1, Math.floor(xs[xs.length - 1] - 0.5));
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      data[i * 4] = rgb[0];
      data[i * 4 + 1] = rgb[1];
      data[i * 4 + 2] = rgb[2];
      data[i * 4 + 3] = 255;
      if (id !== -2) ids[i] = id;
    }
  }
}

const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const NORMALS: Record<Face, [number, number, number]> = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

export function renderCube(state: FaceletState, pose: Pose, options: Partial<SceneOptions> = {}): RenderResult {
  const o = { ...DEFAULT_SCENE, ...options };
  const rand = rng(o.seed);
  const { width: w, height: h } = o;
  const img: RenderResult = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4), ids: new Int16Array(w * h).fill(-1), visible: [] };

  // Background: soft gradient plus colored clutter (distractors).
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = 70 + 50 * (y / h) + 20 * (x / w);
      img.data[i] = v * o.tint[0];
      img.data[i + 1] = v * 0.95 * o.tint[1];
      img.data[i + 2] = v * 0.9 * o.tint[2];
      img.data[i + 3] = 255;
    }
  if (o.clutter) {
    for (let k = 0; k < 7; k++) {
      const cx = rand() * w, cy = rand() * h, sw = 10 + rand() * 60, sh = 10 + rand() * 60;
      const col = [rand() * 255, rand() * 255, rand() * 255].map((v, c) => v * o.tint[c]);
      fillPoly(img, [[cx, cy], [cx + sw, cy + sh * 0.2], [cx + sw * 0.8, cy + sh], [cx - sw * 0.1, cy + sh * 0.9]], col);
    }
  }

  // Camera looks along +z with y up: image right is -x, so the camera frame is right-handed (no mirroring).
  const project = (v: Vector3): Pt => [w / 2 - (o.focal * v.x) / v.z, h / 2 - (o.focal * v.y) / v.z];
  const toCam = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(pose.q).add(pose.t);

  const light = new Vector3(0.3, 0.5, -1).normalize(); // toward the camera side
  for (const face of Object.keys(NORMALS) as Face[]) {
    const n = NORMALS[face];
    const nc = new Vector3(...n).applyQuaternion(pose.q);
    const center = toCam(n[0] * 1.5, n[1] * 1.5, n[2] * 1.5);
    const facing = -nc.dot(center.clone().normalize());
    if (facing <= 0.02) continue;
    img.visible.push({ face, facing });
    // tangent axes of the face plane
    const axes = [0, 1, 2].filter((a) => n[a] === 0);
    const corner = (a: number, b: number) => {
      const p = [n[0] * 1.5, n[1] * 1.5, n[2] * 1.5];
      p[axes[0]] += a;
      p[axes[1]] += b;
      return project(toCam(p[0], p[1], p[2]));
    };
    fillPoly(img, [corner(-1.5, -1.5), corner(1.5, -1.5), corner(1.5, 1.5), corner(-1.5, 1.5)], [18, 18, 20]);
    const shade = 0.7 + 0.3 * Math.max(0, -nc.dot(light));
    // per-face cast (e.g. a screen reflecting on one face) and gradient across the face
    const fr = rng(o.lightSeed * 7919 + FACE_ORDER.indexOf(face) * 104729);
    const cast = [0, 1, 2].map(() => 1 + o.faceLight * (fr() - 0.5) * 0.5);
    const grad = [(fr() - 0.5) * 2, (fr() - 0.5) * 2].map((g) => g * o.faceLight * 0.25);
    const gradTint = [0, 1, 2].map(() => 1 + o.faceLight * (fr() - 0.5) * 0.3);
    GEOMETRY.forEach((g, idx) => {
      if (g.face !== face) return;
      // stickerless: pieces touch their neighbors (same colors merge), only the rounded corners leave dark holes
      const s = o.stickerless ? 0.47 : 0.43, ch = o.stickerless ? 0.14 : 0.09;
      // stickerless pieces touch each other (spacing 0.94 = 2·0.47) but leave a dark outline toward the other faces
      const k = o.stickerless ? 0.94 : 1;
      const c0 = g.pos[axes[0]] * k, c1 = g.pos[axes[1]] * k;
      const oct: [number, number][] = [
        [-s + ch, -s], [s - ch, -s], [s, -s + ch], [s, s - ch], [s - ch, s], [-s + ch, s], [-s, s - ch], [-s, -s + ch],
      ];
      const base = o.palette[FACE_COLOR[state[idx] as Face]];
      const gl = 1 + grad[0] * c0 + grad[1] * c1;
      const rgb = base.map((v, k) => Math.min(255, v * o.tint[k] * shade * cast[k] * (gl > 1 ? 1 + (gl - 1) * gradTint[k] : gl) * (0.96 + 0.08 * rand())));
      fillPoly(img, oct.map(([a, b]) => corner(c0 + a, c1 + b)), rgb, idx);
    });
  }

  // Glare: a soft bright spot somewhere on the cube.
  if (o.glare && img.visible.length) {
    // the highlight moves around as the cube turns
    const c = project(pose.t.clone().add(new Vector3(-0.6 + (rand() - 0.5) * 1.6, 0.6 + (rand() - 0.5) * 1.6, -1.4)));
    const r = 18 + rand() * 14;
    for (let y = Math.max(0, (c[1] - r) | 0); y < Math.min(h, c[1] + r); y++)
      for (let x = Math.max(0, (c[0] - r) | 0); x < Math.min(w, c[0] + r); x++) {
        const d = Math.hypot(x - c[0], y - c[1]) / r;
        if (d >= 1) continue;
        const a = (1 - d) ** 2 * 0.9;
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) img.data[i + k] = img.data[i + k] * (1 - a) + 255 * a;
      }
  }

  // Camera softness (3×3 box blur) and sensor noise.
  const src = new Uint8ClampedArray(img.data);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * w + x + dx) * 4 + k];
        img.data[(y * w + x) * 4 + k] = s / 9;
      }
  if (o.noise > 0)
    for (let i = 0; i < w * h; i++) {
      const n = (rand() + rand() - 1) * o.noise;
      for (let k = 0; k < 3; k++) img.data[i * 4 + k] = img.data[i * 4 + k] + n + (rand() - 0.5) * o.noise * 0.5;
    }
  return img;
}

/** Pose that shows `face` toward the camera, tilted by (pitch, yaw, roll) radians, at distance z. */
export function poseFacing(face: Face, tilt: [number, number, number], position: [number, number, number]): Pose {
  const n = new Vector3(...NORMALS[face]);
  const toCamera = new Quaternion().setFromUnitVectors(n, new Vector3(0, 0, -1));
  const qt = new Quaternion();
  const ex = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt[0]);
  const ey = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), tilt[1]);
  const ez = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), tilt[2]);
  qt.multiply(ez).multiply(ey).multiply(ex).multiply(toCamera);
  return { q: qt, t: new Vector3(...position) };
}
