/**
 * Facelet model in Kociemba order: U1..U9, R1..R9, F1..F9, D1..D9, L1..L9, B1..B9.
 * Each facelet holds the letter of the face whose center shares its color.
 *
 * 3D convention: x → right (R), y → up (U), z → front (F).
 * Every face is read row by row as seen from outside the cube (the net layout used by Kociemba).
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: readonly Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
export const FACE_INDEX: Record<Face, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

/** 54-char facelet string. */
export type FaceletState = string;

export const SOLVED: FaceletState = FACES.map((f) => f.repeat(9)).join('');

export type Vec3 = [number, number, number];

export interface FaceletGeom {
  face: Face;
  /** cubie position, each coordinate in {-1,0,1} */
  pos: Vec3;
  /** outward normal */
  normal: Vec3;
}

const NORMALS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

function facePos(face: Face, r: number, c: number): Vec3 {
  switch (face) {
    case 'U': return [c - 1, 1, r - 1];
    case 'R': return [1, 1 - r, 1 - c];
    case 'F': return [c - 1, 1 - r, 1];
    case 'D': return [c - 1, -1, 1 - r];
    case 'L': return [-1, 1 - r, c - 1];
    case 'B': return [1 - c, 1 - r, -1];
  }
}

export const GEOMETRY: readonly FaceletGeom[] = (() => {
  const out: FaceletGeom[] = [];
  for (const face of FACES) {
    for (let i = 0; i < 9; i++) {
      out.push({ face, pos: facePos(face, Math.floor(i / 3), i % 3), normal: NORMALS[face] });
    }
  }
  return out;
})();

const keyOf = (pos: Vec3, n: Vec3) => `${pos.join(',')}|${n.join(',')}`;
const INDEX_BY_KEY = new Map<string, number>(GEOMETRY.map((g, i) => [keyOf(g.pos, g.normal), i]));

export function faceletIndexAt(pos: Vec3, normal: Vec3): number {
  const idx = INDEX_BY_KEY.get(keyOf(pos, normal));
  if (idx === undefined) throw new Error(`No facelet at ${pos} / ${normal}`);
  return idx;
}

/** Facelets of one face (9 letters, row-major as seen from outside). */
export function faceOf(state: FaceletState, face: Face): string {
  const s = FACE_INDEX[face] * 9;
  return state.slice(s, s + 9);
}

// ---- Physical colors -------------------------------------------------------

export type ColorName = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange';
export const COLOR_NAMES: readonly ColorName[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];

/**
 * Western color scheme held in the OLL training orientation:
 * yellow up, green front → orange right, red left, blue back, white down.
 */
export const FACE_COLOR: Record<Face, ColorName> = {
  U: 'yellow',
  R: 'orange',
  F: 'green',
  D: 'white',
  L: 'red',
  B: 'blue',
};

export const COLOR_FACE: Record<ColorName, Face> = Object.fromEntries(
  Object.entries(FACE_COLOR).map(([f, c]) => [c, f]),
) as Record<ColorName, Face>;

export const COLOR_HEX: Record<ColorName, number> = {
  white: 0xf4f4f4,
  yellow: 0xffd500,
  green: 0x009b48,
  blue: 0x0046ad,
  red: 0xb71234,
  orange: 0xff5800,
};

export const COLOR_LABEL_IT: Record<ColorName, string> = {
  white: 'bianco',
  yellow: 'giallo',
  green: 'verde',
  blue: 'blu',
  red: 'rosso',
  orange: 'arancio',
};
