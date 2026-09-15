'use client';

import { THEME_STORAGE_KEY } from '@/lib/config/constants';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type ThemeState = { preference: ThemePreference; resolved: ResolvedTheme };

const SERVER_STATE: ThemeState = { preference: 'system', resolved: 'light' };

const listeners = new Set<() => void>();

/**
 * Cached snapshot. useSyncExternalStore compares by identity, so a new object
 * per call would re-render forever.
 */
let snapshot: ThemeState | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function systemPrefersDark(): boolean {
  return isBrowser() && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readPreference(): ThemePreference {
  if (!isBrowser()) return 'system';
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // Private browsing can throw on storage access.
  }
  return 'system';
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
}

function apply(resolved: ResolvedTheme): void {
  if (!isBrowser()) return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

function emit(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}

/**
 * Client snapshot. Reading storage here rather than in an effect is what lets
 * React reconcile the real preference during hydration instead of triggering a
 * second render pass.
 */
export function getThemeSnapshot(): ThemeState {
  if (snapshot === null) {
    const preference = readPreference();
    snapshot = { preference, resolved: resolve(preference) };
  }
  return snapshot;
}

/** Server snapshot: no storage, no media query — the inline script handles paint. */
export function getServerThemeSnapshot(): ThemeState {
  return SERVER_STATE;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);

  const media = isBrowser() ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const onMediaChange = () => emit();
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) emit();
  };

  media?.addEventListener('change', onMediaChange);
  if (isBrowser()) window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', onMediaChange);
    if (isBrowser()) window.removeEventListener('storage', onStorage);
  };
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
  apply(resolve(preference));
  emit();
}

/** Keep the DOM in step with a snapshot React has already reconciled. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  apply(resolved);
}

export function nextPreference(current: ThemePreference): ThemePreference {
  return current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
}

/**
 * Runs before first paint to avoid a light-mode flash. Inlined in <head>, so it
 * is covered by the `'unsafe-inline'` script-src allowance documented in
 * lib/security/headers.ts. It contains no user data.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var v=localStorage.getItem(k);var d=v==='dark'||((!v||v==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
