/**
 * Move notation: parse, format, invert, simplify.
 *
 * Supported syntax (the de-facto standard used by speedcubing sites and the WCA community):
 *   R U R' U'          face turns, ' = counter-clockwise, 2 = half turn (R2' accepted)
 *   r / Rw, M E S      wide turns, slices;  x y z  whole-cube rotations
 *   (R U R' U')        a group (fingertrick grouping, no effect on the moves)
 *   (R U R' U')3       a repeated group;  (R U)' inverted group
 *   [R: U]             conjugate  = R U R'
 *   [R, U]             commutator = R U R' U'
 *   sexy, sledge, …    named triggers (see triggers.ts), case-insensitive
 * Spaces are optional between moves ("RUR'U'").
 */

import { TRIGGER_BY_NAME } from './triggers';

export const MOVE_LETTERS = 'URFDLBurfdlbMESxyz';
export type MoveLetter =
  | 'U' | 'R' | 'F' | 'D' | 'L' | 'B'
  | 'u' | 'r' | 'f' | 'd' | 'l' | 'b'
  | 'M' | 'E' | 'S'
  | 'x' | 'y' | 'z';

export interface Move {
  letter: MoveLetter;
  /** clockwise quarter turns: 1, 2 or 3 (= prime) */
  amount: 1 | 2 | 3;
}

/** Parse error with a stable code (translated by the UI) and the offending text. */
export class NotationError extends Error {
  constructor(public code: 'badMove' | 'unbalanced' | 'badBracket', public token: string) {
    super(`${code}: ${token}`);
  }
}

const TOKEN = /^([URFDLBMESxyzurfdlb])(w?)(\d*)('?)(\d*)$/;

export function parseMove(token: string): Move {
  const t = token.replace(/[’`´′]/g, "'");
  const m = TOKEN.exec(t);
  if (!m) throw new NotationError('badMove', token);
  let letter = m[1];
  if (m[2]) {
    if (!'URFDLB'.includes(letter)) throw new NotationError('badMove', token);
    letter = letter.toLowerCase();
  }
  const n = Number(m[3] || m[5] || 1);
  const amount = (((m[4] === "'" ? -n : n) % 4) + 4) % 4;
  if (amount === 0) throw new NotationError('badMove', token);
  return { letter: letter as MoveLetter, amount: amount as 1 | 2 | 3 };
}

// ---------------------------------------------------------------------------- algorithm tree

export type AlgNode =
  | { type: 'move'; move: Move }
  | { type: 'group'; kind: 'paren' | 'bracket'; children: AlgNode[]; repeat: number; invert: boolean }
  | { type: 'conjugate'; a: AlgNode[]; b: AlgNode[]; repeat: number; invert: boolean }
  | { type: 'commutator'; a: AlgNode[]; b: AlgNode[]; repeat: number; invert: boolean }
  | { type: 'trigger'; name: string; repeat: number; invert: boolean };

/** Parses an algorithm into a tree that keeps groups, conjugates, commutators and trigger names. */
export function parseAlgTree(alg: string): AlgNode[] {
  const s = alg.replace(/[’`´′]/g, "'");
  let i = 0;

  const suffix = (): { repeat: number; invert: boolean } => {
    let repeat = 1;
    let invert = false;
    // order-free: (..)2'  (..)'2  (..)x2  (..)*2  (..)×2
    for (;;) {
      if (s[i] === "'") {
        invert = !invert;
        i++;
      } else if (/[*×]/.test(s[i] ?? '') && /\d/.test(s[i + 1] ?? '')) {
        i++;
      } else if (/\d/.test(s[i] ?? '')) {
        let d = '';
        while (/\d/.test(s[i] ?? '')) d += s[i++];
        repeat = Number(d);
      } else break;
    }
    return { repeat, invert };
  };

  const parseSeq = (closers: string): AlgNode[] => {
    const out: AlgNode[] = [];
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (closers.includes(ch)) return out;
      if (ch === ')' || ch === ']' || ch === ':' || ch === ',') throw new NotationError('unbalanced', ch);
      if (ch === '(') {
        i++;
        const children = parseSeq(')');
        if (s[i] !== ')') throw new NotationError('unbalanced', '(');
        i++;
        out.push({ type: 'group', kind: 'paren', children, ...suffix() });
        continue;
      }
      if (ch === '[') {
        i++;
        const a = parseSeq(':,]');
        const sep = s[i];
        if (sep === ']') {
          i++;
          out.push({ type: 'group', kind: 'bracket', children: a, ...suffix() });
          continue;
        }
        if (sep !== ':' && sep !== ',') throw new NotationError('badBracket', '[');
        i++;
        const b = parseSeq(']');
        if (s[i] !== ']') throw new NotationError('badBracket', '[');
        i++;
        out.push({ type: sep === ':' ? 'conjugate' : 'commutator', a, b, ...suffix() });
        continue;
      }
      // trigger name: a known word followed by a non-letter
      const word = /^[A-Za-z][A-Za-z-]*/.exec(s.slice(i))?.[0] ?? '';
      if (word.length >= 3 && TRIGGER_BY_NAME.has(word.toLowerCase())) {
        i += word.length;
        out.push({ type: 'trigger', name: TRIGGER_BY_NAME.get(word.toLowerCase())!.id, ...suffix() });
        continue;
      }
      // a single move: letter, optional w, digits, ', digits
      const m = /^[URFDLBMESxyzurfdlb]w?\d*'?\d*/.exec(s.slice(i));
      if (!m) throw new NotationError('badMove', word || ch);
      // "R2" followed by a letter is fine; "R2U" → R2 then U
      out.push({ type: 'move', move: parseMove(m[0]) });
      i += m[0].length;
    }
    return out;
  };

  const tree = parseSeq('');
  if (i < s.length) throw new NotationError('unbalanced', s[i]);
  return tree;
}

function repeatInvert(moves: Move[], repeat: number, invert: boolean): Move[] {
  const base = invert ? invertAlg(moves) : moves;
  const out: Move[] = [];
  for (let k = 0; k < repeat; k++) out.push(...base);
  return out;
}

export function expandTree(nodes: readonly AlgNode[]): Move[] {
  const out: Move[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'move':
        out.push({ ...n.move });
        break;
      case 'group':
        out.push(...repeatInvert(expandTree(n.children), n.repeat, n.invert));
        break;
      case 'conjugate': {
        const a = expandTree(n.a);
        out.push(...repeatInvert([...a, ...expandTree(n.b), ...invertAlg(a)], n.repeat, n.invert));
        break;
      }
      case 'commutator': {
        const a = expandTree(n.a);
        const b = expandTree(n.b);
        out.push(...repeatInvert([...a, ...b, ...invertAlg(a), ...invertAlg(b)], n.repeat, n.invert));
        break;
      }
      case 'trigger':
        out.push(...repeatInvert(parseAlg(TRIGGER_BY_NAME.get(n.name)!.alg), n.repeat, n.invert));
        break;
    }
  }
  return out;
}

export function parseAlg(alg: string): Move[] {
  return expandTree(parseAlgTree(alg));
}

/** Top-level structure of an algorithm as written: one segment per top-level group/trigger. */
export interface AlgSegment {
  start: number;
  end: number; // exclusive, in expanded moves
  /** trigger id, or null for a plain group */
  trigger: string | null;
  repeat: number;
}

export function segmentsOf(alg: string): AlgSegment[] {
  const out: AlgSegment[] = [];
  let pos = 0;
  for (const n of parseAlgTree(alg)) {
    const len = expandTree([n]).length;
    if (n.type !== 'move') out.push({ start: pos, end: pos + len, trigger: n.type === 'trigger' ? n.name : null, repeat: 'repeat' in n ? n.repeat : 1 });
    pos += len;
  }
  return out;
}

export function formatMove(m: Move): string {
  return m.letter + (m.amount === 1 ? '' : m.amount === 2 ? '2' : "'");
}

export function formatAlg(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ');
}

export function invertMove(m: Move): Move {
  return { letter: m.letter, amount: (4 - m.amount) as 1 | 2 | 3 };
}

export function invertAlg(moves: readonly Move[]): Move[] {
  return moves.slice().reverse().map(invertMove);
}

/** Merge consecutive moves of the same letter (R R → R2, R R' → nothing). */
export function simplify(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.letter === m.letter) {
      const amt = (last.amount + m.amount) % 4;
      out.pop();
      if (amt !== 0) out.push({ letter: m.letter, amount: amt as 1 | 2 | 3 });
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** Quarter-turn-agnostic length (HTM), not counting whole-cube rotations. */
export function htmLength(moves: readonly Move[]): number {
  return moves.filter((m) => !'xyz'.includes(m.letter)).length;
}
