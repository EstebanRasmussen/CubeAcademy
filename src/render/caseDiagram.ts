/** Case diagrams (SVG) generated from a state and its pattern: top view of the last layer, or 3D view. */

import { COLOR_HEX, FACE_COLOR, Face, FaceletState } from '../cube/facelets';
import { PatternKind, pattern } from '../algs/pattern';

const GRAY = '#3a3f4b';
const DARK = '#23262e';
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const colorOf = (ch: string) => (ch === 'x' ? GRAY : ch === '-' ? DARK : 'URFDLB'.includes(ch) ? hex(COLOR_HEX[FACE_COLOR[ch as Face]]) : GRAY);

/** Top view: U face plus the top rows of the four sides. */
function topSvg(p: string, size: number): string {
  const cell = 20, gap = 2, side = 6;
  const o = side + gap * 2;
  const total = o * 2 + cell * 3 + gap * 2;
  const parts: string[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      parts.push(`<rect x="${o + c * (cell + gap)}" y="${o + r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${colorOf(p[r * 3 + c])}"/>`);
  for (let k = 0; k < 3; k++) {
    parts.push(`<rect x="${o + (2 - k) * (cell + gap)}" y="${gap}" width="${cell}" height="${side}" rx="1.5" fill="${colorOf(p[45 + k])}"/>`);
    parts.push(`<rect x="${o + k * (cell + gap)}" y="${o + 3 * (cell + gap)}" width="${cell}" height="${side}" rx="1.5" fill="${colorOf(p[18 + k])}"/>`);
    parts.push(`<rect x="${gap}" y="${o + k * (cell + gap)}" width="${side}" height="${cell}" rx="1.5" fill="${colorOf(p[36 + k])}"/>`);
    parts.push(`<rect x="${o + 3 * (cell + gap)}" y="${o + (2 - k) * (cell + gap)}" width="${side}" height="${cell}" rx="1.5" fill="${colorOf(p[9 + k])}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" role="img">${parts.join('')}</svg>`;
}

/** Isometric view of U, F, R (for F2L: the front-right slot is in front). */
function isoSvg(p: string, size: number): string {
  const a = 10; // cell size
  const cx = 50, cy = 50;
  const ex: [number, number] = [0.866 * a, 0.5 * a]; // +x (right) on screen
  const ez: [number, number] = [-0.866 * a, 0.5 * a]; // +z (front) on screen
  const ey: [number, number] = [0, -a]; // +y (up)
  const pt = (x: number, y: number, z: number) => [cx + x * ex[0] + y * ey[0] + z * ez[0], cy + x * ex[1] + y * ey[1] + z * ez[1]];
  const quad = (corners: number[][], fill: string) =>
    `<polygon points="${corners.map((c) => pt(c[0], c[1], c[2]).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" stroke="#111" stroke-width="0.8"/>`;
  const parts: string[] = [];
  const s = 0.92;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      // U: row r goes back→front (z = -1.5 + r), column c left→right
      const x0 = -1.5 + c, z0 = -1.5 + r;
      parts.push(quad([[x0, 1.5, z0], [x0 + s, 1.5, z0], [x0 + s, 1.5, z0 + s], [x0, 1.5, z0 + s]], colorOf(p[r * 3 + c])));
      // F: row r top→bottom, column c left→right (z = 1.5)
      const y0 = 1.5 - r;
      parts.push(quad([[x0, y0, 1.5], [x0 + s, y0, 1.5], [x0 + s, y0 - s, 1.5], [x0, y0 - s, 1.5]], colorOf(p[18 + r * 3 + c])));
      // R: column c front→back (x = 1.5)
      const zr = 1.5 - c;
      parts.push(quad([[1.5, y0, zr], [1.5, y0, zr - s], [1.5, y0 - s, zr - s], [1.5, y0 - s, zr]], colorOf(p[9 + r * 3 + c])));
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 18 60 64" width="${size}" height="${size}" role="img">${parts.join('')}</svg>`;
}

export function caseDiagramSvg(state: FaceletState, kind: PatternKind, view: 'top' | 'iso', size = 96): string {
  const p = pattern(state, kind);
  return view === 'iso' ? isoSvg(p, size) : topSvg(p, size);
}
