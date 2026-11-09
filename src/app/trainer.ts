/** Training logic, independent from the DOM. */

import { FaceletState, SOLVED } from '../cube/facelets';
import { applyMoves } from '../cube/moves';
import { Move, NotationError, htmLength, parseAlg } from '../cube/notation';
import { normalizeOrientation } from '../cube/orient';
import { AlgCase, AlgSet, BUILTIN_SETS, caseKind, customSet } from '../algs/sets';
import { pattern } from '../algs/pattern';
import { SetupResult, caseState, caseVariants, quickSetupFor } from '../algs/setup';
import { isF2LSolved } from '../oll/analysis';
import { SolverClient } from '../solver/solverClient';
import { t } from '../i18n';
import { Settings, caseKey } from './storage';

export function getSet(settings: Settings, id: string = settings.set): AlgSet {
  if (id === 'custom') return customSet(settings.custom);
  return BUILTIN_SETS.find((s) => s.id === id) ?? BUILTIN_SETS[0];
}

export function caseOf(set: AlgSet, id: string): AlgCase | undefined {
  return set.cases.find((c) => c.id === id);
}

export function caseName(set: AlgSet, c: AlgCase): string {
  if (set.custom) return c.id;
  return `${set.id === 'oll2' || set.id === 'pll2' ? '' : set.id.toUpperCase() + ' '}${c.id}`.trim();
}

export function algFor(settings: Settings, set: AlgSet, c: AlgCase): string {
  return settings.algsBy[caseKey(set.id, c.id)] ?? c.alg;
}

/** Translated message for a notation error (or any error). */
export function errorText(e: unknown): string {
  if (e instanceof NotationError) return t(`notation.${e.code}`, { token: e.token });
  return (e as Error).message ?? String(e);
}

/** Validates a user algorithm for a case; returns an error message or null. */
export function validateUserAlg(set: AlgSet, c: AlgCase, alg: string): string | null {
  try {
    if (!parseAlg(alg).length) return t('validate.empty');
  } catch (e) {
    return errorText(e);
  }
  const kind = caseKind(set, c);
  const s = caseState(alg);
  if (kind !== 'f2l' && !isF2LSolved(s)) return t('validate.f2l');
  if (!caseVariants(kind, c.alg).has(pattern(s, kind))) return t('validate.wrong', { name: caseName(set, c) });
  return null;
}

/** For a custom algorithm: it must change something that matters for its kind. */
export function validateCustomAlg(alg: string, kind: Parameters<typeof pattern>[1]): string | null {
  try {
    if (!parseAlg(alg).length) return t('validate.empty');
  } catch (e) {
    return errorText(e);
  }
  if (pattern(caseState(alg), kind) === pattern(SOLVED, kind)) return t('validate.trivial');
  if (kind !== 'f2l' && !isF2LSolved(caseState(alg))) return t('validate.f2l');
  return null;
}

export function selectedIds(settings: Settings, set: AlgSet): string[] {
  const ids = new Set(set.cases.map((c) => c.id));
  return (settings.selectedBy[set.id] ?? []).filter((id) => ids.has(id));
}

export function pickNextCase(settings: Settings, set: AlgSet, previous: string | null): string | null {
  const sel = selectedIds(settings, set);
  const pool = sel.length ? sel : set.cases.map((c) => c.id);
  if (!pool.length) return null;
  if (settings.mode === 'same') return previous !== null && pool.includes(previous) ? previous : pool[0];
  const others = pool.filter((id) => id !== previous);
  const from = others.length ? others : pool;
  return from[Math.floor(Math.random() * from.length)];
}

/** Shortest setup: instant strategies first, Kociemba (in the worker) when they don't apply or are longer. */
export async function computeSetup(state: FaceletState, set: AlgSet, c: AlgCase, settings: Settings, solver: SolverClient): Promise<SetupResult> {
  const alg = algFor(settings, set, c);
  const kind = caseKind(set, c);
  const others = set.cases.filter((o) => o.id !== c.id && caseKind(set, o) === kind).map((o) => ({ alg: algFor(settings, set, o), kind }));
  const quick = quickSetupFor(state, kind, alg, others);
  if (quick && (quick.method === 'already' || quick.method === 'inverse')) return quick;
  // A Kociemba solution is ~20 moves: only worth asking when the quick one is longer.
  if (quick && htmLength(quick.moves) <= 18) return quick;
  const moves = await solver.setup(state, alg, kind, 1500);
  const k = moves ? { moves, method: 'kociemba' as const } : null;
  const best = !quick ? k : !k ? quick : htmLength(k.moves) < htmLength(quick.moves) ? k : quick;
  if (!best) throw new Error(t('noSetup'));
  return best;
}

/** Applies moves to the tracked state; returns the re-grip rotation if centers moved (wide moves). */
export function advanceState(state: FaceletState, moves: readonly Move[]): { state: FaceletState; regrip: Move[] } {
  const n = normalizeOrientation(applyMoves(state, moves));
  return { state: n.state, regrip: n.rotation };
}
