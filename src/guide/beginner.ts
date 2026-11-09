/**
 * Layer-by-layer (beginner method) solver that explains itself, stage by stage.
 * The cube is held with yellow up and green in front (white on the bottom) for the whole solve:
 *   1 white cross        – optimal, from an exact distance table of the 4 bottom edges
 *   2 white corners      – one at a time: bring it above its slot, repeat (R U R' U')
 *   3 middle edges       – right / left insertion algorithms
 *   4 yellow cross       – F R U R' U' F'
 *   5 yellow face        – Sune
 *   6 yellow corners     – A-perm (3-cycle of corners)
 *   7 yellow edges       – U-perms
 * Stages 2-7 search over "macros" (U turns + the stage's algorithm in each slot), so the moves are the
 * ones a beginner is taught, in the fewest repetitions. Slots other than front-right are reached with
 * a y rotation (the cube is turned back at the end of each stage).
 */

import { FaceletState, SOLVED } from '../cube/facelets';
import { applyMoves } from '../cube/moves';
import { CORNER_FACELETS, EDGE_FACELETS } from '../cube/cubie';
import { Move, invertAlg, parseAlg, simplify } from '../cube/notation';

export type StageId = 'cross' | 'corners' | 'middle' | 'yellowCross' | 'yellowFace' | 'yellowCorners' | 'yellowEdges';
export const STAGES: readonly StageId[] = ['cross', 'corners', 'middle', 'yellowCross', 'yellowFace', 'yellowCorners', 'yellowEdges'];

export interface StepSegment {
  start: number;
  end: number;
  /** what this part does: translation key `step.<label>` */
  label: string;
  repeat: number;
}

export interface Stage {
  id: StageId;
  moves: Move[];
  segments: StepSegment[];
}

// ---------------------------------------------------------------------------- permutations
/** perm[j] = i: after the moves, facelet j holds what facelet i held. */
function permOf(moves: readonly Move[]): Uint8Array {
  const probe = Array.from({ length: 54 }, (_, i) => String.fromCharCode(48 + i)).join('');
  const s = applyMoves(probe, moves);
  return Uint8Array.from(s, (c) => c.charCodeAt(0) - 48);
}
const applyPerm = (s: FaceletState, p: Uint8Array) => {
  let out = '';
  for (let j = 0; j < 54; j++) out += s[p[j]];
  return out;
};

// ---------------------------------------------------------------------------- piece predicates
const solvedAt = (s: FaceletState, idx: readonly number[]) => idx.every((i) => s[i] === SOLVED[i]);
const C = CORNER_FACELETS;
const E = EDGE_FACELETS;
// corners: 4 DFR, 5 DLF, 6 DBL, 7 DRB; edges: 4 DR, 5 DF, 6 DL, 7 DB; 8 FR, 9 FL, 10 BL, 11 BR
const CROSS = [4, 5, 6, 7].map((e) => E[e]);
const D_CORNERS = [4, 5, 6, 7];
const MID_EDGES = [8, 9, 10, 11];
const crossDone = (s: FaceletState) => CROSS.every((e) => solvedAt(s, e));
const f2lDone = (s: FaceletState) => {
  for (let i = 9; i < 54; i++) {
    const f = Math.floor(i / 9);
    if (f === 3) { if (s[i] !== 'D') return false; continue; }
    if (i % 9 >= 3 && s[i] !== SOLVED[i]) return false;
  }
  return true;
};

// ---------------------------------------------------------------------------- stage 1: cross (exact table)
const MOVES18 = parseAlg("U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'");
let crossTable: Uint8Array | null = null;
let edgeNext: Int16Array[] | null = null;

/** (edge location, flip) → after each move. Location 0..11, primary sticker index 0/1. */
function buildEdgeNext(): Int16Array[] {
  return MOVES18.map((m) => {
    const p = permOf([m]);
    const where = new Int16Array(54); // where facelet i goes
    for (let j = 0; j < 54; j++) where[p[j]] = j;
    const t = new Int16Array(24);
    E.forEach((loc, l) => {
      for (let f = 0; f < 2; f++) {
        const dest = where[loc[f]]; // primary sticker of a piece at l with flip f is at loc[f]
        const l2 = E.findIndex((x) => x[0] === dest || x[1] === dest);
        t[l * 2 + f] = l2 * 2 + (E[l2][0] === dest ? 0 : 1);
      }
    });
    return t;
  });
}

const encode = (a: number, b: number, c: number, d: number) => ((a * 24 + b) * 24 + c) * 24 + d;

function crossCoord(s: FaceletState): number {
  // positions of the 4 white edges DR, DF, DL, DB (primary sticker = the D one)
  const pos: number[] = [];
  for (const home of [4, 5, 6, 7]) {
    const other = SOLVED[E[home][1]];
    E.forEach((loc, l) => {
      for (let f = 0; f < 2; f++) if (s[loc[f]] === 'D' && s[loc[1 - f]] === other) pos[home - 4] = l * 2 + f;
    });
  }
  return encode(pos[0], pos[1], pos[2], pos[3]);
}

function buildCrossTable() {
  edgeNext = buildEdgeNext();
  const t = new Uint8Array(24 ** 4).fill(255);
  const start = encode(8, 10, 12, 14);
  t[start] = 0;
  let frontier = [start];
  for (let d = 0; frontier.length; d++) {
    const next: number[] = [];
    for (const x of frontier) {
      const a = Math.floor(x / 13824), b = Math.floor(x / 576) % 24, c = Math.floor(x / 24) % 24, e = x % 24;
      for (const tr of edgeNext) {
        const y = encode(tr[a], tr[b], tr[c], tr[e]);
        if (t[y] === 255) {
          t[y] = d + 1;
          next.push(y);
        }
      }
    }
    frontier = next;
  }
  crossTable = t;
}

function solveCross(s: FaceletState): Move[] {
  if (!crossTable) buildCrossTable();
  const out: Move[] = [];
  let cur = s;
  for (let guard = 0; guard < 12 && !crossDone(cur); guard++) {
    const d = crossTable![crossCoord(cur)];
    const m = MOVES18.find((mv) => crossTable![crossCoord(applyMoves(cur, [mv]))] === d - 1)!;
    out.push(m);
    cur = applyMoves(cur, [m]);
  }
  return out;
}

// ---------------------------------------------------------------------------- macro search
interface Macro {
  /** moves in the canonical frame (rotations cancelled), used for the search */
  perm: Uint8Array;
  /** y quarter turns to bring the slot to front-right (0..3), null for U turns */
  rot: number | null;
  /** moves as performed in the rotated frame */
  moves: Move[];
  label: string;
}

const Y = (k: number) => (k ? parseAlg(['', 'y', 'y2', "y'"][k]) : []);
function macro(alg: string, label: string, rot: number | null): Macro {
  const moves = parseAlg(alg);
  const full = rot ? [...Y(rot), ...moves, ...invertAlg(Y(rot))] : moves;
  return { perm: permOf(full), rot, moves, label };
}
const U_TURNS = ['U', 'U2', "U'"].map((a) => macro(a, 'auf', null));

function searchMacros(s: FaceletState, macros: readonly Macro[], goal: (s: FaceletState) => boolean, maxDepth: number): Macro[] | null {
  const path: Macro[] = [];
  const dfs = (cur: FaceletState, depth: number): boolean => {
    if (goal(cur)) return true;
    if (depth === 0) return false;
    const last = path[path.length - 1];
    for (const m of macros) {
      if (last && last.rot === null && m.rot === null) continue; // U U never needed
      path.push(m);
      if (dfs(applyPerm(cur, m.perm), depth - 1)) return true;
      path.pop();
    }
    return false;
  };
  for (let d = 0; d <= maxDepth; d++) if (dfs(s, d)) return path;
  return null;
}

/** Turns macros into performed moves, with y rotations to reach each slot and back. */
function render(macros: readonly Macro[]): { moves: Move[]; segments: StepSegment[] } {
  const moves: Move[] = [];
  const segments: StepSegment[] = [];
  let rot = 0;
  const turnTo = (k: number) => {
    const d = (k - rot + 4) % 4;
    if (d) {
      const start = moves.length;
      moves.push(...Y(d));
      segments.push({ start, end: moves.length, label: 'rotate', repeat: 1 });
    }
    rot = k;
  };
  for (let i = 0; i < macros.length; i++) {
    const m = macros[i];
    if (m.rot !== null) turnTo(m.rot);
    let repeat = 1;
    while (m.rot !== null && macros[i + 1] === m) {
      repeat++;
      i++;
    }
    const start = moves.length;
    for (let k = 0; k < repeat; k++) moves.push(...m.moves);
    segments.push({ start, end: moves.length, label: m.label, repeat });
  }
  turnTo(0);
  return { moves, segments };
}

// slot k (y^k brings it to front-right): 0 FR, 1 BR... computed by testing which slot y^k moves to FR
const SLOT_OF_ROT: number[] = [0, 1, 2, 3].map((k) => {
  // corner that lands in DFR (index 4) after y^k
  const p = permOf(Y(k));
  const dfr = C[4];
  const src = p[dfr[0]];
  return C.findIndex((c) => c.includes(src));
});

const CORNER_INSERT = [0, 1, 2, 3].map((k) => macro("R U R' U'", 'sexy', k));
const EDGE_RIGHT = [0, 1, 2, 3].map((k) => macro("U R U' R' U' F' U F", 'edgeRight', k));
const EDGE_LEFT = [0, 1, 2, 3].map((k) => macro("U' L' U L U F U' F'", 'edgeLeft', k));
const YELLOW_CROSS = macro("F R U R' U' F'", 'yellowCross', 0);
const SUNE = macro("R U R' U R U2 R'", 'sune', 0);
// beginners turn the cube so the solved piece is at the back: every slot via a y rotation
const A_PERM = [0, 1, 2, 3].map((k) => macro("R' F R' B2 R F' R' B2 R2", 'aperm', k));
const U_PERM = [0, 1, 2, 3].flatMap((k) => [macro("R U' R U R U R U' R' U' R2", 'uperm', k), macro("R2 U R U R' U' R' U' R' U R'", 'uperm', k)]);

/** Where a piece with the given colors currently is (corner index). */
function cornerLocation(s: FaceletState, home: number): number {
  const want = C[home].map((i) => SOLVED[i]).sort().join('');
  return C.findIndex((loc) => loc.map((i) => s[i]).sort().join('') === want);
}

function solveCorners(s: FaceletState): Macro[] {
  const done: number[] = D_CORNERS.filter((c) => solvedAt(s, C[c]));
  const out: Macro[] = [];
  let cur = s;
  while (done.length < 4) {
    let best: { c: number; path: Macro[] } | null = null;
    for (const c of D_CORNERS) {
      if (done.includes(c)) continue;
      const target = SLOT_OF_ROT.indexOf(c);
      const loc = cornerLocation(cur, c);
      const extra = D_CORNERS.includes(loc) && loc !== c ? [CORNER_INSERT[SLOT_OF_ROT.indexOf(loc)]] : [];
      const goal = (x: FaceletState) => crossDone(x) && [...done, c].every((k) => solvedAt(x, C[k]));
      const path = searchMacros(cur, [...U_TURNS, CORNER_INSERT[target], ...extra], goal, 8);
      if (path && (!best || path.length < best.path.length)) best = { c, path };
    }
    if (!best) break;
    out.push(...best.path);
    for (const m of best.path) cur = applyPerm(cur, m.perm);
    done.push(best.c);
  }
  return out;
}

function solveMiddle(s: FaceletState): Macro[] {
  const base = (x: FaceletState) => crossDone(x) && D_CORNERS.every((c) => solvedAt(x, C[c]));
  const done = MID_EDGES.filter((e) => solvedAt(s, E[e]));
  const out: Macro[] = [];
  let cur = s;
  while (done.length < 4) {
    let best: { e: number; path: Macro[] } | null = null;
    for (const e of MID_EDGES) {
      if (done.includes(e)) continue;
      const goal = (x: FaceletState) => base(x) && [...done, e].every((k) => solvedAt(x, E[k]));
      const path = searchMacros(cur, [...U_TURNS, ...EDGE_RIGHT, ...EDGE_LEFT], goal, 4);
      if (path && (!best || path.length < best.path.length)) best = { e, path };
    }
    if (!best) break;
    out.push(...best.path);
    for (const m of best.path) cur = applyPerm(cur, m.perm);
    done.push(best.e);
  }
  return out;
}

const yellowCrossDone = (s: FaceletState) => [1, 3, 5, 7].every((i) => s[i] === 'U');
const yellowFaceDone = (s: FaceletState) => [0, 1, 2, 3, 5, 6, 7, 8].every((i) => s[i] === 'U');
const llCornersDone = (s: FaceletState) => [0, 1, 2, 3].every((c) => solvedAt(s, C[c]));

/** Solves from any valid state (yellow up, green front). Stages already done have no moves. */
export function solveBeginner(start: FaceletState): Stage[] {
  const stages: Stage[] = [];
  let cur = start;
  const push = (id: StageId, moves: Move[], segments: StepSegment[]) => {
    stages.push({ id, moves, segments });
    cur = applyMoves(cur, moves);
  };
  const cross = simplify(solveCross(cur));
  push('cross', cross, cross.length ? [{ start: 0, end: cross.length, label: 'cross', repeat: 1 }] : []);
  const stage = (id: StageId, macros: Macro[] | null) => {
    const r = render(macros ?? []);
    push(id, r.moves, r.segments);
  };
  stage('corners', solveCorners(cur));
  stage('middle', solveMiddle(cur));
  stage('yellowCross', searchMacros(cur, [...U_TURNS, YELLOW_CROSS], yellowCrossDone, 6));
  stage('yellowFace', searchMacros(cur, [...U_TURNS, SUNE], yellowFaceDone, 7));
  stage('yellowCorners', searchMacros(cur, [...U_TURNS, ...A_PERM], llCornersDone, 5));
  stage('yellowEdges', searchMacros(cur, [...U_TURNS, ...U_PERM], (x) => x === SOLVED, 5));
  return stages;
}

export { f2lDone, crossDone };
