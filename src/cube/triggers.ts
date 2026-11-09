/**
 * Named triggers: short sequences cubers memorize as one gesture. There is no official standard for
 * their names; these are the ones in common use in the speedcubing community (English names are used
 * worldwide, also by Italian, Spanish, French, German and Chinese cubers).
 */

import { Move, formatAlg, parseAlg } from './notation';

export interface Trigger {
  id: string;
  /** display name */
  name: string;
  alg: string;
  /** extra names accepted when typing */
  aliases: string[];
}

export const TRIGGERS: readonly Trigger[] = [
  { id: 'sune', name: 'Sune', alg: "R U R' U R U2 R'", aliases: [] },
  { id: 'antisune', name: 'Antisune', alg: "R U2 R' U' R U' R'", aliases: ['anti-sune'] },
  { id: 'sexy', name: 'Sexy move', alg: "R U R' U'", aliases: ['sexymove', 'sexy-move'] },
  { id: 'antisexy', name: 'Reverse sexy', alg: "U R U' R'", aliases: ['reverse-sexy', 'reversesexy', 'inversesexy'] },
  { id: 'leftsexy', name: 'Left sexy', alg: "L' U' L U", aliases: ['left-sexy'] },
  { id: 'sledge', name: 'Sledgehammer', alg: "R' F R F'", aliases: ['sledgehammer'] },
  { id: 'hedge', name: 'Hedgeslammer', alg: "F R' F' R", aliases: ['hedgeslammer'] },
  { id: 'leftsledge', name: 'Left sledgehammer', alg: "L F' L' F", aliases: ['left-sledge', 'leftsledgehammer'] },
  { id: 'fatsexy', name: 'Fat sexy', alg: "r U R' U'", aliases: ['fat-sexy', 'widesexy'] },
  { id: 'fatsledge', name: 'Fat sledgehammer', alg: "r' F R F'", aliases: ['fat-sledge'] },
  { id: 'insert', name: 'Pair insert', alg: "R U' R'", aliases: [] },
];

export const TRIGGER_BY_NAME = new Map<string, Trigger>();
for (const t of TRIGGERS) {
  TRIGGER_BY_NAME.set(t.id, t);
  TRIGGER_BY_NAME.set(t.name.toLowerCase().replace(/\s+/g, ''), t);
  for (const a of t.aliases) TRIGGER_BY_NAME.set(a, t);
}

export interface FoundTrigger {
  id: string;
  start: number;
  end: number; // exclusive
}

/** Greedy, longest-first, non-overlapping search of known triggers in a move list (for display). */
export function findTriggers(moves: readonly Move[]): FoundTrigger[] {
  const key = (ms: readonly Move[]) => formatAlg(ms);
  const list = TRIGGERS.filter((t) => t.id !== 'insert').map((t) => ({ id: t.id, moves: parseAlg(t.alg) }));
  list.sort((a, b) => b.moves.length - a.moves.length);
  const out: FoundTrigger[] = [];
  let i = 0;
  while (i < moves.length) {
    const hit = list.find((t) => i + t.moves.length <= moves.length && key(moves.slice(i, i + t.moves.length)) === key(t.moves));
    if (hit) {
      out.push({ id: hit.id, start: i, end: i + hit.moves.length });
      i += hit.moves.length;
    } else i++;
  }
  return out;
}

/**
 * Writes an algorithm with its triggers in parentheses and repeated triggers compacted:
 * "R U R' U' R U R' U'" → "(R U R' U')2".
 */
export function groupedNotation(moves: readonly Move[]): string {
  const found = findTriggers(moves);
  const parts: string[] = [];
  let i = 0;
  for (let k = 0; k < found.length; k++) {
    const f = found[k];
    if (i < f.start) parts.push(formatAlg(moves.slice(i, f.start)));
    let reps = 1;
    while (k + 1 < found.length && found[k + 1].id === f.id && found[k + 1].start === f.start + reps * (f.end - f.start)) {
      reps++;
      k++;
    }
    parts.push(`(${formatAlg(moves.slice(f.start, f.end))})${reps > 1 ? reps : ''}`);
    i = f.start + reps * (f.end - f.start);
  }
  if (i < moves.length) parts.push(formatAlg(moves.slice(i)));
  return parts.join(' ');
}
