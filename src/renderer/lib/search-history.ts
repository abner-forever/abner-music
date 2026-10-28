import { ref } from 'vue';
import { readState } from './storage';

const key = 'abner:search-history';
const limit = 10;

function normalize(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const term = item.trim().slice(0, 120);
    const fingerprint = term.toLocaleLowerCase();
    if (!term || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    terms.push(term);
    if (terms.length >= limit) break;
  }
  return terms;
}

function persist() {
  try {
    localStorage.setItem(key, JSON.stringify(searchHistory.value));
  } catch {}
}

export const searchHistory = ref<string[]>(normalize(readState<unknown>(key, [])));

/** 记录一次搜索，重复关键词提到最前，最多保留 10 条。 */
export function rememberSearch(value: string) {
  const term = value.trim().slice(0, 120);
  if (!term) return;
  const fingerprint = term.toLocaleLowerCase();
  searchHistory.value = [
    term,
    ...searchHistory.value.filter((item) => item.toLocaleLowerCase() !== fingerprint),
  ].slice(0, limit);
  persist();
}

export function forgetSearch(term: string) {
  searchHistory.value = searchHistory.value.filter((item) => item !== term);
  persist();
}

export function clearSearchHistory() {
  searchHistory.value = [];
  persist();
}
