/**
 * Algorithm sets. Like the OLL database, only algorithms are stored: every case pattern is derived by
 * applying the inverse algorithm to a solved cube, and the tests check every algorithm.
 */

import { OLL_CASES } from '../oll/cases';
import { PatternKind } from './pattern';

export interface AlgCase {
  /** unique within the set */
  id: string;
  /** group key, translated as `group.<group>` */
  group: string;
  alg: string;
  alts?: string[];
  /** overrides the set's pattern (2-look sets mix two kinds) */
  kind?: PatternKind;
}

export interface AlgSet {
  id: string;
  kind: PatternKind;
  /** how cases are drawn: top view of the last layer, or 3D view of the front-right corner */
  diagram: 'top' | 'iso';
  groups: string[];
  cases: AlgCase[];
  /** user-defined set */
  custom?: boolean;
}

export const OLL_SET: AlgSet = {
  id: 'oll',
  kind: 'oll',
  diagram: 'top',
  groups: ['dot', 'square', 'lightning', 'fish', 'knight', 'awkward', 'p', 't', 'c', 'w', 'l', 'line', 'ocll', 'co'],
  cases: OLL_CASES.map((c) => ({ id: String(c.id), group: c.group, alg: c.alg, alts: c.alts })),
};

export const PLL_SET: AlgSet = {
  id: 'pll',
  kind: 'pll',
  diagram: 'top',
  groups: ['edgesOnly', 'adjacent', 'diagonal'],
  cases: [
    { id: 'Ua', group: 'edgesOnly', alg: "M2 U M U2 M' U M2", alts: ["R U' R U R U R U' R' U' R2"] },
    { id: 'Ub', group: 'edgesOnly', alg: "M2 U' M U2 M' U' M2", alts: ["R2 U R U R' U' R' U' R' U R'"] },
    { id: 'H', group: 'edgesOnly', alg: "M2 U M2 U2 M2 U M2" },
    { id: 'Z', group: 'edgesOnly', alg: "M' U M2 U M2 U M' U2 M2" },
    { id: 'Aa', group: 'adjacent', alg: "x R' U R' D2 R U' R' D2 R2 x'" },
    { id: 'Ab', group: 'adjacent', alg: "x R2 D2 R U R' D2 R U' R x'" },
    { id: 'T', group: 'adjacent', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
    { id: 'F', group: 'adjacent', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
    { id: 'Ja', group: 'adjacent', alg: "R' U L' U2 R U' R' U2 R L" },
    { id: 'Jb', group: 'adjacent', alg: "R U R' F' R U R' U' R' F R2 U' R'" },
    { id: 'Ra', group: 'adjacent', alg: "R U' R' U' R U R D R' U' R D' R' U2 R'" },
    { id: 'Rb', group: 'adjacent', alg: "R2 F R U R U' R' F' R U2 R' U2 R" },
    { id: 'Ga', group: 'adjacent', alg: "R2 U R' U R' U' R U' R2 U' D R' U R D'" },
    { id: 'Gb', group: 'adjacent', alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
    { id: 'Gc', group: 'adjacent', alg: "R2 U' R U' R U R' U R2 U D' R U' R' D" },
    { id: 'Gd', group: 'adjacent', alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
    { id: 'E', group: 'diagonal', alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
    { id: 'Na', group: 'diagonal', alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
    { id: 'Nb', group: 'diagonal', alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
    { id: 'V', group: 'diagonal', alg: "R' U R' U' y R' F' R2 U' R' U R' F R F" },
    { id: 'Y', group: 'diagonal', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  ],
};

export const OLL2_SET: AlgSet = {
  id: 'oll2',
  kind: 'oll',
  diagram: 'top',
  groups: ['eo', 'ocll'],
  cases: ([
    { id: 'I', group: 'eo', kind: 'eo', alg: "F R U R' U' F'" },
    { id: 'L', group: 'eo', kind: 'eo', alg: "f R U R' U' f'" },
    { id: '•', group: 'eo', kind: 'eo', alg: "F R U R' U' F' f R U R' U' f'" },
    { id: 'Sune', group: 'ocll', alg: "R U R' U R U2 R'" },
    { id: 'Antisune', group: 'ocll', alg: "R U2 R' U' R U' R'" },
    { id: 'H', group: 'ocll', alg: "R U R' U R U' R' U R U2 R'" },
    { id: 'Pi', group: 'ocll', alg: "R U2 R2 U' R2 U' R2 U2 R" },
    { id: 'U', group: 'ocll', alg: "R2 D R' U2 R D' R' U2 R'" },
    { id: 'T', group: 'ocll', alg: "r U R' U' r' F R F'" },
    { id: 'L', group: 'ocll', alg: "F R' F' r U R U' r'" },
  ] as AlgCase[]).map((c, i) => ({ ...c, id: i < 3 ? `E-${c.id}` : c.id })),
};

export const PLL2_SET: AlgSet = {
  id: 'pll2',
  kind: 'pll',
  diagram: 'top',
  groups: ['corners', 'edgesOnly'],
  cases: [
    { id: 'Adj', group: 'corners', kind: 'cp', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
    { id: 'Diag', group: 'corners', kind: 'cp', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
    { id: 'Ua', group: 'edgesOnly', alg: "R U' R U R U R U' R' U' R2" },
    { id: 'Ub', group: 'edgesOnly', alg: "R2 U R U R' U' R' U' R' U R'" },
    { id: 'H', group: 'edgesOnly', alg: "M2 U M2 U2 M2 U M2" },
    { id: 'Z', group: 'edgesOnly', alg: "M' U M2 U M2 U M' U2 M2" },
  ],
};

/** Front-right slot, generated with an optimal <R,U,F> search (see tests: every case is checked). */
export const F2L_SET: AlgSet = {
  id: 'f2l',
  kind: 'f2l',
  diagram: 'iso',
  groups: ['bothTop', 'cornerTop', 'edgeTop', 'bothSlot'],
  cases: [
    { id: '1', group: 'bothTop', alg: "F' U2 F" },
    { id: '2', group: 'bothTop', alg: "R U R'" },
    { id: '3', group: 'bothTop', alg: "R U' R'" },
    { id: '4', group: 'bothTop', alg: "F' U' F" },
    { id: '5', group: 'bothTop', alg: "R U R2 F R F'" },
    { id: '6', group: 'bothTop', alg: "F' U2 F2 R' F' R" },
    { id: '7', group: 'bothTop', alg: "R U2 R2 F R F'" },
    { id: '8', group: 'bothTop', alg: "R U R' F' U' F" },
    { id: '9', group: 'bothTop', alg: "R U2 R' U' R U R'" },
    { id: '10', group: 'bothTop', alg: "F2 U2 F U F' U F2" },
    { id: '11', group: 'bothTop', alg: "R2 U2 R' U' R U' R2" },
    { id: '12', group: 'bothTop', alg: "F2 U2 R' F' R U2 F2" },
    { id: '13', group: 'bothTop', alg: "R2 U R' U R U2 R2" },
    { id: '14', group: 'bothTop', alg: "R U' R' U2 F' U' F" },
    { id: '15', group: 'bothTop', alg: "R' U2 R2 U R2 U R" },
    { id: '16', group: 'bothTop', alg: "R U' R' U' R U R'" },
    { id: '17', group: 'bothTop', alg: "F2 U2 R' F R U2 F2" },
    { id: '18', group: 'bothTop', alg: "R2 U2 F R2 F' U2 R2" },
    { id: '19', group: 'bothTop', alg: "R U2 R' U F' U' F" },
    { id: '20', group: 'bothTop', alg: "F' U F U2 R U R'" },
    { id: '21', group: 'bothTop', alg: "F' U F U' F' U' F" },
    { id: '22', group: 'bothTop', alg: "R U2 R' U' R U2 R'" },
    { id: '23', group: 'bothTop', alg: "R U R' U' R U2 R'" },
    { id: '24', group: 'bothTop', alg: "R U R' U2 F' U' F" },
    { id: '25', group: 'cornerTop', alg: "R U' R' F' U2 F" },
    { id: '26', group: 'cornerTop', alg: "R2 U R2 U R2 U2 R2" },
    { id: '27', group: 'cornerTop', alg: "R U R' U2 R U R'" },
    { id: '28', group: 'cornerTop', alg: "F' U' F U' R U R'" },
    { id: '29', group: 'cornerTop', alg: "R U' R' U' R U2 R'" },
    { id: '30', group: 'cornerTop', alg: "R U R' U' F' U F" },
    { id: '31', group: 'edgeTop', alg: "R U' R2 F R F'" },
    { id: '32', group: 'edgeTop', alg: "R U' R' F' U' F" },
    { id: '33', group: 'edgeTop', alg: "F' U F R U R'" },
    { id: '34', group: 'edgeTop', alg: "R U2 R' F' U2 F" },
    { id: '35', group: 'edgeTop', alg: "F' U2 F U2 R U R'" },
    { id: '36', group: 'edgeTop', alg: "R U2 R' U2 F' U' F" },
    { id: '37', group: 'bothSlot', alg: "R U' R U2 F R2 F' U2 R2" },
    { id: '38', group: 'bothSlot', alg: "R2 U2 R' U' R U' R' U2 R'" },
    { id: '39', group: 'bothSlot', alg: "R F U R U' R' F' U' R'" },
    { id: '40', group: 'bothSlot', alg: "R U2 R U R' U R U2 R2" },
    { id: '41', group: 'bothSlot', alg: "R U F R U R' U' F' R'" },
  ],
};

export const BUILTIN_SETS: readonly AlgSet[] = [OLL_SET, PLL_SET, F2L_SET, OLL2_SET, PLL2_SET];

export interface CustomAlg {
  id: string;
  name: string;
  alg: string;
  kind: PatternKind;
}

/** The user's own algorithms, as a set. */
export function customSet(algs: readonly CustomAlg[]): AlgSet {
  return {
    id: 'custom',
    kind: 'pll',
    diagram: 'top',
    groups: ['custom'],
    custom: true,
    cases: algs.map((a) => ({ id: a.id, group: 'custom', alg: a.alg, kind: a.kind })),
  };
}

export function caseKind(set: AlgSet, c: AlgCase): PatternKind {
  return c.kind ?? set.kind;
}
