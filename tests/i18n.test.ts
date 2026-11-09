import { describe, expect, it } from 'vitest';
import { LANGS, STRINGS } from '../src/i18n/strings';
import { STAGES } from '../src/guide/beginner';
import { BUILTIN_SETS } from '../src/algs/sets';
import { fingerFor } from '../src/cube/fingertricks';
import { parseAlg } from '../src/cube/notation';

const SOURCES = import.meta.glob(['../src/**/*.ts', '../index.html'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('translations', () => {
  it('every key has all 7 languages', () => {
    for (const [k, row] of Object.entries(STRINGS)) {
      expect(row.length, k).toBe(LANGS.length);
      row.forEach((s, i) => expect(s.trim().length, `${k} [${LANGS[i]}]`).toBeGreaterThan(0));
      // same placeholders in every language
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      row.forEach((s, i) => expect(ph(s), `${k} [${LANGS[i]}] placeholders`).toBe(ph(row[1])));
    }
  });
  it('every literal key used in the code exists', () => {
    const src = Object.values(SOURCES).join(String.fromCharCode(10));
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    const used = new Set<string>();
    for (const m of src.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-i18n(?:-title|-placeholder)?="([\w.]+)"/g)) used.add(m[1]);
    for (const k of [...used].filter((k) => !k.endsWith('.'))) expect(STRINGS[k], k).toBeDefined();
  });
  it('dynamic keys exist (stages, groups, sets, fingertricks, colors)', () => {
    for (const s of STAGES) expect(STRINGS['stage.' + s] && STRINGS['info.' + s], s).toBeDefined();
    for (const set of BUILTIN_SETS) {
      expect(STRINGS['set.' + set.id], set.id).toBeDefined();
      for (const g of set.groups) expect(STRINGS['group.' + g], g).toBeDefined();
    }
    const moves = parseAlg("R U R' U' R' F R F' L' U' L U2 D D' B B' M' x y z F2 U2 l r E S");
    moves.forEach((_, i) => expect(STRINGS['ft.' + fingerFor(moves, i)], String(i)).toBeDefined());
    for (const c of ['white', 'yellow', 'green', 'blue', 'red', 'orange']) expect(STRINGS['color.' + c]).toBeDefined();
  });
});
