"use client";

const SEARCH_KEY = "_recent_searches";
const MAX_TERMS = 10;

export function addSearchTerm(term: string) {
  try {
    if (typeof window === "undefined") return;
    const t = term.trim();
    if (!t) return;
    const raw = window.localStorage.getItem(SEARCH_KEY);
    const list: string[] = raw ? (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []) : [];
    const next = [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_TERMS);
    window.localStorage.setItem(SEARCH_KEY, JSON.stringify(next));
  } catch {}
}

export function getRecentSearchTerms(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(SEARCH_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}


