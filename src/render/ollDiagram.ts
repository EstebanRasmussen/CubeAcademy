/** 2D top-view OLL diagram (SVG) generated from a facelet state. */

import { FaceletState } from '../cube/facelets';

const YELLOW = '#ffd500';
const GRAY = '#3a3f4b';

export function ollDiagramSvg(s: FaceletState, size = 96): string {
  const cell = 20;
  const gap = 2;
  const side = 6; // thickness of side stickers
  const o = side + gap * 2; // offset of top grid
  const total = o * 2 + cell * 3 + gap * 2;
  const col = (on: boolean) => (on ? YELLOW : GRAY);
  const parts: string[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const x = o + c * (cell + gap);
      const y = o + r * (cell + gap);
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${col(s[r * 3 + c] === 'U')}"/>`);
    }
  // Back: B top row read from outside (left→right = R→L as seen from above)
  for (let k = 0; k < 3; k++) {
    const x = o + (2 - k) * (cell + gap);
    parts.push(`<rect x="${x}" y="${gap}" width="${cell}" height="${side}" rx="1.5" fill="${col(s[45 + k] === 'U')}"/>`);
  }
  // Front: F top row, left→right
  for (let k = 0; k < 3; k++) {
    const x = o + k * (cell + gap);
    const y = o + 3 * (cell + gap);
    parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${side}" rx="1.5" fill="${col(s[18 + k] === 'U')}"/>`);
  }
  // Left: L top row from outside goes back→front
  for (let k = 0; k < 3; k++) {
    const y = o + k * (cell + gap);
    parts.push(`<rect x="${gap}" y="${y}" width="${side}" height="${cell}" rx="1.5" fill="${col(s[36 + k] === 'U')}"/>`);
  }
  // Right: R top row from outside goes front→back
  for (let k = 0; k < 3; k++) {
    const y = o + (2 - k) * (cell + gap);
    const x = o + 3 * (cell + gap);
    parts.push(`<rect x="${x}" y="${y}" width="${side}" height="${cell}" rx="1.5" fill="${col(s[9 + k] === 'U')}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" role="img">${parts.join('')}</svg>`;
}
