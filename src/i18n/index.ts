/** Minimal i18n: t(key, params), the language from settings or the browser, DOM attributes. */

import { LANGS, Lang, STRINGS } from './strings';

export { LANGS, LANG_NAMES } from './strings';
export type { Lang } from './strings';

let lang: Lang = 'it';

export function detectLang(): Lang {
  const prefs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const p of prefs) {
    const code = p.slice(0, 2).toLowerCase() as Lang;
    if (LANGS.includes(code)) return code;
  }
  return 'en';
}

export function setLang(l: Lang) {
  lang = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }
}

export const getLang = () => lang;

/** Translation with {placeholders}. Unknown keys are returned as they are. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const row = STRINGS[key];
  let s = row ? row[LANGS.indexOf(lang)] || row[1] : key;
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Fills elements marked with data-i18n (text), data-i18n-title, data-i18n-placeholder. */
export function applyDom(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle!)));
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder!)));
}
