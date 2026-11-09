/**
 * The 57 OLL cases. Only algorithms are stored: patterns and target states are derived
 * by applying the inverse algorithm to a solved cube (see analysis.ts).
 */

export interface OllCase {
  id: number;
  group: string;
  alg: string;
  alts?: string[];
}

export const OLL_GROUPS: Record<string, string> = {
  dot: 'Punto',
  square: 'Quadrato',
  lightning: 'Fulmine',
  fish: 'Pesce',
  knight: 'Cavallo',
  awkward: 'Awkward',
  p: 'Forma P',
  t: 'Forma T',
  c: 'Forma C',
  w: 'Forma W',
  l: 'Forma L',
  line: 'Linea',
  ocll: 'Croce (OCLL)',
  co: 'Angoli orientati',
};

export const OLL_CASES: readonly OllCase[] = [
  { id: 1, group: 'dot', alg: "R U2 R2 F R F' U2 R' F R F'" },
  { id: 2, group: 'dot', alg: "r U r' U2 r U2 R' U2 R U' r'", alts: ["F R U R' U' F' f R U R' U' f'"] },
  { id: 3, group: 'dot', alg: "r' R2 U R' U r U2 r' U M'", alts: ["f R U R' U' f' U' F R U R' U' F'"] },
  { id: 4, group: 'dot', alg: "M U' r U2 r' U' R U' R' M'", alts: ["f R U R' U' f' U F R U R' U' F'"] },
  { id: 5, group: 'square', alg: "l' U2 L U L' U l" },
  { id: 6, group: 'square', alg: "r U2 R' U' R U' r'" },
  { id: 7, group: 'lightning', alg: "r U R' U R U2 r'" },
  { id: 8, group: 'lightning', alg: "l' U' L U' L' U2 l" },
  { id: 9, group: 'fish', alg: "R U R' U' R' F R2 U R' U' F'" },
  { id: 10, group: 'fish', alg: "R U R' U R' F R F' R U2 R'" },
  { id: 11, group: 'lightning', alg: "r U R' U R' F R F' R U2 r'" },
  { id: 12, group: 'lightning', alg: "M' R' U' R U' R' U2 R U' R r'" },
  { id: 13, group: 'knight', alg: "F U R U' R2 F' R U R U' R'" },
  { id: 14, group: 'knight', alg: "R' F R U R' F' R F U' F'" },
  { id: 15, group: 'knight', alg: "l' U' l L' U' L U l' U l" },
  { id: 16, group: 'knight', alg: "r U r' R U R' U' r U' r'" },
  { id: 17, group: 'dot', alg: "F R' F' R2 r' U R U' R' U' M'" },
  { id: 18, group: 'dot', alg: "r U R' U R U2 r2 U' R U' R' U2 r" },
  { id: 19, group: 'dot', alg: "r' R U R U R' U' M' R' F R F'" },
  { id: 20, group: 'dot', alg: "r U R' U' M2 U R U' R' U' M'" },
  { id: 21, group: 'ocll', alg: "R U2 R' U' R U R' U' R U' R'" },
  { id: 22, group: 'ocll', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { id: 23, group: 'ocll', alg: "R2 D' R U2 R' D R U2 R" },
  { id: 24, group: 'ocll', alg: "r U R' U' r' F R F'" },
  { id: 25, group: 'ocll', alg: "F' r U R' U' r' F R" },
  { id: 26, group: 'ocll', alg: "R U2 R' U' R U' R'" },
  { id: 27, group: 'ocll', alg: "R U R' U R U2 R'" },
  { id: 28, group: 'co', alg: "r U R' U' r' R U R U' R'" },
  { id: 29, group: 'awkward', alg: "R U R' U' R U' R' F' U' F R U R'" },
  { id: 30, group: 'awkward', alg: "F R' F R2 U' R' U' R U R' F2" },
  { id: 31, group: 'p', alg: "R' U' F U R U' R' F' R" },
  { id: 32, group: 'p', alg: "L U F' U' L' U L F L'" },
  { id: 33, group: 't', alg: "R U R' U' R' F R F'" },
  { id: 34, group: 'c', alg: "R U R2 U' R' F R U R U' F'" },
  { id: 35, group: 'fish', alg: "R U2 R2 F R F' R U2 R'" },
  { id: 36, group: 'w', alg: "L' U' L U' L' U L U L F' L' F" },
  { id: 37, group: 'fish', alg: "F R' F' R U R U' R'" },
  { id: 38, group: 'w', alg: "R U R' U R U' R' U' R' F R F'" },
  { id: 39, group: 'lightning', alg: "L F' L' U' L U F U' L'" },
  { id: 40, group: 'lightning', alg: "R' F R U R' U' F' U R" },
  { id: 41, group: 'awkward', alg: "R U R' U R U2 R' F R U R' U' F'" },
  { id: 42, group: 'awkward', alg: "R' U' R U' R' U2 R F R U R' U' F'" },
  { id: 43, group: 'p', alg: "F' U' L' U L F" },
  { id: 44, group: 'p', alg: "F U R U' R' F'" },
  { id: 45, group: 't', alg: "F R U R' U' F'" },
  { id: 46, group: 'c', alg: "R' U' R' F R F' U R" },
  { id: 47, group: 'l', alg: "R' U' R' F R F' R' F R F' U R" },
  { id: 48, group: 'l', alg: "F R U R' U' R U R' U' F'" },
  { id: 49, group: 'l', alg: "r U' r2 U r2 U r2 U' r" },
  { id: 50, group: 'l', alg: "r' U r2 U' r2 U' r2 U r'" },
  { id: 51, group: 'line', alg: "F U R U' R' U R U' R' F'" },
  { id: 52, group: 'line', alg: "R U R' U R U' B U' B' R'" },
  { id: 53, group: 'l', alg: "l' U2 L U L' U' L U L' U l" },
  { id: 54, group: 'l', alg: "r U2 R' U' R U R' U' R U' r'" },
  { id: 55, group: 'line', alg: "R' F R U R U' R2 F' R2 U' R' U R U R'" },
  { id: 56, group: 'line', alg: "r' U' r U' R' U R U' R' U R r' U r" },
  { id: 57, group: 'co', alg: "R U R' U' M' U R U' r'" },
];

export function caseById(id: number): OllCase {
  const c = OLL_CASES.find((c) => c.id === id);
  if (!c) throw new Error(`OLL ${id} inesistente`);
  return c;
}
