/** Per-user settings in localStorage (always wrapped: storage can be unavailable). */

import type { ColorName } from '../cube/facelets';
import type { Lab } from '../vision/color';
import type { CustomAlg } from '../algs/sets';
import type { Lang } from '../i18n';

export interface CaseStats {
  reps: number;
  /** last execution times in ms (most recent last) */
  times: number[];
}

export interface Settings {
  lang?: Lang;
  /** train algorithms, or the step-by-step beginner solve */
  appMode: 'train' | 'guide';
  /** active algorithm set */
  set: string;
  /** selected case ids per set */
  selectedBy: Record<string, string[]>;
  mode: 'same' | 'random';
  /** the user's algorithm for a case, key `set:case` */
  algsBy: Record<string, string>;
  statsBy: Record<string, CaseStats>;
  custom: CustomAlg[];
  showFingers: boolean;
  speedMs: number;
  deviceId?: string;
  detectMode: 'auto' | 'guide';
  /** guided scan: the app asks for each face in turn */
  guided: boolean;
  /** learned (white-balanced) Lab of each color, refined after every successful scan */
  calibration?: Record<ColorName, Lab>;
}

const KEY = 'cube-trainer:v2';
const OLD_KEY = 'oll-trainer:v1';

export const DEFAULT_SETTINGS: Settings = {
  appMode: 'train',
  set: 'oll',
  selectedBy: { oll: ['45'] },
  mode: 'same',
  algsBy: {},
  statsBy: {},
  custom: [],
  showFingers: false,
  speedMs: 450,
  detectMode: 'auto',
  guided: true,
};

export const caseKey = (set: string, id: string) => `${set}:${id}`;

/** v1 stored only OLL cases, by number. */
function migrate(old: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (Array.isArray(old.selected)) out.selectedBy = { oll: (old.selected as number[]).map(String) };
  if (old.algs && typeof old.algs === 'object')
    out.algsBy = Object.fromEntries(Object.entries(old.algs as Record<string, string>).map(([k, v]) => [caseKey('oll', k), v]));
  if (old.stats && typeof old.stats === 'object')
    out.statsBy = Object.fromEntries(Object.entries(old.stats as Record<string, CaseStats>).map(([k, v]) => [caseKey('oll', k), v]));
  for (const k of ['mode', 'speedMs', 'deviceId', 'detectMode', 'guided', 'calibration'] as const) if (k in old) (out as Record<string, unknown>)[k] = old[k];
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(DEFAULT_SETTINGS), ...JSON.parse(raw) };
    const old = localStorage.getItem(OLD_KEY);
    if (old) return { ...structuredClone(DEFAULT_SETTINGS), ...migrate(JSON.parse(old)) };
  } catch {
    /* fall through */
  }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}
